from __future__ import annotations

from src.metrics.features.team_stats_resolver_v1 import resolve_team_season_stats_row


FEATURE_VERSION = "features_v1"


def build_team_features(
    *,
    team_id: int,
    league_id: int,
    season: int,
    allow_season_fallback: bool = False,
) -> dict:
    resolved = resolve_team_season_stats_row(
        team_id=int(team_id),
        league_id=int(league_id),
        requested_season=int(season),
        allow_season_fallback=bool(allow_season_fallback),
    )

    row = resolved["row"]
    if row is None:
        if allow_season_fallback:
            raise ValueError(
                "team_season_stats missing for same league across requested/fallback seasons"
            )
        raise ValueError("team_season_stats not found for given inputs")

    (
        played,
        ppg,
        gf_pg,
        ga_pg,
        gd_pg,
        home_ppg,
        away_ppg,
        metric_version,
    ) = row

    season_used = int(resolved["season_used"]) if resolved["season_used"] is not None else int(season)

    return {
        "team_id": int(team_id),
        "league_id": int(league_id),
        "season": season_used,
        "season_requested": int(season),
        "season_used": season_used,
        "season_mode": str(resolved["season_mode"]),
        "stats_found": bool(resolved["stats_found"]),
        "played": int(played),
        "ppg": float(ppg),
        "gf_pg": float(gf_pg),
        "ga_pg": float(ga_pg),
        "gd_pg": float(gd_pg),
        "home_ppg": float(home_ppg),
        "away_ppg": float(away_ppg),
        "feature_version": FEATURE_VERSION,
        "metric_version": str(metric_version),
    }