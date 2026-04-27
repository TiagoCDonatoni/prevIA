from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List

from src.db.pg import pg_conn
from src.odds.jobs.odds_refresh_resolve_job import (
    _client,
    _persist_odds_h2h_batch,
    _persist_odds_market_batch,
)  # reuse interno (sem duplicar SQL)from src.integrations.theodds.client import TheOddsApiError


def odds_refresh(
    *,
    sport_key: str,
    regions: str = "eu",
) -> Dict[str, Any]:
    """
    Job cron-ready:
    - busca odds H2H no provider
    - persiste em odds.odds_events + odds snapshots
    Sem resolver fixture aqui.
    """
    try:
        raw: List[Dict[str, Any]] = _client().get_odds_h2h(
            sport_key=sport_key,
            regions=regions,
            markets="h2h,totals",
        )
    except TheOddsApiError as e:
        return {"ok": False, "stage": "provider", "error": str(e), "sport_key": sport_key, "regions": regions}

    captured_at = datetime.now(timezone.utc)

    with pg_conn() as conn:
        conn.autocommit = False

        counters = _persist_odds_h2h_batch(
            conn,
            sport_key=sport_key,
            raw_events=raw,
            captured_at_utc=captured_at,
        )

        market_counters = _persist_odds_market_batch(
            conn,
            raw_events=raw,
            captured_at_utc=captured_at,
        )
        counters.update(market_counters)

        conn.commit()

    return {
        "ok": True,
        "sport_key": sport_key,
        "regions": regions,
        "captured_at_utc": captured_at.isoformat(),
        "counters": counters,
    }