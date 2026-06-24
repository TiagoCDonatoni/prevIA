from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from src.db.pg import connect_pg
from src.product.hist5_shadow_snapshot_builder_v1 import (
    HIST5_SHADOW_MODEL_VERSION,
    rebuild_hist5_shadow_snapshots_v1,
)


def _load_approved_sport_keys(conn) -> List[str]:
    sql = """
      SELECT sport_key
      FROM odds.odds_league_map
      WHERE enabled = true
        AND mapping_status = 'approved'
        AND sport_key IS NOT NULL
      ORDER BY sport_key ASC
    """
    with conn.cursor() as cur:
        cur.execute(sql)
        rows = cur.fetchall() or []

    return [str(r[0]) for r in rows if r and r[0]]


def run(
    *,
    sport_key: Optional[str],
    all_approved: bool,
    event_ids: Optional[List[str]],
    hours_ahead: int,
    limit_per_sport: int,
    calc_version: str,
    shadow_model_version: str,
    as_of_mode: str,
    apply: bool,
) -> Dict[str, Any]:
    conn = connect_pg()
    try:
        if all_approved:
            sport_keys = _load_approved_sport_keys(conn)
        elif sport_key:
            sport_keys = [str(sport_key)]
        else:
            raise ValueError("Use --sport-key or --all-approved")

        results = []

        for sk in sport_keys:
            counters = rebuild_hist5_shadow_snapshots_v1(
                conn,
                sport_key=str(sk),
                event_ids=event_ids,
                hours_ahead=int(hours_ahead),
                limit=int(limit_per_sport),
                calc_version=str(calc_version or "calc_v1"),
                model_version=str(shadow_model_version or HIST5_SHADOW_MODEL_VERSION),
                as_of_mode=str(as_of_mode),
                apply=bool(apply),
            )
            results.append(counters)

        if apply:
            conn.commit()
        else:
            conn.rollback()

        totals = {
            "sport_keys": len(sport_keys),
            "candidates": sum(int(r.get("candidates") or 0) for r in results),
            "snapshots_shadow_upserted": sum(int(r.get("snapshots_shadow_upserted") or 0) for r in results),
            "snapshots_shadow_dry_run": sum(int(r.get("snapshots_shadow_dry_run") or 0) for r in results),
            "shadow_action_use_hist5": sum(int(r.get("shadow_action_use_hist5") or 0) for r in results),
            "shadow_action_fallback_to_v0": sum(int(r.get("shadow_action_fallback_to_v0") or 0) for r in results),
            "narrative_status_available": sum(int(r.get("narrative_status_available") or 0) for r in results),
            "narrative_status_limited": sum(int(r.get("narrative_status_limited") or 0) for r in results),
            "narrative_status_unavailable": sum(int(r.get("narrative_status_unavailable") or 0) for r in results),
            "narrative_status_unknown": sum(int(r.get("narrative_status_unknown") or 0) for r in results),
            "narrative_quality_good": sum(int(r.get("narrative_quality_good") or 0) for r in results),
            "narrative_quality_limited": sum(int(r.get("narrative_quality_limited") or 0) for r in results),
            "narrative_quality_unavailable": sum(int(r.get("narrative_quality_unavailable") or 0) for r in results),
            "narrative_quality_unknown": sum(int(r.get("narrative_quality_unknown") or 0) for r in results),
            "errors": sum(int(r.get("errors") or 0) for r in results),
        }

        return {
            "ok": True,
            "connected_to_public_model": False,
            "public_model_version_unchanged": True,
            "calls_external_api": False,
            "mutates_database": bool(apply),
            "purpose": "hist5_shadow_snapshot_materialization",
            "shadow_model_version": str(shadow_model_version or HIST5_SHADOW_MODEL_VERSION),
            "as_of_mode": str(as_of_mode),
            "apply": bool(apply),
            "sport_key": sport_key,
            "all_approved": bool(all_approved),
            "hours_ahead": int(hours_ahead),
            "limit_per_sport": int(limit_per_sport),
            "totals": totals,
            "results": results,
        }

    finally:
        try:
            conn.close()
        except Exception:
            pass


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Materializa shadow snapshots do hist5_candidate_v1 sem trocar o modelo público.",
    )
    parser.add_argument("--sport-key", default=None)
    parser.add_argument("--all-approved", action="store_true")
    parser.add_argument("--event-id", action="append", default=[])
    parser.add_argument("--hours-ahead", type=int, default=720)
    parser.add_argument("--limit-per-sport", type=int, default=100)
    parser.add_argument("--calc-version", default="calc_v1")
    parser.add_argument("--shadow-model-version", default=HIST5_SHADOW_MODEL_VERSION)
    parser.add_argument(
        "--as-of-mode",
        default="previous_seasons",
        choices=["previous_seasons", "current_available"],
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Sem --apply roda dry-run e faz rollback.",
    )
    parser.add_argument("--pretty", action="store_true")
    args = parser.parse_args()

    payload = run(
        sport_key=args.sport_key,
        all_approved=bool(args.all_approved),
        event_ids=[str(x) for x in args.event_id] if args.event_id else None,
        hours_ahead=int(args.hours_ahead),
        limit_per_sport=int(args.limit_per_sport),
        calc_version=str(args.calc_version),
        shadow_model_version=str(args.shadow_model_version),
        as_of_mode=str(args.as_of_mode),
        apply=bool(args.apply),
    )

    print(json.dumps(payload, ensure_ascii=False, indent=2 if args.pretty else None, default=str))


if __name__ == "__main__":
    main()