from __future__ import annotations

from datetime import datetime, timezone, timedelta
import re
import unicodedata
from typing import Any, Dict, List, Optional, Tuple

from fastapi import APIRouter, HTTPException, Query

from src.core.settings import load_settings
from src.db.pg import pg_conn
from src.integrations.theodds.client import TheOddsClient, TheOddsApiError
from src.models.one_x_two_logreg_v1 import predict_1x2_from_artifact


router = APIRouter(prefix="/admin/odds", tags=["admin-odds"])

# MVP: default artifact (ajuste se você quiser centralizar isso em settings)
DEFAULT_EPL_ARTIFACT = "epl_1x2_logreg_v1_C_2021_2023_C0.3.json"

_STOPWORDS = {"fc", "cf", "sc", "ac", "afc", "cfc", "the", "club", "de", "da", "do", "and", "&"}


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
        raw = _client().get_odds_h2h(sport_key=sport_key, regions=regions)
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
        raw = _client().get_odds_h2h(sport_key=sport_key, regions=regions)
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
                    p_mkt = market["novig"]

                    edge = None
                    if p_mkt:
                        edge = {
                            "H": (p_model["H"] - (p_mkt["H"] or 0.0)) if p_mkt["H"] is not None else None,
                            "D": (p_model["D"] - (p_mkt["D"] or 0.0)) if p_mkt["D"] is not None else None,
                            "A": (p_model["A"] - (p_mkt["A"] or 0.0)) if p_mkt["A"] is not None else None,
                        }

                    evv = {
                        "H": (p_model["H"] * odds_h - 1.0) if odds_h else None,
                        "D": (p_model["D"] * odds_d - 1.0) if odds_d else None,
                        "A": (p_model["A"] * odds_a - 1.0) if odds_a else None,
                    }

                    model_block = {
                        "league_id": int(league_id),
                        "season": int(season),
                        "artifact_filename": artifact_filename,
                        "probs_model": p_model,
                        "edge_vs_market": edge,
                        "ev_decimal": evv,
                        "features": pred.get("features"),
                        "artifact_meta": pred.get("artifact"),
                    }
                except Exception as e:
                    model_block = {"error": str(e)}

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
    counters = {"total": 0, "ok_model": 0, "missing_team": 0, "model_error": 0}

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
                }
                counters["ok_model"] += 1

                # Persist audit snapshot (não impede retorno se falhar)
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
                        )
                        conn.commit()
                except Exception as pe:
                    persist_error = str(pe)

            except Exception as e:
                status = "incomplete"
                reason = str(e)
                counters["model_error"] += 1
                model_block = {"error": str(e)}

                # opcional: também persistir falha (se você quiser rastrear por que não calculou)
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

    # MVP: não deixamos janela gigante derrubar o servidor
    if hours_ahead > 720:
        hours_ahead = 720

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
        e.commence_time_utc,
        e.resolved_home_team_id,
        e.resolved_away_team_id,
        e.match_confidence,
        l.bookmaker,
        l.market,
        l.odds_home,
        l.odds_draw,
        l.odds_away,
        l.captured_at_utc
      FROM odds.odds_events e
      JOIN latest l ON l.event_id = e.event_id
      WHERE e.sport_key = (%(sport_key)s)::text
        AND (e.commence_time_utc IS NULL OR (e.commence_time_utc >= now() AND e.commence_time_utc <= (%(end)s)::timestamptz))
        AND ({conf_clause})
      ORDER BY e.commence_time_utc ASC NULLS LAST
      LIMIT %(limit)s
    """

    rows = []
    with pg_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, {"sport_key": sport_key, "start": start_utc, "end": end_utc, "limit": limit})
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

    # MVP: EPL/season default
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
        assume_league_id=assume_league_id,
        assume_season=assume_season,
    )

    out = []
    counts = {"total": 0, "resolved_ok": 0, "ok_model": 0, "missing_team": 0, "model_error": 0}

    for it in items:
        counts["total"] += 1

        # payload do orchestrate já vem com resolve + market_probs
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

                    pred = predict_1x2_from_artifact(
                        artifact_filename=artifact_filename,
                        league_id=int(assume_league_id),
                        season=int(assume_season),
                        home_team_id=int(home_id),
                        away_team_id=int(away_id),
                    )
                    p_model = pred["probs"]

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
                        "league_id": int(assume_league_id),
                        "season": int(assume_season),
                        "probs_model": p_model,
                        "edge_vs_market": edge,
                        "ev_decimal": evv,
                        "best_ev": best_ev,
                        "best_side": best_side,
                        "artifact_meta": pred.get("artifact"),
                    }
                    counts["ok_model"] += 1

            except Exception as e:
                status = "incomplete"
                reason = str(e)
                counts["model_error"] += 1
                model_block = {"error": str(e)}

        out.append({**it, "model": model_block, "status": status, "reason": reason})

    # sort default: best_ev desc
    def _best_ev_key(x: Dict[str, Any]):
        m = x.get("model") or {}
        v = m.get("best_ev")
        return v if v is not None else -10**9

    out.sort(key=_best_ev_key, reverse=True)

    return {"meta": {"counts": counts}, "items": out}
