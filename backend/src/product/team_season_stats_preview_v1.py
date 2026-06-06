from __future__ import annotations

from typing import Any, Dict, Iterable, List, Optional, Sequence

from src.product.model_profiles import get_model_profile


DEFAULT_MATERIALIZABLE_LEAGUES = [
    40, 61, 62, 71, 72, 78, 79, 88, 94,
    135, 136, 140, 141, 144, 179, 197, 203, 207, 218,
]


def _safe_int(value: Any, default: int = 0) -> int:
    if value is None:
        return int(default)
    try:
        return int(value)
    except Exception:
        return int(default)


def _safe_float(value: Any, default: float = 0.0) -> float:
    if value is None:
        return float(default)
    try:
        return float(value)
    except Exception:
        return float(default)


def _fetch_dicts(cur) -> List[Dict[str, Any]]:
    cols = [d.name for d in cur.description]
    return [dict(zip(cols, row)) for row in (cur.fetchall() or [])]


def _table_exists(conn, qualified_name: str) -> bool:
    with conn.cursor() as cur:
        cur.execute("SELECT to_regclass(%(name)s) IS NOT NULL", {"name": str(qualified_name)})
        row = cur.fetchone()
    return bool(row and row[0])


def resolve_target_season(conn, *, league_id: int) -> Optional[int]:
    parts: List[str] = []

    if _table_exists(conn, "core.team_season_stats"):
        parts.append(
            """
            SELECT season::int AS season
            FROM core.team_season_stats
            WHERE league_id = %(league_id)s
            """
        )

    if _table_exists(conn, "core.fixtures"):
        parts.append(
            """
            SELECT season::int AS season
            FROM core.fixtures
            WHERE league_id = %(league_id)s
            """
        )

    if not parts:
        return None

    sql = "SELECT MAX(season)::int FROM (" + " UNION ALL ".join(parts) + ") q"

    with conn.cursor() as cur:
        cur.execute(sql, {"league_id": int(league_id)})
        row = cur.fetchone()

    if not row or row[0] is None:
        return None

    return int(row[0])


def load_existing_team_season_summary(
    conn,
    *,
    league_id: int,
    seasons: Sequence[int],
) -> List[Dict[str, Any]]:
    if not seasons or not _table_exists(conn, "core.team_season_stats"):
        return []

    sql = """
      SELECT
        season::int AS season,
        COUNT(DISTINCT team_id)::int AS teams_count,
        COALESCE(SUM(played), 0)::int AS played_sum,
        COALESCE(SUM(home_played), 0)::int AS home_played_sum,
        COALESCE(SUM(away_played), 0)::int AS away_played_sum,
        COALESCE(SUM(goals_for), 0)::int AS goals_for_sum,
        COALESCE(SUM(goals_against), 0)::int AS goals_against_sum,
        COALESCE(SUM(home_goals_for), 0)::int AS home_goals_for_sum,
        COALESCE(SUM(home_goals_against), 0)::int AS home_goals_against_sum,
        COALESCE(SUM(away_goals_for), 0)::int AS away_goals_for_sum,
        COALESCE(SUM(away_goals_against), 0)::int AS away_goals_against_sum,
        MAX(computed_at) AS latest_computed_at
      FROM core.team_season_stats
      WHERE league_id = %(league_id)s
        AND season = ANY(%(seasons)s::int[])
      GROUP BY season
      ORDER BY season DESC
    """

    with conn.cursor() as cur:
        cur.execute(
            sql,
            {"league_id": int(league_id), "seasons": [int(s) for s in seasons]},
        )
        return _fetch_dicts(cur)


def recompute_team_season_summary_from_core_fixtures(
    conn,
    *,
    league_id: int,
    seasons: Sequence[int],
) -> List[Dict[str, Any]]:
    if not seasons or not _table_exists(conn, "core.fixtures"):
        return []

    sql = """
      WITH eligible AS (
        SELECT
          fixture_id,
          league_id,
          season::int AS season,
          home_team_id,
          away_team_id,
          goals_home::int AS goals_home,
          goals_away::int AS goals_away
        FROM core.fixtures
        WHERE league_id = %(league_id)s
          AND season = ANY(%(seasons)s::int[])
          AND COALESCE(is_finished, false) = true
          AND COALESCE(is_cancelled, false) = false
          AND goals_home IS NOT NULL
          AND goals_away IS NOT NULL
          AND home_team_id IS NOT NULL
          AND away_team_id IS NOT NULL
      ), team_rows AS (
        SELECT
          season,
          home_team_id AS team_id,
          1 AS played,
          1 AS home_played,
          0 AS away_played,
          goals_home AS goals_for,
          goals_away AS goals_against,
          goals_home AS home_goals_for,
          goals_away AS home_goals_against,
          0 AS away_goals_for,
          0 AS away_goals_against,
          CASE WHEN goals_home > goals_away THEN 1 ELSE 0 END AS wins,
          CASE WHEN goals_home = goals_away THEN 1 ELSE 0 END AS draws,
          CASE WHEN goals_home < goals_away THEN 1 ELSE 0 END AS losses
        FROM eligible

        UNION ALL

        SELECT
          season,
          away_team_id AS team_id,
          1 AS played,
          0 AS home_played,
          1 AS away_played,
          goals_away AS goals_for,
          goals_home AS goals_against,
          0 AS home_goals_for,
          0 AS home_goals_against,
          goals_away AS away_goals_for,
          goals_home AS away_goals_against,
          CASE WHEN goals_away > goals_home THEN 1 ELSE 0 END AS wins,
          CASE WHEN goals_away = goals_home THEN 1 ELSE 0 END AS draws,
          CASE WHEN goals_away < goals_home THEN 1 ELSE 0 END AS losses
        FROM eligible
      ), team_stats AS (
        SELECT
          season,
          team_id,
          SUM(played)::int AS played,
          SUM(home_played)::int AS home_played,
          SUM(away_played)::int AS away_played,
          SUM(goals_for)::int AS goals_for,
          SUM(goals_against)::int AS goals_against,
          SUM(home_goals_for)::int AS home_goals_for,
          SUM(home_goals_against)::int AS home_goals_against,
          SUM(away_goals_for)::int AS away_goals_for,
          SUM(away_goals_against)::int AS away_goals_against,
          SUM(wins)::int AS wins,
          SUM(draws)::int AS draws,
          SUM(losses)::int AS losses
        FROM team_rows
        GROUP BY season, team_id
      )
      SELECT
        season::int AS season,
        COUNT(DISTINCT team_id)::int AS teams_count,
        COALESCE(SUM(played), 0)::int AS played_sum,
        COALESCE(SUM(home_played), 0)::int AS home_played_sum,
        COALESCE(SUM(away_played), 0)::int AS away_played_sum,
        COALESCE(SUM(goals_for), 0)::int AS goals_for_sum,
        COALESCE(SUM(goals_against), 0)::int AS goals_against_sum,
        COALESCE(SUM(home_goals_for), 0)::int AS home_goals_for_sum,
        COALESCE(SUM(home_goals_against), 0)::int AS home_goals_against_sum,
        COALESCE(SUM(away_goals_for), 0)::int AS away_goals_for_sum,
        COALESCE(SUM(away_goals_against), 0)::int AS away_goals_against_sum,
        COALESCE(SUM(wins), 0)::int AS wins_sum,
        COALESCE(SUM(draws), 0)::int AS draws_sum,
        COALESCE(SUM(losses), 0)::int AS losses_sum
      FROM team_stats
      GROUP BY season
      ORDER BY season DESC
    """

    with conn.cursor() as cur:
        cur.execute(
            sql,
            {"league_id": int(league_id), "seasons": [int(s) for s in seasons]},
        )
        rows = _fetch_dicts(cur)

    for row in rows:
        home_played = _safe_float(row.get("home_played_sum"))
        away_played = _safe_float(row.get("away_played_sum"))
        row["mu_home"] = (
            round(_safe_float(row.get("home_goals_for_sum")) / home_played, 4)
            if home_played
            else None
        )
        row["mu_away"] = (
            round(_safe_float(row.get("away_goals_for_sum")) / away_played, 4)
            if away_played
            else None
        )

    return rows


def _rows_by_season(rows: Iterable[Dict[str, Any]]) -> Dict[int, Dict[str, Any]]:
    out: Dict[int, Dict[str, Any]] = {}
    for row in rows:
        season = row.get("season")
        if season is not None:
            out[int(season)] = row
    return out


def _compare_existing_vs_recomputed(
    *,
    existing: Optional[Dict[str, Any]],
    recomputed: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    if existing is None and recomputed is None:
        return {"status": "no_data"}

    if existing is None and recomputed is not None:
        return {"status": "missing_stats_can_insert"}

    if existing is not None and recomputed is None:
        return {"status": "stats_exist_without_recomputable_fixtures"}

    assert existing is not None and recomputed is not None

    fields = [
        "teams_count",
        "played_sum",
        "home_played_sum",
        "away_played_sum",
        "goals_for_sum",
        "goals_against_sum",
        "home_goals_for_sum",
        "home_goals_against_sum",
        "away_goals_for_sum",
        "away_goals_against_sum",
    ]

    diffs: Dict[str, Dict[str, int]] = {}
    for field in fields:
        existing_value = _safe_int(existing.get(field))
        recomputed_value = _safe_int(recomputed.get(field))
        if existing_value != recomputed_value:
            diffs[field] = {
                "existing": existing_value,
                "recomputed": recomputed_value,
                "delta": recomputed_value - existing_value,
            }

    return {
        "status": "match" if not diffs else "mismatch",
        "diffs": diffs,
    }


def preview_league_team_season_recompute(
    conn,
    *,
    league_id: int,
    profile_key: str = "model_v1_hist5_decay",
) -> Dict[str, Any]:
    profile = get_model_profile(profile_key)
    target_season = resolve_target_season(conn, league_id=int(league_id))

    if target_season is None:
        return {
            "league_id": int(league_id),
            "profile_key": profile.key,
            "status": "no_target_season",
            "target_season": None,
            "target_seasons": [],
            "season_results": [],
        }

    target_seasons = profile.target_seasons(int(target_season))
    existing_rows = load_existing_team_season_summary(
        conn,
        league_id=int(league_id),
        seasons=target_seasons,
    )
    recomputed_rows = recompute_team_season_summary_from_core_fixtures(
        conn,
        league_id=int(league_id),
        seasons=target_seasons,
    )

    existing_by_season = _rows_by_season(existing_rows)
    recomputed_by_season = _rows_by_season(recomputed_rows)

    season_results: List[Dict[str, Any]] = []
    counters: Dict[str, int] = {}

    for season in target_seasons:
        existing = existing_by_season.get(int(season))
        recomputed = recomputed_by_season.get(int(season))
        comparison = _compare_existing_vs_recomputed(existing=existing, recomputed=recomputed)
        status = str(comparison.get("status"))
        counters[status] = counters.get(status, 0) + 1

        season_results.append(
            {
                "season": int(season),
                "comparison": comparison,
                "existing": existing,
                "recomputed": recomputed,
            }
        )

    return {
        "league_id": int(league_id),
        "profile_key": profile.key,
        "status": "ok",
        "target_season": int(target_season),
        "target_seasons": target_seasons,
        "summary": counters,
        "season_results": season_results,
    }


def preview_many_leagues_team_season_recompute(
    conn,
    *,
    league_ids: Sequence[int],
    profile_key: str = "model_v1_hist5_decay",
) -> Dict[str, Any]:
    results = [
        preview_league_team_season_recompute(
            conn,
            league_id=int(league_id),
            profile_key=profile_key,
        )
        for league_id in league_ids
    ]

    aggregate: Dict[str, int] = {}
    for item in results:
        for status, count in (item.get("summary") or {}).items():
            aggregate[str(status)] = aggregate.get(str(status), 0) + int(count)

    return {
        "ok": True,
        "connected_to_snapshot": False,
        "calls_external_api": False,
        "mutates_database": False,
        "purpose": "team_season_stats_recompute_preview_only",
        "league_count": len(results),
        "aggregate": aggregate,
        "results": results,
    }