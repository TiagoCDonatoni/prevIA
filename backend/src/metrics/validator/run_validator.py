from __future__ import annotations

from src.db.pg import pg_conn
from src.metrics.validator.load_dataset import load_dataset
from src.metrics.validator.baseline_model import train_baseline_model
from src.metrics.validator.metrics import brier_score, logloss


LEAGUE_ID = 39
LEAGUE_NAME = "Premier League"


def get_max_available_season(league_id: int) -> int:
    sql = """
    SELECT COALESCE(MAX(season), 0)
    FROM core.team_season_stats
    WHERE league_id = %s
    """
    with pg_conn() as conn:
        cur = conn.cursor()
        cur.execute(sql, (league_id,))
        return int(cur.fetchone()[0])


def get_recent_train_seasons(
    *,
    league_id: int,
    test_season: int,
    lookback: int,
) -> list[int]:
    """
    Retorna seasons de treino imediatamente anteriores ao test_season,
    filtrando as que não possuem fixtures finalizados (samples=0).
    """
    candidates = [s for s in range(max(test_season - lookback, 0), test_season) if s > 0]
    train = []
    for s in candidates:
        _, y = load_dataset(league_id=league_id, season=s, feature_version="features_v1", progress_every=999999)
        if len(y) > 0:
            train.append(s)
    return train


def run_one(
    *,
    feature_version: str,
    train_seasons: list[int],
    test_season: int,
) -> dict:
    print(f"\n[validator] league={LEAGUE_NAME} ({LEAGUE_ID}) feature={feature_version}")
    print(f"  train_seasons={train_seasons} test_season={test_season}")

    X_train, y_train = [], []
    for s in train_seasons:
        print(f"  loading train season {s}...")
        X, y = load_dataset(league_id=LEAGUE_ID, season=s, feature_version=feature_version)
        print(f"    loaded {len(y)} samples")
        X_train.extend(X)
        y_train.extend(y)

    print(f"  training model on {len(y_train)} samples...")
    model = train_baseline_model(X_train, y_train)

    print(f"  loading test season {test_season}...")
    X_test, y_test = load_dataset(league_id=LEAGUE_ID, season=test_season, feature_version=feature_version)
    print(f"    loaded {len(y_test)} samples")

    probs = model.predict_proba(X_test)

    metrics = {
        "brier": float(brier_score(y_test, probs)),
        "log_loss": float(logloss(y_test, probs)),
    }
    print(f"  done: {metrics}")

    return {
        "league_id": LEAGUE_ID,
        "league_name": LEAGUE_NAME,
        "feature_version": feature_version,
        "train_seasons": train_seasons,
        "test_season": test_season,
        "samples": len(y_test),
        "metrics": metrics,
    }


def run_compare(
    *,
    lookback: int = 3,
):
    test_season = get_max_available_season(LEAGUE_ID)
    if test_season == 0:
        raise RuntimeError("no team_season_stats available for EPL")

    # filtra train seasons com base em fixtures (usa features_v1 só para medir presença de amostra)
    train_seasons = get_recent_train_seasons(league_id=LEAGUE_ID, test_season=test_season, lookback=lookback)

    r1 = run_one(feature_version="features_v1", train_seasons=train_seasons, test_season=test_season)
    r2 = run_one(feature_version="features_weighted_exp_v1", train_seasons=train_seasons, test_season=test_season)

    # resumo comparativo
    print("\n=== SUMMARY (EPL) ===")
    print(f"test_season={test_season} train_seasons={train_seasons} samples={r1['samples']}")
    print(f"features_v1              brier={r1['metrics']['brier']:.6f} log_loss={r1['metrics']['log_loss']:.6f}")
    print(f"features_weighted_exp_v1 brier={r2['metrics']['brier']:.6f} log_loss={r2['metrics']['log_loss']:.6f}")

    winner_brier = "features_v1" if r1["metrics"]["brier"] <= r2["metrics"]["brier"] else "features_weighted_exp_v1"
    winner_ll = "features_v1" if r1["metrics"]["log_loss"] <= r2["metrics"]["log_loss"] else "features_weighted_exp_v1"
    print(f"winner_brier={winner_brier} winner_log_loss={winner_ll}")

    return {"features_v1": r1, "features_weighted_exp_v1": r2}


if __name__ == "__main__":
    print(run_compare(lookback=3))
