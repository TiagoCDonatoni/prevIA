from __future__ import annotations

from fastapi import APIRouter, Body
from fastapi.responses import JSONResponse

from src.access.admin_campaigns import (
    create_admin_access_campaign,
    get_admin_access_campaign,
    list_admin_access_campaigns,
    patch_admin_access_campaign_status,
    update_admin_access_campaign,
)

router = APIRouter(prefix="/admin/access-campaigns", tags=["admin-access-campaigns"])


def _error_response(result: dict, fallback_status: int = 400):
    return JSONResponse(
        status_code=int(result.get("status_code") or fallback_status),
        content={
            "ok": False,
            "code": result.get("code") or "ADMIN_ACCESS_CAMPAIGN_ERROR",
            "message": result.get("message") or "admin access campaign error",
        },
    )


@router.get("")
def admin_access_campaigns_list(limit: int = 50):
    return list_admin_access_campaigns(limit=limit)


@router.get("/{campaign_id}")
def admin_access_campaigns_get(campaign_id: int):
    result = get_admin_access_campaign(campaign_id=campaign_id)
    if not result.get("ok"):
        return _error_response(result, fallback_status=404)
    return result


@router.post("")
def admin_access_campaigns_create(payload: dict = Body(...)):
    result = create_admin_access_campaign(payload=payload)
    if not result.get("ok"):
        return _error_response(result)
    return result


@router.put("/{campaign_id}")
def admin_access_campaigns_update(campaign_id: int, payload: dict = Body(...)):
    result = update_admin_access_campaign(campaign_id=campaign_id, payload=payload)
    if not result.get("ok"):
        return _error_response(result)
    return result


@router.patch("/{campaign_id}/status")
def admin_access_campaigns_status(campaign_id: int, payload: dict = Body(...)):
    result = patch_admin_access_campaign_status(
        campaign_id=campaign_id,
        status=str(payload.get("status") or ""),
    )
    if not result.get("ok"):
        return _error_response(result)
    return result