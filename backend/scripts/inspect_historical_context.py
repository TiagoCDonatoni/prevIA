from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from src.product.historical_context_v1 import build_match_historical_context
from src.product.historical_coverage_v1 import resolve_target_season
from src.product.model_profiles import get_model_profile, list_model_profiles


def _parse_int_list(values: Optional[List[str]]) -> List[int]:
    out: List[int] = []
    for value in values or []:
        for part in str(value).split(","):
            part = part.strip()
            if not part:
                continue
            out.append(int(part))
    return sorted(set(out))


def _load_default_league_ids(conn, *, limit: int) -> List[int]:
    sql = """
      SELECT DISTINCT olm.league_id::int
      FROM odds.odds_league_map olm
      JOIN core.team_season_stats tss ON tss.league_id = olm.league_id
      WHERE COALESCE(olm.enabled, false) = true
        AND olm.mapping_status = 'approved'
      ORDER BY olm.league_id ASC
      LIMIT %(limit)s
    """

    with conn.cursor() as cur:
        cur.execute(sql, {"limit": int(limit)})
        rows = cur.fetchall() or []

    return [int(r[0]) for r in rows if r and r[0] is not None]


def _pick_default_matchup(conn, *, league_id: int, season: Optional[int]) -> Optional[Tuple[int, int, int]]:
    target_season = resolve_target_season(conn, league_id=int(league_id), requested_season=season)

    if target_season is None:
        return None

    sql = """
      SELECT team_id::int
      FROM core.team_season_stats
      WHERE league_id = %(league_id)s
        AND season = %(season)s
        AND played > 0
      ORDER BY played DESC, points DESC, goal_diff DESC, team_id ASC
      LIMIT 2
    """

    with conn.cursor() as cur:
        cur.execute(sql, {"league_id": int(league_id), "season": int(target_season)})
        rows = cur.fetchall() or []

    team_ids = [int(r[0]) for r in rows if r and r[0] is not None]

    if len(team_ids) < 2:
        return None

    return int(target_season), int(team_ids[0]), int(team_ids[1])


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Inspeciona contexto histórico ponderado hist5 para matchups, sem alterar snapshots.",
    )
    parser.add_argument("--profile-key", default="model_v1_hist5_decay")
    parser.add_argument(
        "--league-id",
        action="append",
        default=[],
        help="Liga a inspecionar. Pode repetir ou passar CSV.",
    )
    parser.add_argument("--season", type=int, default=None)
    parser.add_argument("--home-team-id", type=int, default=None)
    parser.add_argument("--away-team-id", type=int, default=None)
    parser.add_argument("--limit", type=int, default=10)
    parser.add_argument("--pretty", action="store_true")
    parser.add_argument("--list-profiles", action="store_true")
    args = parser.parse_args()

    if args.list_profiles:
        print(json.dumps({"profiles": list_model_profiles()}, ensure_ascii=False, indent=2))
        return

    profile = get_model_profile(str(args.profile_key))

    from src.db.pg import pg_conn

    with pg_conn() as conn:
        league_ids = _parse_int_list(args.league_id)

        if not league_ids:
            league_ids = _load_default_league_ids(conn, limit=int(args.limit))

        results: List[Dict[str, Any]] = []

        for league_id in league_ids:
            home_team_id = args.home_team_id
            away_team_id = args.away_team_id
            season = args.season

            if home_team_id is None or away_team_id is None:
                picked = _pick_default_matchup(conn, league_id=int(league_id), season=args.season)

                if picked is None:
                    results.append(
                        {
                            "status": "no_default_matchup_found",
                            "league_id": int(league_id),
                            "season": args.season,
                        }
                    )
                    continue

                season, home_team_id, away_team_id = picked

            results.append(
                build_match_historical_context(
                    conn,
                    league_id=int(league_id),
                    season=season,
                    home_team_id=int(home_team_id),
                    away_team_id=int(away_team_id),
                    profile_key=profile.key,
                )
            )

    payload = {
        "ok": True,
        "connected_to_snapshot": False,
        "calls_external_api": False,
        "mutates_database": False,
        "purpose": "historical_context_diagnostics_only",
        "profile": profile.as_dict(),
        "league_count": len(results),
        "results": results,
    }

    print(json.dumps(payload, ensure_ascii=False, indent=2 if args.pretty else None, default=str))


if __name__ == "__main__":
    main()