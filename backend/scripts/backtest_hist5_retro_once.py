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
from src.product.hist5_shadow_snapshot_builder_v1 import _build_hist5_or_v0_shadow_payload
from src.product.matchup_snapshot_builder_v1 import (
    _json_dumps_safe,
    _load_snapshot_season_policy_context,
    _select_1x2_best_odds,
    _select_totals_main_line_and_best,
)

DEFAULT_BACKTEST_RUN_ID = "hist5_retro_2026_03_01_to_2026_06_25_dirty_v1"
DEFAULT_MODEL_VERSION = "model_v1_hist5_decay"


def _safe_float(value: Any) -> Optional[float]:
    try:
        if value is None:
            return None
        return float(value)
    except Exception:
        return None


def _top_side(prob_home: float, prob_draw: float, prob_away: float) -> Dict[str, Any]:
    probs = {"home": float(prob_home), "draw": float(prob_draw), "away": float(prob_away)}
    side = max(probs, key=lambda key: probs[key])
    return {"side": side, "prob": probs[side]}


def _ensure_target_table(conn) -> None:
    sql = """
      CREATE SCHEMA IF NOT EXISTS ops;

      CREATE TABLE IF NOT EXISTS ops.matchup_snapshot_backtest_v1 (
        backtest_row_id BIGSERIAL PRIMARY KEY,
        backtest_run_id TEXT NOT NULL,
        model_version TEXT NOT NULL,
        event_id TEXT NOT NULL,
        fixture_id INTEGER,
        sport_key TEXT,
        kickoff_utc TIMESTAMPTZ,
        home_name TEXT,
        away_name TEXT,
        as_of_utc TIMESTAMPTZ,
        generated_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        confidence_overall NUMERIC,
        confidence_level TEXT,
        prob_home NUMERIC,
        prob_draw NUMERIC,
        prob_away NUMERIC,
        top_side TEXT,
        top_prob NUMERIC,
        payload JSONB,
        notes TEXT
      );

      CREATE UNIQUE INDEX IF NOT EXISTS ux_matchup_snapshot_backtest_run_event_model
        ON ops.matchup_snapshot_backtest_v1(backtest_run_id, event_id, model_version);

      CREATE INDEX IF NOT EXISTS idx_matchup_snapshot_backtest_fixture_model
        ON ops.matchup_snapshot_backtest_v1(fixture_id, model_version);

      CREATE INDEX IF NOT EXISTS idx_matchup_snapshot_backtest_kickoff
        ON ops.matchup_snapshot_backtest_v1(kickoff_utc);
    """
    with conn.cursor() as cur:
        cur.execute(sql)


def _pending_count(conn, *, backtest_run_id: str, model_version: str, sport_key: Optional[str]) -> int:
    sql = """
      SELECT COUNT(*)
      FROM ops.matchup_backtest_universe_v1 u
      LEFT JOIN ops.matchup_snapshot_backtest_v1 b
        ON b.backtest_run_id = u.backtest_run_id
       AND b.event_id = u.event_id
       AND b.model_version = %(model_version)s
      WHERE u.backtest_run_id = %(backtest_run_id)s
        AND b.event_id IS NULL
        AND (%(sport_key)s::text IS NULL OR u.sport_key = %(sport_key)s::text)
    """
    with conn.cursor() as cur:
        cur.execute(
            sql,
            {
                "backtest_run_id": str(backtest_run_id),
                "model_version": str(model_version),
                "sport_key": str(sport_key) if sport_key else None,
            },
        )
        row = cur.fetchone() or (0,)
    return int(row[0] or 0)


def _load_rows(
    conn,
    *,
    backtest_run_id: str,
    model_version: str,
    limit: int,
    sport_key: Optional[str],
    event_ids: Optional[List[str]],
    force: bool,
) -> List[Dict[str, Any]]:
    sql = """
      WITH picked AS (
        SELECT
          u.backtest_run_id,
          u.event_id,
          u.fixture_id,
          u.sport_key,
          u.kickoff_utc,
          u.home_name,
          u.away_name,
          u.as_of_utc
        FROM ops.matchup_backtest_universe_v1 u
        LEFT JOIN ops.matchup_snapshot_backtest_v1 b
          ON b.backtest_run_id = u.backtest_run_id
         AND b.event_id = u.event_id
         AND b.model_version = %(model_version)s
        WHERE u.backtest_run_id = %(backtest_run_id)s
          AND (%(force)s::boolean = TRUE OR b.event_id IS NULL)
          AND (%(sport_key)s::text IS NULL OR u.sport_key = %(sport_key)s::text)
          AND (%(event_ids)s::text[] IS NULL OR u.event_id = ANY(%(event_ids)s::text[]))
        ORDER BY u.kickoff_utc ASC NULLS LAST, u.event_id ASC
        LIMIT %(limit)s
      )
      SELECT
        p.backtest_run_id,
        p.event_id,
        p.fixture_id,
        p.sport_key,
        COALESCE(f.kickoff_utc, p.kickoff_utc) AS kickoff_utc,
        p.home_name,
        p.away_name,
        p.as_of_utc,
        f.league_id,
        f.season,
        f.home_team_id,
        f.away_team_id
      FROM picked p
      LEFT JOIN core.fixtures f
        ON f.fixture_id = p.fixture_id
      ORDER BY p.kickoff_utc ASC NULLS LAST, p.event_id ASC
    """
    cols = [
        "backtest_run_id",
        "event_id",
        "fixture_id",
        "sport_key",
        "kickoff_utc",
        "home_name",
        "away_name",
        "as_of_utc",
        "league_id",
        "season",
        "home_team_id",
        "away_team_id",
    ]
    with conn.cursor() as cur:
        cur.execute(
            sql,
            {
                "backtest_run_id": str(backtest_run_id),
                "model_version": str(model_version),
                "limit": int(limit),
                "sport_key": str(sport_key) if sport_key else None,
                "event_ids": [str(x) for x in event_ids] if event_ids else None,
                "force": bool(force),
            },
        )
        rows = cur.fetchall() or []
    return [dict(zip(cols, row)) for row in rows]


def _upsert_result(
    conn,
    *,
    backtest_run_id: str,
    model_version: str,
    row: Dict[str, Any],
    payload: Dict[str, Any],
    prob_home: float,
    prob_draw: float,
    prob_away: float,
    top_side: str,
    top_prob: float,
    confidence_overall: Optional[float],
    confidence_level: Optional[str],
    notes: str,
) -> None:
    sql = """
      INSERT INTO ops.matchup_snapshot_backtest_v1 (
        backtest_run_id, model_version, event_id, fixture_id, sport_key,
        kickoff_utc, home_name, away_name, as_of_utc, generated_at_utc,
        confidence_overall, confidence_level,
        prob_home, prob_draw, prob_away, top_side, top_prob,
        payload, notes
      ) VALUES (
        %(backtest_run_id)s, %(model_version)s, %(event_id)s, %(fixture_id)s, %(sport_key)s,
        %(kickoff_utc)s, %(home_name)s, %(away_name)s, %(as_of_utc)s, NOW(),
        %(confidence_overall)s, %(confidence_level)s,
        %(prob_home)s, %(prob_draw)s, %(prob_away)s, %(top_side)s, %(top_prob)s,
        %(payload)s::jsonb, %(notes)s
      )
      ON CONFLICT (backtest_run_id, event_id, model_version)
      DO UPDATE SET
        fixture_id = EXCLUDED.fixture_id,
        sport_key = EXCLUDED.sport_key,
        kickoff_utc = EXCLUDED.kickoff_utc,
        home_name = EXCLUDED.home_name,
        away_name = EXCLUDED.away_name,
        as_of_utc = EXCLUDED.as_of_utc,
        generated_at_utc = EXCLUDED.generated_at_utc,
        confidence_overall = EXCLUDED.confidence_overall,
        confidence_level = EXCLUDED.confidence_level,
        prob_home = EXCLUDED.prob_home,
        prob_draw = EXCLUDED.prob_draw,
        prob_away = EXCLUDED.prob_away,
        top_side = EXCLUDED.top_side,
        top_prob = EXCLUDED.top_prob,
        payload = EXCLUDED.payload,
        notes = EXCLUDED.notes
    """
    with conn.cursor() as cur:
        cur.execute(
            sql,
            {
                "backtest_run_id": str(backtest_run_id),
                "model_version": str(model_version),
                "event_id": str(row["event_id"]),
                "fixture_id": int(row["fixture_id"]) if row.get("fixture_id") is not None else None,
                "sport_key": str(row.get("sport_key") or ""),
                "kickoff_utc": row.get("kickoff_utc"),
                "home_name": row.get("home_name"),
                "away_name": row.get("away_name"),
                "as_of_utc": row.get("as_of_utc"),
                "confidence_overall": confidence_overall,
                "confidence_level": confidence_level,
                "prob_home": float(prob_home),
                "prob_draw": float(prob_draw),
                "prob_away": float(prob_away),
                "top_side": str(top_side),
                "top_prob": float(top_prob),
                "payload": _json_dumps_safe(payload),
                "notes": str(notes),
            },
        )


def run(
    *,
    backtest_run_id: str,
    model_version: str,
    limit: int,
    sport_key: Optional[str],
    event_ids: Optional[List[str]],
    as_of_mode: str,
    apply: bool,
    force: bool,
) -> Dict[str, Any]:
    if str(as_of_mode) not in {"previous_seasons", "current_available"}:
        raise ValueError("as_of_mode must be 'previous_seasons' or 'current_available'")

    counters: Dict[str, Any] = {
        "backtest_run_id": str(backtest_run_id),
        "model_version": str(model_version),
        "as_of_mode": str(as_of_mode),
        "apply": bool(apply),
        "force": bool(force),
        "limit": int(limit),
        "pending_before": 0,
        "pending_after": 0,
        "rows_loaded": 0,
        "processed": 0,
        "inserted_or_updated": 0,
        "skipped_missing_fixture_context": 0,
        "skipped_missing_probabilities": 0,
        "hist5_action_use_hist5": 0,
        "hist5_action_fallback_to_v0": 0,
        "errors": 0,
    }
    samples: List[Dict[str, Any]] = []
    errors_sample: List[Dict[str, Any]] = []

    conn = connect_pg()
    try:
        _ensure_target_table(conn)
        conn.commit()

        counters["pending_before"] = _pending_count(
            conn,
            backtest_run_id=str(backtest_run_id),
            model_version=str(model_version),
            sport_key=sport_key,
        )

        rows = _load_rows(
            conn,
            backtest_run_id=str(backtest_run_id),
            model_version=str(model_version),
            limit=int(limit),
            sport_key=sport_key,
            event_ids=event_ids,
            force=bool(force),
        )
        counters["rows_loaded"] = len(rows)

        for row in rows:
            event_id = str(row.get("event_id") or "")
            try:
                if any(row.get(k) is None for k in ("fixture_id", "league_id", "season", "home_team_id", "away_team_id")):
                    counters["skipped_missing_fixture_context"] += 1
                    continue

                totals = _select_totals_main_line_and_best(conn, event_id=event_id)
                one_x_two = _select_1x2_best_odds(conn, event_id=event_id)
                season_policy_ctx = _load_snapshot_season_policy_context(
                    conn,
                    sport_key=str(row.get("sport_key") or ""),
                    league_id=int(row["league_id"]),
                )

                payload = _build_hist5_or_v0_shadow_payload(
                    conn,
                    model_version=str(model_version),
                    calc_version="calc_v1_backtest",
                    totals=totals,
                    one_x_two=one_x_two,
                    league_id=int(row["league_id"]),
                    season=int(row["season"]),
                    fixture_id=int(row["fixture_id"]),
                    home_team_id=int(row["home_team_id"]),
                    away_team_id=int(row["away_team_id"]),
                    fixture_resolved=True,
                    team_ids_resolved=True,
                    season_policy_ctx=season_policy_ctx,
                    as_of_mode=str(as_of_mode),
                )

                p_model = ((payload.get("markets") or {}).get("1x2") or {}).get("p_model") or {}
                p_home = _safe_float(p_model.get("home"))
                p_draw = _safe_float(p_model.get("draw"))
                p_away = _safe_float(p_model.get("away"))

                if p_home is None or p_draw is None or p_away is None:
                    counters["skipped_missing_probabilities"] += 1
                    continue

                top = _top_side(p_home, p_draw, p_away)
                confidence = payload.get("confidence") or {}
                confidence_overall = _safe_float(confidence.get("overall"))
                confidence_level = str(confidence.get("level") or "") or None

                lambda_source = str((payload.get("inputs") or {}).get("lambda_source") or "")
                if lambda_source == "hist5_candidate_v1":
                    counters["hist5_action_use_hist5"] += 1
                elif lambda_source.startswith("v0_fallback:"):
                    counters["hist5_action_fallback_to_v0"] += 1

                counters["processed"] += 1

                if len(samples) < 20:
                    samples.append(
                        {
                            "event_id": event_id,
                            "fixture_id": row.get("fixture_id"),
                            "sport_key": row.get("sport_key"),
                            "kickoff_utc": str(row.get("kickoff_utc")),
                            "home_name": row.get("home_name"),
                            "away_name": row.get("away_name"),
                            "lambda_source": lambda_source,
                            "confidence_overall": confidence_overall,
                            "confidence_level": confidence_level,
                            "prob_home": round(float(p_home), 6),
                            "prob_draw": round(float(p_draw), 6),
                            "prob_away": round(float(p_away), 6),
                            "top_side": top["side"],
                            "top_prob": round(float(top["prob"]), 6),
                        }
                    )

                if apply:
                    _upsert_result(
                        conn,
                        backtest_run_id=str(backtest_run_id),
                        model_version=str(model_version),
                        row=row,
                        payload=payload,
                        prob_home=float(p_home),
                        prob_draw=float(p_draw),
                        prob_away=float(p_away),
                        top_side=str(top["side"]),
                        top_prob=float(top["prob"]),
                        confidence_overall=confidence_overall,
                        confidence_level=confidence_level,
                        notes=f"oneoff_hist5_retro_backtest;as_of_mode={as_of_mode};does_not_mutate_product_snapshots",
                    )
                    counters["inserted_or_updated"] += 1

            except Exception as exc:
                counters["errors"] += 1
                if len(errors_sample) < 20:
                    errors_sample.append(
                        {
                            "event_id": event_id,
                            "fixture_id": row.get("fixture_id"),
                            "error": f"{type(exc).__name__}: {exc}",
                        }
                    )

        if apply:
            conn.commit()
        else:
            conn.rollback()

        counters["pending_after"] = _pending_count(
            conn,
            backtest_run_id=str(backtest_run_id),
            model_version=str(model_version),
            sport_key=sport_key,
        )

    finally:
        try:
            conn.close()
        except Exception:
            pass

    return {
        "ok": counters["errors"] == 0,
        "mode": "oneoff_script",
        "calls_external_api": False,
        "mutates_product_snapshots": False,
        "mutates_backtest_table": bool(apply),
        "counters": counters,
        "samples": samples,
        "errors_sample": errors_sample,
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Backtest retroativo pontual do model_v1_hist5_decay em ops.matchup_snapshot_backtest_v1.",
    )
    parser.add_argument("--backtest-run-id", default=DEFAULT_BACKTEST_RUN_ID)
    parser.add_argument("--model-version", default=DEFAULT_MODEL_VERSION)
    parser.add_argument("--limit", type=int, default=100)
    parser.add_argument("--sport-key", default=None)
    parser.add_argument("--event-id", action="append", default=[])
    parser.add_argument("--as-of-mode", default="previous_seasons", choices=["previous_seasons", "current_available"])
    parser.add_argument("--force", action="store_true", help="Reprocessa também linhas já existentes no destino.")
    parser.add_argument("--apply", action="store_true", help="Sem --apply roda dry-run e não grava resultados.")
    parser.add_argument("--pretty", action="store_true")
    args = parser.parse_args()

    payload = run(
        backtest_run_id=str(args.backtest_run_id),
        model_version=str(args.model_version),
        limit=int(args.limit),
        sport_key=str(args.sport_key) if args.sport_key else None,
        event_ids=[str(x) for x in args.event_id] if args.event_id else None,
        as_of_mode=str(args.as_of_mode),
        apply=bool(args.apply),
        force=bool(args.force),
    )
    print(json.dumps(payload, ensure_ascii=False, indent=2 if args.pretty else None, default=str))


if __name__ == "__main__":
    main()