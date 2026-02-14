# portable/backend/src/http/odds_router.py
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from src.db.pg import pg_conn
from src.models.one_x_two_logreg_v1 import predict_1x2_from_artifact
from src.odds.matchup_resolver import resolve_odds_event

import json
from pathlib import Path

router = APIRouter(prefix="/odds", tags=["odds-product"])


# ---------------------------
# Schemas
# ---------------------------
class OddsBookRow(BaseModel):
    key: str
    name: str
    odds: Dict[str, Optional[float]]  # H/D/A
    is_affiliate: bool = False
    affiliate_url: Optional[str] = None

class EdgeSummary(BaseModel):
    best_outcome: Optional[str] = None  # "H" | "D" | "A"
    best_edge: Optional[float] = None   # model_p - market_novig_p
    best_odd: Optional[float] = None
    best_book_key: Optional[str] = None
    best_book_name: Optional[str] = None
    market_books_count: int = 0
    market_min_odd: Optional[float] = None
    market_max_odd: Optional[float] = None

class OddsEventRow(BaseModel):
    event_id: str
    sport_key: str
    commence_time_utc: Optional[str] = None
    home_name: str
    away_name: str
    latest_captured_at_utc: Optional[str] = None
    match_status: Optional[str] = None
    match_score: Optional[float] = None
    odds_best: Optional[Dict[str, Optional[float]]] = None  # H/D/A
    odds_books: Optional[List[OddsBook]] = None
    edge_summary: Optional[EdgeSummary] = None

class OddsBook(BaseModel):
    key: str
    name: str
    is_affiliate: bool = False
    url: Optional[str] = None
    odds_1x2: Optional[Dict[str, Optional[float]]] = None  # H/D/A


class OddsEventRow(BaseModel):
    event_id: str
    sport_key: str
    commence_time_utc: Optional[str] = None
    home_name: str
    away_name: str
    latest_captured_at_utc: Optional[str] = None
    match_status: Optional[str] = None
    match_score: Optional[float] = None

    odds_books: Optional[List[OddsBook]] = None
    odds_best: Optional[Dict[str, Optional[float]]] = None  # <-- ADD

class OddsEventsResponse(BaseModel):
    ok: bool = True
    generated_at_utc: str
    sport_key: str
    events: List[OddsEventRow]


class ResolveRequest(BaseModel):
    event_id: str = Field(..., description="odds.odds_events.event_id")
    assume_league_id: int
    assume_season: int
    tol_hours: int = 6
    max_candidates: int = 5


class ResolveResponse(BaseModel):
    ok: bool = True
    event_id: str
    status: str
    confidence: float
    resolved: Optional[Dict[str, Any]] = None
    candidates: List[Dict[str, Any]] = []
    reason: Optional[str] = None


class QuoteRequest(BaseModel):
    event_id: str
    assume_league_id: int
    assume_season: int
    artifact_filename: str
    tol_hours: int = 6


class QuoteResponse(BaseModel):
    ok: bool = True
    event_id: str
    matchup: Dict[str, Any]
    probs: Optional[Dict[str, float]] = None
    odds: Optional[Dict[str, Any]] = None
    value: Optional[Dict[str, Any]] = None


# ---------------------------
# Helpers
# ---------------------------
_AFF_CACHE: Optional[Dict[str, Dict[str, str]]] = None

def _book_key(raw: Optional[str]) -> str:
    v = (raw or "").strip().lower()
    v = v.replace("&", "and")
    for ch in [" ", "-", ".", ",", "/", "\\", "(", ")", "[", "]", "{", "}", "’", "'", "\""]:
        v = v.replace(ch, "_")
    while "__" in v:
        v = v.replace("__", "_")
    return v.strip("_") or "unknown"

def _load_affiliates() -> Dict[str, Dict[str, str]]:
    global _AFF_CACHE
    if _AFF_CACHE is not None:
        return _AFF_CACHE

    base_dir = Path(__file__).resolve().parents[2]  # .../backend
    path = base_dir / "config" / "odds.affiliates.json"
    if not path.exists():
        _AFF_CACHE = {}
        return _AFF_CACHE

    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(data, dict):
            _AFF_CACHE = data
        else:
            _AFF_CACHE = {}
    except Exception:
        _AFF_CACHE = {}

    return _AFF_CACHE

def _snapshots_to_books(rows: List[tuple]) -> List[OddsBook]:
    """
    rows: [(bookmaker, odds_home, odds_draw, odds_away), ...]
    """
    aff = _load_affiliates()
    out: List[OddsBook] = []

    for (bookmaker, oh, od, oa) in rows:
        key = _book_key(bookmaker)
        meta = aff.get(key) or {}
        raw_name = meta.get("name") or bookmaker or key
        name = str(raw_name).strip() or key

        is_aff = key in aff
        url = meta.get("url")

        out.append(
            OddsBook(
                key=key,
                name=str(name),
                is_affiliate=bool(is_aff),
                url=str(url) if url else None,
                odds_1x2={
                    "H": float(oh) if oh is not None else None,
                    "D": float(od) if od is not None else None,
                    "A": float(oa) if oa is not None else None,
                },
            )
        )

    return out

def _fetch_latest_books_for_events(conn, event_ids: List[str]) -> Dict[str, List[OddsBook]]:
    ids = [str(x) for x in (event_ids or []) if str(x).strip()]
    if not ids:
        return {}

    sql = """
      SELECT s.event_id, s.bookmaker, s.odds_home, s.odds_draw, s.odds_away
      FROM odds.odds_snapshots_1x2 s
      JOIN (
          SELECT event_id, bookmaker, MAX(captured_at_utc) AS max_ts
          FROM odds.odds_snapshots_1x2
          WHERE event_id = ANY(%(event_ids)s)
          GROUP BY event_id, bookmaker
      ) t
        ON t.event_id = s.event_id
       AND t.bookmaker = s.bookmaker
       AND t.max_ts = s.captured_at_utc
      ORDER BY s.event_id, s.bookmaker NULLS LAST
    """

    by_event: Dict[str, List[tuple]] = {}

    with conn.cursor() as cur:
        cur.execute(sql, {"event_ids": ids})
        for (eid, bookmaker, oh, od, oa) in cur.fetchall():
            by_event.setdefault(str(eid), []).append((bookmaker, oh, od, oa))

    return {eid: _snapshots_to_books(rows) for eid, rows in by_event.items()}

def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _implied_prob(odds: Optional[float]) -> Optional[float]:
    if odds is None:
        return None
    try:
        o = float(odds)
    except Exception:
        return None
    if o <= 0:
        return None
    return 1.0 / o


def _market_probs_from_odds(odds_h: Optional[float], odds_d: Optional[float], odds_a: Optional[float]) -> Dict[str, Any]:
    raw = {"H": _implied_prob(odds_h), "D": _implied_prob(odds_d), "A": _implied_prob(odds_a)}
    s = sum(v for v in raw.values() if v is not None)
    if s <= 0:
        return {"raw": raw, "novig": None, "overround": None}
    novig = {k: (v / s if v is not None else None) for k, v in raw.items()}
    return {"raw": raw, "novig": novig, "overround": float(s)}


def _edge(model_p: Optional[float], market_p: Optional[float]) -> Optional[float]:
    if model_p is None or market_p is None:
        return None
    return float(model_p) - float(market_p)


def _fetch_event_and_best_odds(conn, event_id: str) -> Dict[str, Any]:
    """
    Retorna:
      - event row (odds_events.*)
      - latest_captured_at_utc
      - best odds (max odds) dentro do último timestamp
    """
    sql = """
      WITH last_ts AS (
        SELECT event_id, MAX(captured_at_utc) AS max_ts
        FROM odds.odds_snapshots_1x2
        WHERE event_id = %(event_id)s
        GROUP BY event_id
      ),
      best AS (
        SELECT
          s.event_id,
          MAX(s.odds_home) AS odds_home,
          MAX(s.odds_draw) AS odds_draw,
          MAX(s.odds_away) AS odds_away
        FROM odds.odds_snapshots_1x2 s
        JOIN last_ts lt ON lt.event_id = s.event_id AND lt.max_ts = s.captured_at_utc
        GROUP BY s.event_id
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
        e.match_status,
        e.match_score,
        lt.max_ts,
        b.odds_home,
        b.odds_draw,
        b.odds_away
      FROM odds.odds_events e
      LEFT JOIN last_ts lt ON lt.event_id = e.event_id
      LEFT JOIN best b ON b.event_id = e.event_id
      WHERE e.event_id = %(event_id)s
      LIMIT 1
    """
    with conn.cursor() as cur:
        cur.execute(sql, {"event_id": event_id})
        row = cur.fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="odds event_id not found")

    (
        event_id,
        sport_key,
        commence_time_utc,
        home_name,
        away_name,
        rh,
        ra,
        rf,
        match_status,
        match_score,
        max_ts,
        odds_home,
        odds_draw,
        odds_away,
    ) = row

    return {
        "event_id": str(event_id),
        "sport_key": str(sport_key),
        "commence_time_utc": commence_time_utc.isoformat().replace("+00:00", "Z") if commence_time_utc else None,
        "home_name": str(home_name),
        "away_name": str(away_name),
        "resolved_home_team_id": int(rh) if rh is not None else None,
        "resolved_away_team_id": int(ra) if ra is not None else None,
        "resolved_fixture_id": int(rf) if rf is not None else None,
        "match_status": str(match_status) if match_status else None,
        "match_score": float(match_score) if match_score is not None else None,
        "latest_captured_at_utc": max_ts.isoformat().replace("+00:00", "Z") if max_ts else None,
        "odds_best": {
            "H": float(odds_home) if odds_home is not None else None,
            "D": float(odds_draw) if odds_draw is not None else None,
            "A": float(odds_away) if odds_away is not None else None,
        } if (odds_home is not None or odds_draw is not None or odds_away is not None) else None,
    }

def _pick_model_season(conn, *, league_id: int, requested_season: int) -> Dict[str, Any]:
    """
    MVP: se não existir team_season_stats para requested_season, cai para o MAX(season) disponível.
    Retorna {season_used, season_mode}.
    season_mode:
      - "requested" (usou a season pedida)
      - "fallback_latest" (caiu para a última season disponível)
      - "none" (não existe stats nenhuma)
    """
    sql_has = """
      SELECT 1
      FROM core.team_season_stats
      WHERE league_id = %(league_id)s AND season = %(season)s
      LIMIT 1
    """
    sql_max = """
      SELECT MAX(season)
      FROM core.team_season_stats
      WHERE league_id = %(league_id)s
    """
    with conn.cursor() as cur:
        cur.execute(sql_has, {"league_id": int(league_id), "season": int(requested_season)})
        if cur.fetchone():
            return {"season_used": int(requested_season), "season_mode": "requested"}

        cur.execute(sql_max, {"league_id": int(league_id)})
        row = cur.fetchone()
        max_season = row[0] if row else None

    if max_season is None:
        return {"season_used": None, "season_mode": "none"}

    return {"season_used": int(max_season), "season_mode": "fallback_latest"}


# ---------------------------
# Endpoints (Produto)
# ---------------------------


@router.get("/events", response_model=OddsEventsResponse, response_model_exclude_none=False)
def list_odds_events(
    sport_key: str = Query(...),
    hours_ahead: int = Query(168, ge=1, le=24 * 60),
    limit: int = Query(200, ge=1, le=1000),
    assume_league_id: Optional[int] = Query(None),
    assume_season: Optional[int] = Query(None),
    artifact_filename: Optional[str] = Query(None),
) -> OddsEventsResponse:

    now = datetime.now(timezone.utc)
    end = now + timedelta(hours=hours_ahead)

    sql = """
      WITH last_ts AS (
        SELECT event_id, MAX(captured_at_utc) AS max_ts
        FROM odds.odds_snapshots_1x2
        GROUP BY event_id
      ),
      best AS (
        SELECT
          s.event_id,
          MAX(s.odds_home) AS odds_home,
          MAX(s.odds_draw) AS odds_draw,
          MAX(s.odds_away) AS odds_away
        FROM odds.odds_snapshots_1x2 s
        JOIN last_ts lt ON lt.event_id = s.event_id AND lt.max_ts = s.captured_at_utc
        GROUP BY s.event_id
      )
      SELECT
        e.event_id,
        e.sport_key,
        e.commence_time_utc,
        e.home_name,
        e.away_name,
        e.resolved_home_team_id,
        e.resolved_away_team_id,
        e.match_status,
        e.match_score,
        lt.max_ts,
        b.odds_home,
        b.odds_draw,
        b.odds_away

      FROM odds.odds_events e
      LEFT JOIN last_ts lt ON lt.event_id = e.event_id
      LEFT JOIN best b ON b.event_id = e.event_id
      WHERE e.sport_key = %(sport_key)s
        AND e.commence_time_utc IS NOT NULL
        AND e.commence_time_utc >= %(now)s
        AND e.commence_time_utc <= %(end)s
      ORDER BY e.commence_time_utc ASC
      LIMIT %(limit)s
    """

    events: List[OddsEventRow] = []
    with pg_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                sql,
                {"sport_key": sport_key, "now": now, "end": end, "limit": int(limit)},
            )
            rows = cur.fetchall()

            event_ids = [str(r[0]) for r in rows]  # r[0] = event_id
            books_map = _fetch_latest_books_for_events(conn, event_ids)

        for (
            event_id,
            sport_key_db,
            commence_time_utc,
            home_name,
            away_name,
            resolved_home_team_id,
            resolved_away_team_id,
            match_status,
            match_score,
            max_ts,
            odds_home,
            odds_draw,
            odds_away,
        ) in rows:

            edge_summary = None

            # Edge summary só se o caller informar liga/temporada/artifact e o evento já tiver ids resolvidos
            if (
                assume_league_id is not None
                and assume_season is not None
                and artifact_filename
                and resolved_home_team_id
                and resolved_away_team_id
                and (odds_home is not None or odds_draw is not None or odds_away is not None)
            ):
                try:
                    pick = _pick_model_season(
                        conn,
                        league_id=int(assume_league_id),
                        requested_season=int(assume_season),
                    )

                    if pick.get("season_mode") != "none":
                        pred = predict_1x2_from_artifact(
                            artifact_filename=str(artifact_filename),
                            league_id=int(assume_league_id),
                            season=int(pick["season_used"]),
                            home_team_id=int(resolved_home_team_id),
                            away_team_id=int(resolved_away_team_id),
                        )
                        probs = pred.get("probs") or pred.get("probs_1x2") or None

                        if probs:
                            probs_block = {"H": float(probs["H"]), "D": float(probs["D"]), "A": float(probs["A"])}

                            mkt = _market_probs_from_odds(
                                float(odds_home) if odds_home is not None else None,
                                float(odds_draw) if odds_draw is not None else None,
                                float(odds_away) if odds_away is not None else None,
                            )
                            novig = mkt.get("novig") or {}

                            edges = {
                                "H": _edge(probs_block.get("H"), novig.get("H")),
                                "D": _edge(probs_block.get("D"), novig.get("D")),
                                "A": _edge(probs_block.get("A"), novig.get("A")),
                            }

                            # melhor outcome por edge (ignora None)
                            best_outcome = None
                            best_edge = None
                            for k in ["H", "D", "A"]:
                                v = edges.get(k)
                                if v is None:
                                    continue
                                if best_edge is None or v > best_edge:
                                    best_edge = v
                                    best_outcome = k

                            # melhor execução por outcome (entre books)
                            best_odd = None
                            best_book_key = None
                            best_book_name = None
                            market_books_count = 0
                            market_min_odd = None
                            market_max_odd = None

                            books = books_map.get(str(event_id), []) or []
                            if best_outcome:
                                for b in books:
                                    o = (b.odds_1x2 or {}).get(best_outcome)
                                    if o is None:
                                        continue
                                    odd = float(o)
                                    market_books_count += 1
                                    market_min_odd = odd if market_min_odd is None else min(market_min_odd, odd)
                                    market_max_odd = odd if market_max_odd is None else max(market_max_odd, odd)

                                    if best_odd is None or odd > best_odd:
                                        best_odd = odd
                                        best_book_key = b.key
                                        best_book_name = b.name

                            edge_summary = EdgeSummary(
                                best_outcome=best_outcome,
                                best_edge=float(best_edge) if best_edge is not None else None,
                                best_odd=best_odd,
                                best_book_key=best_book_key,
                                best_book_name=best_book_name,
                                market_books_count=int(market_books_count),
                                market_min_odd=market_min_odd,
                                market_max_odd=market_max_odd,
                            )
                except Exception:
                    edge_summary = None

            events.append(
                OddsEventRow(
                    odds_books=books_map.get(str(event_id), []),
                    event_id=str(event_id),
                    sport_key=str(sport_key_db),
                    commence_time_utc=commence_time_utc.isoformat().replace("+00:00", "Z") if commence_time_utc else None,
                    home_name=str(home_name),
                    away_name=str(away_name),
                    match_status=str(match_status) if match_status else None,
                    match_score=float(match_score) if match_score is not None else None,
                    latest_captured_at_utc=max_ts.isoformat().replace("+00:00", "Z") if max_ts else None,
                    edge_summary=edge_summary,
                    odds_best={
                        "H": float(odds_home) if odds_home is not None else None,
                        "D": float(odds_draw) if odds_draw is not None else None,
                        "A": float(odds_away) if odds_away is not None else None,
                    } if (odds_home is not None or odds_draw is not None or odds_away is not None) else None,
                )
            )

    return OddsEventsResponse(
        ok=True,
        generated_at_utc=_utc_now_iso(),
        sport_key=sport_key,
        events=events,
    )


@router.post("/matchup/resolve", response_model=ResolveResponse)
def resolve_matchup(req: ResolveRequest) -> ResolveResponse:
    with pg_conn() as conn:
        res = resolve_odds_event(
            conn,
            event_id=req.event_id,
            assume_league_id=req.assume_league_id,
            assume_season=req.assume_season,
            tol_hours=req.tol_hours,
            max_candidates=req.max_candidates,
            persist_resolution=True,
        )

        resolved = None
        if res.resolved_fixture_id and res.resolved_home_team_id and res.resolved_away_team_id:
            resolved = {
                "fixture_id": res.resolved_fixture_id,
                "league_id": int(req.assume_league_id),
                "season": int(req.assume_season),
                "home_team_id": res.resolved_home_team_id,
                "away_team_id": res.resolved_away_team_id,
            }

        return ResolveResponse(
            ok=True,
            event_id=req.event_id,
            status=res.status,
            confidence=float(res.confidence),
            resolved=resolved,
            candidates=res.candidates,
            reason=res.reason,
        )


@router.post("/quote", response_model=QuoteResponse)
def quote(req: QuoteRequest) -> QuoteResponse:
    with pg_conn() as conn:
        # 1) resolver (persiste status/score + resolved ids)
        res = resolve_odds_event(
            conn,
            event_id=req.event_id,
            assume_league_id=req.assume_league_id,
            assume_season=req.assume_season,
            tol_hours=req.tol_hours,
            max_candidates=5,
            persist_resolution=True,
        )

        # 2) carregar odds best/latest do DB
        ev = _fetch_event_and_best_odds(conn, req.event_id)

        books_map = _fetch_latest_books_for_events(conn, [req.event_id])
        odds_books = books_map.get(req.event_id, [])

        matchup = {
            "status": res.status,
            "confidence": float(res.confidence),
            "league_id": int(req.assume_league_id),
            "season": int(req.assume_season),
            "fixture_id": res.resolved_fixture_id,
            "home_team_id": res.resolved_home_team_id,
            "away_team_id": res.resolved_away_team_id,
            "reason": res.reason,
        }

        odds_block = None
        value_block = None
        probs_block = None

        if ev.get("odds_best"):
            odds_block = {
                "source": "db",
                "latest_captured_at_utc": ev.get("latest_captured_at_utc"),
                "best": ev.get("odds_best"),
                "books": [b.dict() for b in odds_books],
            }

        # 3) modelo (só se tiver ids resolvidos)
        if res.resolved_home_team_id and res.resolved_away_team_id:
            pick = _pick_model_season(conn, league_id=int(req.assume_league_id), requested_season=int(req.assume_season))

            matchup["model_season_requested"] = int(req.assume_season)
            matchup["model_season_used"] = pick["season_used"]
            matchup["model_season_mode"] = pick["season_mode"]

            if pick["season_mode"] == "none":
                matchup["model_status"] = "NO_STATS_ANY_SEASON"
            else:
                try:
                    pred = predict_1x2_from_artifact(
                        artifact_filename=req.artifact_filename,
                        league_id=int(req.assume_league_id),
                        season=int(pick["season_used"]),
                        home_team_id=int(res.resolved_home_team_id),
                        away_team_id=int(res.resolved_away_team_id),
                    )
                    probs = pred.get("probs") or pred.get("probs_1x2") or None
                    if probs:
                        probs_block = {"H": float(probs["H"]), "D": float(probs["D"]), "A": float(probs["A"])}
                except ValueError as e:
                    matchup["model_status"] = "NO_STATS_FOR_MATCH"
                    matchup["model_error"] = str(e)

        # 4) value/edge (opcional)
        if probs_block and ev.get("odds_best"):
            o = ev["odds_best"]
            mkt = _market_probs_from_odds(o.get("H"), o.get("D"), o.get("A"))
            novig = mkt.get("novig")

            value_block = {
                "market": mkt,
                "edge": {
                    "H": _edge(probs_block.get("H"), (novig.get("H") if novig else None)),
                    "D": _edge(probs_block.get("D"), (novig.get("D") if novig else None)),
                    "A": _edge(probs_block.get("A"), (novig.get("A") if novig else None)),
                },
            }

        return QuoteResponse(
            ok=True,
            event_id=req.event_id,
            matchup=matchup,
            probs=probs_block,
            odds=odds_block,
            value=value_block,
        )
