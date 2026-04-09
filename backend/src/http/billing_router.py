from __future__ import annotations

import logging
import stripe
from fastapi import APIRouter, Body, Request
from fastapi.responses import JSONResponse

from src.auth.service import get_auth_me_payload
from src.billing.service import (
    cancel_subscription_renewal_for_user,
    create_checkout_session_for_user,
    get_billing_subscription_summary_for_user,
    list_billing_catalog,
    process_stripe_webhook_event,
    resume_subscription_renewal_for_user,
    sync_checkout_session_for_user,
)
from src.core.settings import load_settings

router = APIRouter(prefix="/billing", tags=["billing"])

logger = logging.getLogger(__name__)

def _require_authenticated_user(request: Request) -> int | JSONResponse:
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

    user = auth_payload.get("user") or {}
    return int(user.get("user_id"))


@router.get("/catalog")
def billing_catalog(currency_code: str = "BRL"):
    return list_billing_catalog(currency_code=currency_code)


@router.get("/subscription")
def billing_subscription(request: Request):
    user_id = _require_authenticated_user(request)
    if isinstance(user_id, JSONResponse):
        return user_id

    try:
        return get_billing_subscription_summary_for_user(user_id)
    except RuntimeError as exc:
        return JSONResponse(
            status_code=500,
            content={"ok": False, "code": str(exc), "message": str(exc)},
        )


@router.post("/subscription/cancel-renewal")
def billing_subscription_cancel_renewal(request: Request):
    user_id = _require_authenticated_user(request)
    if isinstance(user_id, JSONResponse):
        return user_id

    try:
        return cancel_subscription_renewal_for_user(user_id)
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
    user_id = _require_authenticated_user(request)
    if isinstance(user_id, JSONResponse):
        return user_id

    try:
        return resume_subscription_renewal_for_user(user_id)
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
    user_id = _require_authenticated_user(request)
    if isinstance(user_id, JSONResponse):
        return user_id

    try:
        return create_checkout_session_for_user(
            user_id=user_id,
            plan_code=str(payload.get("plan_code") or "").strip(),
            billing_cycle=str(payload.get("billing_cycle") or "").strip(),
            currency_code=str(payload.get("currency_code") or "").strip(),
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
    user_id = _require_authenticated_user(request)
    if isinstance(user_id, JSONResponse):
        return user_id

    try:
        return sync_checkout_session_for_user(
            user_id=user_id,
            session_id=session_id,
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
async def billing_stripe_webhook(request: Request):
    settings = load_settings()
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")

    if not settings.stripe_webhook_secret:
        return JSONResponse(
            status_code=500,
            content={"ok": False, "code": "stripe_webhook_not_configured"},
        )

    try:
        event = stripe.Webhook.construct_event(
            payload=payload,
            sig_header=sig_header,
            secret=settings.stripe_webhook_secret,
        )
    except Exception as exc:
        logger.warning("stripe webhook rejected during signature validation: %s", str(exc))
        return JSONResponse(
            status_code=400,
            content={
                "ok": False,
                "code": "invalid_stripe_webhook",
                "message": str(exc),
            },
        )

    event_payload = event._to_dict_recursive()
    
    try:
        result = process_stripe_webhook_event(event_payload)
        logger.info(
            "stripe webhook processed event_id=%s event_type=%s ok=%s",
            event_payload.get("id"),
            event_payload.get("type"),
            result.get("ok"),
        )
        return JSONResponse(status_code=200, content=result)
    except ValueError as exc:
        logger.warning(
            "stripe webhook business error event_id=%s event_type=%s error=%s",
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
            "stripe webhook runtime error event_id=%s event_type=%s",
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
            "stripe webhook unexpected error event_id=%s event_type=%s",
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

