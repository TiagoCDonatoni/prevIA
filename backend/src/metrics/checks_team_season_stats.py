from __future__ import annotations

from typing import Iterable, Optional

from src.db.pg import pg_conn


def _sql_in(values: Iterable[int]) -> str:
    vals = [int(v) for v in values]
    if not vals:
        return "(NULL)"
    return "(" + ",".join(str(v) for v in vals) + ")"


def _build_where(*, alias: str, seasons: Optional[list[int]], league_ids: Optional[list[int]]) -> str:
    parts = []
    prefix = f"{alias}." if alias else ""

    if seasons:
        parts.append(f"{prefix}season IN {_sql_in(seasons)}")
    if league_ids:
        parts.append(f"{prefix}league_id IN {_sql_in(league_ids)}")

    if not parts:
        return ""
    return "WHERE " + " AND ".join(parts)


def run_team_season_stats_checks(
    *,
    seasons: Optional[list[int]] = None,
    league_ids: Optional[list[int]] = None,
) -> dict[str, int]:
    where_stats = _build_where(alias="", seasons=seasons, league_ids=league_ids)
    where_p = _build_where(alias="p", seasons=seasons, league_ids=league_ids)
    where_s = _build_where(alias="s", seasons=seasons, league_ids=league_ids)

    checks = [
        (
            "played_mismatch",
            f"""
            SELECT COUNT(*)::int
            FROM core.team_season_stats
            {where_stats}
            AND played <> (wins + draws + losses)
            """ if where_stats else """
            SELECT COUNT(*)::int
            FROM core.team_season_stats
            WHERE played <> (wins + draws + losses)
            """,
        ),
        (
            "points_mismatch",
            f"""
            SELECT COUNT(*)::int
            FROM core.team_season_stats
            {where_stats}
            AND points <> (wins * 3 + draws)
            """ if where_stats else """
            SELECT COUNT(*)::int
            FROM core.team_season_stats
            WHERE points <> (wins * 3 + draws)
            """,
        ),
        (
            "goal_diff_mismatch",
            f"""
            SELECT COUNT(*)::int
            FROM core.team_season_stats
            {where_stats}
            AND goal_diff <> (goals_for - goals_against)
            """ if where_stats else """
            SELECT COUNT(*)::int
            FROM core.team_season_stats
            WHERE goal_diff <> (goals_for - goals_against)
            """,
        ),
        (
            "home_played_mismatch",
            f"""
            SELECT COUNT(*)::int
            FROM core.team_season_stats
            {where_stats}
            AND home_played <> (home_wins + home_draws + home_losses)
            """ if where_stats else """
            SELECT COUNT(*)::int
            FROM core.team_season_stats
            WHERE home_played <> (home_wins + home_draws + home_losses)
            """,
        ),
        (
            "away_played_mismatch",
            f"""
            SELECT COUNT(*)::int
            FROM core.team_season_stats
            {where_stats}
            AND away_played <> (away_wins + away_draws + away_losses)
            """ if where_stats else """
            SELECT COUNT(*)::int
            FROM core.team_season_stats
            WHERE away_played <> (away_wins + away_draws + away_losses)
            """,
        ),
        (
            "coverage_missing_fixture_teams",
            f"""
            WITH participants AS (
              SELECT DISTINCT f.league_id, f.season, f.home_team_id AS team_id
              FROM core.fixtures f
              WHERE COALESCE(f.is_cancelled, false) = false

              UNION

              SELECT DISTINCT f.league_id, f.season, f.away_team_id AS team_id
              FROM core.fixtures f
              WHERE COALESCE(f.is_cancelled, false) = false
            )
            SELECT COUNT(*)::int
            FROM participants p
            LEFT JOIN core.team_season_stats s
              ON s.league_id = p.league_id
             AND s.season = p.season
             AND s.team_id = p.team_id
            {where_p}
            {"AND" if where_p else "WHERE"} s.team_id IS NULL
            """,
        ),
        (
            "coverage_orphan_stats_rows",
            f"""
            WITH participants AS (
              SELECT DISTINCT f.league_id, f.season, f.home_team_id AS team_id
              FROM core.fixtures f
              WHERE COALESCE(f.is_cancelled, false) = false

              UNION

              SELECT DISTINCT f.league_id, f.season, f.away_team_id AS team_id
              FROM core.fixtures f
              WHERE COALESCE(f.is_cancelled, false) = false
            )
            SELECT COUNT(*)::int
            FROM core.team_season_stats s
            LEFT JOIN participants p
              ON p.league_id = s.league_id
             AND p.season = s.season
             AND p.team_id = s.team_id
            {where_s}
            {"AND" if where_s else "WHERE"} p.team_id IS NULL
            """,
        ),
    ]

    results: dict[str, int] = {}
    failures = []

    with pg_conn() as conn:
        cur = conn.cursor()
        for name, sql in checks:
            cur.execute(sql)
            n = int(cur.fetchone()[0])
            results[name] = n
            if n != 0:
                failures.append((name, n))

    if failures:
        details = ", ".join(f"{name}={n}" for name, n in failures)
        raise RuntimeError(f"team_season_stats checks failed: {details}")

    print("OK: team_season_stats sanity + coverage checks passed")
    return results