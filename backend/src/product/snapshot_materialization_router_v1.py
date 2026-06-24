from __future__ import annotations

from typing import Any, Dict, List, Optional

from src.product.hist5_shadow_snapshot_builder_v1 import (
    HIST5_SHADOW_MODEL_VERSION,
    rebuild_hist5_shadow_snapshots_v1,
)
from src.product.matchup_snapshot_builder_v1 import rebuild_matchup_snapshots_v1


HIST5_PUBLIC_MODEL_VERSION = "model_v1_hist5_decay"


def is_hist5_snapshot_model(model_version: str) -> bool:
    mv = str(model_version or "").strip()
    return mv in {HIST5_PUBLIC_MODEL_VERSION, HIST5_SHADOW_MODEL_VERSION}


def rebuild_product_snapshots_for_model_v1(
    conn,
    *,
    sport_key: str,
    model_version: str,
    event_ids: Optional[List[str]] = None,
    hours_ahead: int = 720,
    limit: int = 200,
    calc_version: str = "",
    force: bool = False,
    hist5_as_of_mode: str = "previous_seasons",
) -> Dict[str, Any]:
    """
    Roteador conservador de materialização.

    - model_v0 usa o builder público antigo.
    - model_v1_hist5_decay usa o builder hist5 já corrigido com narrative_context.
    - Não altera PREVIA_MODEL_VERSION.
    - Não chama API externa.
    - Não faz commit; quem chamou continua controlando transação.
    """

    effective_model_version = str(model_version or "").strip()

    if is_hist5_snapshot_model(effective_model_version):
        counters = rebuild_hist5_shadow_snapshots_v1(
            conn,
            sport_key=str(sport_key),
            event_ids=event_ids,
            hours_ahead=int(hours_ahead),
            limit=int(limit),
            calc_version=str(calc_version or "calc_v1"),
            model_version=effective_model_version,
            as_of_mode=str(hist5_as_of_mode or "previous_seasons"),
            apply=True,
        )

        counters = dict(counters or {})

        total_upserted = int(counters.get("snapshots_shadow_upserted") or 0)
        team_fallback = int(counters.get("snapshots_team_fallback") or 0)
        event_fallback = int(counters.get("snapshots_event_fallback") or 0)

        # Compatibilidade com os jobs/admin antigos.
        # No builder v0, snapshots_upserted representa principalmente fixture-resolved.
        counters["snapshots_upserted"] = max(
            0,
            total_upserted - team_fallback - event_fallback,
        )
        counters["snapshots_total_upserted"] = total_upserted
        counters["snapshots_hist5_upserted"] = total_upserted
        counters["model_builder"] = "hist5_candidate_v1"
        counters["model_version"] = effective_model_version
        counters["hist5_as_of_mode"] = str(hist5_as_of_mode or "previous_seasons")
        counters["calls_external_api"] = False

        return counters

    counters = rebuild_matchup_snapshots_v1(
        conn,
        sport_key=str(sport_key),
        hours_ahead=int(hours_ahead),
        limit=int(limit),
        model_version=effective_model_version,
        event_ids=event_ids,
        calc_version=str(calc_version or ""),
        force=bool(force),
    )

    counters = dict(counters or {})
    counters["model_builder"] = "matchup_snapshot_builder_v1"
    counters["model_version"] = effective_model_version
    counters["calls_external_api"] = False

    return counters