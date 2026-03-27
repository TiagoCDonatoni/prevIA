from __future__ import annotations

"""prevIA Score Engine v1.0

Núcleo probabilístico baseado em matriz de placares (Poisson independente).

Decisões v1:
  - Poisson independente (home e away independentes)
  - max_goals default=6 (matriz 7x7, 0..6)
  - overflow bin: toda a probabilidade acima de max_goals é acumulada no bin max_goals
    (na marginal), garantindo soma total == 1.0.

A estrutura já permite adicionar correlação (rho) no futuro.
"""

import math
from dataclasses import dataclass
from typing import Dict, Iterable, Mapping, Tuple

ScoreKey = Tuple[int, int]  # (home_goals, away_goals)


@dataclass(frozen=True)
class ScoreMatrixResult:
    lam_home: float
    lam_away: float
    max_goals: int

    # Representação JSON-friendly: "i-j" -> prob
    matrix: Dict[str, float]

    # Derivados comuns (conveniência)
    prob_home_win: float
    prob_draw: float
    prob_away_win: float
    prob_btts_yes: float


def _poisson_pmf(k: int, lam: float) -> float:
    return math.exp(-lam) * (lam**k) / math.factorial(k)


def _poisson_probs_with_overflow(lam: float, max_goals: int) -> Dict[int, float]:
    """Distribuição discreta 0..max_goals, acumulando a cauda no bin max_goals."""
    if max_goals < 0:
        raise ValueError("max_goals must be >= 0")
    if lam < 0:
        raise ValueError("lambda must be >= 0")

    if max_goals == 0:
        return {0: 1.0}

    out: Dict[int, float] = {}
    s = 0.0
    for k in range(0, max_goals):
        p = _poisson_pmf(k, lam)
        out[k] = p
        s += p

    # Toda a massa residual vai pro bin max_goals
    out[max_goals] = max(0.0, 1.0 - s)
    return out


def _matrix_sum(matrix_tuple: Mapping[ScoreKey, float]) -> float:
    return float(sum(matrix_tuple.values()))


def generate_score_matrix_v1(
    lam_home: float,
    lam_away: float,
    max_goals: int = 6,
) -> ScoreMatrixResult:
    """Gera matriz de placares (0..max_goals) com Poisson independente.

    Retorna também probabilidades derivadas básicas (1x2 e BTTS).
    """

    if not isinstance(lam_home, (int, float)) or not isinstance(lam_away, (int, float)):
        raise TypeError("lam_home and lam_away must be numbers")

    lam_home_f = float(lam_home)
    lam_away_f = float(lam_away)

    if lam_home_f < 0 or lam_away_f < 0:
        raise ValueError("lam_home and lam_away must be >= 0")
    if int(max_goals) < 0:
        raise ValueError("max_goals must be >= 0")

    max_g = int(max_goals)
    ph = _poisson_probs_with_overflow(lam_home_f, max_g)
    pa = _poisson_probs_with_overflow(lam_away_f, max_g)

    matrix_tuple: Dict[ScoreKey, float] = {}
    for i, pi in ph.items():
        for j, pj in pa.items():
            matrix_tuple[(i, j)] = pi * pj

    # Soma deve ser ~1 (overflow bin garante isso). Renormaliza defensivamente.
    s = _matrix_sum(matrix_tuple)
    if not (0.999999 <= s <= 1.000001):
        for k in list(matrix_tuple.keys()):
            matrix_tuple[k] = matrix_tuple[k] / s

    p_home = 0.0
    p_draw = 0.0
    p_away = 0.0
    p_btts_yes = 0.0

    for (i, j), p in matrix_tuple.items():
        if i > j:
            p_home += p
        elif i == j:
            p_draw += p
        else:
            p_away += p

        if i >= 1 and j >= 1:
            p_btts_yes += p

    matrix_json: Dict[str, float] = {f"{i}-{j}": float(p) for (i, j), p in matrix_tuple.items()}

    return ScoreMatrixResult(
        lam_home=lam_home_f,
        lam_away=lam_away_f,
        max_goals=max_g,
        matrix=matrix_json,
        prob_home_win=float(p_home),
        prob_draw=float(p_draw),
        prob_away_win=float(p_away),
        prob_btts_yes=float(p_btts_yes),
    )


def _iter_matrix_items(matrix: Mapping[str, float]) -> Iterable[Tuple[int, int, float]]:
    for k, p in matrix.items():
        i_s, j_s = k.split("-", 1)
        yield int(i_s), int(j_s), float(p)


def derive_1x2(matrix: Mapping[str, float]) -> Dict[str, float]:
    """Deriva 1x2 (home/draw/away) somando regiões da matriz."""
    p_home = 0.0
    p_draw = 0.0
    p_away = 0.0
    for i, j, p in _iter_matrix_items(matrix):
        if i > j:
            p_home += p
        elif i == j:
            p_draw += p
        else:
            p_away += p
    return {"home": float(p_home), "draw": float(p_draw), "away": float(p_away)}


def derive_btts(matrix: Mapping[str, float]) -> Dict[str, float]:
    """Deriva BTTS (yes/no) somando regiões da matriz."""
    p_yes = 0.0
    for i, j, p in _iter_matrix_items(matrix):
        if i >= 1 and j >= 1:
            p_yes += p
    return {"yes": float(p_yes), "no": float(1.0 - p_yes)}


def derive_totals(matrix: Mapping[str, float], line: float) -> Dict[str, float]:
    """Deriva totals (over/under/push) para uma linha.

    Over: total_goals > line
    Under: total_goals < line
    Push: total_goals == line (relevante só para linhas inteiras)

    Observação: a UI atual pode ignorar push; mas mantemos no payload para futuro.
    """
    line_f = float(line)
    p_over = 0.0
    p_under = 0.0
    p_push = 0.0

    # push só faz sentido em linha inteira
    is_integer = abs(line_f - round(line_f)) < 1e-9
    L_int = int(round(line_f))

    for i, j, p in _iter_matrix_items(matrix):
        t = i + j
        if t > line_f:
            p_over += p
        elif t < line_f:
            p_under += p
        else:
            if is_integer and t == L_int:
                p_push += p
            else:
                # linhas não-inteiras não deveriam ter igualdade
                p_push += p

    return {"over": float(p_over), "under": float(p_under), "push": float(p_push)}


def derive_team_totals(matrix: Mapping[str, float], team: str, line: float) -> Dict[str, float]:
    """Deriva team totals.

    team: "home" | "away"
    """
    t = str(team).lower().strip()
    if t not in ("home", "away"):
        raise ValueError("team must be 'home' or 'away'")

    line_f = float(line)
    p_over = 0.0
    p_under = 0.0
    p_push = 0.0

    is_integer = abs(line_f - round(line_f)) < 1e-9
    L_int = int(round(line_f))

    for i, j, p in _iter_matrix_items(matrix):
        g = i if t == "home" else j
        if g > line_f:
            p_over += p
        elif g < line_f:
            p_under += p
        else:
            if is_integer and g == L_int:
                p_push += p
            else:
                p_push += p

    return {"over": float(p_over), "under": float(p_under), "push": float(p_push)}


def derive_exact_score(matrix: Mapping[str, float]) -> Dict[str, float]:
    """Retorna o mapa de placares exatamente como está ("i-j" -> prob)."""
    return dict(matrix)
