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


def _clamp(v: float, low: float, high: float) -> float:
    return min(max(float(v), float(low)), float(high))


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


def _probs_from_lambdas(*, lam_home: float, lam_away: float, max_goals: int = 6) -> Dict[str, float]:
    matrix = generate_score_matrix_v1(
        lam_home=float(lam_home),
        lam_away=float(lam_away),
        max_goals=int(max_goals),
    )

    return {
        "H": float(matrix.prob_home_win),
        "D": float(matrix.prob_draw),
        "A": float(matrix.prob_away_win),
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


def _default_variants() -> List[Dict[str, Any]]:
    """
    Variants intencionalmente pequenas e interpretáveis.

    factor_cap:
      controla quanto os fatores históricos podem se afastar de 1.0.

    blend:
      controla quanto da lambda ajustada entra contra o prior da liga.

    fallback_qualities/fallback_guardrails:
      permite testar quando é melhor cair para v0 em vez de usar hist5 ruim.
    """
    return [
        {
            "key": "baseline_patch6",
            "description": "Política usada no Patch 6.",
            "factor_cap": 0.15,
            "blend": {
                "STRONG": 1.00,
                "OK": 0.75,
                "THIN": 0.45,
                "CUP_LIKE": 0.25,
                "INSUFFICIENT": 0.00,
                "UNKNOWN": 0.00,
            },
            "fallback_qualities": [],
            "fallback_guardrails": [],
        },
        {
            "key": "prior_only",
            "description": "Usa apenas prior histórico da liga.",
            "factor_cap": 0.15,
            "blend": {
                "STRONG": 0.00,
                "OK": 0.00,
                "THIN": 0.00,
                "CUP_LIKE": 0.00,
                "INSUFFICIENT": 0.00,
                "UNKNOWN": 0.00,
            },
            "fallback_qualities": [],
            "fallback_guardrails": [],
        },
        {
            "key": "balanced_cap20",
            "description": "Mais liberdade no fator histórico, ainda conservador em THIN.",
            "factor_cap": 0.20,
            "blend": {
                "STRONG": 1.00,
                "OK": 0.85,
                "THIN": 0.50,
                "CUP_LIKE": 0.00,
                "INSUFFICIENT": 0.00,
                "UNKNOWN": 0.00,
            },
            "fallback_qualities": [],
            "fallback_guardrails": [],
        },
        {
            "key": "balanced_cap25",
            "description": "Cap 25%, tentando recuperar top1 sem exagerar.",
            "factor_cap": 0.25,
            "blend": {
                "STRONG": 1.00,
                "OK": 0.90,
                "THIN": 0.55,
                "CUP_LIKE": 0.00,
                "INSUFFICIENT": 0.00,
                "UNKNOWN": 0.00,
            },
            "fallback_qualities": [],
            "fallback_guardrails": [],
        },
        {
            "key": "aggressive_regular_cap25",
            "description": "Mais agressivo em OK/THIN; bloqueia CUP/INSUFFICIENT.",
            "factor_cap": 0.25,
            "blend": {
                "STRONG": 1.00,
                "OK": 1.00,
                "THIN": 0.70,
                "CUP_LIKE": 0.00,
                "INSUFFICIENT": 0.00,
                "UNKNOWN": 0.00,
            },
            "fallback_qualities": [],
            "fallback_guardrails": [],
        },
        {
            "key": "aggressive_regular_cap30",
            "description": "Mais liberdade para ver se recupera top1.",
            "factor_cap": 0.30,
            "blend": {
                "STRONG": 1.00,
                "OK": 1.00,
                "THIN": 0.75,
                "CUP_LIKE": 0.00,
                "INSUFFICIENT": 0.00,
                "UNKNOWN": 0.00,
            },
            "fallback_qualities": [],
            "fallback_guardrails": [],
        },
        {
            "key": "bad_history_to_v0",
            "description": "Hist5 para dados úteis; v0 quando qualidade é CUP_LIKE/INSUFFICIENT.",
            "factor_cap": 0.20,
            "blend": {
                "STRONG": 1.00,
                "OK": 0.85,
                "THIN": 0.50,
                "CUP_LIKE": 0.00,
                "INSUFFICIENT": 0.00,
                "UNKNOWN": 0.00,
            },
            "fallback_qualities": ["CUP_LIKE", "INSUFFICIENT"],
            "fallback_guardrails": [],
        },
        {
            "key": "guardrails_to_v0",
            "description": "Hist5 só quando não há guardrail; caso contrário v0.",
            "factor_cap": 0.20,
            "blend": {
                "STRONG": 1.00,
                "OK": 0.85,
                "THIN": 0.50,
                "CUP_LIKE": 0.00,
                "INSUFFICIENT": 0.00,
                "UNKNOWN": 0.00,
            },
            "fallback_qualities": [],
            "fallback_guardrails": [
                "cup_like_league_history",
                "thin_or_insufficient_history",
            ],
        },
        {
            "key": "cup_only_to_v0",
            "description": "Só evita ligas tipo copa; mantém hist5 em THIN/INSUFFICIENT.",
            "factor_cap": 0.20,
            "blend": {
                "STRONG": 1.00,
                "OK": 0.85,
                "THIN": 0.50,
                "CUP_LIKE": 0.00,
                "INSUFFICIENT": 0.00,
                "UNKNOWN": 0.00,
            },
            "fallback_qualities": ["CUP_LIKE"],
            "fallback_guardrails": ["cup_like_league_history"],
        },
        {
            "key": "thin_soft_bad_to_v0",
            "description": "THIN mais suave; CUP/INSUFFICIENT voltam para v0.",
            "factor_cap": 0.20,
            "blend": {
                "STRONG": 1.00,
                "OK": 0.80,
                "THIN": 0.35,
                "CUP_LIKE": 0.00,
                "INSUFFICIENT": 0.00,
                "UNKNOWN": 0.00,
            },
            "fallback_qualities": ["CUP_LIKE", "INSUFFICIENT"],
            "fallback_guardrails": ["cup_like_league_history"],
        },
        {
            "key": "ok_strong_only",
            "description": "Usa hist5 apenas em STRONG/OK; THIN e piores ficam no prior.",
            "factor_cap": 0.20,
            "blend": {
                "STRONG": 1.00,
                "OK": 0.85,
                "THIN": 0.00,
                "CUP_LIKE": 0.00,
                "INSUFFICIENT": 0.00,
                "UNKNOWN": 0.00,
            },
            "fallback_qualities": [],
            "fallback_guardrails": [],
        },
        {
            "key": "ok_strong_only_bad_to_v0",
            "description": "Hist5 só em STRONG/OK; CUP/INSUFFICIENT voltam para v0.",
            "factor_cap": 0.20,
            "blend": {
                "STRONG": 1.00,
                "OK": 0.85,
                "THIN": 0.00,
                "CUP_LIKE": 0.00,
                "INSUFFICIENT": 0.00,
                "UNKNOWN": 0.00,
            },
            "fallback_qualities": ["CUP_LIKE", "INSUFFICIENT"],
            "fallback_guardrails": ["cup_like_league_history"],
        },
    ]


def _variant_lambdas_from_context(
    context: Dict[str, Any],
    *,
    variant: Dict[str, Any],
) -> Tuple[float, float, Dict[str, Any]]:
    league_prior = context.get("league_prior") or {}
    lambda_preview = context.get("lambda_preview") or {}

    prior_home = _f(league_prior.get("mu_home"), 1.35)
    prior_away = _f(league_prior.get("mu_away"), 1.10)

    raw_home_attack = _f(lambda_preview.get("home_attack_factor_raw"), 1.0)
    raw_home_defense = _f(lambda_preview.get("home_defense_factor_raw"), 1.0)
    raw_away_attack = _f(lambda_preview.get("away_attack_factor_raw"), 1.0)
    raw_away_defense = _f(lambda_preview.get("away_defense_factor_raw"), 1.0)

    cap = _f(variant.get("factor_cap"), 0.15)

    low = 1.0 - cap
    high = 1.0 + cap

    home_attack = _clamp(raw_home_attack, low, high)
    home_defense = _clamp(raw_home_defense, low, high)
    away_attack = _clamp(raw_away_attack, low, high)
    away_defense = _clamp(raw_away_defense, low, high)

    preview_home = prior_home * home_attack * away_defense
    preview_away = prior_away * away_attack * home_defense

    quality = str(context.get("match_history_quality") or "UNKNOWN")
    blend_map = variant.get("blend") or {}
    blend = _clamp(_f(blend_map.get(quality), 0.0), 0.0, 1.0)

    lam_home = prior_home + blend * (preview_home - prior_home)
    lam_away = prior_away + blend * (preview_away - prior_away)

    lam_home = _clamp(lam_home, 0.15, 4.50)
    lam_away = _clamp(lam_away, 0.15, 4.50)

    diagnostics = {
        "quality": quality,
        "factor_cap": cap,
        "blend": blend,
        "prior_home": _r(prior_home, 4),
        "prior_away": _r(prior_away, 4),
        "preview_home": _r(preview_home, 4),
        "preview_away": _r(preview_away, 4),
        "lambda_home": _r(lam_home, 4),
        "lambda_away": _r(lam_away, 4),
    }

    return float(lam_home), float(lam_away), diagnostics


def _variant_probs(
    row: Dict[str, Any],
    context: Dict[str, Any],
    *,
    variant: Dict[str, Any],
    max_goals: int,
) -> Tuple[Optional[Dict[str, float]], Dict[str, Any]]:
    v0_probs = _side_probs_from_row(row, "p_model")

    if context.get("status") != "ok":
        return v0_probs, {
            "source": "fallback_to_v0",
            "reason": "context_not_ok",
            "context_status": context.get("status"),
        }

    quality = str(context.get("match_history_quality") or "UNKNOWN")
    guardrails = [str(g) for g in list(context.get("guardrails") or [])]

    fallback_qualities = set(str(q) for q in (variant.get("fallback_qualities") or []))
    fallback_guardrails = set(str(g) for g in (variant.get("fallback_guardrails") or []))

    should_fallback = quality in fallback_qualities or bool(fallback_guardrails.intersection(guardrails))

    if should_fallback:
        return v0_probs, {
            "source": "fallback_to_v0",
            "quality": quality,
            "guardrails": guardrails,
            "fallback_qualities": sorted(fallback_qualities),
            "fallback_guardrails": sorted(fallback_guardrails),
        }

    lam_home, lam_away, diag = _variant_lambdas_from_context(context, variant=variant)

    probs = _probs_from_lambdas(
        lam_home=lam_home,
        lam_away=lam_away,
        max_goals=int(max_goals),
    )

    return probs, {
        "source": "hist5_grid",
        "quality": quality,
        "guardrails": guardrails,
        **diag,
    }


def _context_for_row(conn, row: Dict[str, Any], *, as_of_mode: str) -> Dict[str, Any]:
    mode = str(as_of_mode or "previous_seasons")

    if mode not in {"previous_seasons", "current_available"}:
        raise ValueError("as_of_mode must be 'previous_seasons' or 'current_available'")

    season = int(row["season"])
    requested_history_season = season - 1 if mode == "previous_seasons" else season

    return build_match_historical_context(
        conn,
        league_id=int(row["league_id"]),
        season=int(requested_history_season),
        home_team_id=int(row["home_team_id"]),
        away_team_id=int(row["away_team_id"]),
        profile_key="model_v1_hist5_decay",
    )


def _new_variant_state() -> Dict[str, Any]:
    return {
        "metrics": _new_metric_bucket(),
        "by_quality": {},
        "by_guardrail": {},
        "fallback_count": 0,
        "hist5_count": 0,
    }


def _add_segment_metric(
    state: Dict[str, Any],
    *,
    quality: str,
    guardrails: List[str],
    probs: Optional[Dict[str, float]],
    outcome: str,
) -> None:
    state["by_quality"].setdefault(str(quality), _new_metric_bucket())
    _add_metrics(state["by_quality"][str(quality)], probs, outcome)

    guardrail_keys = guardrails or ["none"]

    for guardrail in guardrail_keys:
        state["by_guardrail"].setdefault(str(guardrail), _new_metric_bucket())
        _add_metrics(state["by_guardrail"][str(guardrail)], probs, outcome)


def _finalize_segments(raw: Dict[str, Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    return {key: _finalize(bucket) for key, bucket in sorted(raw.items())}


def _load_custom_variants(path: Optional[str]) -> Optional[List[Dict[str, Any]]]:
    if not path:
        return None

    with open(path, "r", encoding="utf-8") as fh:
        payload = json.load(fh)

    if isinstance(payload, list):
        return payload

    if isinstance(payload, dict) and isinstance(payload.get("variants"), list):
        return payload["variants"]

    raise ValueError("Custom variants file must be a list or an object with a 'variants' list")


def run_grid(
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
    max_goals: int,
    top_n: int,
    variant_keys: Optional[List[str]],
    variants_file: Optional[str],
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

    variants = _load_custom_variants(variants_file) or _default_variants()

    if variant_keys:
        wanted = set(str(k) for k in variant_keys)
        variants = [v for v in variants if str(v.get("key")) in wanted]

    if not variants:
        raise ValueError("No variants selected")

    baseline = {
        "v0": _new_metric_bucket(),
        "market": _new_metric_bucket(),
    }

    states = {str(v["key"]): _new_variant_state() for v in variants}
    contexts_by_event: Dict[str, Dict[str, Any]] = {}
    context_errors: List[Dict[str, Any]] = []

    rows_evaluated = 0

    for row in rows:
        outcome = str(row.get("result_1x2") or "")

        if outcome not in SIDES:
            continue

        v0_probs = _side_probs_from_row(row, "p_model")
        market_probs = _side_probs_from_row(row, "p_mkt")

        _add_metrics(baseline["v0"], v0_probs, outcome)
        _add_metrics(baseline["market"], market_probs, outcome)

        try:
            context = _context_for_row(conn, row, as_of_mode=as_of_mode)
        except Exception as exc:
            context = {
                "status": "error",
                "error": str(exc),
                "match_history_quality": "UNKNOWN",
                "guardrails": ["historical_context_error"],
            }
            context_errors.append(
                {
                    "event_id": row.get("event_id"),
                    "league_id": row.get("league_id"),
                    "season": row.get("season"),
                    "error": str(exc),
                }
            )

        contexts_by_event[str(row["event_id"])] = context

        quality = str(context.get("match_history_quality") or "UNKNOWN")
        guardrails = [str(g) for g in list(context.get("guardrails") or [])]

        for variant in variants:
            key = str(variant["key"])
            probs, diag = _variant_probs(
                row,
                context,
                variant=variant,
                max_goals=int(max_goals),
            )

            source = str(diag.get("source") or "")
            if source == "fallback_to_v0":
                states[key]["fallback_count"] += 1
            elif source == "hist5_grid":
                states[key]["hist5_count"] += 1

            _add_metrics(states[key]["metrics"], probs, outcome)
            _add_segment_metric(
                states[key],
                quality=quality,
                guardrails=guardrails,
                probs=probs,
                outcome=outcome,
            )

        rows_evaluated += 1

    v0_final = _finalize(baseline["v0"])
    market_final = _finalize(baseline["market"])

    ranked: List[Dict[str, Any]] = []

    for variant in variants:
        key = str(variant["key"])
        state = states[key]
        summary = _finalize(state["metrics"])

        ranked.append(
            {
                "key": key,
                "description": str(variant.get("description") or ""),
                "factor_cap": _f(variant.get("factor_cap"), 0.0),
                "blend": variant.get("blend") or {},
                "fallback_qualities": variant.get("fallback_qualities") or [],
                "fallback_guardrails": variant.get("fallback_guardrails") or [],
                "summary": summary,
                "delta_vs_v0": {
                    "brier": _delta(summary["brier"], v0_final["brier"]),
                    "logloss": _delta(summary["logloss"], v0_final["logloss"]),
                    "top1_acc": _delta(summary["top1_acc"], v0_final["top1_acc"]),
                    "avg_top_prob": _delta(summary["avg_top_prob"], v0_final["avg_top_prob"]),
                },
                "delta_vs_market": {
                    "brier": _delta(summary["brier"], market_final["brier"]),
                    "logloss": _delta(summary["logloss"], market_final["logloss"]),
                    "top1_acc": _delta(summary["top1_acc"], market_final["top1_acc"]),
                    "avg_top_prob": _delta(summary["avg_top_prob"], market_final["avg_top_prob"]),
                },
                "hist5_count": int(state["hist5_count"]),
                "fallback_count": int(state["fallback_count"]),
            }
        )

    ranked.sort(
        key=lambda item: (
            999.0 if item["summary"]["logloss"] is None else float(item["summary"]["logloss"]),
            999.0 if item["summary"]["brier"] is None else float(item["summary"]["brier"]),
            -999.0 if item["summary"]["top1_acc"] is None else -float(item["summary"]["top1_acc"]),
        )
    )

    top_details: Dict[str, Any] = {}

    for item in ranked[: int(top_n)]:
        key = str(item["key"])
        state = states[key]
        top_details[key] = {
            "by_quality": _finalize_segments(state["by_quality"]),
            "by_guardrail": _finalize_segments(state["by_guardrail"]),
        }

    return {
        "ok": True,
        "connected_to_snapshot": False,
        "calls_external_api": False,
        "mutates_database": False,
        "purpose": "hist5_policy_grid_diagnostics_only",
        "meta": {
            "league_id": league_id,
            "season": season,
            "window_days": int(window_days),
            "cutoff_hours": int(cutoff_hours),
            "artifact_filename": artifact_filename,
            "min_confidence": str(min_confidence),
            "limit": int(limit),
            "as_of_mode": str(as_of_mode),
            "max_goals": int(max_goals),
            "rows_loaded": len(rows),
            "rows_evaluated": int(rows_evaluated),
            "variant_count": len(variants),
            "context_errors": len(context_errors),
        },
        "baseline": {
            "v0": v0_final,
            "market": market_final,
        },
        "ranked_variants": ranked,
        "top_variant_details": top_details,
        "context_errors_sample": context_errors[:20],
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Tuning desconectado de políticas hist5 contra odds.audit_predictions.",
    )
    parser.add_argument("--league-id", type=int, default=None)
    parser.add_argument("--season", type=int, default=None)
    parser.add_argument("--window-days", type=int, default=3650)
    parser.add_argument("--cutoff-hours", type=int, default=6)
    parser.add_argument("--artifact-filename", default=None)
    parser.add_argument("--min-confidence", default="ILIKE", choices=["NONE", "ILIKE", "EXACT"])
    parser.add_argument("--limit", type=int, default=3000)
    parser.add_argument("--max-goals", type=int, default=6)
    parser.add_argument("--top-n", type=int, default=5)
    parser.add_argument(
        "--as-of-mode",
        default="previous_seasons",
        choices=["previous_seasons", "current_available"],
        help=(
            "previous_seasons evita vazamento usando season-1 como alvo histórico; "
            "current_available é apenas sanity check e pode vazar dados finais da temporada."
        ),
    )
    parser.add_argument(
        "--variant-key",
        action="append",
        default=[],
        help="Filtra uma ou mais variantes pelo key. Pode repetir.",
    )
    parser.add_argument(
        "--variants-file",
        default=None,
        help="Arquivo JSON opcional com lista customizada de variants.",
    )
    parser.add_argument("--pretty", action="store_true")
    args = parser.parse_args()

    from src.db.pg import pg_conn

    with pg_conn() as conn:
        payload = run_grid(
            conn,
            league_id=args.league_id,
            season=args.season,
            window_days=int(args.window_days),
            cutoff_hours=int(args.cutoff_hours),
            artifact_filename=args.artifact_filename,
            min_confidence=str(args.min_confidence),
            limit=int(args.limit),
            as_of_mode=str(args.as_of_mode),
            max_goals=int(args.max_goals),
            top_n=int(args.top_n),
            variant_keys=[str(v) for v in args.variant_key] if args.variant_key else None,
            variants_file=args.variants_file,
        )

    print(json.dumps(payload, ensure_ascii=False, indent=2 if args.pretty else None, default=str))


if __name__ == "__main__":
    main()