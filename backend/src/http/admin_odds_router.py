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
    Lê odds persistidas (último snapshot por evento) e retorna uma fila simples para UI.
    NÃO chama provider externo.
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
        AND (e.commence_time_utc IS NULL OR (e.commence_time_utc >= now() AND e.commence_time_utc <= (%(end)s)::timestamptz))
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
        out.append(
            {
                "event_id": event_id,
                "sport_key": sport_key_db,
                "commence_time_utc": commence_time_utc.isoformat() if commence_time_utc else None,
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
                    "captured_at_utc": captured_at_utc.isoformat() if captured_at_utc else None,
                    "freshness_seconds": int(freshness_seconds) if freshness_seconds is not None else None,
                },
            }
        )
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


# compat: app.py costuma importar "admin_odds_router"
admin_odds_router = router
