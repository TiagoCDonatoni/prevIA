from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request, status

from src.auth.service import get_auth_me_payload
from src.tools.service import list_tool_catalog, list_user_tool_access

router = APIRouter(prefix="/tools", tags=["tools"])

@router.get("/catalog")
def tools_catalog():
    return {
        "ok": True,
        "brand": "prevIA Tools",
        "tools": list_tool_catalog(),
    }


@router.get("/bootstrap")
def tools_bootstrap(request: Request):
    actor = get_auth_me_payload(request)
    user = actor.get("user") or {}
    if not actor.get("is_authenticated") or not user.get("user_id"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "ok": False,
                "code": "UNAUTHENTICATED",
                "message": "authentication required",
            },
        )

    return {
        "ok": True,
        "brand": "prevIA Tools",
        "tools": list_user_tool_access(
            int(user["user_id"]),
        ),
    }
