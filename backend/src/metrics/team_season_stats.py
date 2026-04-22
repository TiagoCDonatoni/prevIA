from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, Optional

from src.db.pg import pg_conn, pg_tx


@dataclass(frozen=True)
class RecomputeResult:
    deleted: int
    inserted: int


def _sql_in(values: Iterable[int]) -> str:
    vals = [int(v) for v in values]
    if not vals:
        return "(NULL)"
    return "(" + ",".join(str(v) for v in vals) + ")"


def _build_where(
    *,
    seasons: Optional[list[int]],
    league_ids: Optional[list[int]],
    alias: str = "",
) -> str:
    parts = []
    prefix = f"{alias}." if alias else ""

    if seasons:
        parts.append(f"{prefix}season IN {_sql_in(seasons)}")
    if league_ids:
        parts.append(f"{prefix}league_id IN {_sql_in(league_ids)}")

    if not parts:
        return ""
    return "WHERE " + " AND ".join(parts)


def get_team_season_stats_coverage_report(
    *,
    seasons: Optional[list[int]] = None,
    league_ids: Optional[list[int]] = None,
) -> dict[str, int]:
    where_participants = _build_where(seasons=seasons, league_ids=league_ids, alias="")
    where_p = _build_where(seasons=seasons, league_ids=league_ids, alias="p")
    where_s = _build_where(seasons=seasons, league_ids=league_ids, alias="s")
    where_stats = _build_where(seasons=seasons, league_ids=league_ids, alias="")

    sql_fixture_team_rows = f"""
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
    FROM participants
    {where_participants}
    """

    sql_stats_rows = f"""
    SELECT COUNT(*)::int
    FROM core.team_season_stats
    {where_stats}
    """

    sql_missing_fixture_teams = f"""
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
    """

    sql_orphan_stats_rows = f"""
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
    """

    with pg_conn() as conn:
        cur = conn.cursor()

        cur.execute(sql_fixture_team_rows)
        fixture_team_rows = int(cur.fetchone()[0])

        cur.execute(sql_stats_rows)
        stats_rows = int(cur.fetchone()[0])

        cur.execute(sql_missing_fixture_teams)
        missing_fixture_teams = int(cur.fetchone()[0])

        cur.execute(sql_orphan_stats_rows)
        orphan_stats_rows = int(cur.fetchone()[0])

    return {
        "fixture_team_rows": fixture_team_rows,
        "stats_rows": stats_rows,
        "missing_fixture_teams": missing_fixture_teams,
        "orphan_stats_rows": orphan_stats_rows,
    }


def recompute_team_season_stats(
    *,
    seasons: Optional[list[int]] = None,
    league_ids: Optional[list[int]] = None,
    run_checks: bool = True,
) -> RecomputeResult:
    """
    Recompute determinístico:
    - deleta o recorte (seasons/league_ids) e reinsere via query canônica.
    - sem API, sem efeitos colaterais além do próprio INSERT/DELETE.
    - com run_checks=True, falha cedo se a cobertura estrutural continuar quebrada.
    """
    with open("src/metrics/sql/team_season_stats_v1.sql", "r", encoding="utf-8") as f:
        agg_sql = f.read().strip().rstrip(";").strip()

    where_clause = _build_where(seasons=seasons, league_ids=league_ids)

    delete_sql = f"DELETE FROM core.team_season_stats {where_clause};"

    insert_sql = f"""
    INSERT INTO core.team_season_stats
    {agg_sql}
    """

    if where_clause:
        insert_sql = f"""
        INSERT INTO core.team_season_stats
        SELECT * FROM (
          {agg_sql}
        ) q
        {where_clause};
        """

    with pg_conn() as conn:
        with pg_tx(conn):
            cur = conn.cursor()
            cur.execute(delete_sql)
            deleted = cur.rowcount

            cur.execute(insert_sql)
            inserted = cur.rowcount

    if run_checks:
        from src.metrics.checks_team_season_stats import run_team_season_stats_checks

        run_team_season_stats_checks(seasons=seasons, league_ids=league_ids)

    return RecomputeResult(deleted=deleted, inserted=inserted)