from __future__ import annotations

from typing import Callable, Dict, List

from src.ops.jobs.audit_sync import audit_sync_from_product_snapshots
from src.ops.jobs.models_ensure_1x2_v1 import ensure_models_1x2_v1
from src.ops.jobs.odds_catalog_sync import sync_odds_sport_catalog
from src.ops.jobs.odds_league_autoclassify import odds_league_autoclassify
from src.ops.jobs.odds_league_gap_scan import odds_league_gap_scan
from src.ops.jobs.odds_refresh import odds_refresh
from src.ops.jobs.odds_resolve import odds_resolve_batch
from src.ops.jobs.oddspapi_enrichment import oddspapi_run_controlled_enrichment
from src.ops.jobs.pipeline_run_all import pipeline_run_all
from src.ops.jobs.snapshots_materialize import snapshots_materialize
from src.ops.jobs.update_pipeline import update_pipeline_run, update_pipeline_run_shard
from src.ops.jobs.worldcup_pool_results_sync import worldcup_pool_results_sync
from src.ops.jobs.worldcup_pool_fixture_mapping_sync import worldcup_pool_fixture_mapping_sync

JobCallable = Callable[..., dict]

JOB_DISPATCH: Dict[str, JobCallable] = {
    "audit_sync_from_product_snapshots": audit_sync_from_product_snapshots,
    "models_ensure_1x2_v1": ensure_models_1x2_v1,
    "odds_catalog_sync": sync_odds_sport_catalog,
    "odds_league_autoclassify": odds_league_autoclassify,
    "odds_league_gap_scan": odds_league_gap_scan,
    "odds_refresh": odds_refresh,
    "odds_resolve_batch": odds_resolve_batch,
    "oddspapi_run_controlled_enrichment": oddspapi_run_controlled_enrichment,
    "pipeline_run_all": pipeline_run_all,
    "snapshots_materialize": snapshots_materialize,
    "update_pipeline_run": update_pipeline_run,
    "update_pipeline_run_shard": update_pipeline_run_shard,
    "worldcup_pool_results_sync": worldcup_pool_results_sync,
    "worldcup_pool_fixture_mapping_sync": worldcup_pool_fixture_mapping_sync,
}


def list_job_keys() -> List[str]:
    return sorted(JOB_DISPATCH.keys())


def get_job_callable(job_key: str) -> JobCallable | None:
    return JOB_DISPATCH.get(str(job_key or "").strip())