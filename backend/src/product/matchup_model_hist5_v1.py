from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Optional

from src.product.historical_context_v1 import build_match_historical_context
from src.product.matchup_model_v0 import LambdaEstimate, Lambdas
from src.product.score_engine_v1 import generate_score_matrix_v1


MODEL_VERSION = "model_v1_hist5_decay"


QUALITY_POLICY: Dict[str, Dict[str, Any]] = {
    "STRONG": {
        "blend_strength": 1.00,
        "confidence": 0.72,
        "level": "high",
        "recommendation_allowed": True,
    },
    "OK": {
        "blend_strength": 0.75,
        "confidence": 0.62,
        "level": "medium",
        "recommendation_allowed": True,
    },
    "THIN": {
        "blend_strength": 0.45,
        "confidence": 0.46,
        "level": "low",
        "recommendation_allowed": False,
    },
    "CUP_LIKE": {
        "blend_strength": 0.25,
        "confidence": 0.36,
        "level": "low",
        "recommendation_allowed": False,
    },
    "INSUFFICIENT": {
        "blend_strength": 0.00,
        "confidence": 0.25,
        "level": "low",
        "recommendation_allowed": False,
    },
    "UNKNOWN": {
        "blend_strength": 0.00,
        "confidence": 0.20,
        "level": "low",
        "recommendation_allowed": False,
    },
}


def _f(value: Any, default: float = 0.0) -> float:
    try:
        return float(default if value is None else value)
    except Exception:
        return float(default)


def _clamp(v: float, low: float, high: float) -> float:
    return min(max(float(v), float(low)), float(high))


def _r(value: Any, digits: int = 6) -> float:
    return round(float(value), int(digits))


def _policy_for_quality(quality: str, guardrails: list[str]) -> Dict[str, Any]:
    q = str(quality or "UNKNOWN")
    policy = dict(QUALITY_POLICY.get(q, QUALITY_POLICY["UNKNOWN"]))

    if "cup_like_league_history" in guardrails and q not in {"CUP_LIKE", "INSUFFICIENT"}:
        policy["blend_strength"] = min(float(policy["blend_strength"]), 0.35)
        policy["confidence"] = min(float(policy["confidence"]), 0.40)
        policy["level"] = "low"
        policy["recommendation_allowed"] = False

    if "thin_or_insufficient_history" in guardrails:
        policy["recommendation_allowed"] = False

    return policy


def _blend_from_prior(prior: float, preview: float, strength: float) -> float:
    w = _clamp(float(strength), 0.0, 1.0)
    return float(prior) + w * (float(preview) - float(prior))


def probs_1x2_from_lambdas(*, lam_home: float, lam_away: float, max_goals: int = 6) -> Dict[str, float]:
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


def estimate_lambdas_hist5_decay(
    conn,
    *,
    league_id: int,
    season: int,
    home_team_id: int,
    away_team_id: int,
    profile_key: str = MODEL_VERSION,
    as_of_mode: str = "current_available",
    clamp_min: float = 0.15,
    clamp_max: float = 4.50,
) -> LambdaEstimate:
    """
    Estimador experimental hist5.

    as_of_mode:
      - current_available: usa a janela histórica resolvida a partir da season informada.
        Útil para inspeção/smoke do modelo.
      - previous_seasons: usa season - 1 como alvo histórico.
        Útil para backtest sem vazar estatísticas finais da própria temporada do evento.

    Importante:
      - Não grava no banco.
      - Não altera snapshot.
      - Não substitui model_v0.
    """

    mode = str(as_of_mode or "current_available").strip()

    if mode not in {"current_available", "previous_seasons"}:
        raise ValueError("as_of_mode must be 'current_available' or 'previous_seasons'")

    requested_history_season = int(season) - 1 if mode == "previous_seasons" else int(season)

    context = build_match_historical_context(
        conn,
        league_id=int(league_id),
        season=int(requested_history_season),
        home_team_id=int(home_team_id),
        away_team_id=int(away_team_id),
        profile_key=str(profile_key),
    )

    if context.get("status") != "ok":
        lambdas = Lambdas(lam_home=1.35, lam_away=1.10)
        return LambdaEstimate(
            lambdas=lambdas,
            source="hist5_fixed_prior",
            diagnostics={
                "model_version": MODEL_VERSION,
                "as_of_mode": mode,
                "requested_history_season": int(requested_history_season),
                "status": context.get("status"),
                "context": context,
                "confidence": {
                    "overall": 0.20,
                    "level": "low",
                    "recommendation_allowed": False,
                    "reasons": ["historical_context_unavailable"],
                },
            },
        )

    league_prior = context.get("league_prior") or {}
    lambda_preview = context.get("lambda_preview") or {}
    guardrails = list(context.get("guardrails") or [])
    quality = str(context.get("match_history_quality") or "UNKNOWN")
    policy = _policy_for_quality(quality, guardrails)

    prior_home = _f(league_prior.get("mu_home"), 1.35)
    prior_away = _f(league_prior.get("mu_away"), 1.10)

    preview_home = _f(lambda_preview.get("lambda_home_preview"), prior_home)
    preview_away = _f(lambda_preview.get("lambda_away_preview"), prior_away)

    blend_strength = float(policy["blend_strength"])

    lam_home = _blend_from_prior(prior_home, preview_home, blend_strength)
    lam_away = _blend_from_prior(prior_away, preview_away, blend_strength)

    lam_home = _clamp(lam_home, clamp_min, clamp_max)
    lam_away = _clamp(lam_away, clamp_min, clamp_max)

    lambdas = Lambdas(lam_home=float(lam_home), lam_away=float(lam_away))

    reasons = []
    if guardrails:
        reasons.extend(guardrails)
    if quality in {"THIN", "CUP_LIKE", "INSUFFICIENT", "UNKNOWN"}:
        reasons.append(f"history_quality_{quality.lower()}")

    confidence = {
        "overall": _r(policy["confidence"], 4),
        "level": str(policy["level"]),
        "recommendation_allowed": bool(policy["recommendation_allowed"]),
        "quality": quality,
        "blend_strength": _r(blend_strength, 4),
        "guardrails": guardrails,
        "reasons": sorted(set(str(r) for r in reasons if r)),
    }

    return LambdaEstimate(
        lambdas=lambdas,
        source="hist5_decay",
        diagnostics={
            "model_version": MODEL_VERSION,
            "as_of_mode": mode,
            "requested_event_season": int(season),
            "requested_history_season": int(requested_history_season),
            "target_history_season": context.get("target_season"),
            "league_id": int(league_id),
            "home_team_id": int(home_team_id),
            "away_team_id": int(away_team_id),
            "match_history_quality": quality,
            "guardrails": guardrails,
            "blend_strength": _r(blend_strength, 4),
            "league_prior_lambda_home": _r(prior_home, 4),
            "league_prior_lambda_away": _r(prior_away, 4),
            "preview_lambda_home": _r(preview_home, 4),
            "preview_lambda_away": _r(preview_away, 4),
            "lambda_home": _r(lam_home, 4),
            "lambda_away": _r(lam_away, 4),
            "confidence": confidence,
            "historical_context": context,
        },
    )


def build_hist5_model_payload(
    conn,
    *,
    league_id: int,
    season: int,
    home_team_id: int,
    away_team_id: int,
    as_of_mode: str = "current_available",
    max_goals: int = 6,
) -> Dict[str, Any]:
    estimate = estimate_lambdas_hist5_decay(
        conn,
        league_id=int(league_id),
        season=int(season),
        home_team_id=int(home_team_id),
        away_team_id=int(away_team_id),
        as_of_mode=str(as_of_mode),
    )

    probs = probs_1x2_from_lambdas(
        lam_home=float(estimate.lambdas.lam_home),
        lam_away=float(estimate.lambdas.lam_away),
        max_goals=int(max_goals),
    )

    return {
        "model_version": MODEL_VERSION,
        "source": estimate.source,
        "inputs": {
            "league_id": int(league_id),
            "season": int(season),
            "home_team_id": int(home_team_id),
            "away_team_id": int(away_team_id),
            "lambda_home": _r(estimate.lambdas.lam_home),
            "lambda_away": _r(estimate.lambdas.lam_away),
            "lambda_total": _r(estimate.lambdas.lam_home + estimate.lambdas.lam_away),
            "as_of_mode": str(as_of_mode),
        },
        "markets": {
            "1x2": {
                "p_model": {
                    "H": _r(probs["H"]),
                    "D": _r(probs["D"]),
                    "A": _r(probs["A"]),
                }
            }
        },
        "diagnostics": estimate.diagnostics,
        "generated_at_utc": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    }