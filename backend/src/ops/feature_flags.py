from __future__ import annotations

from typing import Any, Dict, Optional

from src.db.pg import pg_conn


def _pick_first(rows):
    return rows[0] if rows else None


def get_effective_enabled_flag(
    *,
    job_key: str,
    sport_key: Optional[str],
) -> Dict[str, Any]:
    """
    Precedência:
      1) job_sport_key
      2) job
      3) sport_key
      4) global
      5) sem match
    """
    sql = """
      WITH active_flags AS (
        SELECT
          flag_id,
          flag_name,
          scope_type,
          job_key,
          sport_key,
          enabled,
          reason,
          starts_at_utc,
          expires_at_utc,
          created_by,
          created_at_utc,
          CASE
            WHEN scope_type = 'job_sport_key' THEN 1
            WHEN scope_type = 'job' THEN 2
            WHEN scope_type = 'sport_key' THEN 3
            WHEN scope_type = 'global' THEN 4
            ELSE 999
          END AS precedence_rank
        FROM ops.ops_feature_flags
        WHERE flag_name = 'enabled'
          AND starts_at_utc <= now()
          AND (expires_at_utc IS NULL OR expires_at_utc > now())
          AND (
            (scope_type = 'global')
            OR (scope_type = 'job' AND job_key = %(job_key)s)
            OR (scope_type = 'sport_key' AND sport_key = %(sport_key)s)
            OR (scope_type = 'job_sport_key' AND job_key = %(job_key)s AND sport_key = %(sport_key)s)
          )
      )
      SELECT
        flag_id,
        flag_name,
        scope_type,
        job_key,
        sport_key,
        enabled,
        reason,
        starts_at_utc,
        expires_at_utc,
        created_by,
        created_at_utc,
        precedence_rank
      FROM active_flags
      ORDER BY precedence_rank ASC, created_at_utc DESC
      LIMIT 1
    """

    with pg_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, {"job_key": job_key, "sport_key": sport_key})
            row = cur.fetchone()

    if not row:
        return {
            "matched": False,
            "enabled": None,
            "scope_type": None,
            "reason": None,
        }

    return {
        "matched": True,
        "flag_id": int(row[0]),
        "flag_name": row[1],
        "scope_type": row[2],
        "job_key": row[3],
        "sport_key": row[4],
        "enabled": bool(row[5]),
        "reason": row[6],
        "starts_at_utc": row[7].isoformat() if row[7] else None,
        "expires_at_utc": row[8].isoformat() if row[8] else None,
        "created_by": row[9],
        "created_at_utc": row[10].isoformat() if row[10] else None,
        "precedence_rank": int(row[11]),
    }