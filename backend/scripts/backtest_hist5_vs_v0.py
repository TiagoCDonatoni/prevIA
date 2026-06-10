from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from src.product.matchup_model_hist5_v1 import estimate_lambdas_hist5_decay, probs_1x2_from_lambdas


SIDES = ("H", "D", "A")


def _f(value: Any, default: float = 0.0) -> float:
    try:
        return float(default if value is None else value)
    except Exception:
        return float(default)


def _r(value: Any, digits: int = 6) -> float:
    return round(float(value), int(digits))


def _safe_prob(p: float, eps: float = 1e-15) -> float:
    return max(float(eps), min(1.0 - float(eps), float(p)))


def _normalize_probs(probs: Optional[Dict[str, Any]]) -> Optional[Dict[str, float]]:
    if not probs:
        return None

    out = {side: _f(probs.get(side), 0.0) for side in SIDES}
    total = sum(out.values())

    if total <= 0.0:
        return None

    return {side: out[side] / total for side in SIDES}


def _top_side(probs: Dict[str, float]) -> str:
    return max(SIDES, key=lambda s: float(probs.get(s, 0.0)))


def _brier(probs: Dict[str, float], outcome: str) -> float:
    return sum((float(probs[s]) - (1.0 if s == outcome else 0.0)) ** 2 for s in SIDES)


def _logloss(probs: Dict[str, float], outcome: str) -> float:
    return -math.log(_safe_prob(float(probs[outcome])))


def _new_metric_bucket() -> Dict[str, Any]:
    return {
        "n": 0,
        "brier_sum": 0.0,
        "logloss_sum": 0.0,
        "top1_sum": 0.0,
        "avg_top_prob_sum": 0.0,
    }


def _add_metrics(bucket: Dict[str, Any], probs: Optional[Dict[str, float]], outcome: str) -> None:
    if not probs or outcome not in SIDES:
        return

    top = _top_side(probs)
    bucket["n"] += 1
    bucket["brier_sum"] += _brier(probs, outcome)
    bucket["logloss_sum"] += _logloss(probs, outcome)
    bucket["top1_sum"] += 1.0 if top == outcome else 0.0
    bucket["avg_top_prob_sum"] += float(probs[top])


def _finalize(bucket: Dict[str, Any]) -> Dict[str, Any]:
    n = int(bucket.get("n") or 0)

    if n <= 0:
        return {
            "n": 0,
            "brier": None,
            "logloss": None,
            "top1_acc": None,
            "avg_top_prob": None,
        }

    return {
        "n": n,
        "brier": _r(float(bucket["brier_sum"]) / n),
        "logloss": _r(float(bucket["logloss_sum"]) / n),
        "top1_acc": _r(float(bucket["top1_sum"]) / n),
        "avg_top_prob": _r(float(bucket["avg_top_prob_sum"]) / n),
    }


def _load_rows(
    conn,
    *,
    league_id: Optional[int],
    season: Optional[int],
    window_days: int,
    cutoff_hours: int,
    artifact_filename: Optional[str],
    min_confidence: str,
    limit: int,
) -> List[Dict[str, Any]]:
    sql = """
      WITH cand AS (
        SELECT
          p.event_id,
          p.artifact_filename,
          p.sport_key,
          p.kickoff_utc,
          p.captured_at_utc,
          p.league_id,
          p.season,
          p.fixture_id,
          p.home_team_id,
          p.away_team_id,
          p.match_confidence,
          p.p_mkt_h,
          p.p_mkt_d,
          p.p_mkt_a,
          p.p_model_h,
          p.p_model_d,
          p.p_model_a,
          r.result_1x2,
          r.home_goals,
          r.away_goals
        FROM odds.audit_predictions p
        JOIN odds.audit_result r
          ON r.event_id = p.event_id
        WHERE p.kickoff_utc IS NOT NULL
          AND p.captured_at_utc IS NOT NULL
          AND p.league_id IS NOT NULL
          AND p.season IS NOT NULL
          AND p.home_team_id IS NOT NULL
          AND p.away_team_id IS NOT NULL
          AND r.result_1x2 IN ('H', 'D', 'A')
          AND p.p_model_h IS NOT NULL
          AND p.p_model_d IS NOT NULL
          AND p.p_model_a IS NOT NULL
          AND (%(league_id)s::int IS NULL OR p.league_id = %(league_id)s::int)
          AND (%(season)s::int IS NULL OR p.season = %(season)s::int)
          AND (
            %(window_days)s::int <= 0
            OR p.kickoff_utc >= now() - (%(window_days)s || ' days')::interval
          )
          AND p.captured_at_utc <= (p.kickoff_utc - (%(cutoff_hours)s || ' hours')::interval)
          AND (
            %(artifact_filename)s::text IS NULL
            OR p.artifact_filename = %(artifact_filename)s::text
          )
          AND (
            %(min_confidence)s::text = 'NONE'
            OR (
              %(min_confidence)s::text = 'ILIKE'
              AND p.match_confidence IN ('ILIKE', 'EXACT')
            )
            OR (
              %(min_confidence)s::text = 'EXACT'
              AND p.match_confidence = 'EXACT'
            )
          )
      ),
      picked AS (
        SELECT DISTINCT ON (event_id)
          *
        FROM cand
        ORDER BY event_id, captured_at_utc DESC
      )
      SELECT
        event_id,
        artifact_filename,
        sport_key,
        kickoff_utc,
        captured_at_utc,
        league_id,
        season,
        fixture_id,
        home_team_id,
        away_team_id,
        match_confidence,
        p_mkt_h,
        p_mkt_d,
        p_mkt_a,
        p_model_h,
        p_model_d,
        p_model_a,
        result_1x2,
        home_goals,
        away_goals
      FROM picked
      ORDER BY kickoff_utc DESC, event_id ASC
      LIMIT %(limit)s
    """

    params = {
        "league_id": league_id,
        "season": season,
        "window_days": int(window_days),
        "cutoff_hours": int(cutoff_hours),
        "artifact_filename": artifact_filename,
        "min_confidence": str(min_confidence or "NONE"),
        "limit": int(limit),
    }

    cols = [
        "event_id",
        "artifact_filename",
        "sport_key",
        "kickoff_utc",
        "captured_at_utc",
        "league_id",
        "season",
        "fixture_id",
        "home_team_id",
        "away_team_id",
        "match_confidence",
        "p_mkt_h",
        "p_mkt_d",
        "p_mkt_a",
        "p_model_h",
        "p_model_d",
        "p_model_a",
        "result_1x2",
        "home_goals",
        "away_goals",
    ]

    with conn.cursor() as cur:
        cur.execute(sql, params)
        rows = cur.fetchall() or []

    return [dict(zip(cols, row)) for row in rows]


def _side_probs_from_row(row: Dict[str, Any], prefix: str) -> Optional[Dict[str, float]]:
    return _normalize_probs(
        {
            "H": row.get(f"{prefix}_h"),
            "D": row.get(f"{prefix}_d"),
            "A": row.get(f"{prefix}_a"),
        }
    )


def run_backtest(
    conn,
    *,
    league_id: Optional[int],
    season: Optional[int],
    window_days: int,
    cutoff_hours: int,
    artifact_filename: Optional[str],
    min_confidence: str,
    limit: int,
    as_of_mode: str,
    sample_limit: int,
) -> Dict[str, Any]:
    rows = _load_rows(
        conn,
        league_id=league_id,
        season=season,
        window_days=window_days,
        cutoff_hours=cutoff_hours,
        artifact_filename=artifact_filename,
        min_confidence=min_confidence,
        limit=limit,
    )

    metrics = {
        "v0": _new_metric_bucket(),
        "hist5": _new_metric_bucket(),
        "market": _new_metric_bucket(),
    }

    by_quality: Dict[str, Dict[str, Any]] = {}
    by_guardrail: Dict[str, Dict[str, Any]] = {}
    errors: List[Dict[str, Any]] = []
    samples: List[Dict[str, Any]] = []

    evaluated = 0

    for row in rows:
        outcome = str(row.get("result_1x2") or "")

        v0_probs = _side_probs_from_row(row, "p_model")
        market_probs = _side_probs_from_row(row, "p_mkt")

        try:
            estimate = estimate_lambdas_hist5_decay(
                conn,
                league_id=int(row["league_id"]),
                season=int(row["season"]),
                home_team_id=int(row["home_team_id"]),
                away_team_id=int(row["away_team_id"]),
                as_of_mode=str(as_of_mode),
            )

            hist5_probs = probs_1x2_from_lambdas(
                lam_home=float(estimate.lambdas.lam_home),
                lam_away=float(estimate.lambdas.lam_away),
            )

            diagnostics = estimate.diagnostics or {}
            quality = str(diagnostics.get("match_history_quality") or "UNKNOWN")
            guardrails = list(diagnostics.get("guardrails") or [])

            evaluated += 1

            _add_metrics(metrics["v0"], v0_probs, outcome)
            _add_metrics(metrics["hist5"], hist5_probs, outcome)
            _add_metrics(metrics["market"], market_probs, outcome)

            by_quality.setdefault(
                quality,
                {
                    "v0": _new_metric_bucket(),
                    "hist5": _new_metric_bucket(),
                    "market": _new_metric_bucket(),
                    "count": 0,
                },
            )
            by_quality[quality]["count"] += 1
            _add_metrics(by_quality[quality]["v0"], v0_probs, outcome)
            _add_metrics(by_quality[quality]["hist5"], hist5_probs, outcome)
            _add_metrics(by_quality[quality]["market"], market_probs, outcome)

            for guardrail in guardrails or ["none"]:
                by_guardrail.setdefault(
                    str(guardrail),
                    {
                        "v0": _new_metric_bucket(),
                        "hist5": _new_metric_bucket(),
                        "market": _new_metric_bucket(),
                        "count": 0,
                    },
                )
                by_guardrail[str(guardrail)]["count"] += 1
                _add_metrics(by_guardrail[str(guardrail)]["v0"], v0_probs, outcome)
                _add_metrics(by_guardrail[str(guardrail)]["hist5"], hist5_probs, outcome)
                _add_metrics(by_guardrail[str(guardrail)]["market"], market_probs, outcome)

            if len(samples) < int(sample_limit):
                samples.append(
                    {
                        "event_id": row.get("event_id"),
                        "kickoff_utc": row.get("kickoff_utc"),
                        "league_id": row.get("league_id"),
                        "season": row.get("season"),
                        "home_team_id": row.get("home_team_id"),
                        "away_team_id": row.get("away_team_id"),
                        "result_1x2": outcome,
                        "match_confidence": row.get("match_confidence"),
                        "quality": quality,
                        "guardrails": guardrails,
                        "v0_probs": {k: _r(v) for k, v in (v0_probs or {}).items()},
                        "hist5_probs": {k: _r(v) for k, v in hist5_probs.items()},
                        "market_probs": {k: _r(v) for k, v in (market_probs or {}).items()},
                        "v0_top": _top_side(v0_probs) if v0_probs else None,
                        "hist5_top": _top_side(hist5_probs),
                        "market_top": _top_side(market_probs) if market_probs else None,
                        "hist5_lambdas": {
                            "home": _r(estimate.lambdas.lam_home, 4),
                            "away": _r(estimate.lambdas.lam_away, 4),
                        },
                    }
                )

        except Exception as exc:
            errors.append(
                {
                    "event_id": row.get("event_id"),
                    "league_id": row.get("league_id"),
                    "season": row.get("season"),
                    "error": str(exc),
                }
            )

    finalized = {key: _finalize(value) for key, value in metrics.items()}

    def _delta(a: Optional[float], b: Optional[float]) -> Optional[float]:
        if a is None or b is None:
            return None
        return _r(float(a) - float(b))

    by_quality_out = {}
    for quality, bucket in sorted(by_quality.items()):
        by_quality_out[quality] = {
            "count": int(bucket["count"]),
            "v0": _finalize(bucket["v0"]),
            "hist5": _finalize(bucket["hist5"]),
            "market": _finalize(bucket["market"]),
        }

    by_guardrail_out = {}
    for guardrail, bucket in sorted(by_guardrail.items()):
        by_guardrail_out[guardrail] = {
            "count": int(bucket["count"]),
            "v0": _finalize(bucket["v0"]),
            "hist5": _finalize(bucket["hist5"]),
            "market": _finalize(bucket["market"]),
        }

    return {
        "ok": True,
        "connected_to_snapshot": False,
        "calls_external_api": False,
        "mutates_database": False,
        "purpose": "hist5_vs_v0_backtest_diagnostics_only",
        "meta": {
            "league_id": league_id,
            "season": season,
            "window_days": int(window_days),
            "cutoff_hours": int(cutoff_hours),
            "artifact_filename": artifact_filename,
            "min_confidence": str(min_confidence),
            "limit": int(limit),
            "as_of_mode": str(as_of_mode),
            "rows_loaded": len(rows),
            "rows_evaluated": int(evaluated),
            "errors": len(errors),
        },
        "summary": {
            **finalized,
            "delta_hist5_minus_v0": {
                "brier": _delta(finalized["hist5"]["brier"], finalized["v0"]["brier"]),
                "logloss": _delta(finalized["hist5"]["logloss"], finalized["v0"]["logloss"]),
                "top1_acc": _delta(finalized["hist5"]["top1_acc"], finalized["v0"]["top1_acc"]),
                "avg_top_prob": _delta(finalized["hist5"]["avg_top_prob"], finalized["v0"]["avg_top_prob"]),
            },
            "delta_hist5_minus_market": {
                "brier": _delta(finalized["hist5"]["brier"], finalized["market"]["brier"]),
                "logloss": _delta(finalized["hist5"]["logloss"], finalized["market"]["logloss"]),
                "top1_acc": _delta(finalized["hist5"]["top1_acc"], finalized["market"]["top1_acc"]),
                "avg_top_prob": _delta(finalized["hist5"]["avg_top_prob"], finalized["market"]["avg_top_prob"]),
            },
        },
        "by_quality": by_quality_out,
        "by_guardrail": by_guardrail_out,
        "samples": samples,
        "errors_sample": errors[:20],
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Backtest desconectado do model_v1_hist5_decay contra audit_predictions/model_v0.",
    )
    parser.add_argument("--league-id", type=int, default=None)
    parser.add_argument("--season", type=int, default=None)
    parser.add_argument("--window-days", type=int, default=3650)
    parser.add_argument("--cutoff-hours", type=int, default=6)
    parser.add_argument("--artifact-filename", default=None)
    parser.add_argument("--min-confidence", default="ILIKE", choices=["NONE", "ILIKE", "EXACT"])
    parser.add_argument("--limit", type=int, default=500)
    parser.add_argument("--sample-limit", type=int, default=30)
    parser.add_argument(
        "--as-of-mode",
        default="previous_seasons",
        choices=["previous_seasons", "current_available"],
        help=(
            "previous_seasons evita vazamento usando season-1 como alvo histórico; "
            "current_available é apenas sanity check e pode vazar dados finais da temporada."
        ),
    )
    parser.add_argument("--pretty", action="store_true")
    args = parser.parse_args()

    from src.db.pg import pg_conn

    with pg_conn() as conn:
        payload = run_backtest(
            conn,
            league_id=args.league_id,
            season=args.season,
            window_days=int(args.window_days),
            cutoff_hours=int(args.cutoff_hours),
            artifact_filename=args.artifact_filename,
            min_confidence=str(args.min_confidence),
            limit=int(args.limit),
            as_of_mode=str(args.as_of_mode),
            sample_limit=int(args.sample_limit),
        )

    print(json.dumps(payload, ensure_ascii=False, indent=2 if args.pretty else None, default=str))


if __name__ == "__main__":
    main()