from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Dict, List, Optional
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import json
import logging

import stripe

from src.core.settings import load_settings
from src.db.pg import pg_conn

VALID_PLAN_CODES = {"BASIC", "LIGHT", "PRO"}
VALID_BILLING_CYCLES = {"monthly", "quarterly", "annual"}
VALID_CURRENCY_CODES = {"BRL", "USD"}
VALID_BILLING_RUNTIMES = {"sandbox", "live"}

PLAN_CHANGE_PLAN_RANK = {
    "BASIC": 1,
    "LIGHT": 2,
    "PRO": 3,
}

PLAN_CHANGE_CYCLE_RANK = {
    "monthly": 1,
    "quarterly": 2,
    "annual": 3,
}

PLAN_CHANGE_ALLOWED_BILLING_STATUSES = {"active", "trialing"}

SUBSCRIPTION_STATUS_MAP = {
    "trialing": "trialing",
    "active": "active",
    "past_due": "past_due",
    "canceled": "canceled",
    "unpaid": "unpaid",
    "incomplete": "incomplete",
    "incomplete_expired": "expired",
    "paused": "paused",
}

logger = logging.getLogger(__name__)


def _json_default(value):
    if isinstance(value, Decimal):
        return str(value)

    if hasattr(value, "isoformat"):
        try:
            return value.isoformat()
        except Exception:
            pass

    return str(value)


def _json_dumps_safe(value):
    return json.dumps(value, default=_json_default)


def _currency_symbol(currency_code: str) -> str:
    value = str(currency_code or "").upper()
    if value == "USD":
        return "$"
    if value == "EUR":
        return "€"
    return "R$"


def _normalize_plan_code(plan_code: str) -> str:
    value = str(plan_code or "").strip().upper()
    if value not in VALID_PLAN_CODES:
        raise ValueError("invalid_plan_code")
    return value


def _normalize_billing_cycle(billing_cycle: str) -> str:
    value = str(billing_cycle or "").strip().lower()
    if value not in VALID_BILLING_CYCLES:
        raise ValueError("invalid_billing_cycle")
    return value

def _normalize_currency_code(currency_code: Optional[str]) -> str:
    value = str(currency_code or "").strip().upper()
    if value not in VALID_CURRENCY_CODES:
        return "BRL"
    return value

def _normalize_billing_runtime(billing_runtime: Optional[str]) -> str:
    value = str(billing_runtime or "").strip().lower()
    if value not in VALID_BILLING_RUNTIMES:
        return "live"
    return value


def _resolve_stripe_runtime_config(settings, *, billing_runtime: Optional[str]) -> Dict[str, str]:
    runtime = _normalize_billing_runtime(billing_runtime)
    if runtime == "sandbox":
        return {
            "billing_runtime": "sandbox",
            "secret_key": str(settings.stripe_sandbox_secret_key or "").strip(),
            "publishable_key": str(settings.stripe_sandbox_publishable_key or "").strip(),
            "webhook_secret": str(settings.stripe_sandbox_webhook_secret or "").strip(),
        }

    return {
        "billing_runtime": "live",
        "secret_key": str(settings.stripe_live_secret_key or "").strip(),
        "publishable_key": str(settings.stripe_live_publishable_key or "").strip(),
        "webhook_secret": str(settings.stripe_live_webhook_secret or "").strip(),
    }

def _ts_from_unix(value: Any) -> Optional[datetime]:
    if value in (None, "", 0):
        return None
    try:
        return datetime.fromtimestamp(int(value), tz=timezone.utc)
    except Exception:
        return None
def _append_query_param(url: str, key: str, value: str) -> str:
    raw_url = str(url or "").strip()
    if not raw_url:
        return raw_url

    parts = urlsplit(raw_url)
    query_items = [(k, v) for k, v in parse_qsl(parts.query, keep_blank_values=True) if k != key]
    query_items.append((key, value))

    return urlunsplit(
        (
            parts.scheme,
            parts.netloc,
            parts.path,
            urlencode(query_items),
            parts.fragment,
        )
    )


def _build_checkout_return_url(settings) -> str:
    default_success_url = (
        f"{settings.frontend_allowed_origins[0]}/app/account?billing=updated"
        if settings.frontend_allowed_origins
        else "http://localhost:5173/app/account?billing=updated"
    )

    base_return_url = settings.stripe_checkout_success_url or default_success_url
    return _append_query_param(base_return_url, "session_id", "{CHECKOUT_SESSION_ID}")

def _extract_price_from_subscription(subscription: Dict[str, Any]) -> Dict[str, Any]:
    items = (((subscription or {}).get("items") or {}).get("data") or [])
    first_item = items[0] if items else {}
    price = first_item.get("price") or {}
    recurring = price.get("recurring") or {}

    interval = str(recurring.get("interval") or "").lower()
    interval_count = int(recurring.get("interval_count") or 1)

    if interval == "month" and interval_count == 3:
        billing_cycle = "quarterly"
    elif interval == "year":
        billing_cycle = "annual"
    else:
        billing_cycle = "monthly"

    return {
        "provider_price_id": price.get("id"),
        "currency_code": str(price.get("currency") or "BRL").upper(),
        "billing_cycle": billing_cycle,
    }


def _resolve_plan_price_by_provider_price_id(
    provider_price_id: Optional[str],
    *,
    billing_runtime: Optional[str] = "live",
) -> Optional[Dict[str, Any]]:
    if not provider_price_id:
        return None

    normalized_runtime = _normalize_billing_runtime(billing_runtime)

    with pg_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT plan_price_id, price_code, plan_code, billing_cycle, currency_code
                FROM billing.plan_prices
                WHERE provider = 'stripe'
                  AND (
                    (%(billing_runtime)s = 'sandbox' AND provider_price_id = %(provider_price_id)s)
                    OR
                    (%(billing_runtime)s = 'live' AND provider_price_id_live = %(provider_price_id)s)
                  )
                LIMIT 1
                """,
                {
                    "billing_runtime": normalized_runtime,
                    "provider_price_id": provider_price_id,
                },
            )
            row = cur.fetchone()
        conn.commit()

    if row is None:
        return None

    return {
        "plan_price_id": int(row[0]),
        "price_code": str(row[1]),
        "plan_code": str(row[2]),
        "billing_cycle": str(row[3]),
        "currency_code": str(row[4]),
    }


def _resolve_user_id_from_subscription_payload(
    subscription: Dict[str, Any],
    *,
    billing_runtime: Optional[str] = "live",
) -> Optional[int]:
    metadata = subscription.get("metadata") or {}
    user_id = metadata.get("user_id")
    if user_id:
        try:
            return int(user_id)
        except Exception:
            pass

    customer_id = subscription.get("customer")
    if not customer_id:
        return None

    normalized_runtime = _normalize_billing_runtime(billing_runtime)

    with pg_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT user_id
                FROM billing.subscriptions
                WHERE provider = 'stripe'
                  AND billing_runtime = %(billing_runtime)s
                  AND provider_customer_id = %(customer_id)s
                ORDER BY updated_at_utc DESC, subscription_id DESC
                LIMIT 1
                """,
                {
                    "billing_runtime": normalized_runtime,
                    "customer_id": str(customer_id),
                },
            )
            row = cur.fetchone()
        conn.commit()

    if row is None:
        return None

    return int(row[0])

def list_billing_catalog(currency_code: Optional[str] = None) -> Dict[str, Any]:
    rows: List[Dict[str, Any]] = []
    requested_currency = _normalize_currency_code(currency_code)

    with pg_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    pp.price_code,
                    pp.plan_code,
                    pp.billing_cycle,
                    pp.currency_code,
                    pp.unit_amount_cents,
                    pp.price_version,
                    pp.provider,
                    pp.provider_product_id,
                    pp.provider_price_id,
                    pp.active,
                    pp.sort_order,
                    pp.metadata_json,
                    p.config_json
                FROM billing.plan_prices pp
                JOIN billing.plans p
                  ON p.plan_code = pp.plan_code
                WHERE pp.active = TRUE
                  AND p.active = TRUE
                ORDER BY pp.sort_order ASC, pp.price_code ASC
                """
            )
            for row in cur.fetchall():
                default_currency = str(row[3] or "BRL").upper()
                default_amount_cents = int(row[4])
                metadata_json = row[11] or {}
                plan_config = row[12] or {}

                display_amounts = {}
                if isinstance(metadata_json, dict):
                    display_amounts = metadata_json.get("display_amounts") or {}

                selected_amount_cents = display_amounts.get(requested_currency)
                if selected_amount_cents is None:
                    selected_amount_cents = default_amount_cents

                selected_currency = requested_currency if requested_currency in display_amounts else default_currency

                rows.append(
                    {
                        "price_code": str(row[0]),
                        "plan_code": str(row[1]),
                        "billing_cycle": str(row[2]),
                        "currency_code": selected_currency,
                        "currency_symbol": _currency_symbol(selected_currency),
                        "unit_amount_cents": int(selected_amount_cents),
                        "unit_amount": int(selected_amount_cents) / 100.0,
                        "price_version": str(row[5]),
                        "provider": str(row[6]),
                        "provider_product_id": row[7],
                        "provider_price_id": row[8],
                        "active": bool(row[9]),
                        "sort_order": int(row[10]),
                        "metadata_json": metadata_json,
                        "plan_config": plan_config,
                    }
                )

        conn.commit()

    return {
        "ok": True,
        "currency_code": requested_currency,
        "items": rows,
    }

def create_checkout_session_for_user(
    *,
    user_id: int,
    plan_code: str,
    billing_cycle: str,
    currency_code: str,
    billing_runtime: str = "live",
) -> Dict[str, Any]:
    settings = load_settings()
    runtime_config = _resolve_stripe_runtime_config(settings, billing_runtime=billing_runtime)
    normalized_runtime = runtime_config["billing_runtime"]

    if not runtime_config["secret_key"]:
        raise RuntimeError(f"stripe_{normalized_runtime}_not_configured")
    if not runtime_config["publishable_key"]:
        raise RuntimeError(f"stripe_{normalized_runtime}_publishable_key_not_configured")

    plan_code = _normalize_plan_code(plan_code)
    billing_cycle = _normalize_billing_cycle(billing_cycle)
    currency_code = _normalize_currency_code(currency_code)

    effective = get_effective_subscription_for_user(user_id, billing_runtime=normalized_runtime)
    if effective is not None:
        provider = str(effective.get("provider") or "").strip().lower()
        provider_subscription_id = str(effective.get("provider_subscription_id") or "").strip()
        billing_status = str(effective.get("billing_status") or "").strip().lower()

        if provider == "stripe" and provider_subscription_id and not _is_terminal_billing_status(billing_status):
            raise ValueError("subscription_change_must_use_account_billing")

    with pg_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT email, full_name
                FROM app.users
                WHERE user_id = %(user_id)s
                LIMIT 1
                """,
                {"user_id": user_id},
            )
            user_row = cur.fetchone()
            if user_row is None:
                raise ValueError("user_not_found")

            email = str(user_row[0])

            cur.execute(
                """
                SELECT
                    plan_price_id,
                    price_code,
                    currency_code,
                    unit_amount_cents,
                    provider_product_id,
                    provider_price_id,
                    provider_product_id_live,
                    provider_price_id_live
                FROM billing.plan_prices
                WHERE plan_code = %(plan_code)s
                  AND billing_cycle = %(billing_cycle)s
                  AND currency_code = %(currency_code)s
                  AND active = TRUE
                ORDER BY sort_order ASC, plan_price_id ASC
                LIMIT 1
                """,
                {
                    "plan_code": plan_code,
                    "billing_cycle": billing_cycle,
                    "currency_code": currency_code,
                },
            )
            price_row = cur.fetchone()
            if price_row is None:
                raise ValueError("plan_price_not_found_for_currency")

            plan_price_id = int(price_row[0])
            price_code = str(price_row[1])
            executable_currency_code = str(price_row[2] or "BRL").upper()

            if normalized_runtime == "sandbox":
                provider_product_id = price_row[4]
                provider_price_id = price_row[5]
            else:
                provider_product_id = price_row[6]
                provider_price_id = price_row[7]

            if not provider_price_id:
                raise ValueError(f"stripe_price_not_configured_for_{normalized_runtime}")

            cur.execute(
                """
                SELECT provider_customer_id
                FROM billing.subscriptions
                WHERE user_id = %(user_id)s
                  AND provider = 'stripe'
                  AND billing_runtime = %(billing_runtime)s
                  AND provider_customer_id IS NOT NULL
                ORDER BY updated_at_utc DESC, subscription_id DESC
                LIMIT 1
                """,
                {
                    "user_id": user_id,
                    "billing_runtime": normalized_runtime,
                },
            )
            customer_row = cur.fetchone()
            provider_customer_id = str(customer_row[0]) if customer_row and customer_row[0] else None

        conn.commit()

    stripe.api_key = runtime_config["secret_key"]

    return_url = _build_checkout_return_url(settings)

    session_params: Dict[str, Any] = {
        "mode": "subscription",
        "ui_mode": "elements",
        "payment_method_types": ["card"],
        "line_items": [
            {
                "price": provider_price_id,
                "quantity": 1,
            }
        ],
        "return_url": return_url,
        "client_reference_id": str(user_id),
        "allow_promotion_codes": True,
        "metadata": {
            "user_id": str(user_id),
            "plan_code": plan_code,
            "billing_cycle": billing_cycle,
            "currency_code": executable_currency_code,
            "plan_price_id": str(plan_price_id),
            "price_code": price_code,
            "provider_price_id": provider_price_id,
            "billing_runtime": normalized_runtime,
        },
        "subscription_data": {
            "metadata": {
                "user_id": str(user_id),
                "plan_code": plan_code,
                "billing_cycle": billing_cycle,
                "currency_code": executable_currency_code,
                "plan_price_id": str(plan_price_id),
                "price_code": price_code,
                "provider_price_id": provider_price_id,
                "billing_runtime": normalized_runtime,
            }
        },
    }

    if provider_customer_id:
        session_params["customer"] = provider_customer_id
    else:
        session_params["customer_email"] = email

    try:
        session = stripe.checkout.Session.create(**session_params)
    except stripe.error.StripeError as exc:
        stripe_detail = getattr(exc, "user_message", None) or str(exc) or exc.__class__.__name__
        raise RuntimeError(f"stripe_checkout_session_create_failed: {stripe_detail}") from exc

    client_secret = getattr(session, "client_secret", None)
    if not client_secret:
        raise RuntimeError("stripe_checkout_client_secret_not_available")

    return {
        "ok": True,
        "ui_mode": "elements",
        "session_id": session.id,
        "checkout_client_secret": client_secret,
        "publishable_key": runtime_config["publishable_key"],
        "price_code": price_code,
        "plan_code": plan_code,
        "billing_cycle": billing_cycle,
        "currency_code": executable_currency_code,
        "provider_product_id": provider_product_id,
        "provider_price_id": provider_price_id,
        "billing_runtime": normalized_runtime,
    }

def _resolve_user_id_from_checkout_session_payload(
    checkout_session: Dict[str, Any],
    *,
    billing_runtime: Optional[str] = "live",
) -> Optional[int]:
    metadata = checkout_session.get("metadata") or {}

    for candidate in (metadata.get("user_id"), checkout_session.get("client_reference_id")):
        if candidate in (None, ""):
            continue
        try:
            return int(candidate)
        except Exception:
            pass

    customer_id = str(checkout_session.get("customer") or "").strip()
    if customer_id:
        normalized_runtime = _normalize_billing_runtime(billing_runtime)

        with pg_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT user_id
                    FROM billing.subscriptions
                    WHERE provider = 'stripe'
                      AND billing_runtime = %(billing_runtime)s
                      AND provider_customer_id = %(customer_id)s
                    ORDER BY updated_at_utc DESC, subscription_id DESC
                    LIMIT 1
                    """,
                    {
                        "billing_runtime": normalized_runtime,
                        "customer_id": customer_id,
                    },
                )
                row = cur.fetchone()
            conn.commit()

        if row is not None:
            return int(row[0])

    email = str(
        ((checkout_session.get("customer_details") or {}).get("email") or checkout_session.get("customer_email") or "")
    ).strip().lower()
    if not email:
        return None

    with pg_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT user_id
                FROM app.users
                WHERE email_normalized = %(email_normalized)s
                LIMIT 1
                """,
                {"email_normalized": email},
            )
            row = cur.fetchone()
        conn.commit()

    if row is None:
        return None

    return int(row[0])


def _resolve_plan_price_by_id(plan_price_id: Optional[Any]) -> Optional[Dict[str, Any]]:
    if plan_price_id in (None, ""):
        return None

    try:
        normalized_plan_price_id = int(plan_price_id)
    except Exception:
        return None

    with pg_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT plan_price_id, price_code, plan_code, billing_cycle, currency_code
                FROM billing.plan_prices
                WHERE plan_price_id = %(plan_price_id)s
                LIMIT 1
                """,
                {"plan_price_id": normalized_plan_price_id},
            )
            row = cur.fetchone()
        conn.commit()

    if row is None:
        return None

    return {
        "plan_price_id": int(row[0]),
        "price_code": str(row[1]),
        "plan_code": str(row[2]),
        "billing_cycle": str(row[3]),
        "currency_code": str(row[4]),
    }


def _resolve_plan_price_by_price_code(price_code: Optional[str]) -> Optional[Dict[str, Any]]:
    normalized_price_code = str(price_code or "").strip()
    if not normalized_price_code:
        return None

    with pg_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT plan_price_id, price_code, plan_code, billing_cycle, currency_code
                FROM billing.plan_prices
                WHERE price_code = %(price_code)s
                LIMIT 1
                """,
                {"price_code": normalized_price_code},
            )
            row = cur.fetchone()
        conn.commit()

    if row is None:
        return None

    return {
        "plan_price_id": int(row[0]),
        "price_code": str(row[1]),
        "plan_code": str(row[2]),
        "billing_cycle": str(row[3]),
        "currency_code": str(row[4]),
    }

def _resolve_plan_price_detail_by_id(plan_price_id: Optional[Any]) -> Optional[Dict[str, Any]]:
    if plan_price_id in (None, ""):
        return None

    try:
        normalized_plan_price_id = int(plan_price_id)
    except Exception:
        return None

    with pg_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    plan_price_id,
                    price_code,
                    plan_code,
                    billing_cycle,
                    currency_code,
                    unit_amount_cents,
                    price_version
                FROM billing.plan_prices
                WHERE plan_price_id = %(plan_price_id)s
                LIMIT 1
                """,
                {"plan_price_id": normalized_plan_price_id},
            )
            row = cur.fetchone()
        conn.commit()

    if row is None:
        return None

    return {
        "plan_price_id": int(row[0]),
        "price_code": str(row[1]),
        "plan_code": str(row[2]),
        "billing_cycle": str(row[3]),
        "currency_code": str(row[4]),
        "unit_amount_cents": int(row[5]) if row[5] is not None else None,
        "price_version": str(row[6]) if row[6] is not None else None,
    }

def _resolve_active_plan_price(
    *,
    plan_code: str,
    billing_cycle: str,
    currency_code: str,
) -> Optional[Dict[str, Any]]:
    normalized_plan_code = _normalize_plan_code(plan_code)
    normalized_billing_cycle = _normalize_billing_cycle(billing_cycle)
    normalized_currency_code = _normalize_currency_code(currency_code)

    with pg_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    plan_price_id,
                    price_code,
                    plan_code,
                    billing_cycle,
                    currency_code,
                    unit_amount_cents,
                    price_version
                FROM billing.plan_prices
                WHERE plan_code = %(plan_code)s
                  AND billing_cycle = %(billing_cycle)s
                  AND currency_code = %(currency_code)s
                  AND active = TRUE
                ORDER BY sort_order ASC, plan_price_id ASC
                LIMIT 1
                """,
                {
                    "plan_code": normalized_plan_code,
                    "billing_cycle": normalized_billing_cycle,
                    "currency_code": normalized_currency_code,
                },
            )
            row = cur.fetchone()
        conn.commit()

    if row is None:
        return None

    return {
        "plan_price_id": int(row[0]),
        "price_code": str(row[1]),
        "plan_code": str(row[2]),
        "billing_cycle": str(row[3]),
        "currency_code": str(row[4]),
        "unit_amount_cents": int(row[5]) if row[5] is not None else None,
        "price_version": str(row[6]) if row[6] is not None else None,
    }

def _resolve_plan_price_from_checkout_session_payload(checkout_session: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    metadata = checkout_session.get("metadata") or {}

    resolved = _resolve_plan_price_by_id(metadata.get("plan_price_id"))
    if resolved is not None:
        return resolved

    resolved = _resolve_plan_price_by_price_code(metadata.get("price_code"))
    if resolved is not None:
        return resolved

    plan_code = str(metadata.get("plan_code") or "").strip().upper()
    billing_cycle = str(metadata.get("billing_cycle") or "").strip().lower()
    currency_code = _normalize_currency_code(metadata.get("currency_code"))

    if not plan_code or billing_cycle not in VALID_BILLING_CYCLES:
        return None

    with pg_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT plan_price_id, price_code, plan_code, billing_cycle, currency_code
                FROM billing.plan_prices
                WHERE plan_code = %(plan_code)s
                  AND billing_cycle = %(billing_cycle)s
                  AND currency_code = %(currency_code)s
                  AND active = TRUE
                ORDER BY sort_order ASC, plan_price_id ASC
                LIMIT 1
                """,
                {
                    "plan_code": plan_code,
                    "billing_cycle": billing_cycle,
                    "currency_code": currency_code,
                },
            )
            row = cur.fetchone()
        conn.commit()

    if row is None:
        return None

    return {
        "plan_price_id": int(row[0]),
        "price_code": str(row[1]),
        "plan_code": str(row[2]),
        "billing_cycle": str(row[3]),
        "currency_code": str(row[4]),
    }


def _normalize_subscription_row_status(billing_status: Optional[str]) -> str:
    value = str(billing_status or "").strip().lower()
    if value == "active":
        return "active"
    if value == "trialing":
        return "trialing"
    if value == "past_due":
        return "past_due"
    if value == "canceled":
        return "cancelled"
    return "expired"

def _is_terminal_billing_status(billing_status: Optional[str]) -> bool:
    value = str(billing_status or "").strip().lower()
    return value in {"canceled", "cancelled", "expired", "incomplete_expired"}

def _classify_subscription_change(
    *,
    current_plan_code: str,
    current_billing_cycle: str,
    target_plan_code: str,
    target_billing_cycle: str,
) -> Dict[str, str]:
    current_plan = _normalize_plan_code(current_plan_code)
    current_cycle = _normalize_billing_cycle(current_billing_cycle)
    target_plan = _normalize_plan_code(target_plan_code)
    target_cycle = _normalize_billing_cycle(target_billing_cycle)

    if current_plan == target_plan and current_cycle == target_cycle:
        return {
            "decision_code": "noop",
            "effective_mode": "none",
        }

    current_plan_rank = PLAN_CHANGE_PLAN_RANK[current_plan]
    target_plan_rank = PLAN_CHANGE_PLAN_RANK[target_plan]

    if target_plan_rank > current_plan_rank:
        return {
            "decision_code": "upgrade_now",
            "effective_mode": "immediate",
        }

    if target_plan_rank < current_plan_rank:
        return {
            "decision_code": "downgrade_period_end",
            "effective_mode": "period_end",
        }

    current_cycle_rank = PLAN_CHANGE_CYCLE_RANK[current_cycle]
    target_cycle_rank = PLAN_CHANGE_CYCLE_RANK[target_cycle]

    if target_cycle_rank > current_cycle_rank:
        return {
            "decision_code": "cycle_upgrade_now",
            "effective_mode": "immediate",
        }

    if target_cycle_rank < current_cycle_rank:
        return {
            "decision_code": "cycle_downgrade_period_end",
            "effective_mode": "period_end",
        }

    return {
        "decision_code": "noop",
        "effective_mode": "none",
    }

def _build_entitlements_for_plan(plan_code: str) -> Dict[str, Any]:
    plan = str(plan_code or "FREE").strip().upper()
    if plan not in {"FREE", "BASIC", "LIGHT", "PRO"}:
        plan = "FREE"

    if plan == "FREE":
        daily_limit = 5
        books_count = 1
        max_future_days = 0
        chat = False
        show_metrics = False
        show_head_to_head = False
    elif plan == "BASIC":
        daily_limit = 10
        books_count = 1
        max_future_days = 3
        chat = False
        show_metrics = False
        show_head_to_head = False
    elif plan == "LIGHT":
        daily_limit = 50
        books_count = 3
        max_future_days = 14
        chat = False
        show_metrics = False
        show_head_to_head = False
    else:
        daily_limit = 200
        books_count = 999
        max_future_days = 3650
        chat = True
        show_metrics = True
        show_head_to_head = True

    return {
        "credits": {"daily_limit": daily_limit},
        "features": {"chat": chat},
        "visibility": {
            "odds": {"books_count": books_count},
            "model": {"show_metrics": show_metrics},
            "context": {"show_head_to_head": show_head_to_head},
        },
        "limits": {"max_future_days": max_future_days},
    }


def _upsert_entitlements_snapshot(cur, *, user_id: int, plan_code: str) -> Dict[str, Any]:
    entitlements = _build_entitlements_for_plan(plan_code)
    cur.execute(
        """
        INSERT INTO access.user_entitlements_snapshot (
            user_id,
            plan_code,
            entitlements_json,
            computed_at_utc,
            version
        )
        VALUES (
            %(user_id)s,
            %(plan_code)s,
            %(entitlements_json)s::jsonb,
            NOW(),
            'v1'
        )
        ON CONFLICT (user_id)
        DO UPDATE SET
            plan_code = EXCLUDED.plan_code,
            entitlements_json = EXCLUDED.entitlements_json,
            computed_at_utc = NOW(),
            version = EXCLUDED.version
        """,
        {
            "user_id": user_id,
            "plan_code": plan_code,
            "entitlements_json": json.dumps(entitlements),
        },
    )
    return entitlements


def _insert_subscription_event(
    cur,
    *,
    subscription_id: int,
    user_id: int,
    event_type: str,
    billing_runtime: str,
    payload_json: Dict[str, Any],
) -> None:
    cur.execute(
        """
        INSERT INTO billing.subscription_events (
            subscription_id,
            user_id,
            billing_runtime,
            event_type,
            payload_json
        )
        VALUES (
            %(subscription_id)s,
            %(user_id)s,
            %(billing_runtime)s,
            %(event_type)s,
            %(payload_json)s::jsonb
        )
        """,
        {
            "subscription_id": subscription_id,
            "user_id": user_id,
            "billing_runtime": _normalize_billing_runtime(billing_runtime),
            "event_type": event_type,
            "payload_json": _json_dumps_safe(payload_json),
        },
    )


def _extract_webhook_context(
    event: Dict[str, Any],
    *,
    billing_runtime: Optional[str] = "live",
) -> Dict[str, Any]:
    event_id = str(event.get("id") or "")
    event_type = str(event.get("type") or "")
    data_object = (((event or {}).get("data") or {}).get("object") or {})
    normalized_runtime = _normalize_billing_runtime(billing_runtime)

    provider_customer_id = None
    provider_checkout_session_id = None
    provider_subscription_id = None
    provider_price_id = None
    user_id = None
    plan_price_id = None

    if event_type.startswith("checkout.session."):
        checkout_session = data_object
        provider_customer_id = str(checkout_session.get("customer") or "").strip() or None
        provider_checkout_session_id = str(checkout_session.get("id") or "").strip() or None
        provider_subscription_id = str(checkout_session.get("subscription") or "").strip() or None
        provider_price_id = str((checkout_session.get("metadata") or {}).get("provider_price_id") or "").strip() or None
        user_id = _resolve_user_id_from_checkout_session_payload(
            checkout_session,
            billing_runtime=normalized_runtime,
        )
        resolved = _resolve_plan_price_from_checkout_session_payload(checkout_session)
        if resolved is not None:
            plan_price_id = int(resolved["plan_price_id"])
    elif event_type.startswith("customer.subscription."):
        subscription = data_object
        provider_customer_id = str(subscription.get("customer") or "").strip() or None
        provider_subscription_id = str(subscription.get("id") or "").strip() or None
        extracted_price = _extract_price_from_subscription(subscription)
        provider_price_id = str(extracted_price.get("provider_price_id") or "").strip() or None
        user_id = _resolve_user_id_from_subscription_payload(
            subscription,
            billing_runtime=normalized_runtime,
        )
        resolved = _resolve_plan_price_by_provider_price_id(
            provider_price_id,
            billing_runtime=normalized_runtime,
        )
        if resolved is not None:
            plan_price_id = int(resolved["plan_price_id"])

    return {
        "event_id": event_id,
        "event_type": event_type,
        "billing_runtime": normalized_runtime,
        "user_id": user_id,
        "plan_price_id": plan_price_id,
        "provider_customer_id": provider_customer_id,
        "provider_checkout_session_id": provider_checkout_session_id,
        "provider_subscription_id": provider_subscription_id,
        "provider_price_id": provider_price_id,
    }


def _upsert_stripe_webhook_event(
    *,
    event: Dict[str, Any],
    status: str,
    billing_runtime: str,
    error_code: Optional[str] = None,
    error_message: Optional[str] = None,
    sync_result: Optional[Dict[str, Any]] = None,
) -> None:
    normalized_runtime = _normalize_billing_runtime(billing_runtime)
    context = _extract_webhook_context(event, billing_runtime=normalized_runtime)
    payload_json: Dict[str, Any] = {"event": event}
    if sync_result is not None:
        payload_json["sync_result"] = sync_result

    with pg_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO billing.webhook_events (
                    provider,
                    billing_runtime,
                    provider_event_id,
                    event_type,
                    status,
                    user_id,
                    subscription_id,
                    plan_price_id,
                    provider_customer_id,
                    provider_checkout_session_id,
                    provider_subscription_id,
                    provider_price_id,
                    error_code,
                    error_message,
                    payload_json,
                    created_at_utc,
                    updated_at_utc
                )
                VALUES (
                    'stripe',
                    %(billing_runtime)s,
                    %(provider_event_id)s,
                    %(event_type)s,
                    %(status)s,
                    %(user_id)s,
                    %(subscription_id)s,
                    %(plan_price_id)s,
                    %(provider_customer_id)s,
                    %(provider_checkout_session_id)s,
                    %(provider_subscription_id)s,
                    %(provider_price_id)s,
                    %(error_code)s,
                    %(error_message)s,
                    %(payload_json)s::jsonb,
                    NOW(),
                    NOW()
                )
                ON CONFLICT (provider, billing_runtime, provider_event_id)
                DO UPDATE SET
                    event_type = EXCLUDED.event_type,
                    status = EXCLUDED.status,
                    user_id = COALESCE(EXCLUDED.user_id, billing.webhook_events.user_id),
                    subscription_id = COALESCE(EXCLUDED.subscription_id, billing.webhook_events.subscription_id),
                    plan_price_id = COALESCE(EXCLUDED.plan_price_id, billing.webhook_events.plan_price_id),
                    provider_customer_id = COALESCE(EXCLUDED.provider_customer_id, billing.webhook_events.provider_customer_id),
                    provider_checkout_session_id = COALESCE(EXCLUDED.provider_checkout_session_id, billing.webhook_events.provider_checkout_session_id),
                    provider_subscription_id = COALESCE(EXCLUDED.provider_subscription_id, billing.webhook_events.provider_subscription_id),
                    provider_price_id = COALESCE(EXCLUDED.provider_price_id, billing.webhook_events.provider_price_id),
                    error_code = EXCLUDED.error_code,
                    error_message = EXCLUDED.error_message,
                    payload_json = EXCLUDED.payload_json,
                    updated_at_utc = NOW()
                """,
                {
                    "billing_runtime": normalized_runtime,
                    "provider_event_id": context["event_id"],
                    "event_type": context["event_type"],
                    "status": status,
                    "user_id": sync_result.get("user_id") if sync_result else context.get("user_id"),
                    "subscription_id": sync_result.get("subscription_id") if sync_result else None,
                    "plan_price_id": sync_result.get("plan_price_id") if sync_result else context.get("plan_price_id"),
                    "provider_customer_id": sync_result.get("provider_customer_id") if sync_result else context.get("provider_customer_id"),
                    "provider_checkout_session_id": sync_result.get("provider_checkout_session_id") if sync_result else context.get("provider_checkout_session_id"),
                    "provider_subscription_id": sync_result.get("provider_subscription_id") if sync_result else context.get("provider_subscription_id"),
                    "provider_price_id": sync_result.get("provider_price_id") if sync_result else context.get("provider_price_id"),
                    "error_code": error_code,
                    "error_message": error_message,
                    "payload_json": _json_dumps_safe(payload_json),
                },
            )
        conn.commit()


def process_stripe_webhook_event(
    event: Dict[str, Any],
    *,
    billing_runtime: str = "live",
) -> Dict[str, Any]:
    normalized_runtime = _normalize_billing_runtime(billing_runtime)
    event_id = str(event.get("id") or "").strip()
    if not event_id:
        raise ValueError("invalid_event_id")

    existing_status = _get_existing_stripe_webhook_event_status(
        event_id,
        billing_runtime=normalized_runtime,
    )
    if existing_status in {"processed", "ignored"}:
        logger.info(
            "stripe webhook duplicate ignored runtime=%s event_id=%s existing_status=%s",
            normalized_runtime,
            event_id,
            existing_status,
        )
        return {
            "ok": True,
            "ignored": True,
            "duplicate": True,
            "billing_runtime": normalized_runtime,
            "event_id": event_id,
            "existing_status": existing_status,
        }

    _safe_upsert_stripe_webhook_event(
        event=event,
        status="received",
        billing_runtime=normalized_runtime,
    )

    try:
        result = sync_subscription_from_stripe_event(
            event,
            billing_runtime=normalized_runtime,
        )
        final_status = "ignored" if result.get("ignored") else "processed"
        _safe_upsert_stripe_webhook_event(
            event=event,
            status=final_status,
            billing_runtime=normalized_runtime,
            sync_result=result,
        )
        return result
    except ValueError as exc:
        _safe_upsert_stripe_webhook_event(
            event=event,
            status="failed",
            billing_runtime=normalized_runtime,
            error_code=str(exc),
            error_message=str(exc),
        )
        raise
    except Exception as exc:
        _safe_upsert_stripe_webhook_event(
            event=event,
            status="failed",
            billing_runtime=normalized_runtime,
            error_code="stripe_webhook_processing_failed",
            error_message=str(exc),
        )
        raise


def sync_subscription_from_stripe_event(
    event: Dict[str, Any],
    *,
    billing_runtime: str = "live",
) -> Dict[str, Any]:
    event_id = str(event.get("id") or "")
    incoming_event_type = str(event.get("type") or "")
    data_object = (((event or {}).get("data") or {}).get("object") or {})
    normalized_runtime = _normalize_billing_runtime(billing_runtime)

    if not event_id:
        raise ValueError("invalid_event_id")

    checkout_session = data_object if incoming_event_type.startswith("checkout.session.") else None

    if checkout_session is not None:
        if incoming_event_type != "checkout.session.completed":
            return {"ok": True, "ignored": True, "event_type": incoming_event_type}

        provider_subscription_id = str(checkout_session.get("subscription") or "").strip()
        if not provider_subscription_id:
            return {"ok": True, "ignored": True, "event_type": incoming_event_type}

        settings = load_settings()
        runtime_config = _resolve_stripe_runtime_config(settings, billing_runtime=normalized_runtime)
        if not runtime_config["secret_key"]:
            raise RuntimeError(f"stripe_{normalized_runtime}_not_configured")

        stripe.api_key = runtime_config["secret_key"]
        subscription = stripe.Subscription.retrieve(provider_subscription_id)
        data_object = subscription._to_dict_recursive()

    if not incoming_event_type.startswith("customer.subscription.") and checkout_session is None:
        return {"ok": True, "ignored": True, "event_type": incoming_event_type}

    subscription = data_object
    provider_subscription_id = str(subscription.get("id") or "").strip()
    if not provider_subscription_id:
        raise ValueError("invalid_subscription_id")

    provider_customer_id = str(subscription.get("customer") or "").strip() or None
    provider_checkout_session_id = str(checkout_session.get("id") or "").strip() if checkout_session is not None else None

    user_id = _resolve_user_id_from_checkout_session_payload(
        checkout_session,
        billing_runtime=normalized_runtime,
    ) if checkout_session is not None else None
    if user_id is None:
        user_id = _resolve_user_id_from_subscription_payload(
            subscription,
            billing_runtime=normalized_runtime,
        )
    if user_id is None:
        raise ValueError("subscription_user_not_found")

    extracted_price = _extract_price_from_subscription(subscription)
    provider_price_id = str(extracted_price["provider_price_id"] or "").strip() or None

    resolved_plan_price = _resolve_plan_price_by_provider_price_id(
        provider_price_id,
        billing_runtime=normalized_runtime,
    )
    if resolved_plan_price is None and checkout_session is not None:
        resolved_plan_price = _resolve_plan_price_from_checkout_session_payload(checkout_session)
    if resolved_plan_price is None:
        raise ValueError("plan_price_mapping_not_found")

    billing_status = SUBSCRIPTION_STATUS_MAP.get(
        str(subscription.get("status") or "").lower(),
        str(subscription.get("status") or "").lower() or "unknown",
    )
    row_status = _normalize_subscription_row_status(billing_status)

    cancel_at_period_end = bool(subscription.get("cancel_at_period_end") or False)
    current_period_start = _ts_from_unix(subscription.get("current_period_start"))
    current_period_end = _ts_from_unix(subscription.get("current_period_end"))
    canceled_at_utc = _ts_from_unix(subscription.get("canceled_at"))
    trial_start_utc = _ts_from_unix(subscription.get("trial_start"))
    trial_end_utc = _ts_from_unix(subscription.get("trial_end"))

    raw_payload_json = _json_dumps_safe(
        {
            "event_id": event_id,
            "incoming_event_type": incoming_event_type,
            "billing_runtime": normalized_runtime,
            "subscription": subscription,
            "checkout_session": checkout_session,
        }
    )

    access_plan_code = resolved_plan_price["plan_code"] if row_status in {"active", "trialing", "past_due"} else "FREE"

    with pg_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT subscription_id
                FROM billing.subscriptions
                WHERE provider = 'stripe'
                  AND billing_runtime = %(billing_runtime)s
                  AND provider_subscription_id = %(provider_subscription_id)s
                LIMIT 1
                """,
                {
                    "billing_runtime": normalized_runtime,
                    "provider_subscription_id": provider_subscription_id,
                },
            )
            existing = cur.fetchone()

            params = {
                "user_id": user_id,
                "plan_code": resolved_plan_price["plan_code"],
                "plan_price_id": resolved_plan_price["plan_price_id"],
                "billing_cycle": resolved_plan_price["billing_cycle"],
                "currency_code": str(extracted_price["currency_code"] or resolved_plan_price["currency_code"]).upper(),
                "status": row_status,
                "billing_status": billing_status,
                "provider": "stripe",
                "billing_runtime": normalized_runtime,
                "provider_customer_id": provider_customer_id,
                "provider_checkout_session_id": provider_checkout_session_id,
                "provider_subscription_id": provider_subscription_id,
                "provider_price_id": provider_price_id,
                "provider_event_id": event_id,
                "starts_at_utc": current_period_start or trial_start_utc,
                "current_period_start": current_period_start,
                "current_period_end": current_period_end,
                "cancel_at_period_end": cancel_at_period_end,
                "canceled_at_utc": canceled_at_utc,
                "trial_start_utc": trial_start_utc,
                "trial_end_utc": trial_end_utc,
                "raw_payload_json": raw_payload_json,
            }

            if existing is None:
                cur.execute(
                    """
                    INSERT INTO billing.subscriptions (
                        user_id,
                        plan_code,
                        plan_price_id,
                        billing_cycle,
                        currency_code,
                        status,
                        billing_status,
                        provider,
                        billing_runtime,
                        provider_customer_id,
                        provider_checkout_session_id,
                        provider_subscription_id,
                        provider_price_id,
                        provider_event_id,
                        starts_at_utc,
                        current_period_start,
                        current_period_start_utc,
                        current_period_end,
                        current_period_end_utc,
                        cancel_at_period_end,
                        canceled_at_utc,
                        cancelled_at_utc,
                        trial_start_utc,
                        trial_end_utc,
                        raw_payload_json,
                        created_at_utc,
                        updated_at_utc
                    )
                    VALUES (
                        %(user_id)s,
                        %(plan_code)s,
                        %(plan_price_id)s,
                        %(billing_cycle)s,
                        %(currency_code)s,
                        %(status)s,
                        %(billing_status)s,
                        %(provider)s,
                        %(billing_runtime)s,
                        %(provider_customer_id)s,
                        %(provider_checkout_session_id)s,
                        %(provider_subscription_id)s,
                        %(provider_price_id)s,
                        %(provider_event_id)s,
                        COALESCE(%(starts_at_utc)s, NOW()),
                        %(current_period_start)s,
                        %(current_period_start)s,
                        %(current_period_end)s,
                        %(current_period_end)s,
                        %(cancel_at_period_end)s,
                        %(canceled_at_utc)s,
                        %(canceled_at_utc)s,
                        %(trial_start_utc)s,
                        %(trial_end_utc)s,
                        %(raw_payload_json)s::jsonb,
                        NOW(),
                        NOW()
                    )
                    RETURNING subscription_id
                    """,
                    params,
                )
                subscription_id = int(cur.fetchone()[0])
            else:
                subscription_id = int(existing[0])
                cur.execute(
                    """
                    UPDATE billing.subscriptions
                    SET
                        user_id = %(user_id)s,
                        plan_code = %(plan_code)s,
                        plan_price_id = %(plan_price_id)s,
                        billing_cycle = %(billing_cycle)s,
                        currency_code = %(currency_code)s,
                        status = %(status)s,
                        billing_status = %(billing_status)s,
                        billing_runtime = %(billing_runtime)s,
                        provider_customer_id = %(provider_customer_id)s,
                        provider_checkout_session_id = COALESCE(%(provider_checkout_session_id)s, provider_checkout_session_id),
                        provider_price_id = %(provider_price_id)s,
                        provider_event_id = %(provider_event_id)s,
                        starts_at_utc = COALESCE(%(starts_at_utc)s, starts_at_utc),
                        current_period_start = %(current_period_start)s,
                        current_period_start_utc = %(current_period_start)s,
                        current_period_end = %(current_period_end)s,
                        current_period_end_utc = %(current_period_end)s,
                        cancel_at_period_end = %(cancel_at_period_end)s,
                        canceled_at_utc = %(canceled_at_utc)s,
                        cancelled_at_utc = %(canceled_at_utc)s,
                        trial_start_utc = %(trial_start_utc)s,
                        trial_end_utc = %(trial_end_utc)s,
                        raw_payload_json = %(raw_payload_json)s::jsonb,
                        updated_at_utc = NOW()
                    WHERE subscription_id = %(subscription_id)s
                    """,
                    {**params, "subscription_id": subscription_id},
                )

                cur.execute(
                    """
                    SELECT COUNT(*)
                    FROM billing.subscriptions
                    WHERE user_id = %(user_id)s
                      AND provider = 'stripe'
                      AND billing_runtime = %(billing_runtime)s
                      AND subscription_id <> %(subscription_id)s
                      AND COALESCE(NULLIF(status, ''), NULLIF(billing_status, ''), 'expired') IN ('active', 'trialing', 'past_due')
                    """,
                    {
                        "user_id": user_id,
                        "billing_runtime": normalized_runtime,
                        "subscription_id": subscription_id,
                    },
                )
                sibling_active_count = int((cur.fetchone() or [0])[0] or 0)

                if sibling_active_count > 0:
                    logger.warning(
                        "billing sync detected sibling active subscriptions; keeping rows untouched "
                        "user_id=%s billing_runtime=%s subscription_id=%s provider_subscription_id=%s sibling_active_count=%s event_id=%s",
                        user_id,
                        normalized_runtime,
                        subscription_id,
                        provider_subscription_id,
                        sibling_active_count,
                        event_id,
                    )

            _upsert_entitlements_snapshot(cur, user_id=user_id, plan_code=access_plan_code)

            _insert_subscription_event(
                cur,
                subscription_id=subscription_id,
                user_id=user_id,
                billing_runtime=normalized_runtime,
                event_type=f"stripe_{incoming_event_type.replace('.', '_')}",
                payload_json={
                    "provider_event_id": event_id,
                    "incoming_event_type": incoming_event_type,
                    "billing_runtime": normalized_runtime,
                    "provider_subscription_id": provider_subscription_id,
                    "provider_checkout_session_id": provider_checkout_session_id,
                    "provider_price_id": provider_price_id,
                    "plan_price_id": resolved_plan_price["plan_price_id"],
                    "plan_code": resolved_plan_price["plan_code"],
                    "billing_cycle": resolved_plan_price["billing_cycle"],
                    "billing_status": billing_status,
                    "status": row_status,
                    "access_plan_code": access_plan_code,
                },
            )

        conn.commit()

    return {
        "ok": True,
        "subscription_id": subscription_id,
        "user_id": user_id,
        "billing_runtime": normalized_runtime,
        "plan_code": resolved_plan_price["plan_code"],
        "plan_price_id": resolved_plan_price["plan_price_id"],
        "billing_cycle": resolved_plan_price["billing_cycle"],
        "billing_status": billing_status,
        "status": row_status,
        "provider_customer_id": provider_customer_id,
        "provider_checkout_session_id": provider_checkout_session_id,
        "provider_subscription_id": provider_subscription_id,
        "provider_price_id": provider_price_id,
        "event_type": incoming_event_type,
    }


def sync_checkout_session_for_user(*, user_id: int, session_id: str, billing_runtime: str = "live") -> Dict[str, Any]:
    normalized_session_id = str(session_id or "").strip()
    if not normalized_session_id:
        raise ValueError("missing_checkout_session_id")

    if (
        normalized_session_id.startswith("{")
        or normalized_session_id.endswith("}")
        or "CHECKOUT_SESSION_ID" in normalized_session_id
    ):
        raise ValueError("invalid_checkout_session_id")

    settings = load_settings()
    runtime_config = _resolve_stripe_runtime_config(settings, billing_runtime=billing_runtime)
    normalized_runtime = runtime_config["billing_runtime"]
    if not runtime_config["secret_key"]:
        raise RuntimeError(f"stripe_{normalized_runtime}_not_configured")

    stripe.api_key = runtime_config["secret_key"]

    try:
        session = stripe.checkout.Session.retrieve(normalized_session_id)
    except stripe.error.InvalidRequestError as exc:
        raise ValueError("checkout_session_not_found") from exc
    except stripe.error.StripeError as exc:
        raise RuntimeError("stripe_checkout_session_retrieve_failed") from exc

    checkout_session = session._to_dict_recursive()
    checkout_mode = str(checkout_session.get("mode") or "").strip().lower()
    checkout_status = str(checkout_session.get("status") or "").strip().lower()
    payment_status = str(checkout_session.get("payment_status") or "").strip().lower()

    if checkout_mode != "subscription":
        raise ValueError("checkout_session_invalid_mode")

    resolved_user_id = _resolve_user_id_from_checkout_session_payload(
        checkout_session,
        billing_runtime=normalized_runtime,
    )
    if resolved_user_id is None:
        raise ValueError("checkout_session_user_not_found")

    if int(resolved_user_id) != int(user_id):
        raise ValueError("checkout_session_user_mismatch")

    provider_subscription_id = str(checkout_session.get("subscription") or "").strip()
    sync_result: Optional[Dict[str, Any]] = None

    if checkout_status == "complete" and provider_subscription_id:
        sync_result = process_stripe_webhook_event(
            {
                "id": f"manual_checkout_session_sync_{normalized_session_id}",
                "type": "checkout.session.completed",
                "data": {"object": checkout_session},
            },
            billing_runtime=normalized_runtime,
        )

    summary = get_billing_subscription_summary_for_user(
        user_id,
        billing_runtime=normalized_runtime,
    )

    return {
        "ok": True,
        "synced": bool(sync_result and not sync_result.get("ignored")),
        "checkout_session_id": normalized_session_id,
        "checkout_session_status": checkout_status or None,
        "checkout_payment_status": payment_status or None,
        "sync_result": sync_result,
        **summary,
    }


def get_effective_subscription_for_user(
    user_id: int,
    *,
    billing_runtime: str = "live",
) -> Optional[Dict[str, Any]]:
    normalized_runtime = _normalize_billing_runtime(billing_runtime)

    with pg_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    subscription_id,
                    plan_code,
                    plan_price_id,
                    billing_cycle,
                    currency_code,
                    COALESCE(NULLIF(billing_status, ''), status) AS effective_billing_status,
                    provider,
                    billing_runtime,
                    provider_customer_id,
                    provider_subscription_id,
                    provider_price_id,
                    COALESCE(current_period_start, current_period_start_utc) AS effective_current_period_start,
                    COALESCE(current_period_end, current_period_end_utc) AS effective_current_period_end,
                    cancel_at_period_end,
                    COALESCE(canceled_at_utc, cancelled_at_utc) AS effective_canceled_at_utc,
                    trial_start_utc,
                    trial_end_utc,
                    updated_at_utc,
                    status
                FROM billing.subscriptions
                WHERE user_id = %(user_id)s
                  AND billing_runtime = %(billing_runtime)s
                ORDER BY
                    CASE COALESCE(NULLIF(billing_status, ''), NULLIF(status, ''), 'expired')
                        WHEN 'active' THEN 0
                        WHEN 'trialing' THEN 1
                        WHEN 'past_due' THEN 2
                        WHEN 'cancelled' THEN 5
                        WHEN 'canceled' THEN 5
                        WHEN 'expired' THEN 6
                        ELSE 7
                    END,
                    CASE WHEN provider = 'stripe' THEN 0 ELSE 1 END,
                    updated_at_utc DESC,
                    subscription_id DESC
                LIMIT 1
                """,
                {
                    "user_id": user_id,
                    "billing_runtime": normalized_runtime,
                },
            )
            row = cur.fetchone()
        conn.commit()

    if row is None:
        return None

    return {
        "subscription_id": int(row[0]),
        "plan_code": str(row[1]),
        "plan_price_id": row[2],
        "billing_cycle": row[3],
        "currency_code": row[4],
        "billing_status": row[5],
        "provider": row[6],
        "billing_runtime": row[7],
        "provider_customer_id": row[8],
        "provider_subscription_id": row[9],
        "provider_price_id": row[10],
        "current_period_start": row[11].isoformat() if row[11] else None,
        "current_period_end": row[12].isoformat() if row[12] else None,
        "cancel_at_period_end": bool(row[13]),
        "canceled_at_utc": row[14].isoformat() if row[14] else None,
        "trial_start_utc": row[15].isoformat() if row[15] else None,
        "trial_end_utc": row[16].isoformat() if row[16] else None,
        "updated_at_utc": row[17].isoformat() if row[17] else None,
        "status": row[18],
    }


def get_billing_subscription_summary_for_user(
    user_id: int,
    *,
    billing_runtime: str = "live",
) -> Dict[str, Any]:
    normalized_runtime = _normalize_billing_runtime(billing_runtime)
    effective = get_effective_subscription_for_user(user_id, billing_runtime=normalized_runtime)

    if effective is None:
        return {
            "ok": True,
            "has_subscription": False,
            "subscription": None,
            "actions": {
                "can_checkout": True,
                "can_change_plan": True,
                "can_cancel_renewal": False,
                "can_resume_renewal": False,
            },
        }

    unit_amount_cents: Optional[int] = None
    price_version: Optional[str] = None

    plan_price_id = effective.get("plan_price_id")
    if plan_price_id is not None:
        with pg_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT unit_amount_cents, price_version
                    FROM billing.plan_prices
                    WHERE plan_price_id = %(plan_price_id)s
                    LIMIT 1
                    """,
                    {"plan_price_id": int(plan_price_id)},
                )
                price_row = cur.fetchone()
            conn.commit()

        if price_row is not None:
            unit_amount_cents = int(price_row[0]) if price_row[0] is not None else None
            price_version = str(price_row[1]) if price_row[1] is not None else None

    provider = str(effective.get("provider") or "").strip().lower()
    billing_status = str(effective.get("billing_status") or "").strip().lower()
    provider_subscription_id = effective.get("provider_subscription_id")
    cancel_at_period_end = bool(effective.get("cancel_at_period_end"))

    can_manage_stripe_subscription = (
        provider == "stripe"
        and bool(provider_subscription_id)
        and not _is_terminal_billing_status(billing_status)
    )

    return {
        "ok": True,
        "has_subscription": True,
        "subscription": {
            **effective,
            "unit_amount_cents": unit_amount_cents,
            "unit_amount": (unit_amount_cents / 100.0) if unit_amount_cents is not None else None,
            "currency_symbol": _currency_symbol(str(effective.get("currency_code") or "BRL")),
            "price_version": price_version,
        },
        "actions": {
            "can_checkout": not can_manage_stripe_subscription,
            "can_change_plan": True,
            "can_cancel_renewal": can_manage_stripe_subscription and not cancel_at_period_end,
            "can_resume_renewal": can_manage_stripe_subscription and cancel_at_period_end,
        },
    }

def preview_subscription_change_for_user(
    user_id: int,
    *,
    target_plan_code: str,
    target_billing_cycle: str,
    currency_code: str,
    billing_runtime: str = "live",
) -> Dict[str, Any]:
    normalized_runtime = _normalize_billing_runtime(billing_runtime)
    normalized_target_plan_code = _normalize_plan_code(target_plan_code)
    normalized_target_billing_cycle = _normalize_billing_cycle(target_billing_cycle)
    normalized_currency_code = _normalize_currency_code(currency_code)

    effective = get_effective_subscription_for_user(
        user_id,
        billing_runtime=normalized_runtime,
    )
    if effective is None:
        raise ValueError("subscription_not_found")

    provider = str(effective.get("provider") or "").strip().lower()
    provider_subscription_id = str(effective.get("provider_subscription_id") or "").strip()
    billing_status = str(effective.get("billing_status") or "").strip().lower()
    cancel_at_period_end = bool(effective.get("cancel_at_period_end"))

    if provider != "stripe" or not provider_subscription_id or _is_terminal_billing_status(billing_status):
        raise ValueError("subscription_not_manageable")

    current_plan_code = _normalize_plan_code(str(effective.get("plan_code") or ""))
    current_billing_cycle = _normalize_billing_cycle(str(effective.get("billing_cycle") or ""))
    current_currency_code = _normalize_currency_code(str(effective.get("currency_code") or normalized_currency_code))

    current_price = _resolve_plan_price_detail_by_id(effective.get("plan_price_id"))
    if current_price is None:
        current_price = _resolve_active_plan_price(
            plan_code=current_plan_code,
            billing_cycle=current_billing_cycle,
            currency_code=current_currency_code,
        )

    target_price = _resolve_active_plan_price(
        plan_code=normalized_target_plan_code,
        billing_cycle=normalized_target_billing_cycle,
        currency_code=normalized_currency_code,
    )
    if target_price is None:
        raise ValueError("plan_price_not_found_for_currency")

    decision = _classify_subscription_change(
        current_plan_code=current_plan_code,
        current_billing_cycle=current_billing_cycle,
        target_plan_code=normalized_target_plan_code,
        target_billing_cycle=normalized_target_billing_cycle,
    )

    reason_code: Optional[str] = None
    can_apply_now = False
    can_schedule = False

    if decision["decision_code"] == "noop":
        reason_code = "subscription_change_same_target"
    elif cancel_at_period_end:
        reason_code = "subscription_change_blocked_cancel_at_period_end"
    elif billing_status not in PLAN_CHANGE_ALLOWED_BILLING_STATUSES:
        reason_code = "subscription_change_blocked_status"
    else:
        can_apply_now = decision["effective_mode"] == "immediate"
        can_schedule = decision["effective_mode"] == "period_end"

    current_unit_amount_cents = current_price.get("unit_amount_cents") if current_price else None
    target_unit_amount_cents = target_price.get("unit_amount_cents") if target_price else None

    full_period_delta_cents: Optional[int] = None
    if (
        current_unit_amount_cents is not None
        and target_unit_amount_cents is not None
        and current_currency_code == normalized_currency_code
    ):
        full_period_delta_cents = int(target_unit_amount_cents) - int(current_unit_amount_cents)

    return {
        "ok": True,
        "billing_runtime": normalized_runtime,
        "current": {
            "subscription_id": effective.get("subscription_id"),
            "plan_price_id": effective.get("plan_price_id"),
            "plan_code": current_plan_code,
            "billing_cycle": current_billing_cycle,
            "currency_code": current_currency_code,
            "billing_status": billing_status,
            "cancel_at_period_end": cancel_at_period_end,
            "provider": provider,
            "provider_subscription_id": provider_subscription_id,
            "current_period_start": effective.get("current_period_start"),
            "current_period_end": effective.get("current_period_end"),
            "unit_amount_cents": current_unit_amount_cents,
            "price_version": (current_price or {}).get("price_version"),
        },
        "target": {
            "plan_price_id": target_price.get("plan_price_id"),
            "plan_code": normalized_target_plan_code,
            "billing_cycle": normalized_target_billing_cycle,
            "currency_code": normalized_currency_code,
            "unit_amount_cents": target_unit_amount_cents,
            "price_version": target_price.get("price_version"),
        },
        "decision": {
            "decision_code": decision["decision_code"],
            "effective_mode": decision["effective_mode"],
            "reason_code": reason_code,
        },
        "preview": {
            "calculation_mode": "classification_only",
            "full_period_delta_cents": full_period_delta_cents,
            "amount_due_now_cents": None,
            "credit_cents": None,
        },
        "policy": {
            "can_apply_now": can_apply_now,
            "can_schedule": can_schedule,
            "requires_stripe_proration_preview": can_apply_now,
        },
    }

def _update_subscription_cancel_at_period_end(
    *,
    user_id: int,
    cancel_at_period_end: bool,
    billing_runtime: str = "live",
) -> Dict[str, Any]:
    settings = load_settings()
    runtime_config = _resolve_stripe_runtime_config(settings, billing_runtime=billing_runtime)
    normalized_runtime = runtime_config["billing_runtime"]

    if not runtime_config["secret_key"]:
        raise RuntimeError(f"stripe_{normalized_runtime}_not_configured")

    effective = get_effective_subscription_for_user(user_id, billing_runtime=normalized_runtime)
    if effective is None:
        raise ValueError("subscription_not_found")

    provider = str(effective.get("provider") or "").strip().lower()
    provider_subscription_id = str(effective.get("provider_subscription_id") or "").strip()
    billing_status = str(effective.get("billing_status") or "").strip().lower()

    if provider != "stripe" or not provider_subscription_id or _is_terminal_billing_status(billing_status):
        raise ValueError("subscription_not_manageable")

    stripe.api_key = runtime_config["secret_key"]

    try:
        subscription = stripe.Subscription.modify(
            provider_subscription_id,
            cancel_at_period_end=cancel_at_period_end,
        )
    except stripe.error.StripeError as exc:
        raise RuntimeError("stripe_subscription_update_failed") from exc

    sync_subscription_from_stripe_event(
        {
            "id": f"manual_subscription_update_{provider_subscription_id}_{'resume' if not cancel_at_period_end else 'cancel'}",
            "type": "customer.subscription.updated",
            "data": {"object": dict(subscription)},
        },
        billing_runtime=normalized_runtime,
    )

    summary = get_billing_subscription_summary_for_user(
        user_id,
        billing_runtime=normalized_runtime,
    )

    return {
        "ok": True,
        "action": "resume_renewal" if not cancel_at_period_end else "cancel_renewal",
        "message": "renewal_resumed" if not cancel_at_period_end else "renewal_canceled",
        **summary,
    }


def cancel_subscription_renewal_for_user(user_id: int, *, billing_runtime: str = "live") -> Dict[str, Any]:
    return _update_subscription_cancel_at_period_end(
        user_id=user_id,
        cancel_at_period_end=True,
        billing_runtime=billing_runtime,
    )


def resume_subscription_renewal_for_user(user_id: int, *, billing_runtime: str = "live") -> Dict[str, Any]:
    return _update_subscription_cancel_at_period_end(
        user_id=user_id,
        cancel_at_period_end=False,
        billing_runtime=billing_runtime,
    )

def reset_internal_testing_subscription_for_user(
    user_id: int,
    *,
    billing_runtime: str = "live",
) -> Dict[str, Any]:
    normalized_runtime = _normalize_billing_runtime(billing_runtime)
    effective = get_effective_subscription_for_user(
        user_id,
        billing_runtime=normalized_runtime,
    )

    stripe_cancel_attempted = False
    stripe_cancelled = False
    stripe_cancel_error: Optional[str] = None

    provider = str((effective or {}).get("provider") or "").strip().lower()
    provider_subscription_id = str((effective or {}).get("provider_subscription_id") or "").strip()
    billing_status = str((effective or {}).get("billing_status") or "").strip().lower()

    if (
        provider == "stripe"
        and provider_subscription_id
        and billing_status in {"active", "trialing", "past_due", "paused", "incomplete", "unpaid"}
    ):
        settings = load_settings()
        runtime_config = _resolve_stripe_runtime_config(
            settings,
            billing_runtime=normalized_runtime,
        )
        stripe_secret_key = str(runtime_config.get("secret_key") or "").strip()

        if stripe_secret_key:
            stripe_cancel_attempted = True
            stripe.api_key = stripe_secret_key

            try:
                stripe.Subscription.cancel(provider_subscription_id)
                stripe_cancelled = True
            except stripe.error.StripeError as exc:
                stripe_cancel_error = getattr(exc, "user_message", None) or str(exc) or exc.__class__.__name__
                logger.warning(
                    "internal testing reset could not cancel stripe subscription user_id=%s billing_runtime=%s subscription_id=%s error=%s",
                    user_id,
                    normalized_runtime,
                    provider_subscription_id,
                    stripe_cancel_error,
                )
        else:
            stripe_cancel_error = "stripe_not_configured"

    with pg_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE billing.subscriptions
                SET
                    status = 'expired',
                    billing_status = 'expired',
                    cancel_at_period_end = FALSE,
                    canceled_at_utc = COALESCE(canceled_at_utc, NOW()),
                    cancelled_at_utc = COALESCE(cancelled_at_utc, NOW()),
                    updated_at_utc = NOW()
                WHERE user_id = %(user_id)s
                  AND billing_runtime = %(billing_runtime)s
                  AND plan_code IN ('BASIC', 'LIGHT', 'PRO')
                  AND COALESCE(NULLIF(billing_status, ''), NULLIF(status, ''), 'expired')
                      IN ('active', 'trialing', 'past_due', 'paused', 'incomplete', 'unpaid')
                """,
                {
                    "user_id": user_id,
                    "billing_runtime": normalized_runtime,
                },
            )

            cur.execute(
                """
                SELECT subscription_id
                FROM billing.subscriptions
                WHERE user_id = %(user_id)s
                  AND billing_runtime = %(billing_runtime)s
                  AND plan_code = 'FREE'
                  AND provider = 'manual'
                ORDER BY
                    CASE COALESCE(NULLIF(billing_status, ''), NULLIF(status, ''), 'inactive')
                        WHEN 'active' THEN 0
                        ELSE 1
                    END,
                    updated_at_utc DESC,
                    subscription_id DESC
                LIMIT 1
                """,
                {
                    "user_id": user_id,
                    "billing_runtime": normalized_runtime,
                },
            )
            existing_free = cur.fetchone()

            payload_json = json.dumps(
                {
                    "source": "internal_testing_reset",
                    "billing_runtime": normalized_runtime,
                    "stripe_cancel_attempted": stripe_cancel_attempted,
                    "stripe_cancelled": stripe_cancelled,
                    "stripe_cancel_error": stripe_cancel_error,
                }
            )

            if existing_free is None:
                cur.execute(
                    """
                    INSERT INTO billing.subscriptions (
                        user_id,
                        plan_code,
                        provider,
                        billing_runtime,
                        status,
                        billing_status,
                        starts_at_utc,
                        current_period_start,
                        current_period_start_utc,
                        current_period_end,
                        current_period_end_utc,
                        cancel_at_period_end,
                        canceled_at_utc,
                        cancelled_at_utc,
                        raw_payload_json,
                        created_at_utc,
                        updated_at_utc
                    )
                    VALUES (
                        %(user_id)s,
                        'FREE',
                        'manual',
                        %(billing_runtime)s,
                        'active',
                        'active',
                        NOW(),
                        NOW(),
                        NOW(),
                        NULL,
                        NULL,
                        FALSE,
                        NULL,
                        NULL,
                        %(payload_json)s::jsonb,
                        NOW(),
                        NOW()
                    )
                    RETURNING subscription_id
                    """,
                    {
                        "user_id": user_id,
                        "billing_runtime": normalized_runtime,
                        "payload_json": payload_json,
                    },
                )
                subscription_id = int(cur.fetchone()[0])
            else:
                subscription_id = int(existing_free[0])

                cur.execute(
                    """
                    UPDATE billing.subscriptions
                    SET
                        plan_code = 'FREE',
                        plan_price_id = NULL,
                        billing_cycle = NULL,
                        currency_code = NULL,
                        status = 'active',
                        billing_status = 'active',
                        provider = 'manual',
                        billing_runtime = %(billing_runtime)s,
                        provider_customer_id = NULL,
                        provider_checkout_session_id = NULL,
                        provider_subscription_id = NULL,
                        provider_price_id = NULL,
                        provider_event_id = 'internal_testing_reset_to_free',
                        starts_at_utc = COALESCE(starts_at_utc, NOW()),
                        current_period_start = NOW(),
                        current_period_start_utc = NOW(),
                        current_period_end = NULL,
                        current_period_end_utc = NULL,
                        cancel_at_period_end = FALSE,
                        canceled_at_utc = NULL,
                        cancelled_at_utc = NULL,
                        trial_start_utc = NULL,
                        trial_end_utc = NULL,
                        raw_payload_json = %(payload_json)s::jsonb,
                        updated_at_utc = NOW()
                    WHERE subscription_id = %(subscription_id)s
                    """,
                    {
                        "subscription_id": subscription_id,
                        "billing_runtime": normalized_runtime,
                        "payload_json": payload_json,
                    },
                )

            cur.execute(
                """
                INSERT INTO billing.subscription_events (
                    subscription_id,
                    user_id,
                    event_type,
                    payload_json
                )
                VALUES (
                    %(subscription_id)s,
                    %(user_id)s,
                    'internal_testing_reset_to_free',
                    %(payload_json)s::jsonb
                )
                """,
                {
                    "subscription_id": subscription_id,
                    "user_id": user_id,
                    "payload_json": payload_json,
                },
            )

        conn.commit()

    summary = get_billing_subscription_summary_for_user(
        user_id,
        billing_runtime=normalized_runtime,
    )

    return {
        "ok": True,
        "action": "internal_testing_reset_to_free",
        "billing_runtime": normalized_runtime,
        "stripe_cancel_attempted": stripe_cancel_attempted,
        "stripe_cancelled": stripe_cancelled,
        "stripe_cancel_error": stripe_cancel_error,
        **summary,
    }

def _safe_upsert_stripe_webhook_event(
    *,
    event: Dict[str, Any],
    status: str,
    billing_runtime: str,
    error_code: Optional[str] = None,
    error_message: Optional[str] = None,
    sync_result: Optional[Dict[str, Any]] = None,
) -> None:
    try:
        _upsert_stripe_webhook_event(
            event=event,
            status=status,
            billing_runtime=billing_runtime,
            error_code=error_code,
            error_message=error_message,
            sync_result=sync_result,
        )
    except Exception:
        logger.exception(
            "stripe webhook audit write failed event_id=%s event_type=%s status=%s",
            event.get("id"),
            event.get("type"),
            status,
        )

def _get_existing_stripe_webhook_event_status(
    event_id: str,
    *,
    billing_runtime: str,
) -> Optional[str]:
    normalized_event_id = str(event_id or "").strip()
    normalized_runtime = _normalize_billing_runtime(billing_runtime)
    if not normalized_event_id:
        return None

    with pg_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT status
                FROM billing.webhook_events
                WHERE provider = 'stripe'
                  AND billing_runtime = %(billing_runtime)s
                  AND provider_event_id = %(event_id)s
                LIMIT 1
                """,
                {
                    "billing_runtime": normalized_runtime,
                    "event_id": normalized_event_id,
                },
            )
            row = cur.fetchone()
        conn.commit()

    if row is None or row[0] is None:
        return None

    return str(row[0]).strip().lower() or None