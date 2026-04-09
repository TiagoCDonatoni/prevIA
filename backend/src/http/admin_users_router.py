from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Dict, List

from fastapi import APIRouter, Body, Depends, HTTPException, Query

from src.auth.passwords import hash_password, validate_password_policy
from src.auth.service import build_entitlements_for_plan, normalize_email
from src.core.settings import load_settings
from src.db.pg import pg_conn
from src.internal_access.guards import require_admin_access
from src.internal_access.service import actor_has_capability, resolve_user_access_context

router = APIRouter(
    prefix="/admin/users",
    tags=["admin-users"],
    dependencies=[Depends(require_admin_access)],
)

ALLOWED_PLAN_CODES = {"FREE", "BASIC", "LIGHT", "PRO"}
ALLOWED_USER_STATUSES = {"active", "pending_verification", "blocked", "deleted"}


def _utc_now():
    return datetime.now(timezone.utc)


def _today_date_key():
    return _utc_now().date()


def _iso(dt):
    if dt is None:
        return None
    return dt.isoformat().replace("+00:00", "Z")


def _safe_plan_code(raw: Any) -> str:
    plan_code = str(raw or "").strip().upper()
    if plan_code not in ALLOWED_PLAN_CODES:
        raise HTTPException(status_code=400, detail="invalid plan_code")
    return plan_code


def _safe_user_status(raw: Any) -> str:
    value = str(raw or "").strip()
    if value not in ALLOWED_USER_STATUSES:
        raise HTTPException(status_code=400, detail="invalid user status")
    return value

def _is_valid_email(email_normalized: str) -> bool:
    return (
        bool(email_normalized)
        and "@" in email_normalized
        and not email_normalized.startswith("@")
        and not email_normalized.endswith("@")
    )

def _required_reason(raw: Any) -> str:
    value = str(raw or "").strip()
    if not value:
        raise HTTPException(status_code=400, detail="reason is required")
    if len(value) > 500:
        raise HTTPException(status_code=400, detail="reason too long")
    return value

def _require_capability(actor: Dict[str, Any], capability_key: str) -> None:
    access_context = actor.get("access") or {}
    if not actor_has_capability(access_context, capability_key):
        raise HTTPException(
            status_code=403,
            detail={
                "ok": False,
                "code": "ADMIN_CAPABILITY_REQUIRED",
                "message": f"missing capability: {capability_key}",
            },
        )


def _ensure_user_exists(cur, *, user_id: int) -> Dict[str, Any]:
    cur.execute(
        """
        SELECT user_id, email, full_name, preferred_lang, status, email_verified, created_at_utc, last_login_at_utc
        FROM app.users
        WHERE user_id = %(user_id)s
        LIMIT 1
        """,
        {"user_id": user_id},
    )
    row = cur.fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="user not found")

    return {
        "user_id": int(row[0]),
        "email": str(row[1]),
        "full_name": row[2],
        "preferred_lang": row[3],
        "status": str(row[4]),
        "email_verified": bool(row[5]),
        "created_at_utc": _iso(row[6]),
        "last_login_at_utc": _iso(row[7]),
    }


def _fetch_latest_subscription(cur, *, user_id: int) -> Dict[str, Any]:
    cur.execute(
        """
        SELECT
            subscription_id,
            plan_code,
            provider,
            status,
            current_period_start_utc,
            current_period_end_utc,
            cancel_at_period_end,
            updated_at_utc
        FROM billing.subscriptions
        WHERE user_id = %(user_id)s
        ORDER BY
            CASE
                WHEN status = 'active' THEN 0
                WHEN status = 'trialing' THEN 1
                WHEN status = 'past_due' THEN 2
                ELSE 3
            END,
            updated_at_utc DESC,
            subscription_id DESC
        LIMIT 1
        """,
        {"user_id": user_id},
    )
    row = cur.fetchone()

    if row is None:
        return {
            "subscription_id": None,
            "plan_code": "FREE",
            "provider": "manual",
            "status": "active",
            "billing_cycle": None,
            "current_period_start_utc": None,
            "current_period_end_utc": None,
            "cancel_at_period_end": False,
            "updated_at_utc": None,
        }

    plan_code = str(row[1] or "FREE").strip().upper()
    provider = str(row[2] or "manual").strip()
    status = str(row[3] or "active").strip()

    billing_cycle = None
    if plan_code != "FREE" and provider == "manual":
        billing_cycle = "monthly"

    return {
        "subscription_id": int(row[0]),
        "plan_code": plan_code,
        "provider": provider,
        "status": status,
        "billing_cycle": billing_cycle,
        "current_period_start_utc": _iso(row[4]),
        "current_period_end_utc": _iso(row[5]),
        "cancel_at_period_end": bool(row[6]),
        "updated_at_utc": _iso(row[7]),
    }


def _fetch_usage_today(cur, *, user_id: int, plan_code: str) -> Dict[str, Any]:
    date_key = _today_date_key()

    cur.execute(
        """
        SELECT credits_used, revealed_count
        FROM access.user_daily_usage
        WHERE user_id = %(user_id)s
          AND date_key = %(date_key)s
        LIMIT 1
        """,
        {"user_id": user_id, "date_key": date_key},
    )
    row = cur.fetchone()

    cur.execute(
        """
        SELECT COALESCE(SUM(granted_credits), 0)::int
        FROM access.user_daily_credit_grants
        WHERE user_id = %(user_id)s
          AND date_key = %(date_key)s
        """,
        {"user_id": user_id, "date_key": date_key},
    )
    grant_row = cur.fetchone()

    credits_used = int(row[0]) if row else 0
    revealed_count = int(row[1]) if row else 0
    extra_credits = int(grant_row[0]) if grant_row and grant_row[0] is not None else 0
    base_daily_limit = int(build_entitlements_for_plan(plan_code)["credits"]["daily_limit"])
    daily_limit = base_daily_limit + extra_credits

    return {
        "date_key": str(date_key),
        "base_daily_limit": base_daily_limit,
        "extra_credits": extra_credits,
        "daily_limit": daily_limit,
        "credits_used": credits_used,
        "revealed_count": revealed_count,
        "remaining": max(0, daily_limit - credits_used),
    }


def _fetch_assigned_roles(cur, *, user_id: int) -> List[Dict[str, Any]]:
    cur.execute(
        """
        SELECT role_key, is_active, grant_source, notes, created_at_utc, updated_at_utc
        FROM app.user_roles
        WHERE user_id = %(user_id)s
        ORDER BY role_key ASC, user_role_id DESC
        """,
        {"user_id": user_id},
    )

    out: List[Dict[str, Any]] = []
    for role_key, is_active, grant_source, notes, created_at_utc, updated_at_utc in cur.fetchall() or []:
        out.append(
            {
                "role_key": str(role_key),
                "is_active": bool(is_active),
                "grant_source": str(grant_source),
                "notes": notes,
                "created_at_utc": _iso(created_at_utc),
                "updated_at_utc": _iso(updated_at_utc),
            }
        )
    return out


def _insert_audit(
    cur,
    *,
    actor_user_id: int | None,
    target_user_id: int,
    action_key: str,
    entity_type: str,
    entity_id: str | None,
    before_json: Dict[str, Any] | None,
    after_json: Dict[str, Any] | None,
    meta_json: Dict[str, Any] | None = None,
) -> None:
    cur.execute(
        """
        INSERT INTO admin.admin_audit_log (
            actor_user_id,
            target_user_id,
            action_key,
            entity_type,
            entity_id,
            before_json,
            after_json,
            meta_json
        )
        VALUES (
            %(actor_user_id)s,
            %(target_user_id)s,
            %(action_key)s,
            %(entity_type)s,
            %(entity_id)s,
            %(before_json)s::jsonb,
            %(after_json)s::jsonb,
            %(meta_json)s::jsonb
        )
        """,
        {
            "actor_user_id": actor_user_id,
            "target_user_id": target_user_id,
            "action_key": action_key,
            "entity_type": entity_type,
            "entity_id": entity_id,
            "before_json": json.dumps(before_json) if before_json is not None else None,
            "after_json": json.dumps(after_json) if after_json is not None else None,
            "meta_json": json.dumps(meta_json or {}),
        },
    )


def _upsert_entitlements_snapshot(cur, *, user_id: int, plan_code: str) -> None:
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

@router.post("")
def admin_create_user(
    payload: Dict[str, Any] = Body(...),
    actor: Dict[str, Any] = Depends(require_admin_access),
):
    _require_capability(actor, "admin.users.basic_write")

    email = str(payload.get("email") or "").strip()
    email_normalized = normalize_email(email)
    password = str(payload.get("password") or "")
    full_name = str(payload.get("full_name") or "").strip() or None
    reason = _required_reason(payload.get("reason"))
    actor_user_id = int(actor["user"]["user_id"]) if actor.get("user") else None

    if not _is_valid_email(email_normalized):
        raise HTTPException(status_code=400, detail="invalid email")

    try:
        validate_password_policy(password)
    except ValueError:
        raise HTTPException(status_code=400, detail="weak password")

    settings = load_settings()

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
            existing = cur.fetchone()
            if existing is not None:
                raise HTTPException(status_code=409, detail="email already exists")

            cur.execute(
                """
                INSERT INTO app.users (
                    email,
                    email_normalized,
                    full_name,
                    preferred_lang,
                    status,
                    email_verified
                )
                VALUES (
                    %(email)s,
                    %(email_normalized)s,
                    %(full_name)s,
                    %(preferred_lang)s,
                    'active',
                    FALSE
                )
                RETURNING user_id
                """,
                {
                    "email": email,
                    "email_normalized": email_normalized,
                    "full_name": full_name,
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
                    NULL
                )
                """,
                {
                    "user_id": user_id,
                    "provider_email": email,
                    "password_hash": hash_password(password),
                },
            )

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
                    'admin_manual_user_create',
                    %(payload_json)s::jsonb
                )
                """,
                {
                    "subscription_id": subscription_id,
                    "user_id": user_id,
                    "payload_json": json.dumps(
                        {
                            "reason": reason,
                            "actor_user_id": actor_user_id,
                            "source": "admin_users_create",
                        }
                    ),
                },
            )

            _upsert_entitlements_snapshot(cur, user_id=user_id, plan_code="FREE")

            _insert_audit(
                cur,
                actor_user_id=actor_user_id,
                target_user_id=user_id,
                action_key="admin.user.create",
                entity_type="app.users",
                entity_id=str(user_id),
                before_json=None,
                after_json={
                    "email": email,
                    "full_name": full_name,
                    "status": "active",
                    "plan_code": "FREE",
                },
                meta_json={"reason": reason},
            )
            conn.commit()

    return {
        "ok": True,
        "user": {
            "user_id": user_id,
            "email": email,
            "full_name": full_name,
            "status": "active",
        },
        "subscription": {
            "plan_code": "FREE",
        },
    }

@router.get("")
def admin_list_users(
    q: str = Query(default="", max_length=120),
    user_status: str = Query(default=""),
    plan_code: str = Query(default=""),
    role_key: str = Query(default=""),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    actor: Dict[str, Any] = Depends(require_admin_access),
):
    _require_capability(actor, "admin.users.read")

    normalized_plan_code = str(plan_code or "").strip().upper()
    normalized_role_key = str(role_key or "").strip()
    normalized_status = str(user_status or "").strip()
    qq = str(q or "").strip()

    sql = """
    WITH role_agg AS (
        SELECT
            ur.user_id,
            array_agg(ur.role_key ORDER BY ur.role_key) FILTER (WHERE ur.is_active = TRUE) AS active_role_keys
        FROM app.user_roles ur
        GROUP BY ur.user_id
    ),
    usage_today AS (
        SELECT
            udu.user_id,
            udu.credits_used,
            udu.revealed_count
        FROM access.user_daily_usage udu
        WHERE udu.date_key = CURRENT_DATE
    ),
    credit_grants_today AS (
        SELECT
            udcg.user_id,
            COALESCE(SUM(udcg.granted_credits), 0)::int AS extra_credits
        FROM access.user_daily_credit_grants udcg
        WHERE udcg.date_key = CURRENT_DATE
        GROUP BY udcg.user_id
    ),
    current_sub AS (
        SELECT DISTINCT ON (s.user_id)
            s.user_id,
            s.subscription_id,
            s.plan_code,
            s.provider,
            s.status,
            s.current_period_end_utc,
            s.updated_at_utc
        FROM billing.subscriptions s
        ORDER BY
            s.user_id,
            CASE
                WHEN s.status = 'active' THEN 0
                WHEN s.status = 'trialing' THEN 1
                WHEN s.status = 'past_due' THEN 2
                ELSE 3
            END,
            s.updated_at_utc DESC,
            s.subscription_id DESC
    )
    SELECT
        COUNT(*) OVER() AS total_count,
        u.user_id,
        u.email,
        u.full_name,
        u.preferred_lang,
        u.status,
        u.email_verified,
        u.created_at_utc,
        u.last_login_at_utc,
        COALESCE(cs.plan_code, 'FREE') AS plan_code,
        COALESCE(cs.provider, 'manual') AS provider,
        COALESCE(cs.status, 'active') AS subscription_status,
        cs.current_period_end_utc,
        COALESCE(ut.credits_used, 0) AS credits_used,
        COALESCE(ut.revealed_count, 0) AS revealed_count,
        COALESCE(cgt.extra_credits, 0) AS extra_credits
    FROM app.users u
    LEFT JOIN role_agg ra
      ON ra.user_id = u.user_id
    LEFT JOIN usage_today ut
      ON ut.user_id = u.user_id
    LEFT JOIN credit_grants_today cgt
      ON cgt.user_id = u.user_id
    LEFT JOIN current_sub cs
      ON cs.user_id = u.user_id
    WHERE (%(q)s = '' OR u.email_normalized ILIKE %(pattern)s OR COALESCE(u.full_name, '') ILIKE %(pattern)s)
      AND (%(user_status)s = '' OR u.status = %(user_status)s)
      AND (%(plan_code)s = '' OR COALESCE(cs.plan_code, 'FREE') = %(plan_code)s)
      AND (%(role_key)s = '' OR %(role_key)s = ANY(COALESCE(ra.active_role_keys, ARRAY[]::text[])))
    ORDER BY u.created_at_utc DESC, u.user_id DESC
    LIMIT %(limit)s
    OFFSET %(offset)s
    """

    with pg_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                sql,
                {
                    "q": qq,
                    "pattern": f"%{qq}%",
                    "user_status": normalized_status,
                    "plan_code": normalized_plan_code,
                    "role_key": normalized_role_key,
                    "limit": limit,
                    "offset": offset,
                },
            )
            rows = cur.fetchall() or []

            items: List[Dict[str, Any]] = []
            total_count = 0

            for row in rows:
                total_count = int(row[0] or 0)
                (
                    _total_count,
                    user_id,
                    email,
                    full_name,
                    preferred_lang,
                    status,
                    email_verified,
                    created_at_utc,
                    last_login_at_utc,
                    subscription_plan_code,
                    provider,
                    subscription_status,
                    current_period_end_utc,
                    credits_used,
                    revealed_count,
                    extra_credits,
                ) = row

                access_context = resolve_user_access_context(
                    cur,
                    user_id=int(user_id),
                    email=str(email),
                    email_verified=bool(email_verified),
                    auth_mode="session",
                )

                base_daily_limit = int(build_entitlements_for_plan(subscription_plan_code)["credits"]["daily_limit"])
                effective_daily_limit = base_daily_limit + int(extra_credits)

                items.append(
                    {
                        "user_id": int(user_id),
                        "email": str(email),
                        "full_name": full_name,
                        "preferred_lang": preferred_lang,
                        "status": str(status),
                        "email_verified": bool(email_verified),
                        "created_at_utc": _iso(created_at_utc),
                        "last_login_at_utc": _iso(last_login_at_utc),
                        "subscription": {
                            "plan_code": str(subscription_plan_code),
                            "provider": str(provider) if provider is not None else None,
                            "status": str(subscription_status) if subscription_status is not None else None,
                            "current_period_end_utc": _iso(current_period_end_utc),
                        },
                        "usage_today": {
                            "base_daily_limit": base_daily_limit,
                            "extra_credits": int(extra_credits),
                            "daily_limit": effective_daily_limit,
                            "credits_used": int(credits_used),
                            "revealed_count": int(revealed_count),
                            "remaining": max(0, effective_daily_limit - int(credits_used)),
                        },
                        "role_keys": access_context.get("role_keys") or [],
                        "is_internal": bool(access_context.get("is_internal")),
                        "billing_runtime": str(access_context.get("billing_runtime") or "live"),
                    }
                )

    return {
        "ok": True,
        "items": items,
        "count": total_count,
        "limit": limit,
        "offset": offset,
    }


@router.get("/{user_id}")
def admin_get_user_detail(
    user_id: int,
    actor: Dict[str, Any] = Depends(require_admin_access),
):
    _require_capability(actor, "admin.users.read")

    with pg_conn() as conn:
        with conn.cursor() as cur:
            user = _ensure_user_exists(cur, user_id=user_id)
            subscription = _fetch_latest_subscription(cur, user_id=user_id)
            usage_today = _fetch_usage_today(cur, user_id=user_id, plan_code=subscription["plan_code"])
            assigned_roles = _fetch_assigned_roles(cur, user_id=user_id)
            access_context = resolve_user_access_context(
                cur,
                user_id=user_id,
                email=user["email"],
                email_verified=user["email_verified"],
                auth_mode="session",
            )

            cur.execute(
                """
                SELECT event_type, payload_json, created_at_utc
                FROM billing.subscription_events
                WHERE user_id = %(user_id)s
                ORDER BY created_at_utc DESC
                LIMIT 10
                """,
                {"user_id": user_id},
            )
            recent_subscription_events = [
                {
                    "event_type": str(event_type),
                    "payload_json": payload_json,
                    "created_at_utc": _iso(created_at_utc),
                }
                for event_type, payload_json, created_at_utc in (cur.fetchall() or [])
            ]

            cur.execute(
                """
                SELECT
                    a.action_key,
                    actor_u.email,
                    a.meta_json,
                    a.created_at_utc
                FROM admin.admin_audit_log a
                LEFT JOIN app.users actor_u
                  ON actor_u.user_id = a.actor_user_id
                WHERE a.target_user_id = %(user_id)s
                ORDER BY a.created_at_utc DESC
                LIMIT 20
                """,
                {"user_id": user_id},
            )
            recent_admin_audit = [
                {
                    "action_key": str(action_key),
                    "actor_email": str(actor_email) if actor_email is not None else None,
                    "meta_json": meta_json,
                    "created_at_utc": _iso(created_at_utc),
                }
                for action_key, actor_email, meta_json, created_at_utc in (cur.fetchall() or [])
            ]

    return {
        "ok": True,
        "user": user,
        "subscription": subscription,
        "usage_today": usage_today,
        "assigned_roles": assigned_roles,
        "effective_access": {
            **access_context,
            "product_plan_code": str(access_context.get("product_plan_code") or subscription["plan_code"] or "FREE"),
        },
        "recent_subscription_events": recent_subscription_events,
        "recent_admin_audit": recent_admin_audit,
    }


@router.post("/{user_id}/status")
def admin_set_user_status(
    user_id: int,
    payload: Dict[str, Any] = Body(...),
    actor: Dict[str, Any] = Depends(require_admin_access),
):
    _require_capability(actor, "admin.users.basic_write")

    next_status = _safe_user_status(payload.get("status"))
    reason = _required_reason(payload.get("reason"))
    actor_user_id = int(actor["user"]["user_id"]) if actor.get("user") else None

    with pg_conn() as conn:
        with conn.cursor() as cur:
            before = _ensure_user_exists(cur, user_id=user_id)

            cur.execute(
                """
                UPDATE app.users
                SET status = %(status)s,
                    updated_at_utc = NOW()
                WHERE user_id = %(user_id)s
                """,
                {"user_id": user_id, "status": next_status},
            )

            after = _ensure_user_exists(cur, user_id=user_id)

            _insert_audit(
                cur,
                actor_user_id=actor_user_id,
                target_user_id=user_id,
                action_key="admin.user.status.set",
                entity_type="app.users",
                entity_id=str(user_id),
                before_json={"status": before["status"]},
                after_json={"status": after["status"]},
                meta_json={"reason": reason},
            )
            conn.commit()

    return {
        "ok": True,
        "user_id": user_id,
        "status": next_status,
    }


@router.post("/{user_id}/plan")
def admin_set_user_plan(
    user_id: int,
    payload: Dict[str, Any] = Body(...),
    actor: Dict[str, Any] = Depends(require_admin_access),
):
    _require_capability(actor, "admin.users.plan.write")

    next_plan_code = _safe_plan_code(payload.get("plan_code"))
    reason = _required_reason(payload.get("reason"))
    actor_user_id = int(actor["user"]["user_id"]) if actor.get("user") else None

    with pg_conn() as conn:
        with conn.cursor() as cur:
            _ensure_user_exists(cur, user_id=user_id)
            before = _fetch_latest_subscription(cur, user_id=user_id)

            if before["subscription_id"] is not None:
                cur.execute(
                    """
                    UPDATE billing.subscriptions
                    SET plan_code = %(plan_code)s,
                        provider = 'manual',
                        status = 'active',
                        cancel_at_period_end = FALSE,
                        cancelled_at_utc = NULL,
                        current_period_start_utc = COALESCE(current_period_start_utc, NOW()),
                        current_period_end_utc = NULL,
                        updated_at_utc = NOW()
                    WHERE subscription_id = %(subscription_id)s
                    """,
                    {
                        "subscription_id": before["subscription_id"],
                        "plan_code": next_plan_code,
                    },
                )
                subscription_id = int(before["subscription_id"])
            else:
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
                    {
                        "user_id": user_id,
                        "plan_code": next_plan_code,
                    },
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
                    'admin_manual_plan_set',
                    %(payload_json)s::jsonb
                )
                """,
                {
                    "subscription_id": subscription_id,
                    "user_id": user_id,
                    "payload_json": json.dumps(
                        {
                            "plan_code": next_plan_code,
                            "reason": reason,
                            "actor_user_id": actor_user_id,
                        }
                    ),
                },
            )

            _upsert_entitlements_snapshot(cur, user_id=user_id, plan_code=next_plan_code)
            after = _fetch_latest_subscription(cur, user_id=user_id)

            _insert_audit(
                cur,
                actor_user_id=actor_user_id,
                target_user_id=user_id,
                action_key="admin.user.plan.set",
                entity_type="billing.subscriptions",
                entity_id=str(subscription_id),
                before_json={"plan_code": before["plan_code"], "status": before["status"], "provider": before["provider"]},
                after_json={"plan_code": after["plan_code"], "status": after["status"], "provider": after["provider"]},
                meta_json={"reason": reason},
            )
            conn.commit()

    return {
        "ok": True,
        "user_id": user_id,
        "plan_code": next_plan_code,
    }


@router.post("/{user_id}/roles/upsert")
def admin_upsert_user_role(
    user_id: int,
    payload: Dict[str, Any] = Body(...),
    actor: Dict[str, Any] = Depends(require_admin_access),
):
    _require_capability(actor, "admin.users.roles.write")

    role_key = str(payload.get("role_key") or "").strip()
    is_active = bool(payload.get("is_active"))
    notes = str(payload.get("notes") or "").strip() or None
    reason = _required_reason(payload.get("reason"))
    actor_user_id = int(actor["user"]["user_id"]) if actor.get("user") else None

    if not role_key:
        raise HTTPException(status_code=400, detail="role_key is required")

    with pg_conn() as conn:
        with conn.cursor() as cur:
            _ensure_user_exists(cur, user_id=user_id)

            cur.execute(
                """
                SELECT role_key
                FROM app.roles
                WHERE role_key = %(role_key)s
                LIMIT 1
                """,
                {"role_key": role_key},
            )
            if cur.fetchone() is None:
                raise HTTPException(status_code=400, detail="role_key not found")

            cur.execute(
                """
                SELECT user_role_id, is_active, notes
                FROM app.user_roles
                WHERE user_id = %(user_id)s
                  AND role_key = %(role_key)s
                ORDER BY user_role_id DESC
                LIMIT 1
                """,
                {"user_id": user_id, "role_key": role_key},
            )
            existing = cur.fetchone()

            before = {
                "role_key": role_key,
                "is_active": bool(existing[1]) if existing else False,
                "notes": existing[2] if existing else None,
            }

            if existing is None:
                cur.execute(
                    """
                    INSERT INTO app.user_roles (
                        user_id,
                        role_key,
                        granted_by_user_id,
                        grant_source,
                        is_active,
                        notes
                    )
                    VALUES (
                        %(user_id)s,
                        %(role_key)s,
                        %(granted_by_user_id)s,
                        'manual',
                        %(is_active)s,
                        %(notes)s
                    )
                    """,
                    {
                        "user_id": user_id,
                        "role_key": role_key,
                        "granted_by_user_id": actor_user_id,
                        "is_active": is_active,
                        "notes": notes,
                    },
                )
            else:
                cur.execute(
                    """
                    UPDATE app.user_roles
                    SET is_active = %(is_active)s,
                        notes = %(notes)s,
                        granted_by_user_id = %(granted_by_user_id)s,
                        grant_source = 'manual',
                        updated_at_utc = NOW()
                    WHERE user_role_id = %(user_role_id)s
                    """,
                    {
                        "user_role_id": int(existing[0]),
                        "is_active": is_active,
                        "notes": notes,
                        "granted_by_user_id": actor_user_id,
                    },
                )

            after = {
                "role_key": role_key,
                "is_active": is_active,
                "notes": notes,
            }

            _insert_audit(
                cur,
                actor_user_id=actor_user_id,
                target_user_id=user_id,
                action_key="admin.user.role.upsert",
                entity_type="app.user_roles",
                entity_id=f"{user_id}:{role_key}",
                before_json=before,
                after_json=after,
                meta_json={"reason": reason},
            )
            conn.commit()

    return {
        "ok": True,
        "user_id": user_id,
        "role_key": role_key,
        "is_active": is_active,
    }


@router.post("/{user_id}/credits/grant")
def admin_grant_user_credits(
    user_id: int,
    payload: Dict[str, Any] = Body(...),
    actor: Dict[str, Any] = Depends(require_admin_access),
):
    _require_capability(actor, "admin.users.credits.write")

    try:
        credits = int(payload.get("credits") or 0)
    except Exception:
        raise HTTPException(status_code=400, detail="credits must be an integer")

    if credits <= 0:
        raise HTTPException(status_code=400, detail="credits must be greater than zero")

    if credits > 1000:
        raise HTTPException(status_code=400, detail="credits too high for a single grant")

    reason = _required_reason(payload.get("reason"))
    actor_user_id = int(actor["user"]["user_id"]) if actor.get("user") else None
    date_key = _today_date_key()

    with pg_conn() as conn:
        with conn.cursor() as cur:
            _ensure_user_exists(cur, user_id=user_id)

            cur.execute(
                """
                SELECT COALESCE(SUM(granted_credits), 0)::int
                FROM access.user_daily_credit_grants
                WHERE user_id = %(user_id)s
                  AND date_key = %(date_key)s
                """,
                {"user_id": user_id, "date_key": date_key},
            )
            before_extra = int(cur.fetchone()[0] or 0)

            cur.execute(
                """
                INSERT INTO access.user_daily_credit_grants (
                    user_id,
                    date_key,
                    granted_credits,
                    reason,
                    granted_by_user_id
                )
                VALUES (
                    %(user_id)s,
                    %(date_key)s,
                    %(granted_credits)s,
                    %(reason)s,
                    %(granted_by_user_id)s
                )
                """,
                {
                    "user_id": user_id,
                    "date_key": date_key,
                    "granted_credits": credits,
                    "reason": reason,
                    "granted_by_user_id": actor_user_id,
                },
            )

            after_extra = before_extra + credits

            _insert_audit(
                cur,
                actor_user_id=actor_user_id,
                target_user_id=user_id,
                action_key="admin.user.credits.grant",
                entity_type="access.user_daily_credit_grants",
                entity_id=f"{user_id}:{date_key}",
                before_json={"date_key": str(date_key), "extra_credits": before_extra},
                after_json={"date_key": str(date_key), "extra_credits": after_extra, "granted_now": credits},
                meta_json={"reason": reason},
            )
            conn.commit()

    return {
        "ok": True,
        "user_id": user_id,
        "date_key": str(date_key),
        "granted_credits": credits,
    }