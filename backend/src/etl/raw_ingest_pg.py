from __future__ import annotations

import hashlib
import json
from typing import Any, Dict, Optional, Tuple

from psycopg.types.json import Json

from src.db.pg import pg_conn, pg_tx


def _canonical_json(obj: Any) -> str:
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

    # IMPORTANT: psycopg precisa de Json() para jsonb
    params = {
        "provider": provider,
        "endpoint": endpoint,
        "request_params": Json(json.loads(_canonical_json(request_params))),
        "response_body": Json(json.loads(_canonical_json(response_body))),
        "response_hash": response_hash,
        "http_status": int(http_status),
        "ok": bool(ok),
        "error_message": error_message,
    }

    with pg_conn() as conn:
        with pg_tx(conn):
            with conn.cursor() as cur:
                cur.execute(sql, params)
                row = cur.fetchone()

    inserted = row is not None
    return inserted, response_hash
