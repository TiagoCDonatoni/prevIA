from __future__ import annotations

from fastapi import APIRouter, Body, Request
from fastapi.responses import JSONResponse

from src.access.campaigns import (
    get_campaign_public_payload,
    redeem_campaign_for_request,
)
from src.access.service import (
    get_usage_payload,
    reset_testing_state,
    reveal_fixture,
)

router = APIRouter(prefix="/access", tags=["access"])


@router.get("/campaigns/{slug}")
def access_campaign_public(slug: str):
    result = get_campaign_public_payload(slug=slug)
    if not result.get("ok"):
        return JSONResponse(
            status_code=404,
            content={
                "ok": False,
                "code": result.get("code") or "CAMPAIGN_NOT_FOUND",
                "message": result.get("message") or "campaign not found",
            },
        )
    return result


@router.post("/campaigns/{slug}/redeem")
def access_campaign_redeem(request: Request, slug: str):
    result = redeem_campaign_for_request(request=request, slug=slug)
    if not result.get("ok"):
        return JSONResponse(
            status_code=int(result.get("status_code") or 400),
            content={
                "ok": False,
                "code": result.get("code") or "CAMPAIGN_REDEEM_FAILED",
                "message": result.get("message") or "campaign redeem failed",
            },
        )
    return result


@router.get("/usage")
def access_usage(request: Request):
    return get_usage_payload(request)


@router.post("/reveal")
def access_reveal(request: Request, payload: dict = Body(...)):
    fixture_key = str(payload.get("fixture_key") or "").strip()
    return reveal_fixture(request, fixture_key=fixture_key)


@router.post("/dev/reset-testing")
def access_dev_reset_testing(request: Request):
    return reset_testing_state(request)