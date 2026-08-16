from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Literal, Optional

from pydantic import BaseModel, Field

BankrollResult = Literal["pending", "won", "lost", "void", "cashout"]


class BankrollAccountCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    currency_code: str = Field(default="BRL", min_length=3, max_length=3)
    initial_balance_cents: int = Field(default=0, ge=0)


class BankrollAccountPatchRequest(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    initial_balance_cents: Optional[int] = Field(default=None, ge=0)


class BankrollEntryCreateRequest(BaseModel):
    account_id: Optional[int] = Field(default=None, gt=0)
    placed_at_utc: Optional[datetime] = None
    event_name: str = Field(..., min_length=1, max_length=240)
    bookmaker: str = Field(..., min_length=1, max_length=120)
    market: str = Field(..., min_length=1, max_length=160)
    selection: str = Field(..., min_length=1, max_length=160)
    odds_decimal: Decimal = Field(..., gt=1, le=10000)
    stake_cents: int = Field(..., gt=0)
    result: BankrollResult = "pending"
    return_cents: Optional[int] = Field(default=None, ge=0)
    notes: Optional[str] = Field(default=None, max_length=2000)


class BankrollEntryPatchRequest(BaseModel):
    placed_at_utc: Optional[datetime] = None
    event_name: Optional[str] = Field(default=None, min_length=1, max_length=240)
    bookmaker: Optional[str] = Field(default=None, min_length=1, max_length=120)
    market: Optional[str] = Field(default=None, min_length=1, max_length=160)
    selection: Optional[str] = Field(default=None, min_length=1, max_length=160)
    odds_decimal: Optional[Decimal] = Field(default=None, gt=1, le=10000)
    stake_cents: Optional[int] = Field(default=None, gt=0)
    result: Optional[BankrollResult] = None
    return_cents: Optional[int] = Field(default=None, ge=0)
    notes: Optional[str] = Field(default=None, max_length=2000)
