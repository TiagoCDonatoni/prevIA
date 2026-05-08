from __future__ import annotations

import math
from typing import Any, Dict, Optional


# Escala neutra = 1.00.
# v0 em código para ser rápido e auditável. Depois migramos para tabela/admin.
LEAGUE_STRENGTH_BY_ID: Dict[int, float] = {
    # UEFA / elite
    2: 1.24,    # UEFA Champions League
    3: 1.15,    # UEFA Europa League
    39: 1.19,   # Premier League
    140: 1.15,  # LaLiga
    78: 1.14,   # Bundesliga
    135: 1.13,  # Serie A Itália
    61: 1.08,   # Ligue 1
    88: 1.02,   # Eredivisie
    94: 1.00,   # Portugal

    # CONMEBOL / Américas
    13: 0.98,   # Libertadores
    11: 0.86,   # Sul-Americana
    71: 0.94,   # Brasileirão Série A
    72: 0.72,   # Brasileirão Série B
    128: 0.90,  # Argentina
    239: 0.80,  # Colômbia
    265: 0.76,  # Chile
    281: 0.74,  # Paraguai
}

DEFAULT_LEAGUE_STRENGTH = 0.86
MIN_TEAM_PLAYED_FOR_POWER = 6.0


def _clamp(value: float, low: float, high: float) -> float:
    return max(float(low), min(float(high), float(value)))


def _safe_float(raw: Any, default: float = 0.0) -> float:
    try:
        if raw is None:
            return float(default)
        value = float(raw)
        if math.isnan(value) or math.isinf(value):
            return float(default)
        return value
    except Exception:
        return float(default)


def _league_strength_from_name(name: str) -> float:
    n = str(name or "").lower()

    if "champions" in n:
        return 1.24
    if "premier league" in n or "england" in n:
        return 1.19
    if "laliga" in n or "la liga" in n:
        return 1.15
    if "bundesliga" in n:
        return 1.14
    if "serie a" in n and ("ital" in n or "italy" in n):
        return 1.13
    if "ligue 1" in n or "france" in n:
        return 1.08
    if "libertadores" in n:
        return 0.98
    if "brasile" in n or "brazil" in n:
        return 0.94
    if "sudamericana" in n or "sul-americana" in n:
        return 0.86
    if "argentina" in n:
        return 0.90
    if "paraguay" in n or "paraguai" in n:
        return 0.74
    if "bolivia" in n or "bolívia" in n:
        return 0.70
    if "peru" in n:
        return 0.72
    if "colombia" in n:
        return 0.80

    return DEFAULT_LEAGUE_STRENGTH


def league_strength_factor(*, league_id: Optional[int], league_name: Optional[str]) -> float:
    if league_id is not None:
        configured = LEAGUE_STRENGTH_BY_ID.get(int(league_id))
        if configured is not None:
            return float(configured)
    return float(_league_strength_from_name(str(league_name or "")))


def _load_team_primary_league(conn, *, reference_season: int, team_id: int) -> Optional[Dict[str, Any]]:
    """
    Busca a melhor temporada disponível do time.

    Importante para casos cross-calendar:
    - Brasil pode estar em 2026;
    - Europa pode ter dados em 2025/26 materializados como 2025.
    """
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT
              s.league_id,
              l.name,
              s.season,
              s.played::float,
              s.points_per_game::float,
              s.goal_diff::float,
              s.goals_for::float,
              s.goals_against::float
            FROM core.team_season_stats s
            JOIN core.leagues l ON l.league_id = s.league_id
            WHERE s.team_id = %(team_id)s
              AND s.played >= 1
            ORDER BY
              CASE
                WHEN s.season = %(reference_season)s THEN 0
                WHEN s.season < %(reference_season)s THEN 1
                ELSE 2
              END,
              ABS(s.season - %(reference_season)s) ASC,
              s.season DESC,
              s.played DESC,
              s.league_id ASC
            LIMIT 1
            """,
            {"reference_season": int(reference_season), "team_id": int(team_id)},
        )
        row = cur.fetchone()

    if not row:
        return None

    played = _safe_float(row[3])
    return {
        "league_id": int(row[0]),
        "league_name": str(row[1] or ""),
        "season": int(row[2]),
        "season_gap": int(reference_season) - int(row[2]),
        "played": played,
        "points_per_game": _safe_float(row[4]),
        "goal_diff_per_game": _safe_float(row[5]) / played if played > 0 else 0.0,
        "goals_for_per_game": _safe_float(row[6]) / played if played > 0 else 0.0,
        "goals_against_per_game": _safe_float(row[7]) / played if played > 0 else 0.0,
    }


def _load_league_distribution(conn, *, league_id: int, season: int) -> Dict[str, float]:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT
              AVG(points_per_game)::float,
              COALESCE(NULLIF(STDDEV_POP(points_per_game), 0), 0.45)::float,
              AVG(CASE WHEN played > 0 THEN goal_diff::float / played::float ELSE 0 END)::float,
              COALESCE(NULLIF(STDDEV_POP(CASE WHEN played > 0 THEN goal_diff::float / played::float ELSE 0 END), 0), 0.70)::float,
              COUNT(*)::int
            FROM core.team_season_stats
            WHERE league_id = %(league_id)s
              AND season = %(season)s
              AND played >= 1
            """,
            {"league_id": int(league_id), "season": int(season)},
        )
        row = cur.fetchone()

    if not row:
        return {
            "avg_ppg": 1.35,
            "std_ppg": 0.45,
            "avg_gd_pg": 0.0,
            "std_gd_pg": 0.70,
            "team_count": 0.0,
        }

    return {
        "avg_ppg": _safe_float(row[0], 1.35),
        "std_ppg": max(_safe_float(row[1], 0.45), 0.20),
        "avg_gd_pg": _safe_float(row[2], 0.0),
        "std_gd_pg": max(_safe_float(row[3], 0.70), 0.25),
        "team_count": _safe_float(row[4], 0.0),
    }


def _team_relative_score(team: Dict[str, Any], dist: Dict[str, float]) -> float:
    ppg_z = (
        _safe_float(team.get("points_per_game")) - _safe_float(dist.get("avg_ppg"), 1.35)
    ) / max(_safe_float(dist.get("std_ppg"), 0.45), 0.20)

    gd_z = (
        _safe_float(team.get("goal_diff_per_game")) - _safe_float(dist.get("avg_gd_pg"), 0.0)
    ) / max(_safe_float(dist.get("std_gd_pg"), 0.70), 0.25)

    return _clamp((0.65 * ppg_z) + (0.35 * gd_z), -1.50, 1.50)


def _club_power_from_components(*, league_strength: float, relative_score: float, played: float) -> Dict[str, Any]:
    """
    Dinâmica desejada:
    - time top de liga forte recebe multiplicador relevante;
    - time médio/ruim de liga forte não herda todo o peso da liga;
    - líder de liga média pode superar time médio/baixo de liga forte.
    """
    relative_multiplier = _clamp(1.0 + (0.20 * float(relative_score)), 0.72, 1.30)

    sample_weight = _clamp(float(played) / 18.0, 0.25, 1.0)
    effective_multiplier = 1.0 + ((relative_multiplier - 1.0) * sample_weight)

    club_power = _clamp(float(league_strength) * effective_multiplier, 0.55, 1.60)

    return {
        "relative_multiplier": round(float(relative_multiplier), 4),
        "sample_weight": round(float(sample_weight), 4),
        "club_power": round(float(club_power), 4),
    }


def _team_strength_context(conn, *, reference_season: int, team_id: int) -> Dict[str, Any]:
    primary = _load_team_primary_league(conn, reference_season=int(reference_season), team_id=int(team_id))

    if not primary:
        return {
            "team_id": int(team_id),
            "league_id": None,
            "league_name": None,
            "season": None,
            "season_gap": None,
            "played": 0.0,
            "league_strength": DEFAULT_LEAGUE_STRENGTH,
            "relative_score": 0.0,
            "relative_multiplier": 1.0,
            "sample_weight": 0.25,
            "club_power": DEFAULT_LEAGUE_STRENGTH,
            "strength_confidence": "low",
            "source": "league_strength_v0_no_primary_league",
        }

    dist = _load_league_distribution(
        conn,
        league_id=int(primary["league_id"]),
        season=int(primary["season"]),
    )

    league_strength = league_strength_factor(
        league_id=int(primary["league_id"]),
        league_name=str(primary.get("league_name") or ""),
    )

    rel = _team_relative_score(primary, dist)

    power = _club_power_from_components(
        league_strength=league_strength,
        relative_score=rel,
        played=_safe_float(primary.get("played")),
    )

    played = _safe_float(primary.get("played"))
    season_gap_abs = abs(int(primary.get("season_gap") or 0))

    confidence = "high"
    if played < MIN_TEAM_PLAYED_FOR_POWER:
        confidence = "low"
    elif played < 18.0 or season_gap_abs >= 2:
        confidence = "medium"

    return {
        "team_id": int(team_id),
        "league_id": int(primary["league_id"]),
        "league_name": str(primary.get("league_name") or ""),
        "season": int(primary["season"]),
        "season_gap": int(primary["season_gap"]),
        "played": round(float(played), 2),
        "points_per_game": round(_safe_float(primary.get("points_per_game")), 4),
        "goal_diff_per_game": round(_safe_float(primary.get("goal_diff_per_game")), 4),
        "league_strength": round(float(league_strength), 4),
        "relative_score": round(float(rel), 4),
        "relative_multiplier": power["relative_multiplier"],
        "sample_weight": power["sample_weight"],
        "club_power": power["club_power"],
        "strength_confidence": confidence,
        "source": "league_strength_v0_dynamic_club_power",
    }


def build_match_strength_context(
    conn,
    *,
    season: int,
    home_team_id: int,
    away_team_id: int,
    reference_league_id: Optional[int] = None,
) -> Dict[str, Any]:
    home = _team_strength_context(conn, reference_season=int(season), team_id=int(home_team_id))
    away = _team_strength_context(conn, reference_season=int(season), team_id=int(away_team_id))

    home_power = max(_safe_float(home.get("club_power"), 1.0), 0.01)
    away_power = max(_safe_float(away.get("club_power"), 1.0), 0.01)

    home_league_id = home.get("league_id")
    away_league_id = away.get("league_id")
    cross_league = bool(home_league_id and away_league_id and int(home_league_id) != int(away_league_id))

    power_gap = round(float(home_power - away_power), 4)
    abs_gap = abs(float(power_gap))

    min_played = min(_safe_float(home.get("played")), _safe_float(away.get("played")))

    if min_played >= 18.0:
        exponent = 1.15
    elif min_played >= MIN_TEAM_PLAYED_FOR_POWER:
        exponent = 0.95
    else:
        exponent = 0.65

    stronger_side = "home" if home_power >= away_power else "away"
    stronger = home if stronger_side == "home" else away

    stronger_relative_score = _safe_float(stronger.get("relative_score"))
    stronger_club_power = _safe_float(stronger.get("club_power"))
    stronger_league_strength = _safe_float(stronger.get("league_strength"))

    elite_mismatch = bool(
        cross_league
        and abs_gap >= 0.25
        and stronger_relative_score >= 1.05
        and stronger_club_power >= 1.25
        and stronger_league_strength >= 1.04
    )

    if elite_mismatch:
        # PSG/City/Real/Bayern-like case:
        # não é só "liga forte"; é clube muito acima do próprio ambiente.
        exponent = max(float(exponent), 1.35)

    apply_adjustment = bool(cross_league and abs_gap >= 0.04)

    if apply_adjustment:
        lower_cap = 0.52 if elite_mismatch else 0.60
        upper_cap = 1.90 if elite_mismatch else 1.65

        home_lambda_factor = _clamp((home_power / away_power) ** exponent, lower_cap, upper_cap)
        away_lambda_factor = _clamp((away_power / home_power) ** exponent, lower_cap, upper_cap)
    else:
        home_lambda_factor = 1.0
        away_lambda_factor = 1.0

    season_alignment_status = "aligned"
    if home.get("season") != away.get("season"):
        season_alignment_status = "cross_calendar"

    return {
        "version": "league_strength_v0_dynamic_club_power",
        "reference_league_id": int(reference_league_id) if reference_league_id is not None else None,
        "reference_season": int(season),
        "season_alignment_status": season_alignment_status,
        "cross_league": bool(cross_league),
        "adjustment_applied": bool(apply_adjustment),
        "elite_mismatch": bool(elite_mismatch),
        "stronger_side": stronger_side,
        "power_gap_home_minus_away": power_gap,
        "abs_power_gap": round(float(abs_gap), 4),
        "exponent": round(float(exponent), 4),
        "home_lambda_factor": round(float(home_lambda_factor), 4),
        "away_lambda_factor": round(float(away_lambda_factor), 4),
        "home": home,
        "away": away,
    }