from __future__ import annotations

import json
from typing import Any, Dict, List

from src.core.settings import load_settings
from src.db.pg import pg_conn, pg_tx
from src.provider.apifootball.client import ApiFootballClient
from src.etl.core_etl_pg import LEAGUES_UPSERT_SQL, map_league


def _iter_response_items(payload: Dict[str, Any]) -> List[Dict[str, Any]]:
    # API-Football style
    resp = payload.get("response")
    if isinstance(resp, list):
        return [x for x in resp if isinstance(x, dict)]
    return []


def main() -> None:
    s = load_settings()
    client = ApiFootballClient(
        base_url=s.apifootball_base_url,
        api_key=s.apifootball_key,
        timeout_s=int(s.app_defaults.get("http_timeout_s", 30)),
    )

    status, payload = client.get("/leagues", {})  # sem paginação
    if not (200 <= int(status) < 300) or not isinstance(payload, dict):
        raise SystemExit(f"/leagues failed: status={status} payload_type={type(payload)}")

    api_errors = payload.get("errors")
    if isinstance(api_errors, dict) and len(api_errors) > 0:
        raise SystemExit(f"/leagues returned errors: {api_errors}")

    items = _iter_response_items(payload)
    mapped = [map_league(it) for it in items]
    mapped = [m for m in mapped if m is not None]

    upserts = 0
    with pg_conn() as conn:
        with pg_tx(conn):
            with conn.cursor() as cur:
                for row in mapped:
                    cur.execute(LEAGUES_UPSERT_SQL, row)
                    upserts += 1

    print(json.dumps({"status": int(status), "items": len(items), "upserts": upserts}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
