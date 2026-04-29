from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from typing import Any, Dict

from fastapi import Request

from src.auth.sessions import make_session_token_hash, read_product_session_cookie
from src.core.settings import load_settings
from src.db.pg import pg_conn

PLAN_RANK = {
    "FREE": 0,
    "BASIC": 1,
    "LIGHT": 2,
    "PRO": 3,
}

TRIAL_LIKE_GRANT_CATEGORIES = {"trial", "beta"}


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(value: Any) -> str | None:
    if value is None:
        return None
    if hasattr(value, "isoformat"):
        text = value.isoformat()
        return text.replace("+00:00", "Z")
    return str(value)


def _normalize_plan_code(raw: Any) -> str:
    plan = str(raw or "FREE").strip().upper()
    return plan if plan in PLAN_RANK else "FREE"


def _plan_rank(raw: Any) -> int:
    return PLAN_RANK.get(_normalize_plan_code(raw), 0)


def _coerce_json_array(raw: Any) -> list[Any]:
    if isinstance(raw, list):
        return raw
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, list):
                return parsed
        except Exception:
            return []
    return []


def _resolve_request_user_id(cur, request: Request) -> int | None:
    raw_session_token = read_product_session_cookie(request)
    if raw_session_token:
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
        if row is not None:
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

    settings = load_settings()
    if settings.product_dev_auto_login_enabled:
        email_normalized = str(settings.product_dev_auto_login_email or "").strip().lower()
        if email_normalized:
            cur.execute(
                """
                SELECT user_id
                FROM app.users
                WHERE email_normalized = %(email_normalized)s
                LIMIT 1
                """,
                {"email_normalized": email_normalized},
            )
            row = cur.fetchone()
            if row is not None:
                return int(row[0])

    return None


def _fetch_user_context(cur, *, user_id: int) -> Dict[str, Any] | None:
    cur.execute(
        """
        SELECT user_id, email, email_normalized, created_at_utc, status
        FROM app.users
        WHERE user_id = %(user_id)s
        LIMIT 1
        """,
        {"user_id": user_id},
    )
    row = cur.fetchone()
    if row is None:
        return None
    return {
        "user_id": int(row[0]),
        "email": str(row[1] or ""),
        "email_normalized": str(row[2] or row[1] or "").strip().lower(),
        "created_at_utc": row[3],
        "status": str(row[4] or ""),
    }


def _fetch_base_subscription(cur, *, user_id: int) -> Dict[str, Any]:
    cur.execute(
        """
        SELECT
            subscription_id,
            plan_code,
            COALESCE(NULLIF(billing_status, ''), status) AS effective_status,
            provider,
            billing_cycle,
            billing_runtime,
            updated_at_utc
        FROM billing.subscriptions
        WHERE user_id = %(user_id)s
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
        {"user_id": user_id},
    )
    row = cur.fetchone()
    if row is None:
        return {
            "subscription_id": None,
            "plan_code": "FREE",
            "status": "inactive",
            "provider": None,
            "billing_cycle": None,
            "billing_runtime": "live",
        }
    return {
        "subscription_id": int(row[0]),
        "plan_code": _normalize_plan_code(row[1]),
        "status": str(row[2] or "inactive"),
        "provider": row[3],
        "billing_cycle": row[4],
        "billing_runtime": row[5] or "live",
    }


def _has_previous_trial_like_grant(cur, *, user_id: int, email_normalized: str) -> bool:
    cur.execute(
        """
        SELECT 1
        FROM access.user_plan_grants upg
        WHERE upg.user_id = %(user_id)s
          AND upg.grant_category IN ('trial', 'beta')
        LIMIT 1
        """,
        {"user_id": user_id},
    )
    if cur.fetchone() is not None:
        return True

    cur.execute(
        """
        SELECT 1
        FROM access.campaign_redemptions cr
        JOIN access.user_plan_grants upg
          ON upg.grant_id = cr.grant_id
        WHERE cr.email_normalized = %(email_normalized)s
          AND cr.status = 'redeemed'
          AND upg.grant_category IN ('trial', 'beta')
        LIMIT 1
        """,
        {"email_normalized": email_normalized},
    )
    return cur.fetchone() is not None


def _insert_failed_redemption(
    cur,
    *,
    campaign_id: int,
    user_id: int,
    email_normalized: str,
    status: str,
    failure_reason: str,
) -> None:
    cur.execute(
        """
        INSERT INTO access.campaign_redemptions (
            campaign_id,
            user_id,
            email_normalized,
            status,
            failure_reason
        )
        VALUES (
            %(campaign_id)s,
            %(user_id)s,
            %(email_normalized)s,
            %(status)s,
            %(failure_reason)s
        )
        """,
        {
            "campaign_id": campaign_id,
            "user_id": user_id,
            "email_normalized": email_normalized,
            "status": status,
            "failure_reason": failure_reason,
        },
    )


def _build_campaign_public_payload(campaign: Dict[str, Any], offer: Dict[str, Any] | None = None) -> Dict[str, Any]:
    max_redemptions = campaign.get("max_redemptions")
    redeemed_count = int(campaign.get("redeemed_count") or 0)
    remaining = None
    if max_redemptions is not None:
        remaining = max(0, int(max_redemptions) - redeemed_count)

    return {
        "campaign_id": int(campaign["campaign_id"]),
        "slug": campaign["slug"],
        "label": campaign["label"],
        "kind": campaign["kind"],
        "status": campaign["status"],
        "trial": {
            "enabled": bool(campaign.get("trial_enabled")),
            "plan_code": _normalize_plan_code(campaign.get("trial_plan_code")),
            "duration_days": campaign.get("trial_duration_days"),
        },
        "limits": {
            "max_redemptions": max_redemptions,
            "redeemed_count": redeemed_count,
            "remaining_redemptions": remaining,
            "starts_at_utc": _iso(campaign.get("starts_at_utc")),
            "expires_at_utc": _iso(campaign.get("expires_at_utc")),
        },
        "offer": offer,
        "metadata": campaign.get("metadata_json") or {},
    }


def _fetch_campaign_by_slug(cur, *, slug: str, for_update: bool = False) -> Dict[str, Any] | None:
    lock_clause = "FOR UPDATE" if for_update else ""
    cur.execute(
        f"""
        SELECT
            campaign_id,
            slug,
            label,
            kind,
            status,
            trial_enabled,
            trial_plan_code,
            trial_duration_days,
            trial_grant_category,
            allow_existing_users,
            allow_previous_trial_users,
            allow_paid_upgrade_trial,
            requires_approval,
            starts_at_utc,
            expires_at_utc,
            max_redemptions,
            redeemed_count,
            created_at_utc,
            metadata_json
        FROM access.campaigns
        WHERE slug = %(slug)s
        LIMIT 1
        {lock_clause}
        """,
        {"slug": slug},
    )
    row = cur.fetchone()
    if row is None:
        return None
    return {
        "campaign_id": int(row[0]),
        "slug": row[1],
        "label": row[2],
        "kind": row[3],
        "status": row[4],
        "trial_enabled": bool(row[5]),
        "trial_plan_code": row[6],
        "trial_duration_days": row[7],
        "trial_grant_category": row[8],
        "allow_existing_users": bool(row[9]),
        "allow_previous_trial_users": bool(row[10]),
        "allow_paid_upgrade_trial": bool(row[11]),
        "requires_approval": bool(row[12]),
        "starts_at_utc": row[13],
        "expires_at_utc": row[14],
        "max_redemptions": row[15],
        "redeemed_count": int(row[16] or 0),
        "created_at_utc": row[17],
        "metadata_json": row[18] or {},
    }


def _fetch_primary_campaign_offer(cur, *, campaign_id: int) -> Dict[str, Any] | None:
    cur.execute(
        """
        SELECT
            offer_id,
            discount_type,
            discount_percent,
            discount_amount_cents,
            currency,
            discount_duration,
            discount_duration_months,
            eligible_plan_codes,
            eligible_billing_cycles,
            offer_valid_until_utc,
            offer_valid_days_after_grant_end,
            stripe_coupon_id,
            stripe_promotion_code_id,
            max_redemptions,
            redeemed_count
        FROM access.campaign_offers
        WHERE campaign_id = %(campaign_id)s
          AND status = 'active'
          AND (
            max_redemptions IS NULL
            OR redeemed_count < max_redemptions
          )
        ORDER BY offer_id ASC
        LIMIT 1
        """,
        {"campaign_id": campaign_id},
    )
    row = cur.fetchone()
    if row is None:
        return None
    return {
        "offer_id": int(row[0]),
        "discount_type": row[1],
        "discount_percent": float(row[2]) if row[2] is not None else None,
        "discount_amount_cents": row[3],
        "currency": row[4],
        "discount_duration": row[5],
        "discount_duration_months": row[6],
        "eligible_plan_codes": _coerce_json_array(row[7]),
        "eligible_billing_cycles": _coerce_json_array(row[8]),
        "offer_valid_until_utc": row[9],
        "offer_valid_days_after_grant_end": row[10],
        "stripe_coupon_id": row[11],
        "stripe_promotion_code_id": row[12],
        "max_redemptions": row[13],
        "redeemed_count": int(row[14] or 0),
    }


def get_campaign_public_payload(*, slug: str) -> Dict[str, Any]:
    normalized_slug = str(slug or "").strip().lower()
    if not normalized_slug:
        return {"ok": False, "code": "CAMPAIGN_NOT_FOUND", "message": "campaign not found"}

    with pg_conn() as conn:
        with conn.cursor() as cur:
            campaign = _fetch_campaign_by_slug(cur, slug=normalized_slug)
            if campaign is None:
                return {"ok": False, "code": "CAMPAIGN_NOT_FOUND", "message": "campaign not found"}
            offer = _fetch_primary_campaign_offer(cur, campaign_id=int(campaign["campaign_id"]))
        conn.commit()

    return {
        "ok": True,
        "campaign": _build_campaign_public_payload(campaign, offer=offer),
    }


def resolve_active_discount_eligibility_for_user(cur, *, user_id: int) -> Dict[str, Any] | None:
    cur.execute(
        """
        SELECT
            eligibility_id,
            campaign_id,
            offer_id,
            eligible_plan_codes,
            eligible_billing_cycles,
            starts_at_utc,
            ends_at_utc,
            stripe_coupon_id,
            stripe_promotion_code_id
        FROM billing.user_discount_eligibilities
        WHERE user_id = %(user_id)s
          AND status = 'active'
          AND starts_at_utc <= NOW()
          AND (
            ends_at_utc IS NULL
            OR ends_at_utc > NOW()
          )
        ORDER BY ends_at_utc ASC NULLS LAST, eligibility_id DESC
        LIMIT 1
        """,
        {"user_id": user_id},
    )
    row = cur.fetchone()
    if row is None:
        return None
    return {
        "eligibility_id": int(row[0]),
        "campaign_id": int(row[1]) if row[1] is not None else None,
        "offer_id": int(row[2]) if row[2] is not None else None,
        "eligible_plan_codes": _coerce_json_array(row[3]),
        "eligible_billing_cycles": _coerce_json_array(row[4]),
        "starts_at_utc": _iso(row[5]),
        "ends_at_utc": _iso(row[6]),
        "stripe_coupon_id": row[7],
        "stripe_promotion_code_id": row[8],
    }


def resolve_effective_access_for_user(
    cur,
    *,
    user_id: int,
    base_plan_code: str,
) -> Dict[str, Any]:
    normalized_base_plan = _normalize_plan_code(base_plan_code)
    base_rank = _plan_rank(normalized_base_plan)

    cur.execute(
        """
        SELECT
            upg.grant_id,
            upg.campaign_id,
            c.slug,
            c.label,
            upg.grant_category,
            upg.plan_code,
            upg.starts_at_utc,
            upg.ends_at_utc,
            upg.source_type
        FROM access.user_plan_grants upg
        LEFT JOIN access.campaigns c
          ON c.campaign_id = upg.campaign_id
        WHERE upg.user_id = %(user_id)s
          AND upg.status = 'active'
          AND upg.starts_at_utc <= NOW()
          AND upg.ends_at_utc > NOW()
        ORDER BY
            CASE upg.plan_code
                WHEN 'PRO' THEN 3
                WHEN 'LIGHT' THEN 2
                WHEN 'BASIC' THEN 1
                ELSE 0
            END DESC,
            upg.ends_at_utc DESC,
            upg.grant_id DESC
        LIMIT 1
        """,
        {"user_id": user_id},
    )
    row = cur.fetchone()

    active_grant = None
    effective_plan_code = normalized_base_plan
    effective_source = "subscription" if normalized_base_plan != "FREE" else "free"

    if row is not None:
        grant_plan_code = _normalize_plan_code(row[5])
        if _plan_rank(grant_plan_code) > base_rank:
            effective_plan_code = grant_plan_code
            effective_source = "grant"
            active_grant = {
                "grant_id": int(row[0]),
                "campaign_id": int(row[1]) if row[1] is not None else None,
                "campaign_slug": row[2],
                "campaign_label": row[3],
                "grant_category": row[4],
                "plan_code": grant_plan_code,
                "starts_at_utc": _iso(row[6]),
                "ends_at_utc": _iso(row[7]),
                "source_type": row[8],
            }

    return {
        "base_plan_code": normalized_base_plan,
        "effective_plan_code": effective_plan_code,
        "effective_source": effective_source,
        "active_grant": active_grant,
        "discount_eligibility": resolve_active_discount_eligibility_for_user(cur, user_id=user_id),
    }


def _create_discount_eligibility_for_offer(
    cur,
    *,
    user_id: int,
    campaign_id: int,
    offer: Dict[str, Any],
    grant_ends_at: datetime,
) -> Dict[str, Any]:
    ends_at = offer.get("offer_valid_until_utc")
    valid_days_after_grant_end = offer.get("offer_valid_days_after_grant_end")

    if valid_days_after_grant_end is not None:
        relative_ends_at = grant_ends_at + timedelta(days=int(valid_days_after_grant_end))
        if ends_at is None or relative_ends_at < ends_at:
            ends_at = relative_ends_at

    cur.execute(
        """
        INSERT INTO billing.user_discount_eligibilities (
            user_id,
            campaign_id,
            offer_id,
            status,
            eligible_plan_codes,
            eligible_billing_cycles,
            starts_at_utc,
            ends_at_utc,
            stripe_coupon_id,
            stripe_promotion_code_id,
            metadata_json
        )
        VALUES (
            %(user_id)s,
            %(campaign_id)s,
            %(offer_id)s,
            'active',
            %(eligible_plan_codes)s::jsonb,
            %(eligible_billing_cycles)s::jsonb,
            NOW(),
            %(ends_at_utc)s,
            %(stripe_coupon_id)s,
            %(stripe_promotion_code_id)s,
            %(metadata_json)s::jsonb
        )
        RETURNING eligibility_id, starts_at_utc, ends_at_utc
        """,
        {
            "user_id": user_id,
            "campaign_id": campaign_id,
            "offer_id": offer["offer_id"],
            "eligible_plan_codes": json.dumps(offer.get("eligible_plan_codes") or []),
            "eligible_billing_cycles": json.dumps(offer.get("eligible_billing_cycles") or []),
            "ends_at_utc": ends_at,
            "stripe_coupon_id": offer.get("stripe_coupon_id"),
            "stripe_promotion_code_id": offer.get("stripe_promotion_code_id"),
            "metadata_json": json.dumps(
                {
                    "source": "access_campaign_redeem",
                    "discount_type": offer.get("discount_type"),
                    "discount_percent": offer.get("discount_percent"),
                    "discount_amount_cents": offer.get("discount_amount_cents"),
                    "currency": offer.get("currency"),
                    "discount_duration": offer.get("discount_duration"),
                    "discount_duration_months": offer.get("discount_duration_months"),
                },
                ensure_ascii=False,
            ),
        },
    )
    row = cur.fetchone()

    cur.execute(
        """
        UPDATE access.campaign_offers
        SET redeemed_count = redeemed_count + 1,
            updated_at_utc = NOW()
        WHERE offer_id = %(offer_id)s
        """,
        {"offer_id": offer["offer_id"]},
    )

    return {
        "eligibility_id": int(row[0]),
        "starts_at_utc": _iso(row[1]),
        "ends_at_utc": _iso(row[2]),
        "eligible_plan_codes": offer.get("eligible_plan_codes") or [],
        "eligible_billing_cycles": offer.get("eligible_billing_cycles") or [],
    }


def redeem_campaign_for_request(*, request: Request, slug: str) -> Dict[str, Any]:
    normalized_slug = str(slug or "").strip().lower()
    if not normalized_slug:
        return {"ok": False, "status_code": 404, "code": "CAMPAIGN_NOT_FOUND", "message": "campaign not found"}

    with pg_conn() as conn:
        with conn.cursor() as cur:
            user_id = _resolve_request_user_id(cur, request)
            if user_id is None:
                conn.commit()
                return {"ok": False, "status_code": 401, "code": "AUTH_REQUIRED", "message": "authentication required"}

            user = _fetch_user_context(cur, user_id=user_id)
            if user is None or user["status"] == "deleted":
                conn.commit()
                return {"ok": False, "status_code": 401, "code": "AUTH_REQUIRED", "message": "authentication required"}

            campaign = _fetch_campaign_by_slug(cur, slug=normalized_slug, for_update=True)
            if campaign is None:
                conn.commit()
                return {"ok": False, "status_code": 404, "code": "CAMPAIGN_NOT_FOUND", "message": "campaign not found"}

            campaign_id = int(campaign["campaign_id"])
            email_normalized = str(user["email_normalized"] or "").strip().lower()
            now = _utc_now()

            def fail(status_value: str, code: str, message: str, http_status: int = 400) -> Dict[str, Any]:
                _insert_failed_redemption(
                    cur,
                    campaign_id=campaign_id,
                    user_id=user_id,
                    email_normalized=email_normalized,
                    status=status_value,
                    failure_reason=code,
                )
                conn.commit()
                return {"ok": False, "status_code": http_status, "code": code, "message": message}

            if campaign["status"] != "active":
                return fail("campaign_paused", "CAMPAIGN_NOT_ACTIVE", "campaign is not active", 409)

            starts_at = campaign.get("starts_at_utc")
            if starts_at is not None and starts_at > now:
                return fail("campaign_paused", "CAMPAIGN_NOT_STARTED", "campaign has not started", 409)

            expires_at = campaign.get("expires_at_utc")
            if expires_at is not None and expires_at <= now:
                return fail("campaign_expired", "CAMPAIGN_EXPIRED", "campaign expired", 409)

            max_redemptions = campaign.get("max_redemptions")
            if max_redemptions is not None and int(campaign["redeemed_count"] or 0) >= int(max_redemptions):
                return fail("limit_reached", "CAMPAIGN_LIMIT_REACHED", "campaign limit reached", 409)

            cur.execute(
                """
                SELECT redemption_id, grant_id, status
                FROM access.campaign_redemptions
                WHERE campaign_id = %(campaign_id)s
                  AND (
                    user_id = %(user_id)s
                    OR email_normalized = %(email_normalized)s
                  )
                  AND status IN ('redeemed', 'pending_approval')
                ORDER BY redeemed_at_utc DESC
                LIMIT 1
                """,
                {
                    "campaign_id": campaign_id,
                    "user_id": user_id,
                    "email_normalized": email_normalized,
                },
            )
            already = cur.fetchone()
            if already is not None:
                conn.commit()
                return {
                    "ok": True,
                    "code": "ALREADY_REDEEMED",
                    "message": "campaign already redeemed",
                    "redemption": {
                        "redemption_id": int(already[0]),
                        "grant_id": int(already[1]) if already[1] is not None else None,
                        "status": already[2],
                    },
                    "auth_refresh_required": True,
                }

            if not bool(campaign.get("trial_enabled")):
                return fail("blocked", "CAMPAIGN_TRIAL_DISABLED", "campaign trial is disabled", 409)

            trial_plan_code = _normalize_plan_code(campaign.get("trial_plan_code"))
            trial_rank = _plan_rank(trial_plan_code)
            trial_duration_days = int(campaign.get("trial_duration_days") or 0)
            if trial_rank <= 0 or trial_duration_days <= 0:
                return fail("blocked", "CAMPAIGN_TRIAL_INVALID", "campaign trial is invalid", 409)

            base_subscription = _fetch_base_subscription(cur, user_id=user_id)
            base_plan_code = _normalize_plan_code(base_subscription.get("plan_code"))
            base_rank = _plan_rank(base_plan_code)

            if trial_rank <= base_rank:
                return fail(
                    "plan_not_higher",
                    "PLAN_NOT_HIGHER",
                    "user already has equal or higher access",
                    409,
                )

            is_paid_user = base_rank > 0 and str(base_subscription.get("status") or "").lower() in {
                "active",
                "trialing",
                "past_due",
            }

            if is_paid_user:
                if not bool(campaign.get("allow_paid_upgrade_trial")):
                    return fail(
                        "blocked",
                        "PAID_UPGRADE_TRIAL_NOT_ALLOWED",
                        "campaign does not allow paid upgrade trial",
                        409,
                    )
                grant_category = "paid_upgrade_trial"
            else:
                if not bool(campaign.get("allow_existing_users")):
                    user_created_at = user.get("created_at_utc")
                    campaign_created_at = campaign.get("created_at_utc")
                    if user_created_at is not None and campaign_created_at is not None and user_created_at < campaign_created_at:
                        return fail(
                            "blocked",
                            "EXISTING_USERS_NOT_ALLOWED",
                            "campaign does not allow existing users",
                            409,
                        )

                if not bool(campaign.get("allow_previous_trial_users")) and _has_previous_trial_like_grant(
                    cur,
                    user_id=user_id,
                    email_normalized=email_normalized,
                ):
                    return fail(
                        "already_used_trial",
                        "ALREADY_USED_TRIAL",
                        "user already used a trial",
                        409,
                    )

                grant_category = str(campaign.get("trial_grant_category") or "trial").strip().lower()
                if grant_category not in TRIAL_LIKE_GRANT_CATEGORIES:
                    grant_category = "trial"

            if bool(campaign.get("requires_approval")):
                cur.execute(
                    """
                    INSERT INTO access.campaign_redemptions (
                        campaign_id,
                        user_id,
                        email_normalized,
                        status
                    )
                    VALUES (
                        %(campaign_id)s,
                        %(user_id)s,
                        %(email_normalized)s,
                        'pending_approval'
                    )
                    RETURNING redemption_id
                    """,
                    {
                        "campaign_id": campaign_id,
                        "user_id": user_id,
                        "email_normalized": email_normalized,
                    },
                )
                redemption_id = int(cur.fetchone()[0])
                conn.commit()
                return {
                    "ok": True,
                    "code": "PENDING_APPROVAL",
                    "message": "campaign redemption pending approval",
                    "redemption": {"redemption_id": redemption_id, "status": "pending_approval"},
                    "auth_refresh_required": False,
                }

            cur.execute(
                """
                INSERT INTO access.user_plan_grants (
                    user_id,
                    source_type,
                    campaign_id,
                    grant_category,
                    plan_code,
                    starts_at_utc,
                    ends_at_utc,
                    status,
                    metadata_json
                )
                VALUES (
                    %(user_id)s,
                    'campaign',
                    %(campaign_id)s,
                    %(grant_category)s,
                    %(plan_code)s,
                    NOW(),
                    NOW() + (%(trial_duration_days)s || ' days')::interval,
                    'active',
                    %(metadata_json)s::jsonb
                )
                RETURNING grant_id, starts_at_utc, ends_at_utc
                """,
                {
                    "user_id": user_id,
                    "campaign_id": campaign_id,
                    "grant_category": grant_category,
                    "plan_code": trial_plan_code,
                    "trial_duration_days": trial_duration_days,
                    "metadata_json": json.dumps(
                        {
                            "source": "access_campaign_redeem",
                            "campaign_slug": campaign["slug"],
                            "base_plan_code": base_plan_code,
                        },
                        ensure_ascii=False,
                    ),
                },
            )
            grant_row = cur.fetchone()
            grant_id = int(grant_row[0])
            grant_starts_at = grant_row[1]
            grant_ends_at = grant_row[2]

            cur.execute(
                """
                INSERT INTO access.campaign_redemptions (
                    campaign_id,
                    user_id,
                    email_normalized,
                    status,
                    grant_id
                )
                VALUES (
                    %(campaign_id)s,
                    %(user_id)s,
                    %(email_normalized)s,
                    'redeemed',
                    %(grant_id)s
                )
                RETURNING redemption_id
                """,
                {
                    "campaign_id": campaign_id,
                    "user_id": user_id,
                    "email_normalized": email_normalized,
                    "grant_id": grant_id,
                },
            )
            redemption_id = int(cur.fetchone()[0])

            cur.execute(
                """
                UPDATE access.campaigns
                SET redeemed_count = redeemed_count + 1,
                    updated_at_utc = NOW()
                WHERE campaign_id = %(campaign_id)s
                """,
                {"campaign_id": campaign_id},
            )

            offer = _fetch_primary_campaign_offer(cur, campaign_id=campaign_id)
            discount_eligibility = None
            if offer is not None:
                discount_eligibility = _create_discount_eligibility_for_offer(
                    cur,
                    user_id=user_id,
                    campaign_id=campaign_id,
                    offer=offer,
                    grant_ends_at=grant_ends_at,
                )

        conn.commit()

    return {
        "ok": True,
        "code": "REDEEMED",
        "message": "campaign redeemed",
        "grant": {
            "grant_id": grant_id,
            "grant_category": grant_category,
            "plan_code": trial_plan_code,
            "starts_at_utc": _iso(grant_starts_at),
            "ends_at_utc": _iso(grant_ends_at),
        },
        "redemption": {
            "redemption_id": redemption_id,
            "status": "redeemed",
        },
        "discount_eligibility": discount_eligibility,
        "auth_refresh_required": True,
    }