from __future__ import annotations

from fastapi import APIRouter, Body, Request, Response
from fastapi.responses import JSONResponse

from src.auth.service import (
    change_password_authenticated,
    forgot_password,
    get_auth_me_payload,
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


@router.get("/me")
def auth_me(request: Request):
    return get_auth_me_payload(request)


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
    result = login_with_google_credential(
        request=request,
        credential=str(payload.get("credential") or "").strip(),
    )

    if not result.get("ok"):
        return JSONResponse(
            status_code=int(result.get("status_code") or 400),
            content={
                "ok": False,
                "code": result.get("code") or "GOOGLE_LOGIN_FAILED",
                "message": result.get("message") or "google login failed",
            },
        )

    set_product_session_cookie(response, result["raw_session_token"])
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