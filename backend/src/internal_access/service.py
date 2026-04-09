from __future__ import annotations

from typing import Any, Dict, Iterable, Optional

from fastapi import Request

from src.core.settings import load_settings

ADMIN_ACCESS_CAPABILITY = "admin.access"
PRODUCT_INTERNAL_ACCESS_CAPABILITY = "product.internal.access"
PRODUCT_INTERNAL_PLAN_OVERRIDE_CAPABILITY = "product.internal.plan_override"
BILLING_SANDBOX_CAPABILITY = "billing.runtime.sandbox"
INTERNAL_ROLE_KEYS = {"staff_viewer", "staff_ops", "staff_admin"}
INTERNAL_MARKER_CAPABILITIES = {
    ADMIN_ACCESS_CAPABILITY,
    PRODUCT_INTERNAL_ACCESS_CAPABILITY,
    BILLING_SANDBOX_CAPABILITY,
}

VALID_PRODUCT_PLAN_CODES = {"FREE", "BASIC", "LIGHT", "PRO"}
PRODUCT_PLAN_OVERRIDE_HEADER = "x-product-plan-override"


def _normalize_text(value: Any) -> str:
    return str(value or "").strip()


def _normalize_email_domain(email: Optional[str]) -> str | None:
    raw = _normalize_text(email).lower()
    if not raw or "@" not in raw:
        return None
    return raw.rsplit("@", 1)[-1].strip() or None

def _normalize_email(email: Optional[str]) -> str:
    return _normalize_text(email).lower()


def _resolve_seed_internal_role(*, email: Optional[str], email_verified: bool) -> Dict[str, Any] | None:
    if not email_verified:
        return None

    normalized_email = _normalize_email(email)
    if not normalized_email:
        return None

    settings = load_settings()
    allowed = {str(item).strip().lower() for item in (settings.internal_staff_admin_emails or []) if str(item).strip()}
    if normalized_email not in allowed:
        return None

    return {
        "email": normalized_email,
        "role_key": "staff_admin",
        "billing_runtime": "sandbox",
        "source": "internal_staff_admin_emails",
    }

def build_default_access_context() -> Dict[str, Any]:
    return {
        "is_internal": False,
        "billing_runtime": "live",
        "role_keys": [],
        "capabilities": [],
        "admin_access": False,
        "product_internal_access": False,
        "allow_plan_override": False,
        "product_plan_code": None,
        "domain_rule": None,
    }


def actor_has_capability(access_context: Optional[Dict[str, Any]], capability_key: str) -> bool:
    if not access_context:
        return False
    caps = access_context.get("capabilities") or []
    return str(capability_key or "").strip() in {str(item or "").strip() for item in caps}

def resolve_runtime_product_plan_code(
    *,
    request: Optional[Request],
    access_context: Optional[Dict[str, Any]],
    fallback_plan_code: str,
) -> str:
    fallback = _normalize_text(fallback_plan_code).upper()
    if fallback not in VALID_PRODUCT_PLAN_CODES:
        fallback = "FREE"

    context = access_context or {}
    can_override = bool(context.get("allow_plan_override")) or actor_has_capability(
        context,
        PRODUCT_INTERNAL_PLAN_OVERRIDE_CAPABILITY,
    )

    if not can_override or request is None:
        return fallback

    override = _normalize_text(request.headers.get(PRODUCT_PLAN_OVERRIDE_HEADER)).upper()
    if override in VALID_PRODUCT_PLAN_CODES:
        return override

    return fallback

def _fetch_active_role_keys(cur, *, user_id: int) -> list[str]:
    cur.execute(
        """
        SELECT role_key
        FROM app.user_roles
        WHERE user_id = %(user_id)s
          AND is_active = TRUE
        ORDER BY role_key ASC
        """,
        {"user_id": user_id},
    )
    return [str(row[0]) for row in (cur.fetchall() or []) if row and row[0]]


def _fetch_role_capabilities(cur, *, role_keys: Iterable[str]) -> set[str]:
    normalized = [str(item).strip() for item in role_keys if str(item or "").strip()]
    if not normalized:
        return set()

    cur.execute(
        """
        SELECT capability_key
        FROM app.role_capabilities
        WHERE role_key = ANY(%(role_keys)s)
        """,
        {"role_keys": normalized},
    )
    return {str(row[0]) for row in (cur.fetchall() or []) if row and row[0]}


def _fetch_capability_overrides(cur, *, user_id: int) -> Dict[str, str]:
    cur.execute(
        """
        SELECT capability_key, effect
        FROM app.user_capability_overrides
        WHERE user_id = %(user_id)s
          AND is_active = TRUE
        """,
        {"user_id": user_id},
    )

    out: Dict[str, str] = {}
    for row in cur.fetchall() or []:
        capability_key = _normalize_text(row[0])
        effect = _normalize_text(row[1]).lower()
        if capability_key and effect in {"allow", "deny"}:
            out[capability_key] = effect
    return out


def _fetch_internal_domain_rule(cur, *, email: Optional[str], email_verified: bool) -> Dict[str, Any] | None:
    if not email_verified:
        return None

    domain = _normalize_email_domain(email)
    if not domain:
        return None

    cur.execute(
        """
        SELECT domain, default_role_key, auto_internal, billing_runtime
        FROM app.internal_domain_rules
        WHERE domain = %(domain)s
          AND active = TRUE
        LIMIT 1
        """,
        {"domain": domain},
    )
    row = cur.fetchone()
    if row is None:
        return None

    return {
        "domain": str(row[0]),
        "default_role_key": _normalize_text(row[1]) or None,
        "auto_internal": bool(row[2]),
        "billing_runtime": _normalize_text(row[3]).lower() or "live",
    }


def resolve_user_access_context(
    cur,
    *,
    user_id: int,
    email: Optional[str],
    email_verified: bool,
    auth_mode: Optional[str] = None,
) -> Dict[str, Any]:
    access = build_default_access_context()

    effective_roles = set(_fetch_active_role_keys(cur, user_id=user_id))
    domain_rule = _fetch_internal_domain_rule(cur, email=email, email_verified=email_verified)
    seed_rule = _resolve_seed_internal_role(email=email, email_verified=email_verified)

    if domain_rule and domain_rule.get("auto_internal"):
        access["is_internal"] = True
        if domain_rule.get("default_role_key"):
            effective_roles.add(str(domain_rule["default_role_key"]))
        access["billing_runtime"] = str(domain_rule.get("billing_runtime") or "sandbox")
        access["domain_rule"] = {
            "domain": str(domain_rule.get("domain") or ""),
            "source": "internal_domain_rule",
        }

    if seed_rule:
        access["is_internal"] = True
        effective_roles.add(str(seed_rule["role_key"]))
        access["billing_runtime"] = str(seed_rule.get("billing_runtime") or "sandbox")
        access["domain_rule"] = {
            "domain": str(seed_rule.get("email") or ""),
            "source": str(seed_rule.get("source") or "internal_staff_admin_emails"),
        }

    if str(auth_mode or "").strip() == "dev_auto_login":
        access["is_internal"] = True
        access["billing_runtime"] = "sandbox"
        effective_roles.add("staff_admin")
        access["domain_rule"] = {
            "domain": _normalize_email_domain(email) or "dev-auto-login",
            "source": "dev_auto_login_bridge",
        }

    capabilities = _fetch_role_capabilities(cur, role_keys=effective_roles)
    overrides = _fetch_capability_overrides(cur, user_id=user_id)

    for capability_key, effect in overrides.items():
        if effect == "allow":
            capabilities.add(capability_key)
        elif effect == "deny" and capability_key in capabilities:
            capabilities.remove(capability_key)

    if BILLING_SANDBOX_CAPABILITY in capabilities:
        access["billing_runtime"] = "sandbox"

    if (effective_roles & INTERNAL_ROLE_KEYS) or (capabilities & INTERNAL_MARKER_CAPABILITIES):
        access["is_internal"] = True

    access["role_keys"] = sorted(effective_roles)
    access["capabilities"] = sorted(capabilities)
    access["admin_access"] = ADMIN_ACCESS_CAPABILITY in capabilities
    access["product_internal_access"] = PRODUCT_INTERNAL_ACCESS_CAPABILITY in capabilities
    access["allow_plan_override"] = PRODUCT_INTERNAL_PLAN_OVERRIDE_CAPABILITY in capabilities
    # Não forçar PRO por ser sessão interna.
    # Sem override explícito, o produto deve cair no plano real da assinatura.
    access["product_plan_code"] = None

    return access