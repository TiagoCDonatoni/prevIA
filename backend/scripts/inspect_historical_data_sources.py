from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from src.product.historical_data_sources_v1 import (  # noqa: E402
    DEFAULT_PROVIDER_ALIASES,
    inspect_historical_data_sources,
    resolve_default_league_ids,
)
from src.product.model_profiles import get_model_profile  # noqa: E402


DEFAULT_PROBLEM_LEAGUES = [71, 253, 113, 128, 13, 98, 265, 11, 292]


def _parse_league_ids(values: Optional[List[str]], *, use_problem_defaults: bool) -> List[int]:
    if use_problem_defaults:
        return list(DEFAULT_PROBLEM_LEAGUES)

    out: List[int] = []
    for value in values or []:
        for part in str(value).split(","):
            part = part.strip()
            if not part:
                continue
            out.append(int(part))

    return sorted(set(out))


def _parse_provider_aliases(value: str) -> List[str]:
    aliases = [part.strip() for part in str(value or "").split(",") if part.strip()]
    return aliases or list(DEFAULT_PROVIDER_ALIASES)


def _build_summary(results: List[Dict[str, Any]]) -> Dict[str, Any]:
    by_recommendation: Dict[str, int] = {}
    by_stats_season_count: Dict[str, int] = {}
    by_core_fixture_season_count: Dict[str, int] = {}
    by_raw_fixture_season_count: Dict[str, int] = {}

    for item in results:
        recommendation = str(item.get("recommendation") or "UNKNOWN")
        by_recommendation[recommendation] = by_recommendation.get(recommendation, 0) + 1

        source_seasons = item.get("source_seasons") or {}
        stats_n = len(source_seasons.get("team_season_stats") or [])
        core_n = len(source_seasons.get("core_fixtures") or [])
        raw_n = len(source_seasons.get("raw_fixtures") or [])

        by_stats_season_count[str(stats_n)] = by_stats_season_count.get(str(stats_n), 0) + 1
        by_core_fixture_season_count[str(core_n)] = by_core_fixture_season_count.get(str(core_n), 0) + 1
        by_raw_fixture_season_count[str(raw_n)] = by_raw_fixture_season_count.get(str(raw_n), 0) + 1

    return {
        "by_recommendation": dict(sorted(by_recommendation.items())),
        "by_team_season_stats_season_count": dict(
            sorted(by_stats_season_count.items(), key=lambda kv: int(kv[0]))
        ),
        "by_core_fixture_season_count": dict(
            sorted(by_core_fixture_season_count.items(), key=lambda kv: int(kv[0]))
        ),
        "by_raw_fixture_season_count": dict(
            sorted(by_raw_fixture_season_count.items(), key=lambda kv: int(kv[0]))
        ),
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Inspeciona se temporadas históricas existem em team_season_stats, core.fixtures, RAW ou checkpoints. "
            "Não chama API e não altera snapshots."
        )
    )
    parser.add_argument(
        "--profile-key",
        default="model_v1_hist5_decay",
        help="Perfil de modelo a usar para resolver a janela. Default: model_v1_hist5_decay.",
    )
    parser.add_argument(
        "--league-id",
        action="append",
        default=[],
        help="Liga a inspecionar. Pode repetir ou passar CSV: --league-id 71,253.",
    )
    parser.add_argument(
        "--season",
        type=int,
        default=None,
        help="Temporada alvo. Se omitida, usa maior season em core.team_season_stats/core.fixtures.",
    )
    parser.add_argument(
        "--problem-leagues",
        action="store_true",
        help="Usa as ligas problemáticas observadas na auditoria recente.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=50,
        help="Quantidade de ligas padrão quando --league-id não for informado. Default: 50.",
    )
    parser.add_argument(
        "--provider-aliases",
        default=",".join(DEFAULT_PROVIDER_ALIASES),
        help="Providers RAW aceitos, separados por vírgula. Default: apifootball,api-football.",
    )
    parser.add_argument(
        "--pretty",
        action="store_true",
        help="Imprime JSON indentado.",
    )
    args = parser.parse_args()

    profile = get_model_profile(args.profile_key)
    provider_aliases = _parse_provider_aliases(args.provider_aliases)

    from src.db.pg import pg_conn

    with pg_conn() as conn:
        league_ids = _parse_league_ids(args.league_id, use_problem_defaults=bool(args.problem_leagues))
        if not league_ids:
            league_ids = resolve_default_league_ids(conn, limit=int(args.limit))

        results: List[Dict[str, Any]] = []
        for league_id in league_ids:
            results.append(
                inspect_historical_data_sources(
                    conn,
                    league_id=int(league_id),
                    target_season=args.season,
                    profile_key=profile.key,
                    provider_aliases=provider_aliases,
                )
            )

    payload = {
        "ok": True,
        "connected_to_snapshot": False,
        "calls_external_api": False,
        "mutates_database": False,
        "purpose": "historical_data_source_diagnostics_only",
        "profile": profile.as_dict(),
        "provider_aliases": provider_aliases,
        "league_count": len(results),
        "summary": _build_summary(results),
        "results": results,
    }

    print(json.dumps(payload, ensure_ascii=False, indent=2 if args.pretty else None, default=str))


if __name__ == "__main__":
    main()