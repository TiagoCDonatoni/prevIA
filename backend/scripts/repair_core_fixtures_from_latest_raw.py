from __future__ import annotations

import argparse
import sys
from pathlib import Path
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Set

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from src.db.pg import pg_conn
from src.etl.core_etl_pg import (
    FIXTURES_UPSERT_SQL,
    _apply_upserts,
    _iter_response_items,
    map_fixture,
)


def _parse_fixture_ids(value: Optional[str]) -> Optional[Set[int]]:
    if not value:
        return None
    out: Set[int] = set()
    for part in value.split(","):
        part = part.strip()
        if not part:
            continue
        out.add(int(part))
    return out or None


def _safe_int(value: Any) -> Optional[int]:
    try:
        if value is None:
            return None
        return int(value)
    except Exception:
        return None


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Repair core.fixtures from latest raw fixtures snapshots"
    )
    parser.add_argument(
        "--lookback-days",
        type=int,
        default=30,
        help="Only inspect raw fixture payloads fetched in the last N days (default: 30)",
    )
    parser.add_argument(
        "--fixture-ids",
        type=str,
        default=None,
        help="Optional comma-separated list of fixture_ids to repair only specific fixtures",
    )
    args = parser.parse_args()

    lookback_days = int(args.lookback_days)
    only_fixture_ids = _parse_fixture_ids(args.fixture_ids)

    start_utc = datetime.now(timezone.utc) - timedelta(days=lookback_days)

    sql = """
      SELECT
        fetched_at_utc,
        response_body
      FROM raw.api_responses
      WHERE provider = 'apifootball'
        AND endpoint = 'fixtures'
        AND ok = true
        AND fetched_at_utc >= %(start_utc)s
      ORDER BY fetched_at_utc DESC
    """

    latest_items_by_fixture: Dict[int, dict] = {}
    raw_rows = 0
    response_items = 0

    with pg_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, {"start_utc": start_utc})
            rows = cur.fetchall() or []

    raw_rows = len(rows)

    for fetched_at_utc, response_body in rows:
        for item in _iter_response_items(response_body):
            response_items += 1

            fixture_id = _safe_int(((item or {}).get("fixture") or {}).get("id"))
            if fixture_id is None:
                continue

            if only_fixture_ids is not None and fixture_id not in only_fixture_ids:
                continue

            # Rows are already ordered by fetched_at_utc DESC.
            # Keep the first occurrence only => latest snapshot wins.
            if fixture_id in latest_items_by_fixture:
                continue

            latest_items_by_fixture[fixture_id] = item

    mapped: List[dict] = []
    status_counts: Dict[str, int] = {}

    for fixture_id, item in latest_items_by_fixture.items():
        row = map_fixture(item)
        if row is None:
            continue

        mapped.append(row)

        status_short = str(row.get("status_short") or "UNKNOWN")
        status_counts[status_short] = status_counts.get(status_short, 0) + 1

    upserts = _apply_upserts(FIXTURES_UPSERT_SQL, mapped)

    print(
        {
            "ok": True,
            "lookback_days": lookback_days,
            "raw_rows": raw_rows,
            "response_items": response_items,
            "latest_unique_fixtures": len(latest_items_by_fixture),
            "mapped_rows": len(mapped),
            "upserts": upserts,
            "status_counts": dict(sorted(status_counts.items(), key=lambda kv: kv[0])),
            "fixture_ids_filter_count": len(only_fixture_ids) if only_fixture_ids else None,
        }
    )


if __name__ == "__main__":
    main()