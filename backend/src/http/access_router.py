from __future__ import annotations

from fastapi import APIRouter, Body, Request

from src.access.service import get_usage_payload, reveal_fixture

router = APIRouter(prefix="/access", tags=["access"])


@router.get("/usage")
def access_usage(request: Request):
    return get_usage_payload(request)


@router.post("/reveal")
def access_reveal(request: Request, payload: dict = Body(...)):
    fixture_key = str(payload.get("fixture_key") or "").strip()
    return reveal_fixture(request, fixture_key=fixture_key)