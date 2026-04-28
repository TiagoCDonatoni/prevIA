from __future__ import annotations

from typing import Any, Dict, List

from src.db.pg import pg_conn
from src.odds.provider_event_tracking import should_skip_provider_refresh
from src.odds.provider_usage import PROVIDER_ODDSPAPI


def _iso_dt(value: Any) -> str | None:
    if value is None:
        return None
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return str(value)


def _policy_bucket(hours_until: float | None) -> str:
    if hours_until is None:
        return "unknown"

    try:
        h = float(hours_until)
    except Exception:
        return "unknown"

    if h < 0:
        return "started_or_past"
    if h <= 24:
        return "matchday"
    if h <= 48:
        return "d_1"
    if h <= 72:
        return "d_3"

    return "outside_window"


def _empty_bucket_counts() -> Dict[str, int]:
    return {
        "matchday": 0,
        "d_1": 0,
        "d_3": 0,
        "outside_window": 0,
        "started_or_past": 0,
        "unknown": 0,
    }


def _empty_decision_counts() -> Dict[str, int]:
    return {
        "would_call_provider": 0,
        "skipped_by_refresh_log": 0,
        "skipped_not_eligible": 0,
    }


def oddspapi_enrichment_dry_run(
    *,
    window_hours: int = 72,
    limit: int = 50,
    respect_refresh_log: bool = True,
) -> Dict[str, Any]:
    """
    Lista eventos elegíveis para enriquecimento OddsPapi sem chamar provider externo.

    Contrato:
    - parte apenas de eventos já existentes em odds.odds_events;
    - exige resolved_fixture_id no core;
    - usa apenas futebol;
    - usa apenas jogos futuros;
    - não atualiza eventos iniciados/finalizados/cancelados;
    - não consome request da OddsPapi;
    - quando respect_refresh_log=True, mostra quais eventos seriam pulados
      por já terem status terminal no bucket operacional.
    """

    window_hours = max(1, min(int(window_hours or 72), 72))
    limit = max(1, min(int(limit or 50), 200))

    sql = """
      WITH eligible AS (
        SELECT
          oe.event_id,
          oe.sport_key,
          oe.commence_time_utc,
          oe.home_name AS odds_home_name,
          oe.away_name AS odds_away_name,
          oe.resolved_fixture_id,

          f.fixture_id,
          f.kickoff_utc,
          f.status_short,
          f.status_long,
          f.is_finished,
          f.is_cancelled,

          l.league_id,
          l.name AS league_name,
          l.country_name AS league_country_name,

          ht.name AS core_home_name,
          at.name AS core_away_name,

          EXTRACT(EPOCH FROM (f.kickoff_utc - now())) / 3600.0 AS hours_until,

          oddspapi_1x2.last_oddspapi_1x2_at_utc,
          COALESCE(oddspapi_1x2.oddspapi_1x2_snapshots, 0) AS oddspapi_1x2_snapshots

        FROM odds.odds_events oe
        JOIN core.fixtures f
          ON f.fixture_id = oe.resolved_fixture_id
        JOIN core.leagues l
          ON l.league_id = f.league_id
        JOIN core.teams ht
          ON ht.team_id = f.home_team_id
        JOIN core.teams at
          ON at.team_id = f.away_team_id
        LEFT JOIN (
          SELECT
            event_id,
            MAX(captured_at_utc) AS last_oddspapi_1x2_at_utc,
            COUNT(*) AS oddspapi_1x2_snapshots
          FROM odds.odds_snapshots_1x2
          WHERE bookmaker LIKE 'oddspapi:%%'
          GROUP BY event_id
        ) oddspapi_1x2
          ON oddspapi_1x2.event_id = oe.event_id
        WHERE oe.resolved_fixture_id IS NOT NULL
          AND oe.sport_key LIKE 'soccer_%%'
          AND f.kickoff_utc > now()
          AND f.kickoff_utc <= now() + (%(window_hours)s || ' hours')::interval
          AND COALESCE(f.is_finished, false) = false
          AND COALESCE(f.is_cancelled, false) = false
          AND COALESCE(f.status_short, 'NS') NOT IN (
            '1H', 'HT', '2H', 'ET', 'P', 'FT', 'AET', 'PEN', 'BT',
            'SUSP', 'INT', 'PST', 'CANC', 'ABD', 'AWD', 'WO'
          )
      )
      SELECT
        event_id,
        sport_key,
        commence_time_utc,
        odds_home_name,
        odds_away_name,
        resolved_fixture_id,
        fixture_id,
        kickoff_utc,
        status_short,
        status_long,
        is_finished,
        is_cancelled,
        league_id,
        league_name,
        league_country_name,
        core_home_name,
        core_away_name,
        hours_until,
        last_oddspapi_1x2_at_utc,
        oddspapi_1x2_snapshots
      FROM eligible
      ORDER BY kickoff_utc ASC, sport_key ASC, event_id ASC
      LIMIT %(limit)s
    """

    items: List[Dict[str, Any]] = []
    buckets = _empty_bucket_counts()
    decisions = _empty_decision_counts()

    with pg_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                sql,
                {
                    "window_hours": int(window_hours),
                    "limit": int(limit),
                },
            )
            rows = cur.fetchall() or []

        for r in rows:
            event_id = str(r[0])
            sport_key = str(r[1])
            core_fixture_id = int(r[6]) if r[6] is not None else None
            hours_until = float(r[17]) if r[17] is not None else None
            bucket = _policy_bucket(hours_until)
            buckets[bucket] = int(buckets.get(bucket, 0)) + 1

            is_eligible_bucket = bucket in {"matchday", "d_1", "d_3"}

            skip_info: Dict[str, Any] = {
                "skip": False,
                "reason": None,
                "existing": None,
            }

            if is_eligible_bucket and respect_refresh_log and core_fixture_id is not None:
                skip_info = should_skip_provider_refresh(
                    conn,
                    provider=PROVIDER_ODDSPAPI,
                    core_fixture_id=core_fixture_id,
                    policy_bucket=bucket,
                )

            would_call_provider = bool(is_eligible_bucket and not skip_info.get("skip"))

            if not is_eligible_bucket:
                decisions["skipped_not_eligible"] += 1
            elif skip_info.get("skip"):
                decisions["skipped_by_refresh_log"] += 1
            else:
                decisions["would_call_provider"] += 1

            oddspapi_snapshot_count = int(r[19] or 0)

            items.append(
                {
                    "event_id": event_id,
                    "sport_key": sport_key,
                    "commence_time_utc": _iso_dt(r[2]),
                    "odds_home_name": str(r[3]) if r[3] is not None else None,
                    "odds_away_name": str(r[4]) if r[4] is not None else None,
                    "resolved_fixture_id": int(r[5]) if r[5] is not None else None,
                    "fixture_id": core_fixture_id,
                    "kickoff_utc": _iso_dt(r[7]),
                    "status_short": str(r[8]) if r[8] is not None else None,
                    "status_long": str(r[9]) if r[9] is not None else None,
                    "is_finished": bool(r[10]),
                    "is_cancelled": bool(r[11]),
                    "league": {
                        "league_id": int(r[12]) if r[12] is not None else None,
                        "name": str(r[13]) if r[13] is not None else None,
                        "country_name": str(r[14]) if r[14] is not None else None,
                    },
                    "core_home_name": str(r[15]) if r[15] is not None else None,
                    "core_away_name": str(r[16]) if r[16] is not None else None,
                    "hours_until": round(hours_until, 3) if hours_until is not None else None,
                    "policy_bucket": bucket,
                    "existing_oddspapi": {
                        "last_1x2_at_utc": _iso_dt(r[18]),
                        "snapshots_1x2": oddspapi_snapshot_count,
                        "has_snapshots": oddspapi_snapshot_count > 0,
                    },
                    "refresh_decision": {
                        "would_call_provider": would_call_provider,
                        "skip": bool(skip_info.get("skip")),
                        "skip_reason": skip_info.get("reason"),
                        "respect_refresh_log": bool(respect_refresh_log),
                        "existing_refresh_log": skip_info.get("existing"),
                    },
                }
            )

    return {
        "ok": True,
        "mode": "dry_run",
        "provider": PROVIDER_ODDSPAPI,
        "source_of_truth": "current_primary_provider",
        "request_count_consumed": 0,
        "window_hours": int(window_hours),
        "limit": int(limit),
        "count": len(items),
        "buckets": buckets,
        "decisions": decisions,
        "event_level_provider_call_candidates": decisions["would_call_provider"],
        "respect_refresh_log": bool(respect_refresh_log),
        "policy": {
            "runs_inside_pipeline_run_all": False,
            "calls_oddspapi": False,
            "creates_events": False,
            "updates_event_metadata": False,
            "requires_resolved_fixture_id": True,
            "skip_started_or_finished": True,
            "skip_terminal_refresh_log": bool(respect_refresh_log),
        },
        "items": items,
    }