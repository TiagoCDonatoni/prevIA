from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, HTTPException, Request

from src.auth.service import get_auth_me_payload
from src.db.pg import pg_conn
from src.internal_access.service import ADMIN_ACCESS_CAPABILITY, actor_has_capability

router = APIRouter(prefix="/partner", tags=["partner-console"])

PARTNER_CONSOLE_STAFF_ACCESS_CAPABILITY = "partner.console.staff_access"
STAFF_ROLE_KEYS = {"staff_viewer", "staff_ops", "staff_admin"}

def _iso(value: Any) -> str | None:
    if value is None:
        return None
    if hasattr(value, "isoformat"):
        return value.isoformat().replace("+00:00", "Z")
    return str(value)


def _mask_email(email: Any) -> str | None:
    value = str(email or "").strip()
    if not value or "@" not in value:
        return None

    local, domain = value.split("@", 1)
    if not local or not domain:
        return None

    if len(local) <= 2:
        masked_local = local[0] + "***"
    else:
        masked_local = local[0] + "***" + local[-1]

    return f"{masked_local}@{domain}"


def _is_partner_console_staff(access_context: Dict[str, Any]) -> bool:
    role_keys = {
        str(item or "").strip()
        for item in (access_context.get("role_keys") or [])
        if str(item or "").strip()
    }

    return bool(
        role_keys & STAFF_ROLE_KEYS
        or actor_has_capability(access_context, ADMIN_ACCESS_CAPABILITY)
        or actor_has_capability(access_context, PARTNER_CONSOLE_STAFF_ACCESS_CAPABILITY)
    )


def _require_partner_actor(request: Request) -> Dict[str, Any]:
    auth_payload = get_auth_me_payload(request)

    if not auth_payload.get("is_authenticated"):
        raise HTTPException(
            status_code=401,
            detail={
                "ok": False,
                "code": "AUTH_REQUIRED",
                "message": "authentication required",
            },
        )

    user = auth_payload.get("user") or {}
    try:
        user_id = int(user.get("user_id"))
    except (TypeError, ValueError):
        user_id = 0

    if user_id <= 0:
        raise HTTPException(
            status_code=401,
            detail={
                "ok": False,
                "code": "AUTH_REQUIRED",
                "message": "authentication required",
            },
        )

    access_context = auth_payload.get("access") or {}

    return {
        "user_id": user_id,
        "is_staff": _is_partner_console_staff(access_context),
        "access": access_context,
        "auth_payload": auth_payload,
    }


def _partner_row_to_dict(row: tuple[Any, ...]) -> Dict[str, Any]:
    return {
        "partner_id": int(row[0]),
        "owner_user_id": int(row[1]),
        "display_name": row[2],
        "legal_name": row[3],
        "email": row[4],
        "status": row[5],
        "tier": row[6],
        "created_at_utc": _iso(row[7]),
        "updated_at_utc": _iso(row[8]),
    }


def _contract_row_to_dict(row: tuple[Any, ...] | None) -> Dict[str, Any] | None:
    if row is None:
        return None

    return {
        "contract_id": int(row[0]),
        "partner_id": int(row[1]),
        "status": row[2],
        "starts_at": str(row[3]) if row[3] is not None else None,
        "ends_at": str(row[4]) if row[4] is not None else None,
        "auto_renewal_enabled": bool(row[5]),
        "commission_rate": float(row[6]) if row[6] is not None else None,
        "commission_invoice_limit": int(row[7]) if row[7] is not None else None,
        "commission_base": row[8],
        "validation_days": int(row[9]) if row[9] is not None else None,
        "payout_minimum_amount": float(row[10]) if row[10] is not None else None,
        "terms_version": row[11],
        "commission_enabled": bool(row[12]),
        "commission_only_for_new_users": bool(row[13]),
        "commission_requires_paid_invoice": bool(row[14]),
        "commission_excludes_refunded_payments": bool(row[15]),
        "commission_excludes_disputed_payments": bool(row[16]),
        "commission_requires_active_subscription": bool(row[17]),
        "payout_frequency": row[18],
        "payout_currency": row[19],
        "payout_method": row[20],
        "signed_at_utc": _iso(row[21]),
        "created_at_utc": _iso(row[22]),
        "updated_at_utc": _iso(row[23]),
    }


def _campaign_row_to_dict(row: tuple[Any, ...]) -> Dict[str, Any]:
    slug = row[11]

    return {
        "link_id": int(row[0]),
        "partner_id": int(row[1]),
        "contract_id": int(row[2]),
        "campaign_id": int(row[3]),
        "status": row[4],
        "association_type": row[5],
        "label": row[6],
        "starts_at_utc": _iso(row[7]),
        "ends_at_utc": _iso(row[8]),
        "created_at_utc": _iso(row[9]),
        "updated_at_utc": _iso(row[10]),
        "campaign_slug": slug,
        "campaign_label": row[12],
        "campaign_kind": row[13],
        "campaign_status": row[14],
        "campaign_redeemed_count": int(row[15] or 0),
        "campaign_max_redemptions": int(row[16]) if row[16] is not None else None,
        "attributions_total": int(row[17] or 0),
        "attributions_active": int(row[18] or 0),
        "attributions_pending": int(row[19] or 0),
        "attributions_non_commissionable": int(row[20] or 0),
        "public_urls": {
            "pt": f"/pt/beta/{slug}",
            "en": f"/en/beta/{slug}",
            "es": f"/es/beta/{slug}",
        },
    }


def _attribution_row_to_dict(row: tuple[Any, ...]) -> Dict[str, Any]:
    full_name = str(row[13] or "").strip() or None
    masked_email = _mask_email(row[14])

    return {
        "attribution_id": int(row[0]),
        "partner_id": int(row[1]),
        "contract_id": int(row[2]),
        "partner_campaign_link_id": int(row[3]),
        "campaign_id": int(row[4]),
        "user_id": int(row[5]),
        "attributed_at": _iso(row[6]),
        "attribution_rule": row[7],
        "attribution_source": row[8],
        "status": row[9],
        "source_redemption_id": int(row[10]) if row[10] is not None else None,
        "created_at_utc": _iso(row[11]),
        "updated_at_utc": _iso(row[12]),
        "user_display_name": full_name,
        "user_email_masked": masked_email,
        "campaign_slug": row[15],
        "campaign_label": row[16],
        "campaign_kind": row[17],
        "source_redemption_status": row[18],
        "source_redeemed_at_utc": _iso(row[19]),
    }


def _fetch_partner_for_actor(
    cur,
    *,
    user_id: int,
    is_staff: bool,
    partner_id: int | None = None,
) -> Dict[str, Any]:
    if partner_id is not None:
        cur.execute(
            """
            SELECT
              p.id,
              p.owner_user_id,
              p.display_name,
              p.legal_name,
              p.email,
              p.status,
              p.tier,
              p.created_at_utc,
              p.updated_at_utc
            FROM partnership.partners p
            WHERE p.id = %(partner_id)s
              AND p.status = 'active'
              AND (
                %(is_staff)s = TRUE
                OR p.owner_user_id = %(user_id)s
              )
            LIMIT 1
            """,
            {
                "partner_id": partner_id,
                "user_id": user_id,
                "is_staff": is_staff,
            },
        )
        row = cur.fetchone()

        if row is None:
            raise HTTPException(
                status_code=403,
                detail={
                    "ok": False,
                    "code": "PARTNER_ACCESS_DENIED",
                    "message": "partner access denied",
                },
            )

        return _partner_row_to_dict(row)

    cur.execute(
        """
        SELECT
          p.id,
          p.owner_user_id,
          p.display_name,
          p.legal_name,
          p.email,
          p.status,
          p.tier,
          p.created_at_utc,
          p.updated_at_utc
        FROM partnership.partners p
        WHERE p.owner_user_id = %(user_id)s
          AND p.status = 'active'
        ORDER BY p.created_at_utc DESC, p.id DESC
        LIMIT 1
        """,
        {"user_id": user_id},
    )
    row = cur.fetchone()

    if row is not None:
        return _partner_row_to_dict(row)

    if is_staff:
        raise HTTPException(
            status_code=403,
            detail={
                "ok": False,
                "code": "PARTNER_STAFF_USE_BACKOFFICE",
                "message": "staff users should open partner dashboards from the admin backoffice",
            },
        )

    raise HTTPException(
        status_code=403,
        detail={
            "ok": False,
            "code": "PARTNER_ACCESS_DENIED",
            "message": "no active partner account is linked to this user",
        },
    )


def _fetch_active_contract(cur, *, partner_id: int) -> Dict[str, Any] | None:
    cur.execute(
        """
        SELECT
          id,
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
          signed_at_utc,
          created_at_utc,
          updated_at_utc
        FROM partnership.partner_contracts
        WHERE partner_id = %(partner_id)s
          AND status = 'active'
        ORDER BY starts_at DESC, id DESC
        LIMIT 1
        """,
        {"partner_id": partner_id},
    )
    return _contract_row_to_dict(cur.fetchone())


def _fetch_attribution_summary(cur, *, partner_id: int) -> Dict[str, int]:
    cur.execute(
        """
        SELECT
          COUNT(*)::bigint AS total,
          COUNT(*) FILTER (WHERE status = 'active')::bigint AS active,
          COUNT(*) FILTER (WHERE status = 'pending')::bigint AS pending,
          COUNT(*) FILTER (WHERE status = 'non_commissionable')::bigint AS non_commissionable,
          COUNT(*) FILTER (WHERE status = 'cancelled')::bigint AS cancelled,
          COUNT(*) FILTER (WHERE status = 'superseded')::bigint AS superseded
        FROM partnership.partner_attributions
        WHERE partner_id = %(partner_id)s
        """,
        {"partner_id": partner_id},
    )
    row = cur.fetchone() or (0, 0, 0, 0, 0, 0)

    return {
        "total": int(row[0] or 0),
        "active": int(row[1] or 0),
        "pending": int(row[2] or 0),
        "non_commissionable": int(row[3] or 0),
        "cancelled": int(row[4] or 0),
        "superseded": int(row[5] or 0),
    }


def _list_partner_campaigns(cur, *, partner_id: int) -> list[Dict[str, Any]]:
    cur.execute(
        """
        SELECT
          pcl.id,
          pcl.partner_id,
          pcl.contract_id,
          pcl.campaign_id,
          pcl.status,
          pcl.association_type,
          pcl.label,
          pcl.starts_at_utc,
          pcl.ends_at_utc,
          pcl.created_at_utc,
          pcl.updated_at_utc,
          c.slug,
          c.label,
          c.kind,
          c.status,
          c.redeemed_count,
          c.max_redemptions,
          COALESCE(pa_stats.total, 0) AS attributions_total,
          COALESCE(pa_stats.active, 0) AS attributions_active,
          COALESCE(pa_stats.pending, 0) AS attributions_pending,
          COALESCE(pa_stats.non_commissionable, 0) AS attributions_non_commissionable
        FROM partnership.partner_campaign_links pcl
        INNER JOIN access.campaigns c
          ON c.campaign_id = pcl.campaign_id
        LEFT JOIN LATERAL (
          SELECT
            COUNT(*)::bigint AS total,
            COUNT(*) FILTER (WHERE pa.status = 'active')::bigint AS active,
            COUNT(*) FILTER (WHERE pa.status = 'pending')::bigint AS pending,
            COUNT(*) FILTER (WHERE pa.status = 'non_commissionable')::bigint AS non_commissionable
          FROM partnership.partner_attributions pa
          WHERE pa.partner_campaign_link_id = pcl.id
        ) pa_stats ON TRUE
        WHERE pcl.partner_id = %(partner_id)s
        ORDER BY
          CASE pcl.status
            WHEN 'active' THEN 0
            WHEN 'paused' THEN 1
            WHEN 'ended' THEN 2
            ELSE 3
          END,
          pcl.created_at_utc DESC,
          pcl.id DESC
        """,
        {"partner_id": partner_id},
    )

    return [_campaign_row_to_dict(row) for row in cur.fetchall() or []]


def _list_partner_attributions(
    cur,
    *,
    partner_id: int,
    limit: int = 50,
) -> list[Dict[str, Any]]:
    safe_limit = max(1, min(int(limit or 50), 100))

    cur.execute(
        """
        SELECT
          pa.id,
          pa.partner_id,
          pa.contract_id,
          pa.partner_campaign_link_id,
          pa.campaign_id,
          pa.user_id,
          pa.attributed_at,
          pa.attribution_rule,
          pa.attribution_source,
          pa.status,
          pa.source_redemption_id,
          pa.created_at_utc,
          pa.updated_at_utc,
          u.full_name,
          u.email,
          c.slug,
          c.label,
          c.kind,
          r.status AS source_redemption_status,
          r.redeemed_at_utc AS source_redeemed_at_utc
        FROM partnership.partner_attributions pa
        LEFT JOIN app.users u
          ON u.user_id = pa.user_id
        LEFT JOIN access.campaigns c
          ON c.campaign_id = pa.campaign_id
        LEFT JOIN access.campaign_redemptions r
          ON r.redemption_id = pa.source_redemption_id
        WHERE pa.partner_id = %(partner_id)s
        ORDER BY pa.attributed_at DESC, pa.id DESC
        LIMIT %(limit)s
        """,
        {
            "partner_id": partner_id,
            "limit": safe_limit,
        },
    )

    return [_attribution_row_to_dict(row) for row in cur.fetchall() or []]


@router.get("/me")
def partner_console_me(request: Request):
    actor = _require_partner_actor(request)

    with pg_conn() as conn:
        with conn.cursor() as cur:
            partner = _fetch_partner_for_actor(
                cur,
                user_id=int(actor["user_id"]),
                is_staff=bool(actor["is_staff"]),
                partner_id=None,
            )
            partner_id = int(partner["partner_id"])
            active_contract = _fetch_active_contract(cur, partner_id=partner_id)
            attribution_summary = _fetch_attribution_summary(cur, partner_id=partner_id)
            campaigns = _list_partner_campaigns(cur, partner_id=partner_id)
            attributions = _list_partner_attributions(cur, partner_id=partner_id, limit=50)

    return {
        "ok": True,
        "partner": partner,
        "active_contract": active_contract,
        "attribution_summary": attribution_summary,
        "campaigns": campaigns,
        "attributions": attributions,
    }


@router.get("/campaigns")
def partner_console_campaigns(request: Request):
    actor = _require_partner_actor(request)

    with pg_conn() as conn:
        with conn.cursor() as cur:
            partner = _fetch_partner_for_actor(
                cur,
                user_id=int(actor["user_id"]),
                is_staff=bool(actor["is_staff"]),
                partner_id=None,
            )
            campaigns = _list_partner_campaigns(cur, partner_id=int(partner["partner_id"]))

    return {
        "ok": True,
        "partner": partner,
        "campaigns": campaigns,
    }


@router.get("/attributions")
def partner_console_attributions(request: Request, limit: int = 50):
    actor = _require_partner_actor(request)

    with pg_conn() as conn:
        with conn.cursor() as cur:
            partner = _fetch_partner_for_actor(
                cur,
                user_id=int(actor["user_id"]),
                is_staff=bool(actor["is_staff"]),
                partner_id=None,
            )
            attribution_summary = _fetch_attribution_summary(
                cur,
                partner_id=int(partner["partner_id"]),
            )
            attributions = _list_partner_attributions(
                cur,
                partner_id=int(partner["partner_id"]),
                limit=limit,
            )

    return {
        "ok": True,
        "partner": partner,
        "attribution_summary": attribution_summary,
        "attributions": attributions,
    }