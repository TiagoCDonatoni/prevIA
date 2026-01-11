from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

from src.models.artifact_store import load_json_artifact
from src.models.one_x_two_logreg_v1 import _softmax
from src.models.validator.load_dataset_1x2 import load_dataset_1x2
from src.models.validator.metrics_1x2 import brier_score_1x2, logloss_1x2


@dataclass(frozen=True)
class ArtifactCase:
    artifact_filename: str


def _extract_C(name: str) -> float | None:
    m = re.search(r"_C([0-9.]+)\.json$", name)
    if not m:
        return None
    return float(m.group(1))


def _predict_proba_from_artifact(art: dict[str, Any], x: list[float]) -> list[float]:
    import numpy as np

    coef = np.array(art["coef"], dtype=float)
    intercept = np.array(art["intercept"], dtype=float)
    xv = np.array(x, dtype=float)

    logits = intercept + coef @ xv
    probs = _softmax(logits)
    return [float(probs[0]), float(probs[1]), float(probs[2])]


def compare_tuneC_on_holdout(
    *,
    league_id: int = 39,
    holdout_season: int = 2024,
    artifacts: list[str] | None = None,
) -> dict[str, Any]:
    if artifacts is None:
        artifacts = [
            "epl_1x2_logreg_v1_C_2021_2023_C0.1.json",
            "epl_1x2_logreg_v1_C_2021_2023_C0.3.json",
            "epl_1x2_logreg_v1_C_2021_2023_C1.0.json",
            "epl_1x2_logreg_v1_C_2021_2023_C3.0.json",
            "epl_1x2_logreg_v1_C_2021_2023_C10.0.json",
        ]

    print(f"\n[tuneC-compare] league_id={league_id} holdout_season={holdout_season}")
    X, y = load_dataset_1x2(league_id=league_id, season=holdout_season, progress_every=100)
    if not y:
        raise RuntimeError("no samples found for holdout season")

    rows = []
    for filename in artifacts:
        art = load_json_artifact(filename=filename)
        if int(art["league_id"]) != int(league_id):
            raise ValueError(f"artifact league mismatch: {filename}")

        probs = [_predict_proba_from_artifact(art, x) for x in X]
        brier = float(brier_score_1x2(y, probs))
        ll = float(logloss_1x2(y, probs))

        row = {
            "C": _extract_C(filename),
            "artifact": filename,
            "train_seasons": art.get("train_seasons"),
            "samples": len(y),
            "brier": brier,
            "log_loss": ll,
        }
        print(f"  done: {row}")
        rows.append(row)

    ranked = sorted(rows, key=lambda r: (r["log_loss"], r["brier"]))

    print("\n=== RANKING (lower is better) ===")
    for i, r in enumerate(ranked, start=1):
        print(f"{i}. C={r['C']}  log_loss={r['log_loss']:.6f}  brier={r['brier']:.6f}  artifact={r['artifact']}")

    winner = ranked[0]
    out = {
        "league_id": league_id,
        "holdout_season": holdout_season,
        "cases": rows,
        "ranking": [{"C": r["C"], "artifact": r["artifact"]} for r in ranked],
        "winner": winner,
    }
    print("\n=== SUMMARY ===")
    print(out)
    return out


def main():
    compare_tuneC_on_holdout()


if __name__ == "__main__":
    main()
