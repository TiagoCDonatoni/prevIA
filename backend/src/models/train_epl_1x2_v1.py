from __future__ import annotations

from src.db.pg import pg_conn
from src.models.one_x_two_logreg_v1 import TrainConfig, train_and_save


def _get_max_available_season(league_id: int) -> int:
    sql = "SELECT COALESCE(MAX(season), 0) FROM core.team_season_stats WHERE league_id = %s"
    with pg_conn() as conn:
        cur = conn.cursor()
        cur.execute(sql, (league_id,))
        return int(cur.fetchone()[0])


def main():
    league_id = 39
    max_season = _get_max_available_season(league_id)

    if max_season == 0:
        raise RuntimeError("no team_season_stats available for EPL")

    # Treina em todas as seasons disponíveis EXCETO a última (holdout natural)
    train_seasons = [s for s in range(max_season - 2, max_season) if s > 0]  # v1 simples: últimas 2 antes do max
    artifact_filename = "epl_1x2_logreg_v1.json"

    cfg = TrainConfig(league_id=league_id, train_seasons=train_seasons)
    payload = train_and_save(cfg=cfg, artifact_filename=artifact_filename)

    print(
        {
            "artifact": artifact_filename,
            "league_id": league_id,
            "train_seasons": train_seasons,
            "n_samples": payload["n_samples"],
            "trained_at_utc": payload["trained_at_utc"],
        }
    )


if __name__ == "__main__":
    main()
