from __future__ import annotations

import time
import traceback
from typing import Any, Dict, List, Optional

from src.db.pg import pg_conn
from src.ops.jobs.models_ensure_1x2_v1 import ensure_models_1x2_v1
from src.ops.jobs.odds_refresh import odds_refresh
from src.ops.jobs.odds_resolve import odds_resolve_batch
from src.ops.jobs.snapshots_materialize import snapshots_materialize
from src.product.model_registry import get_active_model_version


def _step_ok(value: Any) -> bool:
    if not isinstance(value, dict):
        return True
    return bool(value.get("ok", True))


def pipeline_run_all(
    *,
    only_sport_key: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Job cron-ready:
    - lê odds.odds_league_map (enabled + approved)
    - para cada sport_key: odds refresh -> resolve -> ensure models -> materialize snapshots
    - isola erro por sport_key para uma liga ruim não derrubar a execução inteira sem diagnóstico
    """
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

    active_model_version = get_active_model_version()

    with pg_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, {"only": only_sport_key})
            rows = cur.fetchall()

    items: List[Dict[str, Any]] = []
    failed_count = 0
    succeeded_count = 0

    for r in rows:
        sport_key = str(r[0])
        league_id = int(r[1])
        season_policy = str(r[2] or "current")
        fixed_season = int(r[3]) if r[3] is not None else None
        tol_hours = int(r[4] or 6)
        hours_ahead = int(r[5] or 720)
        regions = str(r[6] or "eu")

        item_started = time.perf_counter()
        item: Dict[str, Any] = {
            "ok": True,
            "sport_key": sport_key,
            "league_id": league_id,
            "regions": regions,
            "season_policy": season_policy,
            "fixed_season": fixed_season,
            "tol_hours": tol_hours,
            "hours_ahead": hours_ahead,
            "model_version": active_model_version,
            "steps": {},
            "timing_ms": {},
            "warnings": [],
        }

        def run_step(name: str, fn, **kwargs):
            step_started = time.perf_counter()
            result = fn(**kwargs)
            item["steps"][name] = result
            item["timing_ms"][name] = int((time.perf_counter() - step_started) * 1000)

            if not _step_ok(result):
                item["ok"] = False
                item["warnings"].append(
                    {
                        "step": name,
                        "message": (
                            str(result.get("error") or result.get("message") or "step_returned_not_ok")
                            if isinstance(result, dict)
                            else "step_returned_not_ok"
                        ),
                    }
                )

            return result

        try:
            run_step(
                "odds_refresh",
                odds_refresh,
                sport_key=sport_key,
                regions=regions,
            )

            run_step(
                "resolve",
                odds_resolve_batch,
                sport_key=sport_key,
                assume_league_id=league_id,
                season_policy=season_policy,
                fixed_season=fixed_season,
                tol_hours=tol_hours,
                hours_ahead=hours_ahead,
                limit=500,
            )

            run_step(
                "models",
                ensure_models_1x2_v1,
                only_sport_key=sport_key,
                max_seasons=3,
                min_fixtures=120,
                C=1.0,
            )

            run_step(
                "snapshots",
                snapshots_materialize,
                sport_key=sport_key,
                mode="window",
                hours_ahead=hours_ahead,
                limit=500,
                model_version=active_model_version,
            )

        except Exception as exc:
            item["ok"] = False
            item["exception"] = {
                "type": type(exc).__name__,
                "message": str(exc),
                "traceback": traceback.format_exc(),
            }

        item["timing_ms"]["total"] = int((time.perf_counter() - item_started) * 1000)

        if item["ok"]:
            succeeded_count += 1
        else:
            failed_count += 1

        items.append(item)

    counters = {
        "count": len(items),
        "succeeded_count": succeeded_count,
        "failed_count": failed_count,
        "only_sport_key": only_sport_key,
    }

    return {
        "ok": failed_count == 0,
        "only_sport_key": only_sport_key,
        "model_version": active_model_version,
        "items": items,
        "count": len(items),
        "succeeded_count": succeeded_count,
        "failed_count": failed_count,
        "counters": counters,
    }