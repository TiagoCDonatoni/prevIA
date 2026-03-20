from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict

from fastapi import HTTPException, Request, status

from src.auth.service import get_auth_me_payload
from src.db.pg import pg_conn


def _utc_now():
    return datetime.now(timezone.utc)


def _today_date_key():
    return _utc_now().date()


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


def get_usage_payload(request: Request) -> Dict[str, Any]:
    actor = _resolve_current_actor(request)
    user = actor["user"]
    plan_code = actor["subscription"]["plan_code"]
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

            cur.execute(
                """
                SELECT fixture_key
                FROM access.user_revealed_events
                WHERE user_id = %(user_id)s
                  AND date_key = %(date_key)s
                ORDER BY revealed_at_utc ASC
                """,
                {"user_id": user_id, "date_key": date_key},
            )
            revealed_rows = cur.fetchall()

    credits_used = int(row[0]) if row else 0
    revealed_count = int(row[1]) if row else 0
    daily_limit = int(entitlements["credits"]["daily_limit"])
    remaining = max(0, daily_limit - credits_used)
    revealed_fixture_keys = [str(r[0]) for r in revealed_rows]

    return {
        "ok": True,
        "user_id": user_id,
        "plan_code": plan_code,
        "date_key": str(date_key),
        "usage": {
            "credits_used": credits_used,
            "revealed_count": revealed_count,
            "daily_limit": daily_limit,
            "remaining": remaining,
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

    daily_limit = int(entitlements["credits"]["daily_limit"])

    with pg_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT 1
                FROM access.user_revealed_events
                WHERE user_id = %(user_id)s
                  AND date_key = %(date_key)s
                  AND fixture_key = %(fixture_key)s
                LIMIT 1
                """,
                {
                    "user_id": user_id,
                    "date_key": date_key,
                    "fixture_key": fixture_key,
                },
            )
            already = cur.fetchone() is not None

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

                return {
                    "ok": True,
                    "already_revealed": True,
                    "consumed_credit": False,
                    "usage": {
                        "credits_used": credits_used,
                        "revealed_count": revealed_count,
                        "daily_limit": daily_limit,
                        "remaining": max(0, daily_limit - credits_used),
                    },
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
            row = cur.fetchone()
            credits_used = int(row[0]) if row else 0
            revealed_count = int(row[1]) if row else 0

            if credits_used >= daily_limit:
                return {
                    "ok": False,
                    "code": "NO_CREDITS",
                    "message": "daily credit limit reached",
                    "usage": {
                        "credits_used": credits_used,
                        "revealed_count": revealed_count,
                        "daily_limit": daily_limit,
                        "remaining": 0,
                    },
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
                """,
                {
                    "user_id": user_id,
                    "date_key": date_key,
                    "fixture_key": fixture_key,
                },
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
        "usage": {
            "credits_used": credits_used,
            "revealed_count": revealed_count,
            "daily_limit": daily_limit,
            "remaining": max(0, daily_limit - credits_used),
        },
    }