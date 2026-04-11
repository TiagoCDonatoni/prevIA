from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, Body, Header, HTTPException, status

from src.core.settings import load_settings
from src.ops.job_dispatcher import get_job_callable, list_job_keys
from src.ops.job_runner import run_job

router = APIRouter(
    prefix="/internal/ops",
    tags=["internal-ops"],
)


def _require_ops_trigger_token(x_ops_trigger_token: str | None) -> None:
    settings = load_settings()

    if not settings.ops_manual_trigger_enabled:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "ok": False,
                "code": "OPS_MANUAL_TRIGGER_DISABLED",
                "message": "manual ops trigger is disabled",
            },
        )

    expected = str(settings.ops_trigger_token or "").strip()
    received = str(x_ops_trigger_token or "").strip()

    if not expected:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "ok": False,
                "code": "OPS_TRIGGER_TOKEN_NOT_CONFIGURED",
                "message": "OPS_TRIGGER_TOKEN is not configured",
            },
        )

    if received != expected:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "ok": False,
                "code": "OPS_TRIGGER_TOKEN_INVALID",
                "message": "invalid ops trigger token",
            },
        )


@router.get("/jobs")
def internal_ops_jobs(
    x_ops_trigger_token: str | None = Header(default=None, alias="X-Ops-Trigger-Token"),
):
    _require_ops_trigger_token(x_ops_trigger_token)
    settings = load_settings()

    return {
        "ok": True,
        "ops_mode": settings.ops_mode,
        "manual_trigger_enabled": settings.ops_manual_trigger_enabled,
        "jobs": list_job_keys(),
    }


@router.post("/jobs/run")
def internal_ops_run_job(
    body: Dict[str, Any] = Body(...),
    x_ops_trigger_token: str | None = Header(default=None, alias="X-Ops-Trigger-Token"),
):
    _require_ops_trigger_token(x_ops_trigger_token)

    job_key = str(body.get("job_key") or "").strip()
    if not job_key:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "ok": False,
                "code": "JOB_KEY_REQUIRED",
                "message": "job_key is required",
            },
        )

    job_fn = get_job_callable(job_key)
    if job_fn is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "ok": False,
                "code": "JOB_NOT_FOUND",
                "message": f"unknown job_key: {job_key}",
            },
        )

    job_kwargs_raw = body.get("job_kwargs")
    job_kwargs = job_kwargs_raw if isinstance(job_kwargs_raw, dict) else {}

    payload_raw = body.get("payload")
    payload = payload_raw if isinstance(payload_raw, dict) else {}

    requested_by = str(body.get("requested_by") or "internal_ops_manual").strip() or "internal_ops_manual"
    correlation_id = str(body.get("correlation_id") or "").strip() or None
    idempotency_key = str(body.get("idempotency_key") or "").strip() or None

    res = run_job(
        job_key,
        job_fn,
        trigger_source="api",
        requested_by=requested_by,
        correlation_id=correlation_id,
        idempotency_key=idempotency_key,
        payload=payload,
        **job_kwargs,
    )

    return {
        "ok": res.ok,
        "job": res.job_name,
        "run_id": res.run_id,
        "attempt_id": res.attempt_id,
        "status": res.status,
        "elapsed_sec": res.elapsed_sec,
        "counters": res.counters,
        "error": res.error,
        "blocked_reason": res.blocked_reason,
    }