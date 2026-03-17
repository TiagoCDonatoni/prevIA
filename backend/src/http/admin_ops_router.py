from __future__ import annotations

from fastapi import APIRouter, Query, HTTPException

import re
import unicodedata

from src.ops.job_runner import run_job
from src.ops.jobs.odds_refresh import odds_refresh
from src.ops.jobs.odds_resolve import odds_resolve_batch
from src.ops.jobs.snapshots_materialize import snapshots_materialize
from src.ops.jobs.pipeline_run_all import pipeline_run_all
from src.ops.jobs.odds_league_gap_scan import odds_league_gap_scan
from src.db.pg import pg_conn
from src.ops.jobs.odds_league_autoclassify import odds_league_autoclassify
from src.ops.jobs.update_pipeline import update_pipeline_run

router = APIRouter(prefix="/admin/ops", tags=["admin-ops"])

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


def _extract_competition_and_country(
    sport_key: str,
    sport_title: str | None,
    sport_group: str | None,
) -> tuple[str, str | None]:
    title = (sport_title or "").strip()

    if (sport_group or "").lower() == "soccer":
        if " - " in title:
            left, right = title.rsplit(" - ", 1)
            return _norm_text(left), _norm_text(right)

        country_hint = _sport_key_country_hint(sport_key)
        comp = title or sport_key
        return _norm_text(comp), _norm_text(country_hint)

    return _norm_text(title or sport_key), None


def _auto_resolve_single_league(cur, sport_key: str) -> dict:
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
        return {"ok": False, "sport_key": sport_key, "reason": "not_found"}

    current_league_id = int(row[3] or 0)
    if current_league_id > 0:
        return {
            "ok": True,
            "sport_key": sport_key,
            "league_id": current_league_id,
            "reason": "already_resolved",
        }

    comp_norm, country_norm = _extract_competition_and_country(
        sport_key=row[0],
        sport_title=row[1],
        sport_group=row[2],
    )

    cur.execute(
        """
        select
          league_id,
          name,
          country_name
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

        if comp_norm == league_name_norm and country_norm and country_norm == country_name_norm:
            exact_matches.append((league_id, lg[1], lg[2]))
        elif comp_norm == league_name_norm:
            name_only_matches.append((league_id, lg[1], lg[2]))

    chosen = None
    confidence = None
    notes = None

    if len(exact_matches) == 1:
        chosen = exact_matches[0]
        confidence = 0.99
        notes = "auto-resolved by exact name+country"
    elif len(exact_matches) > 1:
        return {
            "ok": False,
            "sport_key": sport_key,
            "reason": "ambiguous_exact_matches",
            "candidates": [
                {"league_id": m[0], "name": m[1], "country_name": m[2]}
                for m in exact_matches
            ],
        }
    elif len(name_only_matches) == 1:
        chosen = name_only_matches[0]
        confidence = 0.85
        notes = "auto-resolved by unique name"
    elif len(name_only_matches) > 1:
        return {
            "ok": False,
            "sport_key": sport_key,
            "reason": "ambiguous_name_matches",
            "candidates": [
                {"league_id": m[0], "name": m[1], "country_name": m[2]}
                for m in name_only_matches
            ],
        }

    if not chosen:
        return {
            "ok": False,
            "sport_key": sport_key,
            "reason": "no_match",
            "competition_norm": comp_norm,
            "country_norm": country_norm,
        }

    league_id = int(chosen[0])

    cur.execute(
        """
        update odds.odds_league_map
        set
          league_id = %(league_id)s,
          mapping_status = 'approved',
          confidence = %(confidence)s,
          notes = %(notes)s,
          updated_at_utc = now()
        where sport_key = %(sport_key)s
        """,
        {
            "sport_key": sport_key,
            "league_id": league_id,
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
    }

@router.post("/odds/refresh")
def admin_ops_odds_refresh(
    sport_key: str = Query(..., min_length=3),
    regions: str = Query(default="eu"),
):
    res = run_job("odds_refresh", odds_refresh, sport_key=sport_key, regions=regions)
    return {"ok": res.ok, "job": res.job_name, "elapsed_sec": res.elapsed_sec, "counters": res.counters, "error": res.error}


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
    res = run_job(
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
    return {"ok": res.ok, "job": res.job_name, "elapsed_sec": res.elapsed_sec, "counters": res.counters, "error": res.error}


@router.post("/snapshots/materialize")
def admin_ops_snapshots_materialize(
    sport_key: str = Query(..., min_length=3),
    hours_ahead: int = Query(default=720, ge=1, le=24 * 60),
    limit: int = Query(default=500, ge=1, le=5000),
):
    res = run_job(
        "snapshots_materialize",
        snapshots_materialize,
        sport_key=sport_key,
        mode="window",
        hours_ahead=hours_ahead,
        limit=limit,
    )
    return {"ok": res.ok, "job": res.job_name, "elapsed_sec": res.elapsed_sec, "counters": res.counters, "error": res.error}


@router.post("/pipeline/run_all")
def admin_ops_pipeline_run_all(
    only_sport_key: str | None = Query(default=None),
):
    res = run_job("pipeline_run_all", pipeline_run_all, only_sport_key=only_sport_key)
    return {"ok": res.ok, "job": res.job_name, "elapsed_sec": res.elapsed_sec, "counters": res.counters, "error": res.error}

@router.post("/pipeline/run")
def admin_ops_pipeline_run(
    only_sport_key: str | None = Query(default=None),
):
    res = run_job("update_pipeline_run", update_pipeline_run, only_sport_key=only_sport_key)
    return {
        "ok": res.ok,
        "job": res.job_name,
        "elapsed_sec": res.elapsed_sec,
        "result": res.counters,
        "error": res.error,
    }

@router.post("/odds/league_map/gap_scan")
def admin_ops_league_map_gap_scan(default_enabled: bool = False):
    res = run_job("odds_league_gap_scan", odds_league_gap_scan, default_enabled=default_enabled)
    return {"ok": res.ok, "job": res.job_name, "elapsed_sec": res.elapsed_sec, "counters": res.counters, "error": res.error}


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
    res = run_job("odds_league_autoclassify", odds_league_autoclassify)
    return {"ok": res.ok, "job": res.job_name, "elapsed_sec": res.elapsed_sec, "counters": res.counters, "error": res.error}


@router.post("/odds/league_map/approve")
def admin_ops_league_map_approve(
    sport_key: str,
    league_id: int,
    regions: str = "eu",
    hours_ahead: int = 720,
    tol_hours: int = 6,
    season_policy: str = "current",
    fixed_season: int | None = None,
    enabled: bool = True,
):
    """
    Aprova um mapeamento: seta league_id + params e marca approved.
    """
    if not sport_key or not isinstance(sport_key, str):
        return {"ok": False, "error": "sport_key_required"}
    if league_id is None or int(league_id) <= 0:
        return {"ok": False, "error": "league_id_must_be_positive"}

    sql = """
      update odds.odds_league_map
      set
        league_id = %(league_id)s,
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
      returning sport_key, league_id, mapping_status, enabled
    """

    with pg_conn() as conn:
        conn.autocommit = False
        with conn.cursor() as cur:
            cur.execute(
                sql,
                {
                    "sport_key": sport_key,
                    "league_id": int(league_id),
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

    return {"ok": True, "sport_key": row[0], "league_id": row[1], "mapping_status": row[2], "enabled": row[3]}

@router.get("/leagues")
def admin_ops_list_leagues():
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
      order by
        m.enabled desc,
        c.sport_group nulls last,
        c.sport_title,
        m.sport_key
    """
    items = []
    with pg_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql)
            rows = cur.fetchall() or []

    for r in rows:
        items.append(
            {
                "sport_key": r[0],
                "sport_title": r[1],
                "sport_group": r[2],
                "league_id": r[3],
                "season_policy": r[4],
                "fixed_season": r[5],
                "regions": r[6],
                "hours_ahead": r[7],
                "tol_hours": r[8],
                "enabled": r[9],
                "mapping_status": r[10],
                "confidence": float(r[11]) if r[11] is not None else None,
                "notes": r[12],
                "updated_at_utc": r[13].isoformat() if hasattr(r[13], "isoformat") else str(r[13]),
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
                    where coalesce(m.league_id, 0) = 0
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