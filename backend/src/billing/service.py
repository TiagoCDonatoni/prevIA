from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import stripe

from src.core.settings import load_settings
from src.db.pg import pg_conn


VALID_PLAN_CODES = {"BASIC", "LIGHT", "PRO"}
VALID_BILLING_CYCLES = {"monthly", "quarterly", "annual"}
VALID_CURRENCY_CODES = {"BRL", "USD"}

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

def _ts_from_unix(value: Any) -> Optional[datetime]:
    if value in (None, "", 0):
        return None
    try:
        return datetime.fromtimestamp(int(value), tz=timezone.utc)
    except Exception:
        return None


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


def _resolve_plan_price_by_provider_price_id(provider_price_id: Optional[str]) -> Optional[Dict[str, Any]]:
    if not provider_price_id:
        return None

    with pg_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT plan_price_id, price_code, plan_code, billing_cycle, currency_code
                FROM billing.plan_prices
                WHERE provider = 'stripe'
                  AND provider_price_id = %(provider_price_id)s
                LIMIT 1
                """,
                {"provider_price_id": provider_price_id},
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


def _resolve_user_id_from_subscription_payload(subscription: Dict[str, Any]) -> Optional[int]:
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

    with pg_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT user_id
                FROM billing.subscriptions
                WHERE provider = 'stripe'
                  AND provider_customer_id = %(customer_id)s
                ORDER BY updated_at_utc DESC, subscription_id DESC
                LIMIT 1
                """,
                {"customer_id": str(customer_id)},
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
) -> Dict[str, Any]:
    settings = load_settings()

    if not settings.stripe_secret_key:
        raise RuntimeError("stripe_not_configured")
    if not settings.stripe_publishable_key:
        raise RuntimeError("stripe_publishable_key_not_configured")

    plan_code = _normalize_plan_code(plan_code)
    billing_cycle = _normalize_billing_cycle(billing_cycle)
    currency_code = _normalize_currency_code(currency_code)

    effective = get_effective_subscription_for_user(user_id)
    if effective is not None:
        provider = str(effective.get("provider") or "").strip().lower()
        provider_subscription_id = str(effective.get("provider_subscription_id") or "").strip()
        billing_status = str(effective.get("billing_status") or "").strip().lower()

        if provider == "stripe" and provider_subscription_id and billing_status not in {"canceled", "expired"}:
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
            full_name = str(user_row[1]) if user_row[1] is not None else None

            cur.execute(
                """
                SELECT
                    plan_price_id,
                    price_code,
                    currency_code,
                    unit_amount_cents,
                    provider_product_id,
                    provider_price_id
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
            provider_product_id = price_row[4]
            provider_price_id = price_row[5]

            if not provider_price_id:
                raise ValueError("stripe_price_not_configured")

            cur.execute(
                """
                SELECT provider_customer_id
                FROM billing.subscriptions
                WHERE user_id = %(user_id)s
                  AND provider = 'stripe'
                  AND provider_customer_id IS NOT NULL
                ORDER BY updated_at_utc DESC, subscription_id DESC
                LIMIT 1
                """,
                {"user_id": user_id},
            )
            customer_row = cur.fetchone()
            provider_customer_id = str(customer_row[0]) if customer_row and customer_row[0] else None

        conn.commit()

    stripe.api_key = settings.stripe_secret_key

    default_return_url = (
        f"{settings.frontend_allowed_origins[0]}/account?billing=updated"
        if settings.frontend_allowed_origins
        else "http://localhost:5173/account?billing=updated"
    )
    return_url = (
        settings.stripe_portal_return_url
        or settings.stripe_checkout_success_url
        or default_return_url
    )

    session_params: Dict[str, Any] = {
        "mode": "subscription",
        "ui_mode": "custom",
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
        },
        "subscription_data": {
            "metadata": {
                "user_id": str(user_id),
                "plan_code": plan_code,
                "billing_cycle": billing_cycle,
                "currency_code": executable_currency_code,
                "plan_price_id": str(plan_price_id),
                "price_code": price_code,
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
        raise RuntimeError("stripe_checkout_session_create_failed") from exc

    client_secret = getattr(session, "client_secret", None)
    if not client_secret:
        raise RuntimeError("stripe_checkout_client_secret_not_available")

    return {
        "ok": True,
        "ui_mode": "custom",
        "session_id": session.id,
        "checkout_client_secret": client_secret,
        "publishable_key": settings.stripe_publishable_key,
        "price_code": price_code,
        "plan_code": plan_code,
        "billing_cycle": billing_cycle,
        "currency_code": executable_currency_code,
        "provider_product_id": provider_product_id,
        "provider_price_id": provider_price_id,
    }

def sync_subscription_from_stripe_event(event: Dict[str, Any]) -> Dict[str, Any]:
    event_id = str(event.get("id") or "")
    event_type = str(event.get("type") or "")
    data_object = (((event or {}).get("data") or {}).get("object") or {})

    if not event_id:
        raise ValueError("invalid_event_id")

    if event_type.startswith("checkout.session."):
        if event_type != "checkout.session.completed":
            return {"ok": True, "ignored": True, "event_type": event_type}

        subscription_id = data_object.get("subscription")
        if not subscription_id:
            return {"ok": True, "ignored": True, "event_type": event_type}

        settings = load_settings()
        stripe.api_key = settings.stripe_secret_key
        subscription = stripe.Subscription.retrieve(subscription_id)
        data_object = dict(subscription)
        event_type = "customer.subscription.created"

    if not event_type.startswith("customer.subscription."):
        return {"ok": True, "ignored": True, "event_type": event_type}

    subscription = data_object
    provider_subscription_id = str(subscription.get("id") or "")
    if not provider_subscription_id:
        raise ValueError("invalid_subscription_id")

    provider_customer_id = str(subscription.get("customer") or "")
    user_id = _resolve_user_id_from_subscription_payload(subscription)
    if user_id is None:
        raise ValueError("subscription_user_not_found")

    extracted_price = _extract_price_from_subscription(subscription)
    provider_price_id = extracted_price["provider_price_id"]
    resolved_plan_price = _resolve_plan_price_by_provider_price_id(provider_price_id)
    if resolved_plan_price is None:
        raise ValueError("plan_price_mapping_not_found")

    billing_status = SUBSCRIPTION_STATUS_MAP.get(
        str(subscription.get("status") or "").lower(),
        str(subscription.get("status") or "").lower() or "unknown",
    )
    cancel_at_period_end = bool(subscription.get("cancel_at_period_end") or False)

    current_period_start = _ts_from_unix(subscription.get("current_period_start"))
    current_period_end = _ts_from_unix(subscription.get("current_period_end"))
    canceled_at_utc = _ts_from_unix(subscription.get("canceled_at"))
    trial_start_utc = _ts_from_unix(subscription.get("trial_start"))
    trial_end_utc = _ts_from_unix(subscription.get("trial_end"))

    with pg_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT subscription_id
                FROM billing.subscriptions
                WHERE provider = 'stripe'
                  AND provider_subscription_id = %(provider_subscription_id)s
                LIMIT 1
                """,
                {"provider_subscription_id": provider_subscription_id},
            )
            existing = cur.fetchone()

            params = {
                "user_id": user_id,
                "plan_code": resolved_plan_price["plan_code"],
                "plan_price_id": resolved_plan_price["plan_price_id"],
                "billing_cycle": resolved_plan_price["billing_cycle"],
                "currency_code": str(extracted_price["currency_code"] or resolved_plan_price["currency_code"]).upper(),
                "billing_status": billing_status,
                "provider": "stripe",
                "provider_customer_id": provider_customer_id or None,
                "provider_subscription_id": provider_subscription_id,
                "provider_price_id": provider_price_id,
                "provider_event_id": event_id,
                "current_period_start": current_period_start,
                "current_period_end": current_period_end,
                "cancel_at_period_end": cancel_at_period_end,
                "canceled_at_utc": canceled_at_utc,
                "trial_start_utc": trial_start_utc,
                "trial_end_utc": trial_end_utc,
                "raw_payload_json": subscription,
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
                        billing_status,
                        provider,
                        provider_customer_id,
                        provider_subscription_id,
                        provider_price_id,
                        provider_event_id,
                        current_period_start,
                        current_period_end,
                        cancel_at_period_end,
                        canceled_at_utc,
                        trial_start_utc,
                        trial_end_utc,
                        raw_payload_json,
                        created_at_utc,
                        updated_at_utc
                    ) VALUES (
                        %(user_id)s,
                        %(plan_code)s,
                        %(plan_price_id)s,
                        %(billing_cycle)s,
                        %(currency_code)s,
                        %(billing_status)s,
                        %(provider)s,
                        %(provider_customer_id)s,
                        %(provider_subscription_id)s,
                        %(provider_price_id)s,
                        %(provider_event_id)s,
                        %(current_period_start)s,
                        %(current_period_end)s,
                        %(cancel_at_period_end)s,
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
                        billing_status = %(billing_status)s,
                        provider_customer_id = %(provider_customer_id)s,
                        provider_price_id = %(provider_price_id)s,
                        provider_event_id = %(provider_event_id)s,
                        current_period_start = %(current_period_start)s,
                        current_period_end = %(current_period_end)s,
                        cancel_at_period_end = %(cancel_at_period_end)s,
                        canceled_at_utc = %(canceled_at_utc)s,
                        trial_start_utc = %(trial_start_utc)s,
                        trial_end_utc = %(trial_end_utc)s,
                        raw_payload_json = %(raw_payload_json)s::jsonb,
                        updated_at_utc = NOW()
                    WHERE subscription_id = %(subscription_id)s
                    """,
                    {
                        **params,
                        "subscription_id": subscription_id,
                    },
                )

        conn.commit()

    return {
        "ok": True,
        "subscription_id": subscription_id,
        "user_id": user_id,
        "plan_code": resolved_plan_price["plan_code"],
        "billing_cycle": resolved_plan_price["billing_cycle"],
        "billing_status": billing_status,
        "provider_subscription_id": provider_subscription_id,
        "event_type": event_type,
    }


def get_effective_subscription_for_user(user_id: int) -> Optional[Dict[str, Any]]:
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
                    billing_status,
                    provider,
                    provider_customer_id,
                    provider_subscription_id,
                    provider_price_id,
                    current_period_start,
                    current_period_end,
                    cancel_at_period_end,
                    canceled_at_utc,
                    trial_start_utc,
                    trial_end_utc,
                    updated_at_utc
                FROM billing.subscriptions
                WHERE user_id = %(user_id)s
                ORDER BY updated_at_utc DESC, subscription_id DESC
                LIMIT 1
                """,
                {"user_id": user_id},
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
        "provider_customer_id": row[7],
        "provider_subscription_id": row[8],
        "provider_price_id": row[9],
        "current_period_start": row[10].isoformat() if row[10] else None,
        "current_period_end": row[11].isoformat() if row[11] else None,
        "cancel_at_period_end": bool(row[12]),
        "canceled_at_utc": row[13].isoformat() if row[13] else None,
        "trial_start_utc": row[14].isoformat() if row[14] else None,
        "trial_end_utc": row[15].isoformat() if row[15] else None,
        "updated_at_utc": row[16].isoformat() if row[16] else None,
    }

def get_billing_subscription_summary_for_user(user_id: int) -> Dict[str, Any]:
    effective = get_effective_subscription_for_user(user_id)

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
        and billing_status not in {"canceled", "expired"}
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
            "can_checkout": True,
            "can_change_plan": True,
            "can_cancel_renewal": can_manage_stripe_subscription and not cancel_at_period_end,
            "can_resume_renewal": can_manage_stripe_subscription and cancel_at_period_end,
        },
    }


def _update_subscription_cancel_at_period_end(*, user_id: int, cancel_at_period_end: bool) -> Dict[str, Any]:
    settings = load_settings()

    if not settings.stripe_secret_key:
        raise RuntimeError("stripe_not_configured")

    effective = get_effective_subscription_for_user(user_id)
    if effective is None:
        raise ValueError("subscription_not_found")

    provider = str(effective.get("provider") or "").strip().lower()
    provider_subscription_id = str(effective.get("provider_subscription_id") or "").strip()

    if provider != "stripe" or not provider_subscription_id:
        raise ValueError("subscription_not_manageable")

    stripe.api_key = settings.stripe_secret_key
    subscription = stripe.Subscription.modify(
        provider_subscription_id,
        cancel_at_period_end=cancel_at_period_end,
    )

    sync_subscription_from_stripe_event(
        {
            "id": f"manual_subscription_update_{provider_subscription_id}_{'resume' if not cancel_at_period_end else 'cancel'}",
            "type": "customer.subscription.updated",
            "data": {"object": dict(subscription)},
        }
    )

    summary = get_billing_subscription_summary_for_user(user_id)

    return {
        "ok": True,
        "action": "resume_renewal" if not cancel_at_period_end else "cancel_renewal",
        "message": "renewal_resumed" if not cancel_at_period_end else "renewal_canceled",
        **summary,
    }


def cancel_subscription_renewal_for_user(user_id: int) -> Dict[str, Any]:
    return _update_subscription_cancel_at_period_end(
        user_id=user_id,
        cancel_at_period_end=True,
    )


def resume_subscription_renewal_for_user(user_id: int) -> Dict[str, Any]:
    return _update_subscription_cancel_at_period_end(
        user_id=user_id,
        cancel_at_period_end=False,
    )

def get_billing_subscription_summary_for_user(user_id: int) -> Dict[str, Any]:
    effective = get_effective_subscription_for_user(user_id)

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
        and billing_status not in {"canceled", "expired"}
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
            "can_checkout": True,
            "can_change_plan": True,
            "can_cancel_renewal": can_manage_stripe_subscription and not cancel_at_period_end,
            "can_resume_renewal": can_manage_stripe_subscription and cancel_at_period_end,
        },
    }


def _update_subscription_cancel_at_period_end(*, user_id: int, cancel_at_period_end: bool) -> Dict[str, Any]:
    settings = load_settings()

    if not settings.stripe_secret_key:
        raise RuntimeError("stripe_not_configured")

    effective = get_effective_subscription_for_user(user_id)
    if effective is None:
        raise ValueError("subscription_not_found")

    provider = str(effective.get("provider") or "").strip().lower()
    provider_subscription_id = str(effective.get("provider_subscription_id") or "").strip()

    if provider != "stripe" or not provider_subscription_id:
        raise ValueError("subscription_not_manageable")

    stripe.api_key = settings.stripe_secret_key

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
        }
    )

    summary = get_billing_subscription_summary_for_user(user_id)

    return {
        "ok": True,
        "action": "resume_renewal" if not cancel_at_period_end else "cancel_renewal",
        "message": "renewal_resumed" if not cancel_at_period_end else "renewal_canceled",
        **summary,
    }


def cancel_subscription_renewal_for_user(user_id: int) -> Dict[str, Any]:
    return _update_subscription_cancel_at_period_end(
        user_id=user_id,
        cancel_at_period_end=True,
    )


def resume_subscription_renewal_for_user(user_id: int) -> Dict[str, Any]:
    return _update_subscription_cancel_at_period_end(
        user_id=user_id,
        cancel_at_period_end=False,
    )