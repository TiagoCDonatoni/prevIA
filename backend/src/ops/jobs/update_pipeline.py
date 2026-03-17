from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from src.db.pg import pg_conn
from src.etl.orchestrate_apifootball_pg import orchestrate_apifootball_pg
from src.metrics.team_season_stats import recompute_team_season_stats
from src.ops.jobs.odds_refresh import odds_refresh
from src.ops.jobs.odds_resolve import odds_resolve_batch
from src.ops.jobs.snapshots_materialize import snapshots_materialize
from src.ops.jobs.models_ensure_1x2_v1 import ensure_models_1x2_v1


@dataclass
class PipelineLeagueScope:
    sport_key: str
    league_id: int
    season_policy: str
    fixed_season: Optional[int]
    tol_hours: int
    hours_ahead: int
    regions: str


def _load_pipeline_scopes(*, only_sport_key: Optional[str] = None) -> List[PipelineLeagueScope]:
    sql = """
      select
        m.sport_key,
        m.league_id,
        m.season_policy,
        m.fixed_season,
        m.tol_hours,
        m.hours_ahead,
        m.regions
      from odds.odds_league_map m
      where m.enabled = true
        and m.mapping_status = 'approved'
        and (%(only)s::text is null or m.sport_key = %(only)s::text)
      order by m.sport_key asc
    """
    items: List[PipelineLeagueScope] = []
    with pg_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, {"only": only_sport_key})
            rows = cur.fetchall() or []

    for r in rows:
        items.append(
            PipelineLeagueScope(
                sport_key=str(r[0]),
                league_id=int(r[1]),
                season_policy=str(r[2] or "current"),
                fixed_season=int(r[3]) if r[3] is not None else None,
                tol_hours=int(r[4] or 6),
                hours_ahead=int(r[5] or 720),
                regions=str(r[6] or "eu"),
            )
        )
    return items


def _current_year_utc() -> int:
    return datetime.now(timezone.utc).year


def _seasons_for_scope(scope: PipelineLeagueScope) -> List[int]:
    if scope.fixed_season is not None:
        return [int(scope.fixed_season)]
    year = _current_year_utc()
    return [year - 1, year]


def update_pipeline_run(
    *,
    only_sport_key: Optional[str] = None,
) -> Dict[str, Any]:
    scopes = _load_pipeline_scopes(only_sport_key=only_sport_key)

    result: Dict[str, Any] = {
        "ok": True,
        "only_sport_key": only_sport_key,
        "summary": {
            "leagues_requested": len(scopes),
            "leagues_processed": 0,
            "new_leagues": 0,
            "fixtures_updated": 0,
            "stats_inserted": 0,
            "stats_deleted": 0,
            "odds_refresh_runs": 0,
            "events_resolved": 0,
            "snapshots_upserted": 0,
            "fallbacks": 0,
            "errors": 0,
        },
        "items": [],
    }

    for scope in scopes:
        league_out: Dict[str, Any] = {
            "sport_key": scope.sport_key,
            "league_id": scope.league_id,
            "steps": {},
        }

        try:
            seasons = _seasons_for_scope(scope)

            # Step 1 — API-Football / core
            refresh_out = orchestrate_apifootball_pg(
                league_ids=[scope.league_id],
                seasons=seasons,
                max_calls=200,
            )
            league_out["steps"]["fixtures_core"] = refresh_out

            # Step 2 — stats
            stats_out = recompute_team_season_stats(
                seasons=seasons,
                league_ids=[scope.league_id],
            )
            league_out["steps"]["stats"] = {
                "deleted": int(stats_out.deleted),
                "inserted": int(stats_out.inserted),
            }

            # Step 3 — odds refresh
            refresh_odds_out = odds_refresh(
                sport_key=scope.sport_key,
                regions=scope.regions,
            )
            league_out["steps"]["odds_refresh"] = refresh_odds_out

            # Step 4 — resolve
            resolve_out = odds_resolve_batch(
                sport_key=scope.sport_key,
                assume_league_id=scope.league_id,
                season_policy=scope.season_policy,
                fixed_season=scope.fixed_season,
                tol_hours=scope.tol_hours,
                hours_ahead=scope.hours_ahead,
                limit=500,
            )
            league_out["steps"]["resolve"] = resolve_out

            # Step 5 — ensure models
            models_out = ensure_models_1x2_v1(
                only_sport_key=scope.sport_key,
                max_seasons=3,
                min_fixtures=120,
                C=1.0,
            )
            league_out["steps"]["models"] = models_out

            # Step 6 — snapshots
            snapshots_out = snapshots_materialize(
                sport_key=scope.sport_key,
                mode="window",
                hours_ahead=scope.hours_ahead,
                limit=500,
            )
            league_out["steps"]["snapshots"] = snapshots_out

            # Aggregates
            result["summary"]["leagues_processed"] += 1
            result["summary"]["fixtures_updated"] += int(
                (((refresh_out or {}).get("core") or {}).get("fixtures") or {}).get("upserts", 0)
            )
            result["summary"]["stats_inserted"] += int(stats_out.inserted)
            result["summary"]["stats_deleted"] += int(stats_out.deleted)
            result["summary"]["odds_refresh_runs"] += 1
            result["summary"]["events_resolved"] += int(
                (((resolve_out or {}).get("counters") or {}).get("persisted", 0))
            )
            result["summary"]["snapshots_upserted"] += int(
                (((snapshots_out or {}).get("counters") or {}).get("snapshots_upserted", 0))
            )
            result["summary"]["fallbacks"] += int(
                (((snapshots_out or {}).get("counters") or {}).get("snapshots_team_fallback", 0))
            )

        except Exception as e:
            league_out["error"] = str(e)
            result["summary"]["errors"] += 1
            result["ok"] = False

        result["items"].append(league_out)

    return result