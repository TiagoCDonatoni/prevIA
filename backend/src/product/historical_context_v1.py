from __future__ import annotations

from typing import Any, Dict, Iterable, List, Optional, Tuple

from src.product.historical_coverage_v1 import resolve_target_season
from src.product.model_profiles import get_model_profile

QUALITY_SCORE = {"STRONG": 5, "OK": 4, "THIN": 3, "CUP_LIKE": 2, "INSUFFICIENT": 1, "UNKNOWN": 0}


def _f(value: Any, default: float = 0.0) -> float:
    try:
        return float(default if value is None else value)
    except Exception:
        return float(default)


def _i(value: Any, default: int = 0) -> int:
    try:
        return int(default if value is None else value)
    except Exception:
        return int(default)


def _div(n: Any, d: Any, default: float = 0.0) -> float:
    den = _f(d)
    return float(default) if den == 0.0 else _f(n) / den


def _r(value: Optional[float], digits: int = 4) -> Optional[float]:
    return None if value is None else round(float(value), int(digits))


def _clamp(v: float, low: float, high: float) -> float:
    return min(max(float(v), float(low)), float(high))


def _window(profile_key: str, target_season: int) -> Tuple[Any, List[int], Dict[int, float]]:
    profile = get_model_profile(profile_key)
    seasons = profile.target_seasons(int(target_season))
    weights = profile.normalized_weights()
    return profile, seasons, {int(s): float(weights[idx]) for idx, s in enumerate(seasons) if idx < len(weights)}


def _renorm(weights: Dict[int, float], seasons: Iterable[int]) -> Dict[int, float]:
    present = [int(s) for s in seasons if int(s) in weights]
    total = sum(float(weights[s]) for s in present)
    if total <= 0.0:
        return {}
    return {s: float(weights[s]) / total for s in present}


def _quality(*, seasons_available: int, window: int, weighted_played: float, avg_teams: float = 0.0) -> str:
    seasons = int(seasons_available or 0)
    played = float(weighted_played or 0.0)
    teams = float(avg_teams or 0.0)

    if seasons <= 0 or played <= 0:
        return "INSUFFICIENT"

    if played < 4 and (teams >= 32 or seasons >= 3):
        return "CUP_LIKE"

    if seasons >= int(window) and played >= 24:
        return "STRONG"

    if seasons >= min(4, int(window)) and played >= 12:
        return "OK"

    if seasons >= 2 and played >= 6:
        return "THIN"

    return "INSUFFICIENT"


def _worst_quality(*values: str) -> str:
    return min([str(v or "UNKNOWN") for v in values], key=lambda q: QUALITY_SCORE.get(q, 0))


def _load_rows(conn, *, league_id: Optional[int], team_id: Optional[int], seasons: List[int]) -> List[Dict[str, Any]]:
    """
    Carrega linhas por season.

    - league_id + team_id: histórico do time na mesma liga.
    - team_id sem league_id: histórico global do time nas ligas que já temos em team_season_stats.
    - league_id sem team_id: prior histórico da liga.
    """
    filters = ["season = ANY(%(seasons)s::int[])"]
    params: Dict[str, Any] = {"seasons": [int(s) for s in seasons]}

    if league_id is not None:
        filters.append("league_id = %(league_id)s")
        params["league_id"] = int(league_id)

    if team_id is not None:
        filters.append("team_id = %(team_id)s")
        params["team_id"] = int(team_id)

    sql = f"""
      SELECT
        season::int,
        COUNT(DISTINCT team_id)::int AS teams_count,
        COALESCE(SUM(played), 0)::float AS played,
        COALESCE(AVG(NULLIF(played, 0)), 0)::float AS avg_team_played,
        COALESCE(SUM(goals_for), 0)::float AS goals_for,
        COALESCE(SUM(goals_against), 0)::float AS goals_against,
        COALESCE(SUM(home_played), 0)::float AS home_played,
        COALESCE(SUM(home_goals_for), 0)::float AS home_goals_for,
        COALESCE(SUM(home_goals_against), 0)::float AS home_goals_against,
        COALESCE(SUM(away_played), 0)::float AS away_played,
        COALESCE(SUM(away_goals_for), 0)::float AS away_goals_for,
        COALESCE(SUM(away_goals_against), 0)::float AS away_goals_against
      FROM core.team_season_stats
      WHERE {' AND '.join(filters)}
      GROUP BY season
      ORDER BY season DESC
    """

    with conn.cursor() as cur:
        cur.execute(sql, params)
        rows = cur.fetchall() or []

    return [
        {
            "season": _i(row[0]),
            "teams_count": _i(row[1]),
            "played": _f(row[2]),
            "avg_team_played": _f(row[3]),
            "goals_for": _f(row[4]),
            "goals_against": _f(row[5]),
            "home_played": _f(row[6]),
            "home_goals_for": _f(row[7]),
            "home_goals_against": _f(row[8]),
            "away_played": _f(row[9]),
            "away_goals_for": _f(row[10]),
            "away_goals_against": _f(row[11]),
        }
        for row in rows
    ]


def _weighted_rate(rows: List[Dict[str, Any]], weights: Dict[int, float], numerator: str, denominator: str) -> Optional[float]:
    usable = [int(r["season"]) for r in rows if _f(r.get(denominator)) > 0]
    used_weights = _renorm(weights, usable)
    if not used_weights:
        return None

    return sum(
        used_weights[int(r["season"])] * _div(r.get(numerator), r.get(denominator))
        for r in rows
        if int(r["season"]) in used_weights
    )


def _summary(rows: List[Dict[str, Any]], *, weights: Dict[int, float], window: int, league_level: bool) -> Dict[str, Any]:
    usable = [int(r["season"]) for r in rows if _f(r.get("played")) > 0]
    used_weights = _renorm(weights, usable)

    weighted_played = sum(used_weights.get(int(r["season"]), 0.0) * _f(r.get("played")) for r in rows)
    weighted_avg_team_played = sum(
        used_weights.get(int(r["season"]), 0.0) * _f(r.get("avg_team_played")) for r in rows
    )
    weighted_teams = sum(used_weights.get(int(r["season"]), 0.0) * _f(r.get("teams_count")) for r in rows)

    q_played = weighted_avg_team_played if league_level else weighted_played

    out: Dict[str, Any] = {
        "quality": _quality(
            seasons_available=len(used_weights),
            window=int(window),
            weighted_played=q_played,
            avg_teams=weighted_teams,
        ),
        "seasons_available": len(used_weights),
        "season_weights_used": {str(k): round(float(v), 6) for k, v in sorted(used_weights.items(), reverse=True)},
        "raw_total_played": round(sum(_f(r.get("played")) for r in rows), 2),
        "weighted_avg_played": round(float(weighted_played), 2),
    }

    if league_level:
        out.update(
            {
                "weighted_avg_team_played": round(float(weighted_avg_team_played), 2),
                "weighted_avg_teams_count": round(float(weighted_teams), 2),
                "mu_home": _r(_weighted_rate(rows, weights, "home_goals_for", "home_played")),
                "mu_away": _r(_weighted_rate(rows, weights, "away_goals_for", "away_played")),
            }
        )
    else:
        out.update(
            {
                "home_gf_pg": _r(_weighted_rate(rows, weights, "home_goals_for", "home_played")),
                "home_ga_pg": _r(_weighted_rate(rows, weights, "home_goals_against", "home_played")),
                "away_gf_pg": _r(_weighted_rate(rows, weights, "away_goals_for", "away_played")),
                "away_ga_pg": _r(_weighted_rate(rows, weights, "away_goals_against", "away_played")),
                "overall_gf_pg": _r(_weighted_rate(rows, weights, "goals_for", "played")),
                "overall_ga_pg": _r(_weighted_rate(rows, weights, "goals_against", "played")),
            }
        )

    return out


def _effective_team_history(same_league: Dict[str, Any], global_history: Dict[str, Any], *, cap: float) -> Dict[str, Any]:
    """
    Base global do time, com ajuste pequeno da mesma liga.

    Motivo:
    - a base global reduz cold start/promoted-like;
    - a mesma liga entra como ajuste, mas limitada pelo cap do perfil;
    - copas/torneios curtos não viram base principal por acidente.
    """
    global_ok = QUALITY_SCORE.get(str(global_history.get("quality")), 0) >= QUALITY_SCORE["THIN"]
    same_ok = QUALITY_SCORE.get(str(same_league.get("quality")), 0) >= QUALITY_SCORE["THIN"]

    if not global_ok and not same_ok:
        return {
            "source": "none",
            "quality": "INSUFFICIENT",
            "same_league_weight": 0.0,
            "global_weight": 0.0,
        }

    keys = ["home_gf_pg", "home_ga_pg", "away_gf_pg", "away_ga_pg", "overall_gf_pg", "overall_ga_pg"]

    if not global_ok:
        return {
            "source": "same_league",
            "quality": same_league.get("quality"),
            "same_league_weight": 1.0,
            "global_weight": 0.0,
            **{k: same_league.get(k) for k in keys},
        }

    same_weight = 0.0
    if same_ok:
        same_weight = min(float(cap), max(0.0, float(same_league.get("weighted_avg_played") or 0.0) / 80.0))

    global_weight = 1.0 - same_weight

    def blend(key: str) -> Optional[float]:
        gv = global_history.get(key)
        sv = same_league.get(key)

        if gv is None and sv is None:
            return None
        if gv is None:
            return _f(sv)
        if sv is None or same_weight <= 0:
            return _f(gv)

        return global_weight * _f(gv) + same_weight * _f(sv)

    quality = _worst_quality(
        str(global_history.get("quality")),
        str(same_league.get("quality")) if same_weight > 0 else "STRONG",
    )

    return {
        "source": "global_plus_same_league_adjustment" if same_weight > 0 else "global",
        "quality": quality,
        "same_league_weight": round(float(same_weight), 4),
        "global_weight": round(float(global_weight), 4),
        "home_gf_pg": _r(blend("home_gf_pg")),
        "home_ga_pg": _r(blend("home_ga_pg")),
        "away_gf_pg": _r(blend("away_gf_pg")),
        "away_ga_pg": _r(blend("away_ga_pg")),
        "overall_gf_pg": _r(blend("overall_gf_pg")),
        "overall_ga_pg": _r(blend("overall_ga_pg")),
    }


def build_match_historical_context(
    conn,
    *,
    league_id: int,
    season: Optional[int],
    home_team_id: int,
    away_team_id: int,
    profile_key: str = "model_v1_hist5_decay",
) -> Dict[str, Any]:
    target_season = resolve_target_season(conn, league_id=int(league_id), requested_season=season)

    if target_season is None:
        return {
            "status": "no_team_season_stats",
            "league_id": int(league_id),
        }

    profile, seasons, weights = _window(profile_key, int(target_season))
    window = int(profile.history_window or len(seasons) or 1)
    cap = float(profile.competition_adjustment_cap or 0.15)

    league_prior = _summary(
        _load_rows(conn, league_id=league_id, team_id=None, seasons=seasons),
        weights=weights,
        window=window,
        league_level=True,
    )

    def team(team_id: int) -> Dict[str, Any]:
        same = _summary(
            _load_rows(conn, league_id=league_id, team_id=team_id, seasons=seasons),
            weights=weights,
            window=window,
            league_level=False,
        )
        glob = _summary(
            _load_rows(conn, league_id=None, team_id=team_id, seasons=seasons),
            weights=weights,
            window=window,
            league_level=False,
        )

        return {
            "team_id": int(team_id),
            "same_league": same,
            "global": glob,
            "effective": _effective_team_history(same, glob, cap=cap),
        }

    home = team(int(home_team_id))
    away = team(int(away_team_id))

    mu_home = _f(league_prior.get("mu_home"), 1.35)
    mu_away = _f(league_prior.get("mu_away"), 1.10)

    he = home["effective"]
    ae = away["effective"]

    raw_home_attack = _div(mu_home if he.get("home_gf_pg") is None else he.get("home_gf_pg"), mu_home, 1.0)
    raw_home_defense = _div(mu_away if he.get("home_ga_pg") is None else he.get("home_ga_pg"), mu_away, 1.0)
    raw_away_attack = _div(mu_away if ae.get("away_gf_pg") is None else ae.get("away_gf_pg"), mu_away, 1.0)
    raw_away_defense = _div(mu_home if ae.get("away_ga_pg") is None else ae.get("away_ga_pg"), mu_home, 1.0)

    home_attack = _clamp(raw_home_attack, 1.0 - cap, 1.0 + cap)
    home_defense = _clamp(raw_home_defense, 1.0 - cap, 1.0 + cap)
    away_attack = _clamp(raw_away_attack, 1.0 - cap, 1.0 + cap)
    away_defense = _clamp(raw_away_defense, 1.0 - cap, 1.0 + cap)

    quality = _worst_quality(str(league_prior.get("quality")), str(he.get("quality")), str(ae.get("quality")))

    guardrails: List[str] = []
    if league_prior.get("quality") == "CUP_LIKE":
        guardrails.append("cup_like_league_history")
    if he.get("quality") == "CUP_LIKE" or ae.get("quality") == "CUP_LIKE":
        guardrails.append("cup_like_team_history")
    if quality in {"THIN", "INSUFFICIENT", "UNKNOWN"}:
        guardrails.append("thin_or_insufficient_history")

    return {
        "status": "ok",
        "connected_to_snapshot": False,
        "profile": profile.as_dict(),
        "league_id": int(league_id),
        "target_season": int(target_season),
        "target_seasons": seasons,
        "configured_weight_by_season": {str(k): round(float(v), 6) for k, v in weights.items()},
        "home_team_id": int(home_team_id),
        "away_team_id": int(away_team_id),
        "league_prior": league_prior,
        "home_team": home,
        "away_team": away,
        "match_history_quality": quality,
        "guardrails": sorted(set(guardrails)),
        "lambda_preview": {
            "warning": "diagnostic_only_not_connected_to_snapshot",
            "home_attack_factor_raw": _r(raw_home_attack),
            "home_defense_factor_raw": _r(raw_home_defense),
            "away_attack_factor_raw": _r(raw_away_attack),
            "away_defense_factor_raw": _r(raw_away_defense),
            "home_attack_factor_capped": _r(home_attack),
            "home_defense_factor_capped": _r(home_defense),
            "away_attack_factor_capped": _r(away_attack),
            "away_defense_factor_capped": _r(away_defense),
            "lambda_home_preview": _r(mu_home * home_attack * away_defense),
            "lambda_away_preview": _r(mu_away * away_attack * home_defense),
        },
    }