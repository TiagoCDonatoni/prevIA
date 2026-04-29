from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from typing import Any, Dict

from src.db.pg import pg_conn

PLAN_CODES = {"FREE", "BASIC", "LIGHT", "PRO"}

CAMPAIGN_KINDS = {
    "beta_open",
    "beta_private",
    "influencer",
    "partner",
    "founders",
    "early_access",
    "retention",
    "winback",
    "manual_campaign",
    "internal_testing",
}

CAMPAIGN_STATUSES = {"draft", "active", "paused", "expired", "closed", "archived"}

GRANT_CATEGORIES = {
    "trial",
    "beta",
    "paid_upgrade_trial",
    "courtesy",
    "compensation",
    "partner",
    "internal",
}

DISCOUNT_TYPES = {"percent", "amount"}
DISCOUNT_DURATIONS = {"once", "repeating", "forever"}
BILLING_CYCLES = {"monthly", "quarterly", "semiannual", "annual"}

SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9-]{1,80}$")


def _utc_iso(value: Any) -> str | None:
    if value is None:
        return None
    if hasattr(value, "isoformat"):
        return value.isoformat().replace("+00:00", "Z")
    return str(value)


def _normalize_slug(raw: Any) -> str:
    slug = str(raw or "").strip().lower()
    slug = re.sub(r"[^a-z0-9-]+", "-", slug)
    slug = re.sub(r"-{2,}", "-", slug).strip("-")
    return slug


def _parse_int(raw: Any, default: int | None = None) -> int | None:
    if raw is None or raw == "":
        return default
    try:
        return int(raw)
    except Exception:
        return default


def _parse_bool(raw: Any, default: bool = False) -> bool:
    if raw is None:
        return default
    return bool(raw)


def _parse_datetime(raw: Any) -> datetime | None:
    if raw is None or raw == "":
        return None

    if isinstance(raw, datetime):
        value = raw
    else:
        text = str(raw).strip()
        if not text:
            return None
        if text.endswith("Z"):
            text = text[:-1] + "+00:00"
        value = datetime.fromisoformat(text)

    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)

    return value.astimezone(timezone.utc)


def _normalize_plan(raw: Any, *, allow_none: bool = False) -> str | None:
    if raw is None and allow_none:
        return None
    value = str(raw or "").strip().upper()
    if value not in PLAN_CODES:
        raise ValueError("invalid plan_code")
    return value


def _normalize_kind(raw: Any) -> str:
    value = str(raw or "beta_open").strip().lower()
    if value not in CAMPAIGN_KINDS:
        raise ValueError("invalid campaign kind")
    return value


def _normalize_status(raw: Any) -> str:
    value = str(raw or "draft").strip().lower()
    if value not in CAMPAIGN_STATUSES:
        raise ValueError("invalid campaign status")
    return value


def _normalize_grant_category(raw: Any) -> str:
    value = str(raw or "trial").strip().lower()
    if value not in GRANT_CATEGORIES:
        raise ValueError("invalid grant category")
    return value


def _json_list(raw: Any, *, allowed: set[str] | None = None, upper: bool = False) -> list[str]:
    if raw is None:
        return []

    values = raw if isinstance(raw, list) else []

    normalized: list[str] = []
    for item in values:
        value = str(item or "").strip()
        if upper:
            value = value.upper()
        else:
            value = value.lower()

        if not value:
            continue

        if allowed is not None and value not in allowed:
            continue

        if value not in normalized:
            normalized.append(value)

    return normalized


def _campaign_row_to_dict(row: tuple[Any, ...]) -> Dict[str, Any]:
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
        "starts_at_utc": _utc_iso(row[13]),
        "expires_at_utc": _utc_iso(row[14]),
        "max_redemptions": row[15],
        "redeemed_count": int(row[16] or 0),
        "created_at_utc": _utc_iso(row[17]),
        "updated_at_utc": _utc_iso(row[18]),
        "metadata_json": row[19] or {},
    }


def _offer_row_to_dict(row: tuple[Any, ...] | None) -> Dict[str, Any] | None:
    if row is None:
        return None

    return {
        "offer_id": int(row[0]),
        "campaign_id": int(row[1]),
        "status": row[2],
        "discount_type": row[3],
        "discount_percent": float(row[4]) if row[4] is not None else None,
        "discount_amount_cents": row[5],
        "currency": row[6],
        "discount_duration": row[7],
        "discount_duration_months": row[8],
        "eligible_plan_codes": row[9] or [],
        "eligible_billing_cycles": row[10] or [],
        "offer_valid_until_utc": _utc_iso(row[11]),
        "offer_valid_days_after_grant_end": row[12],
        "stripe_coupon_id": row[13],
        "stripe_promotion_code_id": row[14],
        "max_redemptions": row[15],
        "redeemed_count": int(row[16] or 0),
        "created_at_utc": _utc_iso(row[17]),
        "updated_at_utc": _utc_iso(row[18]),
        "metadata_json": row[19] or {},
    }


def _fetch_offer_for_campaign(cur, *, campaign_id: int) -> Dict[str, Any] | None:
    cur.execute(
        """
        SELECT
            offer_id,
            campaign_id,
            status,
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
            redeemed_count,
            created_at_utc,
            updated_at_utc,
            metadata_json
        FROM access.campaign_offers
        WHERE campaign_id = %(campaign_id)s
        ORDER BY
            CASE status
                WHEN 'active' THEN 0
                WHEN 'paused' THEN 1
                WHEN 'closed' THEN 2
                ELSE 3
            END,
            offer_id DESC
        LIMIT 1
        """,
        {"campaign_id": campaign_id},
    )
    return _offer_row_to_dict(cur.fetchone())


def list_admin_access_campaigns(*, limit: int = 50) -> Dict[str, Any]:
    safe_limit = max(1, min(int(limit or 50), 200))

    with pg_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    c.campaign_id,
                    c.slug,
                    c.label,
                    c.kind,
                    c.status,
                    c.trial_enabled,
                    c.trial_plan_code,
                    c.trial_duration_days,
                    c.trial_grant_category,
                    c.allow_existing_users,
                    c.allow_previous_trial_users,
                    c.allow_paid_upgrade_trial,
                    c.requires_approval,
                    c.starts_at_utc,
                    c.expires_at_utc,
                    c.max_redemptions,
                    c.redeemed_count,
                    c.created_at_utc,
                    c.updated_at_utc,
                    c.metadata_json,
                    COUNT(g.grant_id) FILTER (WHERE g.status = 'active' AND g.ends_at_utc > NOW()) AS active_grants_count,
                    COUNT(r.redemption_id) FILTER (WHERE r.status = 'redeemed') AS redeemed_rows_count
                FROM access.campaigns c
                LEFT JOIN access.user_plan_grants g
                  ON g.campaign_id = c.campaign_id
                LEFT JOIN access.campaign_redemptions r
                  ON r.campaign_id = c.campaign_id
                GROUP BY c.campaign_id
                ORDER BY c.created_at_utc DESC, c.campaign_id DESC
                LIMIT %(limit)s
                """,
                {"limit": safe_limit},
            )
            rows = cur.fetchall()
        conn.commit()

    campaigns = []
    for row in rows:
        campaign = _campaign_row_to_dict(row[:20])
        campaign["active_grants_count"] = int(row[20] or 0)
        campaign["redeemed_rows_count"] = int(row[21] or 0)
        campaign["public_url_path"] = f"/pt/beta/{campaign['slug']}"
        campaigns.append(campaign)

    return {
        "ok": True,
        "campaigns": campaigns,
    }


def get_admin_access_campaign(*, campaign_id: int) -> Dict[str, Any]:
    with pg_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
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
                    updated_at_utc,
                    metadata_json
                FROM access.campaigns
                WHERE campaign_id = %(campaign_id)s
                LIMIT 1
                """,
                {"campaign_id": campaign_id},
            )
            row = cur.fetchone()
            if row is None:
                conn.commit()
                return {"ok": False, "status_code": 404, "code": "CAMPAIGN_NOT_FOUND"}

            campaign = _campaign_row_to_dict(row)
            offer = _fetch_offer_for_campaign(cur, campaign_id=campaign_id)

            cur.execute(
                """
                SELECT
                    r.redemption_id,
                    r.status,
                    r.failure_reason,
                    r.redeemed_at_utc,
                    r.email_normalized,
                    u.email,
                    u.full_name,
                    g.grant_id,
                    g.grant_category,
                    g.plan_code,
                    g.starts_at_utc,
                    g.ends_at_utc,
                    g.status
                FROM access.campaign_redemptions r
                LEFT JOIN app.users u
                  ON u.user_id = r.user_id
                LEFT JOIN access.user_plan_grants g
                  ON g.grant_id = r.grant_id
                WHERE r.campaign_id = %(campaign_id)s
                ORDER BY r.redeemed_at_utc DESC
                LIMIT 50
                """,
                {"campaign_id": campaign_id},
            )
            redemption_rows = cur.fetchall()
        conn.commit()

    redemptions = [
        {
            "redemption_id": int(row[0]),
            "status": row[1],
            "failure_reason": row[2],
            "redeemed_at_utc": _utc_iso(row[3]),
            "email_normalized": row[4],
            "email": row[5],
            "full_name": row[6],
            "grant": None
            if row[7] is None
            else {
                "grant_id": int(row[7]),
                "grant_category": row[8],
                "plan_code": row[9],
                "starts_at_utc": _utc_iso(row[10]),
                "ends_at_utc": _utc_iso(row[11]),
                "status": row[12],
            },
        }
        for row in redemption_rows
    ]

    return {
        "ok": True,
        "campaign": {
            **campaign,
            "public_url_path": f"/pt/beta/{campaign['slug']}",
        },
        "offer": offer,
        "redemptions": redemptions,
    }


def _build_campaign_values(payload: Dict[str, Any]) -> Dict[str, Any]:
    slug = _normalize_slug(payload.get("slug"))
    if not slug or not SLUG_RE.match(slug):
        raise ValueError("invalid slug")

    label = str(payload.get("label") or "").strip()
    if not label:
        raise ValueError("label is required")

    trial_enabled = _parse_bool(payload.get("trial_enabled"), True)
    trial_plan_code = _normalize_plan(payload.get("trial_plan_code"), allow_none=not trial_enabled)
    trial_duration_days = _parse_int(payload.get("trial_duration_days"))

    if trial_enabled and (not trial_plan_code or not trial_duration_days or trial_duration_days <= 0):
        raise ValueError("invalid trial config")

    return {
        "slug": slug,
        "label": label,
        "kind": _normalize_kind(payload.get("kind")),
        "status": _normalize_status(payload.get("status") or "draft"),
        "trial_enabled": trial_enabled,
        "trial_plan_code": trial_plan_code,
        "trial_duration_days": trial_duration_days,
        "trial_grant_category": _normalize_grant_category(payload.get("trial_grant_category") or "trial"),
        "allow_existing_users": _parse_bool(payload.get("allow_existing_users"), True),
        "allow_previous_trial_users": _parse_bool(payload.get("allow_previous_trial_users"), False),
        "allow_paid_upgrade_trial": _parse_bool(payload.get("allow_paid_upgrade_trial"), True),
        "requires_approval": _parse_bool(payload.get("requires_approval"), False),
        "starts_at_utc": _parse_datetime(payload.get("starts_at_utc")),
        "expires_at_utc": _parse_datetime(payload.get("expires_at_utc")),
        "max_redemptions": _parse_int(payload.get("max_redemptions")),
        "metadata_json": payload.get("metadata_json") if isinstance(payload.get("metadata_json"), dict) else {},
    }


def _upsert_offer(cur, *, campaign_id: int, offer_payload: Dict[str, Any] | None) -> Dict[str, Any] | None:
    if not offer_payload or not offer_payload.get("enabled"):
        cur.execute(
            """
            UPDATE access.campaign_offers
            SET status = 'closed',
                updated_at_utc = NOW()
            WHERE campaign_id = %(campaign_id)s
              AND status IN ('active', 'paused')
            """,
            {"campaign_id": campaign_id},
        )
        return None

    discount_type = str(offer_payload.get("discount_type") or "percent").strip().lower()
    if discount_type not in DISCOUNT_TYPES:
        raise ValueError("invalid discount type")

    discount_percent = None
    discount_amount_cents = None
    currency = None

    if discount_type == "percent":
        discount_percent = float(offer_payload.get("discount_percent") or 0)
        if discount_percent <= 0 or discount_percent > 100:
            raise ValueError("invalid discount percent")
    else:
        discount_amount_cents = _parse_int(offer_payload.get("discount_amount_cents"))
        currency = str(offer_payload.get("currency") or "").strip().lower()
        if not discount_amount_cents or discount_amount_cents <= 0 or not currency:
            raise ValueError("invalid amount discount")

    discount_duration = str(offer_payload.get("discount_duration") or "repeating").strip().lower()
    if discount_duration not in DISCOUNT_DURATIONS:
        raise ValueError("invalid discount duration")

    discount_duration_months = _parse_int(offer_payload.get("discount_duration_months"))
    if discount_duration == "repeating" and (not discount_duration_months or discount_duration_months <= 0):
        raise ValueError("invalid discount duration months")

    eligible_plan_codes = _json_list(
        offer_payload.get("eligible_plan_codes"),
        allowed=PLAN_CODES,
        upper=True,
    )
    eligible_billing_cycles = _json_list(
        offer_payload.get("eligible_billing_cycles"),
        allowed=BILLING_CYCLES,
    )

    cur.execute(
        """
        SELECT offer_id
        FROM access.campaign_offers
        WHERE campaign_id = %(campaign_id)s
        ORDER BY offer_id DESC
        LIMIT 1
        """,
        {"campaign_id": campaign_id},
    )
    existing = cur.fetchone()

    params = {
        "campaign_id": campaign_id,
        "status": str(offer_payload.get("status") or "active").strip().lower(),
        "discount_type": discount_type,
        "discount_percent": discount_percent,
        "discount_amount_cents": discount_amount_cents,
        "currency": currency,
        "discount_duration": discount_duration,
        "discount_duration_months": discount_duration_months,
        "eligible_plan_codes": json.dumps(eligible_plan_codes),
        "eligible_billing_cycles": json.dumps(eligible_billing_cycles),
        "offer_valid_until_utc": _parse_datetime(offer_payload.get("offer_valid_until_utc")),
        "offer_valid_days_after_grant_end": _parse_int(
            offer_payload.get("offer_valid_days_after_grant_end"),
            default=7,
        ),
        "stripe_coupon_id": str(offer_payload.get("stripe_coupon_id") or "").strip() or None,
        "stripe_promotion_code_id": str(offer_payload.get("stripe_promotion_code_id") or "").strip() or None,
        "max_redemptions": _parse_int(offer_payload.get("max_redemptions")),
        "metadata_json": json.dumps(
            offer_payload.get("metadata_json") if isinstance(offer_payload.get("metadata_json"), dict) else {},
            ensure_ascii=False,
        ),
    }

    if existing is None:
        cur.execute(
            """
            INSERT INTO access.campaign_offers (
                campaign_id,
                status,
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
                metadata_json
            )
            VALUES (
                %(campaign_id)s,
                %(status)s,
                %(discount_type)s,
                %(discount_percent)s,
                %(discount_amount_cents)s,
                %(currency)s,
                %(discount_duration)s,
                %(discount_duration_months)s,
                %(eligible_plan_codes)s::jsonb,
                %(eligible_billing_cycles)s::jsonb,
                %(offer_valid_until_utc)s,
                %(offer_valid_days_after_grant_end)s,
                %(stripe_coupon_id)s,
                %(stripe_promotion_code_id)s,
                %(max_redemptions)s,
                %(metadata_json)s::jsonb
            )
            RETURNING offer_id
            """,
            params,
        )
        offer_id = int(cur.fetchone()[0])
    else:
        offer_id = int(existing[0])
        cur.execute(
            """
            UPDATE access.campaign_offers
            SET status = %(status)s,
                discount_type = %(discount_type)s,
                discount_percent = %(discount_percent)s,
                discount_amount_cents = %(discount_amount_cents)s,
                currency = %(currency)s,
                discount_duration = %(discount_duration)s,
                discount_duration_months = %(discount_duration_months)s,
                eligible_plan_codes = %(eligible_plan_codes)s::jsonb,
                eligible_billing_cycles = %(eligible_billing_cycles)s::jsonb,
                offer_valid_until_utc = %(offer_valid_until_utc)s,
                offer_valid_days_after_grant_end = %(offer_valid_days_after_grant_end)s,
                stripe_coupon_id = %(stripe_coupon_id)s,
                stripe_promotion_code_id = %(stripe_promotion_code_id)s,
                max_redemptions = %(max_redemptions)s,
                metadata_json = %(metadata_json)s::jsonb,
                updated_at_utc = NOW()
            WHERE offer_id = %(offer_id)s
            """,
            {**params, "offer_id": offer_id},
        )

    return _fetch_offer_for_campaign(cur, campaign_id=campaign_id)


def create_admin_access_campaign(*, payload: Dict[str, Any]) -> Dict[str, Any]:
    try:
        values = _build_campaign_values(payload)
    except Exception as exc:
        return {"ok": False, "status_code": 400, "code": "INVALID_CAMPAIGN", "message": str(exc)}

    with pg_conn() as conn:
        with conn.cursor() as cur:
            try:
                cur.execute(
                    """
                    INSERT INTO access.campaigns (
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
                        metadata_json
                    )
                    VALUES (
                        %(slug)s,
                        %(label)s,
                        %(kind)s,
                        %(status)s,
                        %(trial_enabled)s,
                        %(trial_plan_code)s,
                        %(trial_duration_days)s,
                        %(trial_grant_category)s,
                        %(allow_existing_users)s,
                        %(allow_previous_trial_users)s,
                        %(allow_paid_upgrade_trial)s,
                        %(requires_approval)s,
                        %(starts_at_utc)s,
                        %(expires_at_utc)s,
                        %(max_redemptions)s,
                        %(metadata_json)s::jsonb
                    )
                    RETURNING campaign_id
                    """,
                    {
                        **values,
                        "metadata_json": json.dumps(values["metadata_json"], ensure_ascii=False),
                    },
                )
                campaign_id = int(cur.fetchone()[0])
                offer = _upsert_offer(cur, campaign_id=campaign_id, offer_payload=payload.get("offer"))
            except Exception as exc:
                conn.rollback()
                return {"ok": False, "status_code": 400, "code": "CAMPAIGN_CREATE_FAILED", "message": str(exc)}

        conn.commit()

    detail = get_admin_access_campaign(campaign_id=campaign_id)
    if detail.get("ok"):
        detail["offer"] = offer
    return detail


def update_admin_access_campaign(*, campaign_id: int, payload: Dict[str, Any]) -> Dict[str, Any]:
    try:
        values = _build_campaign_values(payload)
    except Exception as exc:
        return {"ok": False, "status_code": 400, "code": "INVALID_CAMPAIGN", "message": str(exc)}

    with pg_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT campaign_id FROM access.campaigns WHERE campaign_id = %(campaign_id)s LIMIT 1",
                {"campaign_id": campaign_id},
            )
            if cur.fetchone() is None:
                conn.commit()
                return {"ok": False, "status_code": 404, "code": "CAMPAIGN_NOT_FOUND"}

            try:
                cur.execute(
                    """
                    UPDATE access.campaigns
                    SET slug = %(slug)s,
                        label = %(label)s,
                        kind = %(kind)s,
                        status = %(status)s,
                        trial_enabled = %(trial_enabled)s,
                        trial_plan_code = %(trial_plan_code)s,
                        trial_duration_days = %(trial_duration_days)s,
                        trial_grant_category = %(trial_grant_category)s,
                        allow_existing_users = %(allow_existing_users)s,
                        allow_previous_trial_users = %(allow_previous_trial_users)s,
                        allow_paid_upgrade_trial = %(allow_paid_upgrade_trial)s,
                        requires_approval = %(requires_approval)s,
                        starts_at_utc = %(starts_at_utc)s,
                        expires_at_utc = %(expires_at_utc)s,
                        max_redemptions = %(max_redemptions)s,
                        metadata_json = %(metadata_json)s::jsonb,
                        updated_at_utc = NOW()
                    WHERE campaign_id = %(campaign_id)s
                    """,
                    {
                        **values,
                        "campaign_id": campaign_id,
                        "metadata_json": json.dumps(values["metadata_json"], ensure_ascii=False),
                    },
                )
                _upsert_offer(cur, campaign_id=campaign_id, offer_payload=payload.get("offer"))
            except Exception as exc:
                conn.rollback()
                return {"ok": False, "status_code": 400, "code": "CAMPAIGN_UPDATE_FAILED", "message": str(exc)}

        conn.commit()

    return get_admin_access_campaign(campaign_id=campaign_id)


def patch_admin_access_campaign_status(*, campaign_id: int, status: str) -> Dict[str, Any]:
    safe_status = _normalize_status(status)

    with pg_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE access.campaigns
                SET status = %(status)s,
                    updated_at_utc = NOW()
                WHERE campaign_id = %(campaign_id)s
                RETURNING campaign_id
                """,
                {"campaign_id": campaign_id, "status": safe_status},
            )
            if cur.fetchone() is None:
                conn.commit()
                return {"ok": False, "status_code": 404, "code": "CAMPAIGN_NOT_FOUND"}
        conn.commit()

    return get_admin_access_campaign(campaign_id=campaign_id)