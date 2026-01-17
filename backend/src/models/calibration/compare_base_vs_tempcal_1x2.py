from __future__ import annotations

from typing import Any

import numpy as np

from src.models.artifact_store import load_json_artifact
from src.models.one_x_two_logreg_v1 import _softmax
from src.models.validator.load_dataset_1x2 import load_dataset_1x2
from src.models.validator.metrics_1x2 import brier_score_1x2, logloss_1x2


def _logits(art: dict[str, Any], x: list[float]) -> np.ndarray:
    coef = np.array(art["coef"], dtype=float)
    intercept = np.array(art["intercept"], dtype=float)
    xv = np.array(x, dtype=float)
    return intercept + coef @ xv


def _probs_softmax(logits: np.ndarray) -> list[float]:
    p = _softmax(logits)
    return [float(p[0]), float(p[1]), float(p[2])]


def _probs_temp(logits: np.ndarray, T: float) -> list[float]:
    p = _softmax(logits / float(T))
    return [float(p[0]), float(p[1]), float(p[2])]


def compare_base_vs_tempcal(
    *,
    league_id: int = 39,
    holdout_season: int = 2024,
    base_artifact: str = "epl_1x2_logreg_v1_C_2021_2023_C0.3.json",
    cal_artifact: str = "epl_1x2_logreg_tempcal_v1_C_2021_2023_C0.3_cal2023.json",
) -> dict[str, Any]:
    print(f"\n[tempcal-compare] league_id={league_id} holdout_season={holdout_season}")
    X, y = load_dataset_1x2(league_id=league_id, season=holdout_season, progress_every=100)
    if not y:
        raise RuntimeError("no samples for holdout season")

    base = load_json_artifact(filename=base_artifact)
    cal = load_json_artifact(filename=cal_artifact)

    T = float(cal["calibration"]["T"])

    probs_base = []
    probs_cal = []
    for x in X:
        z_base = _logits(base, x)
        probs_base.append(_probs_softmax(z_base))
        probs_cal.append(_probs_temp(z_base, T))

    out = {
        "league_id": league_id,
        "holdout_season": holdout_season,
        "samples": len(y),
        "base": {
            "artifact": base_artifact,
            "brier": float(brier_score_1x2(y, probs_base)),
            "log_loss": float(logloss_1x2(y, probs_base)),
        },
        "calibrated": {
            "artifact": cal_artifact,
            "T": T,
            "brier": float(brier_score_1x2(y, probs_cal)),
            "log_loss": float(logloss_1x2(y, probs_cal)),
        },
    }

    print("\n=== RESULTS ===")
    print(out)

    d_ll = out["calibrated"]["log_loss"] - out["base"]["log_loss"]
    d_b = out["calibrated"]["brier"] - out["base"]["brier"]
    print("\n=== DELTAS (cal - base; lower is better) ===")
    print({"delta_log_loss": d_ll, "delta_brier": d_b})

    return out


def main():
    compare_base_vs_tempcal()


if __name__ == "__main__":
    main()
