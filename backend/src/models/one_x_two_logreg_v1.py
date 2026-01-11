from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Literal

import numpy as np
from sklearn.linear_model import LogisticRegression

from src.db.pg import pg_conn
from src.metrics.features.match_features_v1 import build_match_features
from src.models.artifact_store import load_json_artifact, save_json_artifact


LeagueId = int
Season = int

Outcome = Literal["H", "D", "A"]  # Home/Draw/Away
OUTCOMES: list[Outcome] = ["H", "D", "A"]

FEATURES: list[str] = [
    "delta_ppg",
    "delta_gf_pg",
    "delta_ga_pg",
    "delta_gd_pg",
    "delta_home_adv",
]


from dataclasses import dataclass

from dataclasses import dataclass

@dataclass(frozen=True)
class TrainConfig:
    league_id: int
    train_seasons: list[int]

    # versioning
    model_version: str = "1x2_logreg_v1"
    feature_version: str = "features_v1"

    # regularization inverse strength (higher = less regularization)
    C: float = 1.0


def _label_from_goals(gh: int, ga: int) -> int:
    # 0=H, 1=D, 2=A
    if gh > ga:
        return 0
    if gh == ga:
        return 1
    return 2


def _load_fixtures_finished(*, league_id: int, season: int) -> list[tuple[int, int, int, int]]:
    sql = """
    SELECT home_team_id, away_team_id, goals_home, goals_away
    FROM core.fixtures
    WHERE league_id = %s
      AND season = %s
      AND is_finished = true
      AND COALESCE(is_cancelled, false) = false
    ORDER BY kickoff_utc
    """
    with pg_conn() as conn:
        cur = conn.cursor()
        cur.execute(sql, (league_id, season))
        return cur.fetchall()


def build_xy(*, league_id: int, season: int) -> tuple[np.ndarray, np.ndarray]:
    rows = _load_fixtures_finished(league_id=league_id, season=season)
    X: list[list[float]] = []
    y: list[int] = []

    for home_id, away_id, gh, ga in rows:
        feats = build_match_features(
            home_team_id=home_id,
            away_team_id=away_id,
            league_id=league_id,
            season=season,
        )
        X.append([float(feats[k]) for k in FEATURES])
        y.append(_label_from_goals(int(gh), int(ga)))

    return np.array(X, dtype=float), np.array(y, dtype=int)


def train_and_save(*, cfg: TrainConfig, artifact_filename: str) -> dict[str, Any]:
    X_all, y_all = [], []

    for s in cfg.train_seasons:
        X, y = build_xy(league_id=cfg.league_id, season=s)
        if len(y) == 0:
            continue
        X_all.append(X)
        y_all.append(y)

    if not y_all:
        raise RuntimeError("no training data found for given seasons")

    X_train = np.vstack(X_all)
    y_train = np.concatenate(y_all)

    model = LogisticRegression(
        solver="lbfgs",
        max_iter=2000,
        C=float(cfg.C),
    )
    model.fit(X_train, y_train)

    payload = {
        "model_version": cfg.model_version,
        "feature_version": cfg.feature_version,
        "league_id": cfg.league_id,
        "train_seasons": cfg.train_seasons,
        "feature_order": FEATURES,
        "classes": OUTCOMES,  # fixed mapping 0/1/2
        "coef": model.coef_.tolist(),  # shape (3, n_features)
        "intercept": model.intercept_.tolist(),  # shape (3,)
        "trained_at_utc": datetime.now(timezone.utc).isoformat(),
        "n_samples": int(len(y_train)),
    }

    save_json_artifact(filename=artifact_filename, payload=payload)
    return payload


def _softmax(logits: np.ndarray) -> np.ndarray:
    z = logits - np.max(logits)
    e = np.exp(z)
    return e / np.sum(e)


def predict_1x2_from_artifact(
    *,
    artifact_filename: str,
    league_id: int,
    season: int,
    home_team_id: int,
    away_team_id: int,
) -> dict[str, Any]:
    art = load_json_artifact(filename=artifact_filename)

    if int(art["league_id"]) != int(league_id):
        raise ValueError("artifact league_id does not match request league_id")

    feats = build_match_features(
        home_team_id=home_team_id,
        away_team_id=away_team_id,
        league_id=league_id,
        season=season,
    )

    x = np.array([float(feats[k]) for k in art["feature_order"]], dtype=float)  # (n_features,)
    coef = np.array(art["coef"], dtype=float)  # (3, n_features)
    intercept = np.array(art["intercept"], dtype=float)  # (3,)

    logits = intercept + coef @ x  # (3,)
    probs = _softmax(logits)

    # debug: top contributions per class
    contrib = coef * x  # (3, n_features)
    debug = {}
    for i, cls in enumerate(art["classes"]):
        pairs = list(zip(art["feature_order"], contrib[i].tolist()))
        pairs.sort(key=lambda t: abs(t[1]), reverse=True)
        debug[cls] = {
            "logit": float(logits[i]),
            "top_contrib": pairs[:3],
        }

    return {
        "model_version": art["model_version"],
        "feature_version": art["feature_version"],
        "league_id": league_id,
        "season": season,
        "home_team_id": home_team_id,
        "away_team_id": away_team_id,
        "probs": {
            "H": float(probs[0]),
            "D": float(probs[1]),
            "A": float(probs[2]),
        },
        "features": {k: float(feats[k]) for k in art["feature_order"]},
        "debug": debug,
        "artifact": {
            "train_seasons": art["train_seasons"],
            "n_samples": art["n_samples"],
            "trained_at_utc": art["trained_at_utc"],
        },
    }
