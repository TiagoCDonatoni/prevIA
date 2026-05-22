from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Any, Dict, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query

from src.db.pg import pg_conn
from src.internal_access.guards import require_admin_access

router = APIRouter(
    prefix="/admin/partners/applications",
    tags=["admin-partner-applications"],
    dependencies=[Depends(require_admin_access)],
)

APPLICATION_STATUSES = {
    "new",
    "under_review",
    "contacted",
    "approved",
    "rejected",
    "converted",
    "archived",
}

PARTNER_TIERS = {"founding", "premium", "standard", "watchlist"}
PAYOUT_FREQUENCIES = {"manual", "monthly", "quarterly"}

PAYOUT_METHODS = {
    "manual_pix",
    "manual_bank_transfer",
    "manual_other",
    "platform_later",
}

def _int_or_none(raw: Any) -> int | None:
    if raw is None or raw == "":
        return None

    try:
        value = int(raw)
    except (TypeError, ValueError):
        return None

    return value if value > 0 else None


def _parse_date_or_default(raw: Any, *, default: date) -> date:
    if raw is None or raw == "":
        return default

    if isinstance(raw, date):
        return raw

    try:
        return date.fromisoformat(str(raw).strip()[:10])
    except Exception:
        raise HTTPException(status_code=400, detail="invalid date")


def _one_year_after(value: date) -> date:
    try:
        return value.replace(year=value.year + 1)
    except ValueError:
        return value.replace(year=value.year + 1, month=2, day=28)


def _safe_partner_tier(raw: Any) -> str:
    value = str(raw or "founding").strip().lower()
    if value not in PARTNER_TIERS:
        raise HTTPException(status_code=400, detail="invalid partner tier")
    return value


def _safe_float(
    raw: Any,
    *,
    default: float,
    minimum: float,
    maximum: float,
    field_name: str,
) -> float:
    if raw is None or raw == "":
        value = default
    else:
        try:
            value = float(raw)
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail=f"invalid {field_name}")

    if value < minimum or value > maximum:
        raise HTTPException(status_code=400, detail=f"invalid {field_name}")

    return value


def _safe_int(
    raw: Any,
    *,
    default: int,
    minimum: int,
    maximum: int,
    field_name: str,
) -> int:
    if raw is None or raw == "":
        value = default
    else:
        try:
            value = int(raw)
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail=f"invalid {field_name}")

    if value < minimum or value > maximum:
        raise HTTPException(status_code=400, detail=f"invalid {field_name}")

    return value


def _safe_bool(raw: Any, *, default: bool) -> bool:
    if raw is None or raw == "":
        return default

    if isinstance(raw, bool):
        return raw

    value = str(raw).strip().lower()
    if value in {"1", "true", "yes", "sim", "on"}:
        return True
    if value in {"0", "false", "no", "nao", "não", "off"}:
        return False

    raise HTTPException(status_code=400, detail="invalid boolean value")


def _safe_text(
    raw: Any,
    *,
    default: str | None = None,
    max_length: int,
    field_name: str,
    uppercase: bool = False,
) -> str | None:
    if raw is None:
        return default

    value = str(raw).strip()
    if not value:
        return default

    if uppercase:
        value = value.upper()

    if len(value) > max_length:
        raise HTTPException(status_code=400, detail=f"{field_name} too long")

    return value


def _safe_choice(
    raw: Any,
    *,
    default: str,
    allowed: set[str],
    field_name: str,
) -> str:
    value = str(raw or default).strip().lower()
    if value not in allowed:
        raise HTTPException(status_code=400, detail=f"invalid {field_name}")
    return value


def _safe_currency(raw: Any, *, default: str = "BRL") -> str:
    value = str(raw or default).strip().upper()
    if len(value) != 3 or not value.isalpha():
        raise HTTPException(status_code=400, detail="invalid payout_currency")
    return value


def _parse_datetime_or_none(raw: Any) -> datetime | None:
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
        try:
            value = datetime.fromisoformat(text)
        except Exception:
            raise HTTPException(status_code=400, detail="invalid signed_at_utc")

    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)

    return value.astimezone(timezone.utc)

def _fetch_owner_user(
    cur,
    *,
    owner_user_id: int | None,
    email: str,
) -> Dict[str, Any]:
    if owner_user_id is not None:
        cur.execute(
            """
            SELECT user_id, email, full_name
            FROM app.users
            WHERE user_id = %(user_id)s
              AND status <> 'deleted'
            LIMIT 1
            """,
            {"user_id": owner_user_id},
        )
    else:
        cur.execute(
            """
            SELECT user_id, email, full_name
            FROM app.users
            WHERE email_normalized = lower(%(email)s)
              AND status <> 'deleted'
            LIMIT 1
            """,
            {"email": email},
        )

    row = cur.fetchone()
    if row is None:
        raise HTTPException(
            status_code=400,
            detail="owner user not found. Create or select an existing prevIA account first.",
        )

    return {
        "user_id": int(row[0]),
        "email": row[1],
        "full_name": row[2],
    }


def _iso(value: Any) -> str | None:
    if value is None:
        return None
    if hasattr(value, "isoformat"):
        return value.isoformat().replace("+00:00", "Z")
    return str(value)


def _actor_user_id_or_none(actor: Dict[str, Any]) -> int | None:
    user = actor.get("user") or {}
    raw_user_id = user.get("user_id")

    try:
        user_id = int(raw_user_id)
    except (TypeError, ValueError):
        return None

    if user_id <= 0:
        return None

    return user_id


def _normalize_status(raw: Any, *, allow_empty: bool = False) -> str:
    value = str(raw or "").strip().lower()
    if allow_empty and not value:
        return ""

    if value not in APPLICATION_STATUSES:
        raise HTTPException(status_code=400, detail="invalid partner application status")

    return value


def _row_to_application(row: tuple[Any, ...]) -> Dict[str, Any]:
    return {
        "id": int(row[0]),
        "full_name": row[1],
        "public_name": row[2],
        "email": row[3],
        "whatsapp": row[4],
        "lang": row[5],
        "main_social_platform": row[6],
        "main_social_url": row[7],
        "audience_size_range": row[8],
        "content_type": row[9],
        "promotion_plan": row[10],
        "other_social_urls": row[11],
        "city_state": row[12],
        "media_kit_url": row[13],
        "notes": row[14],
        "accepted_responsible_disclosure": bool(row[15]),
        "accepted_no_profit_promises": bool(row[16]),
        "accepted_not_guaranteed_approval": bool(row[17]),
        "accepted_contact": bool(row[18]),
        "status": row[19],
        "admin_notes": row[20],
        "reviewed_by_user_id": int(row[21]) if row[21] is not None else None,
        "reviewed_by_email": row[22],
        "reviewed_at_utc": _iso(row[23]),
        "converted_partner_id": int(row[24]) if row[24] is not None else None,
        "source": row[25],
        "email_notification_sent": bool(row[26]),
        "email_notification_error": row[27],
        "created_at_utc": _iso(row[28]),
        "updated_at_utc": _iso(row[29]),
    }


APPLICATION_SELECT_SQL = """
SELECT
    p.id,
    p.full_name,
    p.public_name,
    p.email,
    p.whatsapp,
    p.lang,
    p.main_social_platform,
    p.main_social_url,
    p.audience_size_range,
    p.content_type,
    p.promotion_plan,
    p.other_social_urls,
    p.city_state,
    p.media_kit_url,
    p.notes,
    p.accepted_responsible_disclosure,
    p.accepted_no_profit_promises,
    p.accepted_not_guaranteed_approval,
    p.accepted_contact,
    p.status,
    p.admin_notes,
    p.reviewed_by_user_id,
    reviewer.email AS reviewed_by_email,
    p.reviewed_at_utc,
    p.converted_partner_id,
    p.source,
    p.email_notification_sent,
    p.email_notification_error,
    p.created_at_utc,
    p.updated_at_utc
FROM partnership.partner_applications p
LEFT JOIN app.users reviewer
  ON reviewer.user_id = p.reviewed_by_user_id
"""


def _fetch_application(cur, *, application_id: int) -> Dict[str, Any]:
    cur.execute(
        APPLICATION_SELECT_SQL
        + """
WHERE p.id = %(application_id)s
LIMIT 1
""",
        {"application_id": application_id},
    )
    row = cur.fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="partner application not found")

    return _row_to_application(row)


@router.get("")
def admin_list_partner_applications(
    q: str = Query(default="", max_length=160),
    status: str = Query(default=""),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
):
    qq = str(q or "").strip()
    normalized_status = _normalize_status(status, allow_empty=True)
    fetch_limit = limit + 1

    with pg_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                APPLICATION_SELECT_SQL
                + """
WHERE (%(status)s = '' OR p.status = %(status)s)
  AND (
    %(q)s = ''
    OR p.full_name ILIKE %(pattern)s
    OR p.public_name ILIKE %(pattern)s
    OR p.email ILIKE %(pattern)s
    OR p.whatsapp ILIKE %(pattern)s
    OR p.main_social_url ILIKE %(pattern)s
  )
ORDER BY p.created_at_utc DESC, p.id DESC
LIMIT %(fetch_limit)s
OFFSET %(offset)s
""",
                {
                    "status": normalized_status,
                    "q": qq,
                    "pattern": f"%{qq}%",
                    "fetch_limit": fetch_limit,
                    "offset": offset,
                },
            )
            raw_rows = cur.fetchall() or []

    has_more = len(raw_rows) > limit
    rows = raw_rows[:limit]

    return {
        "ok": True,
        "items": [_row_to_application(row) for row in rows],
        "count": len(rows),
        "has_more": has_more,
        "limit": limit,
        "offset": offset,
        "next_offset": offset + limit if has_more else None,
        "previous_offset": max(0, offset - limit) if offset > 0 else None,
        "filters": {
            "q": qq,
            "status": normalized_status,
        },
    }


@router.get("/{application_id}")
def admin_get_partner_application(application_id: int):
    with pg_conn() as conn:
        with conn.cursor() as cur:
            application = _fetch_application(cur, application_id=application_id)

    return {"ok": True, "application": application}


@router.patch("/{application_id}")
def admin_update_partner_application(
    application_id: int,
    payload: Dict[str, Any] = Body(...),
    actor: Dict[str, Any] = Depends(require_admin_access),
):
    actor_user_id = _actor_user_id_or_none(actor)

    status_provided = "status" in payload
    admin_notes_provided = "admin_notes" in payload

    if not status_provided and not admin_notes_provided:
        raise HTTPException(status_code=400, detail="nothing to update")

    next_status: Optional[str] = None
    if status_provided:
        next_status = _normalize_status(payload.get("status"))

    next_admin_notes: Optional[str] = None
    if admin_notes_provided:
        raw_notes = payload.get("admin_notes")
        next_admin_notes = str(raw_notes or "").strip() or None
        if next_admin_notes is not None and len(next_admin_notes) > 5000:
            raise HTTPException(status_code=400, detail="admin notes too long")

    with pg_conn() as conn:
        with conn.cursor() as cur:
            before = _fetch_application(cur, application_id=application_id)

            cur.execute(
                """
                UPDATE partnership.partner_applications
                SET
                    status = CASE
                        WHEN %(status_provided)s::boolean THEN %(next_status)s::text
                        ELSE status
                    END,
                    admin_notes = CASE
                        WHEN %(admin_notes_provided)s::boolean THEN %(next_admin_notes)s::text
                        ELSE admin_notes
                    END,
                    reviewed_by_user_id = COALESCE(
                        %(actor_user_id)s::bigint,
                        reviewed_by_user_id
                    ),
                    reviewed_at_utc = NOW(),
                    updated_at_utc = NOW()
                WHERE id = %(application_id)s
                """,
                {
                    "application_id": application_id,
                    "status_provided": status_provided,
                    "next_status": next_status,
                    "admin_notes_provided": admin_notes_provided,
                    "next_admin_notes": next_admin_notes,
                    "actor_user_id": actor_user_id,
                },
            )

            after = _fetch_application(cur, application_id=application_id)
            conn.commit()

    return {
        "ok": True,
        "application": after,
        "before": {
            "status": before["status"],
            "admin_notes": before["admin_notes"],
        },
    }

@router.post("/{application_id}/convert")
def admin_convert_partner_application(
    application_id: int,
    payload: Optional[Dict[str, Any]] = Body(default=None),
    actor: Dict[str, Any] = Depends(require_admin_access),
):
    payload = payload or {}
    actor_user_id = _actor_user_id_or_none(actor)

    requested_owner_user_id = _int_or_none(payload.get("owner_user_id"))
    tier = _safe_partner_tier(payload.get("tier"))

    starts_at = _parse_date_or_default(payload.get("starts_at"), default=date.today())
    ends_at = _parse_date_or_default(payload.get("ends_at"), default=_one_year_after(starts_at))

    if ends_at <= starts_at:
        raise HTTPException(status_code=400, detail="contract ends_at must be after starts_at")

    commission_rate = _safe_float(
        payload.get("commission_rate"),
        default=0.5,
        minimum=0,
        maximum=1,
        field_name="commission_rate",
    )
    commission_invoice_limit = _safe_int(
        payload.get("commission_invoice_limit"),
        default=3,
        minimum=0,
        maximum=36,
        field_name="commission_invoice_limit",
    )
    validation_days = _safe_int(
        payload.get("validation_days"),
        default=35,
        minimum=0,
        maximum=365,
        field_name="validation_days",
    )
    payout_minimum_amount = _safe_float(
        payload.get("payout_minimum_amount"),
        default=100.0,
        minimum=0,
        maximum=100000,
        field_name="payout_minimum_amount",
    )

    commission_enabled = _safe_bool(
        payload.get("commission_enabled"),
        default=True,
    )
    commission_only_for_new_users = _safe_bool(
        payload.get("commission_only_for_new_users"),
        default=True,
    )
    commission_requires_paid_invoice = _safe_bool(
        payload.get("commission_requires_paid_invoice"),
        default=True,
    )
    commission_excludes_refunded_payments = _safe_bool(
        payload.get("commission_excludes_refunded_payments"),
        default=True,
    )
    commission_excludes_disputed_payments = _safe_bool(
        payload.get("commission_excludes_disputed_payments"),
        default=True,
    )
    commission_requires_active_subscription = _safe_bool(
        payload.get("commission_requires_active_subscription"),
        default=False,
    )
    payout_frequency = _safe_choice(
        payload.get("payout_frequency"),
        default="monthly",
        allowed=PAYOUT_FREQUENCIES,
        field_name="payout_frequency",
    )
    payout_currency = _safe_currency(payload.get("payout_currency"), default="BRL")
    payout_method = _safe_choice(
        payload.get("payout_method"),
        default="manual_pix",
        allowed=PAYOUT_METHODS,
        field_name="payout_method",
    )
    contract_file_url = _safe_text(
        payload.get("contract_file_url"),
        default=None,
        max_length=1000,
        field_name="contract_file_url",
    )
    signed_at_utc = _parse_datetime_or_none(payload.get("signed_at_utc"))
    commercial_notes = _safe_text(
        payload.get("commercial_notes"),
        default=None,
        max_length=5000,
        field_name="commercial_notes",
    )

    terms_version = str(payload.get("terms_version") or "partner_terms_v1").strip()
    if not terms_version or len(terms_version) > 80:
        raise HTTPException(status_code=400, detail="invalid terms_version")

    with pg_conn() as conn:
        with conn.cursor() as cur:
            application = _fetch_application(cur, application_id=application_id)

            if application["status"] == "converted":
                raise HTTPException(status_code=409, detail="partner application already converted")

            if application["status"] != "approved":
                raise HTTPException(
                    status_code=400,
                    detail="partner application must be approved before conversion",
                )

            owner_user = _fetch_owner_user(
                cur,
                owner_user_id=requested_owner_user_id,
                email=str(application["email"] or ""),
            )

            display_name = str(payload.get("display_name") or application["public_name"] or "").strip()
            if not display_name:
                raise HTTPException(status_code=400, detail="display_name is required")

            if len(display_name) > 160:
                raise HTTPException(status_code=400, detail="display_name too long")

            cur.execute(
                """
                SELECT id, status
                FROM partnership.partners
                WHERE owner_user_id = %(owner_user_id)s
                LIMIT 1
                """,
                {"owner_user_id": owner_user["user_id"]},
            )
            existing_partner = cur.fetchone()
            if existing_partner is not None:
                raise HTTPException(
                    status_code=409,
                    detail={
                        "ok": False,
                        "code": "OWNER_ALREADY_HAS_PARTNER",
                        "message": "owner user already has a partner record",
                        "partner_id": int(existing_partner[0]),
                        "status": existing_partner[1],
                    },
                )

            cur.execute(
                """
                INSERT INTO partnership.partners (
                    owner_user_id,
                    display_name,
                    email,
                    status,
                    tier,
                    created_from_application_id,
                    created_by_user_id
                )
                VALUES (
                    %(owner_user_id)s,
                    %(display_name)s,
                    %(email)s,
                    'active',
                    %(tier)s,
                    %(application_id)s,
                    %(created_by_user_id)s
                )
                RETURNING id, created_at_utc
                """,
                {
                    "owner_user_id": owner_user["user_id"],
                    "display_name": display_name,
                    "email": owner_user["email"],
                    "tier": tier,
                    "application_id": application_id,
                    "created_by_user_id": actor_user_id,
                },
            )
            partner_row = cur.fetchone()
            partner_id = int(partner_row[0])
            partner_created_at_utc = partner_row[1]

            cur.execute(
                """
                INSERT INTO partnership.partner_contracts (
                    partner_id,
                    status,
                    starts_at,
                    ends_at,
                    auto_renewal_enabled,
                    commission_rate,
                    commission_invoice_limit,
                    commission_base,
                    validation_days,
                    payout_minimum_amount,
                    terms_version,
                    commission_enabled,
                    commission_only_for_new_users,
                    commission_requires_paid_invoice,
                    commission_excludes_refunded_payments,
                    commission_excludes_disputed_payments,
                    commission_requires_active_subscription,
                    payout_frequency,
                    payout_currency,
                    payout_method,
                    contract_file_url,
                    signed_at_utc,
                    commercial_notes,
                    created_by_user_id
                )
                VALUES (
                    %(partner_id)s,
                    'active',
                    %(starts_at)s,
                    %(ends_at)s,
                    %(auto_renewal_enabled)s,
                    %(commission_rate)s,
                    %(commission_invoice_limit)s,
                    'net_revenue',
                    %(validation_days)s,
                    %(payout_minimum_amount)s,
                    %(terms_version)s,
                    %(commission_enabled)s,
                    %(commission_only_for_new_users)s,
                    %(commission_requires_paid_invoice)s,
                    %(commission_excludes_refunded_payments)s,
                    %(commission_excludes_disputed_payments)s,
                    %(commission_requires_active_subscription)s,
                    %(payout_frequency)s,
                    %(payout_currency)s,
                    %(payout_method)s,
                    %(contract_file_url)s,
                    %(signed_at_utc)s,
                    %(commercial_notes)s,
                    %(created_by_user_id)s
                )
                RETURNING id
                """,
                {
                    "partner_id": partner_id,
                    "starts_at": starts_at,
                    "ends_at": ends_at,
                    "auto_renewal_enabled": bool(payload.get("auto_renewal_enabled", True)),
                    "commission_rate": commission_rate,
                    "commission_invoice_limit": commission_invoice_limit,
                    "validation_days": validation_days,
                    "payout_minimum_amount": payout_minimum_amount,
                    "terms_version": terms_version,
                    "commission_enabled": commission_enabled,
                    "commission_only_for_new_users": commission_only_for_new_users,
                    "commission_requires_paid_invoice": commission_requires_paid_invoice,
                    "commission_excludes_refunded_payments": commission_excludes_refunded_payments,
                    "commission_excludes_disputed_payments": commission_excludes_disputed_payments,
                    "commission_requires_active_subscription": commission_requires_active_subscription,
                    "payout_frequency": payout_frequency,
                    "payout_currency": payout_currency,
                    "payout_method": payout_method,
                    "contract_file_url": contract_file_url,
                    "signed_at_utc": signed_at_utc,
                    "commercial_notes": commercial_notes,
                    "created_by_user_id": actor_user_id,
                },
            )
            contract_id = int(cur.fetchone()[0])

            cur.execute(
                """
                UPDATE partnership.partner_applications
                SET
                    status = 'converted',
                    converted_partner_id = %(partner_id)s::bigint,
                    reviewed_by_user_id = COALESCE(
                        %(actor_user_id)s::bigint,
                        reviewed_by_user_id
                    ),
                    reviewed_at_utc = NOW(),
                    updated_at_utc = NOW()
                WHERE id = %(application_id)s
                """,
                {
                    "application_id": application_id,
                    "partner_id": partner_id,
                    "actor_user_id": actor_user_id,
                },
            )

            cur.execute(
                """
                INSERT INTO partnership.partner_audit_events (
                    partner_id,
                    actor_user_id,
                    event_type,
                    payload_json
                )
                VALUES (
                    %(partner_id)s,
                    %(actor_user_id)s,
                    'partner_converted_from_application',
                    %(payload_json)s::jsonb
                )
                """,
                {
                    "partner_id": partner_id,
                    "actor_user_id": actor_user_id,
                    "payload_json": __import__("json").dumps(
                        {
                            "application_id": application_id,
                            "owner_user_id": owner_user["user_id"],
                            "display_name": display_name,
                            "tier": tier,
                            "contract_id": contract_id,
                            "starts_at": str(starts_at),
                            "ends_at": str(ends_at),
                            "commission_rate": commission_rate,
                            "commission_invoice_limit": commission_invoice_limit,
                            "validation_days": validation_days,
                            "commission_enabled": commission_enabled,
                            "commission_only_for_new_users": commission_only_for_new_users,
                            "commission_requires_paid_invoice": commission_requires_paid_invoice,
                            "commission_excludes_refunded_payments": commission_excludes_refunded_payments,
                            "commission_excludes_disputed_payments": commission_excludes_disputed_payments,
                            "commission_requires_active_subscription": commission_requires_active_subscription,
                            "payout_frequency": payout_frequency,
                            "payout_currency": payout_currency,
                            "payout_method": payout_method,
                            "contract_file_url": contract_file_url,
                            "signed_at_utc": _iso(signed_at_utc),
                        }
                    ),
                },
            )

            updated_application = _fetch_application(cur, application_id=application_id)
            conn.commit()

    return {
        "ok": True,
        "partner": {
            "partner_id": partner_id,
            "owner_user_id": owner_user["user_id"],
            "owner_email": owner_user["email"],
            "display_name": display_name,
            "status": "active",
            "tier": tier,
            "created_at_utc": _iso(partner_created_at_utc),
        },
        "contract": {
            "contract_id": contract_id,
            "status": "active",
            "starts_at": str(starts_at),
            "ends_at": str(ends_at),
            "commission_rate": commission_rate,
            "commission_invoice_limit": commission_invoice_limit,
            "commission_base": "net_revenue",
            "validation_days": validation_days,
            "payout_minimum_amount": payout_minimum_amount,
            "terms_version": terms_version,
            "commission_enabled": commission_enabled,
            "commission_only_for_new_users": commission_only_for_new_users,
            "commission_requires_paid_invoice": commission_requires_paid_invoice,
            "commission_excludes_refunded_payments": commission_excludes_refunded_payments,
            "commission_excludes_disputed_payments": commission_excludes_disputed_payments,
            "commission_requires_active_subscription": commission_requires_active_subscription,
            "payout_frequency": payout_frequency,
            "payout_currency": payout_currency,
            "payout_method": payout_method,
            "contract_file_url": contract_file_url,
            "signed_at_utc": _iso(signed_at_utc),
            "commercial_notes": commercial_notes,
        },
        "application": updated_application,
    }