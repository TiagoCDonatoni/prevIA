from __future__ import annotations

from src.db.pg import pg_conn


CHECKS = [
    ("played_mismatch", """
      SELECT COUNT(*) FROM core.team_season_stats
      WHERE played <> (wins + draws + losses);
    """),
    ("points_mismatch", """
      SELECT COUNT(*) FROM core.team_season_stats
      WHERE points <> (wins * 3 + draws);
    """),
    ("goal_diff_mismatch", """
      SELECT COUNT(*) FROM core.team_season_stats
      WHERE goal_diff <> (goals_for - goals_against);
    """),
    ("home_played_mismatch", """
      SELECT COUNT(*) FROM core.team_season_stats
      WHERE home_played <> (home_wins + home_draws + home_losses);
    """),
    ("away_played_mismatch", """
      SELECT COUNT(*) FROM core.team_season_stats
      WHERE away_played <> (away_wins + away_draws + away_losses);
    """),
]


def run_team_season_stats_checks() -> None:
    with pg_conn() as conn:
        cur = conn.cursor()
        failures = []
        for name, sql in CHECKS:
            cur.execute(sql)
            n = int(cur.fetchone()[0])
            if n != 0:
                failures.append((name, n))

    if failures:
        details = ", ".join(f"{name}={n}" for name, n in failures)
        raise RuntimeError(f"team_season_stats checks failed: {details}")

    print("OK: team_season_stats sanity checks passed")
