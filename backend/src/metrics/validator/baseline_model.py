from __future__ import annotations

from sklearn.linear_model import LogisticRegression


def train_baseline_model(X, y):
    model = LogisticRegression(
        solver="lbfgs",
        max_iter=1000,
    )
    model.fit(X, y)
    return model
