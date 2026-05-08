from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from time import perf_counter, sleep
import traceback
from typing import Any, Dict, List, Optional

from src.db.pg import pg_conn
from src.etl.orchestrate_apifootball_pg import orchestrate_apifootball_pg
from src.metrics.team_season_stats import recompute_team_season_stats
from src.ops.jobs.odds_refresh import odds_refresh
from src.ops.jobs.odds_resolve import odds_resolve_batch
from src.ops.jobs.snapshots_materialize import snapshots_materialize
from src.ops.jobs.models_ensure_1x2_v1 import ensure_models_1x2_v1
from src.ops.jobs.audit_sync import audit_sync_from_product_snapshots
from src.product.model_registry import get_active_model_version
from src.core.season_policy import resolve_candidate_seasons


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


def _infer_latest_core_season(*, league_id: int) -> Optional[int]:
    sql = "select max(season) from core.fixtures where league_id = %(league_id)s"
    with pg_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, {"league_id": int(league_id)})
            row = cur.fetchone()
    return int(row[0]) if row and row[0] is not None else None


def _seasons_for_scope(scope: PipelineLeagueScope) -> List[int]:
    return resolve_candidate_seasons(
        season_policy=scope.season_policy,
        fixed_season=scope.fixed_season,
    )


def _safe_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except Exception:
        return default


def _step_error_text(out: Any) -> Optional[str]:
    if isinstance(out, dict):
        if bool(out.get("ok", True)):
            return None
        return str(out.get("error") or out.get("reason") or "step_returned_not_ok")
    return None


def _run_step_with_retry(
    *,
    step_name: str,
    fn,
    max_attempts: int = 1,
    backoff_sec: float = 1.0,
    soft_fail: bool = False,
) -> Dict[str, Any]:
    attempts: List[Dict[str, Any]] = []
    t0 = perf_counter()

    last_result: Dict[str, Any] = {}
    last_error: Optional[str] = None

    for attempt_no in range(1, max_attempts + 1):
        attempt_t0 = perf_counter()

        try:
            out = fn() or {}
            last_result = out if isinstance(out, dict) else {"result": out}
            err = _step_error_text(last_result)

            attempts.append(
                {
                    "attempt_no": attempt_no,
                    "ok": err is None,
                    "elapsed_ms": int((perf_counter() - attempt_t0) * 1000),
                    "error": err,
                }
            )

            if err is None:
                return {
                    "ok": True,
                    "soft_failed": False,
                    "attempts_used": attempt_no,
                    "attempts": attempts,
                    "result": last_result,
                    "error": None,
                    "elapsed_ms_total": int((perf_counter() - t0) * 1000),
                }

            last_error = err

        except Exception as exc:
            last_error = f"{type(exc).__name__}: {exc}"
            attempts.append(
                {
                    "attempt_no": attempt_no,
                    "ok": False,
                    "elapsed_ms": int((perf_counter() - attempt_t0) * 1000),
                    "error": last_error,
                    "traceback": traceback.format_exc(),
                }
            )

        if attempt_no < max_attempts:
            sleep(backoff_sec * attempt_no)

    return {
        "ok": False,
        "soft_failed": bool(soft_fail),
        "attempts_used": len(attempts),
        "attempts": attempts,
        "result": last_result,
        "error": last_error or f"{step_name}_failed",
        "elapsed_ms_total": int((perf_counter() - t0) * 1000),
    }

def update_pipeline_run(
    *,
    only_sport_key: Optional[str] = None,
) -> Dict[str, Any]:
    started_at = datetime.now(timezone.utc)
    global_t0 = perf_counter()

    scopes = _load_pipeline_scopes(only_sport_key=only_sport_key)
    active_model_version = get_active_model_version()

    result: Dict[str, Any] = {
        "ok": True,
        "only_sport_key": only_sport_key,
        "started_at_utc": started_at.isoformat(),
        "active_model_version": active_model_version,
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
            "audit_predictions_upserted": 0,
            "audit_results_upserted": 0,
            "audit_missing_event_id": 0,
            "audit_missing_fixture_id": 0,
            "audit_missing_model_probs": 0,
            "fallbacks": 0,
            "sports_refresh_failures": 0,
            "sports_refresh_retries_used": 0,
            "warnings": 0,
            "errors": 0,
            "elapsed_ms": 0,
        },
        "items": [],
    }

    total = len(scopes)

    print(
        f"[UPDATE_PIPELINE] start scopes={total} only_sport_key={only_sport_key} model_version={active_model_version}",
        flush=True,
    )

    for idx, scope in enumerate(scopes, start=1):
        league_t0 = perf_counter()

        league_out: Dict[str, Any] = {
            "sport_key": scope.sport_key,
            "league_id": scope.league_id,
            "season_policy": scope.season_policy,
            "fixed_season": scope.fixed_season,
            "tol_hours": scope.tol_hours,
            "hours_ahead": scope.hours_ahead,
            "regions": scope.regions,
            "steps": {},
            "timing_ms": {},
        }
        league_out["warnings"] = []

        print(
            f"[UPDATE_PIPELINE] [{idx}/{total}] start sport_key={scope.sport_key} "
            f"league_id={scope.league_id} season_policy={scope.season_policy} "
            f"fixed_season={scope.fixed_season} hours_ahead={scope.hours_ahead} regions={scope.regions}",
            flush=True,
        )

        try:
            seasons = _seasons_for_scope(scope)
            league_out["seasons"] = seasons
            latest_core_season = _infer_latest_core_season(league_id=scope.league_id)
            league_out["season_resolution"] = {
                "season_policy": scope.season_policy,
                "fixed_season": scope.fixed_season,
                "candidate_seasons": seasons,
                "latest_core_season_before_update": latest_core_season,
            }

            print(
                f"[UPDATE_PIPELINE] [{idx}/{total}] step=fixtures_core start seasons={seasons}",
                flush=True,
            )

            fixtures_core_step = _run_step_with_retry(
                step_name="fixtures_core",
                max_attempts=3,
                backoff_sec=1.0,
                soft_fail=True,
                fn=lambda: orchestrate_apifootball_pg(
                    league_ids=[scope.league_id],
                    seasons=seasons,
                    max_calls=30,
                ),
            )

            league_out["steps"]["fixtures_core"] = fixtures_core_step
            league_out["timing_ms"]["fixtures_core"] = int(
                fixtures_core_step["elapsed_ms_total"]
            )

            result["summary"]["sports_refresh_retries_used"] += max(
                0, int(fixtures_core_step["attempts_used"]) - 1
            )

            refresh_out = dict(fixtures_core_step.get("result") or {})

            leagues_upserts = _safe_int(
                (((refresh_out or {}).get("core") or {}).get("leagues") or {}).get("upserts", 0)
            )
            teams_upserts = _safe_int(
                (((refresh_out or {}).get("core") or {}).get("teams") or {}).get("upserts", 0)
            )
            fixtures_upserts = _safe_int(
                (((refresh_out or {}).get("core") or {}).get("fixtures") or {}).get("upserts", 0)
            )

            if not fixtures_core_step["ok"]:
                result["summary"]["sports_refresh_failures"] += 1
                result["summary"]["warnings"] += 1
                result["summary"]["errors"] += 1
                result["ok"] = False

                league_out["warnings"].append(
                    {
                        "step": "fixtures_core",
                        "message": "sports refresh/core failed after retries; pipeline continued with stale core data",
                        "error": fixtures_core_step.get("error"),
                        "attempts_used": fixtures_core_step.get("attempts_used"),
                    }
                )

                print(
                    f"[UPDATE_PIPELINE] [{idx}/{total}] step=fixtures_core soft-failed "
                    f"attempts={fixtures_core_step.get('attempts_used')} "
                    f"error={fixtures_core_step.get('error')} "
                    f"elapsed_ms={league_out['timing_ms']['fixtures_core']}",
                    flush=True,
                )
            else:
                print(
                    f"[UPDATE_PIPELINE] [{idx}/{total}] step=fixtures_core done "
                    f"attempts={fixtures_core_step.get('attempts_used')} "
                    f"leagues_upserts={leagues_upserts} teams_upserts={teams_upserts} "
                    f"fixtures_upserts={fixtures_upserts} "
                    f"elapsed_ms={league_out['timing_ms']['fixtures_core']}",
                    flush=True,
                )

            print(
                f"[UPDATE_PIPELINE] [{idx}/{total}] step=stats start seasons={seasons}",
                flush=True,
            )
            step_t0 = perf_counter()
            stats_out = recompute_team_season_stats(
                seasons=seasons,
                league_ids=[scope.league_id],
            )
            league_out["steps"]["stats"] = {
                "deleted": int(stats_out.deleted),
                "inserted": int(stats_out.inserted),
            }
            league_out["timing_ms"]["stats"] = int((perf_counter() - step_t0) * 1000)

            print(
                f"[UPDATE_PIPELINE] [{idx}/{total}] step=stats done "
                f"inserted={int(stats_out.inserted)} deleted={int(stats_out.deleted)} "
                f"elapsed_ms={league_out['timing_ms']['stats']}",
                flush=True,
            )

            print(
                f"[UPDATE_PIPELINE] [{idx}/{total}] step=odds_refresh start "
                f"sport_key={scope.sport_key} regions={scope.regions}",
                flush=True,
            )
            step_t0 = perf_counter()
            refresh_odds_out = odds_refresh(
                sport_key=scope.sport_key,
                regions=scope.regions,
            )
            league_out["steps"]["odds_refresh"] = refresh_odds_out
            league_out["timing_ms"]["odds_refresh"] = int((perf_counter() - step_t0) * 1000)

            odds_events_upserted = _safe_int((refresh_odds_out or {}).get("events_upserted", 0))
            odds_snapshots_inserted = _safe_int((refresh_odds_out or {}).get("snapshots_inserted", 0))
            odds_market_attempted = _safe_int((refresh_odds_out or {}).get("market_snapshots_attempted", 0))

            print(
                f"[UPDATE_PIPELINE] [{idx}/{total}] step=odds_refresh done "
                f"events_upserted={odds_events_upserted} "
                f"snapshots_inserted={odds_snapshots_inserted} "
                f"market_snapshots_attempted={odds_market_attempted} "
                f"elapsed_ms={league_out['timing_ms']['odds_refresh']}",
                flush=True,
            )

            print(
                f"[UPDATE_PIPELINE] [{idx}/{total}] step=resolve start "
                f"sport_key={scope.sport_key} assume_league_id={scope.league_id}",
                flush=True,
            )
            step_t0 = perf_counter()
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
            league_out["timing_ms"]["resolve"] = int((perf_counter() - step_t0) * 1000)

            resolve_persisted = _safe_int(
                (((resolve_out or {}).get("counters") or {}).get("persisted", 0))
            )
            resolve_exact = _safe_int(
                (((resolve_out or {}).get("counters") or {}).get("exact", 0))
            )
            resolve_probable = _safe_int(
                (((resolve_out or {}).get("counters") or {}).get("probable", 0))
            )
            resolve_not_found = _safe_int(
                (((resolve_out or {}).get("counters") or {}).get("not_found", 0))
            )
            
            print(
                f"[UPDATE_PIPELINE] [{idx}/{total}] step=resolve done "
                f"persisted={resolve_persisted} exact={resolve_exact} "
                f"probable={resolve_probable} not_found={resolve_not_found} "
                f"elapsed_ms={league_out['timing_ms']['resolve']}",
                flush=True,
            )

            print(
                f"[UPDATE_PIPELINE] [{idx}/{total}] step=models start "
                f"sport_key={scope.sport_key}",
                flush=True,
            )
            step_t0 = perf_counter()
            models_out = ensure_models_1x2_v1(
                only_sport_key=scope.sport_key,
                max_seasons=3,
                min_fixtures=120,
                C=1.0,
            )
            league_out["steps"]["models"] = models_out
            league_out["timing_ms"]["models"] = int((perf_counter() - step_t0) * 1000)

            print(
                f"[UPDATE_PIPELINE] [{idx}/{total}] step=models done "
                f"elapsed_ms={league_out['timing_ms']['models']}",
                flush=True,
            )

            print(
                f"[UPDATE_PIPELINE] [{idx}/{total}] step=snapshots start "
                f"sport_key={scope.sport_key} model_version={active_model_version}",
                flush=True,
            )
            step_t0 = perf_counter()
            snapshots_out = snapshots_materialize(
                sport_key=scope.sport_key,
                mode="window",
                hours_ahead=scope.hours_ahead,
                limit=500,
                model_version=active_model_version,
            )
            league_out["steps"]["snapshots"] = snapshots_out
            league_out["timing_ms"]["snapshots"] = int((perf_counter() - step_t0) * 1000)

            snapshots_upserted = _safe_int(
                (((snapshots_out or {}).get("counters") or {}).get("snapshots_upserted", 0))
            )
            snapshots_fallback = _safe_int(
                (((snapshots_out or {}).get("counters") or {}).get("snapshots_team_fallback", 0))
            )

            print(
                f"[UPDATE_PIPELINE] [{idx}/{total}] step=snapshots done "
                f"snapshots_upserted={snapshots_upserted} "
                f"snapshots_team_fallback={snapshots_fallback} "
                f"elapsed_ms={league_out['timing_ms']['snapshots']}",
                flush=True,
            )
            print(
                f"[UPDATE_PIPELINE] [{idx}/{total}] step=audit_sync start "
                f"sport_key={scope.sport_key} league_id={scope.league_id}",
                flush=True,
            )
            step_t0 = perf_counter()
            audit_sync_out = audit_sync_from_product_snapshots(
                sport_key=scope.sport_key,
                league_id=scope.league_id,
                lookback_days=60,
                finished_before_hours=1,
                max_prediction_rows=10000,
                max_result_rows=10000,
            )
            league_out["steps"]["audit_sync"] = audit_sync_out
            league_out["timing_ms"]["audit_sync"] = int((perf_counter() - step_t0) * 1000)

            audit_predictions_upserted = _safe_int(
                (audit_sync_out or {}).get("audit_predictions_upserted", 0)
            )
            audit_results_upserted = _safe_int(
                (audit_sync_out or {}).get("audit_results_upserted", 0)
            )
            audit_diag = (audit_sync_out or {}).get("diagnostics") or {}
            audit_missing_event_id = _safe_int(audit_diag.get("missing_event_id", 0))
            audit_missing_fixture_id = _safe_int(audit_diag.get("missing_fixture_id", 0))
            audit_missing_model_probs = _safe_int(audit_diag.get("missing_model_probs", 0))

            print(
                f"[UPDATE_PIPELINE] [{idx}/{total}] step=audit_sync done "
                f"audit_predictions_upserted={audit_predictions_upserted} "
                f"audit_results_upserted={audit_results_upserted} "
                f"missing_event_id={audit_missing_event_id} "
                f"missing_fixture_id={audit_missing_fixture_id} "
                f"missing_model_probs={audit_missing_model_probs} "
                f"elapsed_ms={league_out['timing_ms']['audit_sync']}",
                flush=True,
            )

            result["summary"]["leagues_processed"] += 1
            result["summary"]["fixtures_updated"] += fixtures_upserts
            result["summary"]["stats_inserted"] += int(stats_out.inserted)
            result["summary"]["stats_deleted"] += int(stats_out.deleted)
            result["summary"]["odds_refresh_runs"] += 1
            result["summary"]["events_resolved"] += resolve_persisted
            result["summary"]["snapshots_upserted"] += snapshots_upserted
            result["summary"]["audit_predictions_upserted"] += audit_predictions_upserted
            result["summary"]["audit_results_upserted"] += audit_results_upserted
            result["summary"]["audit_missing_event_id"] += audit_missing_event_id
            result["summary"]["audit_missing_fixture_id"] += audit_missing_fixture_id
            result["summary"]["audit_missing_model_probs"] += audit_missing_model_probs
            result["summary"]["fallbacks"] += snapshots_fallback


            league_out["timing_ms"]["total"] = int((perf_counter() - league_t0) * 1000)

            print(
                f"[UPDATE_PIPELINE] [{idx}/{total}] done sport_key={scope.sport_key} "
                f"league_id={scope.league_id} total_elapsed_ms={league_out['timing_ms']['total']}",
                flush=True,
            )

        except Exception as e:
            league_out["error"] = str(e)
            league_out["traceback"] = traceback.format_exc()
            league_out["timing_ms"]["total"] = int((perf_counter() - league_t0) * 1000)

            result["summary"]["errors"] += 1
            result["ok"] = False

            print(
                f"[UPDATE_PIPELINE] [{idx}/{total}] error sport_key={scope.sport_key} "
                f"league_id={scope.league_id} elapsed_ms={league_out['timing_ms']['total']} "
                f"error={e}",
                flush=True,
            )
            print(league_out["traceback"], flush=True)

        result["items"].append(league_out)

    result["summary"]["elapsed_ms"] = int((perf_counter() - global_t0) * 1000)
    result["finished_at_utc"] = datetime.now(timezone.utc).isoformat()

    print(
        f"[UPDATE_PIPELINE] finished ok={result['ok']} "
        f"leagues_processed={result['summary']['leagues_processed']} "
        f"errors={result['summary']['errors']} "
        f"elapsed_ms={result['summary']['elapsed_ms']}",
        flush=True,
    )

    return result


def update_pipeline_run_shard(
    *,
    shard_index: int = 0,
    shard_count: int = 10,
    max_scopes: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Cloud-safe wrapper para o update_pipeline_run.

    Divide as ligas approved/enabled em shards estáveis, usando a ordem
    alfabética de sport_key já definida por _load_pipeline_scopes().

    Exemplo:
      shard_count=10, shard_index=0 -> roda ~1/10 das ligas.
    """
    started_at = datetime.now(timezone.utc)
    global_t0 = perf_counter()

    try:
        shard_index = int(shard_index)
        shard_count = int(shard_count)
    except Exception:
        return {
            "ok": False,
            "error": "invalid_shard_params",
            "message": "shard_index and shard_count must be integers",
            "counters": {
                "shard_index": shard_index,
                "shard_count": shard_count,
                "count": 0,
                "succeeded_count": 0,
                "failed_count": 0,
            },
        }

    if shard_count <= 0:
        return {
            "ok": False,
            "error": "invalid_shard_count",
            "message": "shard_count must be greater than zero",
            "counters": {
                "shard_index": shard_index,
                "shard_count": shard_count,
                "count": 0,
                "succeeded_count": 0,
                "failed_count": 0,
            },
        }

    if shard_index < 0 or shard_index >= shard_count:
        return {
            "ok": False,
            "error": "invalid_shard_index",
            "message": "shard_index must be between 0 and shard_count - 1",
            "counters": {
                "shard_index": shard_index,
                "shard_count": shard_count,
                "count": 0,
                "succeeded_count": 0,
                "failed_count": 0,
            },
        }

    all_scopes = _load_pipeline_scopes(only_sport_key=None)

    selected_scopes = [
        scope
        for idx, scope in enumerate(all_scopes)
        if idx % shard_count == shard_index
    ]

    if max_scopes is not None:
        try:
            max_scopes_int = int(max_scopes)
        except Exception:
            max_scopes_int = 0

        if max_scopes_int > 0:
            selected_scopes = selected_scopes[:max_scopes_int]

    items: List[Dict[str, Any]] = []
    succeeded_count = 0
    failed_count = 0

    summary: Dict[str, Any] = {
        "shard_index": shard_index,
        "shard_count": shard_count,
        "total_available_scopes": len(all_scopes),
        "selected_scopes": len(selected_scopes),
        "leagues_processed": 0,
        "fixtures_updated": 0,
        "stats_inserted": 0,
        "stats_deleted": 0,
        "odds_refresh_runs": 0,
        "events_resolved": 0,
        "snapshots_upserted": 0,
        "audit_predictions_upserted": 0,
        "audit_results_upserted": 0,
        "warnings": 0,
        "errors": 0,
        "elapsed_ms": 0,
    }

    print(
        f"[UPDATE_PIPELINE_SHARD] start shard_index={shard_index} "
        f"shard_count={shard_count} selected_scopes={len(selected_scopes)}",
        flush=True,
    )

    for idx, scope in enumerate(selected_scopes, start=1):
        item_t0 = perf_counter()

        item: Dict[str, Any] = {
            "ok": True,
            "sport_key": scope.sport_key,
            "league_id": scope.league_id,
            "shard_index": shard_index,
            "shard_count": shard_count,
            "timing_ms": {},
        }

        print(
            f"[UPDATE_PIPELINE_SHARD] [{idx}/{len(selected_scopes)}] "
            f"start sport_key={scope.sport_key} league_id={scope.league_id}",
            flush=True,
        )

        try:
            out = update_pipeline_run(only_sport_key=scope.sport_key)
            out = out if isinstance(out, dict) else {"result": out}

            child_summary = out.get("summary") or {}
            ok = bool(out.get("ok", True))

            item["ok"] = ok
            item["summary"] = child_summary
            item["result"] = out

            if ok:
                succeeded_count += 1
            else:
                failed_count += 1
                summary["errors"] += 1

            summary["leagues_processed"] += _safe_int(child_summary.get("leagues_processed", 0))
            summary["fixtures_updated"] += _safe_int(child_summary.get("fixtures_updated", 0))
            summary["stats_inserted"] += _safe_int(child_summary.get("stats_inserted", 0))
            summary["stats_deleted"] += _safe_int(child_summary.get("stats_deleted", 0))
            summary["odds_refresh_runs"] += _safe_int(child_summary.get("odds_refresh_runs", 0))
            summary["events_resolved"] += _safe_int(child_summary.get("events_resolved", 0))
            summary["snapshots_upserted"] += _safe_int(child_summary.get("snapshots_upserted", 0))
            summary["audit_predictions_upserted"] += _safe_int(
                child_summary.get("audit_predictions_upserted", 0)
            )
            summary["audit_results_upserted"] += _safe_int(
                child_summary.get("audit_results_upserted", 0)
            )
            summary["warnings"] += _safe_int(child_summary.get("warnings", 0))
            summary["errors"] += _safe_int(child_summary.get("errors", 0))

        except Exception as exc:
            failed_count += 1
            summary["errors"] += 1
            item["ok"] = False
            item["exception"] = {
                "type": type(exc).__name__,
                "message": str(exc),
                "traceback": traceback.format_exc(),
            }

            print(
                f"[UPDATE_PIPELINE_SHARD] [{idx}/{len(selected_scopes)}] "
                f"error sport_key={scope.sport_key} error={exc}",
                flush=True,
            )

        item["timing_ms"]["total"] = int((perf_counter() - item_t0) * 1000)
        items.append(item)

        print(
            f"[UPDATE_PIPELINE_SHARD] [{idx}/{len(selected_scopes)}] "
            f"done sport_key={scope.sport_key} ok={item['ok']} "
            f"elapsed_ms={item['timing_ms']['total']}",
            flush=True,
        )

    elapsed_ms = int((perf_counter() - global_t0) * 1000)
    summary["elapsed_ms"] = elapsed_ms

    counters = {
        "shard_index": shard_index,
        "shard_count": shard_count,
        "count": len(selected_scopes),
        "succeeded_count": succeeded_count,
        "failed_count": failed_count,
        "elapsed_ms": elapsed_ms,
    }

    return {
        "ok": failed_count == 0,
        "job": "update_pipeline_run_shard",
        "started_at_utc": started_at.isoformat(),
        "finished_at_utc": datetime.now(timezone.utc).isoformat(),
        "shard_index": shard_index,
        "shard_count": shard_count,
        "total_available_scopes": len(all_scopes),
        "count": len(selected_scopes),
        "succeeded_count": succeeded_count,
        "failed_count": failed_count,
        "summary": summary,
        "items": items,
        "counters": counters,
    }