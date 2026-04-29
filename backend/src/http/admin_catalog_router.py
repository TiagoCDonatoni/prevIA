from __future__ import annotations
from fastapi import APIRouter, Depends
from src.ops.job_runner import run_job
from src.ops.jobs.odds_catalog_sync import sync_odds_sport_catalog
from src.internal_access.guards import require_admin_access

router = APIRouter(
    prefix="/admin/odds/catalog",
    tags=["admin_odds_catalog"],
    dependencies=[Depends(require_admin_access)],
)

@router.post("/sync")
def admin_sync_odds_catalog(all_sports: bool = True):
    res = run_job("odds_catalog_sync", sync_odds_sport_catalog, all_sports=all_sports)
    return {
        "ok": res.ok,
        "job": res.job_name,
        "run_id": res.run_id,
        "attempt_id": res.attempt_id,
        "status": res.status,
        "elapsed_sec": res.elapsed_sec,
        "counters": res.counters,
        "error": res.error,
        "blocked_reason": res.blocked_reason,
    }