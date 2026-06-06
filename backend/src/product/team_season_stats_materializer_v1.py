from __future__ import annotations

import re
from typing import Any, Dict, Iterable, List, Optional, Sequence

from src.product.team_season_stats_preview_v1 import (
    DEFAULT_MATERIALIZABLE_LEAGUES,
    preview_league_team_season_recompute,
)


_REQUIRED_COLUMNS = [
    "league_id",
    "season",
    "team_id",
    "played",
    "home_played",
    "away_played",
    "goals_for",
    "goals_against",
    "home_goals_for",
    "home_goals_against",
    "away_goals_for",
    "away_goals_against",
]


_INSERT_EXPRESSIONS = {
    "league_id": "%(league_id)s::int",
    "season": "ts.season",
    "team_id": "ts.team_id",
    "played": "ts.played",
    "home_played": "ts.home_played",
    "away_played": "ts.away_played",
    "goals_for": "ts.goals_for",
    "goals_against": "ts.goals_against",
    "goal_diff": "(ts.goals_for - ts.goals_against)",
    "home_goals_for": "ts.home_goals_for",
    "home_goals_against": "ts.home_goals_against",
    "away_goals_for": "ts.away_goals_for",
    "away_goals_against": "ts.away_goals_against",
    "wins": "ts.wins",
    "draws": "ts.draws",
    "losses": "ts.losses",
    "home_wins": "ts.home_wins",
    "home_draws": "ts.home_draws",
    "home_losses": "ts.home_losses",
    "away_wins": "ts.away_wins",
    "away_draws": "ts.away_draws",
    "away_losses": "ts.away_losses",
    "points": "(ts.wins * 3 + ts.draws)",
    "home_points": "(ts.home_wins * 3 + ts.home_draws)",
    "away_points": "(ts.away_wins * 3 + ts.away_draws)",
    "points_per_game": (
        "CASE WHEN ts.played > 0 "
        "THEN ((ts.wins * 3 + ts.draws)::float / ts.played::float) "
        "ELSE 0 END"
    ),
    "computed_at": "NOW()",
    "computed_at_utc": "NOW()",
    "created_at": "NOW()",
    "created_at_utc": "NOW()",
    "updated_at": "NOW()",
    "updated_at_utc": "NOW()",
}


def _quote_ident(name: str) -> str:
    value = str(name or "")
    if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", value):
        raise ValueError(f"unsafe SQL identifier: {value!r}")
    return f'"{value}"'


def _fetch_dicts(cur) -> List[Dict[str, Any]]:
    cols = [d.name for d in cur.description]
    return [dict(zip(cols, row)) for row in (cur.fetchall() or [])]


def _load_team_season_stats_schema(conn) -> List[Dict[str, Any]]:
    sql = """
      SELECT
        column_name,
        is_nullable,
        column_default
      FROM information_schema.columns
      WHERE table_schema = 'core'
        AND table_name = 'team_season_stats'
      ORDER BY ordinal_position
    """
    with conn.cursor() as cur:
        cur.execute(sql)
        return _fetch_dicts(cur)


def _schema_column_names(schema_rows: Sequence[Dict[str, Any]]) -> List[str]:
    return [str(row["column_name"]) for row in schema_rows]


def _unsupported_not_null_columns(schema_rows: Sequence[Dict[str, Any]]) -> List[str]:
    unsupported: List[str] = []
    for row in schema_rows:
        column = str(row.get("column_name") or "")
        is_nullable = str(row.get("is_nullable") or "").upper()
        default = row.get("column_default")

        if column in _INSERT_EXPRESSIONS:
            continue

        if is_nullable == "NO" and default is None:
            unsupported.append(column)

    return unsupported


def _eligible_insert_columns(schema_rows: Sequence[Dict[str, Any]]) -> List[str]:
    table_columns = _schema_column_names(schema_rows)

    missing_required = [c for c in _REQUIRED_COLUMNS if c not in table_columns]
    if missing_required:
        raise RuntimeError(
            "core.team_season_stats is missing required columns: "
            + ", ".join(missing_required)
        )

    return [c for c in table_columns if c in _INSERT_EXPRESSIONS]


def _candidate_seasons_from_preview(
    preview: Dict[str, Any],
    *,
    requested_seasons: Optional[Sequence[int]] = None,
) -> List[int]:
    requested = {int(s) for s in requested_seasons or []}

    seasons: List[int] = []
    for season_item in preview.get("season_results") or []:
        comparison = season_item.get("comparison") or {}
        if comparison.get("status") != "missing_stats_can_insert":
            continue

        season = int(season_item["season"])
        if requested and season not in requested:
            continue

        seasons.append(season)

    return sorted(set(seasons), reverse=True)


def _planned_team_rows_from_preview(preview: Dict[str, Any], seasons: Sequence[int]) -> int:
    season_set = {int(s) for s in seasons}
    total = 0

    for season_item in preview.get("season_results") or []:
        season = int(season_item.get("season"))
        if season not in season_set:
            continue

        recomputed = season_item.get("recomputed") or {}
        total += int(recomputed.get("teams_count") or 0)

    return int(total)


def _insert_missing_team_season_stats(
    conn,
    *,
    league_id: int,
    seasons: Sequence[int],
    insert_columns: Sequence[str],
) -> Dict[str, Any]:
    if not seasons:
        return {"inserted_rows": 0, "inserted_by_season": {}}

    quoted_columns = ", ".join(_quote_ident(c) for c in insert_columns)
    select_expressions = ", ".join(_INSERT_EXPRESSIONS[c] for c in insert_columns)

    sql = f"""
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
          CASE WHEN goals_home < goals_away THEN 1 ELSE 0 END AS losses,
          CASE WHEN goals_home > goals_away THEN 1 ELSE 0 END AS home_wins,
          CASE WHEN goals_home = goals_away THEN 1 ELSE 0 END AS home_draws,
          CASE WHEN goals_home < goals_away THEN 1 ELSE 0 END AS home_losses,
          0 AS away_wins,
          0 AS away_draws,
          0 AS away_losses
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
          CASE WHEN goals_away < goals_home THEN 1 ELSE 0 END AS losses,
          0 AS home_wins,
          0 AS home_draws,
          0 AS home_losses,
          CASE WHEN goals_away > goals_home THEN 1 ELSE 0 END AS away_wins,
          CASE WHEN goals_away = goals_home THEN 1 ELSE 0 END AS away_draws,
          CASE WHEN goals_away < goals_home THEN 1 ELSE 0 END AS away_losses
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
          SUM(losses)::int AS losses,
          SUM(home_wins)::int AS home_wins,
          SUM(home_draws)::int AS home_draws,
          SUM(home_losses)::int AS home_losses,
          SUM(away_wins)::int AS away_wins,
          SUM(away_draws)::int AS away_draws,
          SUM(away_losses)::int AS away_losses
        FROM team_rows
        GROUP BY season, team_id
      )
      INSERT INTO core.team_season_stats ({quoted_columns})
      SELECT {select_expressions}
      FROM team_stats ts
      WHERE NOT EXISTS (
        SELECT 1
        FROM core.team_season_stats existing
        WHERE existing.league_id = %(league_id)s
          AND existing.season = ts.season
          AND existing.team_id = ts.team_id
      )
      RETURNING season::int AS season, team_id::int AS team_id
    """

    with conn.cursor() as cur:
        cur.execute(
            sql,
            {
                "league_id": int(league_id),
                "seasons": [int(s) for s in seasons],
            },
        )
        rows = _fetch_dicts(cur)

    inserted_by_season: Dict[str, int] = {}
    for row in rows:
        season = str(int(row["season"]))
        inserted_by_season[season] = inserted_by_season.get(season, 0) + 1

    return {
        "inserted_rows": len(rows),
        "inserted_by_season": dict(sorted(inserted_by_season.items(), reverse=True)),
    }


def materialize_league_team_season_stats_from_fixtures(
    conn,
    *,
    league_id: int,
    profile_key: str = "model_v1_hist5_decay",
    apply: bool = False,
    seasons: Optional[Sequence[int]] = None,
) -> Dict[str, Any]:
    preview = preview_league_team_season_recompute(
        conn,
        league_id=int(league_id),
        profile_key=profile_key,
    )

    candidate_seasons = _candidate_seasons_from_preview(preview, requested_seasons=seasons)
    planned_rows = _planned_team_rows_from_preview(preview, candidate_seasons)

    schema_rows = _load_team_season_stats_schema(conn)
    unsupported_not_null = _unsupported_not_null_columns(schema_rows)
    insert_columns = _eligible_insert_columns(schema_rows)

    base_payload: Dict[str, Any] = {
        "league_id": int(league_id),
        "profile_key": str(profile_key),
        "apply": bool(apply),
        "status": "ok",
        "candidate_seasons": candidate_seasons,
        "planned_rows": planned_rows,
        "insert_columns": list(insert_columns),
        "unsupported_not_null_columns": unsupported_not_null,
        "preview_summary": preview.get("summary") or {},
    }

    if unsupported_not_null:
        base_payload["status"] = "blocked_by_schema"
        base_payload["message"] = (
            "core.team_season_stats has NOT NULL columns without defaults "
            "that are not supported by this materializer."
        )
        return base_payload

    if not candidate_seasons:
        base_payload["status"] = "no_missing_stats_to_insert"
        base_payload["inserted_rows"] = 0
        base_payload["inserted_by_season"] = {}
        return base_payload

    if not apply:
        base_payload["status"] = "dry_run_ready"
        base_payload["inserted_rows"] = 0
        base_payload["inserted_by_season"] = {}
        return base_payload

    inserted = _insert_missing_team_season_stats(
        conn,
        league_id=int(league_id),
        seasons=candidate_seasons,
        insert_columns=insert_columns,
    )

    base_payload.update(inserted)
    base_payload["status"] = "applied"
    return base_payload


def materialize_many_team_season_stats_from_fixtures(
    conn,
    *,
    league_ids: Sequence[int],
    profile_key: str = "model_v1_hist5_decay",
    apply: bool = False,
    seasons: Optional[Sequence[int]] = None,
) -> Dict[str, Any]:
    results = [
        materialize_league_team_season_stats_from_fixtures(
            conn,
            league_id=int(league_id),
            profile_key=profile_key,
            apply=bool(apply),
            seasons=seasons,
        )
        for league_id in league_ids
    ]

    aggregate: Dict[str, int] = {}
    inserted_rows = 0
    planned_rows = 0

    for item in results:
        status = str(item.get("status") or "unknown")
        aggregate[status] = aggregate.get(status, 0) + 1
        inserted_rows += int(item.get("inserted_rows") or 0)
        planned_rows += int(item.get("planned_rows") or 0)

    return {
        "ok": True,
        "connected_to_snapshot": False,
        "calls_external_api": False,
        "mutates_database": bool(apply),
        "purpose": "materialize_missing_team_season_stats_from_core_fixtures",
        "apply": bool(apply),
        "league_count": len(results),
        "planned_rows": int(planned_rows),
        "inserted_rows": int(inserted_rows),
        "aggregate": dict(sorted(aggregate.items())),
        "results": results,
    }


__all__ = [
    "DEFAULT_MATERIALIZABLE_LEAGUES",
    "materialize_league_team_season_stats_from_fixtures",
    "materialize_many_team_season_stats_from_fixtures",
]