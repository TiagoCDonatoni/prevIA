from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from src.models.artifact_store import load_json_artifact
from src.models.one_x_two_logreg_v1 import _softmax
from src.models.validator.load_dataset_1x2 import load_dataset_1x2
from src.models.validator.metrics_1x2 import brier_score_1x2, logloss_1x2


@dataclass(frozen=True)
class ArtifactCase:
    key: str
    artifact_filename: str


def _predict_proba_from_artifact(art: dict[str, Any], x: list[float]) -> list[float]:
    import numpy as np

    coef = np.array(art["coef"], dtype=float)
    intercept = np.array(art["intercept"], dtype=float)
    xv = np.array(x, dtype=float)

    logits = intercept + coef @ xv
    probs = _softmax(logits)
    return [float(probs[0]), float(probs[1]), float(probs[2])]


def compare_artifacts_on_holdout(
    *,
    league_id: int = 39,
    holdout_season: int = 2024,
    cases: list[ArtifactCase] | None = None,
) -> dict[str, Any]:
    if cases is None:
        cases = [
            ArtifactCase(key="A_2021_2022", artifact_filename="epl_1x2_logreg_v1_A_2021_2022.json"),
            ArtifactCase(key="B_2022_2023", artifact_filename="epl_1x2_logreg_v1_B_2022_2023.json"),
            ArtifactCase(key="C_2021_2023", artifact_filename="epl_1x2_logreg_v1_C_2021_2023.json"),
        ]

    print(f"\n[compare] league_id={league_id} holdout_season={holdout_season}")
    X, y = load_dataset_1x2(league_id=league_id, season=holdout_season, progress_every=100)
    if not y:
        raise RuntimeError("no samples found for holdout season")

    rows = []
    for case in cases:
        art = load_json_artifact(filename=case.artifact_filename)
        if int(art["league_id"]) != int(league_id):
            raise ValueError(f"artifact league mismatch: {case.artifact_filename}")

        probs = [_predict_proba_from_artifact(art, x) for x in X]
        brier = float(brier_score_1x2(y, probs))
        ll = float(logloss_1x2(y, probs))

        row = {
            "key": case.key,
            "artifact": case.artifact_filename,
            "train_seasons": art.get("train_seasons"),
            "samples": len(y),
            "brier": brier,
            "log_loss": ll,
        }
        print(f"  done: {row}")
        rows.append(row)

    # Ranking: menor log_loss, depois menor brier
    ranked = sorted(rows, key=lambda r: (r["log_loss"], r["brier"]))

    print("\n=== RANKING (lower is better) ===")
    for i, r in enumerate(ranked, start=1):
        print(f"{i}. {r['key']}  log_loss={r['log_loss']:.6f}  brier={r['brier']:.6f}  train={r['train_seasons']}  artifact={r['artifact']}")

    winner = ranked[0]["key"]

    out = {
        "league_id": league_id,
        "holdout_season": holdout_season,
        "cases": rows,
        "ranking": [r["key"] for r in ranked],
        "winner": winner,
    }
    print("\n=== SUMMARY ===")
    print(out)
    return out


def main():
    compare_artifacts_on_holdout(league_id=39, holdout_season=2024)


if __name__ == "__main__":
    main()
