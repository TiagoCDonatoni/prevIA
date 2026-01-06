from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, Optional

from src.db.pg import pg_conn, pg_tx


@dataclass(frozen=True)
class RecomputeResult:
    deleted: int
    inserted: int


def _sql_in(values: Iterable[int]) -> str:
    # Gera lista segura (somente ints)
    vals = [int(v) for v in values]
    if not vals:
        return "(NULL)"  # não deve ser usado se lista vazia, mas evita SQL inválido
    return "(" + ",".join(str(v) for v in vals) + ")"


def recompute_team_season_stats(
    *,
    seasons: Optional[list[int]] = None,
    league_ids: Optional[list[int]] = None,
) -> RecomputeResult:
    """
    Recompute determinístico:
    - deleta o recorte (seasons/league_ids) e reinsere via query canônica.
    - sem API, sem efeitos colaterais além do próprio INSERT/DELETE.
    """
    with open("src/metrics/sql/team_season_stats_v1.sql", "r", encoding="utf-8") as f:
        agg_sql = f.read()

    where_parts = []
    if seasons:
        where_parts.append(f"season IN {_sql_in(seasons)}")
    if league_ids:
        where_parts.append(f"league_id IN {_sql_in(league_ids)}")

    where_clause = ""
    if where_parts:
        where_clause = "WHERE " + " AND ".join(where_parts)

    delete_sql = f"DELETE FROM core.team_season_stats {where_clause};"

    # Para aplicar filtro no INSERT, envolvemos a query canônica.
    # (mantém o arquivo SQL puro como “fonte única”)
    insert_sql = f"""
    INSERT INTO core.team_season_stats
    {agg_sql}
    """

    if where_parts:
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

    return RecomputeResult(deleted=deleted, inserted=inserted)
