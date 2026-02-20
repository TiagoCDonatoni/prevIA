from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, Optional, Tuple


@dataclass
class Lambdas:
    lam_home: float
    lam_away: float

    @property
    def lam_total(self) -> float:
        return self.lam_home + self.lam_away


def _safe_div(n: float, d: float, default: float = 0.0) -> float:
    return (n / d) if d and d != 0 else default


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
    MVP: usa core.team_season_stats (home/away goals_for/goals_against) para estimar λ_home e λ_away.
    Retorna None se não houver stats suficientes.
    """
    sql_league = """
      SELECT
        SUM(home_goals_for)::float AS sum_hgf,
        SUM(home_played)::float    AS sum_hp,
        SUM(away_goals_for)::float AS sum_agf,
        SUM(away_played)::float    AS sum_ap
      FROM core.team_season_stats
      WHERE league_id=%(league_id)s AND season=%(season)s
    """

    sql_team = """
      SELECT
        home_goals_for::float, home_goals_against::float, home_played::float,
        away_goals_for::float, away_goals_against::float, away_played::float
      FROM core.team_season_stats
      WHERE league_id=%(league_id)s AND season=%(season)s AND team_id=%(team_id)s
    """

    with conn.cursor() as cur:
        cur.execute(sql_league, {"league_id": league_id, "season": season})
        rowL = cur.fetchone()
        if not rowL or not rowL[1] or not rowL[3]:
            return None

        sum_hgf, sum_hp, sum_agf, sum_ap = rowL
        mu_home = _safe_div(sum_hgf, sum_hp, default=1.35)
        mu_away = _safe_div(sum_agf, sum_ap, default=1.10)

        cur.execute(sql_team, {"league_id": league_id, "season": season, "team_id": home_team_id})
        h = cur.fetchone()
        cur.execute(sql_team, {"league_id": league_id, "season": season, "team_id": away_team_id})
        a = cur.fetchone()

        if not h or not a:
            return None

        h_hgf, h_hga, h_hp, h_agf, h_aga, h_ap = h
        a_hgf, a_hga, a_hp, a_agf, a_aga, a_ap = a

        if not h_hp or not h_ap or not a_hp or not a_ap:
            return None

        # forças (ratio vs média da liga)
        atk_home = _safe_div(_safe_div(h_hgf, h_hp, 0.0), mu_home, 1.0)
        def_home = _safe_div(_safe_div(h_hga, h_hp, 0.0), mu_away, 1.0)  # concede em casa vs média de gols fora
        atk_away = _safe_div(_safe_div(a_agf, a_ap, 0.0), mu_away, 1.0)
        def_away = _safe_div(_safe_div(a_aga, a_ap, 0.0), mu_home, 1.0)  # concede fora vs média de gols casa

        lam_home = mu_home * atk_home * def_away
        lam_away = mu_away * atk_away * def_home

        lam_home = min(max(lam_home, clamp_min), clamp_max)
        lam_away = min(max(lam_away, clamp_min), clamp_max)

        return Lambdas(lam_home=lam_home, lam_away=lam_away)


def p_btts_yes(lam_home: float, lam_away: float) -> float:
    """
    P(home>=1)*P(away>=1), usando Poisson(λ) e independência (MVP).
    """
    return (1.0 - math.exp(-lam_home)) * (1.0 - math.exp(-lam_away))


def _poisson_pmf(k: int, lam: float) -> float:
    return math.exp(-lam) * (lam ** k) / math.factorial(k)


def p_total_over(line: float, lam_total: float, k_max: int = 12) -> float:
    """
    P(total_goals > line) para gols inteiros.
    MVP: ignora "push" de linhas inteiras (ex.: 3.0).
    """
    k_min = int(math.floor(line) + 1)  # > line => pelo menos floor(line)+1
    # soma cauda
    s = 0.0
    for k in range(k_min, k_max + 1):
        s += _poisson_pmf(k, lam_total)
    # massa residual acima de k_max é pequena; ok para MVP
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
    Fallback MVP: usa últimos N jogos (na mesma liga+season) para estimar λ_home e λ_away.
    Retorna None se não houver histórico suficiente.
    """

    sql_last = """
      WITH last_home AS (
        SELECT
          f.kickoff_utc,
          CASE WHEN f.home_team_id=%(team_id)s THEN f.goals_home ELSE f.goals_away END AS goals_for,
          CASE WHEN f.home_team_id=%(team_id)s THEN f.goals_away ELSE f.goals_home END AS goals_against,
          CASE WHEN f.home_team_id=%(team_id)s THEN 1 ELSE 0 END AS was_home
        FROM core.fixtures f
        WHERE f.league_id=%(league_id)s
          AND f.season=%(season)s
          AND (f.home_team_id=%(team_id)s OR f.away_team_id=%(team_id)s)
          AND f.goals_home IS NOT NULL AND f.goals_away IS NOT NULL
        ORDER BY f.kickoff_utc DESC
        LIMIT %(n)s
      )
      SELECT
        AVG(goals_for)::float AS gf_avg,
        AVG(goals_against)::float AS ga_avg,
        COUNT(*)::int AS cnt
      FROM last_home;
    """

    def _team_avgs(team_id: int):
        with conn.cursor() as cur:
            cur.execute(
                sql_last,
                {"league_id": league_id, "season": season, "team_id": team_id, "n": int(n_games)},
            )
            r = cur.fetchone()
        if not r or not r[2] or r[2] < max(4, n_games // 2):
            return None
        return {"gf": float(r[0]), "ga": float(r[1]), "cnt": int(r[2])}

    h = _team_avgs(home_team_id)
    a = _team_avgs(away_team_id)
    if not h or not a:
        return None

    # λ simples: ataque do time + “fraqueza” defensiva do adversário (média)
    lam_home = 0.5 * h["gf"] + 0.5 * a["ga"]
    lam_away = 0.5 * a["gf"] + 0.5 * h["ga"]

    lam_home = min(max(lam_home, clamp_min), clamp_max)
    lam_away = min(max(lam_away, clamp_min), clamp_max)

    return Lambdas(lam_home=lam_home, lam_away=lam_away)