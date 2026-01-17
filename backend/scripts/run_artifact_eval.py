from __future__ import annotations

import argparse
import json
import math
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

from src.db.pg import pg_conn


# -----------------------------
# Metrics
# -----------------------------
def _clip(p: float, eps: float = 1e-15) -> float:
    return min(1.0 - eps, max(eps, p))


def brier_1x2(p_h: float, p_d: float, p_a: float, y: str) -> float:
    # one-hot target
    oh = {"H": (1.0, 0.0, 0.0), "D": (0.0, 1.0, 0.0), "A": (0.0, 0.0, 1.0)}[y]
    return (p_h - oh[0]) ** 2 + (p_d - oh[1]) ** 2 + (p_a - oh[2]) ** 2


def logloss_1x2(p_h: float, p_d: float, p_a: float, y: str) -> float:
    p = {"H": p_h, "D": p_d, "A": p_a}[y]
    return -math.log(_clip(p))


def top1_acc(p_h: float, p_d: float, p_a: float, y: str) -> float:
    pred = max([("H", p_h), ("D", p_d), ("A", p_a)], key=lambda t: t[1])[0]
    return 1.0 if pred == y else 0.0


# -----------------------------
# Minimal artifact interface
# -----------------------------
@dataclass
class Artifact:
    artifact_id: str
    payload: Dict[str, Any]


def load_artifact(path: Path) -> Artifact:
    payload = json.loads(path.read_text(encoding="utf-8"))
    artifact_id = payload.get("artifact_id") or path.name
    return Artifact(artifact_id=artifact_id, payload=payload)


def predict_probs_1x2_from_artifact(artifact: Artifact, row: Dict[str, Any]) -> Dict[str, float]:
    """
    Wires to your existing predictor:
      src.models.one_x_two_logreg_v1.predict_1x2_from_artifact(
        artifact_filename=..., league_id=..., season=..., home_team_id=..., away_team_id=...
      )
    Expected return:
      {"probs": {"H":..., "D":..., "A":...}, ...}
    """
    from src.models.one_x_two_logreg_v1 import predict_1x2_from_artifact

    league_id = row.get("league_id")
    season = row.get("season")
    if league_id is None or season is None:
        raise RuntimeError("row missing league_id/season required by predictor")

    res = predict_1x2_from_artifact(
        artifact_filename=artifact.payload.get("artifact_id") or artifact.artifact_id,
        league_id=int(league_id),
        season=int(season),
        home_team_id=int(row["home_team_id"]),
        away_team_id=int(row["away_team_id"]),
    )

    probs = res.get("probs") if isinstance(res, dict) else None
    if not isinstance(probs, dict):
        raise RuntimeError(f"predictor returned unexpected payload (missing probs): {res}")

    pH = float(probs.get("H"))
    pD = float(probs.get("D"))
    pA = float(probs.get("A"))

    # normalize defensively (just in case)
    s = pH + pD + pA
    if s <= 0:
        raise RuntimeError(f"invalid probs (sum<=0): {probs}")
    pH, pD, pA = pH / s, pD / s, pA / s

    return {"H": pH, "D": pD, "A": pA}

# -----------------------------
# DB load: finished fixtures with teams
# -----------------------------
def load_finished_fixtures(
    league_id: Optional[int],
    seasons: Optional[List[int]],
    limit: Optional[int],
) -> List[Dict[str, Any]]:
    """
    Loads rows needed for inference & scoring.
    Adjust SELECT to your feature needs later. For now, includes:
      fixture_id, league_id, season, kickoff_utc, home_team_id, away_team_id, goals_home, goals_away
    """
    where = ["f.is_finished = TRUE", "f.is_cancelled = FALSE", "f.goals_home IS NOT NULL", "f.goals_away IS NOT NULL"]
    params: Dict[str, Any] = {}

    if league_id is not None:
        where.append("f.league_id = %(league_id)s")
        params["league_id"] = league_id

    if seasons:
        where.append("f.season = ANY(%(seasons)s)")
        params["seasons"] = seasons

    sql = f"""
      SELECT
        f.fixture_id,
        f.league_id,
        f.season,
        f.kickoff_utc,
        f.home_team_id,
        f.away_team_id,
        f.goals_home,
        f.goals_away
      FROM core.fixtures f
      WHERE {' AND '.join(where)}
      ORDER BY f.kickoff_utc ASC
      {('LIMIT %(limit)s' if limit else '')}
    """
    if limit:
        params["limit"] = limit

    with pg_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            rows = cur.fetchall()

    out: List[Dict[str, Any]] = []
    for (
        fixture_id,
        league_id_db,
        season_db,
        kickoff_utc,
        home_team_id,
        away_team_id,
        goals_home,
        goals_away,
    ) in rows:
        out.append(
            {
                "fixture_id": int(fixture_id),
                "league_id": int(league_id_db) if league_id_db is not None else None,
                "season": int(season_db) if season_db is not None else None,
                "kickoff_utc": kickoff_utc,
                "home_team_id": int(home_team_id),
                "away_team_id": int(away_team_id),
                "goals_home": int(goals_home),
                "goals_away": int(goals_away),
            }
        )
    return out


def outcome_1x2(goals_home: int, goals_away: int) -> str:
    if goals_home > goals_away:
        return "H"
    if goals_home < goals_away:
        return "A"
    return "D"


# -----------------------------
# Persist snapshot
# -----------------------------
def insert_artifact_metrics(
    artifact_id: str,
    league_id: Optional[int],
    season: Optional[int],
    n_games: int,
    brier: float,
    logloss: float,
    top1_acc: float,
    eval_from_utc: Optional[datetime],
    eval_to_utc: Optional[datetime],
    notes: Optional[str],
) -> None:
    sql = """
      INSERT INTO core.artifact_metrics (
        artifact_id, league_id, season, n_games,
        brier, logloss, top1_acc,
        eval_from_utc, eval_to_utc, notes
      )
      VALUES (
        %(artifact_id)s, %(league_id)s, %(season)s, %(n_games)s,
        %(brier)s, %(logloss)s, %(top1_acc)s,
        %(eval_from_utc)s, %(eval_to_utc)s, %(notes)s
      )
    """
    params = {
        "artifact_id": artifact_id,
        "league_id": league_id,
        "season": season,
        "n_games": n_games,
        "brier": float(brier),
        "logloss": float(logloss),
        "top1_acc": float(top1_acc),
        "eval_from_utc": eval_from_utc,
        "eval_to_utc": eval_to_utc,
        "notes": notes,
    }
    with pg_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params)
        conn.commit()


# -----------------------------
# Main
# -----------------------------
def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--artifact", required=True, help="Path to artifact json file")
    ap.add_argument("--league-id", type=int, default=None, help="Filter by league_id (optional)")
    ap.add_argument("--season", type=int, default=None, help="Filter by season (optional)")
    ap.add_argument("--limit", type=int, default=None, help="Limit number of games (optional)")
    ap.add_argument("--notes", type=str, default=None, help="Notes stored alongside snapshot")
    args = ap.parse_args()

    artifact_path = Path(args.artifact).expanduser().resolve()
    if not artifact_path.exists():
        raise SystemExit(f"artifact not found: {artifact_path}")

    artifact = load_artifact(artifact_path)
    artifact.artifact_id = artifact_path.name  # force to the actual filename used by predictor
    artifact.payload["artifact_id"] = artifact_path.name


    seasons = [args.season] if args.season is not None else None
    rows = load_finished_fixtures(league_id=args.league_id, seasons=seasons, limit=args.limit)

    if not rows:
        raise SystemExit("no finished fixtures found for given filters")

    eval_from = rows[0]["kickoff_utc"]
    eval_to = rows[-1]["kickoff_utc"]

    sum_brier = 0.0
    sum_logloss = 0.0
    sum_acc = 0.0
    n = 0

    for r in rows:
        y = outcome_1x2(r["goals_home"], r["goals_away"])

        probs = predict_probs_1x2_from_artifact(artifact, r)
        pH = float(probs["H"])
        pD = float(probs["D"])
        pA = float(probs["A"])

        sum_brier += brier_1x2(pH, pD, pA, y)
        sum_logloss += logloss_1x2(pH, pD, pA, y)
        sum_acc += top1_acc(pH, pD, pA, y)
        n += 1

    brier_avg = sum_brier / n
    logloss_avg = sum_logloss / n
    acc_avg = sum_acc / n

    # Persist snapshot (season=NULL means global)
    insert_artifact_metrics(
        artifact_id=artifact.artifact_id,
        league_id=args.league_id,
        season=args.season,
        n_games=n,
        brier=brier_avg,
        logloss=logloss_avg,
        top1_acc=acc_avg,
        eval_from_utc=eval_from,
        eval_to_utc=eval_to,
        notes=args.notes,
    )

    print("OK: inserted snapshot into core.artifact_metrics")
    print(
        json.dumps(
            {
                "artifact_id": artifact.artifact_id,
                "league_id": args.league_id,
                "season": args.season,
                "n_games": n,
                "brier": brier_avg,
                "logloss": logloss_avg,
                "top1_acc": acc_avg,
                "eval_from_utc": eval_from.isoformat() if eval_from else None,
                "eval_to_utc": eval_to.isoformat() if eval_to else None,
                "created_at_utc": datetime.now(timezone.utc).isoformat(),
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
