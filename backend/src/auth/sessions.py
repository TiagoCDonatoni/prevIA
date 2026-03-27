from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Dict

from fastapi import Request, Response

from src.core.settings import load_settings


def make_session_token() -> str:
    return secrets.token_urlsafe(32)


def make_session_token_hash(raw_token: str) -> str:
    return hashlib.sha256(str(raw_token).encode("utf-8")).hexdigest()


def _hash_optional(raw_value: str | None) -> str | None:
    value = str(raw_value or "").strip()
    if not value:
        return None
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def build_request_fingerprints(request: Request) -> Dict[str, str | None]:
    forwarded_for = request.headers.get("x-forwarded-for", "")
    client_ip = forwarded_for.split(",")[0].strip() if forwarded_for else ""

    if not client_ip and request.client:
        client_ip = str(request.client.host or "").strip()

    user_agent = str(request.headers.get("user-agent", "")).strip()

    return {
        "ip_hash": _hash_optional(client_ip),
        "user_agent_hash": _hash_optional(user_agent),
    }


def build_session_expires_at():
    settings = load_settings()
    return datetime.now(timezone.utc) + timedelta(days=settings.product_session_ttl_days)


def read_product_session_cookie(request: Request) -> str | None:
    settings = load_settings()
    raw = request.cookies.get(settings.product_session_cookie_name)
    if raw is None:
        return None

    value = str(raw).strip()
    return value or None


def set_product_session_cookie(response: Response, raw_token: str) -> None:
    settings = load_settings()
    max_age = settings.product_session_ttl_days * 24 * 60 * 60

    response.set_cookie(
        key=settings.product_session_cookie_name,
        value=raw_token,
        httponly=True,
        secure=settings.product_session_cookie_secure,
        samesite=settings.product_session_cookie_samesite,
        max_age=max_age,
        expires=max_age,
        path="/",
    )


def clear_product_session_cookie(response: Response) -> None:
    settings = load_settings()

    response.delete_cookie(
        key=settings.product_session_cookie_name,
        path="/",
        secure=settings.product_session_cookie_secure,
        httponly=True,
        samesite=settings.product_session_cookie_samesite,
    )