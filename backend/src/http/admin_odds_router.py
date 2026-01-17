from __future__ import annotations

from typing import Any, Dict, List, Optional

from datetime import datetime, timezone, timedelta
import re
import unicodedata

from fastapi import APIRouter, HTTPException, Query

from src.core.settings import load_settings
from src.integrations.theodds.client import TheOddsClient, TheOddsApiError
from src.db.pg import pg_conn
from src.models.one_x_two_logreg_v1 import predict_1x2_from_artifact


router = APIRouter(prefix="/admin/odds", tags=["admin-odds"])

# Default do projeto (EPL)
DEFAULT_EPL_ARTIFACT = "epl_1x2_logreg_v1_C_2021_2023_C0.3.json"

# Persistência (schema odds.v1)
SQL_UPSERT_EVENT = """
INSERT INTO odds.odds_events (
  event_id, sport_key, commence_time_utc, home_name, away_name,
  resolved_home_team_id, resolved_away_team_id, resolved_fixture_id,
  match_confidence, updated_at_utc
) VALUES (
  %(event_id)s, %(sport_key)s, %(commence_time_utc)s, %(home_name)s, %(away_name)s,
  %(resolved_home_team_id)s, %(resolved_away_team_id)s, %(resolved_fixture_id)s,
  %(match_confidence)s, now()
)
ON CONFLICT (event_id) DO UPDATE SET
  sport_key = EXCLUDED.sport_key,
  commence_time_utc = EXCLUDED.commence_time_utc,
  home_name = EXCLUDED.home_name,
  away_name = EXCLUDED.away_name,
  resolved_home_team_id = EXCLUDED.resolved_home_team_id,
  resolved_away_team_id = EXCLUDED.resolved_away_team_id,
  resolved_fixture_id = EXCLUDED.resolved_fixture_id,
  match_confidence = EXCLUDED.match_confidence,
  updated_at_utc = now()
"""

SQL_INSERT_SNAPSHOT_1X2 = """
INSERT INTO odds.odds_snapshots_1x2 (
  event_id, bookmaker, market, odds_home, odds_draw, odds_away, captured_at_utc
) VALUES (
  %(event_id)s, %(bookmaker)s, %(market)s, %(odds_home)s, %(odds_draw)s, %(odds_away)s, %(captured_at_utc)s
)
"""


def _client() -> TheOddsClient:
    s = load_settings()
    return TheOddsClient(
        base_url=s.the_odds_api_base_url or "",
        api_key=s.the_odds_api_key or "",
        timeout_sec=20,
    )


def _parse_commence_time_utc(s: Optional[str]) -> Optional[datetime]:
    if not s:
        return None
    # Ex: "2026-01-17T20:00:00Z"
    return datetime.fromisoformat(s.replace("Z", "+00:00")).astimezone(timezone.utc)


_STOPWORDS = {"fc", "cf", "sc", "ac", "afc", "cfc", "the", "club", "de", "da", "do", "and", "&"}


def _norm_name(s: str) -> str:
    s = (s or "").strip().lower()
    s = unicodedata.normalize("NFKD", s)
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    s = re.sub(r"[^a-z0-9\\s]", " ", s)
    parts = [p for p in s.split() if p and p not in _STOPWORDS]
    return " ".join(parts).strip()


def _find_team_id(conn, raw_name: str, limit_suggestions: int = 5):
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


def _try_find_fixture(
    conn,
    kickoff_utc_iso: str,
    home_team_id: int,
    away_team_id: int,
    tol_hours: int = 36
) -> Optional[Dict[str, Any]]:
    # kickoff_utc_iso vem em ISO string (The Odds API). Converter para datetime UTC.
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


def _market_probs_from_odds(odds_h: float | None, odds_d: float | None, odds_a: float | None) -> Dict[str, Any]:
    # MVP: implied probs + normalização (remove vig proporcional)
    vals: List[Optional[float]] = []
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


def _persist_event_and_snapshot(
    *,
    event_id: str,
    sport_key: str,
    commence_time: Optional[str],
    home_name: str,
    away_name: str,
    bookmaker: Optional[str],
    odds_h: Optional[float],
    odds_d: Optional[float],
    odds_a: Optional[float],
    resolved_home_team_id: Optional[int],
    resolved_away_team_id: Optional[int],
    resolved_fixture_id: Optional[int],
    match_confidence: Optional[str],
    captured_at_utc: datetime,
) -> None:
    commence_dt = _parse_commence_time_utc(commence_time)

    with pg_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                SQL_UPSERT_EVENT,
                {
                    "event_id": event_id,
                    "sport_key": sport_key,
                    "commence_time_utc": commence_dt,
                    "home_name": home_name,
                    "away_name": away_name,
                    "resolved_home_team_id": resolved_home_team_id,
                    "resolved_away_team_id": resolved_away_team_id,
                    "resolved_fixture_id": resolved_fixture_id,
                    "match_confidence": match_confidence,
                },
            )

            cur.execute(
                SQL_INSERT_SNAPSHOT_1X2,
                {
                    "event_id": event_id,
                    "bookmaker": bookmaker,
                    "market": "h2h",
                    "odds_home": odds_h,
                    "odds_draw": odds_d,
                    "odds_away": odds_a,
                    "captured_at_utc": captured_at_utc,
                },
            )

        conn.commit()


@router.get("/sports")
def admin_odds_list_sports() -> List[Dict[str, Any]]:
    """
    Debug/Discovery: list available sports keys.
    """
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
    persist: bool = Query(default=True),
) -> List[Dict[str, Any]]:
    """
    Returns upcoming events with H2H odds in a stable internal shape.
    Se persist=true, salva:
      - odds.odds_events (upsert)
      - odds.odds_snapshots_1x2 (insert)
    """
    try:
        raw = _client().get_odds_h2h(sport_key=sport_key, regions=regions)
    except TheOddsApiError as e:
        raise HTTPException(status_code=500, detail=str(e))

    out: List[Dict[str, Any]] = []

    for ev in raw[:limit]:
        event_id = str(ev.get("id") or "")
        commence_time = ev.get("commence_time")
        home = str(ev.get("home_team") or "")
        away = str(ev.get("away_team") or "")

        odds_h: Optional[float] = None
        odds_d: Optional[float] = None
        odds_a: Optional[float] = None
        bookmaker_name: Optional[str] = None

        bookmakers = ev.get("bookmakers") or []
        if bookmakers:
            mk = bookmakers[0]
            bookmaker_name = mk.get("title") or mk.get("key")
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

        if persist and event_id:
            try:
                _persist_event_and_snapshot(
                    event_id=event_id,
                    sport_key=sport_key,
                    commence_time=commence_time,
                    home_name=home,
                    away_name=away,
                    bookmaker=bookmaker_name,
                    odds_h=odds_h,
                    odds_d=odds_d,
                    odds_a=odds_a,
                    resolved_home_team_id=None,
                    resolved_away_team_id=None,
                    resolved_fixture_id=None,
                    match_confidence=None,
                    captured_at_utc=datetime.now(timezone.utc),
                )
            except Exception as e:
                # MVP: não quebra a listagem por falha de persist, mas retorna erro no item
                out.append(
                    {
                        "event_id": event_id,
                        "kickoff_utc": commence_time,
                        "home_name": home,
                        "away_name": away,
                        "sport_key": sport_key,
                        "regions": regions,
                        "odds_1x2": {"H": odds_h, "D": odds_d, "A": odds_a},
                        "persist_error": str(e),
                    }
                )
                continue

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
    artifact_filename: Optional[str] = Query(default=DEFAULT_EPL_ARTIFACT),
    assume_league_id: Optional[int] = Query(default=None, ge=1),
    assume_season: Optional[int] = Query(default=None, ge=1900, le=2100),
    persist: bool = Query(default=True),
) -> List[Dict[str, Any]]:
    """
    Orquestra: Odds API -> resolve team_ids -> tenta achar fixture -> (opcional) P_model + compare.
    Também persiste odds como fatos (events + snapshots) se persist=true.
    """
    try:
        raw = _client().get_odds_h2h(sport_key=sport_key, regions=regions)
    except TheOddsApiError as e:
        raise HTTPException(status_code=500, detail=str(e))

    out: List[Dict[str, Any]] = []

    # Uma conexão para resolver/fixture com custo baixo
    with pg_conn() as conn:
        for ev in raw[:limit]:
            event_id = str(ev.get("id") or "")
            commence_time = ev.get("commence_time")
            home = str(ev.get("home_team") or "")
            away = str(ev.get("away_team") or "")

            odds_h: Optional[float] = None
            odds_d: Optional[float] = None
            odds_a: Optional[float] = None
            bookmaker_name: Optional[str] = None

            bookmakers = ev.get("bookmakers") or []
            if bookmakers:
                mk = bookmakers[0]
                bookmaker_name = mk.get("title") or mk.get("key")
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

            # resolve team ids
            home_id, home_type, home_sugg = _find_team_id(conn, home)
            away_id, away_type, away_sugg = _find_team_id(conn, away)

            # fixture hint
            fixture: Optional[Dict[str, Any]] = None
            if home_id and away_id and commence_time:
                fixture = _try_find_fixture(conn, commence_time, home_id, away_id)

            # match confidence (MVP)
            if home_id and away_id:
                if home_type == "EXACT" and away_type == "EXACT":
                    match_conf = "EXACT"
                else:
                    match_conf = "ILIKE"
            else:
                match_conf = "NONE"

            market = _market_probs_from_odds(odds_h, odds_d, odds_a)

            # decide league/season para o modelo
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

            # persist facts
            persist_error = None
            if persist and event_id:
                try:
                    _persist_event_and_snapshot(
                        event_id=event_id,
                        sport_key=sport_key,
                        commence_time=commence_time,
                        home_name=home,
                        away_name=away,
                        bookmaker=bookmaker_name,
                        odds_h=odds_h,
                        odds_d=odds_d,
                        odds_a=odds_a,
                        resolved_home_team_id=home_id,
                        resolved_away_team_id=away_id,
                        resolved_fixture_id=(fixture or {}).get("fixture_id") if fixture else None,
                        match_confidence=match_conf,
                        captured_at_utc=datetime.now(timezone.utc),
                    )
                except Exception as e:
                    persist_error = str(e)

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
                        "match_confidence": match_conf,
                    },
                    "fixture_hint": fixture,
                    "model": model_block,
                    "persist_error": persist_error,
                }
            )

    return out

@router.get("/queue")
def admin_odds_queue(
    sport_key: Optional[str] = Query(default=None),
    hours_ahead: int = Query(default=72, ge=1, le=720),
    min_confidence: str = Query(default="NONE", pattern="^(NONE|ILIKE|EXACT)$"),
    limit: int = Query(default=200, ge=1, le=1000),
) -> List[Dict[str, Any]]:
    """
    Lista a fila de odds a partir do banco (fatos persistidos),
    retornando o ÚLTIMO snapshot 1x2 por event_id.

    min_confidence:
      - NONE  (não filtra)
      - ILIKE (inclui ILIKE e EXACT)
      - EXACT (somente EXACT)
    """
    now_utc = datetime.now(timezone.utc)
    end_utc = now_utc + timedelta(hours=hours_ahead)

    # regra simples de filtro por confiança
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
      WHERE (%(sport_key)s IS NULL OR e.sport_key = %(sport_key)s)
        AND (e.commence_time_utc IS NULL OR (e.commence_time_utc >= now() AND e.commence_time_utc <= %(end)s))
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
                "commence_time_utc": commence_time_utc.isoformat().replace("+00:00", "Z") if commence_time_utc else None,
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
                    "captured_at_utc": captured_at_utc.isoformat().replace("+00:00", "Z") if captured_at_utc else None,
                    "freshness_seconds": int(freshness_seconds) if freshness_seconds is not None else None,
                },
            }
        )

    return out
