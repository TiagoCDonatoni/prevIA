from __future__ import annotations

from functools import lru_cache
from typing import Any, Dict

from src.db.pg import pg_conn


@lru_cache(maxsize=200_000)
def _get_team_season_row_or_none(*, team_id: int, league_id: int, season: int):
    sql = """
    SELECT
      played,
      points_per_game,
      goals_for::numeric / NULLIF(played, 0) AS gf_pg,
      goals_against::numeric / NULLIF(played, 0) AS ga_pg,
      goal_diff::numeric / NULLIF(played, 0) AS gd_pg,
      CASE WHEN home_played > 0 THEN home_points::numeric / home_played ELSE 0 END AS home_ppg,
      CASE WHEN away_played > 0 THEN away_points::numeric / away_played ELSE 0 END AS away_ppg,
      metric_version
    FROM core.team_season_stats
    WHERE league_id = %s AND season = %s AND team_id = %s
    """
    with pg_conn() as conn:
        cur = conn.cursor()
        cur.execute(sql, (league_id, season, team_id))
        return cur.fetchone()


@lru_cache(maxsize=100_000)
def _get_latest_same_league_team_season_or_none(*, team_id: int, league_id: int):
    sql = """
    SELECT MAX(season)
    FROM core.team_season_stats
    WHERE league_id = %s
      AND team_id = %s
    """
    with pg_conn() as conn:
        cur = conn.cursor()
        cur.execute(sql, (league_id, team_id))
        row = cur.fetchone()
        return int(row[0]) if row and row[0] is not None else None


def resolve_team_season_stats_row(
    *,
    team_id: int,
    league_id: int,
    requested_season: int,
    allow_season_fallback: bool = False,
) -> Dict[str, Any]:
    exact_row = _get_team_season_row_or_none(
        team_id=int(team_id),
        league_id=int(league_id),
        season=int(requested_season),
    )
    if exact_row is not None:
        return {
            "row": exact_row,
            "season_requested": int(requested_season),
            "season_used": int(requested_season),
            "season_mode": "exact",
            "stats_found": True,
        }

    if not allow_season_fallback:
        return {
            "row": None,
            "season_requested": int(requested_season),
            "season_used": None,
            "season_mode": "none",
            "stats_found": False,
        }

    fallback_season = _get_latest_same_league_team_season_or_none(
        team_id=int(team_id),
        league_id=int(league_id),
    )
    if fallback_season is None or int(fallback_season) == int(requested_season):
        return {
            "row": None,
            "season_requested": int(requested_season),
            "season_used": None,
            "season_mode": "none",
            "stats_found": False,
        }

    fallback_row = _get_team_season_row_or_none(
        team_id=int(team_id),
        league_id=int(league_id),
        season=int(fallback_season),
    )
    if fallback_row is None:
        return {
            "row": None,
            "season_requested": int(requested_season),
            "season_used": None,
            "season_mode": "none",
            "stats_found": False,
        }

    return {
        "row": fallback_row,
        "season_requested": int(requested_season),
        "season_used": int(fallback_season),
        "season_mode": "same_league_team_latest",
        "stats_found": True,
    }