from __future__ import annotations

from datetime import datetime, timezone
from statistics import median
from typing import Any, Dict, List, Optional, Tuple

DECISION_VERSION = "opportunity_decision_v1"

OUTCOMES_HDA = ("H", "D", "A")
SIDE_TO_KEY = {"H": "home", "D": "draw", "A": "away"}
KEY_TO_SIDE = {v: k for k, v in SIDE_TO_KEY.items()}

DEFAULT_DECISION_POLICY: Dict[str, Any] = {
    "version": "static_policy_v1",

    # Margem aplicada sobre a probabilidade do modelo antes de decidir.
    # Ex.: modelo 52%, margem 3.5pp => prob conservadora 48.5%.
    "uncertainty_margin": 0.035,
    "low_confidence_extra_margin": 0.02,

    # Como o hist5 usa confidence em escala mais baixa que o threshold antigo de 0.90,
    # começamos com corte mais realista e vamos tornar isso dinâmico no próximo bloco.
    "min_confidence_for_opportunity": 0.50,

    # safe_edge = best_odd * conservative_prob - 1
    "min_safe_edge_for_opportunity": 0.03,
    "min_safe_edge_for_caution": 0.00,

    "min_complete_books": 5,
    "max_freshness_seconds": 2 * 24 * 60 * 60,

    # Odds altas podem ter valor, mas não devem virar oportunidade forte sem mais filtros.
    "max_odd_for_strong_opportunity": 3.50,

    # Se o modelo divergir demais do mercado, rebaixa para cautela.
    "max_market_disagreement_for_strong": 0.16,

    # Mesmo filtro já usado no produto: evita pegar odd muito fora da mediana.
    "outlier_premium_over_median": 0.15,
}


def _as_float(value: Any) -> Optional[float]:
    try:
        if value is None:
            return None
        out = float(value)
        return out if out == out else None
    except Exception:
        return None


def _as_int(value: Any) -> Optional[int]:
    try:
        if value is None:
            return None
        return int(value)
    except Exception:
        return None


def _round(value: Any, ndigits: int = 6) -> Optional[float]:
    fv = _as_float(value)
    if fv is None:
        return None
    return round(float(fv), int(ndigits))


def _is_valid_decimal_odd(value: Any) -> bool:
    fv = _as_float(value)
    return fv is not None and fv > 1.0


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _parse_utc_iso(value: Any) -> Optional[datetime]:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except Exception:
        return None


def _book_get(book: Any, key: str, default: Any = None) -> Any:
    if isinstance(book, dict):
        return book.get(key, default)
    return getattr(book, key, default)


def _book_odds_1x2(book: Any) -> Dict[str, Any]:
    odds = _book_get(book, "odds_1x2")
    if odds is None:
        odds = _book_get(book, "odds")
    return odds if isinstance(odds, dict) else {}


def _normalize_probs_1x2(probs: Dict[str, Any]) -> Dict[str, Optional[float]]:
    raw = probs or {}
    return {
        "H": _as_float(raw.get("H", raw.get("home"))),
        "D": _as_float(raw.get("D", raw.get("draw"))),
        "A": _as_float(raw.get("A", raw.get("away"))),
    }


def _market_probs_from_odds(home_odd: float, draw_odd: float, away_odd: float) -> Dict[str, Any]:
    raw = {
        "H": 1.0 / float(home_odd),
        "D": 1.0 / float(draw_odd),
        "A": 1.0 / float(away_odd),
    }
    total = raw["H"] + raw["D"] + raw["A"]
    if total <= 0:
        return {"raw": raw, "novig": None, "overround": None}
    return {
        "raw": raw,
        "novig": {side: raw[side] / total for side in OUTCOMES_HDA},
        "overround": total - 1.0,
    }


def consensus_market_probs_from_books_v1(books: List[Any]) -> Dict[str, Any]:
    per_outcome: Dict[str, List[float]] = {"H": [], "D": [], "A": []}
    complete_books_count = 0
    overrounds: List[float] = []

    for book in books or []:
        odds = _book_odds_1x2(book)
        oh = odds.get("H", odds.get("home"))
        od = odds.get("D", odds.get("draw"))
        oa = odds.get("A", odds.get("away"))

        if not (_is_valid_decimal_odd(oh) and _is_valid_decimal_odd(od) and _is_valid_decimal_odd(oa)):
            continue

        market = _market_probs_from_odds(float(oh), float(od), float(oa))
        novig = market.get("novig") or {}
        if any(novig.get(side) is None for side in OUTCOMES_HDA):
            continue

        complete_books_count += 1
        if market.get("overround") is not None:
            overrounds.append(float(market["overround"]))

        for side in OUTCOMES_HDA:
            per_outcome[side].append(float(novig[side]))

    if complete_books_count <= 0:
        return {
            "raw": None,
            "novig": None,
            "overround": None,
            "books_count": 0,
            "source": "median_complete_books_novig",
        }

    consensus_raw = {
        side: float(median(per_outcome[side])) if per_outcome[side] else None
        for side in OUTCOMES_HDA
    }

    total = sum(float(v) for v in consensus_raw.values() if v is not None)
    consensus_novig = (
        {side: float(consensus_raw[side]) / total for side in OUTCOMES_HDA}
        if total > 0 and all(consensus_raw.get(side) is not None for side in OUTCOMES_HDA)
        else None
    )

    return {
        "raw": consensus_raw,
        "novig": consensus_novig,
        "overround": float(median(overrounds)) if overrounds else None,
        "books_count": complete_books_count,
        "source": "median_complete_books_novig",
    }


def select_best_valid_price_for_side_v1(
    books: List[Any],
    side: str,
    *,
    outlier_premium_over_median: float = 0.15,
) -> Dict[str, Any]:
    candidates: List[Dict[str, Any]] = []
    side_key = SIDE_TO_KEY.get(side, side)

    for book in books or []:
        odds = _book_odds_1x2(book)
        odd = odds.get(side, odds.get(side_key))
        if not _is_valid_decimal_odd(odd):
            continue

        candidates.append(
            {
                "odd": float(odd),
                "book_key": _book_get(book, "key"),
                "book_name": _book_get(book, "name"),
                "captured_at_utc": _book_get(book, "captured_at_utc"),
            }
        )

    if not candidates:
        return {
            "books_count": 0,
            "median_odd": None,
            "allowed_max_odd": None,
            "best_odd": None,
            "best_book_key": None,
            "best_book_name": None,
            "best_book_captured_at_utc": None,
            "best_book_freshness_seconds": None,
            "market_min_odd": None,
            "market_max_odd": None,
        }

    odds_values = [float(item["odd"]) for item in candidates]
    median_odd = float(median(odds_values)) if odds_values else None
    allowed_max_odd = (
        float(median_odd) * (1.0 + float(outlier_premium_over_median))
        if median_odd is not None
        else None
    )

    valid_candidates = [
        item
        for item in candidates
        if allowed_max_odd is None or float(item["odd"]) <= float(allowed_max_odd)
    ] or candidates

    best_item = max(valid_candidates, key=lambda item: float(item["odd"]))

    freshness_seconds = None
    captured_dt = _parse_utc_iso(best_item.get("captured_at_utc"))
    if captured_dt is not None:
        freshness_seconds = max(
            0,
            int((datetime.now(timezone.utc) - captured_dt).total_seconds()),
        )

    return {
        "books_count": len(candidates),
        "median_odd": median_odd,
        "allowed_max_odd": allowed_max_odd,
        "best_odd": float(best_item["odd"]),
        "best_book_key": best_item.get("book_key"),
        "best_book_name": best_item.get("book_name"),
        "best_book_captured_at_utc": best_item.get("captured_at_utc"),
        "best_book_freshness_seconds": freshness_seconds,
        "market_min_odd": min(odds_values) if odds_values else None,
        "market_max_odd": max(odds_values) if odds_values else None,
    }


def _fair_odd(prob: Optional[float]) -> Optional[float]:
    p = _as_float(prob)
    if p is None or p <= 0.0 or p >= 1.0:
        return None
    return round(1.0 / p, 4)


def _edge_decimal(prob: Optional[float], odd: Optional[float]) -> Optional[float]:
    p = _as_float(prob)
    o = _as_float(odd)
    if p is None or o is None or p <= 0.0 or o <= 1.0:
        return None
    return round((p * o) - 1.0, 6)


def _top_model_side(probs: Dict[str, Optional[float]]) -> Optional[str]:
    valid = [(side, value) for side, value in probs.items() if value is not None]
    if not valid:
        return None
    return max(valid, key=lambda item: float(item[1]))[0]


def _merge_policy(policy: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    out = dict(DEFAULT_DECISION_POLICY)
    if isinstance(policy, dict):
        out.update({k: v for k, v in policy.items() if v is not None})
    return out


def build_opportunity_decision_v1(
    probs_1x2: Dict[str, Any],
    books: List[Any],
    *,
    confidence_overall: Any = None,
    sport_key: Optional[str] = None,
    league_id: Optional[int] = None,
    model_version: Optional[str] = None,
    policy: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    effective_policy = _merge_policy(policy)

    probs = _normalize_probs_1x2(probs_1x2)
    confidence = _as_float(confidence_overall)

    market = consensus_market_probs_from_books_v1(books or [])
    consensus = market.get("novig") or {}
    books_count = int(market.get("books_count") or 0)

    reasons: List[str] = []
    blocks: List[str] = []

    if any(probs.get(side) is None for side in OUTCOMES_HDA):
        blocks.append("missing_model_probability")

    if not consensus:
        blocks.append("missing_market_consensus")

    if books_count < int(effective_policy["min_complete_books"]):
        blocks.append("not_enough_books")

    top_model_side = _top_model_side(probs)
    top_market_side = (
        _top_model_side({side: _as_float(consensus.get(side)) for side in OUTCOMES_HDA})
        if consensus
        else None
    )

    margin = float(effective_policy["uncertainty_margin"])

    if confidence is None:
        blocks.append("missing_confidence")
        margin += float(effective_policy["low_confidence_extra_margin"])
    elif confidence < float(effective_policy["min_confidence_for_opportunity"]):
        blocks.append("low_model_confidence")
        margin += float(effective_policy["low_confidence_extra_margin"])

    per_side: Dict[str, Dict[str, Any]] = {}
    best_candidate: Optional[Tuple[str, Dict[str, Any]]] = None

    for side in OUTCOMES_HDA:
        model_prob = probs.get(side)
        market_prob = _as_float(consensus.get(side)) if consensus else None

        price = select_best_valid_price_for_side_v1(
            books or [],
            side,
            outlier_premium_over_median=float(effective_policy["outlier_premium_over_median"]),
        )

        best_odd = _as_float(price.get("best_odd"))
        conservative_prob = (
            max(0.01, float(model_prob) - float(margin))
            if model_prob is not None
            else None
        )

        safe_edge = _edge_decimal(conservative_prob, best_odd)
        model_ev = _edge_decimal(model_prob, best_odd)

        edge_vs_market = (
            round(float(model_prob) - float(market_prob), 6)
            if model_prob is not None and market_prob is not None
            else None
        )

        side_data = {
            "outcome": side,
            "outcome_key": SIDE_TO_KEY[side],
            "model_prob": _round(model_prob),
            "market_prob": _round(market_prob),
            "edge_vs_market": _round(edge_vs_market),
            "conservative_prob": _round(conservative_prob),
            "uncertainty_margin": _round(margin),
            "fair_odd": _fair_odd(model_prob),
            "min_acceptable_odd": _fair_odd(conservative_prob),
            "best_available_odd": _round(best_odd, 4),
            "best_book_key": price.get("best_book_key"),
            "best_book_name": price.get("best_book_name"),
            "best_book_captured_at_utc": price.get("best_book_captured_at_utc"),
            "best_book_freshness_seconds": price.get("best_book_freshness_seconds"),
            "safe_edge": _round(safe_edge),
            "model_ev": _round(model_ev),
            "market_min_odd": _round(price.get("market_min_odd"), 4),
            "market_max_odd": _round(price.get("market_max_odd"), 4),
            "median_odd": _round(price.get("median_odd"), 4),
            "allowed_max_odd": _round(price.get("allowed_max_odd"), 4),
            "books_count": int(price.get("books_count") or 0),
        }

        per_side[side] = side_data

        if safe_edge is None:
            continue

        if best_candidate is None:
            best_candidate = (side, side_data)
            continue

        _, old_data = best_candidate
        old_edge = _as_float(old_data.get("safe_edge"))
        old_prob = _as_float(old_data.get("model_prob"))

        if old_edge is None or float(safe_edge) > float(old_edge):
            best_candidate = (side, side_data)
        elif float(safe_edge) == float(old_edge):
            if model_prob is not None and old_prob is not None and float(model_prob) > float(old_prob):
                best_candidate = (side, side_data)

    selected_side = best_candidate[0] if best_candidate else top_model_side
    selected = per_side.get(selected_side or "") or {}

    selected_safe_edge = _as_float(selected.get("safe_edge"))
    selected_odd = _as_float(selected.get("best_available_odd"))
    selected_freshness = _as_int(selected.get("best_book_freshness_seconds"))
    selected_edge_market = _as_float(selected.get("edge_vs_market"))

    if not selected:
        label = "INSUFFICIENT_DATA"
        blocks.append("missing_selected_side")

    elif selected_odd is None:
        label = "INSUFFICIENT_DATA"
        blocks.append("missing_executable_odd")

    elif selected_safe_edge is None:
        label = "INSUFFICIENT_DATA"
        blocks.append("missing_safe_edge")

    else:
        if selected_freshness is not None and selected_freshness > int(effective_policy["max_freshness_seconds"]):
            blocks.append("stale_market_price")

        if selected_odd > float(effective_policy["max_odd_for_strong_opportunity"]):
            blocks.append("high_odd_volatility")

        if (
            selected_edge_market is not None
            and abs(float(selected_edge_market)) > float(effective_policy["max_market_disagreement_for_strong"])
        ):
            blocks.append("large_market_disagreement")

        if selected_safe_edge >= float(effective_policy["min_safe_edge_for_opportunity"]):
            strong_blocks = {
                "missing_model_probability",
                "missing_market_consensus",
                "not_enough_books",
                "missing_confidence",
                "low_model_confidence",
                "stale_market_price",
                "high_odd_volatility",
                "large_market_disagreement",
            }

            if any(block in strong_blocks for block in blocks):
                label = "CAUTION_OPPORTUNITY"
                reasons.append("positive_price_after_safety_margin_but_with_alerts")
            else:
                label = "OPPORTUNITY"
                reasons.append("price_above_conservative_minimum")

        elif selected_safe_edge >= float(effective_policy["min_safe_edge_for_caution"]):
            label = "CAUTION_OPPORTUNITY"
            reasons.append("thin_positive_price_after_safety_margin")

        else:
            top = per_side.get(top_model_side or "") or {}
            top_safe_edge = _as_float(top.get("safe_edge"))
            top_odd = _as_float(top.get("best_available_odd"))
            top_min = _as_float(top.get("min_acceptable_odd"))

            if top_model_side and top_odd is not None and top_min is not None and top_odd < top_min:
                label = "NO_GOOD_PRICE"
                reasons.append("most_likely_side_but_price_too_short")
                selected_side = top_model_side
                selected = top
                selected_safe_edge = top_safe_edge
            else:
                label = "NO_CLEAR_EDGE"
                reasons.append("no_price_above_conservative_minimum")

    if top_model_side and selected_side and selected_side != top_model_side:
        reasons.append("best_price_not_on_most_likely_side")

    if top_model_side and top_market_side and top_model_side == top_market_side:
        reasons.append("model_market_top_side_aligned")
    elif top_model_side and top_market_side and top_model_side != top_market_side:
        reasons.append("model_market_top_side_divergent")

    if label in {"NO_GOOD_PRICE", "NO_CLEAR_EDGE"} and "safe_edge_not_positive" not in blocks:
        blocks.append("safe_edge_not_positive")

    return {
        "version": DECISION_VERSION,
        "generated_at_utc": _utc_now_iso(),
        "label": label,
        "is_positive": label in {"OPPORTUNITY", "CAUTION_OPPORTUNITY"},

        "outcome": selected_side,
        "outcome_key": SIDE_TO_KEY.get(str(selected_side), None),

        "model_version": str(model_version) if model_version else None,
        "sport_key": str(sport_key) if sport_key else None,
        "league_id": int(league_id) if league_id is not None else None,

        "model_prob": selected.get("model_prob"),
        "market_prob": selected.get("market_prob"),
        "edge_vs_market": selected.get("edge_vs_market"),

        "conservative_prob": selected.get("conservative_prob"),
        "uncertainty_margin": selected.get("uncertainty_margin"),

        "fair_odd": selected.get("fair_odd"),
        "min_acceptable_odd": selected.get("min_acceptable_odd"),
        "best_available_odd": selected.get("best_available_odd"),

        "best_book_key": selected.get("best_book_key"),
        "best_book_name": selected.get("best_book_name"),
        "best_book_captured_at_utc": selected.get("best_book_captured_at_utc"),
        "best_book_freshness_seconds": selected.get("best_book_freshness_seconds"),

        "safe_edge": selected.get("safe_edge"),
        "model_ev": selected.get("model_ev"),

        "confidence_overall": _round(confidence),
        "market_books_count": books_count,

        "top_model_side": top_model_side,
        "top_market_side": top_market_side,

        "market_source": str(market.get("source") or "median_complete_books_novig"),

        "reasons": sorted(set(reasons)),
        "blocks": sorted(set(blocks)),
        "per_side": per_side,

        "policy": {
            "version": effective_policy.get("version"),
            "uncertainty_margin": _round(effective_policy.get("uncertainty_margin")),
            "low_confidence_extra_margin": _round(effective_policy.get("low_confidence_extra_margin")),
            "min_safe_edge_for_opportunity": _round(effective_policy.get("min_safe_edge_for_opportunity")),
            "min_safe_edge_for_caution": _round(effective_policy.get("min_safe_edge_for_caution")),
            "min_complete_books": int(effective_policy.get("min_complete_books") or 0),
            "max_freshness_seconds": int(effective_policy.get("max_freshness_seconds") or 0),
            "max_odd_for_strong_opportunity": _round(effective_policy.get("max_odd_for_strong_opportunity"), 4),
            "max_market_disagreement_for_strong": _round(effective_policy.get("max_market_disagreement_for_strong")),
        },
    }