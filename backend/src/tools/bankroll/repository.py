from __future__ import annotations

from typing import Any, Dict, List, Mapping, Optional

from src.db.pg import pg_conn
from src.tools.bankroll.domain import (
    ActiveBankrollAccountExists,
    BankrollEntryLimitReached,
    BankrollResourceNotFound,
)


ACCOUNT_SELECT = """
    account_id,
    user_id,
    name,
    currency_code,
    initial_balance_cents,
    status,
    created_at_utc,
    updated_at_utc
"""

ENTRY_SELECT = """
    entry_id,
    account_id,
    user_id,
    placed_at_utc,
    event_name,
    bookmaker,
    market,
    selection,
    odds_decimal,
    stake_cents,
    result,
    return_cents,
    notes,
    settled_at_utc,
    created_at_utc,
    updated_at_utc,
    deleted_at_utc
"""


def _iso(value: Any) -> Optional[str]:
    if value is None:
        return None
    if hasattr(value, "isoformat"):
        return value.isoformat().replace("+00:00", "Z")
    return str(value)


def _account_from_row(row: Any) -> Dict[str, Any]:
    return {
        "account_id": int(row[0]),
        "user_id": int(row[1]),
        "name": str(row[2]),
        "currency_code": str(row[3]),
        "initial_balance_cents": int(row[4]),
        "status": str(row[5]),
        "created_at_utc": _iso(row[6]),
        "updated_at_utc": _iso(row[7]),
    }


def _entry_from_row(row: Any) -> Dict[str, Any]:
    return {
        "entry_id": int(row[0]),
        "account_id": int(row[1]),
        "user_id": int(row[2]),
        "placed_at_utc": _iso(row[3]),
        "event_name": str(row[4]),
        "bookmaker": str(row[5]),
        "market": str(row[6]),
        "selection": str(row[7]),
        "odds_decimal": format(row[8], "f"),
        "stake_cents": int(row[9]),
        "result": str(row[10]),
        "return_cents": int(row[11]) if row[11] is not None else None,
        "notes": str(row[12]) if row[12] is not None else None,
        "settled_at_utc": _iso(row[13]),
        "created_at_utc": _iso(row[14]),
        "updated_at_utc": _iso(row[15]),
        "deleted_at_utc": _iso(row[16]),
    }


class PostgresBankrollRepository:
    def get_active_account(self, user_id: int) -> Optional[Dict[str, Any]]:
        with pg_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    f"""
                    SELECT {ACCOUNT_SELECT}
                    FROM tools.bankroll_accounts
                    WHERE user_id = %(user_id)s
                      AND status = 'active'
                    ORDER BY created_at_utc ASC, account_id ASC
                    LIMIT 1
                    """,
                    {"user_id": int(user_id)},
                )
                row = cur.fetchone()
        return _account_from_row(row) if row else None

    def create_account(self, user_id: int, data: Mapping[str, Any]) -> Dict[str, Any]:
        with pg_conn() as conn:
            try:
                with conn.cursor() as cur:
                    cur.execute(
                        "SELECT user_id FROM app.users WHERE user_id = %(user_id)s FOR UPDATE",
                        {"user_id": int(user_id)},
                    )
                    if cur.fetchone() is None:
                        raise BankrollResourceNotFound()

                    cur.execute(
                        """
                        SELECT 1
                        FROM tools.bankroll_accounts
                        WHERE user_id = %(user_id)s
                          AND status = 'active'
                        LIMIT 1
                        """,
                        {"user_id": int(user_id)},
                    )
                    if cur.fetchone() is not None:
                        raise ActiveBankrollAccountExists()

                    cur.execute(
                        f"""
                        INSERT INTO tools.bankroll_accounts (
                            user_id, name, currency_code, initial_balance_cents
                        ) VALUES (
                            %(user_id)s, %(name)s, %(currency_code)s, %(initial_balance_cents)s
                        )
                        RETURNING {ACCOUNT_SELECT}
                        """,
                        {"user_id": int(user_id), **dict(data)},
                    )
                    row = cur.fetchone()
                conn.commit()
            except Exception:
                conn.rollback()
                raise
        return _account_from_row(row)

    def update_account(self, user_id: int, account_id: int, data: Mapping[str, Any]) -> Optional[Dict[str, Any]]:
        assignments = []
        params: Dict[str, Any] = {
            "user_id": int(user_id),
            "account_id": int(account_id),
        }
        for field in ("name", "initial_balance_cents"):
            if field in data:
                assignments.append(f"{field} = %({field})s")
                params[field] = data[field]
        if not assignments:
            return None

        with pg_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    f"""
                    UPDATE tools.bankroll_accounts
                    SET {', '.join(assignments)},
                        updated_at_utc = NOW()
                    WHERE account_id = %(account_id)s
                      AND user_id = %(user_id)s
                      AND status = 'active'
                    RETURNING {ACCOUNT_SELECT}
                    """,
                    params,
                )
                row = cur.fetchone()
            conn.commit()
        return _account_from_row(row) if row else None

    def list_entries(self, user_id: int, *, limit: int, offset: int) -> List[Dict[str, Any]]:
        with pg_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    f"""
                    SELECT {ENTRY_SELECT}
                    FROM tools.bankroll_entries
                    WHERE user_id = %(user_id)s
                      AND deleted_at_utc IS NULL
                    ORDER BY placed_at_utc DESC, entry_id DESC
                    LIMIT %(limit)s OFFSET %(offset)s
                    """,
                    {
                        "user_id": int(user_id),
                        "limit": int(limit),
                        "offset": int(offset),
                    },
                )
                rows = cur.fetchall()
        return [_entry_from_row(row) for row in rows]

    def list_entries_for_summary(self, user_id: int, account_id: int) -> List[Dict[str, Any]]:
        with pg_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    f"""
                    SELECT {ENTRY_SELECT}
                    FROM tools.bankroll_entries
                    WHERE user_id = %(user_id)s
                      AND account_id = %(account_id)s
                      AND deleted_at_utc IS NULL
                    ORDER BY entry_id ASC
                    """,
                    {
                        "user_id": int(user_id),
                        "account_id": int(account_id),
                    },
                )
                rows = cur.fetchall()
        return [_entry_from_row(row) for row in rows]

    def get_entry(self, user_id: int, entry_id: int) -> Optional[Dict[str, Any]]:
        with pg_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    f"""
                    SELECT {ENTRY_SELECT}
                    FROM tools.bankroll_entries
                    WHERE entry_id = %(entry_id)s
                      AND user_id = %(user_id)s
                      AND deleted_at_utc IS NULL
                    LIMIT 1
                    """,
                    {
                        "entry_id": int(entry_id),
                        "user_id": int(user_id),
                    },
                )
                row = cur.fetchone()
        return _entry_from_row(row) if row else None

    def create_entry(
        self,
        user_id: int,
        account_id: int,
        data: Mapping[str, Any],
        *,
        max_entries: Optional[int],
    ) -> Dict[str, Any]:
        with pg_conn() as conn:
            try:
                with conn.cursor() as cur:
                    cur.execute(
                        "SELECT user_id FROM app.users WHERE user_id = %(user_id)s FOR UPDATE",
                        {"user_id": int(user_id)},
                    )
                    if cur.fetchone() is None:
                        raise BankrollResourceNotFound()

                    cur.execute(
                        """
                        SELECT account_id
                        FROM tools.bankroll_accounts
                        WHERE account_id = %(account_id)s
                          AND user_id = %(user_id)s
                          AND status = 'active'
                        LIMIT 1
                        """,
                        {
                            "account_id": int(account_id),
                            "user_id": int(user_id),
                        },
                    )
                    if cur.fetchone() is None:
                        raise BankrollResourceNotFound()

                    if max_entries is not None:
                        cur.execute(
                            """
                            SELECT COUNT(*)
                            FROM tools.bankroll_entries
                            WHERE user_id = %(user_id)s
                              AND deleted_at_utc IS NULL
                            """,
                            {"user_id": int(user_id)},
                        )
                        active_count = int(cur.fetchone()[0])
                        if active_count >= int(max_entries):
                            raise BankrollEntryLimitReached(int(max_entries))

                    cur.execute(
                        f"""
                        INSERT INTO tools.bankroll_entries (
                            account_id,
                            user_id,
                            placed_at_utc,
                            event_name,
                            bookmaker,
                            market,
                            selection,
                            odds_decimal,
                            stake_cents,
                            result,
                            return_cents,
                            notes,
                            settled_at_utc
                        ) VALUES (
                            %(account_id)s,
                            %(user_id)s,
                            %(placed_at_utc)s,
                            %(event_name)s,
                            %(bookmaker)s,
                            %(market)s,
                            %(selection)s,
                            %(odds_decimal)s,
                            %(stake_cents)s,
                            %(result)s,
                            %(return_cents)s,
                            %(notes)s,
                            %(settled_at_utc)s
                        )
                        RETURNING {ENTRY_SELECT}
                        """,
                        {
                            "account_id": int(account_id),
                            "user_id": int(user_id),
                            **dict(data),
                        },
                    )
                    row = cur.fetchone()
                conn.commit()
            except Exception:
                conn.rollback()
                raise
        return _entry_from_row(row)

    def update_entry(self, user_id: int, entry_id: int, data: Mapping[str, Any]) -> Optional[Dict[str, Any]]:
        allowed_fields = (
            "placed_at_utc",
            "event_name",
            "bookmaker",
            "market",
            "selection",
            "odds_decimal",
            "stake_cents",
            "result",
            "return_cents",
            "notes",
            "settled_at_utc",
        )
        assignments = [f"{field} = %({field})s" for field in allowed_fields]
        params = {
            "entry_id": int(entry_id),
            "user_id": int(user_id),
            **{field: data.get(field) for field in allowed_fields},
        }
        with pg_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    f"""
                    UPDATE tools.bankroll_entries
                    SET {', '.join(assignments)},
                        updated_at_utc = NOW()
                    WHERE entry_id = %(entry_id)s
                      AND user_id = %(user_id)s
                      AND deleted_at_utc IS NULL
                    RETURNING {ENTRY_SELECT}
                    """,
                    params,
                )
                row = cur.fetchone()
            conn.commit()
        return _entry_from_row(row) if row else None

    def soft_delete_entry(self, user_id: int, entry_id: int) -> bool:
        with pg_conn() as conn:
            try:
                with conn.cursor() as cur:
                    cur.execute(
                        "SELECT user_id FROM app.users WHERE user_id = %(user_id)s FOR UPDATE",
                        {"user_id": int(user_id)},
                    )
                    if cur.fetchone() is None:
                        raise BankrollResourceNotFound()
                    cur.execute(
                        """
                        UPDATE tools.bankroll_entries
                        SET deleted_at_utc = NOW(),
                            updated_at_utc = NOW()
                        WHERE entry_id = %(entry_id)s
                          AND user_id = %(user_id)s
                          AND deleted_at_utc IS NULL
                        """,
                        {
                            "entry_id": int(entry_id),
                            "user_id": int(user_id),
                        },
                    )
                    deleted = cur.rowcount == 1
                conn.commit()
            except Exception:
                conn.rollback()
                raise
        return deleted
