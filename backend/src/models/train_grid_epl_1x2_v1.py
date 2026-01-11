from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from src.db.pg import pg_conn
from src.models.one_x_two_logreg_v1 import TrainConfig, train_and_save


@dataclass(frozen=True)
class GridItem:
    key: str
    train_seasons: list[int]
    artifact_filename: str


def _has_team_season_stats(*, league_id: int, season: int) -> bool:
    sql = """
    SELECT 1
    FROM core.team_season_stats
    WHERE league_id = %s AND season = %s
    LIMIT 1
    """
    with pg_conn() as conn:
        cur = conn.cursor()
        cur.execute(sql, (league_id, season))
        return cur.fetchone() is not None


def train_grid_epl(*, league_id: int = 39) -> dict[str, Any]:
    grid = [
        GridItem(key="A_2021_2022", train_seasons=[2021, 2022], artifact_filename="epl_1x2_logreg_v1_A_2021_2022.json"),
        GridItem(key="B_2022_2023", train_seasons=[2022, 2023], artifact_filename="epl_1x2_logreg_v1_B_2022_2023.json"),
        GridItem(key="C_2021_2023", train_seasons=[2021, 2022, 2023], artifact_filename="epl_1x2_logreg_v1_C_2021_2023.json"),
    ]

    # sanity: garante que existe stats para todas as seasons do grid
    for it in grid:
        for s in it.train_seasons:
            if not _has_team_season_stats(league_id=league_id, season=s):
                raise RuntimeError(f"missing team_season_stats: league_id={league_id} season={s}")

    out: dict[str, Any] = {"league_id": league_id, "trained": []}

    for it in grid:
        cfg = TrainConfig(league_id=league_id, train_seasons=it.train_seasons)
        payload = train_and_save(cfg=cfg, artifact_filename=it.artifact_filename)
        out["trained"].append(
            {
                "key": it.key,
                "artifact": it.artifact_filename,
                "train_seasons": it.train_seasons,
                "n_samples": payload["n_samples"],
                "trained_at_utc": payload["trained_at_utc"],
            }
        )

    return out


def main():
    result = train_grid_epl(league_id=39)
    print(result)


if __name__ == "__main__":
    main()
