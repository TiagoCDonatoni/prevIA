from __future__ import annotations

import time

from src.db.pg import pg_conn
from src.metrics.features.match_features_v1 import build_match_features


FEATURES = [
    "delta_ppg",
    "delta_gf_pg",
    "delta_ga_pg",
    "delta_gd_pg",
    "delta_home_adv",
]


def _label_from_goals(home_goals: int, away_goals: int) -> int:
    # 0=H, 1=D, 2=A
    if home_goals > away_goals:
        return 0
    if home_goals == away_goals:
        return 1
    return 2


def load_dataset_1x2(
    *,
    league_id: int,
    season: int,
    progress_every: int = 100,
) -> tuple[list[list[float]], list[int]]:
    sql = """
    SELECT home_team_id, away_team_id, goals_home, goals_away
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

    X, y = [], []
    skipped = 0

    t0 = time.time()
    last = t0
    print(f"    building dataset: league_id={league_id} season={season} total_fixtures={total}")

    for i, (home_id, away_id, gh, ga) in enumerate(rows, start=1):
        try:
            feats = build_match_features(
                home_team_id=home_id,
                away_team_id=away_id,
                league_id=league_id,
                season=season,
            )
        except ValueError:
            # geralmente: team_season_stats faltando para algum time/season
            skipped += 1
            continue

        X.append([float(feats[k]) for k in FEATURES])
        y.append(_label_from_goals(int(gh), int(ga)))

        if i % progress_every == 0 or i == total:
            now = time.time()
            elapsed = now - t0
            done = len(y) + skipped
            rate = done / elapsed if elapsed > 0 else 0.0
            eta = (total - done) / rate if rate > 0 else 0.0
            chunk = now - last
            print(f"      progress {done}/{total} ({done/total:.0%}) rate={rate:.1f}/s eta={eta:.1f}s chunk_dt={chunk:.2f}s skipped={skipped}")
            last = now

    if skipped > 0:
        coverage = len(y) / total
        print(f"    warning: skipped={skipped}/{total} coverage={coverage:.3f}")

    return X, y
