from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Query

from src.db.pg import pg_conn
from src.product.model_registry import get_active_model_version
from src.http.odds_router import (
    OddsBook,
    EdgeSummary,
    OddsEventRow,
    OddsEventsResponse,
    _fetch_latest_books_for_events,
    _market_probs_from_odds,
    _edge,
)

router = APIRouter(prefix="/product", tags=["product"])


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


@router.get("/index", response_model=OddsEventsResponse, response_model_exclude_none=False)
def product_index(
    sport_key: str = Query(...),
    hours_ahead: int = Query(168, ge=1, le=24 * 60),
    limit: int = Query(200, ge=1, le=1000),
) -> OddsEventsResponse:
    now = datetime.now(timezone.utc)
    end = now + timedelta(hours=int(hours_ahead))
    mv = get_active_model_version()

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
        s.event_id,
        s.sport_key,
        s.kickoff_utc,
        s.home_name,
        s.away_name,
        s.source_captured_at_utc,
        s.payload,
        e.match_status,
        e.match_score,
        b.odds_home,
        b.odds_draw,
        b.odds_away
      FROM product.matchup_snapshot_v1 s
      LEFT JOIN odds.odds_events e
        ON e.event_id = s.event_id
      LEFT JOIN best b
        ON b.event_id = s.event_id
      WHERE s.sport_key = %(sport_key)s
        AND s.model_version = %(model_version)s
        AND s.kickoff_utc IS NOT NULL
        AND s.kickoff_utc >= %(now)s
        AND s.kickoff_utc <= %(end)s
      ORDER BY s.kickoff_utc ASC
      LIMIT %(limit)s
    """

    events: List[OddsEventRow] = []

    with pg_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                sql,
                {
                    "sport_key": str(sport_key),
                    "model_version": str(mv),
                    "now": now,
                    "end": end,
                    "limit": int(limit),
                },
            )
            rows = cur.fetchall()

        event_ids = [str(r[0]) for r in rows]
        books_map = _fetch_latest_books_for_events(conn, event_ids)

        for (
            event_id,
            sport_key_db,
            kickoff_utc,
            home_name,
            away_name,
            source_captured_at_utc,
            payload_raw,
            match_status_db,
            match_score_db,
            odds_home,
            odds_draw,
            odds_away,
        ) in rows:
            payload = _coerce_payload(payload_raw)

            inputs = payload.get("inputs") or {}
            markets = payload.get("markets") or {}
            probs_1x2 = ((markets.get("1x2") or {}).get("p_model") or {})

            totals = markets.get("totals") or {}
            totals_p = totals.get("p_model") or {}
            totals_odds = totals.get("best_odds") or {}

            btts = markets.get("btts") or {}
            btts_p = btts.get("p_model") or {}

            snapshot_summary_candidate = {
                "totals": {
                    "line": totals.get("main_line"),
                    "p_over": totals_p.get("over"),
                    "p_under": totals_p.get("under"),
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

            snapshot_summary = snapshot_summary_candidate if has_snapshot_data else None

            has_model = (
                probs_1x2.get("home") is not None
                and probs_1x2.get("draw") is not None
                and probs_1x2.get("away") is not None
            )

            if has_model:
                match_status = "MODEL_FOUND"
                match_score = 1.0
            else:
                match_status = "NOT_FOUND"
                match_score = 0.0

            edge_summary = None
            if has_model and (odds_home is not None or odds_draw is not None or odds_away is not None):
                probs_block = {
                    "H": float(probs_1x2["home"]),
                    "D": float(probs_1x2["draw"]),
                    "A": float(probs_1x2["away"]),
                }

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

                best_outcome = None
                best_edge = None
                for k in ["H", "D", "A"]:
                    v = edges.get(k)
                    if v is None:
                        continue
                    if best_edge is None or v > best_edge:
                        best_edge = v
                        best_outcome = k

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

            events.append(
                OddsEventRow(
                    event_id=str(event_id),
                    sport_key=str(sport_key_db),
                    commence_time_utc=kickoff_utc.isoformat().replace("+00:00", "Z") if kickoff_utc else None,
                    home_name=str(home_name),
                    away_name=str(away_name),
                    latest_captured_at_utc=(
                        source_captured_at_utc.isoformat().replace("+00:00", "Z")
                        if source_captured_at_utc
                        else None
                    ),
                    match_status=str(match_status) if match_status is not None else None,
                    match_score=float(match_score) if match_score is not None else None,
                    odds_best={
                        "H": float(odds_home) if odds_home is not None else None,
                        "D": float(odds_draw) if odds_draw is not None else None,
                        "A": float(odds_away) if odds_away is not None else None,
                    } if (odds_home is not None or odds_draw is not None or odds_away is not None) else None,
                    odds_books=books_map.get(str(event_id), []),
                    edge_summary=edge_summary,
                    probs_1x2={
                        "H": float(probs_1x2["home"]),
                        "D": float(probs_1x2["draw"]),
                        "A": float(probs_1x2["away"]),
                    } if has_model else None,
                    has_model=bool(has_model),
                    snapshot_summary=snapshot_summary,
                    resolved_home_team_id=(
                        int(inputs["home_team_id"]) if inputs.get("home_team_id") is not None else None
                    ),
                    resolved_away_team_id=(
                        int(inputs["away_team_id"]) if inputs.get("away_team_id") is not None else None
                    ),
                )
            )

    return OddsEventsResponse(
        ok=True,
        generated_at_utc=datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        sport_key=str(sport_key),
        events=events,
    )