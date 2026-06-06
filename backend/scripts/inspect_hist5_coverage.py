from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from src.product.historical_coverage_v1 import inspect_hist5_league_coverage
from src.product.model_profiles import get_model_profile, list_model_profiles


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


def _load_default_league_ids(conn, *, limit: int) -> List[int]:
    """
    Fallback operacional para quando nenhum --league-id for informado.
    Usa ligas mapeadas/aprovadas se a tabela existir; senão usa as ligas com mais linhas em team_season_stats.
    """
    sql_mapped = """
      SELECT DISTINCT olm.league_id::int
      FROM odds.odds_league_map olm
      JOIN core.team_season_stats tss ON tss.league_id = olm.league_id
      WHERE olm.enabled = true
        AND olm.mapping_status = 'approved'
      ORDER BY olm.league_id ASC
      LIMIT %(limit)s
    """
    try:
        with conn.cursor() as cur:
            cur.execute(sql_mapped, {"limit": int(limit)})
            rows = cur.fetchall() or []
        ids = [int(r[0]) for r in rows if r and r[0] is not None]
        if ids:
            return ids
    except Exception:
        pass

    sql_stats = """
      SELECT league_id::int
      FROM core.team_season_stats
      GROUP BY league_id
      ORDER BY COUNT(*) DESC, league_id ASC
      LIMIT %(limit)s
    """
    with conn.cursor() as cur:
        cur.execute(sql_stats, {"limit": int(limit)})
        rows = cur.fetchall() or []

    return [int(r[0]) for r in rows if r and r[0] is not None]


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Inspeciona cobertura histórica para o perfil experimental hist5, sem alterar snapshots.",
    )
    parser.add_argument(
        "--profile-key",
        default="model_v1_hist5_decay",
        help="Perfil de modelo a inspecionar. Default: model_v1_hist5_decay.",
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
        help="Temporada alvo. Se omitida, usa MAX(season) da liga em core.team_season_stats.",
    )
    parser.add_argument(
        "--problem-leagues",
        action="store_true",
        help="Usa as ligas problemáticas observadas na auditoria recente.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=20,
        help="Quantidade de ligas padrão quando --league-id não for informado. Default: 20.",
    )
    parser.add_argument(
        "--pretty",
        action="store_true",
        help="Imprime JSON indentado.",
    )
    parser.add_argument(
        "--list-profiles",
        action="store_true",
        help="Lista perfis disponíveis e encerra.",
    )
    args = parser.parse_args()

    if args.list_profiles:
        print(json.dumps({"profiles": list_model_profiles()}, ensure_ascii=False, indent=2))
        return

    profile = get_model_profile(args.profile_key)

    from src.db.pg import pg_conn

    with pg_conn() as conn:
        league_ids = _parse_league_ids(args.league_id, use_problem_defaults=bool(args.problem_leagues))
        if not league_ids:
            league_ids = _load_default_league_ids(conn, limit=int(args.limit))

        results: List[Dict[str, Any]] = []
        for league_id in league_ids:
            results.append(
                inspect_hist5_league_coverage(
                    conn,
                    league_id=int(league_id),
                    target_season=args.season,
                    profile_key=profile.key,
                )
            )

    payload = {
        "ok": True,
        "connected_to_snapshot": False,
        "purpose": "historical_coverage_diagnostics_only",
        "profile": profile.as_dict(),
        "league_count": len(results),
        "results": results,
    }

    print(json.dumps(payload, ensure_ascii=False, indent=2 if args.pretty else None, default=str))


if __name__ == "__main__":
    main()