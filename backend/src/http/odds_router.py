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
    best_outcome: Optional[str] = None  # outcome com maior consensus edge
    best_edge: Optional[float] = None   # model_p - consensus_market_novig_p

    best_odd: Optional[float] = None    # melhor odd executável do best_outcome
    best_book_key: Optional[str] = None
    best_book_name: Optional[str] = None

    best_ev: Optional[float] = None     # maior EV executável entre H/D/A
    best_ev_outcome: Optional[str] = None
    best_ev_odd: Optional[float] = None
    best_ev_book_key: Optional[str] = None
    best_ev_book_name: Optional[str] = None

    opportunity_outcome: Optional[str] = None
    opportunity_edge: Optional[float] = None
    opportunity_ev: Optional[float] = None
    opportunity_odd: Optional[float] = None
    opportunity_book_key: Optional[str] = None
    opportunity_book_name: Optional[str] = None
    opportunity_book_captured_at_utc: Optional[str] = None
    opportunity_book_freshness_seconds: Optional[int] = None

    market_books_count: int = 0
    market_complete_books_count: int = 0
    market_min_odd: Optional[float] = None
    market_max_odd: Optional[float] = None

    consensus_probs: Optional[Dict[str, Optional[float]]] = None
    consensus_edges: Optional[Dict[str, Optional[float]]] = None
    market_source: Optional[str] = None

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
    probs_1x2: Optional[Dict[str, Optional[float]]] = None  # H/D/A
    has_model: Optional[bool] = None
    edge_summary: Optional[EdgeSummary] = None
    snapshot_summary: Optional[Dict[str, Any]] = None
    resolved_home_team_id: Optional[int] = None
    resolved_away_team_id: Optional[int] = None

class OddsBook(BaseModel):
    key: str
    name: str
    is_affiliate: bool = False
    url: Optional[str] = None
    captured_at_utc: Optional[str] = None
    odds_1x2: Optional[Dict[str, Optional[float]]] = None  # H/D/A

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
    artifact_filename: str | None = None
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

def _coerce_payload(payload: Any) -> Dict[str, Any]:
    if payload is None:
        return {}
    if isinstance(payload, dict):
        return payload
    if isinstance(payload, str):
        try:
            return json.loads(payload)
        except Exception:
            return {}
    return {}


def _build_snapshot_summary(snapshot_payload_obj: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    if not snapshot_payload_obj:
        return None

    mk = snapshot_payload_obj.get("markets") or {}
    totals = mk.get("totals") or {}
    totals_p = totals.get("p_model") or {}
    totals_odds = totals.get("best_odds") or {}
    totals_lines = totals.get("lines") or {}
    totals_25 = totals_lines.get("2.5") or {}

    totals_line = totals.get("main_line")
    totals_p_over = totals_p.get("over")
    totals_p_under = totals_p.get("under")

    if totals_line is None and totals_25:
        totals_line = 2.5
    if totals_p_over is None:
        totals_p_over = totals_25.get("over")
    if totals_p_under is None:
        totals_p_under = totals_25.get("under")

    btts = mk.get("btts") or {}
    btts_p = btts.get("p_model") or {}
    inputs = snapshot_payload_obj.get("inputs") or {}

    snapshot_summary_candidate = {
        "totals": {
            "line": totals_line,
            "p_over": totals_p_over,
            "p_under": totals_p_under,
            "best_over": totals_odds.get("over"),
            "best_under": totals_odds.get("under"),
        },
        "btts": {
            "p_yes": btts_p.get("yes"),
            "p_no": btts_p.get("no"),
        },
        "inputs": {
            "lambda_home": inputs.get("lambda_home"),
            "lambda_away": inputs.get("lambda_away"),
            "lambda_total": inputs.get("lambda_total"),
        },
    }

    has_snapshot_data = any(
        v is not None
        for group in snapshot_summary_candidate.values()
        if isinstance(group, dict)
        for v in group.values()
    )

    return snapshot_summary_candidate if has_snapshot_data else None

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
    rows: [(bookmaker, odds_home, odds_draw, odds_away, captured_at_utc), ...]
    """
    aff = _load_affiliates()
    out: List[OddsBook] = []

    for (bookmaker, oh, od, oa, captured_at_utc) in rows:
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
                captured_at_utc=(
                    captured_at_utc.isoformat().replace("+00:00", "Z")
                    if captured_at_utc is not None
                    else None
                ),
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
      SELECT s.event_id, s.bookmaker, s.odds_home, s.odds_draw, s.odds_away, t.max_ts
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
        for (eid, bookmaker, oh, od, oa, max_ts) in cur.fetchall():
            by_event.setdefault(str(eid), []).append((bookmaker, oh, od, oa, max_ts))

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


def _market_probs_from_odds(
    odds_h: Optional[float],
    odds_d: Optional[float],
    odds_a: Optional[float],
) -> Dict[str, Any]:
    raw = {
        "H": _implied_prob(odds_h),
        "D": _implied_prob(odds_d),
        "A": _implied_prob(odds_a),
    }
    s = sum(v for v in raw.values() if v is not None)
    if s <= 0:
        return {"raw": raw, "novig": None, "overround": None}
    novig = {k: (v / s if v is not None else None) for k, v in raw.items()}
    return {"raw": raw, "novig": novig, "overround": float(s)}


def _edge(model_p: Optional[float], market_p: Optional[float]) -> Optional[float]:
    if model_p is None or market_p is None:
        return None
    return float(model_p) - float(market_p)


def _ev_decimal(model_p: Optional[float], odds: Optional[float]) -> Optional[float]:
    if model_p is None or odds is None:
        return None
    try:
        p = float(model_p)
        o = float(odds)
    except Exception:
        return None
    if p <= 0 or o <= 0:
        return None
    return (p * o) - 1.0


def _is_valid_decimal_odd(odd: Optional[float]) -> bool:
    if odd is None:
        return False
    try:
        v = float(odd)
    except Exception:
        return False
    return v > 1.0


def _median(values: List[float]) -> Optional[float]:
    cleaned: List[float] = []
    for value in values or []:
        try:
            fv = float(value)
        except Exception:
            continue
        if fv <= 0:
            continue
        cleaned.append(fv)

    if not cleaned:
        return None

    cleaned.sort()
    mid = len(cleaned) // 2

    if len(cleaned) % 2 == 1:
        return cleaned[mid]

    return (cleaned[mid - 1] + cleaned[mid]) / 2.0

MAX_VALID_ODD_PREMIUM_OVER_MEDIAN = 0.15

def _parse_utc_iso(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except Exception:
        return None


def _select_best_valid_price_for_side(books: List[OddsBook], side: str) -> Dict[str, Any]:
    candidates: List[Dict[str, Any]] = []

    for book in books or []:
        odd = (book.odds_1x2 or {}).get(side)
        if not _is_valid_decimal_odd(odd):
            continue

        candidates.append(
            {
                "odd": float(odd),
                "book_key": book.key,
                "book_name": book.name,
                "captured_at_utc": book.captured_at_utc,
            }
        )

    if not candidates:
        return {
            "books_count": 0,
            "median_odd": None,
            "allowed_max_odd": None,
            "best_odd": None,
            "best_book_key": None,
            "best_book_name": None,
            "best_book_captured_at_utc": None,
            "best_book_freshness_seconds": None,
            "market_min_odd": None,
            "market_max_odd": None,
        }

    odds_values = [float(item["odd"]) for item in candidates]
    median_odd = _median(odds_values)
    allowed_max_odd = (
        float(median_odd) * (1.0 + MAX_VALID_ODD_PREMIUM_OVER_MEDIAN)
        if median_odd is not None
        else None
    )

    valid_candidates = [
        item for item in candidates
        if allowed_max_odd is None or float(item["odd"]) <= float(allowed_max_odd)
    ]

    if not valid_candidates:
        valid_candidates = candidates

    best_item = max(valid_candidates, key=lambda item: float(item["odd"]))

    freshness_seconds = None
    captured_dt = _parse_utc_iso(best_item.get("captured_at_utc"))
    if captured_dt is not None:
        freshness_seconds = max(
            0,
            int((datetime.now(timezone.utc) - captured_dt).total_seconds()),
        )

    return {
        "books_count": len(candidates),
        "median_odd": float(median_odd) if median_odd is not None else None,
        "allowed_max_odd": float(allowed_max_odd) if allowed_max_odd is not None else None,
        "best_odd": float(best_item["odd"]),
        "best_book_key": best_item.get("book_key"),
        "best_book_name": best_item.get("book_name"),
        "best_book_captured_at_utc": best_item.get("captured_at_utc"),
        "best_book_freshness_seconds": freshness_seconds,
        "market_min_odd": min(odds_values) if odds_values else None,
        "market_max_odd": max(odds_values) if odds_values else None,
    }

def _consensus_market_probs_from_books(books: List[OddsBook]) -> Dict[str, Any]:
    per_outcome: Dict[str, List[float]] = {"H": [], "D": [], "A": []}
    complete_books_count = 0

    for book in books or []:
        odds = book.odds_1x2 or {}
        oh = odds.get("H")
        od = odds.get("D")
        oa = odds.get("A")

        if not (
            _is_valid_decimal_odd(oh)
            and _is_valid_decimal_odd(od)
            and _is_valid_decimal_odd(oa)
        ):
            continue

        market = _market_probs_from_odds(float(oh), float(od), float(oa))
        novig = market.get("novig") or {}

        if any(novig.get(side) is None for side in ("H", "D", "A")):
            continue

        complete_books_count += 1
        for side in ("H", "D", "A"):
            per_outcome[side].append(float(novig[side]))

    if complete_books_count == 0:
        return {
            "raw": None,
            "novig": None,
            "overround": None,
            "books_count": 0,
            "source": "median_complete_books_novig",
        }

    consensus_raw = {
        side: _median(per_outcome[side])
        for side in ("H", "D", "A")
    }

    total = sum(v for v in consensus_raw.values() if v is not None)
    if total <= 0:
        return {
            "raw": consensus_raw,
            "novig": None,
            "overround": None,
            "books_count": complete_books_count,
            "source": "median_complete_books_novig",
        }

    consensus_novig = {
        side: (float(consensus_raw[side]) / float(total) if consensus_raw[side] is not None else None)
        for side in ("H", "D", "A")
    }

    return {
        "raw": consensus_raw,
        "novig": consensus_novig,
        "overround": None,
        "books_count": complete_books_count,
        "source": "median_complete_books_novig",
    }


def _build_edge_summary_from_books(
    probs_block: Dict[str, Optional[float]],
    books: List[OddsBook],
) -> Optional[EdgeSummary]:
    if not probs_block:
        return None

    market = _consensus_market_probs_from_books(books)
    consensus = market.get("novig") or {}
    if not consensus:
        return None

    edges = {
        "H": _edge(probs_block.get("H"), consensus.get("H")),
        "D": _edge(probs_block.get("D"), consensus.get("D")),
        "A": _edge(probs_block.get("A"), consensus.get("A")),
    }

    best_outcome = None
    best_edge = None
    for side in ("H", "D", "A"):
        edge_value = edges.get(side)
        if edge_value is None:
            continue
        if best_edge is None or edge_value > best_edge:
            best_edge = edge_value
            best_outcome = side

    per_side_prices: Dict[str, Dict[str, Any]] = {}
    overall_best_ev = None
    overall_best_ev_outcome = None
    overall_best_ev_odd = None
    overall_best_ev_book_key = None
    overall_best_ev_book_name = None

    for side in ("H", "D", "A"):
        price_info = _select_best_valid_price_for_side(books, side)
        side_best_ev = _ev_decimal(probs_block.get(side), price_info.get("best_odd"))

        price_info["best_ev"] = side_best_ev
        per_side_prices[side] = price_info

        if side_best_ev is not None and (overall_best_ev is None or side_best_ev > overall_best_ev):
            overall_best_ev = side_best_ev
            overall_best_ev_outcome = side
            overall_best_ev_odd = price_info.get("best_odd")
            overall_best_ev_book_key = price_info.get("best_book_key")
            overall_best_ev_book_name = price_info.get("best_book_name")

    best_price = per_side_prices.get(best_outcome) if best_outcome else None

    opportunity_outcome = None
    opportunity_edge = None
    opportunity_ev = None

    for side in ("H", "D", "A"):
        edge_value = edges.get(side)
        ev_value = per_side_prices.get(side, {}).get("best_ev")

        if edge_value is None or ev_value is None:
            continue

        if (
            opportunity_outcome is None
            or edge_value > opportunity_edge
            or (
                edge_value == opportunity_edge
                and opportunity_ev is not None
                and ev_value > opportunity_ev
            )
        ):
            opportunity_outcome = side
            opportunity_edge = edge_value
            opportunity_ev = ev_value

    opportunity_price = per_side_prices.get(opportunity_outcome) if opportunity_outcome else None

    return EdgeSummary(
        best_outcome=best_outcome,
        best_edge=float(best_edge) if best_edge is not None else None,

        best_odd=best_price.get("best_odd") if best_price else None,
        best_book_key=best_price.get("best_book_key") if best_price else None,
        best_book_name=best_price.get("best_book_name") if best_price else None,

        best_ev=float(overall_best_ev) if overall_best_ev is not None else None,
        best_ev_outcome=overall_best_ev_outcome,
        best_ev_odd=overall_best_ev_odd,
        best_ev_book_key=overall_best_ev_book_key,
        best_ev_book_name=overall_best_ev_book_name,

        opportunity_outcome=opportunity_outcome,
        opportunity_edge=float(opportunity_edge) if opportunity_edge is not None else None,
        opportunity_ev=float(opportunity_ev) if opportunity_ev is not None else None,
        opportunity_odd=opportunity_price.get("best_odd") if opportunity_price else None,
        opportunity_book_key=opportunity_price.get("best_book_key") if opportunity_price else None,
        opportunity_book_name=opportunity_price.get("best_book_name") if opportunity_price else None,
        opportunity_book_captured_at_utc=(
            opportunity_price.get("best_book_captured_at_utc") if opportunity_price else None
        ),
        opportunity_book_freshness_seconds=(
            opportunity_price.get("best_book_freshness_seconds") if opportunity_price else None
        ),

        market_books_count=int(market.get("books_count") or 0),
        market_complete_books_count=int(market.get("books_count") or 0),
        market_min_odd=best_price.get("market_min_odd") if best_price else None,
        market_max_odd=best_price.get("market_max_odd") if best_price else None,

        consensus_probs={
            "H": consensus.get("H"),
            "D": consensus.get("D"),
            "A": consensus.get("A"),
        },
        consensus_edges={
            "H": edges.get("H"),
            "D": edges.get("D"),
            "A": edges.get("A"),
        },
        market_source=str(market.get("source") or "median_complete_books_novig"),
    )


def _build_value_block_from_books(
    probs_block: Dict[str, Optional[float]],
    books: List[OddsBook],
) -> Optional[Dict[str, Any]]:
    if not probs_block:
        return None

    market = _consensus_market_probs_from_books(books)
    consensus = market.get("novig") or {}
    if not consensus:
        return None

    edges = {
        "H": _edge(probs_block.get("H"), consensus.get("H")),
        "D": _edge(probs_block.get("D"), consensus.get("D")),
        "A": _edge(probs_block.get("A"), consensus.get("A")),
    }

    ev_decimal: Dict[str, Optional[float]] = {"H": None, "D": None, "A": None}
    best_ev = None
    best_side = None

    for side in ("H", "D", "A"):
        price_info = _select_best_valid_price_for_side(books, side)
        ev_value = _ev_decimal(probs_block.get(side), price_info.get("best_odd"))
        ev_decimal[side] = ev_value

        if ev_value is not None and (best_ev is None or ev_value > best_ev):
            best_ev = ev_value
            best_side = side

    return {
        "market": market,
        "edge": edges,
        "ev_decimal": ev_decimal,
        "best_ev": best_ev,
        "best_side": best_side,
    }


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
      ),
      latest_snap_fx AS (
        SELECT DISTINCT ON (s.fixture_id)
          s.fixture_id,
          s.updated_at_utc,
          s.payload
        FROM product.matchup_snapshot_v1 s
        WHERE s.fixture_id IS NOT NULL
        ORDER BY s.fixture_id, s.updated_at_utc DESC
      ),
      latest_snap_ev AS (
        SELECT DISTINCT ON (s.event_id)
          s.event_id,
          s.updated_at_utc,
          s.payload
        FROM product.matchup_snapshot_v1 s
        WHERE s.event_id IS NOT NULL
        ORDER BY s.event_id, s.updated_at_utc DESC
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
        b.odds_away,
        COALESCE(lsfx.payload, lsev.payload) AS snapshot_payload
      FROM odds.odds_events e
      LEFT JOIN last_ts lt ON lt.event_id = e.event_id
      LEFT JOIN best b ON b.event_id = e.event_id
      LEFT JOIN latest_snap_fx lsfx
        ON lsfx.fixture_id = e.resolved_fixture_id
      LEFT JOIN latest_snap_ev lsev
        ON lsev.event_id = e.event_id
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
            resolved_fixture_id,
            match_status,
            match_score,
            max_ts,
            odds_home,
            odds_draw,
            odds_away,
            snapshot_payload,
        ) in rows:

            edge_summary = None
            snapshot_summary = None

            snapshot_payload_obj = _coerce_payload(snapshot_payload)
            snapshot_summary = _build_snapshot_summary(snapshot_payload_obj)

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
                        af = (artifact_filename or "").strip()
                        if not af:
                            af = _fetch_artifact_filename_for_league(conn, league_id=int(assume_league_id))

                        if not af:
                            raise ValueError("no_model_artifact_for_league")

                        pred = predict_1x2_from_artifact(
                            artifact_filename=str(af),
                            league_id=int(assume_league_id),
                            season=int(pick["season_used"]),
                            home_team_id=int(resolved_home_team_id),
                            away_team_id=int(resolved_away_team_id),
                        )
                        probs = pred.get("probs") or pred.get("probs_1x2") or None

                        if probs:
                            probs_block = {"H": float(probs["H"]), "D": float(probs["D"]), "A": float(probs["A"])}

                            books = books_map.get(str(event_id), []) or []
                            edge_summary = _build_edge_summary_from_books(probs_block, books)
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
                    snapshot_summary=snapshot_summary,
                    resolved_home_team_id=int(resolved_home_team_id) if resolved_home_team_id is not None else None,
                    resolved_away_team_id=int(resolved_away_team_id) if resolved_away_team_id is not None else None,
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
                # resolve artifact automaticamente se o client não enviar
                artifact_filename = (req.artifact_filename or "").strip()
                if not artifact_filename:
                    artifact_filename = _fetch_artifact_filename_for_league(
                        conn,
                        league_id=int(req.assume_league_id),
                    )

                matchup["artifact_filename_used"] = artifact_filename

                if not artifact_filename:
                    matchup["model_status"] = "NO_MODEL_ARTIFACT"
                else:
                    try:
                        pred = predict_1x2_from_artifact(
                            artifact_filename=str(artifact_filename),
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
        if probs_block and odds_books:
            value_block = _build_value_block_from_books(probs_block, odds_books)

        return QuoteResponse(
            ok=True,
            event_id=req.event_id,
            matchup=matchup,
            probs=probs_block,
            odds=odds_block,
            value=value_block,
        )

@router.get("/matchup/snapshot")
def get_matchup_snapshot(
    fixture_id: int | None = Query(default=None),
    event_id: str | None = Query(default=None),
    model_version: str = Query(default="model_v0"),
):
    if fixture_id is None and event_id is None:
        raise HTTPException(status_code=400, detail="provide fixture_id or event_id")

    if fixture_id is not None:
        sql = """
          SELECT snapshot_id, fixture_id, event_id, sport_key, kickoff_utc,
                 home_name, away_name, source_captured_at_utc, model_version, payload,
                 generated_at_utc, updated_at_utc
          FROM product.matchup_snapshot_v1
          WHERE model_version = %(model_version)s
            AND fixture_id = %(fixture_id)s
          ORDER BY updated_at_utc DESC
          LIMIT 1
        """
        params = {"fixture_id": int(fixture_id), "model_version": model_version}

    else:
        sql = """
          SELECT snapshot_id, fixture_id, event_id, sport_key, kickoff_utc,
                 home_name, away_name, source_captured_at_utc, model_version, payload,
                 generated_at_utc, updated_at_utc
          FROM product.matchup_snapshot_v1
          WHERE model_version = %(model_version)s
            AND event_id = %(event_id)s
          ORDER BY updated_at_utc DESC
          LIMIT 1
        """
        params = {"event_id": str(event_id), "model_version": model_version}

    with pg_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            r = cur.fetchone()

    if not r:
        raise HTTPException(status_code=404, detail="snapshot_not_found")

    return {
        "snapshot_id": r[0],
        "fixture_id": r[1],
        "event_id": r[2],
        "sport_key": r[3],
        "kickoff_utc": r[4].isoformat().replace("+00:00", "Z") if r[4] else None,
        "home_name": r[5],
        "away_name": r[6],
        "source_captured_at_utc": r[7].isoformat().replace("+00:00", "Z") if r[7] else None,
        "model_version": r[8],
        "payload": r[9],
        "generated_at_utc": r[10].isoformat().replace("+00:00", "Z") if r[10] else None,
        "updated_at_utc": r[11].isoformat().replace("+00:00", "Z") if r[11] else None,
    }

@router.get("/matchups")
def list_matchups_cards(
    sport_key: str = Query(..., min_length=2),
    hours_ahead: int = Query(default=72, ge=1, le=24 * 30),
    limit: int = Query(default=50, ge=1, le=500),
    model_version: str = Query(default="model_v0"),
):
    """
    Lista próximos jogos (odds_events) e junta o snapshot mais recente por fixture_id.
    Retorna também um summary "flat" para uso direto no card do frontend.
    """
    sql = """
      WITH upcoming AS (
        SELECT
          e.event_id,
          e.sport_key,
          e.commence_time_utc AS kickoff_utc,
          e.home_name,
          e.away_name,
          e.resolved_fixture_id AS fixture_id
        FROM odds.odds_events e
        WHERE e.sport_key = %(sport_key)s
          AND e.commence_time_utc IS NOT NULL
          AND e.commence_time_utc >= now()
          AND e.commence_time_utc <= now() + (%(hours_ahead)s || ' hours')::interval
        ORDER BY e.commence_time_utc ASC
        LIMIT %(limit)s
      ),
    latest_snap_fx AS (
      SELECT DISTINCT ON (s.fixture_id)
        s.fixture_id,
        s.updated_at_utc,
        s.payload
      FROM product.matchup_snapshot_v1 s
      WHERE s.model_version = %(model_version)s
        AND s.fixture_id IS NOT NULL
      ORDER BY s.fixture_id, s.updated_at_utc DESC
    ),
    latest_snap_ev AS (
      SELECT DISTINCT ON (s.event_id)
        s.event_id,
        s.updated_at_utc,
        s.payload
      FROM product.matchup_snapshot_v1 s
      WHERE s.model_version = %(model_version)s
        AND s.event_id IS NOT NULL
      ORDER BY s.event_id, s.updated_at_utc DESC
    )
    SELECT
      u.event_id,
      u.fixture_id,
      u.kickoff_utc,
      u.home_name,
      u.away_name,
      COALESCE(lsfx.updated_at_utc, lsev.updated_at_utc) AS snapshot_updated_at,
      COALESCE(lsfx.payload, lsev.payload) AS payload
    FROM upcoming u
    LEFT JOIN latest_snap_fx lsfx
      ON lsfx.fixture_id = u.fixture_id
    LEFT JOIN latest_snap_ev lsev
      ON lsev.event_id = u.event_id
    ORDER BY u.kickoff_utc ASC;
    """

    with pg_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                sql,
                {
                    "sport_key": sport_key,
                    "hours_ahead": int(hours_ahead),
                    "limit": int(limit),
                    "model_version": model_version,
                },
            )
            rows = cur.fetchall()

    items = []
    for r in rows:
        payload = r[6]
        summary = None

        # payload pode ser None se ainda não gerou snapshot
        if isinstance(payload, dict):
            summary = _build_snapshot_summary(payload)

        items.append(
            {
                "event_id": r[0],
                "fixture_id": r[1],
                "kickoff_utc": r[2].isoformat().replace("+00:00", "Z") if r[2] else None,
                "home_name": r[3],
                "away_name": r[4],
                "snapshot_updated_at": r[5].isoformat().replace("+00:00", "Z") if r[5] else None,
                "snapshot_summary": summary,
            }
        )

    return {"ok": True, "sport_key": sport_key, "items": items}