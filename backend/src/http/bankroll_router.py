from __future__ import annotations

from typing import Any, Callable

from fastapi import APIRouter, Query, Request
from fastapi.responses import JSONResponse

from src.auth.service import get_auth_me_payload
from src.tools.bankroll.schemas import (
    BankrollAccountCreateRequest,
    BankrollAccountPatchRequest,
    BankrollEntryCreateRequest,
    BankrollEntryPatchRequest,
)
from src.tools.bankroll.service import BankrollService, BankrollServiceError

router = APIRouter(prefix="/bankroll", tags=["tools-bankroll"])
service = BankrollService()


def _authenticated_user_id(request: Request) -> int:
    actor = get_auth_me_payload(request)
    user = actor.get("user") or {}
    if not actor.get("is_authenticated") or not user.get("user_id"):
        raise BankrollServiceError("UNAUTHENTICATED", status_code=401)
    return int(user["user_id"])


def _call(action: Callable[[], Any], *, success_status: int = 200):
    try:
        result = action()
        if success_status == 200:
            return result
        return JSONResponse(status_code=success_status, content=result)
    except BankrollServiceError as exc:
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "ok": False,
                "code": exc.code,
                **exc.details,
            },
        )


@router.get("/bootstrap")
def bankroll_bootstrap(request: Request):
    return _call(lambda: service.bootstrap(_authenticated_user_id(request)))


@router.post("/accounts")
def bankroll_create_account(request: Request, payload: BankrollAccountCreateRequest):
    return _call(
        lambda: service.create_account(
            _authenticated_user_id(request),
            payload.model_dump(),
        ),
        success_status=201,
    )


@router.patch("/accounts/{account_id}")
def bankroll_update_account(request: Request, account_id: int, payload: BankrollAccountPatchRequest):
    return _call(
        lambda: service.update_account(
            _authenticated_user_id(request),
            account_id,
            payload.model_dump(exclude_unset=True),
        )
    )


@router.get("/entries")
def bankroll_list_entries(
    request: Request,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
):
    return _call(
        lambda: service.list_entries(
            _authenticated_user_id(request),
            limit=limit,
            offset=offset,
        )
    )


@router.post("/entries")
def bankroll_create_entry(request: Request, payload: BankrollEntryCreateRequest):
    return _call(
        lambda: service.create_entry(
            _authenticated_user_id(request),
            payload.model_dump(),
        ),
        success_status=201,
    )


@router.patch("/entries/{entry_id}")
def bankroll_update_entry(request: Request, entry_id: int, payload: BankrollEntryPatchRequest):
    return _call(
        lambda: service.update_entry(
            _authenticated_user_id(request),
            entry_id,
            payload.model_dump(exclude_unset=True),
        )
    )


@router.delete("/entries/{entry_id}")
def bankroll_delete_entry(request: Request, entry_id: int):
    return _call(lambda: service.delete_entry(_authenticated_user_id(request), entry_id))


@router.get("/summary")
def bankroll_summary(request: Request):
    return _call(lambda: service.get_summary(_authenticated_user_id(request)))
