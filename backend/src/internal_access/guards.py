from __future__ import annotations

from typing import Any, Dict

from fastapi import HTTPException, Request, status

from src.auth.service import get_auth_me_payload
from src.core.settings import load_settings
from src.internal_access.service import ADMIN_ACCESS_CAPABILITY, actor_has_capability


def _build_dev_bypass_actor() -> Dict[str, Any]:
    settings = load_settings()
    actor_email = str(settings.admin_dev_actor_email or "dev-admin@previa.local").strip()

    return {
        "ok": True,
        "auth_mode": "admin_dev_bypass",
        "is_authenticated": True,
        "user": {
            "user_id": 0,
            "email": actor_email,
            "full_name": "Admin Dev Bypass",
            "preferred_lang": "pt",
            "status": "active",
            "email_verified": True,
        },
        "subscription": {
            "plan_code": "PRO",
            "status": "active",
            "provider": "manual",
            "billing_cycle": "monthly",
        },
        "entitlements": {},
        "usage": {
            "credits_used_today": 0,
        },
        "access": {
            "is_internal": True,
            "billing_runtime": "sandbox",
            "role_keys": ["staff_admin"],
            "capabilities": [
                "admin.access",
                "admin.audit.read",
                "admin.users.basic_write",
                "admin.users.credits.write",
                "admin.users.plan.write",
                "admin.users.read",
                "admin.users.roles.write",
                "billing.runtime.sandbox",
                "product.internal.access",
                "product.internal.plan_override",
            ],
            "admin_access": True,
            "product_internal_access": True,
            "allow_plan_override": True,
            "product_plan_code": "PRO",
            "domain_rule": {
                "domain": "admin-dev-bypass",
                "source": "admin_dev_bypass",
            },
        },
        "meta": {
            "source": "admin_dev_bypass",
        },
    }


def require_admin_access(request: Request) -> Dict[str, Any]:
    settings = load_settings()

    if settings.app_env in {"dev", "development", "local"} and settings.admin_dev_bypass_enabled:
        return _build_dev_bypass_actor()

    if not settings.admin_auth_enabled:
        return {
            "ok": True,
            "auth_mode": "admin_auth_disabled",
            "is_authenticated": True,
            "user": None,
            "access": {
                "admin_access": True,
                "capabilities": [ADMIN_ACCESS_CAPABILITY],
            },
        }

    payload = get_auth_me_payload(request)

    if not payload.get("is_authenticated"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "ok": False,
                "code": "ADMIN_UNAUTHENTICATED",
                "message": "admin authentication required",
            },
        )

    access_context = payload.get("access") or {}

    if not (
        bool(access_context.get("admin_access"))
        or actor_has_capability(access_context, ADMIN_ACCESS_CAPABILITY)
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "ok": False,
                "code": "ADMIN_FORBIDDEN",
                "message": "admin access denied",
            },
        )

    return payload