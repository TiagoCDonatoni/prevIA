from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Sequence, Set

from src.core.season_policy import resolve_candidate_seasons
from src.db.pg import pg_conn
from src.models.artifact_store import ARTIFACTS_DIR
from src.models.one_x_two_logreg_v1 import TrainConfig, train_and_save


def _pick_train_seasons(
    conn,
    *,
    league_id: int,
    season_policy: str,
    fixed_season: Optional[int],
    max_seasons: int = 3,
) -> List[int]:
    """
    Escolhe seasons de treino respeitando a janela operacional central.

    Para current:
      - tenta ano atual primeiro
      - fallback ano atual - 1
      - nunca usa season menor que ano atual - 1

    Para fixed:
      - usa fixed_season quando houver stats
    """
    candidate_seasons = resolve_candidate_seasons(
        season_policy=season_policy,
        fixed_season=fixed_season,
    )

    sql = """
      SELECT DISTINCT season
      FROM core.team_season_stats
      WHERE league_id = %(league_id)s
        AND season = ANY(%(candidate_seasons)s)
      ORDER BY season DESC
    """
    with conn.cursor() as cur:
        cur.execute(
            sql,
            {
                "league_id": int(league_id),
                "candidate_seasons": [int(s) for s in candidate_seasons],
            },
        )
        rows = cur.fetchall() or []

    available = {int(r[0]) for r in rows if r and r[0] is not None}

    ordered = [int(s) for s in candidate_seasons if int(s) in available]
    return ordered[: int(max_seasons)]


def _extract_years_from_artifact_filename(filename: str) -> Set[int]:
    """
    Extrai anos de nomes como:
      league61_1x2_logreg_v1_C1.0_2024.json
      league61_1x2_logreg_v1_C1.0_2025_2026.json

    Mantém simples e defensivo.
    """
    if not filename:
        return set()

    years = set()
    for token in re.findall(r"(?:19|20)\d{2}", str(filename)):
        try:
            years.add(int(token))
        except Exception:
            continue
    return years


def _artifact_is_valid_for_train_seasons(
    *,
    artifact_filename: str,
    train_seasons: Sequence[int],
) -> bool:
    if not artifact_filename:
        return False

    path = ARTIFACTS_DIR / artifact_filename
    if not path.exists():
        return False

    artifact_years = _extract_years_from_artifact_filename(artifact_filename)
    expected_years = {int(s) for s in train_seasons if s is not None}

    if not expected_years:
        return False

    # O artifact só é válido se o tag de season dele bater com as seasons
    # operacionais que o job escolheria hoje.
    return artifact_years == expected_years


def _build_artifact_filename(*, league_id: int, C: float, seasons: Sequence[int]) -> str:
    clean = [int(s) for s in seasons if s is not None]
    if not clean:
        raise ValueError("cannot build artifact filename without seasons")

    seasons_tag = f"{min(clean)}_{max(clean)}" if len(clean) > 1 else f"{clean[0]}"
    return f"league{int(league_id)}_1x2_logreg_v1_C{float(C)}_{seasons_tag}.json"


def ensure_models_1x2_v1(
    *,
    only_sport_key: Optional[str] = None,
    max_seasons: int = 3,
    min_fixtures: int = 120,
    C: float = 1.0,
) -> Dict[str, Any]:
    """
    Cron-ready:
    - garante que cada liga APPROVED+ENABLED tem artifact válido
    - artifact válido precisa existir e bater com a janela operacional atual
    - se estiver stale, treina novo artifact e atualiza odds_league_map
    """
    now = datetime.now(timezone.utc)

    sql_list = """
      SELECT
        sport_key,
        league_id,
        season_policy,
        fixed_season,
        artifact_filename
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
    stale_replaced: List[Dict[str, Any]] = []

    with pg_conn() as conn:
        conn.autocommit = False

        with conn.cursor() as cur:
            cur.execute(sql_list, {"only": only_sport_key})
            rows = cur.fetchall() or []

        for (sport_key, league_id, season_policy, fixed_season, artifact_filename) in rows:
            sport_key = str(sport_key)
            league_id = int(league_id)
            season_policy = str(season_policy or "current")
            fixed_season = int(fixed_season) if fixed_season is not None else None
            artifact_filename = str(artifact_filename) if artifact_filename else ""

            try:
                candidate_seasons = resolve_candidate_seasons(
                    season_policy=season_policy,
                    fixed_season=fixed_season,
                )
            except Exception as e:
                skipped.append(
                    {
                        "sport_key": sport_key,
                        "league_id": league_id,
                        "reason": "invalid_season_policy",
                        "season_policy": season_policy,
                        "fixed_season": fixed_season,
                        "error": str(e),
                    }
                )
                continue

            train_seasons = _pick_train_seasons(
                conn,
                league_id=league_id,
                season_policy=season_policy,
                fixed_season=fixed_season,
                max_seasons=max_seasons,
            )

            if not train_seasons:
                skipped.append(
                    {
                        "sport_key": sport_key,
                        "league_id": league_id,
                        "reason": "no_training_seasons_in_operational_window",
                        "season_policy": season_policy,
                        "fixed_season": fixed_season,
                        "candidate_seasons": candidate_seasons,
                    }
                )
                continue

            if _artifact_is_valid_for_train_seasons(
                artifact_filename=artifact_filename,
                train_seasons=train_seasons,
            ):
                skipped.append(
                    {
                        "sport_key": sport_key,
                        "league_id": league_id,
                        "reason": "artifact_exists",
                        "artifact_filename": artifact_filename,
                        "train_seasons": train_seasons,
                        "candidate_seasons": candidate_seasons,
                    }
                )
                continue

            previous_artifact_filename = artifact_filename or None
            new_artifact_filename = _build_artifact_filename(
                league_id=league_id,
                C=C,
                seasons=train_seasons,
            )

            cfg = TrainConfig(
                league_id=league_id,
                train_seasons=train_seasons,
                C=float(C),
            )

            try:
                payload = train_and_save(
                    cfg=cfg,
                    artifact_filename=new_artifact_filename,
                )
            except Exception as e:
                skipped.append(
                    {
                        "sport_key": sport_key,
                        "league_id": league_id,
                        "reason": "train_failed",
                        "season_policy": season_policy,
                        "fixed_season": fixed_season,
                        "candidate_seasons": candidate_seasons,
                        "train_seasons": train_seasons,
                        "previous_artifact_filename": previous_artifact_filename,
                        "new_artifact_filename": new_artifact_filename,
                        "error": str(e),
                    }
                )
                continue

            with conn.cursor() as cur:
                cur.execute(
                    sql_update,
                    {
                        "artifact": new_artifact_filename,
                        "model_version": payload.get("model_version") or "1x2_logreg_v1",
                        "now": now,
                        "sport_key": sport_key,
                        "league_id": league_id,
                    },
                )

            item = {
                "sport_key": sport_key,
                "league_id": league_id,
                "season_policy": season_policy,
                "fixed_season": fixed_season,
                "previous_artifact_filename": previous_artifact_filename,
                "artifact_filename": new_artifact_filename,
                "candidate_seasons": candidate_seasons,
                "train_seasons": train_seasons,
                "n_samples": payload.get("n_samples"),
            }

            trained.append(item)

            if previous_artifact_filename:
                stale_replaced.append(item)

        conn.commit()

    return {
        "ok": True,
        "only_sport_key": only_sport_key,
        "trained": trained,
        "trained_count": len(trained),
        "stale_replaced": stale_replaced,
        "stale_replaced_count": len(stale_replaced),
        "skipped": skipped[:50],
        "skipped_count": len(skipped),
        "captured_at_utc": now.isoformat(),
    }