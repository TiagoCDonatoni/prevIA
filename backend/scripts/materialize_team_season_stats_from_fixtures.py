from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import List, Optional

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from src.product.team_season_stats_materializer_v1 import (  # noqa: E402
    DEFAULT_MATERIALIZABLE_LEAGUES,
    materialize_many_team_season_stats_from_fixtures,
)


def _parse_int_list(values: Optional[List[str]]) -> List[int]:
    out: List[int] = []
    for value in values or []:
        for part in str(value).split(","):
            part = part.strip()
            if not part:
                continue
            out.append(int(part))
    return sorted(set(out), reverse=True)


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Materializa temporadas faltantes em core.team_season_stats a partir de core.fixtures. "
            "Por padrão é dry-run. Só grava no banco com --apply."
        )
    )
    parser.add_argument(
        "--profile-key",
        default="model_v1_hist5_decay",
        help="Perfil usado para resolver a janela de temporadas. Default: model_v1_hist5_decay.",
    )
    parser.add_argument(
        "--league-id",
        action="append",
        default=[],
        help="Liga a materializar. Pode repetir ou passar CSV: --league-id 71,78.",
    )
    parser.add_argument(
        "--season",
        action="append",
        default=[],
        help="Restringe a temporadas específicas. Pode repetir ou passar CSV: --season 2024,2023.",
    )
    parser.add_argument(
        "--materializable-defaults",
        action="store_true",
        help="Usa as 19 ligas detectadas como materializáveis a partir de core.fixtures.",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Grava no banco. Sem esta flag, roda apenas dry-run.",
    )
    parser.add_argument(
        "--pretty",
        action="store_true",
        help="Imprime JSON indentado.",
    )
    args = parser.parse_args()

    league_ids = _parse_int_list(args.league_id)
    if args.materializable_defaults:
        league_ids = sorted(set(league_ids + list(DEFAULT_MATERIALIZABLE_LEAGUES)))

    if not league_ids:
        raise SystemExit(
            "Informe --league-id ou use --materializable-defaults. "
            "Exemplo dry-run: python scripts/materialize_team_season_stats_from_fixtures.py --league-id 71 --pretty"
        )

    seasons = _parse_int_list(args.season)

    from src.db.pg import pg_conn

    with pg_conn() as conn:
        try:
            payload = materialize_many_team_season_stats_from_fixtures(
                conn,
                league_ids=league_ids,
                profile_key=args.profile_key,
                apply=bool(args.apply),
                seasons=seasons or None,
            )

            if args.apply:
                conn.commit()
            else:
                conn.rollback()

        except Exception:
            conn.rollback()
            raise

    print(json.dumps(payload, ensure_ascii=False, indent=2 if args.pretty else None, default=str))


if __name__ == "__main__":
    main()