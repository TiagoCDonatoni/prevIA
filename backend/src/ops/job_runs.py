from __future__ import annotations

from typing import Any, Dict, Optional
from datetime import datetime, timezone
import json


JOB_PRODUCT_SNAPSHOT_REBUILD_V1 = "product_snapshot_rebuild_v1"
CALC_VERSION_SNAPSHOT_V1 = "snapshot_calc_v1"


def start_job_run(
    conn,
    *,
    job_name: str,
    scope_key: str,
    model_version: Optional[str] = None,
    calc_version: Optional[str] = None,
) -> int:
    sql = """
      INSERT INTO ops.job_runs (job_name, scope_key, model_version, calc_version, started_at_utc)
      VALUES (%(job_name)s, %(scope_key)s, %(model_version)s, %(calc_version)s, now())
      RETURNING run_id
    """
    with conn.cursor() as cur:
        cur.execute(
            sql,
            {
                "job_name": str(job_name),
                "scope_key": str(scope_key),
                "model_version": model_version,
                "calc_version": calc_version,
            },
        )
        return int(cur.fetchone()[0])


def finish_job_run(
    conn,
    *,
    run_id: int,
    ok: bool,
    duration_ms: int,
    counters: Optional[Dict[str, Any]] = None,
    error_text: Optional[str] = None,
) -> None:
    sql = """
      UPDATE ops.job_runs
      SET
        finished_at_utc = now(),
        ok = %(ok)s,
        duration_ms = %(duration_ms)s,
        counters_json = %(counters_json)s::jsonb,
        error_text = %(error_text)s
      WHERE run_id = %(run_id)s
    """
    counters_json = json.dumps(counters or {})
    with conn.cursor() as cur:
        cur.execute(
            sql,
            {
                "run_id": int(run_id),
                "ok": bool(ok),
                "duration_ms": int(duration_ms),
                "counters_json": counters_json,
                "error_text": (str(error_text) if error_text else None),
            },
        )


def get_last_success_finished_at(
    conn,
    *,
    job_name: str,
    scope_key: str,
) -> Optional[datetime]:
    sql = """
      SELECT finished_at_utc
      FROM ops.job_runs
      WHERE job_name=%(job_name)s
        AND scope_key=%(scope_key)s
        AND ok = true
        AND finished_at_utc IS NOT NULL
      ORDER BY finished_at_utc DESC
      LIMIT 1
    """
    with conn.cursor() as cur:
        cur.execute(sql, {"job_name": str(job_name), "scope_key": str(scope_key)})
        r = cur.fetchone()
    return r[0] if r else None