from __future__ import annotations

from src.metrics.features.team_features_v1 import build_team_features


def _match_stats_mode(*, home_mode: str, away_mode: str) -> str:
    if home_mode == "exact" and away_mode == "exact":
        return "exact"
    if home_mode == "same_league_team_latest" and away_mode == "same_league_team_latest":
        return "full_fallback"
    if "same_league_team_latest" in {home_mode, away_mode}:
        return "partial_fallback"
    return "unknown"


def build_match_features(
    *,
    home_team_id: int,
    away_team_id: int,
    league_id: int,
    season: int,
    allow_season_fallback: bool = False,
) -> dict:
    home = build_team_features(
        team_id=home_team_id,
        league_id=league_id,
        season=season,
        allow_season_fallback=allow_season_fallback,
    )
    away = build_team_features(
        team_id=away_team_id,
        league_id=league_id,
        season=season,
        allow_season_fallback=allow_season_fallback,
    )

    stats_runtime = {
        "home": {
            "season_requested": home["season_requested"],
            "season_used": home["season_used"],
            "season_mode": home["season_mode"],
        },
        "away": {
            "season_requested": away["season_requested"],
            "season_used": away["season_used"],
            "season_mode": away["season_mode"],
        },
        "match_stats_mode": _match_stats_mode(
            home_mode=str(home["season_mode"]),
            away_mode=str(away["season_mode"]),
        ),
    }

    return {
        "league_id": int(league_id),
        "season": int(season),
        "home_team_id": int(home_team_id),
        "away_team_id": int(away_team_id),

        "home": home,
        "away": away,

        "delta_ppg": home["ppg"] - away["ppg"],
        "delta_gf_pg": home["gf_pg"] - away["gf_pg"],
        "delta_ga_pg": home["ga_pg"] - away["ga_pg"],
        "delta_gd_pg": home["gd_pg"] - away["gd_pg"],
        "delta_home_adv": home["home_ppg"] - away["away_ppg"],

        "stats_runtime": stats_runtime,
        "feature_version": home["feature_version"],
    }