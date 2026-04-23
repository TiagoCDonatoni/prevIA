from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, Optional


@dataclass
class Lambdas:
    lam_home: float
    lam_away: float

    @property
    def lam_total(self) -> float:
        return self.lam_home + self.lam_away


@dataclass
class LambdaEstimate:
    lambdas: Lambdas
    source: str
    diagnostics: Dict[str, Any]


def _safe_div(n: float, d: float, default: float = 0.0) -> float:
    return (n / d) if d and d != 0 else default


def _blend(primary: float, secondary: float, primary_weight: float) -> float:
    w = max(0.0, min(1.0, float(primary_weight)))
    return (w * float(primary)) + ((1.0 - w) * float(secondary))

def _compute_competition_weight_from_matches(n_matches: int) -> float:
    """
    Define quanto confiar na competição atual vs temporada global.

    Regra:
    - poucos jogos -> confiar mais no global
    - muitos jogos -> confiar mais na competição
    """

    if n_matches is None:
        return 0.35

    n = int(n_matches)

    if n <= 3:
        return 0.25
    elif n <= 6:
        return 0.35
    elif n <= 10:
        return 0.50
    elif n <= 15:
        return 0.65
    else:
        return 0.75

def _clamp01(v: float) -> float:
    return min(max(float(v), 0.0), 1.0)


def _confidence_level(score: float) -> str:
    s = float(score)
    if s >= 0.75:
        return "high"
    if s >= 0.50:
        return "medium"
    return "low"


def _clamp_lambda_pair(
    *,
    lam_home: float,
    lam_away: float,
    clamp_min: float,
    clamp_max: float,
) -> Lambdas:
    return Lambdas(
        lam_home=min(max(float(lam_home), clamp_min), clamp_max),
        lam_away=min(max(float(lam_away), clamp_min), clamp_max),
    )


def _load_league_scoring_context(conn, *, league_id: int, season: int) -> Optional[Dict[str, float]]:
    sql = """
      SELECT
        SUM(home_goals_for)::float AS sum_hgf,
        SUM(home_played)::float    AS sum_hp,
        SUM(away_goals_for)::float AS sum_agf,
        SUM(away_played)::float    AS sum_ap
      FROM core.team_season_stats
      WHERE league_id=%(league_id)s AND season=%(season)s
    """
    with conn.cursor() as cur:
        cur.execute(sql, {"league_id": int(league_id), "season": int(season)})
        row = cur.fetchone()

    if not row or not row[1] or not row[3]:
        return None

    sum_hgf, sum_hp, sum_agf, sum_ap = row
    return {
        "mu_home": _safe_div(float(sum_hgf), float(sum_hp), default=1.35),
        "mu_away": _safe_div(float(sum_agf), float(sum_ap), default=1.10),
    }


def _load_team_competition_split_stats(
    conn,
    *,
    league_id: int,
    season: int,
    team_id: int,
) -> Optional[Dict[str, float]]:
    sql = """
      SELECT
        played::float,
        home_played::float,
        away_played::float,
        home_goals_for::float,
        home_goals_against::float,
        away_goals_for::float,
        away_goals_against::float
      FROM core.team_season_stats
      WHERE league_id=%(league_id)s
        AND season=%(season)s
        AND team_id=%(team_id)s
      LIMIT 1
    """
    with conn.cursor() as cur:
        cur.execute(
            sql,
            {
                "league_id": int(league_id),
                "season": int(season),
                "team_id": int(team_id),
            },
        )
        row = cur.fetchone()

    if not row:
        return None

    played, home_played, away_played, home_gf, home_ga, away_gf, away_ga = row
    return {
        "played": float(played or 0.0),
        "home_played": float(home_played or 0.0),
        "away_played": float(away_played or 0.0),
        "home_gf_pg": _safe_div(float(home_gf or 0.0), float(home_played or 0.0), 0.0),
        "home_ga_pg": _safe_div(float(home_ga or 0.0), float(home_played or 0.0), 0.0),
        "away_gf_pg": _safe_div(float(away_gf or 0.0), float(away_played or 0.0), 0.0),
        "away_ga_pg": _safe_div(float(away_ga or 0.0), float(away_played or 0.0), 0.0),
    }


def _load_team_global_season_split_stats(
    conn,
    *,
    season: int,
    team_id: int,
) -> Optional[Dict[str, float]]:
    """
    Forma global do time na temporada, considerando todas as partidas oficiais
    presentes em core.fixtures para a mesma season.
    """
    sql = """
      SELECT
        COUNT(*)::float AS played,
        COUNT(*) FILTER (WHERE f.home_team_id=%(team_id)s)::float AS home_played,
        COUNT(*) FILTER (WHERE f.away_team_id=%(team_id)s)::float AS away_played,
        COALESCE(SUM(CASE WHEN f.home_team_id=%(team_id)s THEN f.goals_home ELSE 0 END), 0)::float AS home_goals_for,
        COALESCE(SUM(CASE WHEN f.home_team_id=%(team_id)s THEN f.goals_away ELSE 0 END), 0)::float AS home_goals_against,
        COALESCE(SUM(CASE WHEN f.away_team_id=%(team_id)s THEN f.goals_away ELSE 0 END), 0)::float AS away_goals_for,
        COALESCE(SUM(CASE WHEN f.away_team_id=%(team_id)s THEN f.goals_home ELSE 0 END), 0)::float AS away_goals_against,
        COALESCE(
          SUM(
            CASE
              WHEN f.home_team_id=%(team_id)s THEN f.goals_home
              WHEN f.away_team_id=%(team_id)s THEN f.goals_away
              ELSE 0
            END
          ),
          0
        )::float AS goals_for_total,
        COALESCE(
          SUM(
            CASE
              WHEN f.home_team_id=%(team_id)s THEN f.goals_away
              WHEN f.away_team_id=%(team_id)s THEN f.goals_home
              ELSE 0
            END
          ),
          0
        )::float AS goals_against_total
      FROM core.fixtures f
      WHERE f.season=%(season)s
        AND (f.home_team_id=%(team_id)s OR f.away_team_id=%(team_id)s)
        AND f.goals_home IS NOT NULL
        AND f.goals_away IS NOT NULL
        AND COALESCE(f.is_cancelled, false) = false
    """
    with conn.cursor() as cur:
        cur.execute(sql, {"season": int(season), "team_id": int(team_id)})
        row = cur.fetchone()

    if not row or not row[0]:
        return None

    (
        played,
        home_played,
        away_played,
        home_gf,
        home_ga,
        away_gf,
        away_ga,
        goals_for_total,
        goals_against_total,
    ) = row

    played_f = float(played or 0.0)
    home_played_f = float(home_played or 0.0)
    away_played_f = float(away_played or 0.0)
    goals_for_total_f = float(goals_for_total or 0.0)
    goals_against_total_f = float(goals_against_total or 0.0)

    return {
        "played": played_f,
        "home_played": home_played_f,
        "away_played": away_played_f,
        "home_gf_pg": _safe_div(float(home_gf or 0.0), home_played_f, 0.0),
        "home_ga_pg": _safe_div(float(home_ga or 0.0), home_played_f, 0.0),
        "away_gf_pg": _safe_div(float(away_gf or 0.0), away_played_f, 0.0),
        "away_ga_pg": _safe_div(float(away_ga or 0.0), away_played_f, 0.0),
        "overall_gf_pg": _safe_div(goals_for_total_f, played_f, 0.0),
        "overall_ga_pg": _safe_div(goals_against_total_f, played_f, 0.0),
    }


def _preferred_global_rate(global_stats: Dict[str, float], side_key: str, fallback_key: str) -> float:
    side_played_key = "home_played" if side_key.startswith("home_") else "away_played"
    if float(global_stats.get(side_played_key, 0.0)) >= 2.0:
        return float(global_stats.get(side_key, 0.0))
    return float(global_stats.get(fallback_key, 0.0))

def _team_had_previous_season_in_same_league(
    conn,
    *,
    league_id: int,
    season: int,
    team_id: int,
) -> bool:
    prev_season = int(season) - 1

    sql = """
      SELECT 1
      FROM core.team_season_stats
      WHERE league_id=%(league_id)s
        AND season=%(season)s
        AND team_id=%(team_id)s
      LIMIT 1
    """

    with conn.cursor() as cur:
        cur.execute(
            sql,
            {
                "league_id": int(league_id),
                "season": int(prev_season),
                "team_id": int(team_id),
            },
        )
        row = cur.fetchone()

    return bool(row)


def _infer_promoted_like_flag(
    conn,
    *,
    league_id: int,
    season: int,
    team_id: int,
) -> bool:
    """
    Heurística simples desta etapa:
    se o time não tem registro na mesma liga na season anterior,
    tratamos como newcomer/promoted-like.
    """
    return not _team_had_previous_season_in_same_league(
        conn,
        league_id=league_id,
        season=season,
        team_id=team_id,
    )


def _apply_promoted_like_adjustment(
    *,
    atk_value: float,
    def_value: float,
    is_promoted_like: bool,
) -> Dict[str, float]:
    """
    Ajuste conservador:
    - ataque cai um pouco
    - defesa fica um pouco pior
    """
    if not is_promoted_like:
        return {
            "atk": float(atk_value),
            "def": float(def_value),
            "attack_factor": 1.0,
            "defense_factor": 1.0,
        }

    attack_factor = 0.93
    defense_factor = 1.07

    return {
        "atk": float(atk_value) * attack_factor,
        "def": float(def_value) * defense_factor,
        "attack_factor": attack_factor,
        "defense_factor": defense_factor,
    }

def _build_blended_confidence(
    *,
    home_comp: Optional[Dict[str, float]],
    away_comp: Optional[Dict[str, float]],
    home_global: Optional[Dict[str, float]],
    away_global: Optional[Dict[str, float]],
    comp_weight_home: float,
    comp_weight_away: float,
) -> Dict[str, Any]:
    same_competition_stats = bool(home_comp and away_comp)
    global_season_form = bool(home_global and away_global)

    home_comp_played = float((home_comp or {}).get("played", 0.0))
    away_comp_played = float((away_comp or {}).get("played", 0.0))
    home_global_played = float((home_global or {}).get("played", 0.0))
    away_global_played = float((away_global or {}).get("played", 0.0))

    competition_sample_ok = home_comp_played >= 6.0 and away_comp_played >= 6.0
    global_sample_ok = home_global_played >= 8.0 and away_global_played >= 8.0

    score = 0.10
    if same_competition_stats:
        score += 0.20
    if global_season_form:
        score += 0.20
    if competition_sample_ok:
        score += 0.20
    if global_sample_ok:
        score += 0.20
    score += 0.05 * ((float(comp_weight_home) + float(comp_weight_away)) / 2.0)

    score = _clamp01(score)

    return {
        "overall": round(score, 4),
        "level": _confidence_level(score),
        "factors": {
            "same_competition_stats": same_competition_stats,
            "global_season_form": global_season_form,
            "competition_sample_ok": competition_sample_ok,
            "global_sample_ok": global_sample_ok,
            "uses_global_season_blend": True,
        },
        "coverage": {
            "competition_played_home": home_comp_played,
            "competition_played_away": away_comp_played,
            "global_played_home": home_global_played,
            "global_played_away": away_global_played,
            "competition_weight_home": round(float(comp_weight_home), 4),
            "competition_weight_away": round(float(comp_weight_away), 4),
        },
    }


def estimate_lambdas_from_team_season_stats(
    conn,
    *,
    league_id: int,
    season: int,
    home_team_id: int,
    away_team_id: int,
    clamp_min: float = 0.15,
    clamp_max: float = 4.50,
) -> Optional[Lambdas]:
    """
    Versão legada: usa apenas core.team_season_stats da competição.
    Mantida como fallback explícito.
    """
    league_ctx = _load_league_scoring_context(conn, league_id=league_id, season=season)
    if not league_ctx:
        return None

    h = _load_team_competition_split_stats(conn, league_id=league_id, season=season, team_id=home_team_id)
    a = _load_team_competition_split_stats(conn, league_id=league_id, season=season, team_id=away_team_id)

    if not h or not a:
        return None

    if not h["home_played"] or not a["away_played"]:
        return None

    mu_home = float(league_ctx["mu_home"])
    mu_away = float(league_ctx["mu_away"])

    atk_home = _safe_div(float(h["home_gf_pg"]), mu_home, 1.0)
    def_home = _safe_div(float(h["home_ga_pg"]), mu_away, 1.0)
    atk_away = _safe_div(float(a["away_gf_pg"]), mu_away, 1.0)
    def_away = _safe_div(float(a["away_ga_pg"]), mu_home, 1.0)

    lam_home = mu_home * atk_home * def_away
    lam_away = mu_away * atk_away * def_home

    return _clamp_lambda_pair(
        lam_home=lam_home,
        lam_away=lam_away,
        clamp_min=clamp_min,
        clamp_max=clamp_max,
    )


def estimate_lambdas_from_competition_and_global_season(
    conn,
    *,
    league_id: int,
    season: int,
    home_team_id: int,
    away_team_id: int,
    clamp_min: float = 0.15,
    clamp_max: float = 4.50,
) -> Optional[LambdaEstimate]:
    league_ctx = _load_league_scoring_context(conn, league_id=league_id, season=season)
    if not league_ctx:
        return None

    home_comp = _load_team_competition_split_stats(
        conn,
        league_id=league_id,
        season=season,
        team_id=home_team_id,
    )
    away_comp = _load_team_competition_split_stats(
        conn,
        league_id=league_id,
        season=season,
        team_id=away_team_id,
    )

    home_global = _load_team_global_season_split_stats(conn, season=season, team_id=home_team_id)
    away_global = _load_team_global_season_split_stats(conn, season=season, team_id=away_team_id)

    if not home_global or not away_global:
        return None

    mu_home = float(league_ctx["mu_home"])
    mu_away = float(league_ctx["mu_away"])

    home_matches = home_comp.get("played") if home_comp else None
    away_matches = away_comp.get("played") if away_comp else None

    comp_weight_home = _compute_competition_weight_from_matches(home_matches)
    comp_weight_away = _compute_competition_weight_from_matches(away_matches)

    global_weight_home = 1.0 - comp_weight_home
    global_weight_away = 1.0 - comp_weight_away

    home_comp_gf = float((home_comp or {}).get("home_gf_pg", 0.0))
    home_comp_ga = float((home_comp or {}).get("home_ga_pg", 0.0))
    away_comp_gf = float((away_comp or {}).get("away_gf_pg", 0.0))
    away_comp_ga = float((away_comp or {}).get("away_ga_pg", 0.0))

    home_global_gf = _preferred_global_rate(home_global, "home_gf_pg", "overall_gf_pg")
    home_global_ga = _preferred_global_rate(home_global, "home_ga_pg", "overall_ga_pg")
    away_global_gf = _preferred_global_rate(away_global, "away_gf_pg", "overall_gf_pg")
    away_global_ga = _preferred_global_rate(away_global, "away_ga_pg", "overall_ga_pg")

    blended_home_gf_pg = (
        _blend(home_comp_gf, home_global_gf, comp_weight_home) if home_comp else home_global_gf
    )
    blended_home_ga_pg = (
        _blend(home_comp_ga, home_global_ga, comp_weight_home) if home_comp else home_global_ga
    )
    blended_away_gf_pg = (
        _blend(away_comp_gf, away_global_gf, comp_weight_away) if away_comp else away_global_gf
    )
    blended_away_ga_pg = (
        _blend(away_comp_ga, away_global_ga, comp_weight_away) if away_comp else away_global_ga
    )

    home_promoted_like = _infer_promoted_like_flag(
        conn,
        league_id=league_id,
        season=season,
        team_id=home_team_id,
    )

    away_promoted_like = _infer_promoted_like_flag(
        conn,
        league_id=league_id,
        season=season,
        team_id=away_team_id,
    )

    home_adj = _apply_promoted_like_adjustment(
        atk_value=blended_home_gf_pg,
        def_value=blended_home_ga_pg,
        is_promoted_like=home_promoted_like,
    )

    away_adj = _apply_promoted_like_adjustment(
        atk_value=blended_away_gf_pg,
        def_value=blended_away_ga_pg,
        is_promoted_like=away_promoted_like,
    )

    blended_home_gf_pg = float(home_adj["atk"])
    blended_home_ga_pg = float(home_adj["def"])
    blended_away_gf_pg = float(away_adj["atk"])
    blended_away_ga_pg = float(away_adj["def"])

    atk_home = _safe_div(blended_home_gf_pg, mu_home, 1.0)
    def_home = _safe_div(blended_home_ga_pg, mu_away, 1.0)
    atk_away = _safe_div(blended_away_gf_pg, mu_away, 1.0)
    def_away = _safe_div(blended_away_ga_pg, mu_home, 1.0)

    lam_home = mu_home * atk_home * def_away
    lam_away = mu_away * atk_away * def_home

    confidence = _build_blended_confidence(
        home_comp=home_comp,
        away_comp=away_comp,
        home_global=home_global,
        away_global=away_global,
        comp_weight_home=comp_weight_home,
        comp_weight_away=comp_weight_away,
    )

    # penalizar confiança quando dependemos muito da temporada global
    if global_weight_home > 0.6 or global_weight_away > 0.6:
        penalty = 0.05

        confidence["overall"] = round(
            max(0.0, float(confidence["overall"]) - penalty),
            4
        )

        confidence["level"] = _confidence_level(confidence["overall"])

        confidence["factors"]["high_global_dependency"] = True
    else:
        confidence["factors"]["high_global_dependency"] = False

    if home_promoted_like or away_promoted_like:
        promoted_penalty = 0.08 if (home_promoted_like and away_promoted_like) else 0.05

        confidence["overall"] = round(
            max(0.0, float(confidence["overall"]) - promoted_penalty),
            4,
        )
        confidence["level"] = _confidence_level(float(confidence["overall"]))
        confidence["factors"]["home_promoted_like"] = bool(home_promoted_like)
        confidence["factors"]["away_promoted_like"] = bool(away_promoted_like)
        confidence["factors"]["promotion_adjustment_applied"] = True
    else:
        confidence["factors"]["home_promoted_like"] = False
        confidence["factors"]["away_promoted_like"] = False
        confidence["factors"]["promotion_adjustment_applied"] = False

    return LambdaEstimate(
        lambdas=_clamp_lambda_pair(
            lam_home=lam_home,
            lam_away=lam_away,
            clamp_min=clamp_min,
            clamp_max=clamp_max,
        ),
        source="team_season_stats_blended",
        diagnostics={
            "season": int(season),
            "mode": "competition_plus_global_season",
            "competition_weight_home": round(float(comp_weight_home), 4),
            "competition_weight_away": round(float(comp_weight_away), 4),
            "blended_home_gf_pg": round(float(blended_home_gf_pg), 4),
            "blended_home_ga_pg": round(float(blended_home_ga_pg), 4),
            "blended_away_gf_pg": round(float(blended_away_gf_pg), 4),
            "blended_away_ga_pg": round(float(blended_away_ga_pg), 4),
            "home_promoted_like": bool(home_promoted_like),
            "away_promoted_like": bool(away_promoted_like),
            "home_attack_factor": round(float(home_adj["attack_factor"]), 4),
            "home_defense_factor": round(float(home_adj["defense_factor"]), 4),
            "away_attack_factor": round(float(away_adj["attack_factor"]), 4),
            "away_defense_factor": round(float(away_adj["defense_factor"]), 4),
            "confidence": confidence,
            "home_matches_in_competition": home_matches,
            "away_matches_in_competition": away_matches,
            "global_weight_home": round(float(global_weight_home), 4),
            "global_weight_away": round(float(global_weight_away), 4),
        },
    )


def estimate_lambdas_from_recent_fixtures(
    conn,
    *,
    league_id: int,
    season: int,
    home_team_id: int,
    away_team_id: int,
    n_games: int = 10,
    clamp_min: float = 0.15,
    clamp_max: float = 4.50,
) -> Optional[Lambdas]:
    """
    Fallback: usa últimos N jogos (na mesma liga+season) para estimar λ_home e λ_away.
    Retorna None se não houver histórico suficiente.
    """
    sql_last = """
      WITH last_games AS (
        SELECT
          f.kickoff_utc,
          CASE WHEN f.home_team_id=%(team_id)s THEN f.goals_home ELSE f.goals_away END AS goals_for,
          CASE WHEN f.home_team_id=%(team_id)s THEN f.goals_away ELSE f.goals_home END AS goals_against
        FROM core.fixtures f
        WHERE f.league_id=%(league_id)s
          AND f.season=%(season)s
          AND (f.home_team_id=%(team_id)s OR f.away_team_id=%(team_id)s)
          AND f.goals_home IS NOT NULL
          AND f.goals_away IS NOT NULL
          AND COALESCE(f.is_cancelled, false) = false
        ORDER BY f.kickoff_utc DESC
        LIMIT %(n)s
      )
      SELECT
        AVG(goals_for)::float AS gf_avg,
        AVG(goals_against)::float AS ga_avg,
        COUNT(*)::int AS cnt
      FROM last_games
    """

    def _team_avgs(team_id: int) -> Optional[Dict[str, Any]]:
        with conn.cursor() as cur:
            cur.execute(
                sql_last,
                {"league_id": int(league_id), "season": int(season), "team_id": int(team_id), "n": int(n_games)},
            )
            r = cur.fetchone()
        if not r or not r[2] or int(r[2]) < max(4, int(n_games) // 2):
            return None
        return {"gf": float(r[0]), "ga": float(r[1]), "cnt": int(r[2])}

    h = _team_avgs(home_team_id)
    a = _team_avgs(away_team_id)
    if not h or not a:
        return None

    lam_home = 0.5 * h["gf"] + 0.5 * a["ga"]
    lam_away = 0.5 * a["gf"] + 0.5 * h["ga"]

    return _clamp_lambda_pair(
        lam_home=lam_home,
        lam_away=lam_away,
        clamp_min=clamp_min,
        clamp_max=clamp_max,
    )


def estimate_lambdas_from_league_prior(
    conn,
    *,
    league_id: int,
    season: int,
    clamp_min: float = 0.15,
    clamp_max: float = 4.50,
) -> Lambdas:
    """
    Prior controlado da liga/season.
    Ordem:
      1) core.team_season_stats
      2) core.fixtures finalizadas
      3) prior fixo conservador
    """
    sql_stats = """
      SELECT
        SUM(home_goals_for)::float AS sum_hgf,
        SUM(home_played)::float    AS sum_hp,
        SUM(away_goals_for)::float AS sum_agf,
        SUM(away_played)::float    AS sum_ap
      FROM core.team_season_stats
      WHERE league_id=%(league_id)s AND season=%(season)s
    """

    with conn.cursor() as cur:
        cur.execute(sql_stats, {"league_id": int(league_id), "season": int(season)})
        r = cur.fetchone()

    if r and r[1] and r[3]:
        mu_home = _safe_div(float(r[0]), float(r[1]), default=1.35)
        mu_away = _safe_div(float(r[2]), float(r[3]), default=1.10)
        return _clamp_lambda_pair(
            lam_home=mu_home,
            lam_away=mu_away,
            clamp_min=clamp_min,
            clamp_max=clamp_max,
        )

    sql_fx = """
      SELECT
        AVG(f.goals_home)::float AS mu_home,
        AVG(f.goals_away)::float AS mu_away
      FROM core.fixtures f
      WHERE f.league_id=%(league_id)s
        AND f.season=%(season)s
        AND f.goals_home IS NOT NULL
        AND f.goals_away IS NOT NULL
        AND COALESCE(f.is_cancelled, false) = false
    """
    with conn.cursor() as cur:
        cur.execute(sql_fx, {"league_id": int(league_id), "season": int(season)})
        r2 = cur.fetchone()

    if r2 and r2[0] is not None and r2[1] is not None:
        return _clamp_lambda_pair(
            lam_home=float(r2[0]),
            lam_away=float(r2[1]),
            clamp_min=clamp_min,
            clamp_max=clamp_max,
        )

    return _clamp_lambda_pair(
        lam_home=1.35,
        lam_away=1.10,
        clamp_min=clamp_min,
        clamp_max=clamp_max,
    )


def estimate_lambdas_with_fallback(
    conn,
    *,
    league_id: int,
    season: int,
    home_team_id: int,
    away_team_id: int,
    n_games: int = 10,
    clamp_min: float = 0.15,
    clamp_max: float = 4.50,
) -> LambdaEstimate:
    """
    Cadeia desta etapa:
      1) team_season_stats_blended (competição + temporada global)
      2) team_season_stats (legado)
      3) recent_fixtures
      4) league_prior
    """
    blended = estimate_lambdas_from_competition_and_global_season(
        conn,
        league_id=league_id,
        season=season,
        home_team_id=home_team_id,
        away_team_id=away_team_id,
        clamp_min=clamp_min,
        clamp_max=clamp_max,
    )
    if blended is not None:
        return blended

    ls = estimate_lambdas_from_team_season_stats(
        conn,
        league_id=league_id,
        season=season,
        home_team_id=home_team_id,
        away_team_id=away_team_id,
        clamp_min=clamp_min,
        clamp_max=clamp_max,
    )
    if ls is not None:
        return LambdaEstimate(
            lambdas=ls,
            source="team_season_stats",
            diagnostics={
                "season": int(season),
                "confidence": {
                    "overall": 0.58,
                    "level": "medium",
                    "factors": {
                        "same_competition_stats": True,
                        "global_season_form": False,
                        "competition_sample_ok": True,
                        "global_sample_ok": False,
                        "uses_global_season_blend": False,
                    },
                },
            },
        )

    rf = estimate_lambdas_from_recent_fixtures(
        conn,
        league_id=league_id,
        season=season,
        home_team_id=home_team_id,
        away_team_id=away_team_id,
        n_games=n_games,
        clamp_min=clamp_min,
        clamp_max=clamp_max,
    )
    if rf is not None:
        return LambdaEstimate(
            lambdas=rf,
            source="recent_fixtures",
            diagnostics={
                "season": int(season),
                "n_games": int(n_games),
                "confidence": {
                    "overall": 0.46,
                    "level": "low",
                    "factors": {
                        "same_competition_stats": False,
                        "global_season_form": False,
                        "competition_sample_ok": False,
                        "global_sample_ok": False,
                        "uses_recent_fixtures_fallback": True,
                    },
                },
            },
        )

    lp = estimate_lambdas_from_league_prior(
        conn,
        league_id=league_id,
        season=season,
        clamp_min=clamp_min,
        clamp_max=clamp_max,
    )
    return LambdaEstimate(
        lambdas=lp,
        source="league_prior",
        diagnostics={
            "season": int(season),
            "confidence": {
                "overall": 0.28,
                "level": "low",
                "factors": {
                    "same_competition_stats": False,
                    "global_season_form": False,
                    "competition_sample_ok": False,
                    "global_sample_ok": False,
                    "uses_league_prior": True,
                },
            },
        },
    )


def p_btts_yes(lam_home: float, lam_away: float) -> float:
    return (1.0 - math.exp(-lam_home)) * (1.0 - math.exp(-lam_away))


def _poisson_pmf(k: int, lam: float) -> float:
    return math.exp(-lam) * (lam ** k) / math.factorial(k)


def p_total_over(line: float, lam_total: float, k_max: int = 12) -> float:
    k_min = int(math.floor(line) + 1)
    s = 0.0
    for k in range(k_min, k_max + 1):
        s += _poisson_pmf(k, lam_total)
    return max(0.0, min(1.0, s))


def build_model_payload_v0(
    *,
    lam_home: float,
    lam_away: float,
    totals_main_line: Optional[float],
) -> Dict[str, Any]:
    lam_total = lam_home + lam_away
    out: Dict[str, Any] = {
        "model_version": "model_v0",
        "inputs": {"lambda_home": lam_home, "lambda_away": lam_away, "lambda_total": lam_total},
        "markets": {
            "btts": {"p_model": {"yes": None, "no": None}},
            "totals": {"main_line": totals_main_line, "p_model": {"over": None, "under": None}},
        },
        "generated_at_utc": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    }

    p_yes = p_btts_yes(lam_home, lam_away)
    out["markets"]["btts"]["p_model"]["yes"] = round(p_yes, 6)
    out["markets"]["btts"]["p_model"]["no"] = round(1.0 - p_yes, 6)

    if totals_main_line is not None:
        p_over = p_total_over(float(totals_main_line), lam_total)
        out["markets"]["totals"]["p_model"]["over"] = round(p_over, 6)
        out["markets"]["totals"]["p_model"]["under"] = round(1.0 - p_over, 6)

    return out