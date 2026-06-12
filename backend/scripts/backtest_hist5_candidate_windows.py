from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from src.product.hist5_candidate_policy_v1 import (
    get_hist5_candidate_policy,
    estimate_hist5_candidate_from_context,
)
from src.product.historical_context_v1 import build_match_historical_context
from src.product.score_engine_v1 import generate_score_matrix_v1


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


def _delta(a: Optional[float], b: Optional[float]) -> Optional[float]:
    if a is None or b is None:
        return None
    return _r(float(a) - float(b))


def _side_probs_from_row(row: Dict[str, Any], prefix: str) -> Optional[Dict[str, float]]:
    return _normalize_probs(
        {
            "H": row.get(f"{prefix}_h"),
            "D": row.get(f"{prefix}_d"),
            "A": row.get(f"{prefix}_a"),
        }
    )


def _probs_from_lambdas(*, lambda_home: float, lambda_away: float, max_goals: int) -> Dict[str, float]:
    matrix = generate_score_matrix_v1(
        lam_home=float(lambda_home),
        lam_away=float(lambda_away),
        max_goals=int(max_goals),
    )

    return {
        "H": float(matrix.prob_home_win),
        "D": float(matrix.prob_draw),
        "A": float(matrix.prob_away_win),
    }


def _parse_windows(value: str) -> List[int]:
    out: List[int] = []

    for part in str(value or "").split(","):
        part = part.strip()
        if not part:
            continue
        out.append(int(part))

    return sorted(set(out))


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


def _context_for_row(conn, row: Dict[str, Any], *, as_of_mode: str) -> Dict[str, Any]:
    mode = str(as_of_mode or "previous_seasons")

    if mode not in {"previous_seasons", "current_available"}:
        raise ValueError("as_of_mode must be 'previous_seasons' or 'current_available'")

    event_season = int(row["season"])
    requested_history_season = event_season - 1 if mode == "previous_seasons" else event_season

    return build_match_historical_context(
        conn,
        league_id=int(row["league_id"]),
        season=int(requested_history_season),
        home_team_id=int(row["home_team_id"]),
        away_team_id=int(row["away_team_id"]),
        profile_key="model_v1_hist5_decay",
    )


def _new_window_state() -> Dict[str, Any]:
    return {
        "v0": _new_metric_bucket(),
        "candidate": _new_metric_bucket(),
        "market": _new_metric_bucket(),
        "by_quality": {},
        "by_guardrail": {},
        "hist5_count": 0,
        "fallback_to_v0_count": 0,
        "context_error_count": 0,
        "samples": [],
        "errors_sample": [],
    }


def _add_segment_metric(
    container: Dict[str, Any],
    *,
    quality: str,
    guardrails: List[str],
    model_key: str,
    probs: Optional[Dict[str, float]],
    outcome: str,
) -> None:
    container["by_quality"].setdefault(
        str(quality),
        {
            "v0": _new_metric_bucket(),
            "candidate": _new_metric_bucket(),
            "market": _new_metric_bucket(),
        },
    )
    _add_metrics(container["by_quality"][str(quality)][model_key], probs, outcome)

    for guardrail in guardrails or ["none"]:
        container["by_guardrail"].setdefault(
            str(guardrail),
            {
                "v0": _new_metric_bucket(),
                "candidate": _new_metric_bucket(),
                "market": _new_metric_bucket(),
            },
        )
        _add_metrics(container["by_guardrail"][str(guardrail)][model_key], probs, outcome)


def _finalize_nested_segments(raw: Dict[str, Dict[str, Any]]) -> Dict[str, Any]:
    out: Dict[str, Any] = {}

    for key, buckets in sorted(raw.items()):
        out[key] = {
            model_key: _finalize(bucket)
            for model_key, bucket in sorted(buckets.items())
        }

    return out


def _evaluate_window(
    conn,
    *,
    window_days: int,
    league_id: Optional[int],
    season: Optional[int],
    cutoff_hours: int,
    artifact_filename: Optional[str],
    min_confidence: str,
    limit: int,
    as_of_mode: str,
    max_goals: int,
    policy_key: str,
    sample_limit: int,
) -> Dict[str, Any]:
    rows = _load_rows(
        conn,
        league_id=league_id,
        season=season,
        window_days=int(window_days),
        cutoff_hours=int(cutoff_hours),
        artifact_filename=artifact_filename,
        min_confidence=str(min_confidence),
        limit=int(limit),
    )

    policy = get_hist5_candidate_policy(policy_key)
    state = _new_window_state()

    evaluated = 0

    for row in rows:
        outcome = str(row.get("result_1x2") or "")

        if outcome not in SIDES:
            continue

        v0_probs = _side_probs_from_row(row, "p_model")
        market_probs = _side_probs_from_row(row, "p_mkt")

        try:
            context = _context_for_row(conn, row, as_of_mode=as_of_mode)
            candidate = estimate_hist5_candidate_from_context(context, policy=policy)
        except Exception as exc:
            context = {
                "status": "error",
                "match_history_quality": "UNKNOWN",
                "guardrails": ["historical_context_error"],
                "error": str(exc),
            }
            candidate = {
                "action": "fallback_to_v0",
                "quality": "UNKNOWN",
                "guardrails": ["historical_context_error"],
                "fallback_reasons": ["historical_context_error"],
                "lambda_home": None,
                "lambda_away": None,
            }
            state["context_error_count"] += 1
            if len(state["errors_sample"]) < 20:
                state["errors_sample"].append(
                    {
                        "event_id": row.get("event_id"),
                        "league_id": row.get("league_id"),
                        "season": row.get("season"),
                        "error": str(exc),
                    }
                )

        quality = str(candidate.get("quality") or context.get("match_history_quality") or "UNKNOWN")
        guardrails = [str(g) for g in list(candidate.get("guardrails") or context.get("guardrails") or [])]

        action = str(candidate.get("action") or "fallback_to_v0")

        if action == "use_hist5":
            candidate_probs = _probs_from_lambdas(
                lambda_home=float(candidate["lambda_home"]),
                lambda_away=float(candidate["lambda_away"]),
                max_goals=int(max_goals),
            )
            state["hist5_count"] += 1
        else:
            candidate_probs = v0_probs
            state["fallback_to_v0_count"] += 1

        _add_metrics(state["v0"], v0_probs, outcome)
        _add_metrics(state["candidate"], candidate_probs, outcome)
        _add_metrics(state["market"], market_probs, outcome)

        _add_segment_metric(
            state,
            quality=quality,
            guardrails=guardrails,
            model_key="v0",
            probs=v0_probs,
            outcome=outcome,
        )
        _add_segment_metric(
            state,
            quality=quality,
            guardrails=guardrails,
            model_key="candidate",
            probs=candidate_probs,
            outcome=outcome,
        )
        _add_segment_metric(
            state,
            quality=quality,
            guardrails=guardrails,
            model_key="market",
            probs=market_probs,
            outcome=outcome,
        )

        if len(state["samples"]) < int(sample_limit):
            state["samples"].append(
                {
                    "event_id": row.get("event_id"),
                    "kickoff_utc": row.get("kickoff_utc"),
                    "league_id": row.get("league_id"),
                    "season": row.get("season"),
                    "home_team_id": row.get("home_team_id"),
                    "away_team_id": row.get("away_team_id"),
                    "result_1x2": outcome,
                    "quality": quality,
                    "guardrails": guardrails,
                    "candidate_action": action,
                    "candidate_fallback_reasons": candidate.get("fallback_reasons") or [],
                    "v0_top": _top_side(v0_probs) if v0_probs else None,
                    "candidate_top": _top_side(candidate_probs) if candidate_probs else None,
                    "market_top": _top_side(market_probs) if market_probs else None,
                    "v0_probs": {k: _r(v) for k, v in (v0_probs or {}).items()},
                    "candidate_probs": {k: _r(v) for k, v in (candidate_probs or {}).items()},
                    "market_probs": {k: _r(v) for k, v in (market_probs or {}).items()},
                    "candidate_lambdas": {
                        "home": candidate.get("lambda_home"),
                        "away": candidate.get("lambda_away"),
                    },
                }
            )

        evaluated += 1

    v0 = _finalize(state["v0"])
    candidate_final = _finalize(state["candidate"])
    market = _finalize(state["market"])

    return {
        "window_days": int(window_days),
        "rows_loaded": len(rows),
        "rows_evaluated": int(evaluated),
        "hist5_count": int(state["hist5_count"]),
        "fallback_to_v0_count": int(state["fallback_to_v0_count"]),
        "context_error_count": int(state["context_error_count"]),
        "summary": {
            "v0": v0,
            "candidate": candidate_final,
            "market": market,
            "delta_candidate_minus_v0": {
                "brier": _delta(candidate_final["brier"], v0["brier"]),
                "logloss": _delta(candidate_final["logloss"], v0["logloss"]),
                "top1_acc": _delta(candidate_final["top1_acc"], v0["top1_acc"]),
                "avg_top_prob": _delta(candidate_final["avg_top_prob"], v0["avg_top_prob"]),
            },
            "delta_candidate_minus_market": {
                "brier": _delta(candidate_final["brier"], market["brier"]),
                "logloss": _delta(candidate_final["logloss"], market["logloss"]),
                "top1_acc": _delta(candidate_final["top1_acc"], market["top1_acc"]),
                "avg_top_prob": _delta(candidate_final["avg_top_prob"], market["avg_top_prob"]),
            },
        },
        "checks": {
            "beats_v0_logloss": (
                candidate_final["logloss"] is not None
                and v0["logloss"] is not None
                and candidate_final["logloss"] < v0["logloss"]
            ),
            "beats_v0_brier": (
                candidate_final["brier"] is not None
                and v0["brier"] is not None
                and candidate_final["brier"] < v0["brier"]
            ),
            "top1_delta_not_worse_than_1pp": (
                candidate_final["top1_acc"] is not None
                and v0["top1_acc"] is not None
                and (candidate_final["top1_acc"] - v0["top1_acc"]) >= -0.01
            ),
        },
        "by_quality": _finalize_nested_segments(state["by_quality"]),
        "by_guardrail": _finalize_nested_segments(state["by_guardrail"]),
        "samples": state["samples"],
        "errors_sample": state["errors_sample"],
    }


def run_windows(
    conn,
    *,
    windows: List[int],
    league_id: Optional[int],
    season: Optional[int],
    cutoff_hours: int,
    artifact_filename: Optional[str],
    min_confidence: str,
    limit: int,
    as_of_mode: str,
    max_goals: int,
    policy_key: str,
    sample_limit: int,
) -> Dict[str, Any]:
    policy = get_hist5_candidate_policy(policy_key)

    results = [
        _evaluate_window(
            conn,
            window_days=int(window),
            league_id=league_id,
            season=season,
            cutoff_hours=int(cutoff_hours),
            artifact_filename=artifact_filename,
            min_confidence=str(min_confidence),
            limit=int(limit),
            as_of_mode=str(as_of_mode),
            max_goals=int(max_goals),
            policy_key=policy.key,
            sample_limit=int(sample_limit),
        )
        for window in windows
    ]

    return {
        "ok": True,
        "connected_to_snapshot": False,
        "calls_external_api": False,
        "mutates_database": False,
        "purpose": "hist5_candidate_v1_window_backtest_diagnostics_only",
        "policy": policy.as_dict(),
        "meta": {
            "league_id": league_id,
            "season": season,
            "windows": [int(w) for w in windows],
            "cutoff_hours": int(cutoff_hours),
            "artifact_filename": artifact_filename,
            "min_confidence": str(min_confidence),
            "limit_per_window": int(limit),
            "as_of_mode": str(as_of_mode),
            "max_goals": int(max_goals),
        },
        "results": results,
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Backtest por janelas da política candidata hist5_candidate_v1.",
    )
    parser.add_argument("--policy-key", default="hist5_candidate_v1")
    parser.add_argument("--windows", default="30,90,180,365,3650")
    parser.add_argument("--league-id", type=int, default=None)
    parser.add_argument("--season", type=int, default=None)
    parser.add_argument("--cutoff-hours", type=int, default=6)
    parser.add_argument("--artifact-filename", default=None)
    parser.add_argument("--min-confidence", default="ILIKE", choices=["NONE", "ILIKE", "EXACT"])
    parser.add_argument("--limit", type=int, default=3000)
    parser.add_argument("--max-goals", type=int, default=6)
    parser.add_argument("--sample-limit", type=int, default=10)
    parser.add_argument(
        "--as-of-mode",
        default="previous_seasons",
        choices=["previous_seasons", "current_available"],
    )
    parser.add_argument("--pretty", action="store_true")
    args = parser.parse_args()

    from src.db.pg import pg_conn

    windows = _parse_windows(args.windows)

    with pg_conn() as conn:
        payload = run_windows(
            conn,
            windows=windows,
            league_id=args.league_id,
            season=args.season,
            cutoff_hours=int(args.cutoff_hours),
            artifact_filename=args.artifact_filename,
            min_confidence=str(args.min_confidence),
            limit=int(args.limit),
            as_of_mode=str(args.as_of_mode),
            max_goals=int(args.max_goals),
            policy_key=str(args.policy_key),
            sample_limit=int(args.sample_limit),
        )

    print(json.dumps(payload, ensure_ascii=False, indent=2 if args.pretty else None, default=str))


if __name__ == "__main__":
    main()