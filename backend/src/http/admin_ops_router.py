from __future__ import annotations

from fastapi import APIRouter, Body, Depends, Query, HTTPException

from time import perf_counter
from typing import Any, Callable, Dict, Optional
import json
import re
import unicodedata

from src.ops.job_runner import run_job
from src.ops.jobs.odds_catalog_sync import sync_odds_sport_catalog
from src.ops.jobs.odds_refresh import odds_refresh
from src.ops.jobs.odds_resolve import odds_resolve_batch
from src.ops.jobs.snapshots_materialize import snapshots_materialize
from src.ops.jobs.pipeline_run_all import pipeline_run_all
from src.ops.jobs.odds_league_gap_scan import odds_league_gap_scan
from src.db.pg import pg_conn
from src.ops.jobs.odds_league_autoclassify import odds_league_autoclassify
from src.ops.jobs.update_pipeline import update_pipeline_run
from src.internal_access.guards import require_admin_access

from src.core.season_policy import (
    current_operational_window,
    current_year_utc,
    fixed_season_should_reduce_confidence,
    resolve_candidate_seasons,
)

from src.core.settings import load_settings
from src.odds.provider_usage import (
    ENDPOINT_GROUP_REST,
    PROVIDER_ODDSPAPI,
    get_provider_usage_status,
)

from src.ops.jobs.oddspapi_enrichment import (
    oddspapi_batch_write_1x2_mapped_events,
    oddspapi_bookmakers_diagnostic,
    oddspapi_enrichment_dry_run,
    oddspapi_enrichment_events_status,
    oddspapi_fixture_match_diagnostic,
    oddspapi_manual_confirm_mapping,
    oddspapi_odds_diagnostic,
    oddspapi_write_1x2_snapshots,
)

router = APIRouter(
    prefix="/admin/ops",
    tags=["admin-ops"],
    dependencies=[Depends(require_admin_access)],
)

def _format_job_response(
    *,
    ok: bool,
    job_name: str,
    elapsed_sec: float,
    counters: Dict[str, Any] | None = None,
    error: str | None = None,
    run_id: int | None = None,
    attempt_id: int | None = None,
    status: str | None = None,
    blocked_reason: str | None = None,
    execution_mode: str = "job_runner",
    fallback_reason: str | None = None,
) -> Dict[str, Any]:
    return {
        "ok": ok,
        "job": job_name,
        "run_id": run_id,
        "attempt_id": attempt_id,
        "status": status or ("completed" if ok else "failed"),
        "elapsed_sec": elapsed_sec,
        "counters": counters or {},
        "error": error,
        "blocked_reason": blocked_reason,
        "execution_mode": execution_mode,
        "fallback_reason": fallback_reason,
    }

def _iso_dt(value: Any) -> str | None:
    if value is None:
        return None
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return str(value)


def _json_value(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, (dict, list)):
        return value
    if isinstance(value, str):
        try:
            return json.loads(value)
        except Exception:
            return value
    return value

def _should_fallback_to_direct_execution(exc: Exception) -> bool:
    message = str(exc or "").lower()
    fallback_tokens = [
        'relation "ops.',
        "ops.ops_job_definitions",
        "ops.ops_job_scope_overrides",
        "ops.ops_feature_flags",
        "ops.ops_job_runs",
        "ops.ops_job_attempts",
        "ops.ops_job_events",
    ]
    return any(token in message for token in fallback_tokens)


def _run_job_direct(
    job_name: str,
    job_fn: Callable[..., Dict[str, Any]],
    *,
    fallback_reason: str | None = None,
    **job_kwargs: Any,
) -> Dict[str, Any]:
    t0 = perf_counter()

    try:
        raw_result = job_fn(**job_kwargs) or {}
        counters = raw_result if isinstance(raw_result, dict) else {"result": raw_result}
        ok = bool(counters.get("ok", True))
        error = None if ok else str(counters.get("error") or "job_returned_not_ok")
        status = "completed_direct" if ok else "failed_direct"
        return _format_job_response(
            ok=ok,
            job_name=job_name,
            run_id=None,
            attempt_id=None,
            status=status,
            elapsed_sec=round(perf_counter() - t0, 6),
            counters=counters,
            error=error,
            blocked_reason=None,
            execution_mode="direct_fallback",
            fallback_reason=fallback_reason,
        )
    except Exception as exc:
        return _format_job_response(
            ok=False,
            job_name=job_name,
            run_id=None,
            attempt_id=None,
            status="failed_direct",
            elapsed_sec=round(perf_counter() - t0, 6),
            counters={},
            error=f"direct_execution_failed: {exc}",
            blocked_reason=None,
            execution_mode="direct_fallback",
            fallback_reason=fallback_reason or str(exc),
        )


def _run_admin_job(
    job_name: str,
    job_fn: Callable[..., Dict[str, Any]],
    **job_kwargs: Any,
) -> Dict[str, Any]:
    try:
        res = run_job(job_name, job_fn, **job_kwargs)
    except Exception as exc:
        if _should_fallback_to_direct_execution(exc):
            return _run_job_direct(
                job_name,
                job_fn,
                fallback_reason=f"job_runner_exception: {exc}",
                **job_kwargs,
            )
        raise

    if res.error == f"job_definition_not_found: {job_name}":
        return _run_job_direct(
            job_name,
            job_fn,
            fallback_reason=res.error,
            **job_kwargs,
        )

    return _format_job_response(
        ok=res.ok,
        job_name=res.job_name,
        run_id=res.run_id,
        attempt_id=res.attempt_id,
        status=res.status,
        elapsed_sec=res.elapsed_sec,
        counters=res.counters,
        error=res.error,
        blocked_reason=res.blocked_reason,
        execution_mode="job_runner",
    )

def _norm_text(value: str | None) -> str:
    s = (value or "").strip().lower()
    s = unicodedata.normalize("NFKD", s)
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    s = s.replace("&", " and ")
    s = re.sub(r"[^a-z0-9]+", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s

def _sport_key_country_hint(sport_key: str) -> str | None:
    parts = (sport_key or "").split("_")
    if len(parts) >= 3 and parts[0] == "soccer":
        return parts[1]
    return None


def _sport_key_competition_hint(sport_key: str) -> str | None:
    parts = (sport_key or "").split("_")
    if len(parts) >= 4 and parts[0] == "soccer":
        return _norm_text(" ".join(parts[2:]))
    return None


def _dedupe_keep_order(values: list[str]) -> list[str]:
    seen = set()
    out: list[str] = []
    for v in values:
        key = (v or "").strip()
        if not key or key in seen:
            continue
        seen.add(key)
        out.append(key)
    return out


def _extract_competition_candidates_and_country(
    sport_key: str,
    sport_title: str | None,
    sport_group: str | None,
) -> tuple[list[str], str | None]:
    title = (sport_title or "").strip()

    if (sport_group or "").lower() != "soccer":
        base = _norm_text(title or sport_key)
        return ([base] if base else []), None

    country_norm = _norm_text(_sport_key_country_hint(sport_key))
    candidates: list[str] = []

    title_norm = _norm_text(title)
    if title_norm:
        candidates.append(title_norm)

    if " - " in title:
        left, right = title.split(" - ", 1)
        left_norm = _norm_text(left)
        right_norm = _norm_text(right)

        # Para soccer, assumimos padrão "Country - Competition"
        if left_norm and not country_norm:
            country_norm = left_norm

        if right_norm:
            candidates.append(right_norm)

    if country_norm and title_norm.startswith(country_norm + " "):
        stripped = title_norm[len(country_norm):].strip()
        if stripped:
            candidates.append(stripped)

    sport_key_comp = _sport_key_competition_hint(sport_key)
    if sport_key_comp:
        candidates.append(sport_key_comp)

    candidates = _dedupe_keep_order(candidates)
    return candidates, (country_norm or None)

def _serialize_league_candidate(match: tuple[Any, Any, Any, Any], match_reason: str, rank: int) -> dict:
    return {
        "league_id": int(match[0]),
        "name": str(match[1]),
        "country_name": str(match[2]) if match[2] is not None else None,
        "country_code": str(match[3]).upper() if match[3] is not None else None,
        "match_reason": match_reason,
        "rank": int(rank),
    }

def _extract_artifact_years(artifact_filename: str | None) -> list[int]:
    import re

    if not artifact_filename:
        return []

    years = []
    for token in re.findall(r"(?:19|20)\d{2}", str(artifact_filename)):
        try:
            years.append(int(token))
        except Exception:
            continue

    return sorted(set(years), reverse=True)


def _build_league_resolution_preview(cur, sport_key: str, limit: int = 5) -> dict:
    cur.execute(
        """
        select
          m.sport_key,
          c.sport_title,
          c.sport_group,
          m.league_id,
          m.mapping_status
        from odds.odds_league_map m
        join odds.odds_sport_catalog c on c.sport_key = m.sport_key
        where m.sport_key = %(sport_key)s
        """,
        {"sport_key": sport_key},
    )
    row = cur.fetchone()
    if not row:
        return {"ok": False, "sport_key": sport_key, "reason": "not_found", "candidates": []}

    current_league_id = int(row[3] or 0)
    current_mapping_status = str(row[4] or "")

    competition_candidates, country_norm = _extract_competition_candidates_and_country(
        sport_key=row[0],
        sport_title=row[1],
        sport_group=row[2],
    )

    cur.execute(
        """
        select
          league_id,
          name,
          country_name,
          country_code
        from core.leagues
        order by league_id
        """
    )
    leagues = cur.fetchall() or []

    exact_matches = []
    name_only_matches = []

    for lg in leagues:
        league_id = int(lg[0])
        league_name_norm = _norm_text(lg[1])
        country_name_norm = _norm_text(lg[2])

        if league_name_norm in competition_candidates and country_norm and country_norm == country_name_norm:
            exact_matches.append((league_id, lg[1], lg[2], lg[3]))
        elif league_name_norm in competition_candidates:
            name_only_matches.append((league_id, lg[1], lg[2], lg[3]))

    candidates = []
    seen_ids: set[int] = set()
    rank = 0
    for match_reason, bucket in (("exact_name_country", exact_matches), ("unique_name", name_only_matches)):
        for match in bucket:
            league_id = int(match[0])
            if league_id in seen_ids:
                continue
            seen_ids.add(league_id)
            rank += 1
            candidates.append(_serialize_league_candidate(match, match_reason, rank))
            if len(candidates) >= max(1, int(limit)):
                break
        if len(candidates) >= max(1, int(limit)):
            break

    suggested_candidate = None
    reason = "no_match"
    can_auto_resolve = False

    if current_league_id > 0:
        suggested_candidate = {
            "league_id": current_league_id,
            "name": None,
            "country_name": None,
            "country_code": None,
            "match_reason": "already_resolved",
            "rank": 1,
        }
        reason = "already_resolved"
        can_auto_resolve = True
    elif len(exact_matches) == 1:
        suggested_candidate = _serialize_league_candidate(exact_matches[0], "exact_name_country", 1)
        reason = "exact_name_country"
        can_auto_resolve = True
    elif len(exact_matches) > 1:
        reason = "ambiguous_exact_matches"
    elif len(name_only_matches) == 1:
        suggested_candidate = _serialize_league_candidate(name_only_matches[0], "unique_name", 1)
        reason = "unique_name"
        can_auto_resolve = True
    elif len(name_only_matches) > 1:
        reason = "ambiguous_name_matches"

    return {
        "ok": True,
        "sport_key": str(row[0]),
        "sport_title": str(row[1]) if row[1] is not None else None,
        "sport_group": str(row[2]) if row[2] is not None else None,
        "current_league_id": current_league_id,
        "current_mapping_status": current_mapping_status or None,
        "competition_candidates": competition_candidates,
        "country_hint": country_norm,
        "reason": reason,
        "can_auto_resolve": can_auto_resolve,
        "suggested_candidate": suggested_candidate,
        "candidates": candidates,
    }


def _auto_resolve_single_league(cur, sport_key: str) -> dict:
    preview = _build_league_resolution_preview(cur, sport_key, limit=10)
    if not preview.get("ok"):
        return preview

    current_league_id = int(preview.get("current_league_id") or 0)
    if current_league_id > 0:
        return {
            "ok": True,
            "sport_key": sport_key,
            "league_id": current_league_id,
            "reason": "already_resolved",
            "suggested_candidate": preview.get("suggested_candidate"),
        }

    suggested_candidate = preview.get("suggested_candidate") or {}
    if not preview.get("can_auto_resolve") or int(suggested_candidate.get("league_id") or 0) <= 0:
        return {
            "ok": False,
            "sport_key": sport_key,
            "reason": str(preview.get("reason") or "no_match"),
            "competition_candidates": preview.get("competition_candidates") or [],
            "country_hint": preview.get("country_hint"),
            "candidates": preview.get("candidates") or [],
        }

    league_id = int(suggested_candidate["league_id"])
    match_reason = str(suggested_candidate.get("match_reason") or "")

    if match_reason == "exact_name_country":
        confidence = 0.99
        notes = "auto-resolved by exact name+country"
    else:
        confidence = 0.85
        notes = "auto-resolved by unique name"

    mapping_source = "auto_high_conf" if (confidence or 0) >= 0.95 else "auto_low_conf"

    cur.execute(
        """
        update odds.odds_league_map
        set
          league_id = %(league_id)s,
          mapping_status = 'approved',
          mapping_source = %(mapping_source)s,
          confidence = %(confidence)s,
          notes = %(notes)s,
          updated_at_utc = now()
        where sport_key = %(sport_key)s
        """,
        {
            "sport_key": sport_key,
            "league_id": league_id,
            "mapping_source": mapping_source,
            "confidence": confidence,
            "notes": notes,
        },
    )

    return {
        "ok": True,
        "sport_key": sport_key,
        "league_id": league_id,
        "reason": "resolved",
        "confidence": confidence,
        "notes": notes,
        "suggested_candidate": suggested_candidate,
    }

@router.get("/odds/enrichment/oddspapi/status")
def admin_ops_oddspapi_enrichment_status():
    settings = load_settings()

    with pg_conn() as conn:
        status = get_provider_usage_status(
            conn,
            provider=PROVIDER_ODDSPAPI,
            endpoint_group=ENDPOINT_GROUP_REST,
            hard_cap=settings.oddspapi_monthly_hard_cap,
            reserve=settings.oddspapi_monthly_reserve,
        )
        conn.commit()

    operational_cap = int(status.get("operational_cap") or 0)
    request_count = int(status.get("request_count") or 0)

    return {
        "ok": bool(status.get("ok")),
        "provider": PROVIDER_ODDSPAPI,
        "mode": "bookmaker_enrichment",
        "source_of_truth": "current_primary_provider",
        "enabled": bool(settings.oddspapi_enrichment_enabled),
        "api_key_set": bool(settings.oddspapi_api_key),
        "base_url": settings.oddspapi_base_url,
        "usage": {
            "month_start_utc": status.get("month_start_utc"),
            "request_count": request_count,
            "hard_cap": int(status.get("hard_cap") or settings.oddspapi_monthly_hard_cap),
            "reserve": int(status.get("reserve") or settings.oddspapi_monthly_reserve),
            "operational_cap": operational_cap,
            "remaining_operational": int(status.get("remaining_operational") or 0),
            "is_capped": bool(status.get("is_capped")),
        },
        "bookmakers": {
            "primary": settings.oddspapi_primary_bookmakers,
            "secondary": settings.oddspapi_secondary_bookmakers,
        },
        "last_request": {
            "endpoint": status.get("last_endpoint"),
            "at_utc": status.get("last_request_at_utc"),
            "status": status.get("last_status"),
            "error": status.get("last_error"),
        },
        "policy": {
            "runs_inside_pipeline_run_all": False,
            "runs_in_realtime_product": False,
            "creates_events": False,
            "updates_event_metadata": False,
            "writes_snapshots_only": True,
            "eligible_events": {
                "sport": "soccer",
                "window_hours_ahead": 72,
                "requires_core_resolved_fixture": True,
                "skip_started_or_finished": True,
            },
        },
    }

@router.get("/odds/enrichment/oddspapi/dry-run")
def admin_ops_oddspapi_enrichment_dry_run(
    window_hours: int = Query(default=72, ge=1, le=72),
    limit: int = Query(default=50, ge=1, le=200),
    respect_refresh_log: bool = Query(default=True),
):
    return oddspapi_enrichment_dry_run(
        window_hours=window_hours,
        limit=limit,
        respect_refresh_log=respect_refresh_log,
    )


@router.post("/odds/enrichment/oddspapi/diagnostics/fixture-match")
def admin_ops_oddspapi_fixture_match_diagnostic(
    window_hours: int = Query(default=72, ge=1, le=72),
    max_candidates: int = Query(default=10, ge=1, le=25),
    min_score: float = Query(default=0.65, ge=0.0, le=1.0),
):
    return oddspapi_fixture_match_diagnostic(
        window_hours=window_hours,
        max_candidates=max_candidates,
        min_score=min_score,
    )


@router.post("/odds/enrichment/oddspapi/mappings/manual-confirm")
def admin_ops_oddspapi_manual_confirm_mapping(
    payload: Dict[str, Any] = Body(...),
):
    return oddspapi_manual_confirm_mapping(
        payload=payload,
    )

@router.post("/odds/enrichment/oddspapi/diagnostics/odds")
def admin_ops_oddspapi_odds_diagnostic(
    core_fixture_id: Optional[int] = Query(default=None),
    include_raw: bool = Query(default=False),
    verbosity: int = Query(default=2, ge=1, le=5),
):
    return oddspapi_odds_diagnostic(
        core_fixture_id=core_fixture_id,
        include_raw=include_raw,
        verbosity=verbosity,
    )

@router.post("/odds/enrichment/oddspapi/write/1x2")
def admin_ops_oddspapi_write_1x2_snapshots(
    core_fixture_id: Optional[int] = Query(default=None),
    allowed_bookmakers: Optional[str] = Query(default=None),
    max_bookmakers: int = Query(default=10, ge=1, le=40),
    dry_run: bool = Query(default=True),
    force: bool = Query(default=False),
    verbosity: int = Query(default=2, ge=1, le=5),
):
    return oddspapi_write_1x2_snapshots(
        core_fixture_id=core_fixture_id,
        allowed_bookmakers=allowed_bookmakers,
        max_bookmakers=max_bookmakers,
        dry_run=dry_run,
        force=force,
        verbosity=verbosity,
    )

@router.get("/odds/enrichment/oddspapi/events/status")
def admin_ops_oddspapi_enrichment_events_status(
    core_fixture_id: Optional[int] = Query(default=None),
    canonical_event_id: Optional[str] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
):
    return oddspapi_enrichment_events_status(
        core_fixture_id=core_fixture_id,
        canonical_event_id=canonical_event_id,
        limit=limit,
    )

@router.post("/odds/enrichment/oddspapi/batch/1x2")
def admin_ops_oddspapi_batch_write_1x2_mapped_events(
    window_hours: int = Query(default=72, ge=1, le=72),
    max_events: int = Query(default=3, ge=1, le=50),
    max_external_requests: int = Query(default=3, ge=0, le=20),
    allowed_bookmakers: Optional[str] = Query(default=None),
    max_bookmakers_per_event: int = Query(default=10, ge=1, le=40),
    dry_run: bool = Query(default=True),
    force: bool = Query(default=False),
    verbosity: int = Query(default=2, ge=1, le=5),
):
    return oddspapi_batch_write_1x2_mapped_events(
        window_hours=window_hours,
        max_events=max_events,
        max_external_requests=max_external_requests,
        allowed_bookmakers=allowed_bookmakers,
        max_bookmakers_per_event=max_bookmakers_per_event,
        dry_run=dry_run,
        force=force,
        verbosity=verbosity,
    )

@router.post("/odds/refresh")
def admin_ops_odds_refresh(
    sport_key: str = Query(..., min_length=3),
    regions: str = Query(default="eu"),
):
    return _run_admin_job("odds_refresh", odds_refresh, sport_key=sport_key, regions=regions)


@router.post("/odds/resolve")
def admin_ops_odds_resolve(
    sport_key: str = Query(..., min_length=3),
    assume_league_id: int = Query(..., ge=1),
    season_policy: str = Query(default="current"),
    fixed_season: int | None = Query(default=None),
    tol_hours: int = Query(default=6, ge=0, le=168),
    hours_ahead: int = Query(default=720, ge=1, le=24 * 60),
    limit: int = Query(default=500, ge=1, le=5000),
):
    return _run_admin_job(
        "odds_resolve_batch",
        odds_resolve_batch,
        sport_key=sport_key,
        assume_league_id=assume_league_id,
        season_policy=season_policy,
        fixed_season=fixed_season,
        tol_hours=tol_hours,
        hours_ahead=hours_ahead,
        limit=limit,
    )


@router.post("/snapshots/materialize")
def admin_ops_snapshots_materialize(
    sport_key: str = Query(..., min_length=3),
    hours_ahead: int = Query(default=720, ge=1, le=24 * 60),
    limit: int = Query(default=500, ge=1, le=5000),
):
    return _run_admin_job(
        "snapshots_materialize",
        snapshots_materialize,
        sport_key=sport_key,
        mode="window",
        hours_ahead=hours_ahead,
        limit=limit,
    )


@router.post("/pipeline/run_all")
def admin_ops_pipeline_run_all(
    only_sport_key: str | None = Query(default=None),
):
    return _run_admin_job("pipeline_run_all", pipeline_run_all, only_sport_key=only_sport_key)


@router.post("/pipeline/run")
def admin_ops_pipeline_run(
    only_sport_key: str | None = Query(default=None),
):
    return _run_admin_job("update_pipeline_run", update_pipeline_run, only_sport_key=only_sport_key)

@router.get("/pipeline/health")
def admin_ops_pipeline_health(
    lookback_days: int = Query(default=5, ge=1, le=30),
):
    with pg_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                select max(fetched_at_utc)
                from raw.api_responses
                where provider = 'apifootball'
                  and endpoint = 'fixtures'
                  and ok = true
            """)
            raw_fixtures_last_ok_at_utc = cur.fetchone()[0]

            cur.execute("""
                select max(updated_at_utc)
                from core.fixtures
            """)
            core_fixtures_last_updated_at_utc = cur.fetchone()[0]

            cur.execute("""
                select max(updated_at_utc)
                from odds.odds_events
            """)
            odds_events_last_updated_at_utc = cur.fetchone()[0]

            cur.execute("""
                select max(captured_at_utc)
                from odds.odds_snapshots_1x2
            """)
            odds_snapshots_last_captured_at_utc = cur.fetchone()[0]

            cur.execute(
                """
                select
                  count(*) as fixtures_total,
                  count(*) filter (where is_finished = true) as fixtures_finished,
                  count(*) filter (
                    where goals_home is not null and goals_away is not null
                  ) as fixtures_with_goals,
                  count(*) filter (
                    where kickoff_utc < now()
                      and status_short = 'NS'
                  ) as fixtures_past_due_ns
                from core.fixtures
                where kickoff_utc >= now() - (%(lookback_days)s || ' days')::interval
                  and kickoff_utc <= now()
                """,
                {"lookback_days": int(lookback_days)},
            )
            row = cur.fetchone()

            cur.execute("""
                select
                  count(*) filter (
                    where updated_at_utc >= now() - interval '24 hours'
                      and status like 'failed%%'
                  ) as failed_24h,
                  count(*) filter (
                    where updated_at_utc >= now() - interval '7 days'
                      and status like 'failed%%'
                  ) as failed_7d
                from ops.ops_job_runs
            """)
            failed_row = cur.fetchone()

            cur.execute("""
                select
                  job_key,
                  run_id,
                  status,
                  scope_key,
                  sport_key,
                  started_at_utc,
                  finished_at_utc,
                  duration_ms,
                  error_json
                from (
                  select
                    run_id,
                    job_key,
                    status,
                    scope_key,
                    sport_key,
                    started_at_utc,
                    finished_at_utc,
                    duration_ms,
                    error_json,
                    row_number() over (
                      partition by job_key
                      order by run_id desc
                    ) as rn
                  from ops.ops_job_runs
                  where job_key in ('update_pipeline_run', 'pipeline_run_all')
                ) t
                where rn = 1
                order by job_key asc
            """)
            last_run_rows = cur.fetchall() or []

    last_runs: Dict[str, Any] = {
        "update_pipeline_run": None,
        "pipeline_run_all": None,
    }

    for r in last_run_rows:
        last_runs[str(r[0])] = {
            "run_id": int(r[1]),
            "status": str(r[2]),
            "scope_key": str(r[3]) if r[3] is not None else None,
            "sport_key": str(r[4]) if r[4] is not None else None,
            "started_at_utc": _iso_dt(r[5]),
            "finished_at_utc": _iso_dt(r[6]),
            "duration_ms": int(r[7]) if r[7] is not None else None,
            "error": _json_value(r[8]),
        }

    return {
        "ok": True,
        "generated_at_utc": _iso_dt(raw_fixtures_last_ok_at_utc) or _iso_dt(core_fixtures_last_updated_at_utc),
        "freshness": {
            "raw_fixtures_last_ok_at_utc": _iso_dt(raw_fixtures_last_ok_at_utc),
            "core_fixtures_last_updated_at_utc": _iso_dt(core_fixtures_last_updated_at_utc),
            "odds_events_last_updated_at_utc": _iso_dt(odds_events_last_updated_at_utc),
            "odds_snapshots_last_captured_at_utc": _iso_dt(odds_snapshots_last_captured_at_utc),
        },
        "core_checks": {
            "lookback_days": int(lookback_days),
            "fixtures_total": int(row[0] or 0),
            "fixtures_finished": int(row[1] or 0),
            "fixtures_with_goals": int(row[2] or 0),
            "fixtures_past_due_ns": int(row[3] or 0),
        },
        "failed_runs": {
            "last_24h": int(failed_row[0] or 0),
            "last_7d": int(failed_row[1] or 0),
        },
        "last_runs": last_runs,
    }

@router.get("/runs/recent")
def admin_ops_runs_recent(
    limit: int = Query(default=50, ge=1, le=200),
    job_key: str | None = Query(default=None),
    status: str | None = Query(default=None),
):
    sql = """
      select
        run_id,
        job_key,
        trigger_source,
        requested_by,
        scope_type,
        scope_key,
        sport_key,
        status,
        block_reason,
        result_json,
        counters_json,
        error_json,
        started_at_utc,
        finished_at_utc,
        duration_ms,
        updated_at_utc
      from ops.ops_job_runs
      where (%(job_key)s::text is null or job_key = %(job_key)s::text)
        and (%(status)s::text is null or status = %(status)s::text)
      order by run_id desc
      limit %(limit)s
    """

    with pg_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                sql,
                {
                    "limit": int(limit),
                    "job_key": job_key,
                    "status": status,
                },
            )
            rows = cur.fetchall() or []

    items = []
    for r in rows:
        items.append(
            {
                "run_id": int(r[0]),
                "job_key": str(r[1]),
                "trigger_source": str(r[2]) if r[2] is not None else None,
                "requested_by": str(r[3]) if r[3] is not None else None,
                "scope_type": str(r[4]) if r[4] is not None else None,
                "scope_key": str(r[5]) if r[5] is not None else None,
                "sport_key": str(r[6]) if r[6] is not None else None,
                "status": str(r[7]),
                "block_reason": str(r[8]) if r[8] is not None else None,
                "result": _json_value(r[9]),
                "counters": _json_value(r[10]),
                "error": _json_value(r[11]),
                "started_at_utc": _iso_dt(r[12]),
                "finished_at_utc": _iso_dt(r[13]),
                "duration_ms": int(r[14]) if r[14] is not None else None,
                "updated_at_utc": _iso_dt(r[15]),
            }
        )

    return {"ok": True, "items": items, "count": len(items)}

@router.get("/runs/{run_id}/events")
def admin_ops_run_events(
    run_id: int,
    limit: int = Query(default=200, ge=1, le=1000),
):
    sql = """
      select
        attempt_id,
        event_type,
        event_level,
        message,
        payload_json,
        created_at_utc
      from ops.ops_job_events
      where run_id = %(run_id)s
      order by created_at_utc asc
      limit %(limit)s
    """

    with pg_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, {"run_id": int(run_id), "limit": int(limit)})
            rows = cur.fetchall() or []

    items = []
    for r in rows:
        items.append(
            {
                "attempt_id": int(r[0]) if r[0] is not None else None,
                "event_type": str(r[1]),
                "event_level": str(r[2]),
                "message": str(r[3]) if r[3] is not None else None,
                "payload": _json_value(r[4]),
                "created_at_utc": _iso_dt(r[5]),
            }
        )

    return {
        "ok": True,
        "run_id": int(run_id),
        "items": items,
        "count": len(items),
    }

@router.post("/odds/league_map/gap_scan")
def admin_ops_league_map_gap_scan(default_enabled: bool = False):
    return _run_admin_job("odds_league_gap_scan", odds_league_gap_scan, default_enabled=default_enabled)

@router.get("/odds/league_map/pending")
def admin_ops_league_map_pending(limit: int = 200):
    sql = """
      select
        m.sport_key,
        c.sport_title,
        c.sport_group,
        m.league_id,
        m.season_policy,
        m.fixed_season,
        m.regions,
        m.hours_ahead,
        m.tol_hours,
        m.enabled,
        m.mapping_status,
        m.confidence,
        m.notes,
        m.updated_at_utc
      from odds.odds_league_map m
      join odds.odds_sport_catalog c on c.sport_key = m.sport_key
      where m.mapping_status = 'pending'
      order by c.sport_group nulls last, c.sport_title
      limit %(limit)s
    """
    items = []
    with pg_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, {"limit": int(limit)})
            rows = cur.fetchall() or []

    for r in rows:
        enabled = bool(r[9])
        mapping_status = r[10]
        league_id = int(r[3] or 0)

        if enabled and league_id > 0:
            computed_status = "approved"
        elif enabled and league_id <= 0:
            computed_status = "incomplete"
        elif mapping_status == "pending" or league_id <= 0:
            computed_status = "pending"
        else:
            computed_status = "disabled"

        items.append(
            {
                "sport_key": r[0],
                "sport_title": r[1],
                "sport_group": r[2],
                "league_id": league_id,
                "season_policy": r[4],
                "fixed_season": r[5],
                "regions": r[6],
                "hours_ahead": r[7],
                "tol_hours": r[8],
                "enabled": enabled,
                "mapping_status": mapping_status,
                "computed_status": computed_status,
                "confidence": float(r[11]) if r[11] is not None else None,
                "notes": r[12],
                "updated_at_utc": r[13].isoformat() if hasattr(r[13], "isoformat") else str(r[13]),
            }
        )

    return {"ok": True, "items": items, "count": len(items)}

@router.post("/odds/league_map/autoclassify")
def admin_ops_league_map_autoclassify():
    return _run_admin_job("odds_league_autoclassify", odds_league_autoclassify)

@router.post("/odds/league_map/discover_candidates")
def admin_ops_league_map_discover_candidates(
    default_enabled: bool = False,
    auto_resolve: bool = True,
    all_sports: bool = True,
):
    catalog_sync = _run_admin_job(
        "odds_catalog_sync",
        sync_odds_sport_catalog,
        all_sports=all_sports,
    )
    gap_scan = _run_admin_job(
        "odds_league_gap_scan",
        odds_league_gap_scan,
        default_enabled=default_enabled,
    )
    autoclassify = _run_admin_job("odds_league_autoclassify", odds_league_autoclassify)

    auto_resolve_result: Dict[str, Any] = {
        "ok": True,
        "skipped": not bool(auto_resolve),
        "count": 0,
        "resolved_count": 0,
        "already_resolved_count": 0,
        "failed_count": 0,
        "items": [],
    }

    if auto_resolve:
        with pg_conn() as conn:
            conn.autocommit = False
            with conn.cursor() as cur:
                cur.execute(
                    """
                    select m.sport_key
                    from odds.odds_league_map m
                    join odds.odds_sport_catalog c on c.sport_key = m.sport_key
                    where coalesce(m.league_id, 0) = 0
                      and m.mapping_status = 'pending'
                      and c.sport_group = 'Soccer'
                      and m.sport_key like 'soccer_%'
                    order by m.sport_key
                    """
                )
                sport_keys = [r[0] for r in (cur.fetchall() or [])]

                items = []
                resolved_count = 0
                already_resolved_count = 0
                failed_count = 0

                for sport_key in sport_keys:
                    out = _auto_resolve_single_league(cur, sport_key)
                    items.append(out)

                    if out.get("reason") == "resolved":
                        resolved_count += 1
                    elif out.get("reason") == "already_resolved":
                        already_resolved_count += 1
                    else:
                        failed_count += 1

            conn.commit()

        auto_resolve_result = {
            "ok": True,
            "skipped": False,
            "count": len(sport_keys),
            "resolved_count": resolved_count,
            "already_resolved_count": already_resolved_count,
            "failed_count": failed_count,
            "items": items,
        }

    return {
        "ok": bool(catalog_sync.get("ok"))
        and bool(gap_scan.get("ok"))
        and bool(autoclassify.get("ok"))
        and bool(auto_resolve_result.get("ok", True)),
        "steps": {
            "catalog_sync": catalog_sync,
            "gap_scan": gap_scan,
            "autoclassify": autoclassify,
            "auto_resolve": auto_resolve_result,
        },
        "summary": {
            "catalog_upserted": int((catalog_sync.get("counters") or {}).get("catalog_upserted") or 0),
            "sports_seen": int((catalog_sync.get("counters") or {}).get("sports_seen") or 0),
            "all_sports": bool((catalog_sync.get("counters") or {}).get("all_sports") or False),
            "inserted": int((gap_scan.get("counters") or {}).get("inserted") or 0),
            "inserted_pending": int((gap_scan.get("counters") or {}).get("inserted_pending") or 0),
            "inserted_ignored": int((gap_scan.get("counters") or {}).get("inserted_ignored") or 0),
            "ignored": int((autoclassify.get("counters") or {}).get("ignored") or 0),
            "resolved_count": int(auto_resolve_result.get("resolved_count") or 0),
            "already_resolved_count": int(auto_resolve_result.get("already_resolved_count") or 0),
            "failed_count": int(auto_resolve_result.get("failed_count") or 0),
        },
    }


@router.get("/odds/league_map/suggestions")
def admin_ops_league_map_suggestions(
    sport_key: str = Query(..., min_length=3),
    limit: int = Query(default=5, ge=1, le=20),
):
    with pg_conn() as conn:
        with conn.cursor() as cur:
            preview = _build_league_resolution_preview(cur, sport_key, limit=limit)

    if not preview.get("ok"):
        raise HTTPException(status_code=404, detail=preview)

    return preview

@router.post("/odds/league_map/approve")
def admin_ops_league_map_approve(
    sport_key: str,
    league_id: int,
    official_name: str,
    official_country_code: str | None = None,
    regions: str = "eu",
    hours_ahead: int = 720,
    tol_hours: int = 6,
    season_policy: str = "current",
    fixed_season: int | None = None,
    enabled: bool = True,
):
    """
    Aprova um mapeamento: seta league_id + metadados oficiais + params e marca approved.
    """
    if not sport_key or not isinstance(sport_key, str):
        return {"ok": False, "error": "sport_key_required"}
    if league_id is None or int(league_id) <= 0:
        return {"ok": False, "error": "league_id_must_be_positive"}

    official_name_clean = str(official_name or "").strip()
    if not official_name_clean:
        return {"ok": False, "error": "official_name_required"}

    official_country_code_clean = None
    if official_country_code is not None:
        value = str(official_country_code).strip().upper()
        official_country_code_clean = value if value else None

    sql = """
      update odds.odds_league_map
      set
        league_id = %(league_id)s,
        official_name = %(official_name)s,
        official_country_code = %(official_country_code)s,
        regions = %(regions)s,
        hours_ahead = %(hours_ahead)s,
        tol_hours = %(tol_hours)s,
        season_policy = %(season_policy)s,
        fixed_season = %(fixed_season)s,
        enabled = %(enabled)s,
        mapping_status = 'approved',
        mapping_source = 'manual',
        confidence = 1.0,
        updated_at_utc = now()
      where sport_key = %(sport_key)s
        and mapping_status in ('pending','approved')
      returning
        sport_key,
        league_id,
        official_name,
        official_country_code,
        mapping_status,
        enabled
    """

    with pg_conn() as conn:
        conn.autocommit = False
        with conn.cursor() as cur:
            cur.execute(
                sql,
                {
                    "sport_key": sport_key,
                    "league_id": int(league_id),
                    "official_name": official_name_clean,
                    "official_country_code": official_country_code_clean,
                    "regions": regions,
                    "hours_ahead": int(hours_ahead),
                    "tol_hours": int(tol_hours),
                    "season_policy": season_policy,
                    "fixed_season": fixed_season,
                    "enabled": bool(enabled),
                },
            )
            row = cur.fetchone()
        conn.commit()

    if not row:
        return {"ok": False, "error": "sport_key_not_found_or_not_pending"}

    return {
        "ok": True,
        "sport_key": row[0],
        "league_id": row[1],
        "official_name": row[2],
        "official_country_code": row[3],
        "mapping_status": row[4],
        "enabled": row[5],
    }

@router.get("/leagues")
def admin_ops_list_leagues():
    sql = """
      select
        m.sport_key,
        m.official_name,
        m.official_country_code,
        c.sport_title,
        c.sport_group,
        m.league_id,
        m.season_policy,
        m.fixed_season,
        m.regions,
        m.hours_ahead,
        m.tol_hours,
        m.enabled,
        m.mapping_status,
        m.confidence,
        m.notes,
        m.updated_at_utc
      from odds.odds_league_map m
      left join odds.odds_sport_catalog c on c.sport_key = m.sport_key
      order by
        m.enabled desc,
        c.sport_group nulls last,
        coalesce(nullif(btrim(m.official_name), ''), c.sport_title, m.sport_key),
        m.sport_key
    """

    items = []
    with pg_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql)
            rows = cur.fetchall() or []

    for r in rows:
        league_id = int(r[5] or 0)
        enabled = bool(r[11])
        mapping_status = str(r[12] or "")

        if enabled and mapping_status == "approved" and league_id > 0:
            computed_status = "approved"
        elif enabled and league_id <= 0:
            computed_status = "incomplete"
        elif mapping_status == "pending" or league_id <= 0:
            computed_status = "pending"
        else:
            computed_status = "disabled"

        items.append(
            {
                "sport_key": r[0],
                "official_name": r[1],
                "official_country_code": r[2],
                "sport_title": r[3] or r[0],
                "sport_group": r[4],
                "league_id": r[5],
                "season_policy": r[6],
                "fixed_season": r[7],
                "regions": r[8],
                "hours_ahead": r[9],
                "tol_hours": r[10],
                "enabled": r[11],
                "mapping_status": r[12],
                "computed_status": computed_status,
                "confidence": float(r[13]) if r[13] is not None else None,
                "notes": r[14],
                "updated_at_utc": r[15].isoformat() if hasattr(r[15], "isoformat") else str(r[15]),
            }
        )

    return {"ok": True, "items": items, "count": len(items)}

@router.post("/leagues/auto_resolve")
def admin_ops_auto_resolve_leagues(only_unresolved: bool = True):
    with pg_conn() as conn:
        conn.autocommit = False
        with conn.cursor() as cur:
            if only_unresolved:
                cur.execute(
                    """
                    select m.sport_key
                    from odds.odds_league_map m
                    join odds.odds_sport_catalog c on c.sport_key = m.sport_key
                    where coalesce(m.league_id, 0) = 0
                      and m.mapping_status = 'pending'
                      and c.sport_group = 'Soccer'
                      and m.sport_key like 'soccer_%'
                    order by m.sport_key
                    """
                )
            else:
                cur.execute(
                    """
                    select m.sport_key
                    from odds.odds_league_map m
                    order by m.sport_key
                    """
                )

            sport_keys = [r[0] for r in (cur.fetchall() or [])]

            items = []
            resolved_count = 0
            already_resolved_count = 0
            failed_count = 0

            for sport_key in sport_keys:
                out = _auto_resolve_single_league(cur, sport_key)
                items.append(out)

                if out.get("reason") == "resolved":
                    resolved_count += 1
                elif out.get("reason") == "already_resolved":
                    already_resolved_count += 1
                else:
                    failed_count += 1

        conn.commit()

    return {
        "ok": True,
        "count": len(sport_keys),
        "resolved_count": resolved_count,
        "already_resolved_count": already_resolved_count,
        "failed_count": failed_count,
        "items": items,
    }

@router.post("/leagues/toggle")
def admin_ops_toggle_league(
    sport_key: str,
    enabled: bool,
):
    with pg_conn() as conn:
        conn.autocommit = False
        with conn.cursor() as cur:
            if bool(enabled):
                resolve_out = _auto_resolve_single_league(cur, sport_key)
                if not resolve_out.get("ok"):
                    conn.rollback()
                    raise HTTPException(
                        status_code=400,
                        detail={
                            "code": "league_id_not_resolved",
                            "sport_key": sport_key,
                            "reason": resolve_out.get("reason"),
                            "resolver": resolve_out,
                        },
                    )

            cur.execute(
                """
                update odds.odds_league_map
                set
                  enabled = %(enabled)s,
                  updated_at_utc = now()
                where sport_key = %(sport_key)s
                returning sport_key, enabled, league_id
                """,
                {
                    "sport_key": sport_key,
                    "enabled": bool(enabled),
                },
            )
            row = cur.fetchone()

        conn.commit()

    if not row:
        raise HTTPException(status_code=404, detail="sport_key_not_found")

    return {
        "ok": True,
        "sport_key": row[0],
        "enabled": row[1],
        "league_id": row[2],
    }

@router.get("/pipeline/season-health")
def admin_ops_pipeline_season_health(
    only_sport_key: str | None = Query(default=None),
):
    current_year = current_year_utc()
    operational_window = current_operational_window()

    sql = """
      WITH latest_fixture_season AS (
        SELECT
          f.league_id,
          MAX(f.season) AS latest_core_season,
          COUNT(DISTINCT f.season) AS seasons_found,
          MAX(f.kickoff_utc) AS latest_kickoff_utc
        FROM core.fixtures f
        GROUP BY f.league_id
      ),
      snapshot_rollup AS (
        SELECT
          s.sport_key,
          COUNT(*) AS snapshots_count,
          MAX(s.updated_at_utc) AS latest_snapshot_updated_at_utc,
          MIN(NULLIF(s.payload #>> '{confidence,overall}', '')::numeric) AS min_confidence_overall,
          AVG(NULLIF(s.payload #>> '{confidence,overall}', '')::numeric) AS avg_confidence_overall,
          MAX(NULLIF(s.payload #>> '{inputs,season}', '')::int) AS max_snapshot_effective_season,
          MIN(NULLIF(s.payload #>> '{inputs,season}', '')::int) AS min_snapshot_effective_season
        FROM product.matchup_snapshot_v1 s
        GROUP BY s.sport_key
      )
      SELECT
        m.sport_key,
        m.league_id,
        COALESCE(l.name, m.sport_key) AS league_name,
        m.season_policy,
        m.fixed_season,
        m.artifact_filename,
        m.model_version,
        lfs.latest_core_season,
        lfs.seasons_found,
        lfs.latest_kickoff_utc,
        sr.snapshots_count,
        sr.latest_snapshot_updated_at_utc,
        sr.min_confidence_overall,
        sr.avg_confidence_overall,
        sr.min_snapshot_effective_season,
        sr.max_snapshot_effective_season
      FROM odds.odds_league_map m
      LEFT JOIN core.leagues l
        ON l.league_id = m.league_id
      LEFT JOIN latest_fixture_season lfs
        ON lfs.league_id = m.league_id
      LEFT JOIN snapshot_rollup sr
        ON sr.sport_key = m.sport_key
      WHERE m.enabled = true
        AND m.mapping_status = 'approved'
        AND (%(only_sport_key)s::text IS NULL OR m.sport_key = %(only_sport_key)s::text)
      ORDER BY m.sport_key
    """

    items = []

    with pg_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, {"only_sport_key": only_sport_key})
            rows = cur.fetchall() or []

    for row in rows:
        (
            sport_key,
            league_id,
            league_name,
            season_policy,
            fixed_season,
            artifact_filename,
            model_version,
            latest_core_season,
            seasons_found,
            latest_kickoff_utc,
            snapshots_count,
            latest_snapshot_updated_at_utc,
            min_confidence_overall,
            avg_confidence_overall,
            min_snapshot_effective_season,
            max_snapshot_effective_season,
        ) = row

        policy = str(season_policy or "current")
        fixed = int(fixed_season) if fixed_season is not None else None
        latest_core = int(latest_core_season) if latest_core_season is not None else None
        min_snapshot_season = int(min_snapshot_effective_season) if min_snapshot_effective_season is not None else None
        max_snapshot_season = int(max_snapshot_effective_season) if max_snapshot_effective_season is not None else None
        artifact_years = _extract_artifact_years(artifact_filename)

        try:
            candidate_seasons = resolve_candidate_seasons(
                season_policy=policy,
                fixed_season=fixed,
            )
        except Exception:
            candidate_seasons = []

        issues = []
        status = "OK"

        if policy == "current":
            if latest_core is None:
                issues.append("NO_CORE_FIXTURES")
            elif latest_core not in operational_window:
                issues.append("CORE_OUTSIDE_OPERATIONAL_WINDOW")

            if max_snapshot_season is None:
                issues.append("NO_SNAPSHOTS")
            else:
                if max_snapshot_season not in operational_window:
                    issues.append("SNAPSHOT_MAX_OUTSIDE_OPERATIONAL_WINDOW")
                if min_snapshot_season is not None and min_snapshot_season not in operational_window:
                    issues.append("SNAPSHOT_MIN_OUTSIDE_OPERATIONAL_WINDOW")

            if artifact_years:
                invalid_artifact_years = [y for y in artifact_years if y not in operational_window]
                if invalid_artifact_years:
                    issues.append("ARTIFACT_OUTSIDE_OPERATIONAL_WINDOW")

        elif policy == "fixed":
            if fixed is None:
                issues.append("FIXED_WITHOUT_FIXED_SEASON")
            elif fixed_season_should_reduce_confidence(fixed_season=fixed):
                issues.append("FIXED_SEASON_STALE")

            if artifact_years and fixed is not None and fixed not in artifact_years:
                issues.append("ARTIFACT_DOES_NOT_MATCH_FIXED_SEASON")

            if fixed is not None:
                if max_snapshot_season is not None and max_snapshot_season != fixed:
                    issues.append("SNAPSHOT_MAX_DOES_NOT_MATCH_FIXED_SEASON")
                if min_snapshot_season is not None and min_snapshot_season != fixed:
                    issues.append("SNAPSHOT_MIN_DOES_NOT_MATCH_FIXED_SEASON")

        else:
            issues.append("UNKNOWN_SEASON_POLICY")

        if min_confidence_overall is not None:
            try:
                if float(min_confidence_overall) < 0.55:
                    issues.append("LOW_MIN_CONFIDENCE")
            except Exception:
                pass

        if issues:
            status = "WARN"

        items.append(
            {
                "sport_key": str(sport_key),
                "league_id": int(league_id) if league_id is not None else None,
                "league_name": str(league_name),
                "season_policy": policy,
                "fixed_season": fixed,
                "candidate_seasons": candidate_seasons,
                "operational_window": operational_window,
                "latest_core_season": latest_core,
                "seasons_found": int(seasons_found) if seasons_found is not None else 0,
                "latest_kickoff_utc": latest_kickoff_utc.isoformat() if latest_kickoff_utc else None,
                "artifact_filename": str(artifact_filename) if artifact_filename else None,
                "artifact_years": artifact_years,
                "model_version": str(model_version) if model_version else None,
                "snapshots_count": int(snapshots_count) if snapshots_count is not None else 0,
                "latest_snapshot_updated_at_utc": (
                    latest_snapshot_updated_at_utc.isoformat()
                    if latest_snapshot_updated_at_utc
                    else None
                ),
                "min_snapshot_effective_season": min_snapshot_season,
                "max_snapshot_effective_season": max_snapshot_season,
                "min_confidence_overall": (
                    float(min_confidence_overall)
                    if min_confidence_overall is not None
                    else None
                ),
                "avg_confidence_overall": (
                    float(avg_confidence_overall)
                    if avg_confidence_overall is not None
                    else None
                ),
                "status": status,
                "issues": issues,
            }
        )

    summary = {
        "total": len(items),
        "ok": sum(1 for x in items if x["status"] == "OK"),
        "warn": sum(1 for x in items if x["status"] != "OK"),
        "issues": {},
    }

    for item in items:
        for issue in item["issues"]:
            summary["issues"][issue] = int(summary["issues"].get(issue, 0)) + 1

    return {
        "ok": True,
        "current_year": current_year,
        "operational_window": operational_window,
        "summary": summary,
        "items": items,
    }

@router.post("/pipeline/snapshots/cleanup-stale")
def admin_ops_cleanup_stale_snapshots(
    only_sport_key: str | None = Query(default=None),
    dry_run: bool = Query(default=True),
):
    operational_window = current_operational_window()

    sql_select = """
      WITH league_policy AS (
        SELECT
          sport_key,
          league_id,
          season_policy,
          fixed_season
        FROM odds.odds_league_map
        WHERE enabled = true
          AND mapping_status = 'approved'
          AND (%(only_sport_key)s::text IS NULL OR sport_key = %(only_sport_key)s::text)
      ),
      snapshot_rows AS (
        SELECT
          s.snapshot_id,
          s.sport_key,
          s.event_id,
          NULLIF(s.payload #>> '{inputs,season}', '')::int AS effective_season,
          lp.season_policy,
          lp.fixed_season
        FROM product.matchup_snapshot_v1 s
        JOIN league_policy lp
          ON lp.sport_key = s.sport_key
      )
      SELECT
        snapshot_id,
        sport_key,
        event_id,
        effective_season,
        season_policy,
        fixed_season
      FROM snapshot_rows
      WHERE
        (
          season_policy = 'current'
          AND effective_season IS NOT NULL
          AND effective_season <> ALL(%(operational_window)s)
        )
        OR
        (
          season_policy = 'fixed'
          AND fixed_season IS NOT NULL
          AND effective_season IS NOT NULL
          AND effective_season <> fixed_season
        )
      ORDER BY sport_key, effective_season, event_id
    """

    sql_delete = """
      DELETE FROM product.matchup_snapshot_v1 s
      USING odds.odds_league_map m
      WHERE m.sport_key = s.sport_key
        AND m.enabled = true
        AND m.mapping_status = 'approved'
        AND (%(only_sport_key)s::text IS NULL OR s.sport_key = %(only_sport_key)s::text)
        AND (
          (
            m.season_policy = 'current'
            AND NULLIF(s.payload #>> '{inputs,season}', '')::int IS NOT NULL
            AND NULLIF(s.payload #>> '{inputs,season}', '')::int <> ALL(%(operational_window)s)
          )
          OR
          (
            m.season_policy = 'fixed'
            AND m.fixed_season IS NOT NULL
            AND NULLIF(s.payload #>> '{inputs,season}', '')::int IS NOT NULL
            AND NULLIF(s.payload #>> '{inputs,season}', '')::int <> m.fixed_season
          )
        )
    """

    with pg_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                sql_select,
                {
                    "only_sport_key": only_sport_key,
                    "operational_window": operational_window,
                },
            )
            rows = cur.fetchall() or []

        candidates = [
            {
                "snapshot_id": int(r[0]),
                "sport_key": str(r[1]),
                "event_id": str(r[2]) if r[2] is not None else None,
                "effective_season": int(r[3]) if r[3] is not None else None,
                "season_policy": str(r[4]),
                "fixed_season": int(r[5]) if r[5] is not None else None,
            }
            for r in rows
        ]

        deleted = 0

        if not dry_run and candidates:
            with conn.cursor() as cur:
                cur.execute(
                    sql_delete,
                    {
                        "only_sport_key": only_sport_key,
                        "operational_window": operational_window,
                    },
                )
                deleted = cur.rowcount or 0
            conn.commit()

    by_sport_key = {}
    for item in candidates:
        sport_key = item["sport_key"]
        by_sport_key[sport_key] = int(by_sport_key.get(sport_key, 0)) + 1

    return {
        "ok": True,
        "dry_run": bool(dry_run),
        "only_sport_key": only_sport_key,
        "operational_window": operational_window,
        "candidates_count": len(candidates),
        "deleted_count": int(deleted),
        "by_sport_key": by_sport_key,
        "sample": candidates[:50],
    }

@router.get("/pipeline/snapshots/low-confidence")
def admin_ops_snapshots_low_confidence(
    only_sport_key: str | None = Query(default=None),
    threshold: float = Query(default=0.55, ge=0.0, le=1.0),
    limit: int = Query(default=200, ge=1, le=1000),
):
    sql = """
      SELECT
        s.sport_key,
        s.event_id,
        s.fixture_id,
        s.kickoff_utc,
        s.home_name,
        s.away_name,
        NULLIF(s.payload #>> '{inputs,season}', '')::int AS effective_season,
        s.payload #>> '{confidence,overall}' AS confidence_overall_raw,
        s.payload #>> '{confidence,level}' AS confidence_level,
        s.payload #>> '{confidence,source}' AS confidence_source,
        s.payload #>> '{inputs,lambda_source}' AS lambda_source,
        s.payload #> '{confidence,factors}' AS confidence_factors,
        s.payload #> '{confidence,coverage}' AS confidence_coverage,
        s.payload #> '{confidence,reasons}' AS confidence_reasons,
        s.updated_at_utc
      FROM product.matchup_snapshot_v1 s
      WHERE (%(only_sport_key)s::text IS NULL OR s.sport_key = %(only_sport_key)s::text)
        AND (
          CASE
            WHEN (s.payload #>> '{confidence,overall}') ~ '^[0-9]+(\\.[0-9]+)?$'
            THEN (s.payload #>> '{confidence,overall}')::numeric
            ELSE NULL
          END
        ) < %(threshold)s
      ORDER BY
        (s.payload #>> '{confidence,overall}')::numeric ASC,
        s.sport_key,
        s.kickoff_utc
      LIMIT %(limit)s
    """

    with pg_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                sql,
                {
                    "only_sport_key": only_sport_key,
                    "threshold": float(threshold),
                    "limit": int(limit),
                },
            )
            rows = cur.fetchall() or []

    items = []

    for row in rows:
        (
            sport_key,
            event_id,
            fixture_id,
            kickoff_utc,
            home_name,
            away_name,
            effective_season,
            confidence_overall_raw,
            confidence_level,
            confidence_source,
            lambda_source,
            confidence_factors,
            confidence_coverage,
            confidence_reasons,
            updated_at_utc,
        ) = row

        try:
            confidence_overall = float(confidence_overall_raw) if confidence_overall_raw is not None else None
        except Exception:
            confidence_overall = None

        items.append(
            {
                "sport_key": str(sport_key),
                "event_id": str(event_id) if event_id else None,
                "fixture_id": int(fixture_id) if fixture_id is not None else None,
                "kickoff_utc": kickoff_utc.isoformat() if kickoff_utc else None,
                "home_name": str(home_name) if home_name else None,
                "away_name": str(away_name) if away_name else None,
                "effective_season": int(effective_season) if effective_season is not None else None,
                "confidence_overall": confidence_overall,
                "confidence_level": str(confidence_level) if confidence_level else None,
                "confidence_source": str(confidence_source) if confidence_source else None,
                "lambda_source": str(lambda_source) if lambda_source else None,
                "confidence_factors": confidence_factors,
                "confidence_coverage": confidence_coverage,
                "confidence_reasons": confidence_reasons,
                "updated_at_utc": updated_at_utc.isoformat() if updated_at_utc else None,
            }
        )

    by_sport_key = {}
    by_lambda_source = {}
    by_confidence_source = {}

    for item in items:
        sport_key = item["sport_key"]
        lambda_source = item.get("lambda_source") or "unknown"
        confidence_source = item.get("confidence_source") or "unknown"

        by_sport_key[sport_key] = int(by_sport_key.get(sport_key, 0)) + 1
        by_lambda_source[lambda_source] = int(by_lambda_source.get(lambda_source, 0)) + 1
        by_confidence_source[confidence_source] = int(by_confidence_source.get(confidence_source, 0)) + 1

    return {
        "ok": True,
        "only_sport_key": only_sport_key,
        "threshold": float(threshold),
        "count": len(items),
        "by_sport_key": by_sport_key,
        "by_lambda_source": by_lambda_source,
        "by_confidence_source": by_confidence_source,
        "items": items,
    }


@router.get("/pipeline/snapshots/confidence-summary")
def admin_ops_snapshots_confidence_summary():
    sql = """
      SELECT
        s.sport_key,
        COUNT(*) AS snapshots_count,
        MIN(
          CASE
            WHEN (s.payload #>> '{confidence,overall}') ~ '^[0-9]+(\\.[0-9]+)?$'
            THEN (s.payload #>> '{confidence,overall}')::numeric
            ELSE NULL
          END
        ) AS min_confidence,
        AVG(
          CASE
            WHEN (s.payload #>> '{confidence,overall}') ~ '^[0-9]+(\\.[0-9]+)?$'
            THEN (s.payload #>> '{confidence,overall}')::numeric
            ELSE NULL
          END
        ) AS avg_confidence,
        COUNT(*) FILTER (
          WHERE (
            CASE
              WHEN (s.payload #>> '{confidence,overall}') ~ '^[0-9]+(\\.[0-9]+)?$'
              THEN (s.payload #>> '{confidence,overall}')::numeric
              ELSE NULL
            END
          ) < 0.55
        ) AS low_confidence_count,
        COUNT(*) FILTER (
          WHERE s.payload #>> '{inputs,lambda_source}' = 'league_prior'
        ) AS league_prior_count,
        COUNT(*) FILTER (
          WHERE s.payload #>> '{inputs,lambda_source}' = 'recent_fixtures'
        ) AS recent_fixtures_count,
        COUNT(*) FILTER (
          WHERE s.payload #>> '{inputs,lambda_source}' = 'team_season_stats_blended'
        ) AS blended_count
      FROM product.matchup_snapshot_v1 s
      GROUP BY s.sport_key
      ORDER BY low_confidence_count DESC, avg_confidence ASC NULLS LAST, s.sport_key
    """

    with pg_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql)
            rows = cur.fetchall() or []

    items = []

    for row in rows:
        (
            sport_key,
            snapshots_count,
            min_confidence,
            avg_confidence,
            low_confidence_count,
            league_prior_count,
            recent_fixtures_count,
            blended_count,
        ) = row

        items.append(
            {
                "sport_key": str(sport_key),
                "snapshots_count": int(snapshots_count or 0),
                "min_confidence": float(min_confidence) if min_confidence is not None else None,
                "avg_confidence": float(avg_confidence) if avg_confidence is not None else None,
                "low_confidence_count": int(low_confidence_count or 0),
                "league_prior_count": int(league_prior_count or 0),
                "recent_fixtures_count": int(recent_fixtures_count or 0),
                "blended_count": int(blended_count or 0),
            }
        )

    return {
        "ok": True,
        "items": items,
    }