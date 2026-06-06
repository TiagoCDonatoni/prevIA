from __future__ import annotations

from typing import Any, Dict, Iterable, List, Optional

from src.product.model_profiles import ModelProfile, get_model_profile


def _safe_float(value: Any, default: float = 0.0) -> float:
    if value is None:
        return float(default)
    try:
        return float(value)
    except Exception:
        return float(default)


def _safe_int(value: Any, default: int = 0) -> int:
    if value is None:
        return int(default)
    try:
        return int(value)
    except Exception:
        return int(default)


def _renormalize_weights(weights: Iterable[float]) -> List[float]:
    values = [float(w) for w in weights]
    total = sum(values)
    if total <= 0:
        return []
    return [w / total for w in values]


def list_available_league_seasons(conn, *, league_id: int) -> List[int]:
    sql = """
      SELECT DISTINCT season
      FROM core.team_season_stats
      WHERE league_id = %(league_id)s
        AND season IS NOT NULL
      ORDER BY season DESC
    """
    with conn.cursor() as cur:
        cur.execute(sql, {"league_id": int(league_id)})
        rows = cur.fetchall() or []

    return [int(r[0]) for r in rows if r and r[0] is not None]


def resolve_target_season(conn, *, league_id: int, requested_season: Optional[int] = None) -> Optional[int]:
    if requested_season is not None:
        return int(requested_season)

    sql = """
      SELECT MAX(season)::int
      FROM core.team_season_stats
      WHERE league_id = %(league_id)s
    """
    with conn.cursor() as cur:
        cur.execute(sql, {"league_id": int(league_id)})
        row = cur.fetchone()

    if not row or row[0] is None:
        return None

    return int(row[0])


def load_league_season_rows(
    conn,
    *,
    league_id: int,
    seasons: Iterable[int],
) -> List[Dict[str, Any]]:
    season_list = [int(s) for s in seasons]
    if not season_list:
        return []

    sql = """
      SELECT
        season::int,
        COUNT(DISTINCT team_id)::int AS teams_count,
        COALESCE(SUM(played), 0)::int AS total_team_played,
        COALESCE(AVG(NULLIF(played, 0)), 0)::float AS avg_team_played,
        COALESCE(SUM(goals_for), 0)::int AS goals_for_sum,
        COALESCE(SUM(goals_against), 0)::int AS goals_against_sum,
        COALESCE(SUM(home_goals_for), 0)::int AS home_goals_for_sum,
        COALESCE(SUM(away_goals_for), 0)::int AS away_goals_for_sum,
        COALESCE(SUM(home_played), 0)::int AS home_played_sum,
        COALESCE(SUM(away_played), 0)::int AS away_played_sum
      FROM core.team_season_stats
      WHERE league_id = %(league_id)s
        AND season = ANY(%(seasons)s::int[])
      GROUP BY season
      ORDER BY season DESC
    """
    with conn.cursor() as cur:
        cur.execute(sql, {"league_id": int(league_id), "seasons": season_list})
        rows = cur.fetchall() or []

    out: List[Dict[str, Any]] = []
    for row in rows:
        season = _safe_int(row[0])
        home_goals_for_sum = _safe_float(row[6])
        away_goals_for_sum = _safe_float(row[7])
        home_played_sum = _safe_float(row[8])
        away_played_sum = _safe_float(row[9])

        out.append(
            {
                "season": season,
                "teams_count": _safe_int(row[1]),
                "total_team_played": _safe_int(row[2]),
                "avg_team_played": round(_safe_float(row[3]), 2),
                "goals_for_sum": _safe_int(row[4]),
                "goals_against_sum": _safe_int(row[5]),
                "home_goals_for_sum": _safe_int(row[6]),
                "away_goals_for_sum": _safe_int(row[7]),
                "home_played_sum": _safe_int(row[8]),
                "away_played_sum": _safe_int(row[9]),
                "mu_home": round(home_goals_for_sum / home_played_sum, 4) if home_played_sum else None,
                "mu_away": round(away_goals_for_sum / away_played_sum, 4) if away_played_sum else None,
            }
        )

    return out


def load_team_window_continuity(
    conn,
    *,
    league_id: int,
    target_season: int,
    seasons: Iterable[int],
) -> Dict[str, Any]:
    season_list = [int(s) for s in seasons]
    if not season_list:
        return {
            "target_season_team_count": 0,
            "teams_by_seasons_available": {},
            "teams_with_3_plus_seasons": 0,
            "teams_with_full_window": 0,
        }

    sql = """
      WITH target_teams AS (
        SELECT DISTINCT team_id
        FROM core.team_season_stats
        WHERE league_id = %(league_id)s
          AND season = %(target_season)s
      ), team_counts AS (
        SELECT
          tt.team_id,
          COUNT(tss.season)::int AS seasons_available
        FROM target_teams tt
        LEFT JOIN core.team_season_stats tss
          ON tss.league_id = %(league_id)s
         AND tss.team_id = tt.team_id
         AND tss.season = ANY(%(seasons)s::int[])
        GROUP BY tt.team_id
      )
      SELECT seasons_available::int, COUNT(*)::int
      FROM team_counts
      GROUP BY seasons_available
      ORDER BY seasons_available DESC
    """
    with conn.cursor() as cur:
        cur.execute(
            sql,
            {
                "league_id": int(league_id),
                "target_season": int(target_season),
                "seasons": season_list,
            },
        )
        rows = cur.fetchall() or []

    by_count = {str(_safe_int(r[0])): _safe_int(r[1]) for r in rows if r}
    total = sum(by_count.values())
    full_window_n = len(season_list)

    return {
        "target_season_team_count": int(total),
        "teams_by_seasons_available": by_count,
        "teams_with_3_plus_seasons": sum(count for key, count in by_count.items() if int(key) >= 3),
        "teams_with_full_window": by_count.get(str(full_window_n), 0),
    }


def inspect_hist5_league_coverage(
    conn,
    *,
    league_id: int,
    target_season: Optional[int] = None,
    profile_key: str = "model_v1_hist5_decay",
) -> Dict[str, Any]:
    profile: ModelProfile = get_model_profile(profile_key)
    resolved_target_season = resolve_target_season(
        conn,
        league_id=int(league_id),
        requested_season=target_season,
    )

    if resolved_target_season is None:
        return {
            "league_id": int(league_id),
            "profile_key": str(profile_key),
            "status": "no_team_season_stats",
            "target_season": None,
            "target_seasons": [],
            "available_seasons": [],
        }

    target_seasons = profile.target_seasons(int(resolved_target_season))
    available_seasons = list_available_league_seasons(conn, league_id=int(league_id))
    available_in_window = [s for s in target_seasons if s in set(available_seasons)]

    base_weights = profile.normalized_weights()
    season_weights = {
        str(season): float(base_weights[idx])
        for idx, season in enumerate(target_seasons)
        if idx < len(base_weights)
    }
    available_weights = _renormalize_weights(
        season_weights[str(season)] for season in available_in_window if str(season) in season_weights
    )
    available_weight_by_season = {
        str(season): round(float(weight), 6)
        for season, weight in zip(available_in_window, available_weights)
    }

    season_rows = load_league_season_rows(conn, league_id=int(league_id), seasons=target_seasons)
    continuity = load_team_window_continuity(
        conn,
        league_id=int(league_id),
        target_season=int(resolved_target_season),
        seasons=target_seasons,
    )

    return {
        "league_id": int(league_id),
        "profile_key": str(profile_key),
        "status": "ok",
        "target_season": int(resolved_target_season),
        "target_seasons": target_seasons,
        "available_seasons": available_seasons,
        "available_seasons_in_window": available_in_window,
        "configured_weight_by_season": {str(k): round(float(v), 6) for k, v in season_weights.items()},
        "renormalized_available_weight_by_season": available_weight_by_season,
        "season_rows": season_rows,
        "team_continuity": continuity,
    }