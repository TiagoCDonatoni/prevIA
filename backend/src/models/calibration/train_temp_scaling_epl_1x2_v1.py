from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

import numpy as np

from src.models.artifact_store import load_json_artifact, save_json_artifact
from src.models.one_x_two_logreg_v1 import _softmax
from src.models.validator.load_dataset_1x2 import load_dataset_1x2
from src.models.validator.metrics_1x2 import logloss_1x2


def _logits_from_artifact(art: dict[str, Any], x: list[float]) -> np.ndarray:
    coef = np.array(art["coef"], dtype=float)        # shape (3, n_features)
    intercept = np.array(art["intercept"], dtype=float)  # shape (3,)
    xv = np.array(x, dtype=float)                    # shape (n_features,)
    return intercept + coef @ xv                     # shape (3,)


def _predict_probs_with_T(logits: np.ndarray, T: float) -> list[float]:
    # temperature scaling: softmax(logits / T)
    z = logits / float(T)
    p = _softmax(z)
    return [float(p[0]), float(p[1]), float(p[2])]


def _logloss_for_T(logits_list: list[np.ndarray], y: list[int], T: float) -> float:
    probs = [_predict_probs_with_T(z, T) for z in logits_list]
    return float(logloss_1x2(y, probs))


def _grid_search_T(logits_list: list[np.ndarray], y: list[int]) -> dict[str, Any]:
    # search log(T) in [-2, 2] => T in [~0.135, ~7.389]
    # dense grid: stable and deterministic
    logTs = np.linspace(-2.0, 2.0, 401)
    best = {"T": None, "log_loss": float("inf")}

    for logT in logTs:
        T = float(math.exp(float(logT)))
        ll = _logloss_for_T(logits_list, y, T)
        if ll < best["log_loss"]:
            best = {"T": T, "log_loss": ll}

    return best


def train_temperature_scaling(
    *,
    base_artifact_filename: str,
    out_artifact_filename: str,
    league_id: int = 39,
    calibration_season: int = 2023,
    progress_every: int = 100,
) -> dict[str, Any]:
    base = load_json_artifact(filename=base_artifact_filename)

    X_cal, y_cal = load_dataset_1x2(
        league_id=league_id,
        season=calibration_season,
        progress_every=progress_every,
    )
    if not y_cal:
        raise RuntimeError("no samples for calibration season")

    logits_list = [_logits_from_artifact(base, x) for x in X_cal]

    # baseline (T=1)
    ll_base = _logloss_for_T(logits_list, y_cal, T=1.0)

    # learn T
    best = _grid_search_T(logits_list, y_cal)
    T_star = float(best["T"])
    ll_cal = float(best["log_loss"])

    trained_at = datetime.now(timezone.utc).isoformat()

    # Save a self-contained calibrated artifact: keep same weights + add temperature
    cal_art = dict(base)
    cal_art["model_version"] = "1x2_logreg_tempcal_v1"
    cal_art["calibration"] = {
        "type": "temperature",
        "T": T_star,
        "calibration_season": calibration_season,
        "log_loss_base_T1": ll_base,
        "log_loss_calibrated": ll_cal,
        "trained_at_utc": trained_at,
        "base_artifact": base_artifact_filename,
    }

    save_json_artifact(filename=out_artifact_filename, payload=cal_art)

    out = {
        "league_id": league_id,
        "calibration_season": calibration_season,
        "base_artifact": base_artifact_filename,
        "out_artifact": out_artifact_filename,
        "T": T_star,
        "log_loss_base_T1": ll_base,
        "log_loss_calibrated": ll_cal,
        "trained_at_utc": trained_at,
    }
    print(out)
    return out


def main():
    # use winner from 3.2.2
    train_temperature_scaling(
        base_artifact_filename="epl_1x2_logreg_v1_C_2021_2023_C0.3.json",
        out_artifact_filename="epl_1x2_logreg_tempcal_v1_C_2021_2023_C0.3_cal2023.json",
        league_id=39,
        calibration_season=2023,
        progress_every=100,
    )


if __name__ == "__main__":
    main()
