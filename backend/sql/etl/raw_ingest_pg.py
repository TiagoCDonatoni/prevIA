# backend/src/etl/raw_ingest_pg.py
from __future__ import annotations

import argparse
import hashlib
import json
from typing import Any, Dict, Optional, Tuple

from src.db.pg import pg_conn, pg_tx


def _canonical_json(obj: Any) -> str:
    # Canonicaliza para hash estável
    return json.dumps(obj, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def _sha256_hex(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


def compute_response_hash(payload: Any) -> str:
    return _sha256_hex(_canonical_json(payload))


def insert_raw_response(
    *,
    provider: str,
    endpoint: str,
    request_params: Dict[str, Any],
    response_body: Dict[str, Any],
    http_status: int,
    ok: bool,
    error_message: Optional[str] = None,
) -> Tuple[bool, str]:
    """
    Returns:
      (inserted, response_hash)
    inserted=False quando deduplicou (UNIQUE on provider+endpoint+hash)
    """
    response_hash = compute_response_hash(response_body)

    sql = """
    insert into raw.api_responses (
      provider, endpoint, request_params, response_body,
      response_hash, http_status, ok, error_message
    )
    values (
      %(provider)s, %(endpoint)s, %(request_params)s, %(response_body)s,
      %(response_hash)s, %(http_status)s, %(ok)s, %(error_message)s
    )
    on conflict (provider, endpoint, response_hash) do nothing
    returning id;
    """

    params = {
        "provider": provider,
        "endpoint": endpoint,
        "request_params": json.loads(_canonical_json(request_params)),
        "response_body": json.loads(_canonical_json(response_body)),
        "response_hash": response_hash,
        "http_status": http_status,
        "ok": ok,
        "error_message": error_message,
    }

    with pg_conn() as conn:
        with pg_tx(conn):
            with conn.cursor() as cur:
                cur.execute(sql, params)
                row = cur.fetchone()

    inserted = row is not None
    return inserted, response_hash


def _read_json_file(path: str) -> Any:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def main() -> None:
    ap = argparse.ArgumentParser(description="RAW ingest into Postgres (idempotent)")
    ap.add_argument("--provider", required=True, help="ex: api-football")
    ap.add_argument("--endpoint", required=True, help="ex: fixtures | leagues | teams (your chosen key)")
    ap.add_argument("--params", required=False, default="{}", help="JSON string for request_params")
    ap.add_argument("--payload-file", required=True, help="Path to a JSON file (API response body)")
    ap.add_argument("--http-status", required=False, type=int, default=200)
    ap.add_argument("--ok", required=False, type=int, default=1, help="1 ok / 0 not ok")
    ap.add_argument("--error", required=False, default=None)

    args = ap.parse_args()

    request_params = json.loads(args.params)
    response_body = _read_json_file(args.payload_file)

    inserted, h = insert_raw_response(
        provider=args.provider,
        endpoint=args.endpoint,
        request_params=request_params,
        response_body=response_body,
        http_status=args.http_status,
        ok=bool(args.ok),
        error_message=args.error,
    )

    print(
        json.dumps(
            {
                "inserted": inserted,
                "response_hash": h,
                "provider": args.provider,
                "endpoint": args.endpoint,
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
