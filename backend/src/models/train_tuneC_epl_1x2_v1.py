from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from src.db.pg import pg_conn
from src.models.one_x_two_logreg_v1 import TrainConfig, train_and_save


@dataclass(frozen=True)
class Case:
    C: float
    artifact: str


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


def train_tuneC_epl(
    *,
    league_id: int = 39,
    train_seasons: list[int] = [2021, 2022, 2023],
    Cs: list[float] = [0.1, 0.3, 1.0, 3.0, 10.0],
) -> dict[str, Any]:
    for s in train_seasons:
        if not _has_team_season_stats(league_id=league_id, season=s):
            raise RuntimeError(f"missing team_season_stats: league_id={league_id} season={s}")

    cases = [
        Case(C=c, artifact=f"epl_1x2_logreg_v1_C_2021_2023_C{c}.json")
        for c in Cs
    ]

    out: dict[str, Any] = {"league_id": league_id, "train_seasons": train_seasons, "trained": []}

    for case in cases:
        cfg = TrainConfig(league_id=league_id, train_seasons=train_seasons, C=float(case.C))
        payload = train_and_save(cfg=cfg, artifact_filename=case.artifact)
        out["trained"].append(
            {
                "C": case.C,
                "artifact": case.artifact,
                "n_samples": payload["n_samples"],
                "trained_at_utc": payload["trained_at_utc"],
            }
        )

    return out


def main():
    result = train_tuneC_epl()
    print(result)


if __name__ == "__main__":
    main()
