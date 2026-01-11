from __future__ import annotations

import math
from typing import Sequence


def brier_score_1x2(y_true: Sequence[int], p: Sequence[Sequence[float]]) -> float:
    """
    Multi-class Brier score: mean(sum_k (p_k - y_k)^2)
    """
    n = len(y_true)
    if n == 0:
        return float("nan")

    s = 0.0
    for yt, probs in zip(y_true, p):
        for k in range(3):
            yk = 1.0 if k == yt else 0.0
            s += (float(probs[k]) - yk) ** 2
    return s / n


def logloss_1x2(y_true: Sequence[int], p: Sequence[Sequence[float]]) -> float:
    n = len(y_true)
    if n == 0:
        return float("nan")

    eps = 1e-15
    s = 0.0
    for yt, probs in zip(y_true, p):
        pk = max(eps, min(1.0 - eps, float(probs[yt])))
        s += -math.log(pk)
    return s / n
