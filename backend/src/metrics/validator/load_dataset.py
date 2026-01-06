from __future__ import annotations

import time

from src.db.pg import pg_conn
from src.metrics.features.match_features_weighted_exp_v1 import (
    build_weighted_match_features_exp,
)
from src.metrics.features.match_features_v1 import build_match_features


def _label_from_goals(home_goals: int, away_goals: int) -> int:
    # 0 = home, 1 = draw, 2 = away
    if home_goals > away_goals:
        return 0
    if home_goals == away_goals:
        return 1
    return 2


def load_dataset(
    *,
    league_id: int,
    season: int,
    feature_version: str,
    progress_every: int = 50,
) -> tuple[list[list[float]], list[int]]:
    """
    Retorna X, y e imprime progresso em tempo real a cada `progress_every` jogos.
    """
    sql = """
    SELECT
      home_team_id,
      away_team_id,
      goals_home,
      goals_away
    FROM core.fixtures
    WHERE league_id = %s
      AND season = %s
      AND is_finished = true
      AND COALESCE(is_cancelled, false) = false
    ORDER BY kickoff_utc
    """
    with pg_conn() as conn:
        cur = conn.cursor()
        cur.execute(sql, (league_id, season))
        rows = cur.fetchall()

    total = len(rows)
    if total == 0:
        return [], []

    X: list[list[float]] = []
    y: list[int] = []

    t0 = time.time()
    last_t = t0

    print(f"    building dataset: league_id={league_id} season={season} total_fixtures={total}")

    for i, (home_id, away_id, gh, ga) in enumerate(rows, start=1):
        # features
        if feature_version == "features_v1":
            feats = build_match_features(
                home_team_id=home_id,
                away_team_id=away_id,
                league_id=league_id,
                season=season,
            )
        elif feature_version == "features_weighted_exp_v1":
            feats = build_weighted_match_features_exp(
                home_team_id=home_id,
                away_team_id=away_id,
                league_id=league_id,
                season=season,
            )
        else:
            raise ValueError("unknown feature_version")

        X.append(
            [
                feats["delta_ppg"],
                feats["delta_gf_pg"],
                feats["delta_ga_pg"],
                feats["delta_gd_pg"],
                feats["delta_home_adv"],
            ]
        )
        y.append(_label_from_goals(gh, ga))

        # progress
        if i % progress_every == 0 or i == total:
            now = time.time()
            dt = now - last_t
            elapsed = now - t0
            rate = i / elapsed if elapsed > 0 else 0.0
            eta = (total - i) / rate if rate > 0 else 0.0
            print(
                f"      progress {i}/{total} "
                f"({i/total:.0%}) "
                f"rate={rate:.1f}/s "
                f"eta={eta:.1f}s "
                f"chunk_dt={dt:.2f}s"
            )
            last_t = now

    return X, y
