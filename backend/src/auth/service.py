from __future__ import annotations

import hashlib
import json
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Dict

from fastapi import Request
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token

from src.auth.passwords import hash_password, validate_password_policy, verify_password
from src.auth.sessions import (
    build_request_fingerprints,
    build_session_expires_at,
    make_session_token,
    make_session_token_hash,
    read_product_session_cookie,
)
from src.core.settings import load_settings
from src.db.pg import pg_conn


ALLOWED_PLAN_CODES = {"FREE", "BASIC", "LIGHT", "PRO"}


def normalize_email(email: str) -> str:
    return (email or "").strip().lower()


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _today_date_key():
    return datetime.now(timezone.utc).date()


def _safe_plan_code(raw: str | None) -> str:
    plan = str(raw or "FREE").strip().upper()
    return plan if plan in ALLOWED_PLAN_CODES else "FREE"

def _resolve_billing_cycle(subscription: Dict[str, Any]) -> str | None:
    plan_code = _safe_plan_code(subscription.get("plan_code"))
    provider = str(subscription.get("provider") or "").strip().lower()

    if plan_code == "FREE":
        return None

    if provider == "manual":
        return "monthly"

    return None

def _coerce_json_dict(raw: Any) -> Dict[str, Any]:
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, dict):
                return parsed
        except Exception:
            return {}
    return {}


def _build_anonymous_payload() -> Dict[str, Any]:
    return {
        "ok": True,
        "auth_mode": "anonymous",
        "is_authenticated": False,
        "user": None,
        "subscription": {
            "plan_code": "FREE",
            "status": "inactive",
            "provider": None,
            "billing_cycle": None,
        },
        "entitlements": build_entitlements_for_plan("FREE"),
        "usage": {
            "credits_used_today": 0,
        },
        "meta": {
            "generated_at_utc": utc_now_iso(),
        },
    }


def build_entitlements_for_plan(plan_code: str) -> Dict[str, Any]:
    plan = _safe_plan_code(plan_code)

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
        "credits": {
            "daily_limit": daily_limit,
        },
        "features": {
            "chat": chat,
        },
        "visibility": {
            "odds": {
                "books_count": books_count,
            },
            "model": {
                "show_metrics": show_metrics,
            },
            "context": {
                "show_head_to_head": show_head_to_head,
            },
        },
        "limits": {
            "max_future_days": max_future_days,
        },
    }


def _is_valid_email(email_normalized: str) -> bool:
    return (
        bool(email_normalized)
        and "@" in email_normalized
        and not email_normalized.startswith("@")
        and not email_normalized.endswith("@")
    )


def _make_password_reset_token() -> str:
    return secrets.token_urlsafe(32)


def _make_password_reset_token_hash(raw_token: str) -> str:
    return hashlib.sha256(str(raw_token or "").encode("utf-8")).hexdigest()


def _build_password_reset_expires_at():
    settings = load_settings()
    ttl_minutes = max(5, int(settings.product_password_reset_ttl_minutes))
    return datetime.now(timezone.utc) + timedelta(minutes=ttl_minutes)


def _verify_google_credential(raw_credential: str) -> Dict[str, Any]:
    settings = load_settings()
    credential = str(raw_credential or "").strip()

    if not credential:
        raise ValueError("missing google credential")

    allowed_client_ids = [item for item in settings.product_google_client_ids if item]
    if not allowed_client_ids:
        raise ValueError("google auth not configured")

    idinfo = google_id_token.verify_oauth2_token(
        credential,
        google_requests.Request(),
        audience=None,
    )

    aud = str(idinfo.get("aud") or "").strip()
    if aud not in allowed_client_ids:
        raise ValueError("invalid google audience")

    issuer = str(idinfo.get("iss") or "").strip()
    if issuer not in {"accounts.google.com", "https://accounts.google.com"}:
        raise ValueError("invalid google issuer")

    email = str(idinfo.get("email") or "").strip()
    email_normalized = normalize_email(email)
    if not _is_valid_email(email_normalized):
        raise ValueError("invalid google email")

    provider_user_id = str(idinfo.get("sub") or "").strip()
    if not provider_user_id:
        raise ValueError("invalid google subject")

    email_verified = bool(idinfo.get("email_verified"))
    full_name = str(idinfo.get("name") or "").strip() or None
    picture = str(idinfo.get("picture") or "").strip() or None

    return {
        "provider_user_id": provider_user_id,
        "email": email,
        "email_normalized": email_normalized,
        "email_verified": email_verified,
        "full_name": full_name,
        "picture": picture,
        "payload": dict(idinfo),
    }


def _login_or_signup_with_google(
    *,
    request: Request,
    google_profile: Dict[str, Any],
) -> Dict[str, Any]:
    email = google_profile["email"]
    email_normalized = google_profile["email_normalized"]
    provider_user_id = google_profile["provider_user_id"]
    email_verified = bool(google_profile["email_verified"])
    full_name = google_profile["full_name"]
    provider_payload = google_profile["payload"]

    with pg_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT user_id, identity_id
                FROM app.user_identities
                WHERE provider = 'google'
                  AND provider_user_id = %(provider_user_id)s
                LIMIT 1
                """,
                {"provider_user_id": provider_user_id},
            )
            google_identity_row = cur.fetchone()

            if google_identity_row is not None:
                user_id = int(google_identity_row[0])
                identity_id = int(google_identity_row[1])

                cur.execute(
                    """
                    UPDATE app.users
                    SET email = %(email)s,
                        email_normalized = %(email_normalized)s,
                        full_name = COALESCE(full_name, %(full_name)s),
                        email_verified = %(email_verified)s OR email_verified,
                        last_login_at_utc = NOW(),
                        updated_at_utc = NOW()
                    WHERE user_id = %(user_id)s
                    """,
                    {
                        "user_id": user_id,
                        "email": email,
                        "email_normalized": email_normalized,
                        "full_name": full_name,
                        "email_verified": email_verified,
                    },
                )

                cur.execute(
                    """
                    UPDATE app.user_identities
                    SET provider_email = %(provider_email)s,
                        provider_payload_json = %(provider_payload_json)s::jsonb,
                        is_primary = TRUE,
                        last_login_at_utc = NOW(),
                        updated_at_utc = NOW()
                    WHERE identity_id = %(identity_id)s
                    """,
                    {
                        "identity_id": identity_id,
                        "provider_email": email,
                        "provider_payload_json": json.dumps(provider_payload),
                    },
                )
            else:
                cur.execute(
                    """
                    SELECT user_id, full_name, email_verified
                    FROM app.users
                    WHERE email_normalized = %(email_normalized)s
                    LIMIT 1
                    """,
                    {"email_normalized": email_normalized},
                )
                existing_user_row = cur.fetchone()

                if existing_user_row is not None:
                    user_id = int(existing_user_row[0])

                    cur.execute(
                        """
                        UPDATE app.users
                        SET email = %(email)s,
                            full_name = COALESCE(full_name, %(full_name)s),
                            email_verified = %(email_verified)s OR email_verified,
                            last_login_at_utc = NOW(),
                            updated_at_utc = NOW()
                        WHERE user_id = %(user_id)s
                        """,
                        {
                            "user_id": user_id,
                            "email": email,
                            "full_name": full_name,
                            "email_verified": email_verified,
                        },
                    )
                else:
                    cur.execute(
                        """
                        INSERT INTO app.users (
                            email,
                            email_normalized,
                            full_name,
                            preferred_lang,
                            status,
                            email_verified,
                            last_login_at_utc
                        )
                        VALUES (
                            %(email)s,
                            %(email_normalized)s,
                            %(full_name)s,
                            %(preferred_lang)s,
                            'active',
                            %(email_verified)s,
                            NOW()
                        )
                        RETURNING user_id
                        """,
                        {
                            "email": email,
                            "email_normalized": email_normalized,
                            "full_name": full_name,
                            "preferred_lang": load_settings().default_lang,
                            "email_verified": email_verified,
                        },
                    )
                    user_id = int(cur.fetchone()[0])

                cur.execute(
                    """
                    INSERT INTO app.user_identities (
                        user_id,
                        provider,
                        provider_user_id,
                        provider_email,
                        provider_payload_json,
                        is_primary,
                        last_login_at_utc
                    )
                    VALUES (
                        %(user_id)s,
                        'google',
                        %(provider_user_id)s,
                        %(provider_email)s,
                        %(provider_payload_json)s::jsonb,
                        TRUE,
                        NOW()
                    )
                    RETURNING identity_id
                    """,
                    {
                        "user_id": user_id,
                        "provider_user_id": provider_user_id,
                        "provider_email": email,
                        "provider_payload_json": json.dumps(provider_payload),
                    },
                )
                identity_id = int(cur.fetchone()[0])

            cur.execute(
                """
                UPDATE app.user_identities
                SET is_primary = CASE WHEN identity_id = %(identity_id)s THEN TRUE ELSE is_primary END,
                    updated_at_utc = NOW()
                WHERE user_id = %(user_id)s
                """,
                {
                    "user_id": user_id,
                    "identity_id": identity_id,
                },
            )

            subscription = _get_or_create_active_subscription(cur, user_id=user_id)
            _refresh_entitlements_snapshot(cur, user_id=user_id, plan_code=subscription["plan_code"])

            raw_session_token = _insert_session(cur, user_id=user_id, request=request)
            payload = _build_authenticated_payload(cur, user_id=user_id, auth_mode="google")

        conn.commit()

    return {
        "ok": True,
        "auth_payload": payload,
        "raw_session_token": raw_session_token,
    }

def _refresh_entitlements_snapshot(cur, *, user_id: int, plan_code: str) -> Dict[str, Any]:
    entitlements = build_entitlements_for_plan(plan_code)

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


def _get_or_create_active_subscription(cur, *, user_id: int) -> Dict[str, Any]:
    cur.execute(
        """
        SELECT subscription_id, plan_code, status, provider
        FROM billing.subscriptions
        WHERE user_id = %(user_id)s
          AND status IN ('active', 'trialing', 'past_due')
        ORDER BY
          CASE status
            WHEN 'active' THEN 0
            WHEN 'trialing' THEN 1
            ELSE 2
          END,
          updated_at_utc DESC,
          subscription_id DESC
        LIMIT 1
        """,
        {"user_id": user_id},
    )
    row = cur.fetchone()

    if row is not None:
        return {
            "subscription_id": int(row[0]),
            "plan_code": _safe_plan_code(row[1]),
            "status": str(row[2]),
            "provider": str(row[3]) if row[3] is not None else None,
        }

    cur.execute(
        """
        INSERT INTO billing.subscriptions (
            user_id,
            plan_code,
            provider,
            status,
            starts_at_utc,
            current_period_start_utc,
            current_period_end_utc
        )
        VALUES (
            %(user_id)s,
            'FREE',
            'manual',
            'active',
            NOW(),
            NOW(),
            NULL
        )
        RETURNING subscription_id
        """,
        {"user_id": user_id},
    )
    subscription_id = int(cur.fetchone()[0])

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
            'auth_default_plan_bootstrap',
            %(payload_json)s::jsonb
        )
        """,
        {
            "subscription_id": subscription_id,
            "user_id": user_id,
            "payload_json": json.dumps({"source": "auth_real"}),
        },
    )

    return {
        "subscription_id": subscription_id,
        "plan_code": "FREE",
        "status": "active",
        "provider": "manual",
    }


def _get_or_refresh_entitlements(cur, *, user_id: int, plan_code: str) -> Dict[str, Any]:
    cur.execute(
        """
        SELECT plan_code, entitlements_json
        FROM access.user_entitlements_snapshot
        WHERE user_id = %(user_id)s
        LIMIT 1
        """,
        {"user_id": user_id},
    )
    row = cur.fetchone()

    if row is not None:
        snapshot_plan = _safe_plan_code(row[0])
        snapshot_entitlements = _coerce_json_dict(row[1])
        if snapshot_plan == plan_code and snapshot_entitlements:
            return snapshot_entitlements

    return _refresh_entitlements_snapshot(cur, user_id=user_id, plan_code=plan_code)


def _build_authenticated_payload(cur, *, user_id: int, auth_mode: str) -> Dict[str, Any]:
    cur.execute(
        """
        SELECT user_id, email, full_name, preferred_lang, status, email_verified
        FROM app.users
        WHERE user_id = %(user_id)s
        LIMIT 1
        """,
        {"user_id": user_id},
    )
    user_row = cur.fetchone()

    if user_row is None:
        return _build_anonymous_payload()

    if str(user_row[4]) == "deleted":
        return _build_anonymous_payload()

    subscription = _get_or_create_active_subscription(cur, user_id=user_id)
    entitlements = _get_or_refresh_entitlements(
        cur,
        user_id=user_id,
        plan_code=subscription["plan_code"],
    )

    date_key = _today_date_key()
    cur.execute(
        """
        SELECT credits_used
        FROM access.user_daily_usage
        WHERE user_id = %(user_id)s
          AND date_key = %(date_key)s
        LIMIT 1
        """,
        {"user_id": user_id, "date_key": date_key},
    )
    usage_row = cur.fetchone()
    credits_used_today = int(usage_row[0]) if usage_row else 0

    return {
        "ok": True,
        "auth_mode": auth_mode,
        "is_authenticated": True,
        "user": {
            "user_id": int(user_row[0]),
            "email": str(user_row[1]),
            "full_name": user_row[2],
            "preferred_lang": user_row[3],
            "status": str(user_row[4]),
            "email_verified": bool(user_row[5]),
        },
        "subscription": {
            "plan_code": subscription["plan_code"],
            "status": subscription["status"],
            "provider": subscription["provider"],
            "billing_cycle": _resolve_billing_cycle(subscription),
        },
        "entitlements": entitlements,
        "usage": {
            "credits_used_today": credits_used_today,
        },
        "meta": {
            "generated_at_utc": utc_now_iso(),
        },
    }


def _insert_session(cur, *, user_id: int, request: Request) -> str:
    raw_session_token = make_session_token()
    session_token_hash = make_session_token_hash(raw_session_token)
    expires_at_utc = build_session_expires_at()
    fingerprints = build_request_fingerprints(request)

    cur.execute(
        """
        INSERT INTO auth.sessions (
            user_id,
            session_token_hash,
            expires_at_utc,
            ip_hash,
            user_agent_hash
        )
        VALUES (
            %(user_id)s,
            %(session_token_hash)s,
            %(expires_at_utc)s,
            %(ip_hash)s,
            %(user_agent_hash)s
        )
        """,
        {
            "user_id": user_id,
            "session_token_hash": session_token_hash,
            "expires_at_utc": expires_at_utc,
            "ip_hash": fingerprints["ip_hash"],
            "user_agent_hash": fingerprints["user_agent_hash"],
        },
    )

    return raw_session_token


def _resolve_session_user_id(cur, *, raw_session_token: str) -> int | None:
    session_token_hash = make_session_token_hash(raw_session_token)

    cur.execute(
        """
        SELECT session_id, user_id
        FROM auth.sessions
        WHERE session_token_hash = %(session_token_hash)s
          AND revoked_at_utc IS NULL
          AND expires_at_utc > NOW()
        LIMIT 1
        """,
        {"session_token_hash": session_token_hash},
    )
    row = cur.fetchone()

    if row is None:
        return None

    session_id = int(row[0])
    user_id = int(row[1])

    cur.execute(
        """
        UPDATE auth.sessions
        SET last_seen_at_utc = NOW()
        WHERE session_id = %(session_id)s
        """,
        {"session_id": session_id},
    )

    return user_id


def _upsert_dev_user(cur, *, email: str, plan_code: str) -> Dict[str, Any]:
    email_normalized = normalize_email(email)
    plan_code = _safe_plan_code(plan_code)

    cur.execute(
        """
        INSERT INTO app.users (
            email,
            email_normalized,
            full_name,
            preferred_lang,
            status,
            email_verified,
            last_login_at_utc
        )
        VALUES (
            %(email)s,
            %(email_normalized)s,
            %(full_name)s,
            'pt-BR',
            'active',
            TRUE,
            NOW()
        )
        ON CONFLICT (email_normalized)
        DO UPDATE SET
            email = EXCLUDED.email,
            updated_at_utc = NOW(),
            last_login_at_utc = NOW()
        RETURNING user_id, email, email_normalized, full_name, preferred_lang, status, email_verified
        """,
        {
            "email": email,
            "email_normalized": email_normalized,
            "full_name": "Dev User",
        },
    )
    row = cur.fetchone()
    user_id = int(row[0])

    cur.execute(
        """
        SELECT identity_id
        FROM app.user_identities
        WHERE provider = 'dev'
          AND provider_user_id = %(provider_user_id)s
        LIMIT 1
        """,
        {
            "provider_user_id": email_normalized,
        },
    )
    existing_identity = cur.fetchone()

    if existing_identity is None:
        cur.execute(
            """
            INSERT INTO app.user_identities (
                user_id,
                provider,
                provider_user_id,
                provider_email,
                is_primary,
                last_login_at_utc
            )
            VALUES (
                %(user_id)s,
                'dev',
                %(provider_user_id)s,
                %(provider_email)s,
                TRUE,
                NOW()
            )
            """,
            {
                "user_id": user_id,
                "provider_user_id": email_normalized,
                "provider_email": email,
            },
        )
    else:
        cur.execute(
            """
            UPDATE app.user_identities
            SET user_id = %(user_id)s,
                provider_email = %(provider_email)s,
                is_primary = TRUE,
                updated_at_utc = NOW(),
                last_login_at_utc = NOW()
            WHERE identity_id = %(identity_id)s
            """,
            {
                "identity_id": int(existing_identity[0]),
                "user_id": user_id,
                "provider_email": email,
            },
        )

    cur.execute(
        """
        UPDATE billing.subscriptions
        SET status = 'cancelled',
            cancelled_at_utc = NOW(),
            updated_at_utc = NOW()
        WHERE user_id = %(user_id)s
          AND status IN ('active', 'trialing', 'past_due')
          AND plan_code <> %(plan_code)s
        """,
        {"user_id": user_id, "plan_code": plan_code},
    )

    cur.execute(
        """
        SELECT subscription_id
        FROM billing.subscriptions
        WHERE user_id = %(user_id)s
          AND plan_code = %(plan_code)s
          AND status = 'active'
        ORDER BY updated_at_utc DESC, subscription_id DESC
        LIMIT 1
        """,
        {"user_id": user_id, "plan_code": plan_code},
    )
    existing_sub = cur.fetchone()

    if existing_sub is None:
        cur.execute(
            """
            INSERT INTO billing.subscriptions (
                user_id,
                plan_code,
                provider,
                status,
                starts_at_utc,
                current_period_start_utc,
                current_period_end_utc
            )
            VALUES (
                %(user_id)s,
                %(plan_code)s,
                'manual',
                'active',
                NOW(),
                NOW(),
                NULL
            )
            RETURNING subscription_id
            """,
            {"user_id": user_id, "plan_code": plan_code},
        )
        subscription_id = int(cur.fetchone()[0])

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
                'dev_bootstrap',
                %(payload_json)s::jsonb
            )
            """,
            {
                "subscription_id": subscription_id,
                "user_id": user_id,
                "payload_json": json.dumps(
                    {"source": "product_dev_auto_login", "plan_code": plan_code}
                ),
            },
        )
    else:
        subscription_id = int(existing_sub[0])

    entitlements = _refresh_entitlements_snapshot(cur, user_id=user_id, plan_code=plan_code)

    return {
        "user_id": user_id,
        "email": str(row[1]),
        "email_normalized": str(row[2]),
        "full_name": row[3],
        "preferred_lang": str(row[4]),
        "status": str(row[5]),
        "email_verified": bool(row[6]),
        "subscription_id": subscription_id,
        "plan_code": plan_code,
        "entitlements": entitlements,
    }


def get_auth_me_payload(request: Request) -> Dict[str, Any]:
    settings = load_settings()

    if settings.product_dev_auto_login_enabled:
        with pg_conn() as conn:
            with conn.cursor() as cur:
                actor = _upsert_dev_user(
                    cur,
                    email=settings.product_dev_auto_login_email,
                    plan_code=settings.product_dev_auto_login_plan,
                )
            conn.commit()

        return {
            "ok": True,
            "auth_mode": "dev_auto_login",
            "is_authenticated": True,
            "user": {
                "user_id": actor["user_id"],
                "email": actor["email"],
                "full_name": actor["full_name"],
                "preferred_lang": actor["preferred_lang"],
                "status": actor["status"],
                "email_verified": actor["email_verified"],
            },
            "subscription": {
                "plan_code": actor["plan_code"],
                "status": "active",
                "provider": "manual",
                "billing_cycle": "monthly" if actor["plan_code"] != "FREE" else None,
            },
            "entitlements": actor["entitlements"],
            "usage": {
                "credits_used_today": 0,
            },
            "meta": {
                "generated_at_utc": utc_now_iso(),
            },
        }

    raw_session_token = read_product_session_cookie(request)
    if not raw_session_token:
        return _build_anonymous_payload()

    with pg_conn() as conn:
        with conn.cursor() as cur:
            user_id = _resolve_session_user_id(cur, raw_session_token=raw_session_token)
            if user_id is None:
                conn.commit()
                return _build_anonymous_payload()

            payload = _build_authenticated_payload(cur, user_id=user_id, auth_mode="session")
        conn.commit()

    return payload


def signup_with_password(
    *,
    request: Request,
    email: str,
    password: str,
    full_name: str | None,
) -> Dict[str, Any]:
    settings = load_settings()
    email_normalized = normalize_email(email)

    if not _is_valid_email(email_normalized):
        return {
            "ok": False,
            "status_code": 400,
            "code": "INVALID_EMAIL",
            "message": "invalid email",
        }

    try:
        validate_password_policy(password)
    except ValueError:
        return {
            "ok": False,
            "status_code": 400,
            "code": "WEAK_PASSWORD",
            "message": "weak password",
        }

    full_name_clean = str(full_name or "").strip() or None

    with pg_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT user_id
                FROM app.users
                WHERE email_normalized = %(email_normalized)s
                LIMIT 1
                """,
                {"email_normalized": email_normalized},
            )
            if cur.fetchone() is not None:
                conn.rollback()
                return {
                    "ok": False,
                    "status_code": 409,
                    "code": "EMAIL_ALREADY_EXISTS",
                    "message": "email already exists",
                }

            cur.execute(
                """
                INSERT INTO app.users (
                    email,
                    email_normalized,
                    full_name,
                    preferred_lang,
                    status,
                    email_verified,
                    last_login_at_utc
                )
                VALUES (
                    %(email)s,
                    %(email_normalized)s,
                    %(full_name)s,
                    %(preferred_lang)s,
                    'active',
                    FALSE,
                    NOW()
                )
                RETURNING user_id
                """,
                {
                    "email": email.strip(),
                    "email_normalized": email_normalized,
                    "full_name": full_name_clean,
                    "preferred_lang": settings.default_lang,
                },
            )
            user_id = int(cur.fetchone()[0])

            cur.execute(
                """
                INSERT INTO app.user_identities (
                    user_id,
                    provider,
                    provider_user_id,
                    provider_email,
                    password_hash,
                    is_primary,
                    last_login_at_utc
                )
                VALUES (
                    %(user_id)s,
                    'password',
                    NULL,
                    %(provider_email)s,
                    %(password_hash)s,
                    TRUE,
                    NOW()
                )
                """,
                {
                    "user_id": user_id,
                    "provider_email": email.strip(),
                    "password_hash": hash_password(password),
                },
            )

            subscription = _get_or_create_active_subscription(cur, user_id=user_id)
            _refresh_entitlements_snapshot(cur, user_id=user_id, plan_code=subscription["plan_code"])

            raw_session_token = _insert_session(cur, user_id=user_id, request=request)
            payload = _build_authenticated_payload(cur, user_id=user_id, auth_mode="session")

        conn.commit()

    return {
        "ok": True,
        "auth_payload": payload,
        "raw_session_token": raw_session_token,
    }


def login_with_password(
    *,
    request: Request,
    email: str,
    password: str,
) -> Dict[str, Any]:
    email_normalized = normalize_email(email)

    if not _is_valid_email(email_normalized):
        return {
            "ok": False,
            "status_code": 400,
            "code": "INVALID_EMAIL",
            "message": "invalid email",
        }

    with pg_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    u.user_id,
                    u.status,
                    i.identity_id,
                    i.password_hash
                FROM app.users u
                JOIN app.user_identities i
                  ON i.user_id = u.user_id
                 AND i.provider = 'password'
                WHERE u.email_normalized = %(email_normalized)s
                ORDER BY i.is_primary DESC, i.identity_id DESC
                LIMIT 1
                """,
                {"email_normalized": email_normalized},
            )
            row = cur.fetchone()

            if row is None:
                conn.rollback()
                return {
                    "ok": False,
                    "status_code": 401,
                    "code": "INVALID_CREDENTIALS",
                    "message": "invalid credentials",
                }

            user_id = int(row[0])
            user_status = str(row[1])
            identity_id = int(row[2])
            stored_hash = row[3]

            if user_status in {"blocked", "deleted"}:
                conn.rollback()
                return {
                    "ok": False,
                    "status_code": 403,
                    "code": "ACCOUNT_BLOCKED",
                    "message": "account blocked",
                }

            if not verify_password(password, stored_hash):
                conn.rollback()
                return {
                    "ok": False,
                    "status_code": 401,
                    "code": "INVALID_CREDENTIALS",
                    "message": "invalid credentials",
                }

            cur.execute(
                """
                UPDATE app.users
                SET last_login_at_utc = NOW(),
                    updated_at_utc = NOW()
                WHERE user_id = %(user_id)s
                """,
                {"user_id": user_id},
            )

            cur.execute(
                """
                UPDATE app.user_identities
                SET provider_email = %(provider_email)s,
                    last_login_at_utc = NOW(),
                    updated_at_utc = NOW()
                WHERE identity_id = %(identity_id)s
                """,
                {
                    "identity_id": identity_id,
                    "provider_email": email.strip(),
                },
            )

            subscription = _get_or_create_active_subscription(cur, user_id=user_id)
            _refresh_entitlements_snapshot(cur, user_id=user_id, plan_code=subscription["plan_code"])

            raw_session_token = _insert_session(cur, user_id=user_id, request=request)
            payload = _build_authenticated_payload(cur, user_id=user_id, auth_mode="session")

        conn.commit()

    return {
        "ok": True,
        "auth_payload": payload,
        "raw_session_token": raw_session_token,
    }


def logout_with_session_token(raw_session_token: str | None) -> None:
    token = str(raw_session_token or "").strip()
    if not token:
        return

    session_token_hash = make_session_token_hash(token)

    with pg_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE auth.sessions
                SET revoked_at_utc = NOW()
                WHERE session_token_hash = %(session_token_hash)s
                  AND revoked_at_utc IS NULL
                """,
                {"session_token_hash": session_token_hash},
            )
        conn.commit()

def login_with_google_credential(
    *,
    request: Request,
    credential: str,
) -> Dict[str, Any]:
    try:
        google_profile = _verify_google_credential(credential)
    except ValueError as exc:
        return {
            "ok": False,
            "status_code": 400,
            "code": "INVALID_GOOGLE_CREDENTIAL",
            "message": str(exc) or "invalid google credential",
        }
    except Exception:
        return {
            "ok": False,
            "status_code": 401,
            "code": "INVALID_GOOGLE_CREDENTIAL",
            "message": "invalid google credential",
        }

    return _login_or_signup_with_google(
        request=request,
        google_profile=google_profile,
    )

def forgot_password(
    *,
    request: Request,
    email: str,
) -> Dict[str, Any]:
    settings = load_settings()
    email_normalized = normalize_email(email)

    response: Dict[str, Any] = {
        "ok": True,
        "message": "if the account exists, reset instructions were generated",
        "meta": {
            "generated_at_utc": utc_now_iso(),
        },
    }

    if not _is_valid_email(email_normalized):
        return response

    with pg_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    u.user_id,
                    i.identity_id,
                    u.email
                FROM app.users u
                JOIN app.user_identities i
                  ON i.user_id = u.user_id
                 AND i.provider = 'password'
                WHERE u.email_normalized = %(email_normalized)s
                  AND u.status NOT IN ('blocked', 'deleted')
                ORDER BY i.is_primary DESC, i.identity_id DESC
                LIMIT 1
                """,
                {"email_normalized": email_normalized},
            )
            row = cur.fetchone()

            if row is None:
                conn.commit()
                return response

            user_id = int(row[0])
            identity_id = int(row[1])
            provider_email = str(row[2])
            raw_reset_token = _make_password_reset_token()
            reset_token_hash = _make_password_reset_token_hash(raw_reset_token)
            expires_at_utc = _build_password_reset_expires_at()
            fingerprints = build_request_fingerprints(request)

            cur.execute(
                """
                UPDATE auth.password_reset_tokens
                SET revoked_at_utc = NOW()
                WHERE user_id = %(user_id)s
                  AND used_at_utc IS NULL
                  AND revoked_at_utc IS NULL
                """,
                {"user_id": user_id},
            )

            cur.execute(
                """
                INSERT INTO auth.password_reset_tokens (
                    user_id,
                    identity_id,
                    token_hash,
                    requested_for_email,
                    expires_at_utc,
                    request_ip_hash,
                    request_user_agent_hash
                )
                VALUES (
                    %(user_id)s,
                    %(identity_id)s,
                    %(token_hash)s,
                    %(requested_for_email)s,
                    %(expires_at_utc)s,
                    %(request_ip_hash)s,
                    %(request_user_agent_hash)s
                )
                """,
                {
                    "user_id": user_id,
                    "identity_id": identity_id,
                    "token_hash": reset_token_hash,
                    "requested_for_email": provider_email,
                    "expires_at_utc": expires_at_utc,
                    "request_ip_hash": fingerprints["ip_hash"],
                    "request_user_agent_hash": fingerprints["user_agent_hash"],
                },
            )

        conn.commit()

    if settings.product_password_reset_debug_token_enabled:
        response["debug"] = {
            "reset_token": raw_reset_token,
            "expires_at_utc": expires_at_utc.isoformat().replace("+00:00", "Z"),
        }

    return response

def change_password_authenticated(
    *,
    request: Request,
    current_password: str,
    new_password: str,
) -> Dict[str, Any]:
    raw_session_token = read_product_session_cookie(request)
    if not raw_session_token:
        return {
            "ok": False,
            "status_code": 401,
            "code": "AUTH_REQUIRED",
            "message": "auth required",
        }

    current_password_value = str(current_password or "")
    new_password_value = str(new_password or "")

    if not current_password_value:
        return {
            "ok": False,
            "status_code": 400,
            "code": "INVALID_CURRENT_PASSWORD",
            "message": "invalid current password",
        }

    if current_password_value == new_password_value:
        return {
            "ok": False,
            "status_code": 400,
            "code": "PASSWORD_SAME_AS_CURRENT",
            "message": "new password matches current password",
        }

    try:
        validate_password_policy(new_password_value)
    except ValueError:
        return {
            "ok": False,
            "status_code": 400,
            "code": "WEAK_PASSWORD",
            "message": "weak password",
        }

    current_session_token_hash = make_session_token_hash(raw_session_token)

    with pg_conn() as conn:
        with conn.cursor() as cur:
            user_id = _resolve_session_user_id(cur, raw_session_token=raw_session_token)
            if user_id is None:
                conn.rollback()
                return {
                    "ok": False,
                    "status_code": 401,
                    "code": "AUTH_REQUIRED",
                    "message": "auth required",
                }

            cur.execute(
                """
                SELECT
                    u.status,
                    i.identity_id,
                    i.password_hash
                FROM app.users u
                LEFT JOIN app.user_identities i
                  ON i.user_id = u.user_id
                 AND i.provider = 'password'
                WHERE u.user_id = %(user_id)s
                ORDER BY i.is_primary DESC NULLS LAST, i.identity_id DESC NULLS LAST
                LIMIT 1
                """,
                {"user_id": user_id},
            )
            row = cur.fetchone()

            if row is None:
                conn.rollback()
                return {
                    "ok": False,
                    "status_code": 401,
                    "code": "AUTH_REQUIRED",
                    "message": "auth required",
                }

            user_status = str(row[0] or "")
            identity_id = int(row[1]) if row[1] is not None else None
            stored_hash = row[2]

            if user_status in {"blocked", "deleted"}:
                conn.rollback()
                return {
                    "ok": False,
                    "status_code": 403,
                    "code": "ACCOUNT_BLOCKED",
                    "message": "account blocked",
                }

            if identity_id is None or not stored_hash:
                conn.rollback()
                return {
                    "ok": False,
                    "status_code": 400,
                    "code": "PASSWORD_AUTH_NOT_AVAILABLE",
                    "message": "password auth not available",
                }

            if not verify_password(current_password_value, stored_hash):
                conn.rollback()
                return {
                    "ok": False,
                    "status_code": 400,
                    "code": "INVALID_CURRENT_PASSWORD",
                    "message": "invalid current password",
                }

            next_password_hash = hash_password(new_password_value)

            cur.execute(
                """
                UPDATE app.user_identities
                SET password_hash = %(password_hash)s,
                    updated_at_utc = NOW()
                WHERE identity_id = %(identity_id)s
                """,
                {
                    "identity_id": identity_id,
                    "password_hash": next_password_hash,
                },
            )

            cur.execute(
                """
                UPDATE app.users
                SET updated_at_utc = NOW()
                WHERE user_id = %(user_id)s
                """,
                {"user_id": user_id},
            )

            cur.execute(
                """
                UPDATE auth.sessions
                SET revoked_at_utc = NOW()
                WHERE user_id = %(user_id)s
                  AND session_token_hash <> %(current_session_token_hash)s
                  AND revoked_at_utc IS NULL
                """,
                {
                    "user_id": user_id,
                    "current_session_token_hash": current_session_token_hash,
                },
            )

        conn.commit()

    return {
        "ok": True,
        "message": "password changed successfully",
        "meta": {
            "generated_at_utc": utc_now_iso(),
        },
    }

def reset_password_with_token(
    *,
    token: str,
    new_password: str,
) -> Dict[str, Any]:
    raw_token = str(token or "").strip()
    if not raw_token:
        return {
            "ok": False,
            "status_code": 400,
            "code": "INVALID_RESET_TOKEN",
            "message": "invalid reset token",
        }

    try:
        validate_password_policy(new_password)
    except ValueError:
        return {
            "ok": False,
            "status_code": 400,
            "code": "WEAK_PASSWORD",
            "message": "weak password",
        }

    reset_token_hash = _make_password_reset_token_hash(raw_token)

    with pg_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    prt.reset_token_id,
                    prt.user_id,
                    prt.identity_id,
                    u.status
                FROM auth.password_reset_tokens prt
                JOIN app.users u
                  ON u.user_id = prt.user_id
                WHERE prt.token_hash = %(token_hash)s
                  AND prt.used_at_utc IS NULL
                  AND prt.revoked_at_utc IS NULL
                  AND prt.expires_at_utc > NOW()
                LIMIT 1
                """,
                {"token_hash": reset_token_hash},
            )
            row = cur.fetchone()

            if row is None:
                conn.rollback()
                return {
                    "ok": False,
                    "status_code": 400,
                    "code": "INVALID_RESET_TOKEN",
                    "message": "invalid reset token",
                }

            reset_token_id = int(row[0])
            user_id = int(row[1])
            preferred_identity_id = int(row[2]) if row[2] is not None else None
            user_status = str(row[3])

            if user_status in {"blocked", "deleted"}:
                conn.rollback()
                return {
                    "ok": False,
                    "status_code": 403,
                    "code": "ACCOUNT_BLOCKED",
                    "message": "account blocked",
                }

            cur.execute(
                """
                SELECT identity_id
                FROM app.user_identities
                WHERE user_id = %(user_id)s
                  AND provider = 'password'
                ORDER BY
                    CASE
                        WHEN %(preferred_identity_id)s IS NOT NULL AND identity_id = %(preferred_identity_id)s THEN 0
                        ELSE 1
                    END,
                    is_primary DESC,
                    identity_id DESC
                LIMIT 1
                """,
                {
                    "user_id": user_id,
                    "preferred_identity_id": preferred_identity_id,
                },
            )
            identity_row = cur.fetchone()

            if identity_row is None:
                conn.rollback()
                return {
                    "ok": False,
                    "status_code": 400,
                    "code": "INVALID_RESET_TOKEN",
                    "message": "invalid reset token",
                }

            identity_id = int(identity_row[0])
            next_password_hash = hash_password(new_password)

            cur.execute(
                """
                UPDATE app.user_identities
                SET password_hash = %(password_hash)s,
                    updated_at_utc = NOW()
                WHERE identity_id = %(identity_id)s
                """,
                {
                    "identity_id": identity_id,
                    "password_hash": next_password_hash,
                },
            )

            cur.execute(
                """
                UPDATE app.users
                SET updated_at_utc = NOW()
                WHERE user_id = %(user_id)s
                """,
                {"user_id": user_id},
            )

            cur.execute(
                """
                UPDATE auth.password_reset_tokens
                SET used_at_utc = NOW()
                WHERE reset_token_id = %(reset_token_id)s
                """,
                {"reset_token_id": reset_token_id},
            )

            cur.execute(
                """
                UPDATE auth.sessions
                SET revoked_at_utc = NOW()
                WHERE user_id = %(user_id)s
                  AND revoked_at_utc IS NULL
                """,
                {"user_id": user_id},
            )

        conn.commit()

    return {
        "ok": True,
        "message": "password reset successful",
        "meta": {
            "generated_at_utc": utc_now_iso(),
        },
    }