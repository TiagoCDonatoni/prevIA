from __future__ import annotations

from typing import Any, Dict, Optional, List

from src.product.matchup_snapshot_builder_v1 import rebuild_matchup_snapshots_v1
from src.db.pg import connect_pg
from src.product.model_registry import get_active_model_version


def snapshots_materialize(
    *,
    sport_key: str,
    mode: str = "window",
    hours_ahead: int = 720,
    limit: int = 200,
    model_version: Optional[str] = None,
    event_ids: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """
    Job cron-ready:
    - materializa snapshots (matchup_snapshot_v1) para um sport_key
    - abre/fecha sua própria conexão
    - usa a model_version ativa do produto por padrão
    """
    effective_model_version = (model_version or "").strip() or get_active_model_version()

    conn = connect_pg()
    try:
        counters = rebuild_matchup_snapshots_v1(
            conn,
            sport_key=sport_key,
            hours_ahead=int(hours_ahead),
            limit=int(limit),
            model_version=effective_model_version,
            event_ids=event_ids,
        )
        conn.commit()
        return {
            "ok": True,
            "sport_key": sport_key,
            "mode": mode,
            "hours_ahead": int(hours_ahead),
            "limit": int(limit),
            "model_version": effective_model_version,
            "counters": counters,
        }
    finally:
        try:
            conn.close()
        except Exception:
            pass