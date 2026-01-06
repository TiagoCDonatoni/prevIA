from __future__ import annotations

import numpy as np
from sklearn.metrics import log_loss


def brier_score(y_true, y_prob):
    """
    y_true: list[int] in {0,1,2}
    y_prob: list[list[float]] shape (n, 3)
    """
    y_true_oh = np.zeros_like(y_prob)
    for i, y in enumerate(y_true):
        y_true_oh[i, y] = 1.0
    return ((y_prob - y_true_oh) ** 2).sum(axis=1).mean()


def logloss(y_true, y_prob):
    return log_loss(y_true, y_prob)
