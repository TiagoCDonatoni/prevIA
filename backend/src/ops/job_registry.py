from __future__ import annotations

from typing import Any, Dict, Optional

from src.db.pg import pg_conn


def get_job_definition(job_key: str) -> Optional[Dict[str, Any]]:
    sql = """
      SELECT
        job_key,
        display_name,
        handler_name,
        description,
        enabled_by_default,
        allow_manual_run,
        allow_scheduler_run,
        default_timeout_sec,
        default_max_attempts,
        default_priority,
        default_payload_json,
        tags_json
      FROM ops.ops_job_definitions
      WHERE job_key = %(job_key)s
      LIMIT 1
    """
    with pg_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, {"job_key": job_key})
            row = cur.fetchone()

    if not row:
        return None

    return {
        "job_key": row[0],
        "display_name": row[1],
        "handler_name": row[2],
        "description": row[3],
        "enabled_by_default": bool(row[4]),
        "allow_manual_run": bool(row[5]),
        "allow_scheduler_run": bool(row[6]),
        "default_timeout_sec": int(row[7]),
        "default_max_attempts": int(row[8]),
        "default_priority": int(row[9]),
        "default_payload_json": row[10] or {},
        "tags_json": row[11] or [],
    }


def get_job_scope_override(
    *,
    job_key: str,
    sport_key: Optional[str],
) -> Optional[Dict[str, Any]]:
    with pg_conn() as conn:
        with conn.cursor() as cur:
            if sport_key:
                cur.execute(
                    """
                    SELECT
                      override_id, job_key, scope_type, scope_key, sport_key,
                      enabled_override, priority_override, timeout_sec_override,
                      max_attempts_override, scheduler_cron, scheduler_timezone,
                      payload_patch_json, notes
                    FROM ops.ops_job_scope_overrides
                    WHERE job_key = %(job_key)s
                      AND (
                        (scope_type = 'job_sport_key' AND scope_key = %(sport_key)s)
                        OR (scope_type = 'sport_key' AND scope_key = %(sport_key)s)
                      )
                    ORDER BY
                      CASE
                        WHEN scope_type = 'job_sport_key' THEN 1
                        WHEN scope_type = 'sport_key' THEN 2
                        ELSE 999
                      END
                    LIMIT 1
                    """,
                    {"job_key": job_key, "sport_key": sport_key},
                )
            else:
                cur.execute(
                    """
                    SELECT
                      override_id, job_key, scope_type, scope_key, sport_key,
                      enabled_override, priority_override, timeout_sec_override,
                      max_attempts_override, scheduler_cron, scheduler_timezone,
                      payload_patch_json, notes
                    FROM ops.ops_job_scope_overrides
                    WHERE job_key = %(job_key)s
                      AND scope_type = 'global'
                      AND scope_key = 'global'
                    LIMIT 1
                    """,
                    {"job_key": job_key},
                )
            row = cur.fetchone()

    if not row:
        return None

    return {
        "override_id": int(row[0]),
        "job_key": row[1],
        "scope_type": row[2],
        "scope_key": row[3],
        "sport_key": row[4],
        "enabled_override": row[5],
        "priority_override": row[6],
        "timeout_sec_override": row[7],
        "max_attempts_override": row[8],
        "scheduler_cron": row[9],
        "scheduler_timezone": row[10],
        "payload_patch_json": row[11] or {},
        "notes": row[12],
    }