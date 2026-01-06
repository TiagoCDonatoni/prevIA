from __future__ import annotations

import math
from functools import lru_cache

from src.db.pg import pg_conn
from src.metrics.features.team_features_v1 import build_team_features


FEATURE_VERSION = "features_weighted_exp_v1"


@lru_cache(maxsize=10_000)
def _min_available_season(league_id: int) -> int:
    sql = "SELECT COALESCE(MIN(season), 0) FROM core.team_season_stats WHERE league_id = %s"
    with pg_conn() as conn:
        cur = conn.cursor()
        cur.execute(sql, (league_id,))
        return int(cur.fetchone()[0])


def _exp_weights(n: int, half_life: float) -> list[float]:
    lambda_ = math.log(2) / half_life
    raw = [math.exp(-lambda_ * k) for k in range(n)]
    total = sum(raw)
    return [w / total for w in raw]


def _weighted_mean(values: list[float], weights: list[float]) -> float:
    return sum(v * w for v, w in zip(values, weights))


def build_weighted_team_features_exp(
    *,
    team_id: int,
    league_id: int,
    season: int,
    max_lookback: int = 10,
    half_life: float = 3.0,
) -> dict:
    min_season = _min_available_season(league_id)
    if min_season == 0:
        raise ValueError("no team_season_stats available for league")

    # limita lookback para não atravessar o mínimo disponível da liga
    seasons = []
    for k in range(max_lookback):
        s = season - k
        if s < min_season:
            break
        seasons.append(s)

    weights = _exp_weights(len(seasons), half_life)

    rows = []
    used_weights = []

    for s, w in zip(seasons, weights):
        try:
            feats = build_team_features(team_id=team_id, league_id=league_id, season=s)
        except ValueError:
            # se faltar um time específico numa season, apenas ignora
            continue
        rows.append(feats)
        used_weights.append(w)

    if not rows:
        raise ValueError("no historical features available for weighting")

    return {
        "team_id": team_id,
        "league_id": league_id,
        "season": season,

        "ppg": _weighted_mean([r["ppg"] for r in rows], used_weights),
        "gf_pg": _weighted_mean([r["gf_pg"] for r in rows], used_weights),
        "ga_pg": _weighted_mean([r["ga_pg"] for r in rows], used_weights),
        "gd_pg": _weighted_mean([r["gd_pg"] for r in rows], used_weights),
        "home_ppg": _weighted_mean([r["home_ppg"] for r in rows], used_weights),
        "away_ppg": _weighted_mean([r["away_ppg"] for r in rows], used_weights),

        "seasons_used": [r["season"] for r in rows],
        "weights_used": used_weights,
        "half_life": half_life,

        "feature_version": FEATURE_VERSION,
        "base_feature_version": rows[0]["feature_version"],
    }
