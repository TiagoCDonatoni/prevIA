from __future__ import annotations
from fastapi import APIRouter
from src.ops.job_runner import run_job
from src.ops.jobs.odds_catalog_sync import sync_odds_sport_catalog

router = APIRouter(prefix="/admin/odds/catalog", tags=["admin_odds_catalog"])

@router.post("/sync")
def admin_sync_odds_catalog():
  res = run_job("odds_catalog_sync", sync_odds_sport_catalog)
  if not res.ok:
    return {"ok": False, "job": res.job_name, "elapsed_sec": res.elapsed_sec, "error": res.error}
  return {"ok": True, "job": res.job_name, "elapsed_sec": res.elapsed_sec, "counters": res.counters}