from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from src.db.pg import pg_conn
from src.models.one_x_two_logreg_v1 import TrainConfig, train_and_save
from src.models.artifact_store import ModelArtifactRef, ARTIFACTS_DIR


def _pick_train_seasons(conn, *, league_id: int, max_seasons: int = 3) -> List[int]:
    """
    Heurística v2 (mais correta):
    - treinar apenas em seasons que já têm team_season_stats
    - evita mismatch fixtures-vs-stats
    """
    sql = """
      SELECT DISTINCT season
      FROM core.team_season_stats
      WHERE league_id = %(league_id)s
      ORDER BY season DESC
      LIMIT %(max_seasons)s
    """
    with conn.cursor() as cur:
        cur.execute(sql, {"league_id": int(league_id), "max_seasons": int(max_seasons)})
        rows = cur.fetchall() or []
    return [int(r[0]) for r in rows]

def ensure_models_1x2_v1(
    *,
    only_sport_key: Optional[str] = None,
    max_seasons: int = 3,
    min_fixtures: int = 120,
    C: float = 1.0,
) -> Dict[str, Any]:
    """
    Cron-ready:
    - garante que cada liga APPROVED+ENABLED tem artifact_filename válido
    - se não existir, treina e persiste no odds_league_map
    """
    now = datetime.now(timezone.utc)

    sql_list = """
      SELECT sport_key, league_id, artifact_filename
      FROM odds.odds_league_map
      WHERE enabled = true
        AND mapping_status = 'approved'
        AND (%(only)s::text is null or sport_key = %(only)s::text)
      ORDER BY sport_key ASC
    """

    sql_update = """
      UPDATE odds.odds_league_map
      SET artifact_filename = %(artifact)s,
          model_version = %(model_version)s,
          updated_at_utc = %(now)s
      WHERE sport_key = %(sport_key)s
        AND league_id = %(league_id)s
    """

    trained: List[Dict[str, Any]] = []
    skipped: List[Dict[str, Any]] = []

    with pg_conn() as conn:
        conn.autocommit = False
        with conn.cursor() as cur:
            cur.execute(sql_list, {"only": only_sport_key})
            rows = cur.fetchall() or []

        for (sport_key, league_id, artifact_filename) in rows:
            sport_key = str(sport_key)
            league_id = int(league_id)
            artifact_filename = str(artifact_filename) if artifact_filename else ""

            # já tem arquivo?
            if artifact_filename:
                path = ARTIFACTS_DIR / artifact_filename
                if path.exists():
                    skipped.append({"sport_key": sport_key, "league_id": league_id, "reason": "artifact_exists", "artifact_filename": artifact_filename})
                    continue

            # escolher seasons
            seasons = _pick_train_seasons(conn, league_id=league_id, max_seasons=max_seasons)
            if not seasons:
                skipped.append({"sport_key": sport_key, "league_id": league_id, "reason": "no_training_seasons"})
                continue

            # nome padronizado do artifact
            seasons_tag = f"{min(seasons)}_{max(seasons)}" if len(seasons) > 1 else f"{seasons[0]}"
            artifact_filename = f"league{league_id}_1x2_logreg_v1_C{C}_{seasons_tag}.json"

            cfg = TrainConfig(league_id=league_id, train_seasons=seasons, C=float(C))

            try:
                payload = train_and_save(cfg=cfg, artifact_filename=artifact_filename)
            except Exception as e:
                skipped.append({"sport_key": sport_key, "league_id": league_id, "reason": "train_failed", "seasons": seasons, "error": str(e)})
                continue

            with conn.cursor() as cur:
                cur.execute(
                    sql_update,
                    {
                        "artifact": artifact_filename,
                        "model_version": payload.get("model_version") or "1x2_logreg_v1",
                        "now": now,
                        "sport_key": sport_key,
                        "league_id": league_id,
                    },
                )

            trained.append(
                {
                    "sport_key": sport_key,
                    "league_id": league_id,
                    "artifact_filename": artifact_filename,
                    "train_seasons": seasons,
                    "n_samples": payload.get("n_samples"),
                }
            )

        conn.commit()

    return {
        "ok": True,
        "only_sport_key": only_sport_key,
        "trained": trained,
        "trained_count": len(trained),
        "skipped": skipped[:50],
        "skipped_count": len(skipped),
        "captured_at_utc": now.isoformat(),
    }