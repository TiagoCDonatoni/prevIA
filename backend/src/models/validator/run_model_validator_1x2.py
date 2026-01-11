from __future__ import annotations

from src.db.pg import pg_conn
from src.models.artifact_store import load_json_artifact
from src.models.one_x_two_logreg_v1 import _softmax  # reuse internal softmax
from src.models.validator.load_dataset_1x2 import load_dataset_1x2
from src.models.validator.metrics_1x2 import brier_score_1x2, logloss_1x2


def _get_available_seasons(league_id: int) -> list[int]:
    sql = """
    SELECT DISTINCT season
    FROM core.team_season_stats
    WHERE league_id = %s
    ORDER BY season
    """
    with pg_conn() as conn:
        cur = conn.cursor()
        cur.execute(sql, (league_id,))
        return [int(r[0]) for r in cur.fetchall()]


def _predict_proba_from_artifact(art: dict, x: list[float]) -> list[float]:
    # x already ordered per artifact feature_order
    import numpy as np

    coef = np.array(art["coef"], dtype=float)
    intercept = np.array(art["intercept"], dtype=float)
    xv = np.array(x, dtype=float)

    logits = intercept + coef @ xv
    probs = _softmax(logits)
    return [float(probs[0]), float(probs[1]), float(probs[2])]


def run_model_validator(
    *,
    artifact_filename: str = "epl_1x2_logreg_v1.json",
    league_id: int = 39,
    test_seasons: list[int] | None = None,
):
    art = load_json_artifact(filename=artifact_filename)

    if int(art["league_id"]) != int(league_id):
        raise ValueError("artifact league_id does not match league_id")

    available = _get_available_seasons(league_id)
    if not available:
        raise RuntimeError("no team_season_stats seasons available")

    # default: valida apenas a season mais recente disponível (holdout natural)
    if test_seasons is None:
        test_seasons = [max(available)]

    summary = []
    for season in test_seasons:
        print(f"\n[model-validator] league_id={league_id} season={season} artifact={artifact_filename}")

        X, y = load_dataset_1x2(league_id=league_id, season=season, progress_every=100)
        if not y:
            print("  no samples, skipping")
            continue

        # artifact feature order must match loader FEATURES order (we use same list)
        probs = [_predict_proba_from_artifact(art, x) for x in X]

        brier = float(brier_score_1x2(y, probs))
        ll = float(logloss_1x2(y, probs))

        row = {
            "season": season,
            "samples": len(y),
            "brier": brier,
            "log_loss": ll,
        }
        print(f"  done: {row}")
        summary.append(row)

    print("\n=== MODEL VALIDATOR SUMMARY ===")
    print(
        {
            "league_id": league_id,
            "artifact": artifact_filename,
            "train_seasons": art.get("train_seasons"),
            "tested": summary,
        }
    )
    return summary


if __name__ == "__main__":
    run_model_validator()
