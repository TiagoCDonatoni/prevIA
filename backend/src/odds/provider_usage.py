from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, Optional


PROVIDER_ODDSPAPI = "oddspapi"
ENDPOINT_GROUP_REST = "rest"


@dataclass(frozen=True)
class ProviderUsageClaim:
    ok: bool
    provider: str
    endpoint_group: str
    month_start_utc: datetime
    request_count: int
    hard_cap: int
    reserve: int
    operational_cap: int
    remaining_operational: int
    blocked_reason: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "ok": self.ok,
            "provider": self.provider,
            "endpoint_group": self.endpoint_group,
            "month_start_utc": self.month_start_utc.isoformat(),
            "request_count": self.request_count,
            "hard_cap": self.hard_cap,
            "reserve": self.reserve,
            "operational_cap": self.operational_cap,
            "remaining_operational": self.remaining_operational,
            "blocked_reason": self.blocked_reason,
        }


def _month_start_utc_sql() -> str:
    return "date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'"


def ensure_provider_usage_row(
    conn,
    *,
    provider: str,
    endpoint_group: str = ENDPOINT_GROUP_REST,
    hard_cap: int = 250,
    reserve: int = 20,
) -> None:
    hard_cap = max(0, int(hard_cap))
    reserve = max(0, min(int(reserve), hard_cap))

    sql = f"""
      INSERT INTO odds.provider_request_usage (
        provider,
        endpoint_group,
        month_start_utc,
        request_count,
        hard_cap,
        reserve,
        created_at_utc,
        updated_at_utc
      )
      VALUES (
        %(provider)s,
        %(endpoint_group)s,
        {_month_start_utc_sql()},
        0,
        %(hard_cap)s,
        %(reserve)s,
        now(),
        now()
      )
      ON CONFLICT (provider, endpoint_group, month_start_utc) DO UPDATE SET
        hard_cap = EXCLUDED.hard_cap,
        reserve = EXCLUDED.reserve,
        updated_at_utc = now()
    """

    with conn.cursor() as cur:
        cur.execute(
            sql,
            {
                "provider": provider,
                "endpoint_group": endpoint_group,
                "hard_cap": hard_cap,
                "reserve": reserve,
            },
        )


def get_provider_usage_status(
    conn,
    *,
    provider: str,
    endpoint_group: str = ENDPOINT_GROUP_REST,
    hard_cap: int = 250,
    reserve: int = 20,
) -> Dict[str, Any]:
    hard_cap = max(0, int(hard_cap))
    reserve = max(0, min(int(reserve), hard_cap))
    operational_cap = max(0, hard_cap - reserve)

    ensure_provider_usage_row(
        conn,
        provider=provider,
        endpoint_group=endpoint_group,
        hard_cap=hard_cap,
        reserve=reserve,
    )

    sql = f"""
      SELECT
        provider,
        endpoint_group,
        month_start_utc,
        request_count,
        hard_cap,
        reserve,
        last_endpoint,
        last_request_at_utc,
        last_status,
        last_error,
        updated_at_utc
      FROM odds.provider_request_usage
      WHERE provider = %(provider)s
        AND endpoint_group = %(endpoint_group)s
        AND month_start_utc = {_month_start_utc_sql()}
      LIMIT 1
    """

    with conn.cursor() as cur:
        cur.execute(
            sql,
            {
                "provider": provider,
                "endpoint_group": endpoint_group,
            },
        )
        row = cur.fetchone()

    if not row:
        return {
            "ok": False,
            "provider": provider,
            "endpoint_group": endpoint_group,
            "error": "provider_usage_row_not_found",
        }

    request_count = int(row[3] or 0)
    row_hard_cap = int(row[4] or hard_cap)
    row_reserve = int(row[5] or reserve)
    row_operational_cap = max(0, row_hard_cap - row_reserve)

    return {
        "ok": True,
        "provider": row[0],
        "endpoint_group": row[1],
        "month_start_utc": row[2].isoformat() if row[2] else None,
        "request_count": request_count,
        "hard_cap": row_hard_cap,
        "reserve": row_reserve,
        "operational_cap": row_operational_cap,
        "remaining_operational": max(0, row_operational_cap - request_count),
        "is_capped": request_count >= row_operational_cap,
        "last_endpoint": row[6],
        "last_request_at_utc": row[7].isoformat() if row[7] else None,
        "last_status": row[8],
        "last_error": row[9],
        "updated_at_utc": row[10].isoformat() if row[10] else None,
    }


def claim_provider_request(
    conn,
    *,
    provider: str,
    endpoint: str,
    endpoint_group: str = ENDPOINT_GROUP_REST,
    amount: int = 1,
    hard_cap: int = 250,
    reserve: int = 20,
) -> ProviderUsageClaim:
    """
    Reserva requests antes de chamar provider externo.

    Importante:
    - Conta tentativa de request, não sucesso.
    - Usa cap operacional = hard_cap - reserve.
    - Deve rodar dentro da mesma transação do caller.
    """

    amount = max(1, int(amount))
    hard_cap = max(0, int(hard_cap))
    reserve = max(0, min(int(reserve), hard_cap))
    operational_cap = max(0, hard_cap - reserve)

    ensure_provider_usage_row(
        conn,
        provider=provider,
        endpoint_group=endpoint_group,
        hard_cap=hard_cap,
        reserve=reserve,
    )

    sql = f"""
      UPDATE odds.provider_request_usage
      SET
        request_count = request_count + %(amount)s,
        hard_cap = %(hard_cap)s,
        reserve = %(reserve)s,
        last_endpoint = %(endpoint)s,
        last_request_at_utc = now(),
        last_status = 'claimed',
        last_error = NULL,
        updated_at_utc = now()
      WHERE provider = %(provider)s
        AND endpoint_group = %(endpoint_group)s
        AND month_start_utc = {_month_start_utc_sql()}
        AND request_count + %(amount)s <= GREATEST(0, %(hard_cap)s - %(reserve)s)
      RETURNING
        month_start_utc,
        request_count,
        hard_cap,
        reserve
    """

    with conn.cursor() as cur:
        cur.execute(
            sql,
            {
                "provider": provider,
                "endpoint_group": endpoint_group,
                "endpoint": endpoint,
                "amount": amount,
                "hard_cap": hard_cap,
                "reserve": reserve,
            },
        )
        row = cur.fetchone()

    if row:
        request_count = int(row[1] or 0)
        row_hard_cap = int(row[2] or hard_cap)
        row_reserve = int(row[3] or reserve)
        row_operational_cap = max(0, row_hard_cap - row_reserve)

        return ProviderUsageClaim(
            ok=True,
            provider=provider,
            endpoint_group=endpoint_group,
            month_start_utc=row[0],
            request_count=request_count,
            hard_cap=row_hard_cap,
            reserve=row_reserve,
            operational_cap=row_operational_cap,
            remaining_operational=max(0, row_operational_cap - request_count),
            blocked_reason=None,
        )

    status = get_provider_usage_status(
        conn,
        provider=provider,
        endpoint_group=endpoint_group,
        hard_cap=hard_cap,
        reserve=reserve,
    )

    return ProviderUsageClaim(
        ok=False,
        provider=provider,
        endpoint_group=endpoint_group,
        month_start_utc=datetime.now(timezone.utc).replace(day=1, hour=0, minute=0, second=0, microsecond=0),
        request_count=int(status.get("request_count") or 0),
        hard_cap=hard_cap,
        reserve=reserve,
        operational_cap=operational_cap,
        remaining_operational=max(0, operational_cap - int(status.get("request_count") or 0)),
        blocked_reason="provider_monthly_operational_cap_reached",
    )


def record_provider_request_result(
    conn,
    *,
    provider: str,
    endpoint: str,
    endpoint_group: str = ENDPOINT_GROUP_REST,
    status: str,
    error: Optional[str] = None,
) -> None:
    safe_status = str(status or "unknown")[:80]
    safe_error = str(error)[:1000] if error else None

    sql = f"""
      UPDATE odds.provider_request_usage
      SET
        last_endpoint = %(endpoint)s,
        last_request_at_utc = COALESCE(last_request_at_utc, now()),
        last_status = %(status)s,
        last_error = %(error)s,
        updated_at_utc = now()
      WHERE provider = %(provider)s
        AND endpoint_group = %(endpoint_group)s
        AND month_start_utc = {_month_start_utc_sql()}
    """

    with conn.cursor() as cur:
        cur.execute(
            sql,
            {
                "provider": provider,
                "endpoint_group": endpoint_group,
                "endpoint": endpoint,
                "status": safe_status,
                "error": safe_error,
            },
        )