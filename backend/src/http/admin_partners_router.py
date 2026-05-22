from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from fastapi import APIRouter, Body, Depends, HTTPException

from src.db.pg import pg_conn
from src.internal_access.guards import require_admin_access

router = APIRouter(
    prefix="/admin/partners",
    tags=["admin-partners"],
    dependencies=[Depends(require_admin_access)],
)

LINK_STATUSES = {"active", "paused", "ended", "transferred", "disabled"}

ASSOCIATION_TYPES = {
    "primary",
    "special",
    "seasonal",
    "youtube",
    "instagram",
    "tiktok",
    "newsletter",
    "community",
    "event",
    "manual",
}


def _iso(value: Any) -> str | None:
    if value is None:
        return None

    if hasattr(value, "isoformat"):
        return value.isoformat().replace("+00:00", "Z")

    return str(value)


def _parse_int(raw: Any, *, field_name: str, required: bool = False) -> int | None:
    if raw is None or raw == "":
        if required:
            raise HTTPException(status_code=400, detail=f"{field_name} is required")
        return None

    try:
        value = int(raw)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail=f"invalid {field_name}")

    if value <= 0:
        raise HTTPException(status_code=400, detail=f"invalid {field_name}")

    return value


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
        try:
            value = datetime.fromisoformat(text)
        except Exception:
            raise HTTPException(status_code=400, detail="invalid datetime")

    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)

    return value.astimezone(timezone.utc)


def _actor_user_id_or_none(actor: Dict[str, Any]) -> int | None:
    user = actor.get("user") or {}
    raw_user_id = user.get("user_id")

    try:
        user_id = int(raw_user_id)
    except (TypeError, ValueError):
        return None

    return user_id if user_id > 0 else None


def _normalize_association_type(raw: Any) -> str:
    value = str(raw or "primary").strip().lower()
    if value not in ASSOCIATION_TYPES:
        raise HTTPException(status_code=400, detail="invalid association_type")
    return value


def _normalize_link_status(raw: Any) -> str:
    value = str(raw or "").strip().lower()
    if value not in LINK_STATUSES:
        raise HTTPException(status_code=400, detail="invalid link status")
    return value


def _partner_row_to_dict(row: tuple[Any, ...]) -> Dict[str, Any]:
    return {
        "partner_id": int(row[0]),
        "owner_user_id": int(row[1]),
        "display_name": row[2],
        "email": row[3],
        "status": row[4],
        "tier": row[5],
        "created_from_application_id": int(row[6]) if row[6] is not None else None,
        "created_at_utc": _iso(row[7]),
        "updated_at_utc": _iso(row[8]),
        "owner_email": row[9],
        "owner_full_name": row[10],
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
        "contract_file_url": row[21],
        "signed_at_utc": _iso(row[22]),
        "commercial_notes": row[23],
        "created_at_utc": _iso(row[24]),
        "updated_at_utc": _iso(row[25]),
    }


def _campaign_link_row_to_dict(row: tuple[Any, ...]) -> Dict[str, Any]:
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
        "campaign_slug": row[11],
        "campaign_label": row[12],
        "campaign_kind": row[13],
        "campaign_status": row[14],
        "campaign_redeemed_count": int(row[15] or 0),
        "campaign_max_redemptions": row[16],
        "public_url_path": f"/pt/beta/{row[11]}",
    }


def _partner_attribution_row_to_dict(row: tuple[Any, ...]) -> Dict[str, Any]:
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
        "user_email": row[13],
        "user_full_name": row[14],
        "campaign_slug": row[15],
        "campaign_label": row[16],
        "campaign_kind": row[17],
        "source_redemption_status": row[18],
        "source_redeemed_at_utc": _iso(row[19]),
    }


def _fetch_partner(cur, *, partner_id: int) -> Dict[str, Any]:
    cur.execute(
        """
        SELECT
          p.id,
          p.owner_user_id,
          p.display_name,
          p.email,
          p.status,
          p.tier,
          p.created_from_application_id,
          p.created_at_utc,
          p.updated_at_utc,
          u.email AS owner_email,
          u.full_name AS owner_full_name
        FROM partnership.partners p
        LEFT JOIN app.users u
          ON u.user_id = p.owner_user_id
        WHERE p.id = %(partner_id)s
        LIMIT 1
        """,
        {"partner_id": partner_id},
    )
    row = cur.fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="partner not found")

    return _partner_row_to_dict(row)


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
          contract_file_url,
          signed_at_utc,
          commercial_notes,
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


def _fetch_contract(cur, *, partner_id: int, contract_id: int) -> Dict[str, Any]:
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
          contract_file_url,
          signed_at_utc,
          commercial_notes,
          created_at_utc,
          updated_at_utc
        FROM partnership.partner_contracts
        WHERE id = %(contract_id)s
          AND partner_id = %(partner_id)s
        LIMIT 1
        """,
        {
            "partner_id": partner_id,
            "contract_id": contract_id,
        },
    )
    row = cur.fetchone()
    contract = _contract_row_to_dict(row)
    if contract is None:
        raise HTTPException(status_code=404, detail="partner contract not found")

    return contract


def _fetch_campaign(cur, *, campaign_id: int) -> Dict[str, Any]:
    cur.execute(
        """
        SELECT campaign_id, slug, label, kind, status
        FROM access.campaigns
        WHERE campaign_id = %(campaign_id)s
        LIMIT 1
        """,
        {"campaign_id": campaign_id},
    )
    row = cur.fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="campaign not found")

    return {
        "campaign_id": int(row[0]),
        "slug": row[1],
        "label": row[2],
        "kind": row[3],
        "status": row[4],
    }


def _list_campaign_links(cur, *, partner_id: int) -> list[Dict[str, Any]]:
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
          c.max_redemptions
        FROM partnership.partner_campaign_links pcl
        INNER JOIN access.campaigns c
          ON c.campaign_id = pcl.campaign_id
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

    return [_campaign_link_row_to_dict(row) for row in cur.fetchall() or []]


def _fetch_partner_attribution_summary(cur, *, partner_id: int) -> Dict[str, int]:
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
          u.email,
          u.full_name,
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

    return [_partner_attribution_row_to_dict(row) for row in cur.fetchall() or []]


def _fetch_campaign_link(cur, *, partner_id: int, link_id: int) -> Dict[str, Any]:
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
          c.max_redemptions
        FROM partnership.partner_campaign_links pcl
        INNER JOIN access.campaigns c
          ON c.campaign_id = pcl.campaign_id
        WHERE pcl.partner_id = %(partner_id)s
          AND pcl.id = %(link_id)s
        LIMIT 1
        """,
        {
            "partner_id": partner_id,
            "link_id": link_id,
        },
    )
    row = cur.fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="partner campaign link not found")

    return _campaign_link_row_to_dict(row)


def _partner_detail(cur, *, partner_id: int) -> Dict[str, Any]:
    partner = _fetch_partner(cur, partner_id=partner_id)
    active_contract = _fetch_active_contract(cur, partner_id=partner_id)
    campaign_links = _list_campaign_links(cur, partner_id=partner_id)
    attribution_summary = _fetch_partner_attribution_summary(cur, partner_id=partner_id)
    attributions = _list_partner_attributions(cur, partner_id=partner_id, limit=50)

    return {
        "partner": partner,
        "active_contract": active_contract,
        "campaign_links": campaign_links,
        "attribution_summary": attribution_summary,
        "attributions": attributions,
    }


@router.get("/{partner_id}")
def admin_get_partner(partner_id: int):
    with pg_conn() as conn:
        with conn.cursor() as cur:
            detail = _partner_detail(cur, partner_id=partner_id)

    return {"ok": True, **detail}


@router.get("/{partner_id}/campaign-links")
def admin_list_partner_campaign_links(partner_id: int):
    with pg_conn() as conn:
        with conn.cursor() as cur:
            _fetch_partner(cur, partner_id=partner_id)
            active_contract = _fetch_active_contract(cur, partner_id=partner_id)
            campaign_links = _list_campaign_links(cur, partner_id=partner_id)

    return {
        "ok": True,
        "active_contract": active_contract,
        "campaign_links": campaign_links,
    }


@router.post("/{partner_id}/campaign-links")
def admin_create_partner_campaign_link(
    partner_id: int,
    payload: Dict[str, Any] = Body(...),
    actor: Dict[str, Any] = Depends(require_admin_access),
):
    actor_user_id = _actor_user_id_or_none(actor)

    campaign_id = _parse_int(payload.get("campaign_id"), field_name="campaign_id", required=True)
    requested_contract_id = _parse_int(payload.get("contract_id"), field_name="contract_id", required=False)

    association_type = _normalize_association_type(payload.get("association_type"))
    label = str(payload.get("label") or "").strip() or None
    starts_at_utc = _parse_datetime(payload.get("starts_at_utc"))
    ends_at_utc = _parse_datetime(payload.get("ends_at_utc"))

    if starts_at_utc and ends_at_utc and ends_at_utc <= starts_at_utc:
        raise HTTPException(status_code=400, detail="ends_at_utc must be after starts_at_utc")

    with pg_conn() as conn:
        with conn.cursor() as cur:
            partner = _fetch_partner(cur, partner_id=partner_id)

            if partner["status"] != "active":
                raise HTTPException(
                    status_code=400,
                    detail="partner must be active before linking campaigns",
                )

            if requested_contract_id is not None:
                contract = _fetch_contract(
                    cur,
                    partner_id=partner_id,
                    contract_id=requested_contract_id,
                )
            else:
                contract = _fetch_active_contract(cur, partner_id=partner_id)

            if contract is None or contract["status"] != "active":
                raise HTTPException(
                    status_code=400,
                    detail="partner must have an active contract before linking campaigns",
                )

            campaign = _fetch_campaign(cur, campaign_id=campaign_id)

            cur.execute(
                """
                SELECT
                  pcl.id,
                  pcl.partner_id,
                  p.display_name,
                  pcl.status
                FROM partnership.partner_campaign_links pcl
                INNER JOIN partnership.partners p
                  ON p.id = pcl.partner_id
                WHERE pcl.campaign_id = %(campaign_id)s
                  AND pcl.status IN ('active', 'paused')
                LIMIT 1
                """,
                {"campaign_id": campaign_id},
            )
            existing = cur.fetchone()
            if existing is not None:
                raise HTTPException(
                    status_code=409,
                    detail={
                        "ok": False,
                        "code": "CAMPAIGN_ALREADY_LINKED",
                        "message": "campaign is already linked to a partner",
                        "link_id": int(existing[0]),
                        "partner_id": int(existing[1]),
                        "partner_display_name": existing[2],
                        "status": existing[3],
                    },
                )

            cur.execute(
                """
                INSERT INTO partnership.partner_campaign_links (
                  partner_id,
                  contract_id,
                  campaign_id,
                  status,
                  association_type,
                  label,
                  starts_at_utc,
                  ends_at_utc,
                  created_by_user_id
                )
                VALUES (
                  %(partner_id)s::bigint,
                  %(contract_id)s::bigint,
                  %(campaign_id)s::bigint,
                  'active',
                  %(association_type)s::text,
                  %(label)s::text,
                  COALESCE(%(starts_at_utc)s::timestamptz, NOW()),
                  %(ends_at_utc)s::timestamptz,
                  %(created_by_user_id)s::bigint
                )
                RETURNING id
                """,
                {
                    "partner_id": partner_id,
                    "contract_id": contract["contract_id"],
                    "campaign_id": campaign_id,
                    "association_type": association_type,
                    "label": label,
                    "starts_at_utc": starts_at_utc,
                    "ends_at_utc": ends_at_utc,
                    "created_by_user_id": actor_user_id,
                },
            )
            link_id = int(cur.fetchone()[0])

            cur.execute(
                """
                INSERT INTO partnership.partner_audit_events (
                  partner_id,
                  actor_user_id,
                  event_type,
                  payload_json
                )
                VALUES (
                  %(partner_id)s::bigint,
                  %(actor_user_id)s::bigint,
                  'partner_campaign_link_created',
                  %(payload_json)s::jsonb
                )
                """,
                {
                    "partner_id": partner_id,
                    "actor_user_id": actor_user_id,
                    "payload_json": json.dumps(
                        {
                            "link_id": link_id,
                            "contract_id": contract["contract_id"],
                            "campaign_id": campaign["campaign_id"],
                            "campaign_slug": campaign["slug"],
                            "campaign_label": campaign["label"],
                            "association_type": association_type,
                            "label": label,
                        },
                        ensure_ascii=False,
                    ),
                },
            )

            detail = _partner_detail(cur, partner_id=partner_id)
            conn.commit()

    return {
        "ok": True,
        "link_id": link_id,
        **detail,
    }


def _update_campaign_link_status(
    *,
    partner_id: int,
    link_id: int,
    next_status: str,
    actor: Dict[str, Any],
):
    next_status = _normalize_link_status(next_status)
    actor_user_id = _actor_user_id_or_none(actor)

    with pg_conn() as conn:
        with conn.cursor() as cur:
            before = _fetch_campaign_link(cur, partner_id=partner_id, link_id=link_id)

            if before["status"] == next_status:
                detail = _partner_detail(cur, partner_id=partner_id)
                conn.commit()
                return {"ok": True, **detail}

            cur.execute(
                """
                UPDATE partnership.partner_campaign_links
                SET
                  status = %(next_status)s::text,
                  ends_at_utc = CASE
                    WHEN %(next_status)s::text IN ('ended', 'transferred', 'disabled')
                    THEN COALESCE(ends_at_utc, NOW())
                    ELSE ends_at_utc
                  END,
                  updated_at_utc = NOW()
                WHERE id = %(link_id)s::bigint
                  AND partner_id = %(partner_id)s::bigint
                """,
                {
                    "partner_id": partner_id,
                    "link_id": link_id,
                    "next_status": next_status,
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
                  %(partner_id)s::bigint,
                  %(actor_user_id)s::bigint,
                  'partner_campaign_link_status_changed',
                  %(payload_json)s::jsonb
                )
                """,
                {
                    "partner_id": partner_id,
                    "actor_user_id": actor_user_id,
                    "payload_json": json.dumps(
                        {
                            "link_id": link_id,
                            "campaign_id": before["campaign_id"],
                            "from_status": before["status"],
                            "to_status": next_status,
                        },
                        ensure_ascii=False,
                    ),
                },
            )

            detail = _partner_detail(cur, partner_id=partner_id)
            conn.commit()

    return {"ok": True, **detail}


@router.post("/{partner_id}/campaign-links/{link_id}/activate")
def admin_activate_partner_campaign_link(
    partner_id: int,
    link_id: int,
    actor: Dict[str, Any] = Depends(require_admin_access),
):
    return _update_campaign_link_status(
        partner_id=partner_id,
        link_id=link_id,
        next_status="active",
        actor=actor,
    )


@router.post("/{partner_id}/campaign-links/{link_id}/pause")
def admin_pause_partner_campaign_link(
    partner_id: int,
    link_id: int,
    actor: Dict[str, Any] = Depends(require_admin_access),
):
    return _update_campaign_link_status(
        partner_id=partner_id,
        link_id=link_id,
        next_status="paused",
        actor=actor,
    )


@router.post("/{partner_id}/campaign-links/{link_id}/end")
def admin_end_partner_campaign_link(
    partner_id: int,
    link_id: int,
    actor: Dict[str, Any] = Depends(require_admin_access),
):
    return _update_campaign_link_status(
        partner_id=partner_id,
        link_id=link_id,
        next_status="ended",
        actor=actor,
    )