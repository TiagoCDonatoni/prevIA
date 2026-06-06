from __future__ import annotations

from typing import Any, Dict, Iterable, List, Optional, Sequence

from src.product.model_profiles import ModelProfile, get_model_profile


DEFAULT_PROVIDER_ALIASES = ["apifootball", "api-football"]


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


def _target_season_from_core(conn, *, league_id: int) -> Optional[int]:
    parts: List[str] = []
    params = {"league_id": int(league_id)}

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
        cur.execute(sql, params)
        row = cur.fetchone()

    if not row or row[0] is None:
        return None
    return int(row[0])


def _load_default_league_ids(conn, *, limit: int) -> List[int]:
    if _table_exists(conn, "odds.odds_league_map"):
        sql_mapped = """
          SELECT DISTINCT olm.league_id::int
          FROM odds.odds_league_map olm
          WHERE COALESCE(olm.enabled, true) = true
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

    union_parts: List[str] = []
    if _table_exists(conn, "core.team_season_stats"):
        union_parts.append("SELECT league_id::int FROM core.team_season_stats")
    if _table_exists(conn, "core.fixtures"):
        union_parts.append("SELECT league_id::int FROM core.fixtures")

    if not union_parts:
        return []

    sql = """
      SELECT league_id::int
      FROM (
    """ + " UNION ALL ".join(union_parts) + """
      ) q
      GROUP BY league_id
      ORDER BY COUNT(*) DESC, league_id ASC
      LIMIT %(limit)s
    """
    with conn.cursor() as cur:
        cur.execute(sql, {"limit": int(limit)})
        rows = cur.fetchall() or []
    return [int(r[0]) for r in rows if r and r[0] is not None]


def load_team_season_stats_source_rows(
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
        COALESCE(SUM(played), 0)::int AS total_team_played,
        COALESCE(AVG(NULLIF(played, 0)), 0)::float AS avg_team_played,
        COALESCE(SUM(home_played), 0)::int AS home_played_sum,
        COALESCE(SUM(away_played), 0)::int AS away_played_sum,
        COALESCE(SUM(home_goals_for), 0)::int AS home_goals_for_sum,
        COALESCE(SUM(away_goals_for), 0)::int AS away_goals_for_sum,
        MAX(computed_at) AS latest_computed_at
      FROM core.team_season_stats
      WHERE league_id = %(league_id)s
        AND season = ANY(%(seasons)s::int[])
      GROUP BY season
      ORDER BY season DESC
    """
    with conn.cursor() as cur:
        cur.execute(sql, {"league_id": int(league_id), "seasons": [int(s) for s in seasons]})
        rows = _fetch_dicts(cur)

    for row in rows:
        home_played = _safe_float(row.get("home_played_sum"))
        away_played = _safe_float(row.get("away_played_sum"))
        row["avg_team_played"] = round(_safe_float(row.get("avg_team_played")), 2)
        row["mu_home"] = round(_safe_float(row.get("home_goals_for_sum")) / home_played, 4) if home_played else None
        row["mu_away"] = round(_safe_float(row.get("away_goals_for_sum")) / away_played, 4) if away_played else None

    return rows


def load_core_fixture_source_rows(
    conn,
    *,
    league_id: int,
    seasons: Sequence[int],
) -> List[Dict[str, Any]]:
    if not seasons or not _table_exists(conn, "core.fixtures"):
        return []

    sql = """
      WITH fx AS (
        SELECT
          fixture_id,
          league_id,
          season,
          kickoff_utc,
          status_short,
          is_finished,
          is_cancelled,
          goals_home,
          goals_away,
          home_team_id,
          away_team_id
        FROM core.fixtures
        WHERE league_id = %(league_id)s
          AND season = ANY(%(seasons)s::int[])
      ), fixture_agg AS (
        SELECT
          season::int AS season,
          COUNT(*)::int AS fixtures_count,
          COUNT(*) FILTER (WHERE COALESCE(is_finished, false) = true)::int AS finished_count,
          COUNT(*) FILTER (WHERE goals_home IS NOT NULL AND goals_away IS NOT NULL)::int AS with_score_count,
          COUNT(*) FILTER (WHERE COALESCE(is_cancelled, false) = true)::int AS cancelled_count,
          MIN(kickoff_utc) AS min_kickoff_utc,
          MAX(kickoff_utc) AS max_kickoff_utc,
          MAX(kickoff_utc) FILTER (WHERE COALESCE(is_finished, false) = true) AS latest_finished_kickoff_utc
        FROM fx
        GROUP BY season
      ), team_agg AS (
        SELECT season::int AS season, COUNT(DISTINCT team_id)::int AS teams_count
        FROM (
          SELECT season, home_team_id AS team_id FROM fx
          UNION ALL
          SELECT season, away_team_id AS team_id FROM fx
        ) t
        GROUP BY season
      )
      SELECT
        f.season,
        f.fixtures_count,
        f.finished_count,
        f.with_score_count,
        f.cancelled_count,
        COALESCE(t.teams_count, 0)::int AS teams_count,
        f.min_kickoff_utc,
        f.max_kickoff_utc,
        f.latest_finished_kickoff_utc
      FROM fixture_agg f
      LEFT JOIN team_agg t ON t.season = f.season
      ORDER BY f.season DESC
    """
    with conn.cursor() as cur:
        cur.execute(sql, {"league_id": int(league_id), "seasons": [int(s) for s in seasons]})
        return _fetch_dicts(cur)


def load_raw_endpoint_source_rows(
    conn,
    *,
    endpoint: str,
    league_id: int,
    seasons: Sequence[int],
    provider_aliases: Sequence[str] = DEFAULT_PROVIDER_ALIASES,
) -> List[Dict[str, Any]]:
    if not seasons or not _table_exists(conn, "raw.api_responses"):
        return []

    sql = """
      WITH parsed AS (
        SELECT
          provider,
          endpoint,
          fetched_at_utc,
          ok,
          http_status,
          COALESCE(
            request_params #>> '{params,league}',
            request_params ->> 'league',
            request_params ->> 'league_id'
          ) AS league_txt,
          COALESCE(
            request_params #>> '{params,season}',
            request_params ->> 'season'
          ) AS season_txt,
          CASE
            WHEN jsonb_typeof(response_body -> 'response') = 'array'
              THEN jsonb_array_length(response_body -> 'response')
            ELSE 0
          END AS response_items
        FROM raw.api_responses
        WHERE provider = ANY(%(providers)s::text[])
          AND endpoint = %(endpoint)s
      ), normalized AS (
        SELECT
          provider,
          endpoint,
          fetched_at_utc,
          ok,
          http_status,
          CASE WHEN league_txt ~ '^[0-9]+$' THEN league_txt::int ELSE NULL END AS league_id,
          CASE WHEN season_txt ~ '^[0-9]+$' THEN season_txt::int ELSE NULL END AS season,
          response_items
        FROM parsed
      )
      SELECT
        season::int AS season,
        COUNT(*)::int AS raw_rows,
        COUNT(*) FILTER (WHERE ok = true)::int AS ok_rows,
        COALESCE(SUM(response_items), 0)::int AS response_items,
        MIN(fetched_at_utc) AS first_fetched_at_utc,
        MAX(fetched_at_utc) AS latest_fetched_at_utc,
        MAX(fetched_at_utc) FILTER (WHERE ok = true) AS latest_ok_fetched_at_utc,
        ARRAY_AGG(DISTINCT http_status ORDER BY http_status) AS http_statuses
      FROM normalized
      WHERE league_id = %(league_id)s
        AND season = ANY(%(seasons)s::int[])
      GROUP BY season
      ORDER BY season DESC
    """
    with conn.cursor() as cur:
        cur.execute(
            sql,
            {
                "providers": [str(p) for p in provider_aliases],
                "endpoint": str(endpoint),
                "league_id": int(league_id),
                "seasons": [int(s) for s in seasons],
            },
        )
        return _fetch_dicts(cur)


def load_backfill_checkpoint_rows(
    conn,
    *,
    league_id: int,
    seasons: Sequence[int],
    provider_aliases: Sequence[str] = DEFAULT_PROVIDER_ALIASES,
) -> List[Dict[str, Any]]:
    if not seasons or not _table_exists(conn, "raw.backfill_checkpoint"):
        return []

    sql = """
      SELECT
        endpoint,
        season::int AS season,
        status,
        COUNT(*)::int AS checkpoint_rows,
        MAX(last_page_done)::int AS max_last_page_done,
        MAX(total_pages)::int AS max_total_pages,
        MAX(updated_at_utc) AS latest_updated_at_utc
      FROM raw.backfill_checkpoint
      WHERE provider = ANY(%(providers)s::text[])
        AND league_id = %(league_id)s
        AND season = ANY(%(seasons)s::int[])
      GROUP BY endpoint, season, status
      ORDER BY season DESC, endpoint ASC, status ASC
    """
    with conn.cursor() as cur:
        cur.execute(
            sql,
            {
                "providers": [str(p) for p in provider_aliases],
                "league_id": int(league_id),
                "seasons": [int(s) for s in seasons],
            },
        )
        return _fetch_dicts(cur)


def _by_season(rows: Iterable[Dict[str, Any]]) -> Dict[int, Dict[str, Any]]:
    out: Dict[int, Dict[str, Any]] = {}
    for row in rows:
        season = row.get("season")
        if season is None:
            continue
        out[int(season)] = row
    return out


def _checkpoint_map(rows: Iterable[Dict[str, Any]]) -> Dict[int, List[Dict[str, Any]]]:
    out: Dict[int, List[Dict[str, Any]]] = {}
    for row in rows:
        season = row.get("season")
        if season is None:
            continue
        out.setdefault(int(season), []).append(row)
    return out


def _season_action(
    *,
    stats_row: Optional[Dict[str, Any]],
    core_fixture_row: Optional[Dict[str, Any]],
    raw_fixture_row: Optional[Dict[str, Any]],
    checkpoint_rows: List[Dict[str, Any]],
) -> str:
    if stats_row and _safe_int(stats_row.get("teams_count")) > 0:
        return "stats_ready"

    if core_fixture_row and _safe_int(core_fixture_row.get("finished_count")) > 0:
        return "can_recompute_team_season_stats_from_core_fixtures"

    if raw_fixture_row and _safe_int(raw_fixture_row.get("response_items")) > 0:
        return "can_run_core_etl_from_raw_fixtures"

    if raw_fixture_row and _safe_int(raw_fixture_row.get("ok_rows")) > 0:
        return "raw_fixture_response_exists_but_empty"

    if checkpoint_rows:
        statuses = sorted({str(r.get("status")) for r in checkpoint_rows if r.get("status") is not None})
        return "checkpoint_exists_without_usable_fixture_data:" + ",".join(statuses)

    return "needs_api_fetch"


def _overall_recommendation(season_actions: Dict[str, str]) -> str:
    actions = set(season_actions.values())

    if actions == {"stats_ready"}:
        return "READY_FOR_HIST5_FROM_TEAM_SEASON_STATS"

    if all(a in {"stats_ready", "can_recompute_team_season_stats_from_core_fixtures"} for a in actions):
        return "MATERIALIZE_TEAM_SEASON_STATS_FROM_CORE_FIXTURES"

    if any(a == "can_run_core_etl_from_raw_fixtures" for a in actions):
        return "RUN_CORE_ETL_FROM_RAW_THEN_RECOMPUTE_TEAM_SEASON_STATS"

    if any(a == "needs_api_fetch" for a in actions):
        return "NEEDS_API_BACKFILL_FOR_MISSING_SEASONS"

    if any(a == "raw_fixture_response_exists_but_empty" for a in actions):
        return "RAW_EXISTS_BUT_EMPTY_RECHECK_API_OR_SKIP_SEASONS"

    return "NEEDS_MANUAL_REVIEW"


def inspect_historical_data_sources(
    conn,
    *,
    league_id: int,
    target_season: Optional[int] = None,
    profile_key: str = "model_v1_hist5_decay",
    provider_aliases: Sequence[str] = DEFAULT_PROVIDER_ALIASES,
) -> Dict[str, Any]:
    profile: ModelProfile = get_model_profile(profile_key)

    resolved_target = (
        int(target_season)
        if target_season is not None
        else _target_season_from_core(conn, league_id=int(league_id))
    )

    if resolved_target is None:
        return {
            "league_id": int(league_id),
            "profile_key": str(profile_key),
            "status": "no_core_history_for_league",
            "target_season": None,
            "target_seasons": [],
            "recommendation": "NEEDS_API_BACKFILL_OR_LEAGUE_NOT_COVERED",
        }

    target_seasons = profile.target_seasons(int(resolved_target))

    stats_rows = load_team_season_stats_source_rows(conn, league_id=int(league_id), seasons=target_seasons)
    fixture_rows = load_core_fixture_source_rows(conn, league_id=int(league_id), seasons=target_seasons)
    raw_fixture_rows = load_raw_endpoint_source_rows(
        conn,
        endpoint="fixtures",
        league_id=int(league_id),
        seasons=target_seasons,
        provider_aliases=provider_aliases,
    )
    raw_team_rows = load_raw_endpoint_source_rows(
        conn,
        endpoint="teams",
        league_id=int(league_id),
        seasons=target_seasons,
        provider_aliases=provider_aliases,
    )
    checkpoint_rows = load_backfill_checkpoint_rows(
        conn,
        league_id=int(league_id),
        seasons=target_seasons,
        provider_aliases=provider_aliases,
    )

    stats_by_season = _by_season(stats_rows)
    fixtures_by_season = _by_season(fixture_rows)
    raw_fixtures_by_season = _by_season(raw_fixture_rows)
    checkpoints_by_season = _checkpoint_map(checkpoint_rows)

    season_actions: Dict[str, str] = {}
    for season in target_seasons:
        season_actions[str(season)] = _season_action(
            stats_row=stats_by_season.get(int(season)),
            core_fixture_row=fixtures_by_season.get(int(season)),
            raw_fixture_row=raw_fixtures_by_season.get(int(season)),
            checkpoint_rows=checkpoints_by_season.get(int(season), []),
        )

    stats_ready = [s for s in target_seasons if int(s) in stats_by_season]
    core_fixture_ready = [s for s in target_seasons if int(s) in fixtures_by_season]
    raw_fixture_ready = [s for s in target_seasons if int(s) in raw_fixtures_by_season]

    return {
        "league_id": int(league_id),
        "profile_key": str(profile_key),
        "status": "ok",
        "target_season": int(resolved_target),
        "target_seasons": target_seasons,
        "source_seasons": {
            "team_season_stats": stats_ready,
            "core_fixtures": core_fixture_ready,
            "raw_fixtures": raw_fixture_ready,
        },
        "season_actions": season_actions,
        "recommendation": _overall_recommendation(season_actions),
        "sources": {
            "team_season_stats": stats_rows,
            "core_fixtures": fixture_rows,
            "raw_fixtures": raw_fixture_rows,
            "raw_teams": raw_team_rows,
            "backfill_checkpoints": checkpoint_rows,
        },
    }


def resolve_default_league_ids(conn, *, limit: int) -> List[int]:
    return _load_default_league_ids(conn, limit=int(limit))