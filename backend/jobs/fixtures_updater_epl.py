from __future__ import annotations

import inspect
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any


# Ensure project root (backend/) is on sys.path so `import src.*` works when running from jobs/
PROJECT_ROOT = Path(__file__).resolve().parents[1]  # backend/
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.etl.core_etl_pg import run_core_etl  # noqa: E402


def _call_run_core_etl_dynamic(**kwargs) -> Any:
    """
    Chama run_core_etl apenas com kwargs que existam na assinatura real.
    Evita quebrar quando o runner não tem certos parâmetros (ex.: seasons).
    """
    sig = inspect.signature(run_core_etl)
    allowed = set(sig.parameters.keys())
    filtered = {k: v for k, v in kwargs.items() if k in allowed}
    return run_core_etl(**filtered)


def main():
    league_id = 39  # EPL
    provider = "apifootball"
    endpoint = "fixtures"

    # Janela recente (UTC): últimos 5 dias até amanhã (absorve jogos atrasados/correções)
    now = datetime.now(timezone.utc)
    date_from = (now - timedelta(days=5)).date().isoformat()
    date_to = (now + timedelta(days=1)).date().isoformat()

    result = _call_run_core_etl_dynamic(
        provider=provider,
        endpoint=endpoint,
        limit=200000,
        league_ids=[league_id],

        # Tentativas comuns de parâmetros de data (serão filtradas pela assinatura real)
        date_from=date_from,
        date_to=date_to,
        from_date=date_from,
        to_date=date_to,
        start_date=date_from,
        end_date=date_to,
    )

    print(
        {
            "job": "fixtures_updater_epl",
            "league_id": league_id,
            "window": {"from": date_from, "to": date_to},
            "result": result,
        }
    )


if __name__ == "__main__":
    main()
