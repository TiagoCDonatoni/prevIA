from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Query

from src.db.pg import pg_conn
from src.product.model_registry import get_active_model_version
from src.http.odds_router import (
    OddsEventRow,
    OddsEventsResponse,
    _fetch_latest_books_for_events,
    _build_snapshot_summary,
    _build_edge_summary_from_books,
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
      WITH target_events AS (
        SELECT
          s.event_id,
          s.sport_key,
          s.kickoff_utc,
          s.home_name,
          s.away_name,
          s.source_captured_at_utc,
          s.payload
        FROM product.matchup_snapshot_v1 s
        WHERE s.sport_key = %(sport_key)s
          AND s.model_version = %(model_version)s
          AND s.kickoff_utc IS NOT NULL
          AND s.kickoff_utc >= %(now)s
          AND s.kickoff_utc <= %(end)s
        ORDER BY s.kickoff_utc ASC
        LIMIT %(limit)s
      ),
      last_ts AS (
        SELECT o.event_id, MAX(o.captured_at_utc) AS max_ts
        FROM odds.odds_snapshots_1x2 o
        JOIN target_events t
          ON t.event_id = o.event_id
        GROUP BY o.event_id
      ),
      best AS (
        SELECT
          s.event_id,
          MAX(s.odds_home) AS odds_home,
          MAX(s.odds_draw) AS odds_draw,
          MAX(s.odds_away) AS odds_away
        FROM odds.odds_snapshots_1x2 s
        JOIN last_ts lt
          ON lt.event_id = s.event_id
         AND lt.max_ts = s.captured_at_utc
        GROUP BY s.event_id
      )
      SELECT
        t.event_id,
        t.sport_key,
        t.kickoff_utc,
        t.home_name,
        t.away_name,
        t.source_captured_at_utc,
        t.payload,
        e.match_status,
        e.match_score,
        b.odds_home,
        b.odds_draw,
        b.odds_away
      FROM target_events t
      LEFT JOIN odds.odds_events e
        ON e.event_id = t.event_id
      LEFT JOIN best b
        ON b.event_id = t.event_id
      ORDER BY t.kickoff_utc ASC
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
            snapshot_summary = _build_snapshot_summary(payload)

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
            if has_model:
                probs_block = {
                    "H": float(probs_1x2["home"]),
                    "D": float(probs_1x2["draw"]),
                    "A": float(probs_1x2["away"]),
                }

                books = books_map.get(str(event_id), []) or []
                edge_summary = _build_edge_summary_from_books(probs_block, books)

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