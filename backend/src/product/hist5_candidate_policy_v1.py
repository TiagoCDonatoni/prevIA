from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple


DEFAULT_HIST5_CANDIDATE_POLICY_KEY = "hist5_candidate_v1"


@dataclass(frozen=True)
class Hist5CandidatePolicy:
    key: str
    description: str
    factor_cap: float
    blend_by_quality: Dict[str, float]
    fallback_qualities: Tuple[str, ...]
    fallback_guardrails: Tuple[str, ...]

    def as_dict(self) -> Dict[str, Any]:
        return {
            "key": self.key,
            "description": self.description,
            "factor_cap": float(self.factor_cap),
            "blend_by_quality": dict(self.blend_by_quality),
            "fallback_qualities": list(self.fallback_qualities),
            "fallback_guardrails": list(self.fallback_guardrails),
        }


POLICIES: Dict[str, Hist5CandidatePolicy] = {
    "hist5_candidate_v1": Hist5CandidatePolicy(
        key="hist5_candidate_v1",
        description=(
            "Política candidata baseada no grid: usa hist5 com cap 20%, "
            "blend STRONG=1.00 OK=0.85 THIN=0.50, mantém INSUFFICIENT no prior "
            "e faz fallback para v0 apenas em competições CUP_LIKE."
        ),
        factor_cap=0.20,
        blend_by_quality={
            "STRONG": 1.00,
            "OK": 0.85,
            "THIN": 0.50,
            "CUP_LIKE": 0.00,
            "INSUFFICIENT": 0.00,
            "UNKNOWN": 0.00,
        },
        fallback_qualities=("CUP_LIKE",),
        fallback_guardrails=("cup_like_league_history",),
    )
}


def _f(value: Any, default: float = 0.0) -> float:
    try:
        return float(default if value is None else value)
    except Exception:
        return float(default)


def _r(value: Any, digits: int = 6) -> float:
    return round(float(value), int(digits))


def _clamp(value: float, low: float, high: float) -> float:
    return min(max(float(value), float(low)), float(high))


def get_hist5_candidate_policy(
    key: str = DEFAULT_HIST5_CANDIDATE_POLICY_KEY,
) -> Hist5CandidatePolicy:
    policy = POLICIES.get(str(key))

    if policy is None:
        raise KeyError(f"Unknown hist5 candidate policy: {key}")

    return policy


def list_hist5_candidate_policies() -> Dict[str, Dict[str, Any]]:
    return {key: policy.as_dict() for key, policy in sorted(POLICIES.items())}


def should_fallback_to_v0(
    context: Dict[str, Any],
    *,
    policy: Optional[Hist5CandidatePolicy] = None,
) -> Tuple[bool, List[str]]:
    policy = policy or get_hist5_candidate_policy()

    reasons: List[str] = []

    if context.get("status") != "ok":
        reasons.append(f"context_status_{context.get('status') or 'unknown'}")
        return True, reasons

    quality = str(context.get("match_history_quality") or "UNKNOWN")
    guardrails = [str(g) for g in list(context.get("guardrails") or [])]

    if quality in set(policy.fallback_qualities):
        reasons.append(f"quality_{quality.lower()}")

    for guardrail in guardrails:
        if guardrail in set(policy.fallback_guardrails):
            reasons.append(str(guardrail))

    return bool(reasons), sorted(set(reasons))


def estimate_hist5_candidate_from_context(
    context: Dict[str, Any],
    *,
    policy: Optional[Hist5CandidatePolicy] = None,
) -> Dict[str, Any]:
    """
    Calcula lambdas candidatas a partir do historical_context_v1.

    Importante:
    - Não chama API.
    - Não grava banco.
    - Não conecta snapshot.
    - Se a política decidir fallback, apenas retorna action=fallback_to_v0.
      O chamador decide como obter o v0.
    """
    policy = policy or get_hist5_candidate_policy()

    quality = str(context.get("match_history_quality") or "UNKNOWN")
    guardrails = [str(g) for g in list(context.get("guardrails") or [])]

    fallback, fallback_reasons = should_fallback_to_v0(context, policy=policy)

    if fallback:
        return {
            "status": "ok",
            "action": "fallback_to_v0",
            "source": "hist5_candidate_policy",
            "policy": policy.as_dict(),
            "quality": quality,
            "guardrails": guardrails,
            "fallback_reasons": fallback_reasons,
            "lambda_home": None,
            "lambda_away": None,
        }

    league_prior = context.get("league_prior") or {}
    lambda_preview = context.get("lambda_preview") or {}

    prior_home = _f(league_prior.get("mu_home"), 1.35)
    prior_away = _f(league_prior.get("mu_away"), 1.10)

    raw_home_attack = _f(lambda_preview.get("home_attack_factor_raw"), 1.0)
    raw_home_defense = _f(lambda_preview.get("home_defense_factor_raw"), 1.0)
    raw_away_attack = _f(lambda_preview.get("away_attack_factor_raw"), 1.0)
    raw_away_defense = _f(lambda_preview.get("away_defense_factor_raw"), 1.0)

    cap = float(policy.factor_cap)
    low = 1.0 - cap
    high = 1.0 + cap

    home_attack = _clamp(raw_home_attack, low, high)
    home_defense = _clamp(raw_home_defense, low, high)
    away_attack = _clamp(raw_away_attack, low, high)
    away_defense = _clamp(raw_away_defense, low, high)

    preview_home = prior_home * home_attack * away_defense
    preview_away = prior_away * away_attack * home_defense

    blend = _clamp(_f(policy.blend_by_quality.get(quality), 0.0), 0.0, 1.0)

    lambda_home = prior_home + blend * (preview_home - prior_home)
    lambda_away = prior_away + blend * (preview_away - prior_away)

    lambda_home = _clamp(lambda_home, 0.15, 4.50)
    lambda_away = _clamp(lambda_away, 0.15, 4.50)

    return {
        "status": "ok",
        "action": "use_hist5",
        "source": "hist5_candidate_policy",
        "policy": policy.as_dict(),
        "quality": quality,
        "guardrails": guardrails,
        "fallback_reasons": [],
        "blend": _r(blend, 4),
        "factor_cap": _r(cap, 4),
        "prior_lambda_home": _r(prior_home, 4),
        "prior_lambda_away": _r(prior_away, 4),
        "preview_lambda_home": _r(preview_home, 4),
        "preview_lambda_away": _r(preview_away, 4),
        "lambda_home": _r(lambda_home, 6),
        "lambda_away": _r(lambda_away, 6),
        "factors": {
            "home_attack_raw": _r(raw_home_attack, 4),
            "home_defense_raw": _r(raw_home_defense, 4),
            "away_attack_raw": _r(raw_away_attack, 4),
            "away_defense_raw": _r(raw_away_defense, 4),
            "home_attack_capped": _r(home_attack, 4),
            "home_defense_capped": _r(home_defense, 4),
            "away_attack_capped": _r(away_attack, 4),
            "away_defense_capped": _r(away_defense, 4),
        },
    }