from __future__ import annotations

from src.db.pg import pg_conn
from src.metrics.team_season_stats import recompute_team_season_stats
from src.metrics.checks_team_season_stats import run_team_season_stats_checks


def _assert_eq(got: int, expected: int, msg: str) -> None:
    if got != expected:
        raise AssertionError(f"{msg}: got={got} expected={expected}")


def run_golden_epl_2021_2023() -> None:
    league_id = 39
    seasons = [2021, 2022, 2023]

    # recompute (contrato: idempotente)
    res = recompute_team_season_stats(seasons=seasons, league_ids=[league_id])
    print("recompute:", res)

    # invariantes (contrato do Bloco 14)
    run_team_season_stats_checks()

    # golden volume: EPL deve ter 20 times por temporada
    with pg_conn() as conn:
        cur = conn.cursor()

        cur.execute(
            """
            SELECT season, COUNT(*)::int
            FROM core.team_season_stats
            WHERE league_id = %s AND season = ANY(%s)
            GROUP BY season
            ORDER BY season
            """,
            (league_id, seasons),
        )
        rows = cur.fetchall()

    got_by_season = {season: cnt for (season, cnt) in rows}
    for s in seasons:
        _assert_eq(got_by_season.get(s, 0), 20, f"EPL teams count season={s}")

    # total rows = 60
    total = sum(got_by_season.values())
    _assert_eq(total, 60, "EPL total rows 2021-2023")

    print("OK: golden EPL 2021-2023 passed")


if __name__ == "__main__":
    run_golden_epl_2021_2023()
