from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Any, Dict, Iterable, Mapping, Optional

TOOL_CODE = "BANKROLL_MANAGER"
VALID_RESULTS = {"pending", "won", "lost", "void", "cashout"}
ODDS_QUANTUM = Decimal("0.0001")
MAX_ODDS = Decimal("10000")
MAX_BIGINT = 9_223_372_036_854_775_807


class BankrollValidationError(ValueError):
    def __init__(self, code: str, **details: Any):
        super().__init__(code)
        self.code = code
        self.details = details


class BankrollResourceNotFound(RuntimeError):
    pass


class ActiveBankrollAccountExists(RuntimeError):
    pass


class BankrollEntryLimitReached(RuntimeError):
    def __init__(self, limit: int):
        super().__init__("TOOL_FREE_LIMIT_REACHED")
        self.limit = int(limit)


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def to_utc_datetime(value: Any, *, field: str, default: Optional[datetime] = None) -> datetime:
    if value is None:
        if default is None:
            raise BankrollValidationError("BANKROLL_INVALID_DATETIME", field=field)
        return default
    if isinstance(value, datetime):
        parsed = value
    else:
        text = str(value).strip().replace("Z", "+00:00")
        try:
            parsed = datetime.fromisoformat(text)
        except (TypeError, ValueError) as exc:
            raise BankrollValidationError("BANKROLL_INVALID_DATETIME", field=field) from exc
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def normalize_text(value: Any, *, field: str, max_length: int, required: bool = True) -> Optional[str]:
    if value is None:
        if required:
            raise BankrollValidationError("BANKROLL_REQUIRED_FIELD", field=field)
        return None
    text = str(value).strip()
    if required and not text:
        raise BankrollValidationError("BANKROLL_REQUIRED_FIELD", field=field)
    if len(text) > max_length:
        raise BankrollValidationError("BANKROLL_FIELD_TOO_LONG", field=field, max_length=max_length)
    return text or None


def normalize_currency_code(value: Any) -> str:
    currency_code = str(value or "").strip().upper()
    if len(currency_code) != 3 or not currency_code.isalpha():
        raise BankrollValidationError("BANKROLL_INVALID_CURRENCY")
    return currency_code


def normalize_nonnegative_cents(value: Any, *, field: str) -> int:
    if isinstance(value, bool):
        raise BankrollValidationError("BANKROLL_INVALID_MONEY", field=field)
    try:
        decimal_amount = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError) as exc:
        raise BankrollValidationError("BANKROLL_INVALID_MONEY", field=field) from exc
    if (
        not decimal_amount.is_finite()
        or decimal_amount != decimal_amount.to_integral_value()
        or decimal_amount < 0
        or decimal_amount > MAX_BIGINT
    ):
        raise BankrollValidationError("BANKROLL_INVALID_MONEY", field=field)
    return int(decimal_amount)


def normalize_stake_cents(value: Any) -> int:
    try:
        stake_cents = normalize_nonnegative_cents(value, field="stake_cents")
    except BankrollValidationError as exc:
        raise BankrollValidationError("BANKROLL_INVALID_STAKE") from exc
    if stake_cents <= 0:
        raise BankrollValidationError("BANKROLL_INVALID_STAKE")
    return stake_cents


def normalize_odds(value: Any) -> Decimal:
    if isinstance(value, bool):
        raise BankrollValidationError("BANKROLL_INVALID_ODDS")
    try:
        raw_odds = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError) as exc:
        raise BankrollValidationError("BANKROLL_INVALID_ODDS") from exc
    if not raw_odds.is_finite() or raw_odds <= 1 or raw_odds > MAX_ODDS:
        raise BankrollValidationError("BANKROLL_INVALID_ODDS")
    odds = raw_odds.quantize(ODDS_QUANTUM, rounding=ROUND_HALF_UP)
    if odds <= 1:
        raise BankrollValidationError("BANKROLL_INVALID_ODDS")
    return odds


def normalize_account_create(payload: Mapping[str, Any]) -> Dict[str, Any]:
    return {
        "name": normalize_text(payload.get("name"), field="name", max_length=120),
        "currency_code": normalize_currency_code(payload.get("currency_code") or "BRL"),
        "initial_balance_cents": normalize_nonnegative_cents(
            payload.get("initial_balance_cents", 0),
            field="initial_balance_cents",
        ),
    }


def normalize_account_patch(payload: Mapping[str, Any]) -> Dict[str, Any]:
    normalized: Dict[str, Any] = {}
    if "name" in payload:
        normalized["name"] = normalize_text(payload.get("name"), field="name", max_length=120)
    if "initial_balance_cents" in payload:
        normalized["initial_balance_cents"] = normalize_nonnegative_cents(
            payload.get("initial_balance_cents"),
            field="initial_balance_cents",
        )
    if not normalized:
        raise BankrollValidationError("BANKROLL_EMPTY_UPDATE")
    return normalized


def normalize_entry(
    payload: Mapping[str, Any],
    *,
    current: Optional[Mapping[str, Any]] = None,
    now: Optional[datetime] = None,
) -> Dict[str, Any]:
    if current is not None and "result" in payload and payload.get("result") is None:
        raise BankrollValidationError("BANKROLL_INVALID_RESULT")
    if current is not None and "placed_at_utc" in payload and payload.get("placed_at_utc") is None:
        raise BankrollValidationError("BANKROLL_INVALID_DATETIME", field="placed_at_utc")

    merged = dict(current or {})
    merged.update(payload)
    effective_now = now or utc_now()

    stake_cents = normalize_stake_cents(merged.get("stake_cents"))
    result = str(merged.get("result") or "pending").strip().lower()
    if result not in VALID_RESULTS:
        raise BankrollValidationError("BANKROLL_INVALID_RESULT")

    raw_return = merged.get("return_cents")
    settled_at = merged.get("settled_at_utc")
    previous_result = str((current or {}).get("result") or "").strip().lower()

    if result == "pending":
        return_cents = None
        settled_at_utc = None
    elif result == "lost":
        return_cents = 0
        settled_at_utc = (
            to_utc_datetime(settled_at, field="settled_at_utc")
            if settled_at is not None and previous_result != "pending"
            else effective_now
        )
    elif result == "void":
        return_cents = stake_cents
        settled_at_utc = (
            to_utc_datetime(settled_at, field="settled_at_utc")
            if settled_at is not None and previous_result != "pending"
            else effective_now
        )
    else:
        if raw_return is None:
            raise BankrollValidationError("BANKROLL_RETURN_REQUIRED", result=result)
        return_cents = normalize_nonnegative_cents(raw_return, field="return_cents")
        if result == "won" and return_cents <= stake_cents:
            raise BankrollValidationError("BANKROLL_INCONSISTENT_RETURN", result=result)
        settled_at_utc = (
            to_utc_datetime(settled_at, field="settled_at_utc")
            if settled_at is not None and previous_result != "pending"
            else effective_now
        )

    return {
        "placed_at_utc": to_utc_datetime(
            merged.get("placed_at_utc"),
            field="placed_at_utc",
            default=effective_now,
        ),
        "event_name": normalize_text(merged.get("event_name"), field="event_name", max_length=240),
        "bookmaker": normalize_text(merged.get("bookmaker"), field="bookmaker", max_length=120),
        "market": normalize_text(merged.get("market"), field="market", max_length=160),
        "selection": normalize_text(merged.get("selection"), field="selection", max_length=160),
        "odds_decimal": normalize_odds(merged.get("odds_decimal")),
        "stake_cents": stake_cents,
        "result": result,
        "return_cents": return_cents,
        "notes": normalize_text(merged.get("notes"), field="notes", max_length=2000, required=False),
        "settled_at_utc": settled_at_utc,
    }


def calculate_summary(initial_balance_cents: int, entries: Iterable[Mapping[str, Any]]) -> Dict[str, Any]:
    initial_balance = normalize_nonnegative_cents(initial_balance_cents, field="initial_balance_cents")
    entries_list = list(entries)
    result_counts = {result: 0 for result in VALID_RESULTS}
    total_staked = 0
    settled_staked = 0
    pending_staked = 0
    realized_profit = 0
    odds_total = Decimal("0")
    odds_count = 0

    for entry in entries_list:
        result = str(entry.get("result") or "").strip().lower()
        if result not in VALID_RESULTS:
            raise BankrollValidationError("BANKROLL_INVALID_RESULT")
        stake = normalize_stake_cents(entry.get("stake_cents"))
        total_staked += stake
        result_counts[result] += 1

        odds_total += normalize_odds(entry.get("odds_decimal"))
        odds_count += 1

        if result == "pending":
            pending_staked += stake
            continue

        settled_staked += stake
        if result == "lost":
            realized_profit -= stake
        elif result == "void":
            pass
        else:
            return_cents = normalize_nonnegative_cents(entry.get("return_cents"), field="return_cents")
            realized_profit += return_cents - stake

    won_lost_count = result_counts["won"] + result_counts["lost"]
    roi = Decimal(realized_profit) / Decimal(settled_staked) if settled_staked else Decimal("0")
    win_rate = Decimal(result_counts["won"]) / Decimal(won_lost_count) if won_lost_count else Decimal("0")
    average_odds = odds_total / Decimal(odds_count) if odds_count else Decimal("0")

    return {
        "initial_balance_cents": initial_balance,
        "available_balance_cents": initial_balance + realized_profit - pending_staked,
        "realized_profit_cents": realized_profit,
        "total_staked_cents": total_staked,
        "settled_staked_cents": settled_staked,
        "pending_staked_cents": pending_staked,
        "entries_count": len(entries_list),
        "pending_count": result_counts["pending"],
        "won_count": result_counts["won"],
        "lost_count": result_counts["lost"],
        "void_count": result_counts["void"],
        "cashout_count": result_counts["cashout"],
        "win_rate": float(round(win_rate, 6)),
        "roi": float(round(roi, 6)),
        "average_odds": float(round(average_odds, 4)),
    }
