from __future__ import annotations

from src.metrics.features.team_features_weighted_exp_v1 import (
    build_weighted_team_features_exp,
)


def build_weighted_match_features_exp(
    *,
    home_team_id: int,
    away_team_id: int,
    league_id: int,
    season: int,
) -> dict:
    home = build_weighted_team_features_exp(
        team_id=home_team_id,
        league_id=league_id,
        season=season,
    )
    away = build_weighted_team_features_exp(
        team_id=away_team_id,
        league_id=league_id,
        season=season,
    )

    return {
        "league_id": league_id,
        "season": season,
        "home_team_id": home_team_id,
        "away_team_id": away_team_id,

        "home": home,
        "away": away,

        # deltas ponderados
        "delta_ppg": home["ppg"] - away["ppg"],
        "delta_gf_pg": home["gf_pg"] - away["gf_pg"],
        "delta_ga_pg": home["ga_pg"] - away["ga_pg"],
        "delta_gd_pg": home["gd_pg"] - away["gd_pg"],
        "delta_home_adv": home["home_ppg"] - away["away_ppg"],

        "feature_version": home["feature_version"],
    }
