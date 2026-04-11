from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, Dict, Optional
import json
import time
import traceback

from src.db.pg import pg_conn
from src.ops.feature_flags import get_effective_enabled_flag
from src.ops.job_registry import get_job_definition, get_job_scope_override


@dataclass
class JobRunResult:
    ok: bool
    job_name: str
    run_id: Optional[int]
    attempt_id: Optional[int]
    status: str
    elapsed_sec: float
    counters: Dict[str, Any]
    error: Optional[str] = None
    blocked_reason: Optional[str] = None

def _jsonb_param(value: Any) -> Optional[str]:
    if value is None:
        return None
    return json.dumps(value, ensure_ascii=False, default=str)

def _infer_scope(job_kwargs: Dict[str, Any]) -> Dict[str, Optional[str]]:
    sport_key = job_kwargs.get("sport_key") or job_kwargs.get("only_sport_key")
    if sport_key:
        return {
            "scope_type": "sport_key",
            "scope_key": str(sport_key),
            "sport_key": str(sport_key),
        }
    return {
        "scope_type": "global",
        "scope_key": "global",
        "sport_key": None,
    }


def _merge_payloads(
    default_payload: Dict[str, Any],
    patch_payload: Dict[str, Any],
    explicit_payload: Dict[str, Any],
) -> Dict[str, Any]:
    merged = dict(default_payload or {})
    merged.update(patch_payload or {})
    merged.update(explicit_payload or {})
    return merged


def _append_event(
    conn,
    *,
    run_id: int,
    attempt_id: Optional[int],
    event_type: str,
    event_level: str = "info",
    message: Optional[str] = None,
    payload: Optional[Dict[str, Any]] = None,
) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO ops.ops_job_events (
              run_id, attempt_id, event_type, event_level, message, payload_json
            )
            VALUES (%(run_id)s, %(attempt_id)s, %(event_type)s, %(event_level)s, %(message)s, %(payload)s::jsonb)
            """,
            {
                "run_id": run_id,
                "attempt_id": attempt_id,
                "event_type": event_type,
                "event_level": event_level,
                "message": message,
                "payload": _jsonb_param(payload or {}),
            }
        )


def run_job(
    job_name: str,
    job_fn: Callable[..., Dict[str, Any]],
    *,
    trigger_source: str = "manual",
    requested_by: Optional[str] = None,
    correlation_id: Optional[str] = None,
    idempotency_key: Optional[str] = None,
    parent_run_id: Optional[int] = None,
    payload: Optional[Dict[str, Any]] = None,
    **job_kwargs: Any,
) -> JobRunResult:
    t0 = time.perf_counter()

    scope = _infer_scope(job_kwargs)
    scope_type = scope["scope_type"] or "global"
    scope_key = scope["scope_key"] or "global"
    sport_key = scope["sport_key"]

    job_def = get_job_definition(job_name)
    if not job_def:
        return JobRunResult(
            ok=False,
            job_name=job_name,
            run_id=None,
            attempt_id=None,
            status="failed",
            elapsed_sec=0.0,
            counters={},
            error=f"job_definition_not_found: {job_name}",
        )

    override = get_job_scope_override(job_key=job_name, sport_key=sport_key)
    flag = get_effective_enabled_flag(job_key=job_name, sport_key=sport_key)

    requested_payload = dict(payload or {})
    effective_payload = _merge_payloads(
        job_def.get("default_payload_json") or {},
        (override or {}).get("payload_patch_json") or {},
        requested_payload,
    )

    effective_job_kwargs = dict(effective_payload)
    effective_job_kwargs.update(job_kwargs)

    effective_enabled = bool(job_def["enabled_by_default"])
    block_reason: Optional[str] = None

    if trigger_source == "manual" and not job_def["allow_manual_run"]:
        block_reason = "manual_run_disabled"
    elif trigger_source == "scheduler" and not job_def["allow_scheduler_run"]:
        block_reason = "scheduler_run_disabled"

    if override and override.get("enabled_override") is not None:
        effective_enabled = bool(override["enabled_override"])

    if flag.get("matched"):
        effective_enabled = bool(flag["enabled"])

    if not effective_enabled and not block_reason:
        block_reason = flag.get("reason") or "disabled_by_flag_or_override"

    with pg_conn() as conn:
        conn.autocommit = False

        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO ops.ops_job_runs (
                  job_key, trigger_source, requested_by,
                  scope_type, scope_key, sport_key,
                  status, block_reason,
                  requested_payload_json, effective_payload_json,
                  parent_run_id, correlation_id, idempotency_key
                )
                VALUES (
                  %(job_key)s, %(trigger_source)s, %(requested_by)s,
                  %(scope_type)s, %(scope_key)s, %(sport_key)s,
                  %(status)s, %(block_reason)s,
                  %(requested_payload_json)s::jsonb, %(effective_payload_json)s::jsonb,
                  %(parent_run_id)s, %(correlation_id)s, %(idempotency_key)s
                )
                RETURNING run_id
                """,
                {
                    "job_key": job_name,
                    "trigger_source": trigger_source,
                    "requested_by": requested_by,
                    "scope_type": scope_type,
                    "scope_key": scope_key,
                    "sport_key": sport_key,
                    "status": "blocked" if block_reason else "queued",
                    "block_reason": block_reason,
                    "requested_payload_json": _jsonb_param(requested_payload),
                    "effective_payload_json": _jsonb_param(effective_job_kwargs),
                    "parent_run_id": parent_run_id,
                    "correlation_id": correlation_id,
                    "idempotency_key": idempotency_key,
                }
            )
            run_id = int(cur.fetchone()[0])

        _append_event(
            conn,
            run_id=run_id,
            attempt_id=None,
            event_type="blocked" if block_reason else "queued",
            event_level="warn" if block_reason else "info",
            message="job blocked before execution" if block_reason else None,
            payload={
                "job_name": job_name,
                "scope_key": scope_key,
                "sport_key": sport_key,
                "flag": flag,
                "override": override,
                "effective_job_kwargs": effective_job_kwargs,
                "block_reason": block_reason,
            },
        )

        if block_reason:
            conn.commit()
            return JobRunResult(
                ok=False,
                job_name=job_name,
                run_id=run_id,
                attempt_id=None,
                status="blocked",
                elapsed_sec=round(time.perf_counter() - t0, 6),
                counters={},
                error=None,
                blocked_reason=block_reason,
            )

        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE ops.ops_job_runs
                SET status = 'running',
                    started_at_utc = now(),
                    updated_at_utc = now()
                WHERE run_id = %(run_id)s
                """,
                {"run_id": run_id},
            )

            cur.execute(
                """
                INSERT INTO ops.ops_job_attempts (
                  run_id, attempt_no, executor_type, executor_ref, status
                )
                VALUES (%(run_id)s, 1, 'inline', 'backend-inline', 'running')
                RETURNING attempt_id
                """,
                {"run_id": run_id},
            )
            attempt_id = int(cur.fetchone()[0])

        _append_event(
            conn,
            run_id=run_id,
            attempt_id=attempt_id,
            event_type="started",
            event_level="info",
            message="job execution started",
            payload={
                "job_name": job_name,
                "scope_key": scope_key,
                "sport_key": sport_key,
                "effective_job_kwargs": effective_job_kwargs,
            },
        )

        conn.commit()

    try:
        raw_result = job_fn(**effective_job_kwargs)
        ok = bool((raw_result or {}).get("ok", True))
        counters = dict((raw_result or {}).get("counters") or {})
        error_text = None if ok else str((raw_result or {}).get("error") or "job_returned_not_ok")
        status = "succeeded" if ok else "failed"

    except Exception as exc:
        raw_result = None
        ok = False
        counters = {}
        error_text = f"{type(exc).__name__}: {exc}"
        status = "failed"
        tb = traceback.format_exc()

        with pg_conn() as conn:
            conn.autocommit = False
            _append_event(
                conn,
                run_id=run_id,
                attempt_id=attempt_id,
                event_type="exception",
                event_level="error",
                message="unhandled exception during job execution",
                payload={"traceback": tb},
            )
            conn.commit()

    elapsed_sec = round(time.perf_counter() - t0, 6)
    duration_ms = int(elapsed_sec * 1000)

    with pg_conn() as conn:
        conn.autocommit = False

        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE ops.ops_job_attempts
                SET status = %(status)s,
                    finished_at_utc = now(),
                    duration_ms = %(duration_ms)s,
                    result_json = %(result_json)s::jsonb,
                    counters_json = %(counters_json)s::jsonb,
                    error_json = %(error_json)s::jsonb
                WHERE attempt_id = %(attempt_id)s
                """,
                {
                    "status": status,
                    "duration_ms": duration_ms,
                    "result_json": _jsonb_param(raw_result or {}),
                    "counters_json": _jsonb_param(counters or {}),
                    "error_json": _jsonb_param({"message": error_text}) if error_text else None,
                    "attempt_id": attempt_id,
                }
            )

            cur.execute(
                """
                UPDATE ops.ops_job_runs
                SET status = %(status)s,
                    result_json = %(result_json)s::jsonb,
                    counters_json = %(counters_json)s::jsonb,
                    error_json = %(error_json)s::jsonb,
                    finished_at_utc = now(),
                    duration_ms = %(duration_ms)s,
                    updated_at_utc = now()
                WHERE run_id = %(run_id)s
                """,
                {
                    "status": status,
                    "result_json": _jsonb_param(raw_result or {}),
                    "counters_json": _jsonb_param(counters or {}),
                    "error_json": _jsonb_param({"message": error_text}) if error_text else None,
                    "duration_ms": duration_ms,
                    "run_id": run_id,
                }
            )

        _append_event(
            conn,
            run_id=run_id,
            attempt_id=attempt_id,
            event_type="finished" if ok else "failed",
            event_level="info" if ok else "error",
            message="job finished successfully" if ok else "job finished with failure",
            payload={
                "duration_ms": duration_ms,
                "counters": counters,
                "error": error_text,
            },
        )

        conn.commit()

    return JobRunResult(
        ok=ok,
        job_name=job_name,
        run_id=run_id,
        attempt_id=attempt_id,
        status=status,
        elapsed_sec=elapsed_sec,
        counters=counters if counters else (raw_result or {}),
        error=error_text,
        blocked_reason=None,
    )