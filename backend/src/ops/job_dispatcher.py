from __future__ import annotations

from typing import Callable, Dict, List

from src.ops.jobs.odds_catalog_sync import sync_odds_sport_catalog
from src.ops.jobs.odds_league_autoclassify import odds_league_autoclassify
from src.ops.jobs.odds_league_gap_scan import odds_league_gap_scan
from src.ops.jobs.odds_refresh import odds_refresh
from src.ops.jobs.odds_resolve import odds_resolve_batch
from src.ops.jobs.pipeline_run_all import pipeline_run_all
from src.ops.jobs.snapshots_materialize import snapshots_materialize
from src.ops.jobs.update_pipeline import update_pipeline_run

JobCallable = Callable[..., dict]

JOB_DISPATCH: Dict[str, JobCallable] = {
    "odds_catalog_sync": sync_odds_sport_catalog,
    "odds_league_gap_scan": odds_league_gap_scan,
    "odds_league_autoclassify": odds_league_autoclassify,
    "odds_refresh": odds_refresh,
    "odds_resolve_batch": odds_resolve_batch,
    "snapshots_materialize": snapshots_materialize,
    "update_pipeline_run": update_pipeline_run,
    "pipeline_run_all": pipeline_run_all,
}


def list_job_keys() -> List[str]:
    return sorted(JOB_DISPATCH.keys())


def get_job_callable(job_key: str) -> JobCallable | None:
    return JOB_DISPATCH.get(str(job_key or "").strip())