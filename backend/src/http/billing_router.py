from __future__ import annotations

from fastapi import APIRouter, Body, Request
from fastapi.responses import JSONResponse

from src.auth.service import get_auth_me_payload
from src.billing.service import create_checkout_session_for_user, list_billing_catalog

router = APIRouter(prefix="/billing", tags=["billing"])


@router.get("/catalog")
def billing_catalog():
    return list_billing_catalog()


@router.post("/checkout/session")
def billing_checkout_session(
    request: Request,
    payload: dict = Body(...),
):
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
    user_id = int(user.get("user_id"))

    try:
        return create_checkout_session_for_user(
            user_id=user_id,
            plan_code=str(payload.get("plan_code") or "").strip(),
            billing_cycle=str(payload.get("billing_cycle") or "").strip(),
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