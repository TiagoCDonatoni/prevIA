from __future__ import annotations

from typing import Any, Dict, Iterable, List, Optional, Set

from src.db.pg import pg_conn
from src.tools.domain import coerce_json_object, resolve_tool_access_record
from src.tools.feature_flags import get_enabled_tool_codes


def _normalize_enabled_tool_codes(enabled_tool_codes: Optional[Iterable[str]]) -> Set[str]:
    if enabled_tool_codes is None:
        return get_enabled_tool_codes()
    return {
        str(tool_code or "").strip().upper()
        for tool_code in enabled_tool_codes
        if str(tool_code or "").strip()
    }


def list_tool_catalog(*, enabled_tool_codes: Optional[Iterable[str]] = None) -> List[Dict[str, Any]]:
    enabled_codes = _normalize_enabled_tool_codes(enabled_tool_codes)
    if not enabled_codes:
        return []

    with pg_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT tool_code,
                       slug,
                       name_i18n_key,
                       free_enabled,
                       limits_config_json
                FROM tools.catalog
                WHERE active = TRUE
                ORDER BY tool_code ASC
                """
            )
            rows = cur.fetchall()

    return [
        {
            "tool_code": str(row[0]),
            "slug": str(row[1]),
            "name_i18n_key": str(row[2]),
            "free_enabled": bool(row[3]),
            "limits": coerce_json_object(row[4]),
        }
        for row in rows
        if str(row[0]).upper() in enabled_codes
    ]


def list_user_tool_access(
    user_id: int,
    *,
    enabled_tool_codes: Optional[Iterable[str]] = None,
) -> List[Dict[str, Any]]:
    enabled_codes = _normalize_enabled_tool_codes(enabled_tool_codes)
    if not enabled_codes:
        return []

    with pg_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT c.tool_code,
                       c.active,
                       c.free_enabled,
                       c.limits_config_json,
                       e.entitlement_type,
                       e.status
                FROM tools.catalog c
                LEFT JOIN tools.user_entitlements e
                 ON e.user_id = %(user_id)s
                 AND e.tool_code = c.tool_code
                 AND e.status = 'active'
                 AND e.starts_at_utc <= NOW()
                 AND (e.ends_at_utc IS NULL OR e.ends_at_utc > NOW())
                WHERE c.active = TRUE
                ORDER BY c.tool_code ASC
                """,
                {"user_id": int(user_id)},
            )
            rows = cur.fetchall()

    results: List[Dict[str, Any]] = []
    for row in rows:
        tool_code = str(row[0]).upper()
        if tool_code not in enabled_codes:
            continue
        results.append(
            resolve_tool_access_record(
                {
                    "tool_code": tool_code,
                    "active": bool(row[1]),
                    "free_enabled": bool(row[2]),
                    "limits_config_json": row[3],
                },
                {
                    "entitlement_type": row[4],
                    "status": row[5],
                }
                if row[4] is not None
                else None,
            )
        )
    return results


def resolve_tool_access(
    user_id: int,
    tool_code: str,
    *,
    enabled_tool_codes: Optional[Iterable[str]] = None,
) -> Dict[str, Any]:
    normalized_tool_code = str(tool_code or "").strip().upper()
    enabled_codes = _normalize_enabled_tool_codes(enabled_tool_codes) or set()
    if normalized_tool_code not in enabled_codes:
        return {
            "tool_code": normalized_tool_code,
            "access": "unavailable",
            "limits": {},
            "available": False,
        }

    with pg_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT c.tool_code,
                       c.active,
                       c.free_enabled,
                       c.limits_config_json,
                       e.entitlement_type,
                       e.status
                FROM tools.catalog c
                LEFT JOIN tools.user_entitlements e
                 ON e.user_id = %(user_id)s
                 AND e.tool_code = c.tool_code
                 AND e.status = 'active'
                 AND e.starts_at_utc <= NOW()
                 AND (e.ends_at_utc IS NULL OR e.ends_at_utc > NOW())
                WHERE c.tool_code = %(tool_code)s
                LIMIT 1
                """,
                {
                    "user_id": int(user_id),
                    "tool_code": normalized_tool_code,
                },
            )
            row = cur.fetchone()

    if row is None:
        return {
            "tool_code": normalized_tool_code,
            "access": "unavailable",
            "limits": {},
            "available": False,
        }

    return resolve_tool_access_record(
        {
            "tool_code": row[0],
            "active": bool(row[1]),
            "free_enabled": bool(row[2]),
            "limits_config_json": row[3],
        },
        {
            "entitlement_type": row[4],
            "status": row[5],
        }
        if row[4] is not None
        else None,
    )
