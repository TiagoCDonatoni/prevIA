from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Dict

ATTRIBUTION_SOURCE_ACCESS_CAMPAIGN_REDEEM = "access_campaign_redeem"


def _iso(value: Any) -> str | None:
    if value is None:
        return None
    if hasattr(value, "isoformat"):
        return value.isoformat().replace("+00:00", "Z")
    return str(value)


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _coerce_datetime(value: Any) -> datetime:
    if isinstance(value, datetime):
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)
    return _utc_now()


def _fetch_active_partner_link_for_campaign(
    cur,
    *,
    campaign_id: int,
    attribution_time: datetime,
) -> Dict[str, Any] | None:
    cur.execute(
        """
        SELECT
            pcl.id,
            pcl.partner_id,
            pcl.contract_id,
            pcl.campaign_id,
            pcl.starts_at_utc,
            pcl.ends_at_utc,
            p.display_name,
            p.status AS partner_status,
            pc.status AS contract_status
        FROM partnership.partner_campaign_links pcl
        INNER JOIN partnership.partners p
          ON p.id = pcl.partner_id
        INNER JOIN partnership.partner_contracts pc
          ON pc.id = pcl.contract_id
         AND pc.partner_id = pcl.partner_id
        WHERE pcl.campaign_id = %(campaign_id)s
          AND pcl.status = 'active'
          AND p.status = 'active'
          AND pc.status = 'active'
          AND pcl.starts_at_utc <= %(attribution_time)s
          AND (
            pcl.ends_at_utc IS NULL
            OR pcl.ends_at_utc > %(attribution_time)s
          )
        ORDER BY pcl.created_at_utc DESC, pcl.id DESC
        LIMIT 1
        """,
        {
            "campaign_id": campaign_id,
            "attribution_time": attribution_time,
        },
    )
    row = cur.fetchone()
    if row is None:
        return None

    return {
        "partner_campaign_link_id": int(row[0]),
        "partner_id": int(row[1]),
        "contract_id": int(row[2]),
        "campaign_id": int(row[3]),
        "starts_at_utc": row[4],
        "ends_at_utc": row[5],
        "partner_display_name": row[6],
        "partner_status": row[7],
        "contract_status": row[8],
    }


def _fetch_existing_attribution(cur, *, user_id: int) -> Dict[str, Any] | None:
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
            pa.source_redemption_id
        FROM partnership.partner_attributions pa
        WHERE pa.user_id = %(user_id)s
        LIMIT 1
        """,
        {"user_id": user_id},
    )
    row = cur.fetchone()
    if row is None:
        return None

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
        "created": False,
    }


def _derive_rule_and_status(
    *,
    user_created_at: Any,
    campaign_created_at: Any,
    redemption_status: str,
) -> tuple[str, str, bool | None]:
    is_existing_user: bool | None = None

    if user_created_at is not None and campaign_created_at is not None:
        is_existing_user = user_created_at < campaign_created_at

    if is_existing_user is True:
        attribution_rule = "existing_user_campaign_redeem"
    elif is_existing_user is False:
        attribution_rule = "new_user_campaign_redeem"
    else:
        attribution_rule = "unknown_user_age_campaign_redeem"

    if str(redemption_status or "").strip().lower() == "pending_approval":
        status = "pending"
    elif is_existing_user is True:
        status = "non_commissionable"
    else:
        status = "active"

    return attribution_rule, status, is_existing_user


def record_partner_attribution_for_campaign_redeem(
    cur,
    *,
    user_id: int,
    campaign: Dict[str, Any],
    user: Dict[str, Any],
    source_redemption_id: int | None,
    redeemed_at_utc: Any,
    redemption_status: str,
) -> Dict[str, Any] | None:
    """Create a single MVP partner attribution for a campaign redemption.

    Rules:
    - no-op when the campaign has no active partner link at the redemption time;
    - idempotent by user_id;
    - first partner attribution wins in the MVP;
    - users created before the campaign are tracked as non_commissionable.
    """
    campaign_id = int(campaign.get("campaign_id") or 0)
    if campaign_id <= 0 or user_id <= 0:
        return None

    attribution_time = _coerce_datetime(redeemed_at_utc)
    partner_link = _fetch_active_partner_link_for_campaign(
        cur,
        campaign_id=campaign_id,
        attribution_time=attribution_time,
    )
    if partner_link is None:
        return None

    existing = _fetch_existing_attribution(cur, user_id=user_id)
    if existing is not None:
        return {
            **existing,
            "skipped_reason": "user_already_attributed",
        }

    attribution_rule, status, is_existing_user = _derive_rule_and_status(
        user_created_at=user.get("created_at_utc"),
        campaign_created_at=campaign.get("created_at_utc"),
        redemption_status=redemption_status,
    )

    cur.execute(
        """
        INSERT INTO partnership.partner_attributions (
            partner_id,
            contract_id,
            partner_campaign_link_id,
            campaign_id,
            user_id,
            attributed_at,
            attribution_rule,
            attribution_source,
            status,
            source_redemption_id,
            metadata_json
        )
        VALUES (
            %(partner_id)s,
            %(contract_id)s,
            %(partner_campaign_link_id)s,
            %(campaign_id)s,
            %(user_id)s,
            %(attributed_at)s,
            %(attribution_rule)s,
            %(attribution_source)s,
            %(status)s,
            %(source_redemption_id)s,
            %(metadata_json)s::jsonb
        )
        ON CONFLICT (user_id) DO NOTHING
        RETURNING
            id,
            partner_id,
            contract_id,
            partner_campaign_link_id,
            campaign_id,
            user_id,
            attributed_at,
            attribution_rule,
            attribution_source,
            status,
            source_redemption_id
        """,
        {
            "partner_id": partner_link["partner_id"],
            "contract_id": partner_link["contract_id"],
            "partner_campaign_link_id": partner_link["partner_campaign_link_id"],
            "campaign_id": campaign_id,
            "user_id": user_id,
            "attributed_at": attribution_time,
            "attribution_rule": attribution_rule,
            "attribution_source": ATTRIBUTION_SOURCE_ACCESS_CAMPAIGN_REDEEM,
            "status": status,
            "source_redemption_id": source_redemption_id,
            "metadata_json": json.dumps(
                {
                    "campaign_slug": campaign.get("slug"),
                    "campaign_created_at_utc": _iso(campaign.get("created_at_utc")),
                    "user_created_at_utc": _iso(user.get("created_at_utc")),
                    "is_existing_user_at_campaign_created": is_existing_user,
                    "redemption_status": redemption_status,
                },
                ensure_ascii=False,
            ),
        },
    )
    row = cur.fetchone()
    if row is None:
        existing_after_conflict = _fetch_existing_attribution(cur, user_id=user_id)
        if existing_after_conflict is not None:
            return {
                **existing_after_conflict,
                "skipped_reason": "user_already_attributed",
            }
        return None

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
        "created": True,
    }