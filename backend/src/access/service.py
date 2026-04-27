from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict

from fastapi import HTTPException, Request, status

from src.auth.service import get_auth_me_payload
from src.billing.service import reset_internal_testing_subscription_for_user
from src.db.pg import pg_conn


def _utc_now():
    return datetime.now(timezone.utc)


def _today_date_key():
    return _utc_now().date()

PERSISTENT_REVEAL_PLAN_CODES = {"BASIC", "LIGHT", "PRO"}
ACTIVE_EVENT_GRACE_MINUTES = 90

def _normalize_plan_code(raw: Any) -> str:
    plan = str(raw or "FREE").strip().upper()
    return plan if plan in {"FREE", "BASIC", "LIGHT", "PRO"} else "FREE"

def _fetch_bonus_credit_balance(cur, *, user_id: int, for_update: bool = False) -> int:
    sql = """
        SELECT balance_credits
        FROM access.user_bonus_credit_balances
        WHERE user_id = %(user_id)s
    """
    if for_update:
        sql += " FOR UPDATE"
    cur.execute(sql, {"user_id": user_id})
    row = cur.fetchone()
    return int(row[0]) if row and row[0] is not None else 0


def _append_bonus_credit_event(
    cur,
    *,
    user_id: int,
    event_type: str,
    credits_delta: int,
    balance_after: int,
    reason: str | None,
    actor_user_id: int | None,
) -> None:
    cur.execute(
        """
        INSERT INTO access.user_bonus_credit_events (
            user_id,
            event_type,
            credits_delta,
            balance_after,
            reason,
            actor_user_id
        )
        VALUES (
            %(user_id)s,
            %(event_type)s,
            %(credits_delta)s,
            %(balance_after)s,
            %(reason)s,
            %(actor_user_id)s
        )
        """,
        {
            "user_id": user_id,
            "event_type": event_type,
            "credits_delta": credits_delta,
            "balance_after": balance_after,
            "reason": reason,
            "actor_user_id": actor_user_id,
        },
    )


def _consume_one_bonus_credit(cur, *, user_id: int, reason: str) -> int:
    current_balance = _fetch_bonus_credit_balance(cur, user_id=user_id, for_update=True)
    if current_balance <= 0:
        return 0

    next_balance = current_balance - 1
    cur.execute(
        """
        UPDATE access.user_bonus_credit_balances
        SET balance_credits = %(balance_credits)s,
            updated_at_utc = NOW()
        WHERE user_id = %(user_id)s
        """,
        {
            "user_id": user_id,
            "balance_credits": next_balance,
        },
    )
    _append_bonus_credit_event(
        cur,
        user_id=user_id,
        event_type="consume",
        credits_delta=-1,
        balance_after=next_balance,
        reason=reason,
        actor_user_id=None,
    )
    return next_balance


def _build_usage_payload(
    *,
    credits_used: int,
    revealed_count: int,
    base_daily_limit: int,
    bonus_balance: int,
) -> Dict[str, Any]:
    base_remaining = max(0, base_daily_limit - credits_used)
    remaining = base_remaining + max(0, bonus_balance)
    daily_limit = credits_used + remaining

    return {
        "credits_used": credits_used,
        "revealed_count": revealed_count,
        "base_daily_limit": base_daily_limit,
        "extra_credits": max(0, bonus_balance),  # compat legado
        "bonus_credits_available": max(0, bonus_balance),
        "daily_limit": daily_limit,
        "remaining": remaining,
    }

def _plan_has_persistent_reveals(plan_code: Any) -> bool:
    return _normalize_plan_code(plan_code) in PERSISTENT_REVEAL_PLAN_CODES


def _fetch_revealed_fixture_rows(cur, *, user_id: int, date_key, plan_code: str):
    date_clause = "" if _plan_has_persistent_reveals(plan_code) else "AND ure.date_key = %(date_key)s"

    cur.execute(
        f"""
        SELECT DISTINCT ure.fixture_key
        FROM access.user_revealed_events ure
        LEFT JOIN odds.odds_events oe
          ON CAST(oe.event_id AS TEXT) = ure.fixture_key
        WHERE ure.user_id = %(user_id)s
          {date_clause}
          AND (
            oe.event_id IS NULL
            OR oe.commence_time_utc IS NULL
            OR oe.commence_time_utc >= NOW() - (%(active_event_grace_minutes)s || ' minutes')::interval
          )
        ORDER BY ure.fixture_key ASC
        """,
        {
            "user_id": user_id,
            "date_key": date_key,
            "active_event_grace_minutes": ACTIVE_EVENT_GRACE_MINUTES,
        },
    )
    return cur.fetchall()

def _is_fixture_currently_revealed(
    cur,
    *,
    user_id: int,
    date_key,
    fixture_key: str,
    plan_code: str,
) -> bool:
    date_clause = "" if _plan_has_persistent_reveals(plan_code) else "AND ure.date_key = %(date_key)s"

    cur.execute(
        f"""
        SELECT 1
        FROM access.user_revealed_events ure
        LEFT JOIN odds.odds_events oe
          ON CAST(oe.event_id AS TEXT) = ure.fixture_key
        WHERE ure.user_id = %(user_id)s
          AND ure.fixture_key = %(fixture_key)s
          {date_clause}
          AND (
            oe.event_id IS NULL
            OR oe.commence_time_utc IS NULL
            OR oe.commence_time_utc >= NOW() - (%(active_event_grace_minutes)s || ' minutes')::interval
          )
        LIMIT 1
        """,
        {
            "user_id": user_id,
            "date_key": date_key,
            "fixture_key": fixture_key,
            "active_event_grace_minutes": ACTIVE_EVENT_GRACE_MINUTES,
        },
    )
    return cur.fetchone() is not None

def _resolve_product_plan_code(actor: Dict[str, Any]) -> str:
    access_context = actor.get("access") or {}
    product_plan_code = str(access_context.get("product_plan_code") or "").strip().upper()
    if product_plan_code in {"FREE", "BASIC", "LIGHT", "PRO"}:
        return product_plan_code
    return _normalize_plan_code((actor.get("subscription") or {}).get("plan_code"))

def _resolve_current_actor(request: Request) -> Dict[str, Any]:
    payload = get_auth_me_payload(request)
    if not payload.get("is_authenticated") or not payload.get("user"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "ok": False,
                "code": "UNAUTHENTICATED",
                "message": "authentication required",
            },
        )
    return payload

def _require_testing_reset_access(actor: Dict[str, Any]) -> None:
    access_context = actor.get("access") or {}

    allowed = (
        bool(access_context.get("is_internal"))
        or bool(access_context.get("admin_access"))
        or bool(access_context.get("product_internal_access"))
        or bool(access_context.get("allow_plan_override"))
    )

    if allowed:
        return

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail={
            "ok": False,
            "code": "TESTING_RESET_FORBIDDEN",
            "message": "internal testing reset access required",
        },
    )

def get_usage_payload(request: Request) -> Dict[str, Any]:
    actor = _resolve_current_actor(request)
    user = actor["user"]
    plan_code = _resolve_product_plan_code(actor)
    entitlements = actor["entitlements"]

    user_id = int(user["user_id"])
    date_key = _today_date_key()

    with pg_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT credits_used, revealed_count
                FROM access.user_daily_usage
                WHERE user_id = %(user_id)s
                  AND date_key = %(date_key)s
                """,
                {"user_id": user_id, "date_key": date_key},
            )
            row = cur.fetchone()

            revealed_rows = _fetch_revealed_fixture_rows(
                cur,
                user_id=user_id,
                date_key=date_key,
                plan_code=plan_code,
            )
            bonus_balance = _fetch_bonus_credit_balance(
                cur,
                user_id=user_id,
            )

    credits_used = int(row[0]) if row else 0
    revealed_count = int(row[1]) if row else 0
    base_daily_limit = int(entitlements["credits"]["daily_limit"])
    usage = _build_usage_payload(
        credits_used=credits_used,
        revealed_count=revealed_count,
        base_daily_limit=base_daily_limit,
        bonus_balance=bonus_balance,
    )
    revealed_fixture_keys = [str(r[0]) for r in revealed_rows]

    return {
        "ok": True,
        "user_id": user_id,
        "plan_code": plan_code,
        "date_key": str(date_key),
        "usage": {
            **usage,
            "revealed_fixture_keys": revealed_fixture_keys,
        },
    }


def reveal_fixture(request: Request, *, fixture_key: str) -> Dict[str, Any]:
    actor = _resolve_current_actor(request)
    user = actor["user"]
    entitlements = actor["entitlements"]

    user_id = int(user["user_id"])
    fixture_key = str(fixture_key or "").strip()
    date_key = _today_date_key()

    if not fixture_key:
        return {
            "ok": False,
            "code": "INVALID_FIXTURE_KEY",
            "message": "fixture_key is required",
        }

    base_daily_limit = int(entitlements["credits"]["daily_limit"])

    with pg_conn() as conn:
        with conn.cursor() as cur:
            already = _is_fixture_currently_revealed(
                cur,
                user_id=user_id,
                date_key=date_key,
                fixture_key=fixture_key,
                plan_code=_resolve_product_plan_code(actor),
            )

            if already:
                cur.execute(
                    """
                    SELECT credits_used, revealed_count
                    FROM access.user_daily_usage
                    WHERE user_id = %(user_id)s
                      AND date_key = %(date_key)s
                    """,
                    {"user_id": user_id, "date_key": date_key},
                )
                row = cur.fetchone()
                credits_used = int(row[0]) if row else 0
                revealed_count = int(row[1]) if row else 0
                bonus_balance = _fetch_bonus_credit_balance(
                    cur,
                    user_id=user_id,
                )

                return {
                    "ok": True,
                    "already_revealed": True,
                    "consumed_credit": False,
                    "usage": _build_usage_payload(
                        credits_used=credits_used,
                        revealed_count=revealed_count,
                        base_daily_limit=base_daily_limit,
                        bonus_balance=bonus_balance,
                    ),
                }

            cur.execute(
                """
                INSERT INTO access.user_daily_usage (
                    user_id,
                    date_key,
                    credits_used,
                    revealed_count
                )
                VALUES (
                    %(user_id)s,
                    %(date_key)s,
                    0,
                    0
                )
                ON CONFLICT (user_id, date_key) DO NOTHING
                """,
                {"user_id": user_id, "date_key": date_key},
            )

            cur.execute(
                """
                SELECT credits_used, revealed_count
                FROM access.user_daily_usage
                WHERE user_id = %(user_id)s
                  AND date_key = %(date_key)s
                FOR UPDATE
                """,
                {"user_id": user_id, "date_key": date_key},
            )

            cur.execute(
                """
                SELECT credits_used, revealed_count
                FROM access.user_daily_usage
                WHERE user_id = %(user_id)s
                  AND date_key = %(date_key)s
                FOR UPDATE
                """,
                {"user_id": user_id, "date_key": date_key},
            )
            row = cur.fetchone()
            credits_used = int(row[0]) if row else 0
            revealed_count = int(row[1]) if row else 0

            using_bonus_credit = credits_used >= base_daily_limit
            bonus_balance = _fetch_bonus_credit_balance(
                cur,
                user_id=user_id,
                for_update=using_bonus_credit,
            )

            if using_bonus_credit and bonus_balance <= 0:
                return {
                    "ok": False,
                    "code": "NO_CREDITS",
                    "message": "daily credit limit reached",
                    "usage": _build_usage_payload(
                        credits_used=credits_used,
                        revealed_count=revealed_count,
                        base_daily_limit=base_daily_limit,
                        bonus_balance=bonus_balance,
                    ),
                }

            cur.execute(
                """
                INSERT INTO access.user_revealed_events (
                    user_id,
                    date_key,
                    fixture_key
                )
                VALUES (
                    %(user_id)s,
                    %(date_key)s,
                    %(fixture_key)s
                )
                ON CONFLICT (user_id, date_key, fixture_key) DO NOTHING
                """,
                {
                    "user_id": user_id,
                    "date_key": date_key,
                    "fixture_key": fixture_key,
                },
            )

            if cur.rowcount == 0:
                return {
                    "ok": True,
                    "already_revealed": True,
                    "consumed_credit": False,
                    "usage": _build_usage_payload(
                        credits_used=credits_used,
                        revealed_count=revealed_count,
                        base_daily_limit=base_daily_limit,
                        bonus_balance=bonus_balance,
                    ),
                }

            bonus_balance_after = bonus_balance
            if using_bonus_credit:
                bonus_balance_after = _consume_one_bonus_credit(
                    cur,
                    user_id=user_id,
                    reason=f"reveal_fixture:{fixture_key}",
                )   

            cur.execute(
                """
                UPDATE access.user_daily_usage
                SET credits_used = credits_used + 1,
                    revealed_count = revealed_count + 1,
                    updated_at_utc = NOW()
                WHERE user_id = %(user_id)s
                  AND date_key = %(date_key)s
                RETURNING credits_used, revealed_count
                """,
                {"user_id": user_id, "date_key": date_key},
            )
            updated = cur.fetchone()
            conn.commit()

    credits_used = int(updated[0])
    revealed_count = int(updated[1])

    return {
        "ok": True,
        "already_revealed": False,
        "consumed_credit": True,
        "usage": _build_usage_payload(
            credits_used=credits_used,
            revealed_count=revealed_count,
            base_daily_limit=base_daily_limit,
            bonus_balance=bonus_balance_after,
        ),
    }

def reset_testing_state(request: Request) -> Dict[str, Any]:
    actor = _resolve_current_actor(request)
    _require_testing_reset_access(actor)

    user = actor["user"]
    user_id = int(user["user_id"])
    date_key = _today_date_key()
    access_context = actor.get("access") or {}
    billing_runtime = str(access_context.get("billing_runtime") or "live").strip().lower() or "live"

    with pg_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                DELETE FROM access.user_revealed_events
                WHERE user_id = %(user_id)s
                """,
                {"user_id": user_id},
            )

            cur.execute(
                """
                DELETE FROM access.user_daily_usage
                WHERE user_id = %(user_id)s
                  AND date_key = %(date_key)s
                """,
                {
                    "user_id": user_id,
                    "date_key": date_key,
                },
            )

            cur.execute(
                """
                DELETE FROM access.user_daily_credit_grants
                WHERE user_id = %(user_id)s
                  AND date_key = %(date_key)s
                """,
                {
                    "user_id": user_id,
                    "date_key": date_key,
                },
            )

        conn.commit()

    reset_internal_testing_subscription_for_user(
        user_id,
        billing_runtime=billing_runtime,
    )

    return get_usage_payload(request)