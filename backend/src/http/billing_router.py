from __future__ import annotations

import logging
import stripe
from fastapi import APIRouter, Body, Request
from fastapi.responses import JSONResponse

from src.auth.service import get_auth_me_payload
from src.billing.service import (
    apply_immediate_subscription_change_for_user,
    cancel_scheduled_subscription_change_for_user,
    cancel_subscription_renewal_for_user,
    create_checkout_session_for_user,
    get_billing_subscription_summary_for_user,
    list_billing_catalog,
    preview_subscription_change_for_user,
    process_stripe_webhook_event,
    resume_subscription_renewal_for_user,
    schedule_period_end_subscription_change_for_user,
    sync_checkout_session_for_user,
)
from src.core.settings import load_settings

router = APIRouter(prefix="/billing", tags=["billing"])

logger = logging.getLogger(__name__)


def _require_authenticated_context(request: Request) -> dict | JSONResponse:
    auth_payload = get_auth_me_payload(request)

    if not auth_payload.get("is_authenticated"):
        return JSONResponse(
            status_code=401,
            content={
                "ok": False,
                "code": "AUTH_REQUIRED",
                "message": "authentication required",
            },
        )

    return auth_payload


def _extract_user_context(auth_payload: dict) -> tuple[int, str]:
    user = auth_payload.get("user") or {}
    access = auth_payload.get("access") or {}
    user_id = int(user.get("user_id"))
    billing_runtime = str(access.get("billing_runtime") or "live").strip().lower() or "live"
    return user_id, billing_runtime


def _resolve_webhook_secret(settings, *, billing_runtime: str) -> str:
    runtime = str(billing_runtime or "live").strip().lower()
    if runtime == "sandbox":
        return str(settings.stripe_sandbox_webhook_secret or "").strip()
    return str(settings.stripe_live_webhook_secret or "").strip()

def _try_construct_stripe_event_payload(
    *,
    payload: bytes,
    sig_header: str | None,
    webhook_secret: str,
):
    if not webhook_secret:
        return None

    try:
        event = stripe.Webhook.construct_event(
            payload=payload,
            sig_header=sig_header,
            secret=webhook_secret,
        )
        return event._to_dict_recursive()
    except Exception:
        return None


def _process_verified_stripe_webhook_event(*, event_payload: dict, billing_runtime: str):
    try:
        result = process_stripe_webhook_event(event_payload, billing_runtime=billing_runtime)
        logger.info(
            "stripe webhook processed runtime=%s event_id=%s event_type=%s ok=%s",
            billing_runtime,
            event_payload.get("id"),
            event_payload.get("type"),
            result.get("ok"),
        )
        return JSONResponse(status_code=200, content=result)
    except ValueError as exc:
        logger.warning(
            "stripe webhook business error runtime=%s event_id=%s event_type=%s error=%s",
            billing_runtime,
            event_payload.get("id"),
            event_payload.get("type"),
            str(exc),
        )
        return JSONResponse(
            status_code=400,
            content={
                "ok": False,
                "code": str(exc),
                "message": str(exc),
            },
        )
    except RuntimeError as exc:
        logger.exception(
            "stripe webhook runtime error runtime=%s event_id=%s event_type=%s",
            billing_runtime,
            event_payload.get("id"),
            event_payload.get("type"),
        )
        return JSONResponse(
            status_code=500,
            content={
                "ok": False,
                "code": str(exc),
                "message": str(exc),
            },
        )
    except Exception as exc:
        logger.exception(
            "stripe webhook unexpected error runtime=%s event_id=%s event_type=%s",
            billing_runtime,
            event_payload.get("id"),
            event_payload.get("type"),
        )
        return JSONResponse(
            status_code=500,
            content={
                "ok": False,
                "code": "stripe_webhook_processing_failed",
                "message": str(exc),
            },
        )

async def _handle_stripe_webhook(request: Request, *, billing_runtime: str):
    settings = load_settings()
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")
    webhook_secret = _resolve_webhook_secret(settings, billing_runtime=billing_runtime)

    if not webhook_secret:
        return JSONResponse(
            status_code=500,
            content={"ok": False, "code": f"stripe_{billing_runtime}_webhook_not_configured"},
        )

    event_payload = _try_construct_stripe_event_payload(
        payload=payload,
        sig_header=sig_header,
        webhook_secret=webhook_secret,
    )

    if event_payload is None:
        logger.warning(
            "stripe webhook rejected during signature validation runtime=%s",
            billing_runtime,
        )
        return JSONResponse(
            status_code=400,
            content={
                "ok": False,
                "code": "invalid_stripe_webhook",
                "message": "invalid stripe webhook signature",
            },
        )

    return _process_verified_stripe_webhook_event(
        event_payload=event_payload,
        billing_runtime=billing_runtime,
    )


@router.get("/catalog")
def billing_catalog(currency_code: str = "BRL"):
    return list_billing_catalog(currency_code=currency_code)


@router.get("/subscription")
def billing_subscription(request: Request):
    auth_payload = _require_authenticated_context(request)
    if isinstance(auth_payload, JSONResponse):
        return auth_payload

    user_id, billing_runtime = _extract_user_context(auth_payload)

    try:
        return get_billing_subscription_summary_for_user(
            user_id,
            billing_runtime=billing_runtime,
        )
    except RuntimeError as exc:
        return JSONResponse(
            status_code=500,
            content={"ok": False, "code": str(exc), "message": str(exc)},
        )

@router.post("/subscription/change-preview")
def billing_subscription_change_preview(
    request: Request,
    payload: dict = Body(...),
):
    auth_payload = _require_authenticated_context(request)
    if isinstance(auth_payload, JSONResponse):
        return auth_payload

    user_id, billing_runtime = _extract_user_context(auth_payload)

    try:
        return preview_subscription_change_for_user(
            user_id,
            target_plan_code=str(payload.get("target_plan_code") or ""),
            target_billing_cycle=str(payload.get("target_billing_cycle") or payload.get("billing_cycle") or ""),
            currency_code=str(payload.get("currency_code") or "BRL"),
            billing_runtime=billing_runtime,
        )
    except ValueError as exc:
        return JSONResponse(
            status_code=400,
            content={"ok": False, "code": str(exc), "message": str(exc)},
        )
    except RuntimeError as exc:
        return JSONResponse(
            status_code=500,
            content={"ok": False, "code": str(exc), "message": str(exc)},
        )


@router.post("/subscription/change-apply")
def billing_subscription_change_apply(
    request: Request,
    payload: dict = Body(...),
):
    auth_payload = _require_authenticated_context(request)
    if isinstance(auth_payload, JSONResponse):
        return auth_payload

    user_id, billing_runtime = _extract_user_context(auth_payload)

    try:
        return apply_immediate_subscription_change_for_user(
            user_id,
            target_plan_code=str(payload.get("target_plan_code") or ""),
            target_billing_cycle=str(payload.get("target_billing_cycle") or payload.get("billing_cycle") or ""),
            currency_code=str(payload.get("currency_code") or "BRL"),
            billing_runtime=billing_runtime,
            preview_proration_date=payload.get("preview_proration_date"),
            preview_subscription_updated_at=str(payload.get("preview_subscription_updated_at") or ""),
        )
    except ValueError as exc:
        return JSONResponse(
            status_code=400,
            content={"ok": False, "code": str(exc), "message": str(exc)},
        )
    except RuntimeError as exc:
        return JSONResponse(
            status_code=500,
            content={"ok": False, "code": str(exc), "message": str(exc)},
        )


@router.post("/subscription/change-schedule")
def billing_subscription_change_schedule(
    request: Request,
    payload: dict = Body(...),
):
    auth_payload = _require_authenticated_context(request)
    if isinstance(auth_payload, JSONResponse):
        return auth_payload

    user_id, billing_runtime = _extract_user_context(auth_payload)

    try:
        return schedule_period_end_subscription_change_for_user(
            user_id,
            target_plan_code=str(payload.get("target_plan_code") or ""),
            target_billing_cycle=str(payload.get("target_billing_cycle") or payload.get("billing_cycle") or ""),
            currency_code=str(payload.get("currency_code") or "BRL"),
            billing_runtime=billing_runtime,
            preview_subscription_updated_at=str(payload.get("preview_subscription_updated_at") or ""),
        )
    except ValueError as exc:
        return JSONResponse(
            status_code=400,
            content={"ok": False, "code": str(exc), "message": str(exc)},
        )
    except RuntimeError as exc:
        return JSONResponse(
            status_code=500,
            content={"ok": False, "code": str(exc), "message": str(exc)},
        )


@router.post("/subscription/change-cancel")
def billing_subscription_change_cancel(request: Request):
    auth_payload = _require_authenticated_context(request)
    if isinstance(auth_payload, JSONResponse):
        return auth_payload

    user_id, billing_runtime = _extract_user_context(auth_payload)

    try:
        return cancel_scheduled_subscription_change_for_user(
            user_id,
            billing_runtime=billing_runtime,
        )
    except ValueError as exc:
        return JSONResponse(
            status_code=400,
            content={"ok": False, "code": str(exc), "message": str(exc)},
        )
    except RuntimeError as exc:
        return JSONResponse(
            status_code=500,
            content={"ok": False, "code": str(exc), "message": str(exc)},
        )


@router.post("/subscription/cancel-renewal")
def billing_subscription_cancel_renewal(request: Request):
    auth_payload = _require_authenticated_context(request)
    if isinstance(auth_payload, JSONResponse):
        return auth_payload

    user_id, billing_runtime = _extract_user_context(auth_payload)

    try:
        return cancel_subscription_renewal_for_user(
            user_id,
            billing_runtime=billing_runtime,
        )
    except ValueError as exc:
        return JSONResponse(
            status_code=400,
            content={"ok": False, "code": str(exc), "message": str(exc)},
        )
    except RuntimeError as exc:
        return JSONResponse(
            status_code=500,
            content={"ok": False, "code": str(exc), "message": str(exc)},
        )


@router.post("/subscription/resume-renewal")
def billing_subscription_resume_renewal(request: Request):
    auth_payload = _require_authenticated_context(request)
    if isinstance(auth_payload, JSONResponse):
        return auth_payload

    user_id, billing_runtime = _extract_user_context(auth_payload)

    try:
        return resume_subscription_renewal_for_user(
            user_id,
            billing_runtime=billing_runtime,
        )
    except ValueError as exc:
        return JSONResponse(
            status_code=400,
            content={"ok": False, "code": str(exc), "message": str(exc)},
        )
    except RuntimeError as exc:
        return JSONResponse(
            status_code=500,
            content={"ok": False, "code": str(exc), "message": str(exc)},
        )


@router.post("/checkout/session")
def billing_checkout_session(
    request: Request,
    payload: dict = Body(...),
):
    auth_payload = _require_authenticated_context(request)
    if isinstance(auth_payload, JSONResponse):
        return auth_payload

    user_id, billing_runtime = _extract_user_context(auth_payload)

    try:
        return create_checkout_session_for_user(
            user_id=user_id,
            plan_code=str(payload.get("plan_code") or "").strip(),
            billing_cycle=str(payload.get("billing_cycle") or "").strip(),
            currency_code=str(payload.get("currency_code") or "").strip(),
            billing_runtime=billing_runtime,
        )
    except ValueError as exc:
        return JSONResponse(
            status_code=400,
            content={
                "ok": False,
                "code": str(exc),
                "message": str(exc),
            },
        )
    except RuntimeError as exc:
        return JSONResponse(
            status_code=500,
            content={
                "ok": False,
                "code": str(exc),
                "message": str(exc),
            },
        )


@router.get("/checkout/session/status")
def billing_checkout_session_status(request: Request, session_id: str):
    auth_payload = _require_authenticated_context(request)
    if isinstance(auth_payload, JSONResponse):
        return auth_payload

    user_id, billing_runtime = _extract_user_context(auth_payload)

    try:
        return sync_checkout_session_for_user(
            user_id=user_id,
            session_id=session_id,
            billing_runtime=billing_runtime,
        )
    except ValueError as exc:
        return JSONResponse(
            status_code=400,
            content={
                "ok": False,
                "code": str(exc),
                "message": str(exc),
            },
        )
    except RuntimeError as exc:
        return JSONResponse(
            status_code=500,
            content={
                "ok": False,
                "code": str(exc),
                "message": str(exc),
            },
        )
    except Exception as exc:
        logger.exception(
            "checkout session status unexpected error user_id=%s session_id=%s",
            user_id,
            session_id,
        )
        return JSONResponse(
            status_code=500,
            content={
                "ok": False,
                "code": "checkout_session_status_failed",
                "message": str(exc),
            },
        )


@router.post("/webhooks/stripe")
async def billing_stripe_webhook_legacy(request: Request):
    settings = load_settings()
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")

    matches: list[tuple[str, dict]] = []

    for runtime in ("sandbox", "live"):
        webhook_secret = _resolve_webhook_secret(settings, billing_runtime=runtime)
        event_payload = _try_construct_stripe_event_payload(
            payload=payload,
            sig_header=sig_header,
            webhook_secret=webhook_secret,
        )
        if event_payload is not None:
            matches.append((runtime, event_payload))

    if not matches:
        logger.warning("legacy stripe webhook rejected during signature validation")
        return JSONResponse(
            status_code=400,
            content={
                "ok": False,
                "code": "invalid_stripe_webhook",
                "message": "invalid stripe webhook signature",
            },
        )

    if len(matches) > 1:
        logger.error("legacy stripe webhook matched multiple runtimes")
        return JSONResponse(
            status_code=400,
            content={
                "ok": False,
                "code": "ambiguous_stripe_webhook_runtime",
                "message": "legacy webhook matched multiple stripe runtimes",
            },
        )

    resolved_runtime, event_payload = matches[0]

    logger.warning(
        "legacy stripe webhook endpoint used; routing by signature runtime=%s event_id=%s event_type=%s",
        resolved_runtime,
        event_payload.get("id"),
        event_payload.get("type"),
    )

    return _process_verified_stripe_webhook_event(
        event_payload=event_payload,
        billing_runtime=resolved_runtime,
    )

@router.post("/webhooks/stripe/sandbox")
async def billing_stripe_webhook_sandbox(request: Request):
    return await _handle_stripe_webhook(request, billing_runtime="sandbox")


@router.post("/webhooks/stripe/live")
async def billing_stripe_webhook_live(request: Request):
    return await _handle_stripe_webhook(request, billing_runtime="live")