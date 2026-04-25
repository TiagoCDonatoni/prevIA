from __future__ import annotations

from datetime import datetime, timezone, timedelta
import math
import re
import time
import unicodedata
from typing import Any, Dict, List, Optional, Tuple

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel

from src.core.settings import load_settings
from src.db.pg import pg_conn
from src.integrations.theodds.client import TheOddsClient, TheOddsApiError
from src.internal_access.guards import require_admin_access
from src.models.one_x_two_logreg_v1 import predict_1x2_from_artifact
from src.odds.jobs.odds_refresh_resolve_job import run_odds_refresh_and_resolve
from src.core.season_policy import choose_current_operational_season, resolve_candidate_seasons
from src.odds.matchup_resolver import (
    _norm_name,
    _upsert_team_alias_auto,
    resolve_odds_event,
    resolve_odds_event_team_ids,
)
from src.ops.job_runs import (
    CALC_VERSION_SNAPSHOT_V1,
    JOB_PRODUCT_SNAPSHOT_REBUILD_V1,
    finish_job_run,
    get_last_success_finished_at,
    start_job_run,
)
from src.product.matchup_snapshot_builder_v1 import rebuild_matchup_snapshots_v1
from src.product.model_registry import get_active_model_version, get_calc_version

router = APIRouter(
    prefix="/admin/odds",
    tags=["admin-odds"],
    dependencies=[Depends(require_admin_access)],
)

class AdminLeagueCountryUpdateBody(BaseModel):
    official_country_name: str | None = None

# MVP: default artifact (ajuste se você quiser centralizar isso em settings)
DEFAULT_EPL_ARTIFACT = "epl_1x2_logreg_v1_C_2021_2023_C0.3.json"

def _empty_runtime_counts() -> Dict[str, int]:
    return {
        "ok_exact": 0,
        "ok_fallback": 0,
        "missing_same_league": 0,
        "missing_exact": 0,
        "other_model_error": 0,
    }


def _read_match_stats_mode_from_pred(pred: Dict[str, Any]) -> str:
    runtime = (pred or {}).get("runtime") or {}
    stats_runtime = runtime.get("stats_runtime") or {}
    return str(stats_runtime.get("match_stats_mode") or "unknown")

def _coverage_pct(part: int, total: int) -> float:
    if total <= 0:
        return 0.0
    return float(part) / float(total)

def _classify_model_runtime_error(msg: Optional[str]) -> str:
    txt = (msg or "").lower()

    if "same league" in txt and "requested/fallback" in txt:
        return "MISSING_TEAM_STATS_SAME_LEAGUE"

    if "team_season_stats not found for given inputs" in txt:
        return "MISSING_TEAM_STATS_EXACT"

    return "MODEL_ERROR"

_STOPWORDS = {"fc", "cf", "sc", "ac", "afc", "cfc", "the", "club", "de", "da", "do", "and", "&"}

def _load_approved_league_map(conn, *, sport_key: str) -> Optional[Dict[str, Any]]:
    sql = """
      SELECT sport_key, league_id, season_policy, fixed_season, regions, hours_ahead, tol_hours
      FROM odds.odds_league_map
      WHERE sport_key = %(sport_key)s
        AND enabled = true
        AND mapping_status = 'approved'
      LIMIT 1
    """
    with conn.cursor() as cur:
        cur.execute(sql, {"sport_key": sport_key})
        row = cur.fetchone()

    if not row:
        return None

    (sport_key_db, league_id, season_policy, fixed_season, regions, hours_ahead, tol_hours) = row
    return {
        "sport_key": sport_key_db,
        "league_id": int(league_id),
        "season_policy": str(season_policy),
        "fixed_season": int(fixed_season) if fixed_season is not None else None,
        "regions": str(regions) if regions is not None else None,
        "hours_ahead": int(hours_ahead) if hours_ahead is not None else None,
        "tol_hours": int(tol_hours) if tol_hours is not None else None,
    }


def _list_available_core_seasons(conn, *, league_id: int) -> List[int]:
    sql = """
      SELECT DISTINCT season
      FROM core.fixtures
      WHERE league_id = %(league_id)s
        AND season IS NOT NULL
      ORDER BY season DESC
    """
    with conn.cursor() as cur:
        cur.execute(sql, {"league_id": int(league_id)})
        rows = cur.fetchall() or []

    return [int(r[0]) for r in rows if r and r[0] is not None]


def _effective_league_season_tol(
    conn,
    *,
    sport_key: str,
    assume_league_id: Optional[int],
    assume_season: Optional[int],
    tol_hours: Optional[int],
) -> Tuple[int, int, int, Dict[str, Any]]:
    lm = _load_approved_league_map(conn, sport_key=sport_key)

    # fallback total: exige assume_*
    if not lm:
        if assume_league_id is None or assume_season is None or tol_hours is None:
            raise ValueError(
                "Missing league/season/tol_hours and no approved odds_league_map for sport_key."
            )
        return int(assume_league_id), int(assume_season), int(tol_hours), {"league_map": None}

    eff_league_id = int(assume_league_id) if assume_league_id is not None else int(lm["league_id"])

    # precedência real:
    # assume > fixed > current_window(core) > current_window(default)
    season_meta: Dict[str, Any] = {}

    if assume_season is not None:
        eff_season = int(assume_season)
        season_meta = {
            "season_source": "assume",
            "available_core_seasons": None,
        }
    elif lm["fixed_season"] is not None:
        eff_season = int(lm["fixed_season"])
        season_meta = {
            "season_source": "fixed",
            "available_core_seasons": None,
        }
    else:
        available_core_seasons = _list_available_core_seasons(conn, league_id=eff_league_id)
        picked = choose_current_operational_season(available_core_seasons)

        if picked is not None:
            eff_season = int(picked)
            season_meta = {
                "season_source": "current_window_core",
                "available_core_seasons": available_core_seasons,
            }
        else:
            candidates = resolve_candidate_seasons(
                season_policy=str(lm["season_policy"] or "current"),
                fixed_season=None,
            )
            eff_season = int(candidates[0])
            season_meta = {
                "season_source": "current_window_default",
                "available_core_seasons": available_core_seasons,
                "candidate_seasons": candidates,
            }

    eff_tol = int(tol_hours) if tol_hours is not None else int(lm["tol_hours"] or 6)

    return eff_league_id, eff_season, eff_tol, {
        "league_map": lm,
        "season_resolution": season_meta,
    }

def _client() -> TheOddsClient:
    s = load_settings()
    return TheOddsClient(
        base_url=s.the_odds_api_base_url or "",
        api_key=s.the_odds_api_key or "",
        timeout_sec=20,
    )


def _norm_name(s: str) -> str:
    s = (s or "").strip().lower()
    s = unicodedata.normalize("NFKD", s)
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    s = re.sub(r"[^a-z0-9\\s]", " ", s)
    parts = [p for p in s.split() if p and p not in _STOPWORDS]
    return " ".join(parts).strip()


def _find_team_id(conn, raw_name: str, limit_suggestions: int = 5) -> Tuple[Optional[int], str, List[Dict[str, Any]]]:
    name_norm = _norm_name(raw_name)
    if not name_norm:
        return None, "NONE", []

    # EXACT
    sql_exact = """
      SELECT team_id, name, country_name
      FROM core.teams
      WHERE lower(name) = %(n)s
      LIMIT 1
    """
    with conn.cursor() as cur:
        cur.execute(sql_exact, {"n": raw_name.strip().lower()})
        row = cur.fetchone()
        if row:
            return int(row[0]), "EXACT", []

    # Token ILIKE fallback
    tokens = [t for t in name_norm.split() if t]
    if not tokens:
        return None, "NONE", []

    where = " AND ".join([f"lower(name) ILIKE %(t{i})s" for i in range(len(tokens))])
    params = {f"t{i}": f"%{tok}%" for i, tok in enumerate(tokens)}

    sql_like = f"""
      SELECT team_id, name, country_name
      FROM core.teams
      WHERE {where}
      ORDER BY name ASC
      LIMIT {limit_suggestions}
    """
    with conn.cursor() as cur:
        cur.execute(sql_like, params)
        rows = cur.fetchall()

    if not rows:
        return None, "NONE", []

    best_id = int(rows[0][0])
    sugg = [{"team_id": int(r[0]), "name": str(r[1]), "country": (str(r[2]) if r[2] else None)} for r in rows]
    return best_id, "ILIKE", sugg


def _try_find_fixture(conn, kickoff_utc_iso: str, home_team_id: int, away_team_id: int, tol_hours: int = 36):
    s = kickoff_utc_iso.replace("Z", "+00:00")
    k = datetime.fromisoformat(s).astimezone(timezone.utc)
    start = k - timedelta(hours=tol_hours)
    end = k + timedelta(hours=tol_hours)

    sql = """
      SELECT fixture_id, league_id, season, kickoff_utc
      FROM core.fixtures
      WHERE kickoff_utc >= %(start)s
        AND kickoff_utc <= %(end)s
        AND home_team_id = %(home)s
        AND away_team_id = %(away)s
      ORDER BY ABS(EXTRACT(EPOCH FROM (kickoff_utc - %(k)s))) ASC
      LIMIT 1
    """
    with conn.cursor() as cur:
        cur.execute(sql, {"start": start, "end": end, "home": home_team_id, "away": away_team_id, "k": k})
        row = cur.fetchone()
        if not row:
            return None

        fixture_id, league_id, season, kickoff_db = row
        return {
            "fixture_id": int(fixture_id),
            "league_id": int(league_id) if league_id is not None else None,
            "season": int(season) if season is not None else None,
            "kickoff_utc": kickoff_db.isoformat().replace("+00:00", "Z") if kickoff_db else None,
        }


def _market_probs_from_odds(odds_h: float | None, odds_d: float | None, odds_a: float | None):
    vals = []
    for o in (odds_h, odds_d, odds_a):
        vals.append((1.0 / o) if (o and o > 0) else None)

    if all(v is None for v in vals):
        return {"raw": None, "novig": None, "overround": None}

    raw = {"H": vals[0], "D": vals[1], "A": vals[2]}
    s = sum(v for v in vals if v is not None)
    if s <= 0:
        return {"raw": raw, "novig": None, "overround": None}

    novig = {k: (v / s if v is not None else None) for k, v in raw.items()}
    return {"raw": raw, "novig": novig, "overround": s}


def _audit_insert_prediction(
    conn,
    *,
    event_id: str,
    sport_key: str,
    kickoff_utc: Optional[str],
    captured_at_utc: Optional[str],
    bookmaker: Optional[str],
    market: Optional[str],
    league_id: Optional[int],
    season: Optional[int],
    fixture_id: Optional[int],
    home_team_id: Optional[int],
    away_team_id: Optional[int],
    match_confidence: Optional[str],
    artifact_filename: str,
    odds_h: Optional[float],
    odds_d: Optional[float],
    odds_a: Optional[float],
    p_mkt: Optional[Dict[str, float]],
    p_model: Optional[Dict[str, float]],
    best_side: Optional[str],
    best_ev: Optional[float],
    status: str,
    reason: Optional[str],
) -> None:
    """
    Persistência de auditoria (para depois comparar com resultado real).
    Se a tabela não existir / schema diferente, a chamada falha e será capturada no caller.
    """

    sql = """
      INSERT INTO odds.audit_predictions (
        event_id,
        sport_key,
        kickoff_utc,
        captured_at_utc,
        bookmaker,
        market,
        league_id,
        season,
        fixture_id,
        home_team_id,
        away_team_id,
        match_confidence,
        artifact_filename,
        odds_h,
        odds_d,
        odds_a,
        p_mkt_h,
        p_mkt_d,
        p_mkt_a,
        p_model_h,
        p_model_d,
        p_model_a,
        best_side,
        best_ev,
        status,
        reason,
        created_at_utc,
        updated_at_utc
      )
      VALUES (
        %(event_id)s,
        %(sport_key)s,
        (%(kickoff_utc)s)::timestamptz,
        (%(captured_at_utc)s)::timestamptz,
        %(bookmaker)s,
        %(market)s,
        %(league_id)s,
        %(season)s,
        %(fixture_id)s,
        %(home_team_id)s,
        %(away_team_id)s,
        %(match_confidence)s,
        %(artifact_filename)s,
        %(odds_h)s,
        %(odds_d)s,
        %(odds_a)s,
        %(p_mkt_h)s,
        %(p_mkt_d)s,
        %(p_mkt_a)s,
        %(p_model_h)s,
        %(p_model_d)s,
        %(p_model_a)s,
        %(best_side)s,
        %(best_ev)s,
        %(status)s,
        %(reason)s,
        now(),
        now()
      )
      ON CONFLICT (event_id, artifact_filename)
      DO UPDATE SET
        sport_key = EXCLUDED.sport_key,
        kickoff_utc = EXCLUDED.kickoff_utc,
        captured_at_utc = EXCLUDED.captured_at_utc,
        bookmaker = EXCLUDED.bookmaker,
        market = EXCLUDED.market,
        league_id = EXCLUDED.league_id,
        season = EXCLUDED.season,
        fixture_id = EXCLUDED.fixture_id,
        home_team_id = EXCLUDED.home_team_id,
        away_team_id = EXCLUDED.away_team_id,
        match_confidence = EXCLUDED.match_confidence,
        odds_h = EXCLUDED.odds_h,
        odds_d = EXCLUDED.odds_d,
        odds_a = EXCLUDED.odds_a,
        p_mkt_h = EXCLUDED.p_mkt_h,
        p_mkt_d = EXCLUDED.p_mkt_d,
        p_mkt_a = EXCLUDED.p_mkt_a,
        p_model_h = EXCLUDED.p_model_h,
        p_model_d = EXCLUDED.p_model_d,
        p_model_a = EXCLUDED.p_model_a,
        best_side = EXCLUDED.best_side,
        best_ev = EXCLUDED.best_ev,
        status = EXCLUDED.status,
        reason = EXCLUDED.reason,
        updated_at_utc = now()
    """

    params = {
        "event_id": event_id,
        "sport_key": sport_key,
        "kickoff_utc": kickoff_utc,
        "captured_at_utc": captured_at_utc,
        "bookmaker": bookmaker,
        "market": market,
        "league_id": league_id,
        "season": season,
        "fixture_id": fixture_id,
        "home_team_id": home_team_id,
        "away_team_id": away_team_id,
        "artifact_filename": artifact_filename,
        "odds_h": odds_h,
        "odds_d": odds_d,
        "odds_a": odds_a,
        "p_mkt_h": (p_mkt or {}).get("H"),
        "p_mkt_d": (p_mkt or {}).get("D"),
        "p_mkt_a": (p_mkt or {}).get("A"),
        "p_model_h": (p_model or {}).get("H"),
        "p_model_d": (p_model or {}).get("D"),
        "p_model_a": (p_model or {}).get("A"),
        "best_side": best_side,
        "best_ev": best_ev,
        "status": status,
        "reason": reason,
        "match_confidence": match_confidence,
    }

    with conn.cursor() as cur:
        cur.execute(sql, params)


@router.get("/sports")
def admin_odds_list_sports() -> List[Dict[str, Any]]:
    try:
        rows = _client().list_sports()
        out: List[Dict[str, Any]] = []
        for x in rows:
            out.append(
                {
                    "key": x.get("key"),
                    "group": x.get("group"),
                    "title": x.get("title"),
                    "active": x.get("active"),
                }
            )
        return out
    except TheOddsApiError as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/upcoming")
def admin_odds_upcoming(
    sport_key: str = Query(..., min_length=2),
    regions: str = Query(default="eu"),
    limit: int = Query(default=50, ge=1, le=200),
) -> List[Dict[str, Any]]:
    try:
        raw = _client().get_odds_h2h(
            sport_key=sport_key,
            regions=regions,
            markets="h2h,totals",
        )
    except TheOddsApiError as e:
        raise HTTPException(status_code=500, detail=str(e))

    out: List[Dict[str, Any]] = []
    for ev in raw[:limit]:
        event_id = ev.get("id")
        commence_time = ev.get("commence_time")
        home = ev.get("home_team")
        away = ev.get("away_team")

        odds_h = odds_d = odds_a = None
        bookmakers = ev.get("bookmakers") or []
        if bookmakers:
            mk = bookmakers[0]
            markets = mk.get("markets") or []
            mkt = markets[0] if markets else None
            outcomes = (mkt or {}).get("outcomes") or []
            for o in outcomes:
                name = str(o.get("name") or "").strip()
                price = o.get("price")
                if price is None:
                    continue
                if name.lower() == str(home).lower():
                    odds_h = float(price)
                elif name.lower() == str(away).lower():
                    odds_a = float(price)
                elif name.lower() in ("draw", "tie", "empate"):
                    odds_d = float(price)

        out.append(
            {
                "event_id": event_id,
                "kickoff_utc": commence_time,
                "home_name": home,
                "away_name": away,
                "sport_key": sport_key,
                "regions": regions,
                "odds_1x2": {"H": odds_h, "D": odds_d, "A": odds_a},
            }
        )
    return out

class AdminOddsRefreshResponse(BaseModel):
    ok: bool = True
    sport_key: str
    regions: str
    captured_at_utc: str
    counters: Dict[str, int]
    matchup_snapshots_error_msg: Optional[str] = None

def _parse_iso_dt(s: Optional[str]) -> Optional[datetime]:
    if not s:
        return None
    try:
        # TheOdds costuma vir ISO com Z
        if s.endswith("Z"):
            s = s.replace("Z", "+00:00")
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except Exception:
        return None

def _persist_odds_h2h_batch(
    conn,
    *,
    sport_key: str,
    raw_events: List[Dict[str, Any]],
    captured_at_utc: datetime,
) -> Tuple[Dict[str, int], List[str]]:
    """
    Persiste:
      - odds.odds_events (upsert)
      - odds.odds_snapshots_1x2 (insert idempotente por captured_at_utc)
    Retorna:
      - counters (somente ints)
      - event_ids_touched (lista de event_id tocados no batch)
    """
    c: Dict[str, int] = {
        "events_upserted": 0,
        "snapshots_inserted": 0,
        "snapshots_skipped": 0,
    }

    event_ids_touched: set[str] = set()

    sql_upsert_event = """
      INSERT INTO odds.odds_events (
        event_id, sport_key, commence_time_utc, home_name, away_name, updated_at_utc
      )
      VALUES (
        %(event_id)s, %(sport_key)s, %(commence_time_utc)s, %(home_name)s, %(away_name)s, now()
      )
      ON CONFLICT (event_id) DO UPDATE SET
        sport_key = EXCLUDED.sport_key,
        commence_time_utc = EXCLUDED.commence_time_utc,
        home_name = EXCLUDED.home_name,
        away_name = EXCLUDED.away_name,
        updated_at_utc = now()
    """

    sql_insert_snapshot = """
      INSERT INTO odds.odds_snapshots_1x2 (
        event_id, bookmaker, market, odds_home, odds_draw, odds_away, captured_at_utc
      )
      VALUES (
        %(event_id)s, %(bookmaker)s, %(market)s, %(odds_home)s, %(odds_draw)s, %(odds_away)s, %(captured_at_utc)s
      )
      ON CONFLICT DO NOTHING
    """

    with conn.cursor() as cur:
        for ev in (raw_events or []):
            event_id = ev.get("id") or ev.get("event_id")
            home = ev.get("home_team") or ev.get("home_name")
            away = ev.get("away_team") or ev.get("away_name")
            commence = _parse_iso_dt(ev.get("commence_time") or ev.get("commence_time_utc"))

            if not event_id or not home or not away:
                continue

            event_id_s = str(event_id)
            event_ids_touched.add(event_id_s)

            cur.execute(
                sql_upsert_event,
                {
                    "event_id": event_id_s,
                    "sport_key": str(sport_key),
                    "commence_time_utc": commence,
                    "home_name": str(home),
                    "away_name": str(away),
                },
            )
            c["events_upserted"] += 1

            # snapshots: varrer bookmakers -> market h2h
            bookmakers = ev.get("bookmakers") or []
            for bk in bookmakers:
                bk_title = bk.get("title") or bk.get("key") or None
                markets = bk.get("markets") or []
                for mk in markets:
                    if (mk.get("key") or mk.get("market") or "h2h") != "h2h":
                        continue

                    outcomes = mk.get("outcomes") or []
                    odds_home = None
                    odds_draw = None
                    odds_away = None

                    for oc in outcomes:
                        nm = oc.get("name")
                        pr = oc.get("price")
                        if nm == home:
                            odds_home = pr
                        elif nm == away:
                            odds_away = pr
                        else:
                            if isinstance(nm, str) and nm.strip().lower() == "draw":
                                odds_draw = pr

                    cur.execute(
                        sql_insert_snapshot,
                        {
                            "event_id": event_id_s,
                            "bookmaker": str(bk_title) if bk_title else None,
                            "market": "h2h",
                            "odds_home": odds_home,
                            "odds_draw": odds_draw,
                            "odds_away": odds_away,
                            "captured_at_utc": captured_at_utc,
                        },
                    )
                    if cur.rowcount == 1:
                        c["snapshots_inserted"] += 1
                    else:
                        c["snapshots_skipped"] += 1

    event_ids_sorted = sorted(event_ids_touched)
    return c, event_ids_sorted
def _persist_odds_markets_batch(
    *,
    conn,
    event_id: str,
    bookmaker_title: str | None,
    captured_at_utc,
    markets: list,
    home_name: str,
    away_name: str,
) -> int:
    """
    Persiste snapshots genéricos (totals, btts e também h2h opcional) em odds.odds_snapshots_market.
    Retorna quantidade de tentativas de insert (não garante insert real por causa do ON CONFLICT DO NOTHING).
    """
    sql_insert_market_snapshot = """
      INSERT INTO odds.odds_snapshots_market (
        event_id, bookmaker, market_key, selection_key, point, price, captured_at_utc
      )
      VALUES (
        %(event_id)s, %(bookmaker)s, %(market_key)s, %(selection_key)s, %(point)s, %(price)s, %(captured_at_utc)s
      )
      ON CONFLICT DO NOTHING
    """

    attempted = 0

    with conn.cursor() as cur:
        for mkt in (markets or []):
            mkey = (mkt.get("key") or "").strip().lower()
            if mkey not in ("h2h", "totals", "btts"):
                continue

            outcomes = mkt.get("outcomes") or []
            for o in outcomes:
                nm = o.get("name")
                pr = o.get("price")
                pt = o.get("point")

                if nm is None or pr is None:
                    continue

                selection_key = None
                point = None

                if mkey == "h2h":
                    # home/away/draw
                    if nm == home_name:
                        selection_key = "H"
                    elif nm == away_name:
                        selection_key = "A"
                    elif isinstance(nm, str) and nm.strip().lower() == "draw":
                        selection_key = "D"
                    point = None

                elif mkey == "totals":
                    # Over/Under + point obrigatório
                    if isinstance(nm, str):
                        low = nm.strip().lower()
                        if low == "over":
                            selection_key = "over"
                        elif low == "under":
                            selection_key = "under"
                    try:
                        point = float(pt) if pt is not None else None
                    except Exception:
                        point = None

                    if point is None:
                        continue

                elif mkey == "btts":
                    # Yes/No
                    if isinstance(nm, str):
                        low = nm.strip().lower()
                        if low == "yes":
                            selection_key = "yes"
                        elif low == "no":
                            selection_key = "no"
                    point = None

                if not selection_key:
                    continue

                cur.execute(
                    sql_insert_market_snapshot,
                    {
                        "event_id": str(event_id),
                        "bookmaker": (str(bookmaker_title) if bookmaker_title else None),
                        "market_key": mkey,
                        "selection_key": selection_key,
                        "point": point,
                        "price": pr,
                        "captured_at_utc": captured_at_utc,
                    },
                )
                attempted += 1

    return attempted

def _persist_btts_for_events(
    *,
    conn,
    sport_key: str,
    regions: str,
    event_ids: list[str],
    captured_at_utc,
) -> dict:
    """
    Busca BTTS via endpoint single-event e persiste em odds_snapshots_market.
    Retorna counters para debug/observabilidade.
    """
    attempted_events = 0
    ok_events = 0
    fail_events = 0
    market_attempted = 0

    first_error: str | None = None
    first_error_type: str | None = None

    for event_id in event_ids:
        attempted_events += 1
        try:
            ev = _client().get_event_odds(
                sport_key=sport_key,
                event_id=str(event_id),
                regions=regions,
                markets="btts",
            )

            # resposta costuma vir como um "event" com bookmakers/markets
            home = ev.get("home_team") or ev.get("home_name")
            away = ev.get("away_team") or ev.get("away_name")
            bookmakers = ev.get("bookmakers") or []

            if not home or not away:
                # sem nomes, não persistimos
                fail_events += 1
                continue

            for bk in bookmakers:
                bk_title = bk.get("title") or bk.get("key") or None
                markets = bk.get("markets") or []
                market_attempted += _persist_odds_markets_batch(
                    conn=conn,
                    event_id=str(ev.get("id") or event_id),
                    bookmaker_title=(str(bk_title) if bk_title else None),
                    captured_at_utc=captured_at_utc,
                    markets=markets,
                    home_name=str(home),
                    away_name=str(away),
                )

            ok_events += 1

        except Exception as e:
            # não derrubar refresh inteiro por BTTS, mas guardar 1 erro para debug
            fail_events += 1
            if first_error is None:
                first_error = str(e)
                first_error_type = type(e).__name__


    return {
        "btts_events_attempted": attempted_events,
        "btts_events_ok": ok_events,
        "btts_events_fail": fail_events,
        "btts_market_snapshots_attempted": int(market_attempted),
        "btts_first_error_type": first_error_type,
        "btts_first_error": first_error,
    }


class AdminOddsLeagueMapPendingItem(BaseModel):
    sport_key: str
    sport_title: Optional[str] = None
    sport_group: Optional[str] = None
    league_id: int
    season_policy: str
    fixed_season: Optional[int] = None
    regions: Optional[str] = None
    hours_ahead: int
    tol_hours: int
    enabled: bool
    mapping_status: str
    confidence: float
    notes: Optional[str] = None
    updated_at_utc: Optional[str] = None


@router.get("/league_map/pending")
def admin_odds_league_map_pending(
    *,
    limit: int = 200,
) -> Dict[str, Any]:
    """Lista mapeamentos pendentes em odds.odds_league_map."""
    sql = """
      SELECT
        sport_key, sport_title, sport_group,
        league_id, season_policy, fixed_season,
        regions, hours_ahead, tol_hours,
        enabled, mapping_status, confidence, notes,
        updated_at_utc
      FROM odds.odds_league_map
      WHERE mapping_status = 'pending'
      ORDER BY updated_at_utc DESC NULLS LAST
      LIMIT %(limit)s
    """
    with pg_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, {"limit": int(limit)})
            rows = cur.fetchall()

    items: List[AdminOddsLeagueMapPendingItem] = []
    for (
        sport_key,
        sport_title,
        sport_group,
        league_id,
        season_policy,
        fixed_season,
        regions,
        hours_ahead,
        tol_hours,
        enabled,
        mapping_status,
        confidence,
        notes,
        updated_at_utc,
    ) in rows:
        items.append(
            AdminOddsLeagueMapPendingItem(
                sport_key=str(sport_key),
                sport_title=(str(sport_title) if sport_title is not None else None),
                sport_group=(str(sport_group) if sport_group is not None else None),
                league_id=int(league_id),
                season_policy=str(season_policy),
                fixed_season=(int(fixed_season) if fixed_season is not None else None),
                regions=(str(regions) if regions is not None else None),
                hours_ahead=int(hours_ahead),
                tol_hours=int(tol_hours),
                enabled=bool(enabled),
                mapping_status=str(mapping_status),
                confidence=float(confidence),
                notes=(str(notes) if notes is not None else None),
                updated_at_utc=(updated_at_utc.isoformat() if hasattr(updated_at_utc, "isoformat") else (str(updated_at_utc) if updated_at_utc is not None else None)),
            )
        )

    return {"ok": True, "items": [it.model_dump() for it in items]}

@router.get("/league_map")
def admin_odds_league_map_list(
    *,
    limit: int = 500,
) -> Dict[str, Any]:
    sql = """
      SELECT
        m.sport_key,
        c.sport_title,
        c.sport_group,
        m.league_id,
        m.mapping_status,
        m.enabled,
        m.official_country_name,
        l.country_name AS core_country_name,
        m.updated_at_utc
      FROM odds.odds_league_map m
      JOIN odds.odds_sport_catalog c
        ON c.sport_key = m.sport_key
      LEFT JOIN core.leagues l
        ON l.league_id = m.league_id
      ORDER BY m.updated_at_utc DESC NULLS LAST, m.sport_key ASC
      LIMIT %(limit)s
    """

    items: List[Dict[str, Any]] = []
    with pg_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, {"limit": int(limit)})
            rows = cur.fetchall() or []

    for row in rows:
        items.append(
            {
                "sport_key": str(row[0]),
                "sport_title": str(row[1]) if row[1] is not None else None,
                "sport_group": str(row[2]) if row[2] is not None else None,
                "league_id": int(row[3]) if row[3] is not None else None,
                "mapping_status": str(row[4]),
                "enabled": bool(row[5]),
                "official_country_name": str(row[6]) if row[6] is not None else None,
                "core_country_name": str(row[7]) if row[7] is not None else None,
                "updated_at_utc": (
                    row[8].isoformat() if hasattr(row[8], "isoformat") else (str(row[8]) if row[8] is not None else None)
                ),
            }
        )

    return {"ok": True, "items": items, "count": len(items)}


@router.post("/league_map/{sport_key}/official_country")
def admin_odds_set_official_country(
    sport_key: str,
    body: AdminLeagueCountryUpdateBody = Body(...),
) -> Dict[str, Any]:
    official_country_name = None
    if body.official_country_name is not None:
        value = str(body.official_country_name).strip()
        official_country_name = value if value else None

    sql = """
      UPDATE odds.odds_league_map
      SET
        official_country_name = %(official_country_name)s,
        updated_at_utc = now()
      WHERE sport_key = %(sport_key)s
      RETURNING sport_key, official_country_name, updated_at_utc
    """

    with pg_conn() as conn:
        conn.autocommit = False
        with conn.cursor() as cur:
            cur.execute(
                sql,
                {
                    "sport_key": str(sport_key),
                    "official_country_name": official_country_name,
                },
            )
            row = cur.fetchone()
        conn.commit()

    if not row:
        raise HTTPException(status_code=404, detail="sport_key_not_found")

    return {
        "ok": True,
        "sport_key": str(row[0]),
        "official_country_name": str(row[1]) if row[1] is not None else None,
        "updated_at_utc": row[2].isoformat() if hasattr(row[2], "isoformat") else str(row[2]),
    }

@router.post("/refresh", response_model=AdminOddsRefreshResponse)
def admin_odds_refresh(
    sport_key: str = Query(..., min_length=2),
    regions: str = Query(default="eu"),
    include_btts: bool = Query(default=False),
) -> AdminOddsRefreshResponse:
    """
    Admin-only: chama provider e persiste no DB (odds_events + odds_snapshots_1x2).
    Isso abastece o Produto (/odds/*) no modo DB-only.
    """
    try:
        raw = _client().get_odds_h2h(
            sport_key=sport_key,
            regions=regions,
            markets="h2h,totals",
        )
    except TheOddsApiError as e:
        raise HTTPException(status_code=500, detail=str(e))

    captured_at = datetime.now(timezone.utc)
    matchup_snapshots_error_msg: Optional[str] = None

    # ids para BTTS single-event (additional market)
    event_ids: list[str] = []
    for ev in raw:
        eid = ev.get("id") or ev.get("event_id")
        if eid:
            event_ids.append(str(eid))

    try:
        with pg_conn() as conn:
            conn.autocommit = False

            # 1) Persistência legada (1x2) - não mexe em nada do que já funcionava
            counters, event_ids_touched = _persist_odds_h2h_batch(
                conn,
                sport_key=sport_key,
                raw_events=raw,
                captured_at_utc=captured_at,
            )

            # 2) Persistência genérica (markets: h2h/totals/btts) - novo
            market_attempted = 0
            for ev in raw:
                event_id = ev.get("id") or ev.get("event_id")
                home = ev.get("home_team") or ev.get("home_name")
                away = ev.get("away_team") or ev.get("away_name")
                if not event_id or not home or not away:
                    continue

                bookmakers = ev.get("bookmakers") or []
                for bk in bookmakers:
                    bk_title = bk.get("title") or bk.get("key") or None
                    markets = bk.get("markets") or []
                    market_attempted += _persist_odds_markets_batch(
                        conn=conn,
                        event_id=str(event_id),
                        bookmaker_title=(str(bk_title) if bk_title else None),
                        captured_at_utc=captured_at,
                        markets=markets,
                        home_name=str(home),
                        away_name=str(away),
                    )

            # acrescenta sem quebrar compatibilidade
            counters["market_snapshots_attempted"] = int(market_attempted)

            # 3) BTTS (additional market): requer endpoint single-event
            if include_btts and event_ids:
                btts_c = _persist_btts_for_events(
                    conn=conn,
                    sport_key=sport_key,
                    regions=regions,
                    event_ids=event_ids,
                    captured_at_utc=captured_at,
                )
                counters.update(btts_c)
            else:
                counters.update(
                    {
                        "btts_events_attempted": 0,
                        "btts_events_ok": 0,
                        "btts_events_fail": 0,
                        "btts_market_snapshots_attempted": 0,
                    }
                )

            conn.commit()

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"persist_failed: {e}")

    # 4) Gatilho MVP: rebuild snapshots do produto após refresh (incremental por event_ids) + observabilidade
    try:
        import time as _time

        mv = get_active_model_version()
        cv = get_calc_version()

        t0 = _time.time()

        with pg_conn() as conn2:
            conn2.autocommit = False

            # job_run start
            run_id = start_job_run(
                conn2,
                job_name=JOB_PRODUCT_SNAPSHOT_REBUILD_V1,
                scope_key=sport_key,
                model_version=mv,
                calc_version=cv,
            )
            conn2.commit()

            with conn2.cursor() as cur:
                cur.execute("SET LOCAL statement_timeout = '60s'")
                cur.execute("SET LOCAL lock_timeout = '3s'")

            # preferir o que realmente foi tocado no persist; fallback pro "raw event_ids"
            event_ids_rebuild = list(event_ids_touched or [])

            team_resolve_counters = resolve_odds_event_team_ids(
                conn2,
                sport_key=sport_key,
                limit=500,
            )
            conn2.commit()

            counters["team_ids_events_scanned"] = int((team_resolve_counters or {}).get("events_scanned", 0))
            counters["team_ids_home_resolved"] = int((team_resolve_counters or {}).get("home_resolved", 0))
            counters["team_ids_away_resolved"] = int((team_resolve_counters or {}).get("away_resolved", 0))
            counters["team_ids_fully_resolved"] = int((team_resolve_counters or {}).get("fully_resolved", 0))
            counters["team_ids_queued"] = int((team_resolve_counters or {}).get("queued_for_review", 0))

            snap_counters = rebuild_matchup_snapshots_v1(
                conn2,
                sport_key=sport_key,
                model_version=mv,
                event_ids=event_ids_rebuild,
            )
            conn2.commit()

            counters_payload = dict(snap_counters or {})
            counters_payload["mode"] = "event_ids_touched" if event_ids_touched else "event_ids_window"
            counters_payload["event_ids_count"] = int(len(event_ids_rebuild))
            counters_payload["model_version"] = mv
            counters_payload["calc_version"] = cv

            finish_job_run(
                conn2,
                run_id=run_id,
                ok=True,
                duration_ms=int(round((_time.time() - t0) * 1000)),
                counters=counters_payload,
                error_text=None,
            )
            conn2.commit()

        counters["matchup_snapshots_rebuilt"] = (
            int((snap_counters or {}).get("snapshots_upserted", 0))
            + int((snap_counters or {}).get("snapshots_team_fallback", 0))
        )
        counters["matchup_snapshots_candidates"] = int((snap_counters or {}).get("candidates", 0))
        counters["matchup_snapshots_error"] = 0

    except Exception as e:
        # não quebrar refresh por causa do rebuild, mas registrar falha (best-effort)
        try:
            import time as _time

            with pg_conn() as connE:
                connE.autocommit = False
                run_id = start_job_run(
                    connE,
                    job_name=JOB_PRODUCT_SNAPSHOT_REBUILD_V1,
                    scope_key=sport_key,
                    model_version=get_active_model_version(),
                    calc_version=get_calc_version(),
                )
                finish_job_run(
                    connE,
                    run_id=run_id,
                    ok=False,
                    duration_ms=0,
                    counters=None,
                    error_text=f"{type(e).__name__}: {e}",
                )
                connE.commit()
        except Exception:
            pass

        counters["matchup_snapshots_rebuilt"] = 0
        counters["matchup_snapshots_error"] = 1
        matchup_snapshots_error_msg = f"{type(e).__name__}: {e}"

    return AdminOddsRefreshResponse(
        ok=True,
        sport_key=sport_key,
        regions=regions,
        captured_at_utc=captured_at.isoformat(),
        counters=counters,
        matchup_snapshots_error_msg=matchup_snapshots_error_msg if counters.get("matchup_snapshots_error") else None,
    )

class AdminOddsRefreshBlock(BaseModel):
    counters: Dict[str, Any]


class AdminOddsResolveBlock(BaseModel):
    counters: Dict[str, Any]
    sample_issues: List[Dict[str, Any]] = []


class AdminOddsSnapshotsBlock(BaseModel):
    counters: Dict[str, Any]
    mode: Optional[str] = None
    sample_issues: List[Dict[str, Any]] = []


class AdminOddsRefreshAndResolveResponse(BaseModel):
    ok: bool = True
    sport_key: str
    regions: str
    captured_at_utc: str
    refresh: Dict[str, Any]
    resolve: Dict[str, Any]
    snapshots: Dict[str, Any]

class AdminOddsResolveBatchResponse(BaseModel):
    ok: bool
    sport_key: str
    window_hours: int

    # Compat: antigos parâmetros "assume_*" (podem ser omitidos quando houver league_map)
    assume_league_id: Optional[int] = None
    assume_season: Optional[int] = None

    # Source of truth efetivo usado na resolução
    effective_league_id: int
    effective_season: int

    # Debug de governança (opcional)
    league_map_status: Optional[str] = None

    tol_hours: int
    counters: Dict[str, Any]
    sample_issues: List[Dict[str, Any]] = []

class TeamResolutionPendingItem(BaseModel):
    sport_key: Optional[str] = None
    raw_name: Optional[str] = None
    normalized_name: Optional[str] = None
    payload: Optional[Dict[str, Any]] = None
    created_at_utc: Optional[str] = None
    updated_at_utc: Optional[str] = None


class TeamResolutionPendingResponse(BaseModel):
    ok: bool = True
    items: List[TeamResolutionPendingItem]
    count: int


class TeamSearchItem(BaseModel):
    team_id: int
    name: str
    country_name: Optional[str] = None


class TeamSearchResponse(BaseModel):
    ok: bool = True
    items: List[TeamSearchItem]
    count: int


class TeamResolutionApproveRequest(BaseModel):
    sport_key: str
    raw_name: str
    team_id: int
    normalized_name: Optional[str] = None
    confidence: float = 1.0


class TeamResolutionApproveResponse(BaseModel):
    ok: bool = True
    sport_key: str
    raw_name: str
    normalized_name: str
    team_id: int
    removed_from_queue: int
    team_resolve_counters: Optional[Dict[str, Any]] = None
    snapshot_counters: Optional[Dict[str, Any]] = None

@router.post("/refresh_and_resolve", response_model=AdminOddsRefreshAndResolveResponse)
def admin_odds_refresh_and_resolve(
    sport_key: str = Query(..., min_length=2),
    regions: str = Query(default="eu"),
    hours_ahead: int = Query(default=720, ge=1, le=24 * 60),
    assume_league_id: Optional[int] = Query(default=None, ge=1),
    assume_season: Optional[int] = Query(default=None, ge=1900, le=2100),
    tol_hours: Optional[int] = Query(default=None, ge=1, le=48),
    limit: int = Query(default=200, ge=1, le=2000),
) -> AdminOddsRefreshAndResolveResponse:
    try:
        with pg_conn() as conn:
            eff_league_id, eff_season, eff_tol, _meta = _effective_league_season_tol(
                conn,
                sport_key=sport_key,
                assume_league_id=assume_league_id,
                assume_season=assume_season,
                tol_hours=tol_hours,
            )

        out = run_odds_refresh_and_resolve(
            sport_key=sport_key,
            regions=regions,
            hours_ahead=int(hours_ahead),
            limit=int(limit),
            assume_league_id=int(eff_league_id),
            assume_season=int(eff_season),
            tol_hours=int(eff_tol),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"refresh_and_resolve_failed: {e}")

    if not out.get("ok"):
        raise HTTPException(status_code=500, detail=out)

    snapshots_block = out.get("snapshots")
    if not isinstance(snapshots_block, dict):
        snapshots_block = {
            "mode": "job_return_default",
            "counters": {
                "matchup_snapshots_rebuilt": int(
                    ((out.get("resolve") or {}).get("counters") or {}).get("matchup_snapshots_rebuilt", 0)
                ),
                "matchup_snapshots_candidates": int(
                    ((out.get("resolve") or {}).get("counters") or {}).get("matchup_snapshots_candidates", 0)
                ),
                "matchup_snapshots_error": 0,
            },
            "sample_issues": [],
        }

    out["snapshots"] = snapshots_block

    return AdminOddsRefreshAndResolveResponse(**out)

@router.post("/resolve/batch", response_model=AdminOddsResolveBatchResponse)

def admin_odds_resolve_batch(
    *,
    sport_key: str,
    hours_ahead: int = 720,
    limit: int = 200,
    tol_hours: int = 6,
    max_candidates: int = 5,
    persist_resolution: bool = True,
    # Compat (opcionais se houver odds_league_map aprovado)
    assume_league_id: Optional[int] = None,
    assume_season: Optional[int] = None,
) -> AdminOddsResolveBatchResponse:
    """
    Resolve em lote:
      odds.odds_events (sport_key) -> core.fixtures via fuzzy + janela temporal

    Regras:
      - Se existir odds.odds_league_map aprovado para o sport_key, assume_* podem ser omitidos.
      - Se NÃO existir league_map aprovado, assume_league_id/assume_season/tol_hours devem ser informados.
    """
    counters: Dict[str, Any] = {
        "events_scanned": 0,
        "exact": 0,
        "probable": 0,
        "ambiguous": 0,
        "not_found": 0,
        "errors": 0,
        "persisted": 0,
    }
    sample_issues: List[Dict[str, Any]] = []

    with pg_conn() as conn:
        eff_league_id, eff_season, eff_tol, meta = _effective_league_season_tol(
            conn,
            sport_key=sport_key,
            assume_league_id=assume_league_id,
            assume_season=assume_season,
            tol_hours=tol_hours,
        )
        lm = meta.get("league_map") if isinstance(meta, dict) else None
        lm_status = str(lm.get("mapping_status")) if isinstance(lm, dict) and lm.get("mapping_status") is not None else None

        # Lista eventos (odds) na janela
        events = list_odds_events(
            conn,
            sport_key=sport_key,
            hours_ahead=int(hours_ahead),
            limit=int(limit),
        )

        for ev in events:
            counters["events_scanned"] += 1
            try:
                res = resolve_odds_event(
                    conn,
                    event_id=str(ev["event_id"]),
                    assume_league_id=int(eff_league_id),
                    assume_season=int(eff_season),
                    tol_hours=int(eff_tol),
                    max_candidates=int(max_candidates),
                    persist_resolution=bool(persist_resolution),
                )

                st = str(res.status)
                if st == "EXACT":
                    counters["exact"] += 1
                elif st == "PROBABLE":
                    counters["probable"] += 1
                elif st == "AMBIGUOUS":
                    counters["ambiguous"] += 1
                else:
                    counters["not_found"] += 1

                if persist_resolution:
                    # resolve_odds_event atualiza odds_events (idempotente); contamos como persisted quando houve update
                    counters["persisted"] += 1

                if st != "EXACT" and len(sample_issues) < 10:
                    sample_issues.append(
                        {
                            "event_id": ev.get("event_id"),
                            "commence_time_utc": ev.get("commence_time_utc"),
                            "home_name": ev.get("home_name"),
                            "away_name": ev.get("away_name"),
                            "status": st,
                            "confidence": float(res.confidence),
                            "reason": res.reason,
                            "top_candidate": (res.candidates[0] if res.candidates else None),
                        }
                    )

            except Exception as e:
                counters["errors"] += 1
                if len(sample_issues) < 10:
                    sample_issues.append(
                        {
                            "event_id": ev.get("event_id"),
                            "commence_time_utc": ev.get("commence_time_utc"),
                            "home_name": ev.get("home_name"),
                            "away_name": ev.get("away_name"),
                            "status": "ERROR",
                            "error": repr(e),
                        }
                    )

    return AdminOddsResolveBatchResponse(
        ok=True,
        sport_key=sport_key,
        window_hours=int(hours_ahead),
        assume_league_id=int(assume_league_id) if assume_league_id is not None else None,
        assume_season=int(assume_season) if assume_season is not None else None,
        effective_league_id=int(eff_league_id),
        effective_season=int(eff_season),
        league_map_status=lm_status,
        tol_hours=int(eff_tol),
        counters=counters,
        sample_issues=sample_issues,
    )

@router.get("/upcoming/orchestrate")
def admin_odds_upcoming_orchestrate(
    sport_key: str = Query(..., min_length=2),
    regions: str = Query(default="eu"),
    limit: int = Query(default=50, ge=1, le=200),
    artifact_filename: Optional[str] = Query(default=None),
    assume_league_id: Optional[int] = Query(default=None, ge=1),
    assume_season: Optional[int] = Query(default=None, ge=1900, le=2100),
) -> List[Dict[str, Any]]:
    try:
        raw = _client().get_odds_h2h(
            sport_key=sport_key,
            regions=regions,
            markets="h2h,totals",
        )
    except TheOddsApiError as e:
        raise HTTPException(status_code=500, detail=str(e))

    out: List[Dict[str, Any]] = []

    with pg_conn() as conn:
        for ev in raw[:limit]:
            event_id = ev.get("id")
            commence_time = ev.get("commence_time")
            home = str(ev.get("home_team") or "")
            away = str(ev.get("away_team") or "")

            odds_h = odds_d = odds_a = None
            bookmakers = ev.get("bookmakers") or []
            if bookmakers:
                mk = bookmakers[0]
                markets = mk.get("markets") or []
                mkt = markets[0] if markets else None
                outcomes = (mkt or {}).get("outcomes") or []
                for o in outcomes:
                    name = str(o.get("name") or "").strip()
                    price = o.get("price")
                    if price is None:
                        continue
                    if name.lower() == home.lower():
                        odds_h = float(price)
                    elif name.lower() == away.lower():
                        odds_a = float(price)
                    elif name.lower() in ("draw", "tie", "empate"):
                        odds_d = float(price)

            home_id, home_type, home_sugg = _find_team_id(conn, home)
            away_id, away_type, away_sugg = _find_team_id(conn, away)

            fixture = None
            if home_id and away_id and commence_time:
                fixture = _try_find_fixture(conn, commence_time, home_id, away_id)

            market = _market_probs_from_odds(odds_h, odds_d, odds_a)

            league_id = (fixture or {}).get("league_id") if fixture else None
            season = (fixture or {}).get("season") if fixture else None
            if league_id is None:
                league_id = assume_league_id
            if season is None:
                season = assume_season

            model_block = None
            if artifact_filename and home_id and away_id and league_id and season:
                try:
                    pred = predict_1x2_from_artifact(
                        artifact_filename=artifact_filename,
                        league_id=int(league_id),
                        season=int(season),
                        home_team_id=int(home_id),
                        away_team_id=int(away_id),
                    )

                    p_model = pred["probs"]
                    p_mkt = market.get("novig")

                    edge = None
                    if p_mkt:
                        edge = {
                            "H": (p_model["H"] - (p_mkt["H"] or 0.0)) if p_mkt.get("H") is not None else None,
                            "D": (p_model["D"] - (p_mkt["D"] or 0.0)) if p_mkt.get("D") is not None else None,
                            "A": (p_model["A"] - (p_mkt["A"] or 0.0)) if p_mkt.get("A") is not None else None,
                        }

                    evv = {
                        "H": (p_model["H"] * odds_h - 1.0) if odds_h else None,
                        "D": (p_model["D"] * odds_d - 1.0) if odds_d else None,
                        "A": (p_model["A"] * odds_a - 1.0) if odds_a else None,
                    }

                    match_stats_mode = _read_match_stats_mode_from_pred(pred)
                    model_status = "OK_FALLBACK" if match_stats_mode in ("partial_fallback", "full_fallback") else "OK_EXACT"

                    model_block = {
                        "league_id": int(league_id),
                        "season": int(season),
                        "artifact_filename": artifact_filename,
                        "probs_model": p_model,
                        "edge_vs_market": edge,
                        "ev_decimal": evv,
                        "features": pred.get("features"),
                        "runtime": pred.get("runtime"),
                        "artifact_meta": pred.get("artifact"),
                        "model_status": model_status,
                    }
                except FileNotFoundError as e:
                    raise HTTPException(status_code=404, detail=str(e))
                except Exception as e:
                    model_block = {
                        "error": str(e),
                        "model_status": _classify_model_runtime_error(str(e)),
                    }

            out.append(
                {
                    "event_id": event_id,
                    "kickoff_utc": commence_time,
                    "home_name": home,
                    "away_name": away,
                    "sport_key": sport_key,
                    "regions": regions,
                    "odds_1x2": {"H": odds_h, "D": odds_d, "A": odds_a},
                    "market_probs": market,
                    "resolve": {
                        "home": {"team_id": home_id, "match_type": home_type, "suggestions": home_sugg},
                        "away": {"team_id": away_id, "match_type": away_type, "suggestions": away_sugg},
                        "ok": bool(home_id and away_id),
                    },
                    "fixture_hint": fixture,
                    "model": model_block,
                }
            )

    return out


@router.get("/queue")
def admin_odds_queue(
    sport_key: Optional[str] = Query(default=None),
    hours_ahead: int = Query(default=72, ge=1, le=720),
    limit: int = Query(default=200, ge=1, le=1000),
) -> List[Dict[str, Any]]:
    """
    Queue: lê odds persistidas (último snapshot por evento) para jogos futuros.
    NÃO chama provider externo. Apenas DB.
    """
    now_utc = datetime.now(timezone.utc)
    end_utc = now_utc + timedelta(hours=hours_ahead)

    sql = """
      WITH latest AS (
        SELECT DISTINCT ON (s.event_id)
          s.event_id,
          s.bookmaker,
          s.market,
          s.odds_home,
          s.odds_draw,
          s.odds_away,
          s.captured_at_utc
        FROM odds.odds_snapshots_1x2 s
        ORDER BY s.event_id, s.captured_at_utc DESC
      )
      SELECT
        e.event_id,
        e.sport_key,
        e.commence_time_utc,
        e.home_name,
        e.away_name,
        e.resolved_home_team_id,
        e.resolved_away_team_id,
        e.resolved_fixture_id,
        e.match_confidence,
        l.bookmaker,
        l.market,
        l.odds_home,
        l.odds_draw,
        l.odds_away,
        l.captured_at_utc,
        EXTRACT(EPOCH FROM (now() - l.captured_at_utc))::int AS freshness_seconds
      FROM odds.odds_events e
      JOIN latest l ON l.event_id = e.event_id
      WHERE ((%(sport_key)s)::text IS NULL OR e.sport_key = (%(sport_key)s)::text)
        AND (
          e.commence_time_utc IS NULL
          OR (e.commence_time_utc >= now() AND e.commence_time_utc <= (%(end)s)::timestamptz)
        )
      ORDER BY
        e.commence_time_utc ASC NULLS LAST,
        l.captured_at_utc DESC
      LIMIT %(limit)s
    """
    params = {"sport_key": sport_key, "end": end_utc, "limit": limit}

    try:
        with pg_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(sql, params)
                rows = cur.fetchall()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    out: List[Dict[str, Any]] = []
    try:
        for row in rows:
            (
                event_id,
                sport_key_db,
                commence_time_utc,
                home_name,
                away_name,
                resolved_home_team_id,
                resolved_away_team_id,
                resolved_fixture_id,
                match_confidence,
                bookmaker,
                market,
                odds_home,
                odds_draw,
                odds_away,
                captured_at_utc,
                freshness_seconds,
            ) = row

            kickoff_iso = (
                commence_time_utc.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
                if commence_time_utc else None
            )
            captured_iso = (
                captured_at_utc.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
                if captured_at_utc else None
            )

            out.append(
                {
                    "event_id": str(event_id),
                    "sport_key": str(sport_key_db),
                    "kickoff_utc": kickoff_iso,
                    "home_name": home_name,
                    "away_name": away_name,
                    "resolved": {
                        "home_team_id": int(resolved_home_team_id) if resolved_home_team_id is not None else None,
                        "away_team_id": int(resolved_away_team_id) if resolved_away_team_id is not None else None,
                        "fixture_id": int(resolved_fixture_id) if resolved_fixture_id is not None else None,
                        "match_confidence": match_confidence,
                    },
                    "latest_snapshot": {
                        "bookmaker": bookmaker,
                        "market": market,
                        "odds_1x2": {
                            "H": float(odds_home) if odds_home is not None else None,
                            "D": float(odds_draw) if odds_draw is not None else None,
                            "A": float(odds_away) if odds_away is not None else None,
                        },
                        "captured_at_utc": captured_iso,
                        "freshness_seconds": int(freshness_seconds) if freshness_seconds is not None else None,
                    },
                }
            )
    except Exception as e:
        # Se acontecer qualquer mismatch inesperado em row/unpack/tipos, devolve erro explícito
        raise HTTPException(status_code=500, detail=f"queue_parse_failed: {e}")

    return out

@router.get("/queue/intel")
def admin_odds_queue_intel(
    sport_key: Optional[str] = Query(default=None),
    hours_ahead: int = Query(default=72, ge=1, le=720),
    min_confidence: str = Query(default="NONE", pattern="^(NONE|ILIKE|EXACT)$"),
    limit: int = Query(default=200, ge=1, le=1000),

    # MVP: assumimos EPL/season quando fixture_id não existe
    assume_league_id: Optional[int] = Query(default=39, ge=1),
    assume_season: Optional[int] = Query(default=2024, ge=1900, le=2100),

    artifact_filename: str = Query(default=DEFAULT_EPL_ARTIFACT),
    sort: str = Query(
        default="best_ev",
        pattern="^(best_ev|ev_h|ev_d|ev_a|edge_h|edge_d|edge_a|kickoff|freshness)$"
    ),
    order: str = Query(default="desc", pattern="^(asc|desc)$"),
) -> Dict[str, Any]:
    """
    Queue Intel: lê odds persistidas (último snapshot por evento), calcula:
      - P_market (no-vig)
      - P_model (quando possível)
      - EV e edge
    e ordena por uma métrica simples.

    NÃO chama provider externo. Apenas DB + modelo local.

    Atualização: persiste um snapshot em odds.audit_predictions quando houver P_model.
    """

    now_utc = datetime.now(timezone.utc)
    end_utc = now_utc + timedelta(hours=hours_ahead)

    conf_clause = "TRUE"
    if min_confidence == "EXACT":
        conf_clause = "e.match_confidence = 'EXACT'"
    elif min_confidence == "ILIKE":
        conf_clause = "e.match_confidence IN ('ILIKE','EXACT')"

    sql = f"""
      WITH latest AS (
        SELECT DISTINCT ON (s.event_id)
          s.event_id,
          s.bookmaker,
          s.market,
          s.odds_home,
          s.odds_draw,
          s.odds_away,
          s.captured_at_utc
        FROM odds.odds_snapshots_1x2 s
        ORDER BY s.event_id, s.captured_at_utc DESC
      )
      SELECT
        e.event_id,
        e.sport_key,
        e.commence_time_utc,
        e.home_name,
        e.away_name,
        e.resolved_home_team_id,
        e.resolved_away_team_id,
        e.resolved_fixture_id,
        e.match_confidence,
        l.bookmaker,
        l.market,
        l.odds_home,
        l.odds_draw,
        l.odds_away,
        l.captured_at_utc,
        EXTRACT(EPOCH FROM (now() - l.captured_at_utc))::int AS freshness_seconds
      FROM odds.odds_events e
      JOIN latest l ON l.event_id = e.event_id
      WHERE ((%(sport_key)s)::text IS NULL OR e.sport_key = (%(sport_key)s)::text)
        AND (e.commence_time_utc IS NULL OR (e.commence_time_utc >= now() AND e.commence_time_utc <= (%(end)s)::timestamptz))
        AND ({conf_clause})
      ORDER BY
        e.commence_time_utc ASC NULLS LAST,
        l.captured_at_utc DESC
      LIMIT %(limit)s
    """
    params = {"sport_key": sport_key, "end": end_utc, "limit": limit}

    try:
        with pg_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(sql, params)
                rows = cur.fetchall()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    items: List[Dict[str, Any]] = []
    counters = {
        "total": 0,
        "ok_model": 0,
        "missing_team": 0,
        "model_error": 0,
    }
    runtime_counts = _empty_runtime_counts()

    matchup_snapshots_error_msg: Optional[str] = None

    for (
        event_id,
        sport_key_db,
        commence_time_utc,
        home_name,
        away_name,
        resolved_home_team_id,
        resolved_away_team_id,
        resolved_fixture_id,
        match_confidence,
        bookmaker,
        market,
        odds_home,
        odds_draw,
        odds_away,
        captured_at_utc,
        freshness_seconds,
    ) in rows:
        counters["total"] += 1

        kickoff_iso = (
            commence_time_utc.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
            if commence_time_utc else None
        )
        captured_iso = (
            captured_at_utc.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
            if captured_at_utc else None
        )

        oh = float(odds_home) if odds_home is not None else None
        od = float(odds_draw) if odds_draw is not None else None
        oa = float(odds_away) if odds_away is not None else None

        market_probs = _market_probs_from_odds(oh, od, oa)
        p_mkt = market_probs.get("novig")

        home_id = int(resolved_home_team_id) if resolved_home_team_id is not None else None
        away_id = int(resolved_away_team_id) if resolved_away_team_id is not None else None

        fixture_id = int(resolved_fixture_id) if resolved_fixture_id is not None else None

        league_id = int(assume_league_id) if assume_league_id else None
        season = int(assume_season) if assume_season else None

        model_block: Optional[Dict[str, Any]] = None
        status = "ok"
        reason = None
        persist_error: Optional[str] = None

        if not home_id or not away_id:
            status = "incomplete"
            reason = "missing_team_id"
            counters["missing_team"] += 1
        else:
            try:
                pred = predict_1x2_from_artifact(
                    artifact_filename=artifact_filename,
                    league_id=league_id,
                    season=season,
                    home_team_id=home_id,
                    away_team_id=away_id,
                )
                p_model = pred["probs"]

                match_stats_mode = _read_match_stats_mode_from_pred(pred)
                model_status = "OK_FALLBACK" if match_stats_mode in ("partial_fallback", "full_fallback") else "OK_EXACT"

                edge = None
                if p_mkt:
                    edge = {
                        "H": (p_model["H"] - (p_mkt["H"] or 0.0)) if p_mkt.get("H") is not None else None,
                        "D": (p_model["D"] - (p_mkt["D"] or 0.0)) if p_mkt.get("D") is not None else None,
                        "A": (p_model["A"] - (p_mkt["A"] or 0.0)) if p_mkt.get("A") is not None else None,
                    }

                evv = {
                    "H": (p_model["H"] * oh - 1.0) if oh else None,
                    "D": (p_model["D"] * od - 1.0) if od else None,
                    "A": (p_model["A"] * oa - 1.0) if oa else None,
                }

                best_ev = None
                best_side = None
                for side in ("H", "D", "A"):
                    v = evv.get(side)
                    if v is None:
                        continue
                    if best_ev is None or v > best_ev:
                        best_ev = v
                        best_side = side

                model_block = {
                    "artifact_filename": artifact_filename,
                    "league_id": league_id,
                    "season": season,
                    "probs_model": p_model,
                    "edge_vs_market": edge,
                    "ev_decimal": evv,
                    "best_ev": best_ev,
                    "best_side": best_side,
                    "artifact_meta": pred.get("artifact"),
                    "runtime": pred.get("runtime"),
                    "model_status": model_status,
                }
                counters["ok_model"] += 1

                if model_status == "OK_FALLBACK":
                    runtime_counts["ok_fallback"] += 1
                else:
                    runtime_counts["ok_exact"] += 1

                try:
                    with pg_conn() as conn:
                        _audit_insert_prediction(
                            conn,
                            event_id=str(event_id),
                            sport_key=str(sport_key_db),
                            kickoff_utc=kickoff_iso,
                            captured_at_utc=captured_iso,
                            bookmaker=(str(bookmaker) if bookmaker is not None else None),
                            market=(str(market) if market is not None else None),
                            league_id=league_id,
                            season=season,
                            fixture_id=fixture_id,
                            home_team_id=home_id,
                            away_team_id=away_id,
                            artifact_filename=artifact_filename,
                            odds_h=oh,
                            odds_d=od,
                            odds_a=oa,
                            p_mkt=p_mkt,
                            p_model=p_model,
                            best_side=best_side,
                            best_ev=best_ev,
                            status="ok",
                            reason=None,
                            match_confidence=match_confidence,
                        )
                        conn.commit()
                except Exception as pe:
                    persist_error = str(pe)

            except Exception as e:
                err_msg = str(e)
                classified_reason = _classify_model_runtime_error(err_msg)

                status = "incomplete"
                reason = classified_reason
                counters["model_error"] += 1

                if classified_reason == "MISSING_TEAM_STATS_SAME_LEAGUE":
                    runtime_counts["missing_same_league"] += 1
                elif classified_reason == "MISSING_TEAM_STATS_EXACT":
                    runtime_counts["missing_exact"] += 1
                else:
                    runtime_counts["other_model_error"] += 1

                model_block = {
                    "error": err_msg,
                    "model_status": classified_reason,
                }

                try:
                    with pg_conn() as conn:
                        _audit_insert_prediction(
                            conn,
                            event_id=str(event_id),
                            sport_key=str(sport_key_db),
                            kickoff_utc=kickoff_iso,
                            captured_at_utc=captured_iso,
                            bookmaker=(str(bookmaker) if bookmaker is not None else None),
                            market=(str(market) if market is not None else None),
                            league_id=league_id,
                            season=season,
                            fixture_id=fixture_id,
                            home_team_id=home_id,
                            away_team_id=away_id,
                            artifact_filename=artifact_filename,
                            odds_h=oh,
                            odds_d=od,
                            odds_a=oa,
                            p_mkt=p_mkt,
                            p_model=None,
                            best_side=None,
                            best_ev=None,
                            status="incomplete",
                            reason=reason,
                            match_confidence=match_confidence,
                        )
                        conn.commit()
                except Exception as pe:
                    persist_error = str(pe)

        item = {
            "event_id": event_id,
            "sport_key": sport_key_db,
            "kickoff_utc": kickoff_iso,
            "home_name": home_name,
            "away_name": away_name,
            "resolved": {
                "home_team_id": home_id,
                "away_team_id": away_id,
                "fixture_id": fixture_id,
                "match_confidence": match_confidence,
            },
            "latest_snapshot": {
                "bookmaker": bookmaker,
                "market": market,
                "odds_1x2": {"H": oh, "D": od, "A": oa},
                "captured_at_utc": captured_iso,
                "freshness_seconds": int(freshness_seconds) if freshness_seconds is not None else None,
            },
            "market_probs": market_probs,
            "model": model_block,
            "status": status,
            "reason": reason,
            "persist_error": persist_error,
        }
        items.append(item)

    def _key(it: Dict[str, Any]):
        if sort == "kickoff":
            return it.get("kickoff_utc") or ""
        if sort == "freshness":
            fs = (it.get("latest_snapshot") or {}).get("freshness_seconds")
            return fs if fs is not None else 10**9

        m = it.get("model") or {}
        edge = (m.get("edge_vs_market") or {})
        evd = (m.get("ev_decimal") or {})

        if sort == "best_ev":
            v = m.get("best_ev")
            return v if v is not None else -10**9

        if sort == "ev_h":
            v = evd.get("H")
            return v if v is not None else -10**9
        if sort == "ev_d":
            v = evd.get("D")
            return v if v is not None else -10**9
        if sort == "ev_a":
            v = evd.get("A")
            return v if v is not None else -10**9

        if sort == "edge_h":
            v = edge.get("H")
            return v if v is not None else -10**9
        if sort == "edge_d":
            v = edge.get("D")
            return v if v is not None else -10**9
        if sort == "edge_a":
            v = edge.get("A")
            return v if v is not None else -10**9

        return -10**9

    reverse = (order.lower() == "desc")
    items.sort(key=_key, reverse=reverse)

    return {
        "meta": {
            "sport_key": sport_key,
            "hours_ahead": hours_ahead,
            "min_confidence": min_confidence,
            "limit": limit,
            "artifact_filename": artifact_filename,
            "assume_league_id": assume_league_id,
            "assume_season": assume_season,
            "sort": sort,
            "order": order,
            "counts": counters,
            "runtime_counts": runtime_counts,
            "coverage": {
                "ok_total_pct": _coverage_pct(counters["ok_model"], counters["total"]),
                "ok_exact_pct": _coverage_pct(runtime_counts["ok_exact"], counters["total"]),
                "ok_fallback_pct": _coverage_pct(runtime_counts["ok_fallback"], counters["total"]),
                "missing_team_pct": _coverage_pct(counters["missing_team"], counters["total"]),
                "missing_same_league_pct": _coverage_pct(runtime_counts["missing_same_league"], counters["total"]),
                "model_error_pct": _coverage_pct(counters["model_error"], counters["total"]),
            },
        },
        "items": items,
    }



# ---------------------------
# AUDITORIA DO MODELO (comparacao com o real)
# ---------------------------

import math


def _fixture_outcome_1x2(home_goals: int, away_goals: int) -> str:
    if home_goals > away_goals:
        return "H"
    if home_goals < away_goals:
        return "A"
    return "D"


def _brier_1x2(probs: Dict[str, float], outcome: str) -> float:
    o_h = 1.0 if outcome == "H" else 0.0
    o_d = 1.0 if outcome == "D" else 0.0
    o_a = 1.0 if outcome == "A" else 0.0
    p_h = float(probs.get("H", 0.0) or 0.0)
    p_d = float(probs.get("D", 0.0) or 0.0)
    p_a = float(probs.get("A", 0.0) or 0.0)
    return (p_h - o_h) ** 2 + (p_d - o_d) ** 2 + (p_a - o_a) ** 2


def _logloss_1x2(probs: Dict[str, float], outcome: str, eps: float = 1e-15) -> float:
    p = float(probs.get(outcome, 0.0) or 0.0)
    if p < eps:
        p = eps
    if p > 1.0 - eps:
        p = 1.0 - eps
    return -math.log(p)


def _top1_acc_1x2(probs: Dict[str, float], outcome: str) -> float:
    if not probs:
        return 0.0
    best = max(probs.keys(), key=lambda k: float(probs.get(k, 0.0) or 0.0))
    return 1.0 if best == outcome else 0.0


def _audit_upsert_fixture_prediction(
    conn,
    *,
    fixture_id: int,
    league_id: int,
    season: int,
    kickoff_utc: datetime,
    home_team_id: int,
    away_team_id: int,
    artifact_filename: str,
    probs_model: Dict[str, float],
) -> None:
    # Persistencia minima para auditoria retroativa (fixture-level).
    # Requer tabela odds.audit_fixture_predictions (ver DDL sugerido abaixo).
    sql = """
      INSERT INTO odds.audit_fixture_predictions (
        fixture_id,
        league_id,
        season,
        kickoff_utc,
        home_team_id,
        away_team_id,
        artifact_filename,
        p_model_h,
        p_model_d,
        p_model_a,
        created_at_utc,
        updated_at_utc
      )
      VALUES (
        %(fixture_id)s,
        %(league_id)s,
        %(season)s,
        %(kickoff_utc)s,
        %(home_team_id)s,
        %(away_team_id)s,
        %(artifact_filename)s,
        %(p_model_h)s,
        %(p_model_d)s,
        %(p_model_a)s,
        now(),
        now()
      )
      ON CONFLICT (fixture_id, artifact_filename)
      DO UPDATE SET
        p_model_h = EXCLUDED.p_model_h,
        p_model_d = EXCLUDED.p_model_d,
        p_model_a = EXCLUDED.p_model_a,
        updated_at_utc = now()
    """

    params = {
        "fixture_id": int(fixture_id),
        "league_id": int(league_id),
        "season": int(season),
        "kickoff_utc": kickoff_utc,
        "home_team_id": int(home_team_id),
        "away_team_id": int(away_team_id),
        "artifact_filename": artifact_filename,
        "p_model_h": float(probs_model.get("H", 0.0) or 0.0),
        "p_model_d": float(probs_model.get("D", 0.0) or 0.0),
        "p_model_a": float(probs_model.get("A", 0.0) or 0.0),
    }

    with conn.cursor() as cur:
        cur.execute(sql, params)


@router.post("/audit/backfill/fixtures")
def admin_odds_audit_backfill_fixtures(
    league_id: int = Query(..., ge=1),
    season: int = Query(..., ge=1900, le=2100),
    artifact_filename: str = Query(default=DEFAULT_EPL_ARTIFACT),
    # opcional: limitar por janela temporal
    from_kickoff_utc: Optional[str] = Query(default=None, description="ISO8601 em UTC, ex: 2026-01-01T00:00:00Z"),
    to_kickoff_utc: Optional[str] = Query(default=None, description="ISO8601 em UTC, ex: 2026-02-01T00:00:00Z"),
    limit: int = Query(default=5000, ge=1, le=50000),
) -> Dict[str, Any]:
    """
    Gera predictions retroativas para fixtures ja existentes (e ja finalizadas) no core.fixtures.

    Objetivo: ter uma base objetiva de confiabilidade do modelo por temporada.

    Importante:
    - Nao usa Odds (mercado) aqui.
    - Persiste em odds.audit_fixture_predictions.
    """

    def _parse_iso(s: Optional[str]) -> Optional[datetime]:
        if not s:
            return None
        return datetime.fromisoformat(s.replace("Z", "+00:00")).astimezone(timezone.utc)

    t_from = _parse_iso(from_kickoff_utc)
    t_to = _parse_iso(to_kickoff_utc)

    sql = """
      SELECT
        fixture_id,
        kickoff_utc,
        home_team_id,
        away_team_id
      FROM core.fixtures
      WHERE league_id = %(league_id)s
        AND season = %(season)s
        AND is_finished = TRUE
        AND goals_home IS NOT NULL
        AND goals_away IS NOT NULL
        AND (%(t_from)s IS NULL OR kickoff_utc >= %(t_from)s)
        AND (%(t_to)s IS NULL OR kickoff_utc <= %(t_to)s)
      ORDER BY kickoff_utc ASC
      LIMIT %(limit)s
    """

    with pg_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                sql,
                {
                    "league_id": league_id,
                    "season": season,
                    "t_from": t_from,
                    "t_to": t_to,
                    "limit": limit,
                },
            )
            rows = cur.fetchall()

        n_total = 0
        n_ok = 0
        n_err = 0
        last_err: Optional[str] = None

        for fixture_id, kickoff_db, home_id, away_id in rows:
            n_total += 1
            try:
                pred = predict_1x2_from_artifact(
                    artifact_filename=artifact_filename,
                    league_id=int(league_id),
                    season=int(season),
                    home_team_id=int(home_id),
                    away_team_id=int(away_id),
                )

                probs = pred.get("probs") or {}
                _audit_upsert_fixture_prediction(
                    conn,
                    fixture_id=int(fixture_id),
                    league_id=int(league_id),
                    season=int(season),
                    kickoff_utc=kickoff_db.astimezone(timezone.utc),
                    home_team_id=int(home_id),
                    away_team_id=int(away_id),
                    artifact_filename=artifact_filename,
                    probs_model=probs,
                )
                n_ok += 1
            except Exception as e:
                n_err += 1
                last_err = str(e)

        conn.commit()

    return {
        "meta": {
            "league_id": league_id,
            "season": season,
            "artifact_filename": artifact_filename,
            "from_kickoff_utc": from_kickoff_utc,
            "to_kickoff_utc": to_kickoff_utc,
            "limit": limit,
        },
        "counts": {"total": n_total, "ok": n_ok, "errors": n_err, "last_error": last_err},
    }


@router.post("/audit/refresh/results")
def admin_odds_audit_refresh_results(
    league_id: int = Query(..., ge=1),
    season: int = Query(..., ge=1900, le=2100),
    artifact_filename: str = Query(default=DEFAULT_EPL_ARTIFACT),
    limit: int = Query(default=20000, ge=1, le=50000),
) -> Dict[str, Any]:
    """
    Atualiza audit_fixture_predictions com resultado real (gols / outcome) e scores (brier/logloss/top1_acc).

    Requer que audit_fixture_predictions ja tenha sido preenchida.
    """

    sql = """
      SELECT
        a.fixture_id,
        a.p_model_h,
        a.p_model_d,
        a.p_model_a,
        f.goals_home,
        f.goals_away
      FROM odds.audit_fixture_predictions a
      JOIN core.fixtures f ON f.fixture_id = a.fixture_id
      WHERE a.league_id = %(league_id)s
        AND a.season = %(season)s
        AND a.artifact_filename = %(artifact_filename)s
        AND f.is_finished = TRUE
        AND f.goals_home IS NOT NULL
        AND f.goals_away IS NOT NULL
      ORDER BY f.kickoff_utc ASC
      LIMIT %(limit)s
    """

    upd = """
      UPDATE odds.audit_fixture_predictions
      SET
        goals_home = %(goals_home)s,
        goals_away = %(goals_away)s,
        outcome = %(outcome)s,
        brier = %(brier)s,
        logloss = %(logloss)s,
        top1_acc = %(top1_acc)s,
        updated_at_utc = now()
      WHERE fixture_id = %(fixture_id)s
        AND artifact_filename = %(artifact_filename)s
    """

    n_total = 0
    n_updated = 0

    with pg_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                sql,
                {
                    "league_id": league_id,
                    "season": season,
                    "artifact_filename": artifact_filename,
                    "limit": limit,
                },
            )
            rows = cur.fetchall()

            for fixture_id, p_h, p_d, p_a, gh, ga in rows:
                n_total += 1
                probs = {"H": float(p_h or 0.0), "D": float(p_d or 0.0), "A": float(p_a or 0.0)}
                outcome = _fixture_outcome_1x2(int(gh), int(ga))
                brier = _brier_1x2(probs, outcome)
                logloss = _logloss_1x2(probs, outcome)
                top1 = _top1_acc_1x2(probs, outcome)

                cur.execute(
                    upd,
                    {
                        "fixture_id": int(fixture_id),
                        "artifact_filename": artifact_filename,
                        "goals_home": int(gh),
                        "goals_away": int(ga),
                        "outcome": outcome,
                        "brier": float(brier),
                        "logloss": float(logloss),
                        "top1_acc": float(top1),
                    },
                )
                n_updated += 1

        conn.commit()

    return {
        "meta": {"league_id": league_id, "season": season, "artifact_filename": artifact_filename, "limit": limit},
        "counts": {"scanned": n_total, "updated": n_updated},
    }


@router.get("/audit/metrics/summary")
def admin_odds_audit_metrics_summary(
    league_id: int = Query(..., ge=1),
    season: int = Query(..., ge=1900, le=2100),
    artifact_filename: str = Query(default=DEFAULT_EPL_ARTIFACT),
) -> Dict[str, Any]:
    """
    Agregado simples da auditoria (base para KPI no Admin).
    """

    sql = """
      SELECT
        COUNT(*) AS n,
        AVG(brier) AS brier_avg,
        AVG(logloss) AS logloss_avg,
        AVG(top1_acc) AS top1_acc_avg,
        MIN(kickoff_utc) AS kickoff_min,
        MAX(kickoff_utc) AS kickoff_max
      FROM odds.audit_fixture_predictions
      WHERE league_id = %(league_id)s
        AND season = %(season)s
        AND artifact_filename = %(artifact_filename)s
        AND outcome IS NOT NULL
    """

    with pg_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                sql,
                {"league_id": league_id, "season": season, "artifact_filename": artifact_filename},
            )
            row = cur.fetchone()

    if not row:
        return {
            "meta": {"league_id": league_id, "season": season, "artifact_filename": artifact_filename},
            "metrics": None,
        }

    n, brier_avg, logloss_avg, top1_acc_avg, kmin, kmax = row

    return {
        "meta": {"league_id": league_id, "season": season, "artifact_filename": artifact_filename},
        "metrics": {
            "n": int(n or 0),
            "brier_avg": float(brier_avg) if brier_avg is not None else None,
            "logloss_avg": float(logloss_avg) if logloss_avg is not None else None,
            "top1_acc_avg": float(top1_acc_avg) if top1_acc_avg is not None else None,
            "kickoff_min_utc": kmin.astimezone(timezone.utc).isoformat().replace("+00:00", "Z") if kmin else None,
            "kickoff_max_utc": kmax.astimezone(timezone.utc).isoformat().replace("+00:00", "Z") if kmax else None,
        },
    }

# compat: app.py costuma importar "admin_odds_router"
admin_odds_router = router
 
import math
from datetime import datetime, timezone, timedelta

def _outcome_from_goals(gh: int, ga: int) -> str:
    if gh > ga:
        return "H"
    if gh < ga:
        return "A"
    return "D"

def _brier_1x2(p: dict, outcome: str) -> float:
    y = {"H": 0.0, "D": 0.0, "A": 0.0}
    y[outcome] = 1.0
    return (p["H"] - y["H"])**2 + (p["D"] - y["D"])**2 + (p["A"] - y["A"])**2

def _logloss_1x2(p: dict, outcome: str, eps: float = 1e-15) -> float:
    prob = max(eps, min(1.0 - eps, float(p[outcome])))
    return -math.log(prob)

def _top1_acc_1x2(p: dict, outcome: str) -> float:
    top = max(("H", "D", "A"), key=lambda k: float(p[k]))
    return 1.0 if top == outcome else 0.0

@router.post("/audit/snapshot")
def admin_odds_audit_snapshot(
    sport_key: str = Query(..., description="Ex: soccer_epl"),
    hours_back: int = Query(default=168, ge=0, le=720),

    min_confidence: str = Query(default="EXACT", pattern="^(NONE|ILIKE|EXACT)$"),
    artifact_filename: str = Query(default=DEFAULT_EPL_ARTIFACT),
    assume_league_id: int = Query(default=39, ge=1),
    assume_season: int = Query(default=2024, ge=1900, le=2100),
    limit: int = Query(default=200, ge=1, le=1000),
) -> dict:
    """
    Cria/atualiza snapshots do modelo para os próximos jogos (baseado em odds persistidas).
    Não busca provider externo. Apenas DB + modelo local.
    """

    # janela: passado recente (auditoria)
    if hours_back > 720:
        hours_back = 720

    now_utc = datetime.now(timezone.utc)
    start_utc = now_utc - timedelta(hours=int(hours_back))
    end_utc = now_utc

    sql = """
      SELECT
        e.event_id,
        e.sport_key,
        e.kickoff_utc,
        e.home_name,
        e.away_name,
        e.fixture_id,
        e.confidence,
        e.updated_at_utc
      FROM odds.odds_events e
      WHERE e.sport_key = %(sport_key)s
        AND e.kickoff_utc >= %(start)s
        AND e.kickoff_utc <= %(end)s
      ORDER BY e.kickoff_utc DESC
      LIMIT %(limit)s
    """

    with pg_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, {"sport_key": sport_key, "start": start_utc, "end": end_utc, "limit": int(limit)})
            rows = cur.fetchall()

    inserted = 0
    skipped = 0
    errors = 0

    with pg_conn() as conn:
        with conn.cursor() as cur:
            for (
                event_id,
                commence_time_utc,
                home_id,
                away_id,
                match_confidence_db,
                bookmaker,
                market,
                odds_home,
                odds_draw,
                odds_away,
                captured_at_utc,
            ) in rows:
                if not home_id or not away_id:
                    skipped += 1
                    continue

                try:
                    pred = predict_1x2_from_artifact(
                        artifact_filename=artifact_filename,
                        league_id=int(assume_league_id),
                        season=int(assume_season),
                        home_team_id=int(home_id),
                        away_team_id=int(away_id),
                    )
                    p = pred["probs"]

                    upsert = """
                      INSERT INTO odds.audit_event_predictions (
                        event_id, artifact_filename, league_id, season,
                        home_team_id, away_team_id, kickoff_utc,
                        bookmaker, market, odds_home, odds_draw, odds_away, captured_at_utc,
                        p_model_h, p_model_d, p_model_a,
                        updated_at_utc
                      )
                      VALUES (
                        %(event_id)s, %(artifact_filename)s, %(league_id)s, %(season)s,
                        %(home_team_id)s, %(away_team_id)s, %(kickoff_utc)s,
                        %(bookmaker)s, %(market)s, %(odds_home)s, %(odds_draw)s, %(odds_away)s, %(captured_at_utc)s,
                        %(p_model_h)s, %(p_model_d)s, %(p_model_a)s,
                        now()
                      )
                      ON CONFLICT (event_id, artifact_filename) DO UPDATE SET
                        league_id = EXCLUDED.league_id,
                        season = EXCLUDED.season,
                        home_team_id = EXCLUDED.home_team_id,
                        away_team_id = EXCLUDED.away_team_id,
                        kickoff_utc = EXCLUDED.kickoff_utc,
                        bookmaker = EXCLUDED.bookmaker,
                        market = EXCLUDED.market,
                        odds_home = EXCLUDED.odds_home,
                        odds_draw = EXCLUDED.odds_draw,
                        odds_away = EXCLUDED.odds_away,
                        captured_at_utc = EXCLUDED.captured_at_utc,
                        p_model_h = EXCLUDED.p_model_h,
                        p_model_d = EXCLUDED.p_model_d,
                        p_model_a = EXCLUDED.p_model_a,
                        updated_at_utc = now()
                    """

                    cur.execute(
                        upsert,
                        {
                            "event_id": event_id,
                            "artifact_filename": artifact_filename,
                            "league_id": int(assume_league_id),
                            "season": int(assume_season),
                            "home_team_id": int(home_id),
                            "away_team_id": int(away_id),
                            "kickoff_utc": commence_time_utc,
                            "bookmaker": bookmaker,
                            "market": market,
                            "odds_home": odds_home,
                            "odds_draw": odds_draw,
                            "odds_away": odds_away,
                            "captured_at_utc": captured_at_utc,
                            "p_model_h": float(p["H"]),
                            "p_model_d": float(p["D"]),
                            "p_model_a": float(p["A"]),
                        },
                    )
                    inserted += 1
                except Exception:
                    errors += 1

        conn.commit()

    return {
        "ok": True,
        "sport_key": sport_key,
        "artifact_filename": artifact_filename,
        "assume_league_id": assume_league_id,
        "assume_season": assume_season,
        "window_hours": hours_ahead,
        "counts": {"processed": len(rows), "upserted": inserted, "skipped": skipped, "errors": errors},
    }

@router.post("/audit/refresh_results")
def admin_odds_audit_refresh_results(
    league_id: int = Query(default=39, ge=1),
    season: int = Query(default=2024, ge=1900, le=2100),
    artifact_filename: str = Query(default=DEFAULT_EPL_ARTIFACT),
    days_back: int = Query(default=30, ge=1, le=365),
    limit: int = Query(default=20000, ge=1, le=50000),
) -> dict:
    """
    Procura fixtures finalizados no core.fixtures e atualiza audit_event_predictions
    (resultado + métricas) quando encontrar fixture_id compatível.
    """

    now_utc = datetime.now(timezone.utc)
    t_from = now_utc - timedelta(days=days_back)

    # 1) pega fixtures finalizados recentes
    fx_sql = """
      SELECT
        fixture_id,
        kickoff_utc,
        home_team_id,
        away_team_id,
        goals_home,
        goals_away
      FROM core.fixtures
      WHERE league_id = %(league_id)s
        AND season = %(season)s
        AND is_finished = TRUE
        AND goals_home IS NOT NULL
        AND goals_away IS NOT NULL
        AND kickoff_utc >= %(t_from)s
      ORDER BY kickoff_utc ASC
      LIMIT %(limit)s
    """

    fixtures = []
    with pg_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(fx_sql, {"league_id": league_id, "season": season, "t_from": t_from, "limit": limit})
            fixtures = cur.fetchall()

    updated = 0
    matched = 0

    # 2) para cada fixture, tenta achar snapshot por (home_id, away_id, kickoff próximo)
    #    (janela de 6h para tolerar timezone/diferença do provider)
    find_sql = """
      SELECT audit_id, p_model_h, p_model_d, p_model_a
      FROM odds.audit_event_predictions
      WHERE artifact_filename = %(artifact_filename)s
        AND league_id = %(league_id)s
        AND season = %(season)s
        AND home_team_id = %(home_id)s
        AND away_team_id = %(away_id)s
        AND kickoff_utc BETWEEN (%(k)s::timestamptz - interval '6 hours') AND (%(k)s::timestamptz + interval '6 hours')
      ORDER BY ABS(EXTRACT(EPOCH FROM (kickoff_utc - %(k)s::timestamptz))) ASC
      LIMIT 1
    """

    upd_sql = """
      UPDATE odds.audit_event_predictions
      SET
        fixture_id = %(fixture_id)s,
        goals_home = %(gh)s,
        goals_away = %(ga)s,
        outcome = %(outcome)s,
        brier = %(brier)s,
        logloss = %(logloss)s,
        top1_acc = %(top1_acc)s,
        updated_at_utc = now()
      WHERE audit_id = %(audit_id)s
    """

    with pg_conn() as conn:
        with conn.cursor() as cur:
            for (fixture_id, kickoff_utc, home_id, away_id, gh, ga) in fixtures:
                cur.execute(
                    find_sql,
                    {
                        "artifact_filename": artifact_filename,
                        "league_id": league_id,
                        "season": season,
                        "home_id": int(home_id),
                        "away_id": int(away_id),
                        "k": kickoff_utc,
                    },
                )
                row = cur.fetchone()
                if not row:
                    continue

                matched += 1
                audit_id, p_h, p_d, p_a = row

                outcome = _outcome_from_goals(int(gh), int(ga))
                p = {"H": float(p_h), "D": float(p_d), "A": float(p_a)}

                cur.execute(
                    upd_sql,
                    {
                        "audit_id": int(audit_id),
                        "fixture_id": int(fixture_id),
                        "gh": int(gh),
                        "ga": int(ga),
                        "outcome": outcome,
                        "brier": float(_brier_1x2(p, outcome)),
                        "logloss": float(_logloss_1x2(p, outcome)),
                        "top1_acc": float(_top1_acc_1x2(p, outcome)),
                    },
                )
                updated += 1

        conn.commit()

    return {
        "ok": True,
        "league_id": league_id,
        "season": season,
        "artifact_filename": artifact_filename,
        "days_back": days_back,
        "counts": {"fixtures_checked": len(fixtures), "matched": matched, "updated": updated},
    }

@router.get("/upcoming/intel_live")
def admin_odds_upcoming_intel_live(
    sport_key: str = Query(...),
    regions: str = Query(default="eu"),
    limit: int = Query(default=200, ge=1, le=500),
    assume_league_id: int = Query(default=39, ge=1),
    assume_season: int = Query(default=2025, ge=1900, le=2100),
    artifact_filename: str = Query(default=DEFAULT_EPL_ARTIFACT),
) -> Dict[str, Any]:
    """
    Intel LIVE: chama o orquestrador (provider) e calcula intel sem persistir no DB.
    Ideal para UI/produto enquanto auditoria/persistência não está 100%.
    """

    items = admin_odds_upcoming_orchestrate(
        sport_key=sport_key,
        regions=regions,
        limit=limit,
        artifact_filename=None,
        assume_league_id=assume_league_id,
        assume_season=assume_season,
    )

    out: List[Dict[str, Any]] = []
    counts = {
        "total": 0,
        "resolved_ok": 0,
        "ok_model": 0,
        "missing_team": 0,
        "model_error": 0,
    }
    runtime_counts = _empty_runtime_counts()

    for it in items:
        counts["total"] += 1

        resolve = it.get("resolve") or {}
        ok_resolve = bool(resolve.get("ok"))
        if ok_resolve:
            counts["resolved_ok"] += 1

        model_block = None
        status = "ok"
        reason = None

        if not ok_resolve:
            status = "incomplete"
            reason = "missing_team_id_or_fixture_hint"
            counts["missing_team"] += 1
        else:
            try:
                home_id = (resolve.get("home") or {}).get("team_id")
                away_id = (resolve.get("away") or {}).get("team_id")

                if not home_id or not away_id:
                    status = "incomplete"
                    reason = "missing_team_id"
                    counts["missing_team"] += 1
                else:
                    oh = (it.get("odds_1x2") or {}).get("H")
                    od = (it.get("odds_1x2") or {}).get("D")
                    oa = (it.get("odds_1x2") or {}).get("A")

                    fixture_hint = it.get("fixture_hint") or {}
                    league_id = fixture_hint.get("league_id") or int(assume_league_id)
                    season = fixture_hint.get("season") or int(assume_season)

                    pred = predict_1x2_from_artifact(
                        artifact_filename=artifact_filename,
                        league_id=int(league_id),
                        season=int(season),
                        home_team_id=int(home_id),
                        away_team_id=int(away_id),
                    )
                    p_model = pred["probs"]

                    match_stats_mode = _read_match_stats_mode_from_pred(pred)
                    model_status = "OK_FALLBACK" if match_stats_mode in ("partial_fallback", "full_fallback") else "OK_EXACT"

                    p_mkt = ((it.get("market_probs") or {}).get("novig")) or None
                    edge = None
                    if p_mkt:
                        edge = {
                            "H": p_model["H"] - (p_mkt.get("H") or 0.0) if p_mkt.get("H") is not None else None,
                            "D": p_model["D"] - (p_mkt.get("D") or 0.0) if p_mkt.get("D") is not None else None,
                            "A": p_model["A"] - (p_mkt.get("A") or 0.0) if p_mkt.get("A") is not None else None,
                        }

                    evv = {
                        "H": (p_model["H"] * float(oh) - 1.0) if oh else None,
                        "D": (p_model["D"] * float(od) - 1.0) if od else None,
                        "A": (p_model["A"] * float(oa) - 1.0) if oa else None,
                    }

                    best_ev = None
                    best_side = None
                    for side in ("H", "D", "A"):
                        v = evv.get(side)
                        if v is None:
                            continue
                        if best_ev is None or v > best_ev:
                            best_ev = v
                            best_side = side

                    model_block = {
                        "artifact_filename": artifact_filename,
                        "league_id": int(league_id),
                        "season": int(season),
                        "probs_model": p_model,
                        "edge_vs_market": edge,
                        "ev_decimal": evv,
                        "best_ev": best_ev,
                        "best_side": best_side,
                        "artifact_meta": pred.get("artifact"),
                        "runtime": pred.get("runtime"),
                        "model_status": model_status,
                    }
                    counts["ok_model"] += 1

                    if model_status == "OK_FALLBACK":
                        runtime_counts["ok_fallback"] += 1
                    else:
                        runtime_counts["ok_exact"] += 1

            except Exception as e:
                err_msg = str(e)
                classified_reason = _classify_model_runtime_error(err_msg)

                status = "incomplete"
                reason = classified_reason
                counts["model_error"] += 1

                if classified_reason == "MISSING_TEAM_STATS_SAME_LEAGUE":
                    runtime_counts["missing_same_league"] += 1
                elif classified_reason == "MISSING_TEAM_STATS_EXACT":
                    runtime_counts["missing_exact"] += 1
                else:
                    runtime_counts["other_model_error"] += 1

                model_block = {
                    "error": err_msg,
                    "model_status": classified_reason,
                }

        out.append(
            {
                **it,
                "model": model_block,
                "status": status,
                "reason": reason,
            }
        )

    def _best_ev_key(x: Dict[str, Any]):
        m = x.get("model") or {}
        v = m.get("best_ev")
        return v if v is not None else -10**9

    out.sort(key=_best_ev_key, reverse=True)

    return {
        "meta": {
            "sport_key": sport_key,
            "regions": regions,
            "limit": int(limit),
            "artifact_filename": artifact_filename,
            "assume_league_id": int(assume_league_id),
            "assume_season": int(assume_season),
            "counts": counts,
            "runtime_counts": runtime_counts,
            "coverage": {
                "ok_total_pct": _coverage_pct(counts["ok_model"], counts["total"]),
                "ok_exact_pct": _coverage_pct(runtime_counts["ok_exact"], counts["total"]),
                "ok_fallback_pct": _coverage_pct(runtime_counts["ok_fallback"], counts["total"]),
                "missing_team_pct": _coverage_pct(counts["missing_team"], counts["total"]),
                "missing_same_league_pct": _coverage_pct(runtime_counts["missing_same_league"], counts["total"]),
                "model_error_pct": _coverage_pct(counts["model_error"], counts["total"]),
            },
        },
        "items": out,
    }

import time

@router.post("/matchup_snapshots/rebuild")
def admin_rebuild_matchup_snapshots(
    sport_key: str = Query(..., min_length=2),

    # modo incremental por padrão
    mode: str = Query(default="incremental"),  # incremental | window

    # incremental inputs
    event_ids_csv: str = Query(default=""),    # opcional: "id1,id2,id3"

    # window fallback
    hours_ahead: int = Query(default=720, ge=1, le=24 * 60),
    limit: int = Query(default=200, ge=1, le=2000),

    # versão de modelo (default vem do registry/env)
    model_version: str = Query(default=""),
):
    import time

    # resolve model/calc versions
    mv = (model_version.strip() if model_version.strip() else get_active_model_version())
    cv = get_calc_version()

    t0 = time.time()
    print(f"[SNAPSHOT] start sport_key={sport_key} mode={mode} limit={limit} mv={mv} cv={cv}", flush=True)

    try:
        with pg_conn() as conn:
            conn.autocommit = False

            with conn.cursor() as cur:
                cur.execute("SET LOCAL statement_timeout = '60s'")
                cur.execute("SET LOCAL lock_timeout = '3s'")

            # job_run start
            run_id = start_job_run(
                conn,
                job_name=JOB_PRODUCT_SNAPSHOT_REBUILD_V1,
                scope_key=sport_key,
                model_version=mv,
                calc_version=cv,
            )
            conn.commit()  # garante persistência do run_id

            # Decide event_ids
            event_ids = []
            if event_ids_csv.strip():
                event_ids = [x.strip() for x in event_ids_csv.split(",") if x.strip()]

            if (not event_ids) and mode == "incremental":
                last_ok = get_last_success_finished_at(
                    conn, job_name=JOB_PRODUCT_SNAPSHOT_REBUILD_V1, scope_key=sport_key
                )

                # fallback: se nunca rodou com sucesso, usa janela curta (24h) para iniciar watermark
                if last_ok is None:
                    since = datetime.now(timezone.utc) - timedelta(hours=24)
                else:
                    since = last_ok

                # eventos atualizados no odds_events desde o último rebuild ok
                sql = """
                  SELECT e.event_id
                  FROM odds.odds_events e
                  WHERE e.sport_key = %(sport_key)s
                    AND e.updated_at_utc >= %(since)s
                  ORDER BY e.updated_at_utc ASC
                  LIMIT %(limit)s
                """
                with conn.cursor() as cur:
                    cur.execute(sql, {"sport_key": sport_key, "since": since, "limit": int(limit)})
                    event_ids = [r[0] for r in cur.fetchall()]

            # Rebuild
            t1 = time.time()
            counters = rebuild_matchup_snapshots_v1(
                conn,
                sport_key=sport_key,
                hours_ahead=int(hours_ahead),
                limit=int(limit),
                model_version=mv,
                event_ids=(event_ids if event_ids else None),
            )
            t2 = time.time()

            # Enriquecer counters com meta mínima
            counters = dict(counters or {})
            counters["mode"] = "event_ids" if event_ids else "window"
            counters["event_ids_count"] = int(len(event_ids)) if event_ids else 0
            counters["model_version"] = mv
            counters["calc_version"] = cv
            counters["elapsed_rebuild_sec"] = round(t2 - t1, 3)

            conn.commit()

            # finish job_run ok
            finish_job_run(
                conn,
                run_id=run_id,
                ok=True,
                duration_ms=int(round((time.time() - t0) * 1000)),
                counters=counters,
                error_text=None,
            )
            conn.commit()

            print(f"[SNAPSHOT] done counters={counters}", flush=True)
            return {"ok": True, "sport_key": sport_key, "counters": counters}

    except Exception as e:
        # tentamos persistir falha se possível (best-effort)
        try:
            with pg_conn() as connE:
                connE.autocommit = False
                run_id = start_job_run(
                    connE,
                    job_name=JOB_PRODUCT_SNAPSHOT_REBUILD_V1,
                    scope_key=sport_key,
                    model_version=(model_version.strip() if model_version.strip() else get_active_model_version()),
                    calc_version=get_calc_version(),
                )
                finish_job_run(
                    connE,
                    run_id=run_id,
                    ok=False,
                    duration_ms=int(round((time.time() - t0) * 1000)),
                    counters=None,
                    error_text=f"{type(e).__name__}: {e}",
                )
                connE.commit()
        except Exception:
            pass

        raise HTTPException(status_code=500, detail=f"snapshot_rebuild_failed: {type(e).__name__}: {e}")

def _row_to_dict(cur, row) -> Dict[str, Any]:
    cols = [d[0] for d in cur.description]
    out: Dict[str, Any] = {}

    for i, col in enumerate(cols):
        val = row[i]

        if hasattr(val, "isoformat"):
            out[col] = val.isoformat()
        else:
            out[col] = val

    return out

@router.get("/team_resolution/pending", response_model=TeamResolutionPendingResponse)
def admin_team_resolution_pending(
    sport_key: Optional[str] = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
) -> TeamResolutionPendingResponse:

    sql = """
      SELECT *
      FROM odds.team_name_resolution_queue
      WHERE 1=1
    """

    params: Dict[str, Any] = {}

    if sport_key:
        sql += " AND sport_key = %(sport_key)s"
        params["sport_key"] = sport_key

    sql += " ORDER BY COALESCE(updated_at_utc, created_at_utc) DESC LIMIT %(limit)s"
    params["limit"] = int(limit)

    items: List[TeamResolutionPendingItem] = []

    with pg_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            rows = cur.fetchall()

            for row in rows:
                d = _row_to_dict(cur, row)

                payload = d.get("payload")

                items.append(
                    TeamResolutionPendingItem(
                        sport_key=d.get("sport_key"),
                        raw_name=d.get("raw_name"),
                        normalized_name=d.get("normalized_name"),
                        payload=payload,
                        created_at_utc=d.get("created_at_utc"),
                        updated_at_utc=d.get("updated_at_utc"),
                    )
                )

    return TeamResolutionPendingResponse(ok=True, items=items, count=len(items))

@router.get("/team_resolution/search_teams", response_model=TeamSearchResponse)
def admin_team_resolution_search_teams(
    q: str = Query(..., min_length=2),
    limit: int = Query(default=20, ge=1, le=100),
) -> TeamSearchResponse:

    sql = """
      SELECT team_id, name, country_name
      FROM core.teams
      WHERE name ILIKE %(q)s
      ORDER BY name
      LIMIT %(limit)s
    """

    items: List[TeamSearchItem] = []

    with pg_conn() as conn:
        with conn.cursor() as cur:

            cur.execute(
                sql,
                {"q": f"%{q}%", "limit": int(limit)},
            )

            rows = cur.fetchall()

            for team_id, name, country_name in rows:

                items.append(
                    TeamSearchItem(
                        team_id=int(team_id),
                        name=str(name),
                        country_name=country_name,
                    )
                )

    return TeamSearchResponse(ok=True, items=items, count=len(items))

@router.post("/team_resolution/approve", response_model=TeamResolutionApproveResponse)
def admin_team_resolution_approve(
    body: TeamResolutionApproveRequest = Body(...),
) -> TeamResolutionApproveResponse:
    normalized_name = str(body.normalized_name or _norm_name(body.raw_name))

    with pg_conn() as conn:
        conn.autocommit = False

        # 1) grava alias aprovado
        _upsert_team_alias_auto(
            conn,
            sport_key=str(body.sport_key),
            raw_name=str(body.raw_name),
            normalized_name=normalized_name,
            team_id=int(body.team_id),
            confidence=float(body.confidence),
        )

        # 2) remove da fila
        with conn.cursor() as cur:
            cur.execute(
                """
                DELETE FROM odds.team_name_resolution_queue
                WHERE sport_key = %(sport_key)s
                  AND raw_name = %(raw_name)s
                """,
                {
                    "sport_key": str(body.sport_key),
                    "raw_name": str(body.raw_name),
                },
            )
            removed = int(cur.rowcount or 0)

        # 3) reaplica resolução de team_ids para os odds_events desse sport_key
        team_resolve_counters = resolve_odds_event_team_ids(
            conn,
            sport_key=str(body.sport_key),
            limit=500,
        )

        # 4) rebuild incremental dos snapshots do produto para refletir os team_ids novos
        mv = get_active_model_version()
        snap_counters = rebuild_matchup_snapshots_v1(
            conn,
            sport_key=str(body.sport_key),
            model_version=mv,
        )

        conn.commit()

    return TeamResolutionApproveResponse(
        ok=True,
        sport_key=str(body.sport_key),
        raw_name=str(body.raw_name),
        normalized_name=normalized_name,
        team_id=int(body.team_id),
        removed_from_queue=removed,
        team_resolve_counters=team_resolve_counters,
        snapshot_counters=snap_counters,
    )

@router.post("/team_resolution/dismiss")
def admin_team_resolution_dismiss(
    sport_key: str = Body(...),
    raw_name: str = Body(...),
) -> Dict[str, Any]:

    with pg_conn() as conn:

        conn.autocommit = False

        with conn.cursor() as cur:

            cur.execute(
                """
                DELETE FROM odds.team_name_resolution_queue
                WHERE sport_key = %(sport_key)s
                AND raw_name = %(raw_name)s
                """,
                {
                    "sport_key": sport_key,
                    "raw_name": raw_name,
                },
            )

            removed = int(cur.rowcount or 0)

        conn.commit()

    return {
        "ok": True,
        "removed_from_queue": removed,
    }

@router.get("/markets/totals")
def admin_odds_market_totals(
    sport_key: Optional[str] = Query(default=None),
    hours_ahead: int = Query(default=72, ge=1, le=24 * 60),
    limit: int = Query(default=100, ge=1, le=1000),
) -> Dict[str, Any]:
    """
    Admin-only:
    visão técnica de Totais por jogo, sem tocar no snapshot legado de 1x2.

    Fonte de mercado observada:
      - odds.odds_snapshots_market (market_key in totals/totals_points)

    Fonte de modelo:
      - product.matchup_snapshot_v1.payload -> markets.totals
    """

    sql = """
      WITH latest_market AS (
        SELECT DISTINCT ON (
          s.event_id,
          COALESCE(s.bookmaker, ''),
          s.point,
          lower(s.selection_key)
        )
          s.event_id,
          s.bookmaker,
          s.market_key,
          s.selection_key,
          s.point,
          s.price,
          s.captured_at_utc
        FROM odds.odds_snapshots_market s
        WHERE s.market_key IN ('totals', 'totals_points')
          AND lower(s.selection_key) IN ('over', 'under')
          AND s.point IS NOT NULL
        ORDER BY
          s.event_id,
          COALESCE(s.bookmaker, ''),
          s.point,
          lower(s.selection_key),
          s.captured_at_utc DESC
      ),
      per_line AS (
        SELECT
          lm.event_id,
          lm.point::float8 AS line,
          MAX(CASE WHEN lower(lm.selection_key) = 'over' THEN lm.price END)::float8 AS best_over,
          MAX(CASE WHEN lower(lm.selection_key) = 'under' THEN lm.price END)::float8 AS best_under,
          MAX(lm.captured_at_utc) AS latest_captured_at_utc,
          COUNT(*)::int AS snapshot_count
        FROM latest_market lm
        GROUP BY lm.event_id, lm.point
      ),
      ranked_line AS (
        SELECT
          pl.*,
          ROW_NUMBER() OVER (
            PARTITION BY pl.event_id
            ORDER BY
              CASE
                WHEN pl.best_over IS NOT NULL AND pl.best_under IS NOT NULL THEN 0
                ELSE 1
              END ASC,
              ABS(pl.line - 2.5) ASC,
              pl.latest_captured_at_utc DESC
          ) AS rn
        FROM per_line pl
      ),
      latest_snap_fx AS (
        SELECT DISTINCT ON (s.fixture_id)
          s.fixture_id,
          s.payload
        FROM product.matchup_snapshot_v1 s
        WHERE s.fixture_id IS NOT NULL
        ORDER BY s.fixture_id
      ),
      latest_snap_ev AS (
        SELECT DISTINCT ON (s.event_id)
          s.event_id,
          s.payload
        FROM product.matchup_snapshot_v1 s
        WHERE s.event_id IS NOT NULL
        ORDER BY
          s.event_id,
          (s.fixture_id IS NULL) ASC,
          s.fixture_id DESC NULLS LAST
      )
      SELECT
        e.event_id,
        e.sport_key,
        e.commence_time_utc,
        e.home_name,
        e.away_name,
        e.match_confidence,
        e.resolved_fixture_id,
        rl.line,
        rl.best_over,
        rl.best_under,
        rl.latest_captured_at_utc,
        rl.snapshot_count,
        COALESCE(lsfx.payload, lsev.payload) AS payload
      FROM odds.odds_events e
      LEFT JOIN ranked_line rl
        ON rl.event_id = e.event_id
       AND rl.rn = 1
      LEFT JOIN latest_snap_fx lsfx
        ON lsfx.fixture_id = e.resolved_fixture_id
      LEFT JOIN latest_snap_ev lsev
        ON lsev.event_id = e.event_id
      WHERE ((%(sport_key)s)::text IS NULL OR e.sport_key = (%(sport_key)s)::text)
        AND (
          e.commence_time_utc IS NULL
          OR (
            e.commence_time_utc >= now()
            AND e.commence_time_utc <= (now() + (%(hours_ahead)s || ' hours')::interval)
          )
        )
      ORDER BY e.commence_time_utc ASC NULLS LAST
      LIMIT %(limit)s
    """

    try:
        with pg_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    sql,
                    {
                        "sport_key": sport_key,
                        "hours_ahead": int(hours_ahead),
                        "limit": int(limit),
                    },
                )
                rows = cur.fetchall()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"admin_odds_market_totals_failed: {e}")

    items: List[Dict[str, Any]] = []
    counts = {
        "total": 0,
        "with_market_line": 0,
        "with_snapshot": 0,
        "with_model_probs": 0,
    }

    for row in rows:
        (
            event_id,
            sport_key_db,
            commence_time_utc,
            home_name,
            away_name,
            match_confidence,
            resolved_fixture_id,
            line,
            best_over,
            best_under,
            latest_captured_at_utc,
            snapshot_count,
            payload,
        ) = row

        counts["total"] += 1

        kickoff_iso = (
            commence_time_utc.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
            if commence_time_utc
            else None
        )
        captured_iso = (
            latest_captured_at_utc.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
            if latest_captured_at_utc
            else None
        )

        market_probs = None
        overround = None

        if best_over and best_under and best_over > 0 and best_under > 0:
            imp_over = 1.0 / float(best_over)
            imp_under = 1.0 / float(best_under)
            s_imp = imp_over + imp_under
            if s_imp > 0:
                market_probs = {
                    "over": imp_over / s_imp,
                    "under": imp_under / s_imp,
                }
                overround = s_imp

        snapshot_summary = None
        model_probs = None
        edge = None
        ev = None

        if isinstance(payload, dict):
            counts["with_snapshot"] += 1

            mk = payload.get("markets") or {}
            totals = mk.get("totals") or {}
            totals_p = totals.get("p_model") or {}
            totals_lines = totals.get("lines") or {}
            inputs = payload.get("inputs") or {}

            selected_line_key = None
            selected_line_model = None

            if line is not None:
                selected_line_key = str(float(line))
                if selected_line_key.endswith(".0"):
                    selected_line_key = selected_line_key[:-2]
                selected_line_model = totals_lines.get(selected_line_key)

            if selected_line_model and isinstance(selected_line_model, dict):
                model_probs = {
                    "over": selected_line_model.get("over"),
                    "under": selected_line_model.get("under"),
                    "push": selected_line_model.get("push"),
                }
            else:
                model_probs = {
                    "over": totals_p.get("over"),
                    "under": totals_p.get("under"),
                    "push": None,
                }

            if model_probs.get("over") is not None or model_probs.get("under") is not None:
                counts["with_model_probs"] += 1

            if market_probs is not None:
                edge = {
                    "over": (
                        float(model_probs["over"]) - float(market_probs["over"])
                        if model_probs.get("over") is not None and market_probs.get("over") is not None
                        else None
                    ),
                    "under": (
                        float(model_probs["under"]) - float(market_probs["under"])
                        if model_probs.get("under") is not None and market_probs.get("under") is not None
                        else None
                    ),
                }

                ev = {
                    "over": (
                        float(model_probs["over"]) * float(best_over) - 1.0
                        if model_probs.get("over") is not None and best_over is not None
                        else None
                    ),
                    "under": (
                        float(model_probs["under"]) * float(best_under) - 1.0
                        if model_probs.get("under") is not None and best_under is not None
                        else None
                    ),
                }

            snapshot_summary = {
                "model_version": payload.get("model_version"),
                "calc_version": payload.get("calc_version"),
                "inputs": {
                    "lambda_home": inputs.get("lambda_home"),
                    "lambda_away": inputs.get("lambda_away"),
                    "lambda_total": inputs.get("lambda_total"),
                },
                "totals": {
                    "main_line": totals.get("main_line"),
                    "selected_line": line,
                    "p_model": model_probs,
                    "best_odds": {
                        "over": best_over,
                        "under": best_under,
                    },
                    "lines_available": sorted(list(totals_lines.keys())),
                },
            }

        if line is not None:
            counts["with_market_line"] += 1

        items.append(
            {
                "event_id": str(event_id),
                "sport_key": str(sport_key_db),
                "kickoff_utc": kickoff_iso,
                "home_name": str(home_name),
                "away_name": str(away_name),
                "match_confidence": match_confidence,
                "fixture_id": int(resolved_fixture_id) if resolved_fixture_id is not None else None,
                "market": {
                    "line": float(line) if line is not None else None,
                    "best_over": float(best_over) if best_over is not None else None,
                    "best_under": float(best_under) if best_under is not None else None,
                    "market_probs": market_probs,
                    "overround": float(overround) if overround is not None else None,
                    "latest_captured_at_utc": captured_iso,
                    "snapshot_count": int(snapshot_count) if snapshot_count is not None else 0,
                },
                "snapshot": snapshot_summary,
                "edge": edge,
                "ev": ev,
            }
        )

    return {
        "ok": True,
        "meta": {
            "sport_key": sport_key,
            "hours_ahead": int(hours_ahead),
            "limit": int(limit),
            "counts": counts,
        },
        "items": items,
    }

@router.get("/markets/btts")
def admin_odds_market_btts(
    sport_key: Optional[str] = Query(default=None),
    hours_ahead: int = Query(default=72, ge=1, le=24 * 60),
    limit: int = Query(default=100, ge=1, le=1000),
) -> Dict[str, Any]:
    """
    Admin-only:
    visão técnica do mercado BTTS usando odds_snapshots_market + matchup_snapshot_v1.

    Fonte de mercado observada:
      - odds.odds_snapshots_market (market_key in btts / both_teams_to_score)

    Fonte de modelo:
      - product.matchup_snapshot_v1.payload -> markets.btts
    """

    sql = """
      WITH latest_market AS (
        SELECT DISTINCT ON (
          s.event_id,
          COALESCE(s.bookmaker, ''),
          lower(s.selection_key)
        )
          s.event_id,
          s.bookmaker,
          s.market_key,
          s.selection_key,
          s.price,
          s.captured_at_utc
        FROM odds.odds_snapshots_market s
        WHERE s.market_key IN ('btts', 'both_teams_to_score')
          AND lower(s.selection_key) IN ('yes', 'no')
        ORDER BY
          s.event_id,
          COALESCE(s.bookmaker, ''),
          lower(s.selection_key),
          s.captured_at_utc DESC
      ),
      per_event AS (
        SELECT
          lm.event_id,
          MAX(CASE WHEN lower(lm.selection_key) = 'yes' THEN lm.price END)::float8 AS best_yes,
          MAX(CASE WHEN lower(lm.selection_key) = 'no' THEN lm.price END)::float8 AS best_no,
          MAX(lm.captured_at_utc) AS latest_captured_at_utc,
          COUNT(*)::int AS snapshot_count
        FROM latest_market lm
        GROUP BY lm.event_id
      ),
      latest_snap_fx AS (
        SELECT DISTINCT ON (s.fixture_id)
          s.fixture_id,
          s.payload
        FROM product.matchup_snapshot_v1 s
        WHERE s.fixture_id IS NOT NULL
        ORDER BY s.fixture_id
      ),
      latest_snap_ev AS (
        SELECT DISTINCT ON (s.event_id)
          s.event_id,
          s.payload
        FROM product.matchup_snapshot_v1 s
        WHERE s.event_id IS NOT NULL
        ORDER BY
          s.event_id,
          (s.fixture_id IS NULL) ASC,
          s.fixture_id DESC NULLS LAST
      )
      SELECT
        e.event_id,
        e.sport_key,
        e.commence_time_utc,
        e.home_name,
        e.away_name,
        e.match_confidence,
        e.resolved_fixture_id,
        pe.best_yes,
        pe.best_no,
        pe.latest_captured_at_utc,
        pe.snapshot_count,
        COALESCE(lsfx.payload, lsev.payload) AS payload
      FROM odds.odds_events e
      LEFT JOIN per_event pe
        ON pe.event_id = e.event_id
      LEFT JOIN latest_snap_fx lsfx
        ON lsfx.fixture_id = e.resolved_fixture_id
      LEFT JOIN latest_snap_ev lsev
        ON lsev.event_id = e.event_id
      WHERE ((%(sport_key)s)::text IS NULL OR e.sport_key = (%(sport_key)s)::text)
        AND (
          e.commence_time_utc IS NULL
          OR (
            e.commence_time_utc >= now()
            AND e.commence_time_utc <= (now() + (%(hours_ahead)s || ' hours')::interval)
          )
        )
      ORDER BY e.commence_time_utc ASC NULLS LAST
      LIMIT %(limit)s
    """

    try:
        with pg_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    sql,
                    {
                        "sport_key": sport_key,
                        "hours_ahead": int(hours_ahead),
                        "limit": int(limit),
                    },
                )
                rows = cur.fetchall()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"admin_odds_market_btts_failed: {e}")

    items: List[Dict[str, Any]] = []
    counts = {
        "total": 0,
        "with_market": 0,
        "with_snapshot": 0,
        "with_model_probs": 0,
    }

    for row in rows:
        (
            event_id,
            sport_key_db,
            commence_time_utc,
            home_name,
            away_name,
            match_confidence,
            resolved_fixture_id,
            best_yes,
            best_no,
            latest_captured_at_utc,
            snapshot_count,
            payload,
        ) = row

        counts["total"] += 1

        kickoff_iso = (
            commence_time_utc.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
            if commence_time_utc
            else None
        )
        captured_iso = (
            latest_captured_at_utc.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
            if latest_captured_at_utc
            else None
        )

        market_probs = None
        overround = None

        if best_yes and best_no and best_yes > 0 and best_no > 0:
            imp_yes = 1.0 / float(best_yes)
            imp_no = 1.0 / float(best_no)
            s_imp = imp_yes + imp_no
            if s_imp > 0:
                market_probs = {
                    "yes": imp_yes / s_imp,
                    "no": imp_no / s_imp,
                }
                overround = s_imp
                counts["with_market"] += 1

        snapshot_summary = None
        model_probs = None
        edge = None
        ev = None

        if isinstance(payload, dict):
            counts["with_snapshot"] += 1

            mk = payload.get("markets") or {}
            btts = mk.get("btts") or {}
            inputs = payload.get("inputs") or {}

            model_probs = {
                "yes": btts.get("yes"),
                "no": btts.get("no"),
            }

            if model_probs.get("yes") is not None or model_probs.get("no") is not None:
                counts["with_model_probs"] += 1

            if market_probs is not None:
                edge = {
                    "yes": (
                        float(model_probs["yes"]) - float(market_probs["yes"])
                        if model_probs.get("yes") is not None and market_probs.get("yes") is not None
                        else None
                    ),
                    "no": (
                        float(model_probs["no"]) - float(market_probs["no"])
                        if model_probs.get("no") is not None and market_probs.get("no") is not None
                        else None
                    ),
                }

                ev = {
                    "yes": (
                        float(model_probs["yes"]) * float(best_yes) - 1.0
                        if model_probs.get("yes") is not None and best_yes is not None
                        else None
                    ),
                    "no": (
                        float(model_probs["no"]) * float(best_no) - 1.0
                        if model_probs.get("no") is not None and best_no is not None
                        else None
                    ),
                }

            snapshot_summary = {
                "model_version": payload.get("model_version"),
                "calc_version": payload.get("calc_version"),
                "inputs": {
                    "lambda_home": inputs.get("lambda_home"),
                    "lambda_away": inputs.get("lambda_away"),
                    "lambda_total": inputs.get("lambda_total"),
                },
                "btts": {
                    "p_model": model_probs,
                    "best_odds": {
                        "yes": best_yes,
                        "no": best_no,
                    },
                },
            }

        items.append(
            {
                "event_id": str(event_id),
                "sport_key": str(sport_key_db),
                "kickoff_utc": kickoff_iso,
                "home_name": str(home_name),
                "away_name": str(away_name),
                "match_confidence": match_confidence,
                "fixture_id": int(resolved_fixture_id) if resolved_fixture_id is not None else None,
                "market": {
                    "best_yes": float(best_yes) if best_yes is not None else None,
                    "best_no": float(best_no) if best_no is not None else None,
                    "market_probs": market_probs,
                    "overround": float(overround) if overround is not None else None,
                    "latest_captured_at_utc": captured_iso,
                    "snapshot_count": int(snapshot_count) if snapshot_count is not None else 0,
                },
                "snapshot": snapshot_summary,
                "edge": edge,
                "ev": ev,
            }
        )

    return {
        "ok": True,
        "meta": {
            "sport_key": sport_key,
            "hours_ahead": int(hours_ahead),
            "limit": int(limit),
            "counts": counts,
        },
        "items": items,
    }