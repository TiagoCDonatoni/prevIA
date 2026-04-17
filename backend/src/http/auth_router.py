from __future__ import annotations

import logging

from fastapi import APIRouter, Body, Request, Response
from fastapi.responses import JSONResponse

from src.auth.service import (
    change_password_authenticated,
    forgot_password,
    get_auth_me_payload,
    link_google_identity_for_authenticated_user,
    login_with_google_credential,
    login_with_password,
    logout_with_session_token,
    reset_password_with_token,
    signup_with_password,
)
from src.auth.sessions import (
    clear_product_session_cookie,
    read_product_session_cookie,
    set_product_session_cookie,
)

router = APIRouter(prefix="/auth", tags=["auth"])
logger = logging.getLogger(__name__)


def _mask_token(raw: str | None) -> str:
    token = str(raw or "").strip()
    if not token:
        return "-"
    if len(token) <= 12:
        return f"{token[:3]}...{token[-3:]}"
    return f"{token[:6]}...{token[-6:]}"


def _preview_header(value: str | None, limit: int = 160) -> str:
    text = str(value or "").strip()
    if not text:
        return "-"
    return text if len(text) <= limit else f"{text[:limit]}..."


def _auth_request_context(request: Request) -> dict:
    raw_cookie_header = str(request.headers.get("cookie") or "").strip()
    raw_session_cookie = read_product_session_cookie(request)

    return {
        "origin": str(request.headers.get("origin") or "").strip() or "-",
        "referer": str(request.headers.get("referer") or "").strip() or "-",
        "host": str(request.headers.get("host") or "").strip() or "-",
        "xfwd_proto": str(request.headers.get("x-forwarded-proto") or "").strip() or "-",
        "cookie_header_present": bool(raw_cookie_header),
        "cookie_header_preview": _preview_header(raw_cookie_header, 200),
        "session_cookie": _mask_token(raw_session_cookie),
    }

@router.get("/me")
def auth_me(request: Request):
    payload = get_auth_me_payload(request)
    ctx = _auth_request_context(request)

    user = payload.get("user") or {}
    access = payload.get("access") or {}

    logger.warning(
        "[AUTH_ME_DEBUG] origin=%s referer=%s host=%s xfwd_proto=%s cookie_header_present=%s session_cookie=%s auth_mode=%s is_authenticated=%s user_id=%s billing_runtime=%s admin_access=%s",
        ctx["origin"],
        ctx["referer"],
        ctx["host"],
        ctx["xfwd_proto"],
        ctx["cookie_header_present"],
        ctx["session_cookie"],
        payload.get("auth_mode"),
        payload.get("is_authenticated"),
        user.get("user_id"),
        access.get("billing_runtime"),
        access.get("admin_access"),
    )

    return payload


@router.post("/signup")
def auth_signup(
    request: Request,
    response: Response,
    payload: dict = Body(...),
):
    result = signup_with_password(
        request=request,
        email=str(payload.get("email") or "").strip(),
        password=str(payload.get("password") or ""),
        full_name=str(payload.get("full_name") or "").strip() or None,
    )

    if not result.get("ok"):
        return JSONResponse(
            status_code=int(result.get("status_code") or 400),
            content={
                "ok": False,
                "code": result.get("code") or "SIGNUP_FAILED",
                "message": result.get("message") or "signup failed",
            },
        )

    set_product_session_cookie(response, result["raw_session_token"])
    return result["auth_payload"]


@router.post("/login")
def auth_login(
    request: Request,
    response: Response,
    payload: dict = Body(...),
):
    result = login_with_password(
        request=request,
        email=str(payload.get("email") or "").strip(),
        password=str(payload.get("password") or ""),
    )

    if not result.get("ok"):
        return JSONResponse(
            status_code=int(result.get("status_code") or 400),
            content={
                "ok": False,
                "code": result.get("code") or "LOGIN_FAILED",
                "message": result.get("message") or "login failed",
            },
        )

    set_product_session_cookie(response, result["raw_session_token"])
    return result["auth_payload"]

@router.post("/google/login")
def auth_google_login(
    request: Request,
    response: Response,
    payload: dict = Body(...),
):
    ctx_before = _auth_request_context(request)
    credential = str(payload.get("credential") or "").strip()

    result = login_with_google_credential(
        request=request,
        credential=credential,
    )

    if not result.get("ok"):
        logger.warning(
            "[AUTH_GOOGLE_LOGIN_DEBUG] ok=false origin=%s referer=%s host=%s xfwd_proto=%s cookie_header_present=%s session_cookie_before=%s code=%s message=%s credential_present=%s",
            ctx_before["origin"],
            ctx_before["referer"],
            ctx_before["host"],
            ctx_before["xfwd_proto"],
            ctx_before["cookie_header_present"],
            ctx_before["session_cookie"],
            result.get("code"),
            result.get("message"),
            bool(credential),
        )
        return JSONResponse(
            status_code=int(result.get("status_code") or 400),
            content={
                "ok": False,
                "code": result.get("code") or "GOOGLE_LOGIN_FAILED",
                "message": result.get("message") or "google login failed",
            },
        )

    set_product_session_cookie(response, result["raw_session_token"])

    auth_payload = result.get("auth_payload") or {}
    user = auth_payload.get("user") or {}
    access = auth_payload.get("access") or {}
    set_cookie_header = response.headers.get("set-cookie")

    logger.warning(
        "[AUTH_GOOGLE_LOGIN_DEBUG] ok=true origin=%s referer=%s host=%s xfwd_proto=%s cookie_header_present=%s session_cookie_before=%s session_cookie_after=%s set_cookie_present=%s set_cookie_preview=%s auth_mode=%s is_authenticated=%s user_id=%s billing_runtime=%s admin_access=%s",
        ctx_before["origin"],
        ctx_before["referer"],
        ctx_before["host"],
        ctx_before["xfwd_proto"],
        ctx_before["cookie_header_present"],
        ctx_before["session_cookie"],
        _mask_token(result.get("raw_session_token")),
        bool(set_cookie_header),
        _preview_header(set_cookie_header, 240),
        auth_payload.get("auth_mode"),
        auth_payload.get("is_authenticated"),
        user.get("user_id"),
        access.get("billing_runtime"),
        access.get("admin_access"),
    )

    return auth_payload


@router.post("/google/link")
def auth_google_link(
    request: Request,
    payload: dict = Body(...),
):
    credential = str(payload.get("credential") or "").strip()

    result = link_google_identity_for_authenticated_user(
        request=request,
        credential=credential,
    )

    if not result.get("ok"):
        return JSONResponse(
            status_code=int(result.get("status_code") or 400),
            content={
                "ok": False,
                "code": result.get("code") or "GOOGLE_LINK_FAILED",
                "message": result.get("message") or "google link failed",
            },
        )

    return result["auth_payload"]


@router.post("/logout")
def auth_logout(request: Request, response: Response):
    raw_session_token = read_product_session_cookie(request)
    logout_with_session_token(raw_session_token)
    clear_product_session_cookie(response)

    return {
        "ok": True,
    }

@router.post("/password/forgot")
def auth_password_forgot(
    request: Request,
    payload: dict = Body(...),
):
    return forgot_password(
        request=request,
        email=str(payload.get("email") or "").strip(),
    )


@router.post("/password/reset")
def auth_password_reset(
    payload: dict = Body(...),
):
    result = reset_password_with_token(
        token=str(payload.get("token") or "").strip(),
        new_password=str(payload.get("new_password") or ""),
    )

    if not result.get("ok"):
        return JSONResponse(
            status_code=int(result.get("status_code") or 400),
            content={
                "ok": False,
                "code": result.get("code") or "PASSWORD_RESET_FAILED",
                "message": result.get("message") or "password reset failed",
            },
        )

    return result

@router.post("/password/change")
def auth_password_change(
    request: Request,
    payload: dict = Body(...),
):
    result = change_password_authenticated(
        request=request,
        current_password=str(payload.get("current_password") or ""),
        new_password=str(payload.get("new_password") or ""),
    )

    if not result.get("ok"):
        return JSONResponse(
            status_code=int(result.get("status_code") or 400),
            content={
                "ok": False,
                "code": result.get("code") or "PASSWORD_CHANGE_FAILED",
                "message": result.get("message") or "password change failed",
            },
        )

    return result