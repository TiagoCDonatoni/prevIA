from __future__ import annotations

from functools import lru_cache

from src.db.pg import pg_conn


FEATURE_VERSION = "features_v1"


@lru_cache(maxsize=200_000)
def _get_team_season_row_or_none(*, team_id: int, league_id: int, season: int):
    """
    Retorna a row da core.team_season_stats ou None.
    Importantíssimo: cacheia também o 'None' (miss), evitando query repetida.
    """
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
        return cur.fetchone()  # None se não existir


def build_team_features(
    *,
    team_id: int,
    league_id: int,
    season: int,
) -> dict:
    row = _get_team_season_row_or_none(team_id=team_id, league_id=league_id, season=season)
    if row is None:
        raise ValueError("team_season_stats not found for given inputs")

    (
        played,
        ppg,
        gf_pg,
        ga_pg,
        gd_pg,
        home_ppg,
        away_ppg,
        metric_version,
    ) = row

    return {
        "team_id": team_id,
        "league_id": league_id,
        "season": season,
        "played": int(played),
        "ppg": float(ppg),
        "gf_pg": float(gf_pg),
        "ga_pg": float(ga_pg),
        "gd_pg": float(gd_pg),
        "home_ppg": float(home_ppg),
        "away_ppg": float(away_ppg),
        "feature_version": FEATURE_VERSION,
        "metric_version": metric_version,
    }
