from __future__ import annotations

import hashlib
from datetime import datetime, timezone
from typing import Any, Dict, Optional, Tuple

NARRATIVE_CONTEXT_VERSION = "narrative_context_v2"
NARRATIVE_CONTEXT_TONE = "natural_multilang_v2"
MIN_SEASON_GAMES = 5
MIN_SPLIT_GAMES = 3
MIN_H2H_GAMES = 3


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _as_int(v: Any) -> Optional[int]:
    try:
        return int(v) if v is not None else None
    except Exception:
        return None


def _pct(points: Optional[int], played: Optional[int]) -> Optional[float]:
    if points is None or played is None or int(played) <= 0:
        return None
    return round((float(points) / (float(played) * 3.0)) * 100.0, 1)


def _fmt_pct(v: Optional[float]) -> str:
    return "n/d" if v is None else f"{float(v):.1f}%".replace(".", ",")


def _team(name: Optional[str], fallback: str) -> str:
    s = str(name or "").strip()
    return s or fallback





def _word(n: Optional[int], singular: str, plural: str) -> str:
    return singular if int(n or 0) == 1 else plural


def _as_float(v: Any) -> Optional[float]:
    try:
        return float(v) if v is not None else None
    except Exception:
        return None


def _edge_from_delta(left: Optional[float], right: Optional[float], *, clear: float = 15.0, slight: float = 7.5) -> str:
    if left is None or right is None:
        return "unknown"
    delta = float(left) - float(right)
    if delta >= clear:
        return "home_clear"
    if delta >= slight:
        return "home_slight"
    if delta <= -clear:
        return "away_clear"
    if delta <= -slight:
        return "away_slight"
    return "balanced"


def _context_side_from_edges(*edges: str) -> str:
    score = 0
    for edge in edges:
        if edge == "home_clear":
            score += 2
        elif edge == "home_slight":
            score += 1
        elif edge == "away_clear":
            score -= 2
        elif edge == "away_slight":
            score -= 1
    if score >= 2:
        return "home"
    if score <= -2:
        return "away"
    return "balanced"

VALUE_CLEAR_EV_DECIMAL = 0.03
VALUE_THIN_EV_DECIMAL = 0.005
NO_VALUE_EV_DECIMAL = -0.015


def _prob_to_fair_odd(prob: Optional[float]) -> Optional[float]:
    p = _as_float(prob)
    if p is None or p <= 0.0 or p >= 1.0:
        return None
    return round(1.0 / p, 4)


def _price_ev_decimal(prob: Optional[float], odd: Optional[float]) -> Optional[float]:
    p = _as_float(prob)
    o = _as_float(odd)
    if p is None or o is None or p <= 0.0 or o <= 1.0:
        return None
    return round((p * o) - 1.0, 6)


def _classify_price_ev(ev_decimal: Optional[float]) -> str:
    if ev_decimal is None:
        return "missing_price"

    ev = float(ev_decimal)

    if ev >= VALUE_CLEAR_EV_DECIMAL:
        return "value"
    if ev >= VALUE_THIN_EV_DECIMAL:
        return "thin_value"
    if ev >= NO_VALUE_EV_DECIMAL:
        return "fair"

    return "no_value"

OUTCOMES_1X2 = ("home", "draw", "away")


def _outcome_name_pt(outcome: Optional[str], home: str, away: str) -> str:
    if outcome == "home":
        return home
    if outcome == "away":
        return away
    if outcome == "draw":
        return "empate"
    return "este lado"


def _outcome_name_en(outcome: Optional[str], home: str, away: str) -> str:
    if outcome == "home":
        return home
    if outcome == "away":
        return away
    if outcome == "draw":
        return "the draw"
    return "this side"


def _outcome_name_es(outcome: Optional[str], home: str, away: str) -> str:
    if outcome == "home":
        return home
    if outcome == "away":
        return away
    if outcome == "draw":
        return "el empate"
    return "este lado"

def _decision_outcome_key(decision: Optional[Dict[str, Any]]) -> Optional[str]:
    if not isinstance(decision, dict):
        return None

    outcome_key = str(decision.get("outcome_key") or "").strip().lower()
    if outcome_key in ("home", "draw", "away"):
        return outcome_key

    outcome = str(decision.get("outcome") or "").strip().upper()
    if outcome == "H":
        return "home"
    if outcome == "D":
        return "draw"
    if outcome == "A":
        return "away"

    outcome = str(decision.get("outcome") or "").strip().lower()
    if outcome in ("home", "draw", "away"):
        return outcome

    return None


def _decision_label(decision: Optional[Dict[str, Any]]) -> str:
    if not isinstance(decision, dict):
        return ""
    return str(decision.get("label") or "").strip().upper()


def _decision_has_block(decision: Optional[Dict[str, Any]], block: str) -> bool:
    if not isinstance(decision, dict):
        return False
    blocks = decision.get("blocks") or []
    return str(block) in {str(item) for item in blocks}


MODEL_CLEAR_HOME_AWAY_PROB = 0.60
MODEL_CLEAR_DRAW_PROB = 0.36


def _decision_model_prob(decision: Optional[Dict[str, Any]]) -> Optional[float]:
    if not isinstance(decision, dict):
        return None
    return _as_float(decision.get("model_prob"))


def _decision_has_clear_model_side(decision: Optional[Dict[str, Any]]) -> bool:
    outcome = _decision_outcome_key(decision)
    prob = _decision_model_prob(decision)

    if outcome is None or prob is None:
        return False

    if outcome in ("home", "away"):
        return float(prob) >= MODEL_CLEAR_HOME_AWAY_PROB

    if outcome == "draw":
        return float(prob) >= MODEL_CLEAR_DRAW_PROB

    return False


def _build_decision_market_connection_text_pt(
    *,
    decision: Optional[Dict[str, Any]],
    home: str,
    away: str,
    seed: str,
) -> Optional[Tuple[str, int]]:
    label = _decision_label(decision)
    if not label:
        return None

    outcome_key = _decision_outcome_key(decision)
    target = _outcome_name_pt(outcome_key, home, away) if outcome_key else "esse lado"

    if label == "OPPORTUNITY":
        variants = (
            f"Sim — para {target}, a odd está boa. O jogo tem risco, claro, mas o preço paga melhor do que esse risco nos dados do prevIA.",
            f"Sim — {target} apareceu com uma odd que vale atenção. Não é garantia, mas o preço está do lado certo.",
            f"Sim — o preço ajuda {target}. Pela leitura do prevIA, essa odd ainda deixa espaço para uma boa entrada.",
        )
        return _pick_variant(seed=seed, section_key="market_connection_decision_opportunity", variants=variants)

    if label == "CAUTION_OPPORTUNITY":
        if _decision_has_block(decision, "stale_market_price"):
            variants = (
                f"Tem sinal em {target}, mas vale olhar de novo antes. A odd usada não parece tão recente.",
                f"{target} chama atenção, só que o preço precisa ser conferido de novo. Melhor não decidir com odd antiga.",
                f"Existe uma boa leitura em {target}, mas a odd pode ter mudado. Antes de forçar, vale atualizar o mercado.",
            )
        elif _decision_has_block(decision, "high_odd_volatility"):
            variants = (
                f"Tem sinal em {target}, mas é daqueles mais arriscados. A odd chama atenção, só que pode oscilar bastante.",
                f"{target} aparece com preço interessante, mas não é uma leitura limpa. É para ir com mais cuidado.",
                f"O preço de {target} chama atenção, mas o risco também sobe. Vale acompanhar sem exagerar.",
            )
        elif _decision_has_block(decision, "large_market_disagreement"):
            variants = (
                f"Tem sinal em {target}, mas com alerta. O prevIA está vendo esse jogo diferente do mercado.",
                f"{target} passa na leitura do prevIA, mas o mercado não está tão junto. É oportunidade possível, com cuidado.",
                f"O preço de {target} chama atenção, só que a leitura não está tão alinhada com o mercado. Melhor tratar como sinal, não como certeza.",
            )
        else:
            variants = (
                f"Tem sinal em {target}, mas sem muita folga. Dá para acompanhar, só não é uma entrada tão limpa.",
                f"{target} tem uma odd que ajuda, mas não sobra tanto espaço. Melhor olhar com calma.",
                f"Existe um caminho interessante em {target}, mas é uma leitura para cautela, não para forçar.",
            )
        return _pick_variant(seed=seed, section_key="market_connection_decision_caution", variants=variants)

    if label == "NO_GOOD_PRICE":
        variants = (
            f"Melhor não. {target} até aparece bem na leitura, mas a odd está baixa para o risco.",
            f"{target} pode até ser o caminho mais provável, mas a odd não ajuda. Nesse preço, melhor não forçar.",
            f"Não anima. O cenário de {target} faz sentido, mas o pagamento está curto.",
        )
        return _pick_variant(seed=seed, section_key="market_connection_decision_no_good_price", variants=variants)

    if label == "NO_CLEAR_EDGE":
        variants = (
            "Melhor passar. Não apareceu uma odd que faça valer a pena.",
            "Jogo para acompanhar, não para forçar. O preço não abriu uma vantagem clara.",
            "Nada muito claro por enquanto. Sem uma odd melhor, a leitura fica sem entrada.",
        )
        return _pick_variant(seed=seed, section_key="market_connection_decision_no_clear_edge", variants=variants)

    if label == "INSUFFICIENT_DATA":
        variants = (
            "Ainda não dá para cravar. Falta informação suficiente para ligar o jogo ao preço com segurança.",
            "Por enquanto, é mais jogo para acompanhar do que para decidir. Ainda falta dado confiável.",
            "A leitura ainda está incompleta. Melhor esperar mais informação antes de falar em entrada.",
        )
        return _pick_variant(seed=seed, section_key="market_connection_decision_insufficient", variants=variants)

    return None


def _build_decision_market_connection_text_en(
    *,
    decision: Optional[Dict[str, Any]],
    home: str,
    away: str,
    seed: str,
) -> Optional[Tuple[str, int]]:
    label = _decision_label(decision)
    if not label:
        return None

    outcome_key = _decision_outcome_key(decision)
    target = _outcome_name_en(outcome_key, home, away) if outcome_key else "this side"

    if label == "OPPORTUNITY":
        variants = (
            f"Yes — the price looks good for {target}. There is always risk, but this odd pays better than that risk in prevIA's read.",
            f"Yes — {target} has an odd worth attention. It is not a guarantee, but the price is on the right side.",
            f"Yes — the current price helps {target}. In prevIA's read, this odd still leaves room for a good entry.",
        )
        return _pick_variant(seed=seed, section_key="market_connection_decision_opportunity", variants=variants)

    if label == "CAUTION_OPPORTUNITY":
        if _decision_has_block(decision, "stale_market_price"):
            variants = (
                f"There is a signal on {target}, but it is worth checking again. The odd used does not look fresh enough.",
                f"{target} stands out, but the price should be checked again. Better not decide with an old odd.",
                f"There is a good read on {target}, but the odd may have moved. Update the market before forcing anything.",
            )
        elif _decision_has_block(decision, "high_odd_volatility"):
            variants = (
                f"There is a signal on {target}, but it is a riskier one. The odd stands out, but it can move a lot.",
                f"{target} has an interesting price, but this is not a clean read. It calls for more care.",
                f"The price on {target} stands out, but the risk also rises. Worth watching without overplaying.",
            )
        elif _decision_has_block(decision, "large_market_disagreement"):
            variants = (
                f"There is a signal on {target}, but with an alert. prevIA is reading this game differently from the market.",
                f"{target} works in prevIA's read, but the market is not fully with it. Possible opportunity, with caution.",
                f"The price on {target} stands out, but the read is not fully aligned with the market. Treat it as a signal, not a certainty.",
            )
        else:
            variants = (
                f"There is a signal on {target}, but not much room. Worth watching, but not a clean entry.",
                f"{target} has an odd that helps, but the margin is not wide. Better take it slowly.",
                f"There is an interesting path on {target}, but this is a cautious read, not one to force.",
            )
        return _pick_variant(seed=seed, section_key="market_connection_decision_caution", variants=variants)

    if label == "NO_GOOD_PRICE":
        variants = (
            f"Better not. {target} looks fine in the read, but the odd is too low for the risk.",
            f"{target} may be the most likely path, but the odd does not help. At this price, better not force it.",
            f"Not attractive enough. The {target} scenario makes sense, but the payout is short.",
        )
        return _pick_variant(seed=seed, section_key="market_connection_decision_no_good_price", variants=variants)

    if label == "NO_CLEAR_EDGE":
        variants = (
            "Better to pass. No odd here really makes it worth it.",
            "A game to watch, not to force. The price does not show a clear advantage.",
            "Nothing clear for now. Without a better odd, there is no real entry.",
        )
        return _pick_variant(seed=seed, section_key="market_connection_decision_no_clear_edge", variants=variants)

    if label == "INSUFFICIENT_DATA":
        variants = (
            "Too early to call. There is not enough information to connect the game and the price safely.",
            "For now, this is more a game to watch than a game to act on. The read still needs better data.",
            "The read is still incomplete. Better wait for more reliable information before calling an entry.",
        )
        return _pick_variant(seed=seed, section_key="market_connection_decision_insufficient", variants=variants)

    return None


def _build_decision_market_connection_text_es(
    *,
    decision: Optional[Dict[str, Any]],
    home: str,
    away: str,
    seed: str,
) -> Optional[Tuple[str, int]]:
    label = _decision_label(decision)
    if not label:
        return None

    outcome_key = _decision_outcome_key(decision)
    target = _outcome_name_es(outcome_key, home, away) if outcome_key else "este lado"

    if label == "OPPORTUNITY":
        variants = (
            f"Sí — la cuota está buena para {target}. El partido tiene riesgo, claro, pero el precio paga mejor que ese riesgo en la lectura de prevIA.",
            f"Sí — {target} apareció con una cuota que merece atención. No es garantía, pero el precio está del lado correcto.",
            f"Sí — el precio ayuda a {target}. En la lectura de prevIA, esta cuota todavía deja espacio para una buena entrada.",
        )
        return _pick_variant(seed=seed, section_key="market_connection_decision_opportunity", variants=variants)

    if label == "CAUTION_OPPORTUNITY":
        if _decision_has_block(decision, "stale_market_price"):
            variants = (
                f"Hay señal en {target}, pero conviene mirar otra vez. La cuota usada no parece tan reciente.",
                f"{target} llama la atención, pero el precio debería revisarse de nuevo. Mejor no decidir con una cuota vieja.",
                f"Hay una buena lectura en {target}, pero la cuota puede haber cambiado. Antes de forzar, conviene actualizar el mercado.",
            )
        elif _decision_has_block(decision, "high_odd_volatility"):
            variants = (
                f"Hay señal en {target}, pero es de las más arriesgadas. La cuota llama la atención, pero puede moverse bastante.",
                f"{target} tiene un precio interesante, pero no es una lectura limpia. Pide más cuidado.",
                f"El precio de {target} llama la atención, pero el riesgo también sube. Vale seguirlo sin exagerar.",
            )
        elif _decision_has_block(decision, "large_market_disagreement"):
            variants = (
                f"Hay señal en {target}, pero con alerta. prevIA está viendo este partido diferente al mercado.",
                f"{target} funciona en la lectura de prevIA, pero el mercado no está tan alineado. Posible oportunidad, con cautela.",
                f"El precio de {target} llama la atención, pero la lectura no está tan alineada con el mercado. Mejor tratarlo como señal, no como certeza.",
            )
        else:
            variants = (
                f"Hay señal en {target}, pero sin mucha holgura. Vale seguirlo, pero no es una entrada limpia.",
                f"{target} tiene una cuota que ayuda, pero no sobra tanto margen. Mejor mirarlo con calma.",
                f"Hay un camino interesante en {target}, pero es una lectura de cautela, no para forzar.",
            )
        return _pick_variant(seed=seed, section_key="market_connection_decision_caution", variants=variants)

    if label == "NO_GOOD_PRICE":
        variants = (
            f"Mejor no. {target} aparece bien en la lectura, pero la cuota está baja para el riesgo.",
            f"{target} puede ser el camino más probable, pero la cuota no ayuda. A este precio, mejor no forzar.",
            f"No entusiasma. El escenario de {target} tiene sentido, pero el pago está corto.",
        )
        return _pick_variant(seed=seed, section_key="market_connection_decision_no_good_price", variants=variants)

    if label == "NO_CLEAR_EDGE":
        variants = (
            "Mejor pasar. No apareció una cuota que realmente valga la pena.",
            "Partido para seguir, no para forzar. El precio no muestra una ventaja clara.",
            "Nada muy claro por ahora. Sin una cuota mejor, la lectura queda sin entrada.",
        )
        return _pick_variant(seed=seed, section_key="market_connection_decision_no_clear_edge", variants=variants)

    if label == "INSUFFICIENT_DATA":
        variants = (
            "Todavía no da para marcar una entrada. Falta información suficiente para unir partido y precio con seguridad.",
            "Por ahora, es más partido para seguir que para decidir. La lectura todavía necesita mejores datos.",
            "La lectura sigue incompleta. Mejor esperar más información confiable antes de hablar de entrada.",
        )
        return _pick_variant(seed=seed, section_key="market_connection_decision_insufficient", variants=variants)

    return None

def _context_model_alignment(context_side: str, most_likely_outcome: Optional[str]) -> str:
    if context_side == "balanced":
        return "context_balanced"
    if context_side not in ("home", "away"):
        return "context_missing"
    if most_likely_outcome not in ("home", "away", "draw"):
        return "context_missing"
    if most_likely_outcome == context_side:
        return "context_model_aligned"
    return "context_model_divergent"


def _context_name_pt(context_side: Optional[str], home: str, away: str) -> Optional[str]:
    if context_side == "home":
        return home
    if context_side == "away":
        return away
    return None


def _context_name_en(context_side: Optional[str], home: str, away: str) -> Optional[str]:
    if context_side == "home":
        return home
    if context_side == "away":
        return away
    return None


def _context_name_es(context_side: Optional[str], home: str, away: str) -> Optional[str]:
    if context_side == "home":
        return home
    if context_side == "away":
        return away
    return None


def _build_context_price_read(
    *,
    payload: Dict[str, Any],
    context_side: str,
    home: str,
    away: str,
) -> Dict[str, Any]:
    one_x_two = (((payload or {}).get("markets") or {}).get("1x2") or {})
    probs = one_x_two.get("p_model") or {}
    odds = one_x_two.get("best_odds") or {}

    context_outcome = context_side if context_side in ("home", "away") else None

    outcomes: Dict[str, Dict[str, Any]] = {}
    for outcome in OUTCOMES_1X2:
        model_prob = _as_float(probs.get(outcome))
        best_odd = _as_float(odds.get(outcome))
        fair_odd = _prob_to_fair_odd(model_prob)
        ev_decimal = _price_ev_decimal(model_prob, best_odd)

        if model_prob is None:
            status = "missing_model"
            reason = "missing_model_probability"
        elif best_odd is None:
            status = "missing_price"
            reason = "missing_market_odd"
        else:
            status = _classify_price_ev(ev_decimal)
            reason = None

        outcomes[outcome] = {
            "outcome": outcome,
            "side_name": home if outcome == "home" else away if outcome == "away" else "draw",
            "model_prob": round(float(model_prob), 6) if model_prob is not None else None,
            "best_odd": round(float(best_odd), 4) if best_odd is not None else None,
            "fair_odd": fair_odd,
            "ev_decimal": ev_decimal,
            "ev_percent": round(float(ev_decimal) * 100.0, 2) if ev_decimal is not None else None,
            "status": status,
            "reason": reason,
        }

    valid_probs = [
        (outcome, data["model_prob"])
        for outcome, data in outcomes.items()
        if data.get("model_prob") is not None
    ]
    most_likely_outcome = (
        max(valid_probs, key=lambda item: float(item[1]))[0]
        if valid_probs
        else None
    )

    has_any_price = any(data.get("best_odd") is not None for data in outcomes.values())

    value_candidates = [
        (outcome, data)
        for outcome, data in outcomes.items()
        if data.get("status") in ("value", "thin_value")
        and data.get("ev_decimal") is not None
    ]
    best_value_outcome = (
        max(value_candidates, key=lambda item: float(item[1]["ev_decimal"]))[0]
        if value_candidates
        else None
    )

    selected_outcome = best_value_outcome or most_likely_outcome
    selected = outcomes.get(selected_outcome or "") or {}

    context_pricing = outcomes.get(context_outcome or "") or {}
    likely_pricing = outcomes.get(most_likely_outcome or "") or {}
    value_pricing = outcomes.get(best_value_outcome or "") or {}

    if not valid_probs:
        alignment = "missing_model"
        status = "missing_model"
    elif not has_any_price:
        alignment = "missing_price"
        status = "missing_price"
    elif best_value_outcome:
        status = str(value_pricing.get("status") or "value")
        if best_value_outcome == most_likely_outcome:
            alignment = "aligned_value"
        elif context_outcome and best_value_outcome == context_outcome:
            alignment = "context_value"
        elif context_side == "balanced":
            alignment = "balanced_value"
        else:
            alignment = "contrarian_value"
    else:
        status = str(likely_pricing.get("status") or "no_value")
        alignment = "favorite_no_value" if most_likely_outcome else "no_clear_value"

    return {
        "status": status,
        "market": "1x2",

        # Backward compatible: outcome aponta para o lado mais relevante da leitura de preço.
        "outcome": selected_outcome,
        "side_name": selected.get("side_name"),

        "model_prob": selected.get("model_prob"),
        "best_odd": selected.get("best_odd"),
        "fair_odd": selected.get("fair_odd"),
        "ev_decimal": selected.get("ev_decimal"),
        "ev_percent": selected.get("ev_percent"),

        "reason": selected.get("reason"),
        "source": "snapshot_markets_1x2_best_odds",

        # Novos sinais, sem quebrar contrato existente.
        "alignment": alignment,
        "context_outcome": context_outcome,
        "context_pricing_status": context_pricing.get("status"),
        "most_likely_outcome": most_likely_outcome,
        "most_likely_prob": likely_pricing.get("model_prob"),
        "most_likely_odd": likely_pricing.get("best_odd"),
        "most_likely_status": likely_pricing.get("status"),
        "value_outcome": best_value_outcome,
        "value_prob": value_pricing.get("model_prob"),
        "value_odd": value_pricing.get("best_odd"),
        "value_fair_odd": value_pricing.get("fair_odd"),
        "value_ev_decimal": value_pricing.get("ev_decimal"),
        "value_status": value_pricing.get("status"),
        "outcomes": outcomes,
        "context_model_alignment": _context_model_alignment(
            context_side=context_side,
            most_likely_outcome=most_likely_outcome,
        ),
    }

def _variant_index(*, seed: str, section_key: str, count: int) -> int:
    if count <= 1:
        return 0
    raw = f"{NARRATIVE_CONTEXT_VERSION}:{NARRATIVE_CONTEXT_TONE}:{seed}:{section_key}".encode("utf-8")
    digest = hashlib.sha256(raw).hexdigest()
    return int(digest[:8], 16) % int(count)


def _pick_variant(*, seed: str, section_key: str, variants: Tuple[str, ...]) -> Tuple[str, int]:
    idx = _variant_index(seed=seed, section_key=section_key, count=len(variants))
    return variants[idx], idx


def _variant_seed(
    *,
    sport_key: Optional[str],
    league_id: Optional[int],
    season: Optional[int],
    home_team_id: Optional[int],
    away_team_id: Optional[int],
    kickoff_utc: Any,
) -> str:
    return "|".join(
        [
            str(sport_key or ""),
            str(league_id or ""),
            str(season or ""),
            str(home_team_id or ""),
            str(away_team_id or ""),
            str(kickoff_utc or ""),
        ]
    )


def _games_word(n: Optional[int]) -> str:
    return _word(n, "jogo", "jogos")


def _wins_word(n: Optional[int]) -> str:
    return _word(n, "vitória", "vitórias")


def _record_compact(wins: Optional[int], played: Optional[int], pct_value: Optional[float], *, include_pct: bool = False) -> str:
    w = int(wins or 0)
    p = int(played or 0)
    pct = f" ({_fmt_pct(pct_value)} de aproveitamento)" if include_pct and pct_value is not None else ""
    if p <= 0:
        return "ainda tem poucos jogos nesse recorte"
    if w == 0:
        return f"ainda não venceu em {p} {_games_word(p)}{pct}"
    if p == 1:
        return f"venceu o único jogo do recorte{pct}"
    return f"venceu {w} dos {p} jogos{pct}"


def _record_count(wins: Optional[int], played: Optional[int]) -> str:
    w = int(wins or 0)
    p = int(played or 0)
    if p <= 0:
        return "poucos jogos no recorte"
    if w == 0:
        return f"nenhuma vitória em {p} {_games_word(p)}"
    return f"{w} {_wins_word(w)} em {p} {_games_word(p)}"


def _record_plain(wins: Optional[int], played: Optional[int]) -> str:
    w = int(wins or 0)
    p = int(played or 0)
    if p <= 0:
        return "tem poucos jogos no recorte"
    if w == 0:
        return f"ainda não venceu em {p} {_games_word(p)}"
    if p == 1:
        return "venceu o único jogo do recorte"
    return f"venceu {w} dos {p} jogos"


def _split_plain(*, wins: Optional[int], played: Optional[int], side: str) -> str:
    w = int(wins or 0)
    p = int(played or 0)
    if p <= 0:
        return f"tem poucos jogos {side} nesse recorte"
    if w == 0:
        return f"ainda não venceu {side} nesse recorte"
    if p == 1:
        return f"venceu o único jogo {side} do recorte"
    return f"venceu {w} dos {p} jogos {side}"


def _build_headline_pt(
    *,
    home: str,
    away: str,
    context_side: str,
    season_edge: str,
    home_away_edge: str,
    h2h_status: str,
    seed: str,
    decision: Optional[Dict[str, Any]] = None,
) -> Tuple[str, int]:
    if context_side == "balanced" and _decision_has_clear_model_side(decision):
        outcome_key = _decision_outcome_key(decision)
        target = _outcome_name_pt(outcome_key, home, away)
        variants = (
            f"{home} x {away}: o recorte recente é equilibrado, mas o prevIA coloca {target} um pouco à frente.",
            f"{home} x {away}: os dados recentes não abrem tanta distância, mas {target} aparece melhor na conta geral.",
            f"{home} x {away}: jogo parelho no contexto, com {target} puxando a leitura do prevIA.",
        )
        return _pick_variant(seed=seed, section_key="headline_model_reconciled", variants=variants)
    if context_side == "home":
        if home_away_edge in ("home_clear", "home_slight"):
            variants = (
                f"{home} x {away}: o recorte favorece o mandante, com o mando pesando na leitura.",
                f"{home} x {away}: {home} chega melhor nesse recorte, principalmente pelo jogo em casa.",
                f"{home} x {away}: o cenário favorece {home}, mas ainda depende do preço.",
            )
        else:
            variants = (
                f"{home} x {away}: o recorte favorece um pouco mais {home}, mas sem vantagem absoluta.",
                f"{home} x {away}: {home} aparece ligeiramente à frente, mas o preço precisa ajudar.",
                f"{home} x {away}: leitura levemente favorável ao mandante, com espaço para cautela.",
            )
    elif context_side == "away":
        if home_away_edge in ("away_clear", "away_slight"):
            variants = (
                f"{home} x {away}: o visitante chega melhor no recorte, mesmo fora de casa.",
                f"{home} x {away}: {away} aparece mais forte nos dados recentes e chega competitivo fora.",
                f"{home} x {away}: o contexto favorece mais {away}, apesar do mando adversário.",
            )
        else:
            variants = (
                f"{home} x {away}: o recorte recente favorece mais {away} do que o mandante.",
                f"{home} x {away}: {away} entra com uma leitura um pouco mais positiva.",
                f"{home} x {away}: o visitante aparece melhor no contexto, mas o jogo ainda pede cuidado.",
            )
    elif h2h_status == "unavailable":
        variants = (
            f"{home} x {away}: jogo com leitura mais equilibrada e pouco histórico direto recente.",
            f"{home} x {away}: sem um lado muito claro no contexto e sem retrospecto forte entre eles.",
            f"{home} x {away}: cenário equilibrado, com poucos indicadores fortes para separar os times.",
        )
    else:
        variants = (
            f"{home} x {away}: contexto mais equilibrado, sem um lado claramente dominante.",
            f"{home} x {away}: os dados deixam o jogo mais aberto do que unilateral.",
            f"{home} x {away}: leitura equilibrada, com argumentos divididos entre os lados.",
        )
    return _pick_variant(seed=seed, section_key="headline", variants=variants)


def _build_current_season_text_pt(
    *,
    home: str,
    away: str,
    home_stats: Dict[str, Any],
    away_stats: Dict[str, Any],
    edge: str,
    seed: str,
) -> Tuple[str, int]:
    hp = _as_int(home_stats.get("played")) or 0
    ap = _as_int(away_stats.get("played")) or 0
    home_compact = _record_compact(_as_int(home_stats.get("wins")), hp, _as_float(home_stats.get("points_pct")))
    away_compact = _record_compact(_as_int(away_stats.get("wins")), ap, _as_float(away_stats.get("points_pct")))
    home_compact_pct = _record_compact(_as_int(home_stats.get("wins")), hp, _as_float(home_stats.get("points_pct")), include_pct=True)
    away_compact_pct = _record_compact(_as_int(away_stats.get("wins")), ap, _as_float(away_stats.get("points_pct")), include_pct=True)
    home_plain = _record_plain(_as_int(home_stats.get("wins")), hp)
    away_plain = _record_plain(_as_int(away_stats.get("wins")), ap)
    home_count = _record_count(_as_int(home_stats.get("wins")), hp)
    away_count = _record_count(_as_int(away_stats.get("wins")), ap)

    if edge in ("home_clear", "home_slight"):
        variants = (
            f"{home} chega em melhor momento nos jogos analisados. {home_plain.capitalize()}; do outro lado, {away} {away_compact}.",
            f"Os números favorecem {home}: foram {home_count}. Do outro lado, {away} {away_compact}.",
            f"Nos jogos analisados, o mandante mostra uma base mais forte: {home_compact_pct}. Do outro lado, o visitante {away_compact}.",
        )
    elif edge in ("away_clear", "away_slight"):
        variants = (
            f"{away} chega em melhor momento nos jogos analisados. {away_plain.capitalize()}; do outro lado, {home} {home_compact}.",
            f"Os números favorecem {away}: foram {away_count}. Do outro lado, {home} {home_compact}.",
            f"Nos jogos analisados, o visitante mostra uma base mais forte: {away_compact_pct}. Do outro lado, o mandante {home_compact}.",
        )
    else:
        variants = (
            f"A campanha dos dois times está mais próxima no recorte analisado. {home} {home_compact}; {away} {away_compact}.",
            f"Nos jogos analisados, não aparece uma diferença grande de campanha. {home} {home_compact}; {away} {away_compact}.",
            f"O momento geral é mais equilibrado. O mandante {home_compact}, e o visitante {away_compact}.",
        )
    return _pick_variant(seed=seed, section_key="current_season", variants=variants)


def _build_home_away_text_pt(
    *,
    home: str,
    away: str,
    home_stats: Dict[str, Any],
    away_stats: Dict[str, Any],
    edge: str,
    seed: str,
) -> Tuple[str, int]:
    hhp = _as_int(home_stats.get("home_played")) or 0
    aap = _as_int(away_stats.get("away_played")) or 0
    hw = _as_int(home_stats.get("home_wins")) or 0
    aw = _as_int(away_stats.get("away_wins")) or 0
    hpct = _fmt_pct(_as_float(home_stats.get("home_points_pct")))
    apct = _fmt_pct(_as_float(away_stats.get("away_points_pct")))
    home_home = _split_plain(wins=hw, played=hhp, side="em casa")
    away_away = _split_plain(wins=aw, played=aap, side="fora")

    if edge in ("home_clear", "home_slight"):
        variants = (
            f"O mando ajuda nessa leitura: {home} {home_home}. Como visitante, {away} {away_away}.",
            f"Em casa, {home} tem um recorte melhor: {home_home}. Do outro lado, o visitante {away_away}.",
            f"O jogo em casa pesa a favor do mandante. {home} {home_home} ({hpct}); {away} {away_away} ({apct}).",
        )
    elif edge in ("away_clear", "away_slight"):
        variants = (
            f"O mando não tem ajudado tanto {home}: o time {home_home}. Do outro lado, {away} chega competitivo fora e {away_away}.",
            f"Na comparação entre casa e fora, o recorte favorece mais o visitante. {home} {home_home}; {away} {away_away}.",
            f"Mesmo fora de casa, {away} aparece melhor nesse ponto. O visitante {away_away}; o mandante {home_home}.",
        )
    else:
        variants = (
            f"Na comparação entre casa e fora, o cenário não aponta uma vantagem tão forte de um lado só. {home} {home_home}; {away} {away_away}.",
            f"O recorte de mando e visita está mais dividido. O mandante {home_home}, e o visitante {away_away}.",
            f"Casa e fora não separam tanto os times neste jogo: {home} {home_home}; {away} {away_away}.",
        )
    return _pick_variant(seed=seed, section_key="home_away", variants=variants)


def _h2h_edge(h2h: Dict[str, Any]) -> str:
    hw = int(h2h.get("home_wins") or 0)
    aw = int(h2h.get("away_wins") or 0)
    diff = hw - aw
    if diff >= 3:
        return "home_clear"
    if diff >= 1:
        return "home_slight"
    if diff <= -3:
        return "away_clear"
    if diff <= -1:
        return "away_slight"
    return "balanced"


def _join_pt(parts: Tuple[str, ...]) -> str:
    clean = [p for p in parts if p]
    if not clean:
        return ""
    if len(clean) == 1:
        return clean[0]
    return ", ".join(clean[:-1]) + " e " + clean[-1]


def _h2h_summary(*, home: str, away: str, h2h: Dict[str, Any]) -> str:
    hw = int(h2h.get("home_wins") or 0)
    aw = int(h2h.get("away_wins") or 0)
    draws = int(h2h.get("draws") or 0)
    parts = []
    if hw > 0:
        parts.append(f"{hw} {_wins_word(hw)} de {home}")
    if draws > 0:
        parts.append(f"{draws} {_word(draws, 'empate', 'empates')}")
    if aw > 0:
        parts.append(f"{aw} {_wins_word(aw)} de {away}")
    return _join_pt(tuple(parts)) or "sem vitórias registradas para os lados"


def _build_h2h_text_pt(*, home: str, away: str, h2h: Dict[str, Any], edge: str, seed: str) -> Tuple[str, int]:
    matches = int(h2h.get("matches") or 0)
    summary = _h2h_summary(home=home, away=away, h2h=h2h)
    if edge in ("home_clear", "home_slight"):
        variants = (
            f"O histórico recente também ajuda {home}: nos últimos {matches} confrontos, foram {summary}. Ainda assim, isso entra como contexto, não como garantia.",
            f"Entre eles, o recorte recente pende para o mandante. Nos últimos {matches} jogos, foram {summary}. É um dado útil, mas não decide a entrada sozinho.",
            f"O confronto direto recente reforça um pouco a leitura para {home}. Nos últimos {matches} jogos registrados, foram {summary}, mas retrospecto não é promessa de repetição.",
        )
    elif edge in ("away_clear", "away_slight"):
        variants = (
            f"O histórico recente favorece mais {away}: nos últimos {matches} confrontos, foram {summary}. Mesmo assim, esse dado entra como apoio, não como garantia.",
            f"No confronto direto, o visitante leva alguma vantagem recente. Nos últimos {matches} jogos, foram {summary}, mas isso não muda sozinho a leitura do jogo.",
            f"O retrospecto entre eles dá mais força para {away}. Nos últimos {matches} confrontos, foram {summary}. Ainda assim, isso tem peso limitado na decisão.",
        )
    else:
        variants = (
            f"O histórico recente entre eles é mais equilibrado. Nos últimos {matches} confrontos, foram {summary}. Por isso, esse dado ajuda pouco a separar os lados.",
            f"Entre eles, o retrospecto recente não mostra domínio claro: nos últimos {matches} jogos, foram {summary}. É contexto, mas não muda a leitura sozinho.",
            f"O confronto direto recente deixa o jogo mais aberto. Nos últimos {matches} encontros, foram {summary}, sem domínio forte de um lado só.",
        )
    return _pick_variant(seed=seed, section_key="head_to_head", variants=variants)


def _build_market_connection_text_pt(
    *,
    context_side: str,
    home: str,
    away: str,
    seed: str,
    price_read: Optional[Dict[str, Any]] = None,
    decision: Optional[Dict[str, Any]] = None,
) -> Tuple[str, int]:
    decision_text = _build_decision_market_connection_text_pt(
        decision=decision,
        home=home,
        away=away,
        seed=seed,
    )
    if decision_text is not None:
        return decision_text
    price_read = price_read or {}
    alignment = str(price_read.get("alignment") or "unknown")
    pricing_status = str(price_read.get("status") or "unknown")
    context_alignment = str(price_read.get("context_model_alignment") or "unknown")
    context_outcome = price_read.get("context_outcome")

    likely_outcome = price_read.get("most_likely_outcome")
    value_outcome = price_read.get("value_outcome")

    likely = _outcome_name_pt(str(likely_outcome), home, away) if likely_outcome else None
    value = _outcome_name_pt(str(value_outcome), home, away) if value_outcome else None
    context_name = _context_name_pt(str(context_outcome), home, away) if context_outcome else None

    if alignment == "aligned_value" and likely:
        if context_alignment == "context_model_divergent" and context_name:
            variants = (
                f"O recorte recente favorece {context_name}, mas a leitura final do modelo coloca {likely} como resultado mais provável. Como a odd desse lado também ajuda, a entrada ganha força — com cautela, porque contexto e modelo não apontam exatamente para o mesmo lado.",
                f"{context_name} fica melhor no contexto recente, mas o modelo ainda vê {likely} como o caminho mais provável. Com a odd atual ajudando esse lado, existe valor, mas a entrada pede mais cuidado.",
                f"O contexto puxa mais para {context_name}, enquanto probabilidade e preço aparecem do lado de {likely}. Isso deixa a entrada possível, mas não tão limpa quanto quando tudo aponta para o mesmo lado.",
            )
        else:
            variants = (
                f"{likely} aparece como o resultado mais provável e a odd disponível ainda ajuda. Quando probabilidade e preço caminham juntos, a entrada ganha força.",
                f"A maior probabilidade está em {likely}, e o preço ainda parece adequado para o risco. É uma leitura mais clara, porque modelo e odd apontam para o mesmo lado.",
                f"Os números colocam {likely} à frente e a odd ainda ajuda. Nesse cenário, a entrada fica mais consistente.",
            )
    elif alignment == "contrarian_value" and likely and value:
        if context_alignment == "context_model_divergent" and context_name:
            variants = (
                f"O recorte recente favorece {context_name}, e o modelo coloca {likely} como resultado mais provável. Mesmo assim, o melhor preço aparece em {value}. É uma leitura de valor: {value} tem menos chance, mas a odd pode compensar o risco.",
                f"Contexto e probabilidade não estão totalmente alinhados aqui: o recorte favorece {context_name}, o modelo pesa mais {likely}, e a odd interessante aparece em {value}. É um caso para tratar pelo preço, não por favoritismo.",
                f"A leitura não é tão direta: {context_name} vai melhor no recorte, {likely} é mais provável no modelo, mas a odd de {value} parece alta para o risco. É valor, com cautela.",
            )
        else:
            variants = (
                f"{likely} é o resultado mais provável, mas o preço interessante está em {value}. Mesmo com chance menor, a odd pode compensar o risco. É uma leitura de valor, não de favoritismo.",
                f"A maior probabilidade está em {likely}, mas a odd que merece atenção é a de {value}. Isso não torna {value} mais provável; apenas indica que o preço pode estar acima do risco.",
                f"O modelo vê {likely} como o cenário mais provável, mas o valor aparece em {value}. Nesse caso, o preço pesa mais do que o favoritismo.",
            )
    elif alignment == "context_value" and likely and value:
        variants = (
            f"O modelo coloca {likely} como resultado mais provável, mas o recorte recente e a odd favorecem {value}. A entrada não vem por favoritismo claro, e sim porque o preço parece adequado para o risco.",
            f"A probabilidade maior está em {likely}, mas a leitura de valor aparece em {value}. É um cenário para cuidado: a odd ajuda, mas não está no lado mais provável.",
            f"O jogo tem maior chance para {likely}, mas a odd de {value} merece atenção. Aqui, o valor pesa mais do que o favoritismo.",
        )
    elif alignment == "balanced_value" and value:
        variants = (
            f"O contexto não separa tanto os times, mas o preço em {value} aparece interessante. É uma leitura mais baseada na odd do que em superioridade clara.",
            f"Como o jogo está mais equilibrado no contexto, o preço ganha peso. Nesse cenário, {value} merece atenção porque a odd parece adequada ao risco.",
            f"Sem um favorito contextual forte, a odd de {value} fica mais relevante. É uma entrada para avaliar pelo preço.",
        )
    elif alignment == "favorite_no_value" and likely:
        variants = (
            f"{likely} é o resultado mais provável, mas a odd não deixa muita margem. O resultado pode acontecer, só que a entrada perde força nesse preço.",
            f"A maior probabilidade está em {likely}, mas o preço parece curto para o risco. Probabilidade maior não significa aposta boa a qualquer odd.",
            f"Os números apontam mais para {likely}, mas a odd atual não ajuda o bastante. Nesse cenário, vale mais cautela do que pressa.",
        )
    elif alignment in ("missing_price", "missing_model"):
        variants = (
            "A leitura do jogo existe, mas falta preço ou probabilidade suficiente para fechar uma conclusão de entrada. Sem essa peça, o melhor é manter cautela.",
            "O contexto ajuda a entender o jogo, mas a decisão de entrada fica incompleta sem uma odd confiável ligada ao modelo.",
            "Ainda falta uma parte importante da leitura de preço. Por enquanto, isso funciona melhor como contexto do que como entrada.",
        )
    else:
        if pricing_status in ("value", "thin_value") and value:
            variants = (
                f"A odd de {value} aparece como o ponto mais interessante do jogo. Ainda assim, é uma leitura de preço, não uma garantia de resultado.",
                f"O melhor preço está em {value}. A entrada só faz sentido porque a odd parece compensar o risco.",
                f"{value} aparece como o lado mais interessante pelo preço. É um cenário para acompanhar com cuidado.",
            )
        else:
            variants = (
                "No geral, a leitura pede mais paciência do que pressa. Sem uma odd que compense bem o risco, melhor passar.",
                "O jogo tem pontos para acompanhar, mas não o bastante para entrar sem um preço realmente bom.",
                "Aqui, o mais importante é ser seletivo. Sem uma odd que ajude, acompanhar de fora pode ser a melhor decisão.",
            )

    return _pick_variant(seed=seed, section_key="market_connection_v1_5", variants=variants)



# -----------------------------
# English narrative builders
# -----------------------------

def _games_word_en(n: Optional[int]) -> str:
    return "game" if int(n or 0) == 1 else "games"


def _wins_word_en(n: Optional[int]) -> str:
    return "win" if int(n or 0) == 1 else "wins"


def _record_compact_en(wins: Optional[int], played: Optional[int], pct_value: Optional[float], *, include_pct: bool = False) -> str:
    w = int(wins or 0)
    p = int(played or 0)
    pct = f" ({float(pct_value):.1f}% of available points)" if include_pct and pct_value is not None else ""
    if p <= 0:
        return "does not have enough games in this stretch yet"
    if w == 0:
        return f"has not won in {p} {_games_word_en(p)}{pct}"
    if p == 1:
        return f"won the only game in this stretch{pct}"
    return f"won {w} of the {p} games{pct}"


def _record_count_en(wins: Optional[int], played: Optional[int]) -> str:
    w = int(wins or 0)
    p = int(played or 0)
    if p <= 0:
        return "not enough games in this stretch"
    if w == 0:
        return f"no wins in {p} {_games_word_en(p)}"
    return f"{w} {_wins_word_en(w)} in {p} {_games_word_en(p)}"


def _record_plain_en(wins: Optional[int], played: Optional[int]) -> str:
    w = int(wins or 0)
    p = int(played or 0)
    if p <= 0:
        return "does not have enough games in this stretch yet"
    if w == 0:
        return f"has not won in {p} {_games_word_en(p)}"
    if p == 1:
        return "won the only game in this stretch"
    return f"won {w} of the {p} games"


def _split_plain_en(*, wins: Optional[int], played: Optional[int], side: str) -> str:
    w = int(wins or 0)
    p = int(played or 0)
    side_label = 'at home' if side == 'home' else 'away from home' if side == 'away' else str(side)
    if p <= 0:
        return f"does not have enough games {side_label} yet"
    if w == 0:
        return f"has not won {side_label} in this stretch"
    if p == 1:
        return f"won its only game {side_label}"
    return f"won {w} of the {p} games {side_label}"


def _join_en(parts: Tuple[str, ...]) -> str:
    clean = [p for p in parts if p]
    if not clean:
        return ""
    if len(clean) == 1:
        return clean[0]
    return ", ".join(clean[:-1]) + " and " + clean[-1]


def _h2h_summary_en(*, home: str, away: str, h2h: Dict[str, Any]) -> str:
    hw = int(h2h.get("home_wins") or 0)
    aw = int(h2h.get("away_wins") or 0)
    draws = int(h2h.get("draws") or 0)
    parts = []
    if hw > 0:
        parts.append(f"{hw} {_wins_word_en(hw)} for {home}")
    if draws > 0:
        parts.append(f"{draws} {'draw' if draws == 1 else 'draws'}")
    if aw > 0:
        parts.append(f"{aw} {_wins_word_en(aw)} for {away}")
    return _join_en(tuple(parts)) or "no wins recorded for either side"


def _build_headline_en(
    *,
    home: str,
    away: str,
    context_side: str,
    season_edge: str,
    home_away_edge: str,
    h2h_status: str,
    seed: str,
    decision: Optional[Dict[str, Any]] = None,
) -> Tuple[str, int]:
    if context_side == "balanced" and _decision_has_clear_model_side(decision):
        outcome_key = _decision_outcome_key(decision)
        target = _outcome_name_en(outcome_key, home, away)
        variants = (
            f"{home} vs {away}: the recent picture is close, but prevIA has {target} slightly ahead.",
            f"{home} vs {away}: recent data does not create much distance, but {target} comes out better overall.",
            f"{home} vs {away}: a close game in context, with {target} leading prevIA's read.",
        )
        return _pick_variant(seed=seed, section_key="headline_model_reconciled", variants=variants)
    if context_side == "home":
        if home_away_edge in ("home_clear", "home_slight"):
            variants = (
                f"{home} vs {away}: the recent context favors the home side, with home field carrying weight.",
                f"{home} vs {away}: {home} looks better in this stretch, especially at home.",
                f"{home} vs {away}: the setup favors {home}, but the price still matters.",
            )
        else:
            variants = (
                f"{home} vs {away}: the recent context gives {home} a slight lean, but not a clear edge.",
                f"{home} vs {away}: {home} is slightly ahead in the recent numbers, but the odds still need to help.",
                f"{home} vs {away}: a small lean to the home side, with room for caution.",
            )
    elif context_side == "away":
        if home_away_edge in ("away_clear", "away_slight"):
            variants = (
                f"{home} vs {away}: the visitor looks better in this stretch, even away from home.",
                f"{home} vs {away}: {away} has the stronger recent profile and travels well.",
                f"{home} vs {away}: the context favors {away}, even with home field on the other side.",
            )
        else:
            variants = (
                f"{home} vs {away}: the recent context leans more toward {away} than the home side.",
                f"{home} vs {away}: {away} comes in with a slightly better read.",
                f"{home} vs {away}: the visitor looks better in the context, but the match still needs care.",
            )
    elif h2h_status == "unavailable":
        variants = (
            f"{home} vs {away}: a more balanced match context, with little recent head-to-head history.",
            f"{home} vs {away}: no clear side in the context and no strong recent history between them.",
            f"{home} vs {away}: a balanced setup, with few clear indicators separating the teams.",
        )
    else:
        variants = (
            f"{home} vs {away}: a more balanced context, with no side clearly in control.",
            f"{home} vs {away}: the data makes this look more open than one-sided.",
            f"{home} vs {away}: a balanced read, with arguments on both sides.",
        )
    return _pick_variant(seed=seed, section_key="headline", variants=variants)


def _build_current_season_text_en(*, home: str, away: str, home_stats: Dict[str, Any], away_stats: Dict[str, Any], edge: str, seed: str) -> Tuple[str, int]:
    hp = _as_int(home_stats.get("played")) or 0
    ap = _as_int(away_stats.get("played")) or 0
    home_compact = _record_compact_en(_as_int(home_stats.get("wins")), hp, _as_float(home_stats.get("points_pct")))
    away_compact = _record_compact_en(_as_int(away_stats.get("wins")), ap, _as_float(away_stats.get("points_pct")))
    home_compact_pct = _record_compact_en(_as_int(home_stats.get("wins")), hp, _as_float(home_stats.get("points_pct")), include_pct=True)
    away_compact_pct = _record_compact_en(_as_int(away_stats.get("wins")), ap, _as_float(away_stats.get("points_pct")), include_pct=True)
    home_plain = _record_plain_en(_as_int(home_stats.get("wins")), hp)
    away_plain = _record_plain_en(_as_int(away_stats.get("wins")), ap)
    home_count = _record_count_en(_as_int(home_stats.get("wins")), hp)
    away_count = _record_count_en(_as_int(away_stats.get("wins")), ap)

    if edge in ("home_clear", "home_slight"):
        variants = (
            f"{home} looks stronger in the games analyzed. {home_plain.capitalize()}; on the other side, {away} {away_compact}.",
            f"The recent numbers favor {home}: {home_count}. On the other side, {away} {away_compact}.",
            f"In the games analyzed, the home side has the stronger numbers: {home_compact_pct}. The away side {away_compact}.",
        )
    elif edge in ("away_clear", "away_slight"):
        variants = (
            f"{away} looks stronger in the games analyzed. {away_plain.capitalize()}; on the other side, {home} {home_compact}.",
            f"The recent numbers favor {away}: {away_count}. On the other side, {home} {home_compact}.",
            f"In the games analyzed, the away side has the stronger numbers: {away_compact_pct}. The home side {home_compact}.",
        )
    else:
        variants = (
            f"The two teams are closer in the recent numbers. {home} {home_compact}; {away} {away_compact}.",
            f"There is no big gap in the games analyzed. {home} {home_compact}; {away} {away_compact}.",
            f"The overall picture is more balanced. The home side {home_compact}, and the away side {away_compact}.",
        )
    return _pick_variant(seed=seed, section_key="current_season", variants=variants)


def _build_home_away_text_en(*, home: str, away: str, home_stats: Dict[str, Any], away_stats: Dict[str, Any], edge: str, seed: str) -> Tuple[str, int]:
    hhp = _as_int(home_stats.get("home_played")) or 0
    aap = _as_int(away_stats.get("away_played")) or 0
    hw = _as_int(home_stats.get("home_wins")) or 0
    aw = _as_int(away_stats.get("away_wins")) or 0
    hpct = f"{_as_float(home_stats.get('home_points_pct')):.1f}%" if _as_float(home_stats.get("home_points_pct")) is not None else "n/a"
    apct = f"{_as_float(away_stats.get('away_points_pct')):.1f}%" if _as_float(away_stats.get("away_points_pct")) is not None else "n/a"
    home_home = _split_plain_en(wins=hw, played=hhp, side="home")
    away_away = _split_plain_en(wins=aw, played=aap, side="away")

    if edge in ("home_clear", "home_slight"):
        variants = (
            f"Playing at home helps the picture: {home} {home_home}. As the away team, {away} {away_away}.",
            f"At home, {home} has the better numbers: {home_home}. On the other side, the visitor {away_away}.",
            f"The home game matters here. {home} {home_home} ({hpct}); {away} {away_away} ({apct}).",
        )
    elif edge in ("away_clear", "away_slight"):
        variants = (
            f"Home field has not helped {home} much in the recent numbers: the team {home_home}. On the other side, {away} has traveled well and {away_away}.",
            f"Looking at home and away form, the numbers lean more toward the visitor. {home} {home_home}; {away} {away_away}.",
            f"Even away from home, {away} looks better in this part of the context. The visitor {away_away}; the home side {home_home}.",
        )
    else:
        variants = (
            f"Home and away form does not point strongly to one side. {home} {home_home}; {away} {away_away}.",
            f"The home/away split is more divided. The home side {home_home}, and the visitor {away_away}.",
            f"Home and away form does not separate the teams that much here: {home} {home_home}; {away} {away_away}.",
        )
    return _pick_variant(seed=seed, section_key="home_away", variants=variants)


def _build_h2h_text_en(*, home: str, away: str, h2h: Dict[str, Any], edge: str, seed: str) -> Tuple[str, int]:
    matches = int(h2h.get("matches") or 0)
    summary = _h2h_summary_en(home=home, away=away, h2h=h2h)
    if edge in ("home_clear", "home_slight"):
        variants = (
            f"The recent head-to-head also helps {home}: over the last {matches} meetings, there were {summary}. Still, this is context, not a guarantee.",
            f"Between these teams, the recent meetings lean toward the home side. Over the last {matches} games, there were {summary}. It is useful, but it does not decide the bet on its own.",
            f"The recent head-to-head gives a bit more support to {home}. Over the last {matches} recorded games, there were {summary}, but history is not a promise of a repeat.",
        )
    elif edge in ("away_clear", "away_slight"):
        variants = (
            f"The recent head-to-head favors {away} a bit more: over the last {matches} meetings, there were {summary}. Still, it is support, not a guarantee.",
            f"In the head-to-head, the visitor has a slight recent edge. Over the last {matches} games, there were {summary}, but that does not change the game context by itself.",
            f"The head-to-head gives {away} a bit more weight. Over the last {matches} meetings, there were {summary}. It still has limited weight in the decision.",
        )
    else:
        variants = (
            f"The recent head-to-head is more balanced. Over the last {matches} meetings, there were {summary}. That does not do much to separate the sides.",
            f"Between them, the recent history does not show a clear edge: over the last {matches} games, there were {summary}. It is context, but it does not move the context on its own.",
            f"The recent head-to-head keeps the game more open. Over the last {matches} meetings, there were {summary}, without one side clearly taking over.",
        )
    return _pick_variant(seed=seed, section_key="head_to_head", variants=variants)


def _build_market_connection_text_en(
    *,
    context_side: str,
    home: str,
    away: str,
    seed: str,
    price_read: Optional[Dict[str, Any]] = None,
    decision: Optional[Dict[str, Any]] = None,
) -> Tuple[str, int]:
    decision_text = _build_decision_market_connection_text_en(
        decision=decision,
        home=home,
        away=away,
        seed=seed,
    )
    if decision_text is not None:
        return decision_text

    price_read = price_read or {}
    alignment = str(price_read.get("alignment") or "unknown")
    context_alignment = str(price_read.get("context_model_alignment") or "unknown")
    context_outcome = price_read.get("context_outcome")

    likely_outcome = price_read.get("most_likely_outcome")
    value_outcome = price_read.get("value_outcome")

    likely = _outcome_name_en(str(likely_outcome), home, away) if likely_outcome else None
    value = _outcome_name_en(str(value_outcome), home, away) if value_outcome else None
    context_name = _context_name_en(str(context_outcome), home, away) if context_outcome else None

    if alignment == "aligned_value" and likely:
        if context_alignment == "context_model_divergent" and context_name:
            variants = (
                f"The recent context favors {context_name}, but the model still makes {likely} the most likely outcome. Since the odds on {likely} also help, the play has value — with caution, because context and model are not fully aligned.",
                f"{context_name} looks better in the recent context, but the model still leans toward {likely}. With the current odds helping that side, this is a value read, but not a completely clean one.",
                f"The context leans toward {context_name}, while probability and price sit with {likely}. That keeps the play alive, but it is less clean than a fully aligned spot.",
            )
        else:
            variants = (
                f"{likely} is the most likely outcome, and the available odds still help. When probability and price point the same way, the play gets stronger.",
                f"The model gives more weight to {likely}, and the price still looks fair for the risk. This is clearer because probability and odds are aligned.",
                f"The numbers put {likely} ahead, and the odds still help. That makes the play more consistent.",
            )
    elif alignment == "contrarian_value" and likely and value:
        if context_alignment == "context_model_divergent" and context_name:
            variants = (
                f"The recent context favors {context_name}, and the model sees {likely} as more likely. Even so, the best price is on {value}. This is a value read: {value} has a lower chance, but the odds may compensate for the risk.",
                f"Context and probability are not fully aligned here: the context favors {context_name}, the model leans toward {likely}, and the interesting price is on {value}. This is a price-based read, not a favorite read.",
                f"This is not a straight read: {context_name} looks better in the context, {likely} is more likely in the model, but the odds on {value} look high for the risk. That is value, with caution.",
            )
        else:
            variants = (
                f"{likely} is the more likely outcome, but the interesting price is on {value}. Even with a lower chance, those odds may compensate for the risk. This is a value read, not a favorite read.",
                f"The higher chance is on {likely}, but the odds worth attention are on {value}. That does not make {value} more likely; it means the price may be high for the risk.",
                f"The model sees {likely} as the more likely scenario, but the value appears on {value}. In this case, price matters more than favoritism.",
            )
    elif alignment == "context_value" and likely and value:
        variants = (
            f"The model puts {likely} ahead, but the recent context and the price favor {value}. This is not about a clear favorite; it is about the odds being fair for the risk.",
            f"The higher probability is on {likely}, but the value read is on {value}. It is a cautious spot: the price helps, but it is not the most likely side.",
            f"The match has a higher chance for {likely}, but the odds on {value} deserve attention. Here, value matters more than favoritism.",
        )
    elif alignment == "balanced_value" and value:
        variants = (
            f"The context does not separate the teams much, but the price on {value} looks interesting. This is more about the odds than clear superiority.",
            f"With a more balanced context, price matters more. In this case, {value} deserves attention because the odds look fair for the risk.",
            f"Without a strong contextual favorite, the odds on {value} become more relevant. This is a price-based read.",
        )
    elif alignment == "favorite_no_value" and likely:
        variants = (
            f"{likely} is the most likely outcome, but the odds leave little room. The result can still happen, but the play loses strength at this price.",
            f"The higher chance is on {likely}, but the price looks short for the risk. A more likely result is not always a good bet at any odds.",
            f"The numbers point more to {likely}, but the current odds do not help enough. This is a spot for caution.",
        )
    elif alignment in ("missing_price", "missing_model"):
        variants = (
            "The match context is useful, but there is not enough price or model information to call it a play. Caution is better here.",
            "The context helps explain the match, but the betting decision is incomplete without reliable odds tied to the model.",
            "An important part of the price read is missing. For now, this is more context than a play.",
        )
    else:
        variants = (
            "Overall, this calls for patience more than urgency. If the odds do not pay enough for the risk, passing is better.",
            "There are points to watch, but not enough to enter without a genuinely good price.",
            "Being selective matters here. Without odds that help, watching from the outside may be the better decision.",
        )

    return _pick_variant(seed=seed, section_key="market_connection_v1_5", variants=variants)


# -----------------------------
# Spanish narrative builders
# -----------------------------

def _games_word_es(n: Optional[int]) -> str:
    return "partido" if int(n or 0) == 1 else "partidos"


def _wins_word_es(n: Optional[int]) -> str:
    return "victoria" if int(n or 0) == 1 else "victorias"


def _record_compact_es(wins: Optional[int], played: Optional[int], pct_value: Optional[float], *, include_pct: bool = False) -> str:
    w = int(wins or 0)
    p = int(played or 0)
    pct = f" ({float(pct_value):.1f}% de aprovechamiento)" if include_pct and pct_value is not None else ""
    if p <= 0:
        return "todavía tiene pocos partidos en este recorte"
    if w == 0:
        return f"todavía no ganó en {p} {_games_word_es(p)}{pct}"
    if p == 1:
        return f"ganó el único partido de este recorte{pct}"
    return f"ganó {w} de los {p} partidos{pct}"


def _record_count_es(wins: Optional[int], played: Optional[int]) -> str:
    w = int(wins or 0)
    p = int(played or 0)
    if p <= 0:
        return "pocos partidos en este recorte"
    if w == 0:
        return f"ninguna victoria en {p} {_games_word_es(p)}"
    return f"{w} {_wins_word_es(w)} en {p} {_games_word_es(p)}"


def _record_plain_es(wins: Optional[int], played: Optional[int]) -> str:
    w = int(wins or 0)
    p = int(played or 0)
    if p <= 0:
        return "tiene pocos partidos en este recorte"
    if w == 0:
        return f"todavía no ganó en {p} {_games_word_es(p)}"
    if p == 1:
        return "ganó el único partido de este recorte"
    return f"ganó {w} de los {p} partidos"


def _split_plain_es(*, wins: Optional[int], played: Optional[int], side: str) -> str:
    w = int(wins or 0)
    p = int(played or 0)
    if p <= 0:
        return f"tiene pocos partidos {side} en este recorte"
    if w == 0:
        return f"todavía no ganó {side} en este recorte"
    if p == 1:
        return f"ganó su único partido {side} en este recorte"
    return f"ganó {w} de los {p} partidos {side}"


def _join_es(parts: Tuple[str, ...]) -> str:
    clean = [p for p in parts if p]
    if not clean:
        return ""
    if len(clean) == 1:
        return clean[0]
    return ", ".join(clean[:-1]) + " y " + clean[-1]


def _h2h_summary_es(*, home: str, away: str, h2h: Dict[str, Any]) -> str:
    hw = int(h2h.get("home_wins") or 0)
    aw = int(h2h.get("away_wins") or 0)
    draws = int(h2h.get("draws") or 0)
    parts = []
    if hw > 0:
        parts.append(f"{hw} {_wins_word_es(hw)} de {home}")
    if draws > 0:
        parts.append(f"{draws} {_word(draws, 'empate', 'empates')}")
    if aw > 0:
        parts.append(f"{aw} {_wins_word_es(aw)} de {away}")
    return _join_es(tuple(parts)) or "sin victorias registradas para ninguno de los lados"


def _build_headline_es(
    *,
    home: str,
    away: str,
    context_side: str,
    season_edge: str,
    home_away_edge: str,
    h2h_status: str,
    seed: str,
    decision: Optional[Dict[str, Any]] = None,
) -> Tuple[str, int]:
    if context_side == "balanced" and _decision_has_clear_model_side(decision):
        outcome_key = _decision_outcome_key(decision)
        target = _outcome_name_es(outcome_key, home, away)
        variants = (
            f"{home} vs {away}: el recorte reciente está parejo, pero prevIA pone a {target} un poco por delante.",
            f"{home} vs {away}: los datos recientes no abren tanta distancia, pero {target} sale mejor en la cuenta general.",
            f"{home} vs {away}: partido parejo en contexto, con {target} liderando la lectura de prevIA.",
        )
        return _pick_variant(seed=seed, section_key="headline_model_reconciled", variants=variants)

    if context_side == "home":
        if home_away_edge in ("home_clear", "home_slight"):
            variants = (
                f"{home} vs {away}: el recorte reciente favorece al local, con el partido en casa pesando en la lectura.",
                f"{home} vs {away}: {home} llega mejor en este recorte, sobre todo por jugar en casa.",
                f"{home} vs {away}: el escenario favorece a {home}, pero el precio todavía importa.",
            )
        else:
            variants = (
                f"{home} vs {away}: el recorte reciente favorece un poco más a {home}, pero sin una ventaja clara.",
                f"{home} vs {away}: {home} aparece ligeramente por delante, pero la cuota tiene que ayudar.",
                f"{home} vs {away}: lectura levemente favorable al local, con margen para cautela.",
            )

    elif context_side == "away":
        if home_away_edge in ("away_clear", "away_slight"):
            variants = (
                f"{home} vs {away}: el visitante llega mejor en este recorte, incluso jugando fuera.",
                f"{home} vs {away}: {away} aparece más fuerte en los datos recientes y llega competitivo fuera.",
                f"{home} vs {away}: el contexto favorece más a {away}, pese al campo rival.",
            )
        else:
            variants = (
                f"{home} vs {away}: el recorte reciente favorece más a {away} que al local.",
                f"{home} vs {away}: {away} entra con una lectura un poco más positiva.",
                f"{home} vs {away}: el visitante aparece mejor en el contexto, pero el partido todavía pide cuidado.",
            )

    elif h2h_status == "unavailable":
        variants = (
            f"{home} vs {away}: partido con lectura más equilibrada y poco historial directo reciente.",
            f"{home} vs {away}: sin un lado muy claro en el contexto y sin historial reciente fuerte entre ellos.",
            f"{home} vs {away}: escenario equilibrado, con pocos indicadores claros para separar a los equipos.",
        )

    else:
        variants = (
            f"{home} vs {away}: contexto más equilibrado, sin un lado claramente dominante.",
            f"{home} vs {away}: los datos dejan el partido más abierto que unilateral.",
            f"{home} vs {away}: lectura equilibrada, con argumentos repartidos entre los dos lados.",
        )

    return _pick_variant(seed=seed, section_key="headline", variants=variants)


def _build_current_season_text_es(*, home: str, away: str, home_stats: Dict[str, Any], away_stats: Dict[str, Any], edge: str, seed: str) -> Tuple[str, int]:
    hp = _as_int(home_stats.get("played")) or 0
    ap = _as_int(away_stats.get("played")) or 0
    home_compact = _record_compact_es(_as_int(home_stats.get("wins")), hp, _as_float(home_stats.get("points_pct")))
    away_compact = _record_compact_es(_as_int(away_stats.get("wins")), ap, _as_float(away_stats.get("points_pct")))
    home_compact_pct = _record_compact_es(_as_int(home_stats.get("wins")), hp, _as_float(home_stats.get("points_pct")), include_pct=True)
    away_compact_pct = _record_compact_es(_as_int(away_stats.get("wins")), ap, _as_float(away_stats.get("points_pct")), include_pct=True)
    home_plain = _record_plain_es(_as_int(home_stats.get("wins")), hp)
    away_plain = _record_plain_es(_as_int(away_stats.get("wins")), ap)
    home_count = _record_count_es(_as_int(home_stats.get("wins")), hp)
    away_count = _record_count_es(_as_int(away_stats.get("wins")), ap)

    if edge in ("home_clear", "home_slight"):
        variants = (
            f"{home} llega en mejor momento en los partidos analizados. {home_plain.capitalize()}; del otro lado, {away} {away_compact}.",
            f"Los números favorecen a {home}: fueron {home_count}. Del otro lado, {away} {away_compact}.",
            f"En los partidos analizados, el local muestra una base más fuerte: {home_compact_pct}. El visitante {away_compact}.",
        )
    elif edge in ("away_clear", "away_slight"):
        variants = (
            f"{away} llega en mejor momento en los partidos analizados. {away_plain.capitalize()}; del otro lado, {home} {home_compact}.",
            f"Los números favorecen a {away}: fueron {away_count}. Del otro lado, {home} {home_compact}.",
            f"En los partidos analizados, el visitante muestra una base más fuerte: {away_compact_pct}. El local {home_compact}.",
        )
    else:
        variants = (
            f"La campaña de los dos equipos está más cerca en este recorte. {home} {home_compact}; {away} {away_compact}.",
            f"En los partidos analizados, no aparece una diferencia grande de campaña. {home} {home_compact}; {away} {away_compact}.",
            f"El momento general es más equilibrado. El local {home_compact}, y el visitante {away_compact}.",
        )
    return _pick_variant(seed=seed, section_key="current_season", variants=variants)


def _build_home_away_text_es(*, home: str, away: str, home_stats: Dict[str, Any], away_stats: Dict[str, Any], edge: str, seed: str) -> Tuple[str, int]:
    hhp = _as_int(home_stats.get("home_played")) or 0
    aap = _as_int(away_stats.get("away_played")) or 0
    hw = _as_int(home_stats.get("home_wins")) or 0
    aw = _as_int(away_stats.get("away_wins")) or 0
    hpct = f"{_as_float(home_stats.get('home_points_pct')):.1f}%" if _as_float(home_stats.get("home_points_pct")) is not None else "n/d"
    apct = f"{_as_float(away_stats.get('away_points_pct')):.1f}%" if _as_float(away_stats.get("away_points_pct")) is not None else "n/d"
    home_home = _split_plain_es(wins=hw, played=hhp, side="en casa")
    away_away = _split_plain_es(wins=aw, played=aap, side="fuera")

    if edge in ("home_clear", "home_slight"):
        variants = (
            f"Jugar en casa ayuda en este contexto: {home} {home_home}. Como visitante, {away} {away_away}.",
            f"En casa, {home} tiene mejores números: {home_home}. Del otro lado, el visitante {away_away}.",
            f"El partido en casa pesa a favor del local. {home} {home_home} ({hpct}); {away} {away_away} ({apct}).",
        )
    elif edge in ("away_clear", "away_slight"):
        variants = (
            f"El campo no ha ayudado tanto a {home} en este recorte: el equipo {home_home}. Del otro lado, {away} llega competitivo fuera y {away_away}.",
            f"En la comparación entre casa y fuera, los números favorecen más al visitante. {home} {home_home}; {away} {away_away}.",
            f"Incluso fuera de casa, {away} aparece mejor en este punto. El visitante {away_away}; el local {home_home}.",
        )
    else:
        variants = (
            f"Casa y fuera no apuntan con fuerza a un solo lado. {home} {home_home}; {away} {away_away}.",
            f"El recorte de local y visitante está más dividido. El local {home_home}, y el visitante {away_away}.",
            f"Casa y fuera no separan tanto a los equipos en este partido: {home} {home_home}; {away} {away_away}.",
        )
    return _pick_variant(seed=seed, section_key="home_away", variants=variants)


def _build_h2h_text_es(*, home: str, away: str, h2h: Dict[str, Any], edge: str, seed: str) -> Tuple[str, int]:
    matches = int(h2h.get("matches") or 0)
    summary = _h2h_summary_es(home=home, away=away, h2h=h2h)
    if edge in ("home_clear", "home_slight"):
        variants = (
            f"El historial reciente también ayuda a {home}: en los últimos {matches} enfrentamientos, fueron {summary}. Aun así, eso entra como contexto, no como garantía.",
            f"Entre ellos, el historial reciente se inclina hacia el local. En los últimos {matches} partidos, fueron {summary}. Es un dato útil, pero no decide la entrada por sí solo.",
            f"El duelo directo reciente refuerza un poco el contexto para {home}. En los últimos {matches} partidos registrados, fueron {summary}, pero el historial no promete repetición.",
        )
    elif edge in ("away_clear", "away_slight"):
        variants = (
            f"El historial reciente favorece más a {away}: en los últimos {matches} enfrentamientos, fueron {summary}. Aun así, es apoyo, no garantía.",
            f"En el duelo directo, el visitante tiene una pequeña ventaja reciente. En los últimos {matches} partidos, fueron {summary}, pero eso no cambia por sí solo la lectura del partido.",
            f"El retrospecto entre ellos le da algo más de peso a {away}. En los últimos {matches} enfrentamientos, fueron {summary}. Aun así, tiene peso limitado para decidir la entrada.",
        )
    else:
        variants = (
            f"El historial reciente entre ellos es más equilibrado. En los últimos {matches} enfrentamientos, fueron {summary}. Por eso, este dato ayuda poco a separar los lados.",
            f"Entre ellos, el historial reciente no muestra una ventaja clara: en los últimos {matches} partidos, fueron {summary}. Es contexto, pero no mueve el contexto por sí solo.",
            f"El duelo directo reciente deja el partido más abierto. En los últimos {matches} encuentros, fueron {summary}, sin dominio fuerte de un lado.",
        )
    return _pick_variant(seed=seed, section_key="head_to_head", variants=variants)


def _build_market_connection_text_es(
    *,
    context_side: str,
    home: str,
    away: str,
    seed: str,
    price_read: Optional[Dict[str, Any]] = None,
    decision: Optional[Dict[str, Any]] = None,
) -> Tuple[str, int]:
    decision_text = _build_decision_market_connection_text_es(
        decision=decision,
        home=home,
        away=away,
        seed=seed,
    )
    if decision_text is not None:
        return decision_text

    price_read = price_read or {}
    alignment = str(price_read.get("alignment") or "unknown")
    context_alignment = str(price_read.get("context_model_alignment") or "unknown")
    context_outcome = price_read.get("context_outcome")

    likely_outcome = price_read.get("most_likely_outcome")
    value_outcome = price_read.get("value_outcome")

    likely = _outcome_name_es(str(likely_outcome), home, away) if likely_outcome else None
    value = _outcome_name_es(str(value_outcome), home, away) if value_outcome else None
    context_name = _context_name_es(str(context_outcome), home, away) if context_outcome else None

    if alignment == "aligned_value" and likely:
        if context_alignment == "context_model_divergent" and context_name:
            variants = (
                f"El recorte reciente favorece a {context_name}, pero la lectura final del modelo coloca a {likely} como el resultado más probable. Como la cuota de {likely} también ayuda, la entrada gana interés — con cautela, porque contexto y modelo no están totalmente alineados.",
                f"{context_name} aparece mejor en el contexto reciente, pero el modelo todavía se inclina por {likely}. Con la cuota actual ayudando ese lado, hay valor, aunque no es una lectura totalmente limpia.",
                f"El contexto se inclina hacia {context_name}, mientras probabilidad y precio están del lado de {likely}. Eso mantiene la entrada viva, pero con más cuidado.",
            )
        else:
            variants = (
                f"{likely} aparece como el resultado más probable y la cuota disponible todavía ayuda. Cuando probabilidad y precio van hacia el mismo lado, la entrada gana fuerza.",
                f"El modelo da más peso a {likely}, y el precio todavía parece adecuado para el riesgo. Es una lectura más clara porque probabilidad y cuota están alineadas.",
                f"Los números colocan a {likely} por delante y la cuota todavía ayuda. En este escenario, la entrada se vuelve más consistente.",
            )
    elif alignment == "contrarian_value" and likely and value:
        if context_alignment == "context_model_divergent" and context_name:
            variants = (
                f"El recorte reciente favorece a {context_name}, y el modelo ve a {likely} como más probable. Aun así, el mejor precio aparece en {value}. Es una lectura de valor: {value} tiene menor chance, pero la cuota puede compensar el riesgo.",
                f"Contexto y probabilidad no están totalmente alineados aquí: el contexto favorece a {context_name}, el modelo pesa más {likely}, y la cuota interesante aparece en {value}. Es una lectura por precio, no por favoritismo.",
                f"La lectura no es tan directa: {context_name} va mejor en el contexto, {likely} es más probable para el modelo, pero la cuota de {value} parece alta para el riesgo. Es valor, con cautela.",
            )
        else:
            variants = (
                f"{likely} es el resultado más probable, pero el precio interesante está en {value}. Aunque tenga menor chance, esa cuota puede compensar el riesgo. Es una lectura de valor, no de favoritismo.",
                f"La mayor probabilidad está en {likely}, pero la cuota que merece atención es la de {value}. Eso no hace que {value} sea más probable; indica que el precio puede estar alto para el riesgo.",
                f"El modelo ve a {likely} como el escenario más probable, pero el valor aparece en {value}. En este caso, el precio pesa más que el favoritismo.",
            )
    elif alignment == "context_value" and likely and value:
        variants = (
            f"El modelo coloca a {likely} por delante, pero el recorte reciente y la cuota favorecen a {value}. No es una entrada por favorito claro, sino por un precio adecuado al riesgo.",
            f"La mayor probabilidad está en {likely}, pero la lectura de valor aparece en {value}. Es un escenario para cuidado: la cuota ayuda, pero no está en el lado más probable.",
            f"El partido tiene mayor chance para {likely}, pero la cuota de {value} merece atención. Aquí, el valor pesa más que el favoritismo.",
        )
    elif alignment == "balanced_value" and value:
        variants = (
            f"El contexto no separa tanto a los equipos, pero el precio en {value} aparece interesante. Es una lectura más basada en la cuota que en superioridad clara.",
            f"Como el partido está más equilibrado en el contexto, el precio gana peso. En este escenario, {value} merece atención porque la cuota parece adecuada al riesgo.",
            f"Sin un favorito contextual fuerte, la cuota de {value} se vuelve más relevante. Es una entrada para evaluar por precio.",
        )
    elif alignment == "favorite_no_value" and likely:
        variants = (
            f"{likely} es el resultado más probable, pero la cuota deja poco margen. El resultado puede darse, pero la entrada pierde fuerza a este precio.",
            f"La mayor probabilidad está en {likely}, pero el precio parece corto para el riesgo. Un resultado más probable no siempre es una buena apuesta a cualquier cuota.",
            f"Los números apuntan más a {likely}, pero la cuota actual no ayuda lo suficiente. Es un escenario para cautela.",
        )
    elif alignment in ("missing_price", "missing_model"):
        variants = (
            "El contexto del partido ayuda, pero falta precio o información del modelo para cerrar una conclusión de entrada. Mejor mantener cautela.",
            "El contexto explica el partido, pero la decisión de entrada queda incompleta sin cuotas confiables ligadas al modelo.",
            "Falta una parte importante de la lectura de precio. Por ahora, es más contexto que entrada.",
        )
    else:
        variants = (
            "En general, este partido pide más paciencia que prisa. Si la cuota no compensa bien el riesgo, mejor pasar.",
            "Hay puntos para observar, pero no lo suficiente para entrar sin un precio realmente bueno.",
            "Aquí conviene ser selectivo. Sin una cuota que ayude, mirar desde fuera puede ser la mejor decisión.",
        )

    return _pick_variant(seed=seed, section_key="market_connection_v1_5", variants=variants)


def _localized_limited_current_text(lang: str) -> str:
    if lang == "en":
        return "There are still too few games in this stretch to compare both teams with confidence."
    if lang == "es":
        return "Todavía hay pocos partidos en este recorte para comparar a los dos equipos con confianza."
    return "Ainda há poucos jogos no recorte analisado para comparar a campanha das duas equipes com segurança."


def _localized_limited_home_away_text(lang: str) -> str:
    if lang == "en":
        return "The home/away split still has too few games to become a strong conclusion. For now, it enters the context with caution."
    if lang == "es":
        return "El recorte casa/fuera todavía tiene pocos partidos para convertirse en una conclusión fuerte. Por ahora, entra con cautela en el contexto."
    return "O casa/fora ainda tem poucos jogos para virar uma conclusão forte. Por enquanto, esse ponto entra com cautela na leitura."


def _localized_h2h_limited_text(lang: str, matches: int) -> str:
    if lang == "en":
        if matches == 1:
            return "There is only 1 recent head-to-head game recorded, which is not enough to call it a pattern between the teams."
        return f"There are only {matches} recent head-to-head games recorded, which is not enough to call it a pattern between the teams."
    if lang == "es":
        if matches == 1:
            return "Hay solo 1 enfrentamiento directo reciente registrado, poco para decir que existe un patrón entre los equipos."
        return f"Hay solo {matches} enfrentamientos directos recientes registrados, poco para decir que existe un patrón entre los equipos."
    if matches == 1:
        return "Há só 1 confronto direto recente registrado, pouco para dizer que existe um padrão entre as equipes."
    return f"Há só {matches} confrontos diretos recentes registrados, pouco para dizer que existe um padrão entre as equipes."


def _localized_h2h_unavailable_text(lang: str) -> str:
    if lang == "en":
        return "There is not enough recent head-to-head history for it to carry weight in this context."
    if lang == "es":
        return "No hay suficientes enfrentamientos directos recientes para que ese historial pese en el contexto."
    return "Não há confrontos diretos recentes suficientes para esse histórico pesar na análise."


def _build_headline_for_lang(lang: str, **kwargs) -> Tuple[str, int]:
    if lang == "en":
        return _build_headline_en(**kwargs)
    if lang == "es":
        return _build_headline_es(**kwargs)
    return _build_headline_pt(**kwargs)


def _build_current_season_text_for_lang(lang: str, **kwargs) -> Tuple[str, int]:
    if lang == "en":
        return _build_current_season_text_en(**kwargs)
    if lang == "es":
        return _build_current_season_text_es(**kwargs)
    return _build_current_season_text_pt(**kwargs)


def _build_home_away_text_for_lang(lang: str, **kwargs) -> Tuple[str, int]:
    if lang == "en":
        return _build_home_away_text_en(**kwargs)
    if lang == "es":
        return _build_home_away_text_es(**kwargs)
    return _build_home_away_text_pt(**kwargs)


def _build_h2h_text_for_lang(lang: str, **kwargs) -> Tuple[str, int]:
    if lang == "en":
        return _build_h2h_text_en(**kwargs)
    if lang == "es":
        return _build_h2h_text_es(**kwargs)
    return _build_h2h_text_pt(**kwargs)


def _build_market_connection_text_for_lang(lang: str, **kwargs) -> Tuple[str, int]:
    if lang == "en":
        return _build_market_connection_text_en(**kwargs)
    if lang == "es":
        return _build_market_connection_text_es(**kwargs)
    return _build_market_connection_text_pt(**kwargs)


def _compose_language_texts(
    *,
    lang: str,
    home: str,
    away: str,
    home_stats: Optional[Dict[str, Any]],
    away_stats: Optional[Dict[str, Any]],
    h2h: Dict[str, Any],
    season_edge: str,
    home_away_edge: str,
    h2h_edge: str,
    context_side: str,
    price_read: Optional[Dict[str, Any]],
    decision: Optional[Dict[str, Any]],
    variant_seed: str,
    collect_variants: Optional[Dict[str, int]] = None,
) -> Dict[str, Any]:
    sections: Dict[str, Dict[str, Any]] = {}
    paragraphs = []

    hp = _as_int((home_stats or {}).get("played")) or 0
    ap = _as_int((away_stats or {}).get("played")) or 0
    if home_stats and away_stats and hp >= MIN_SEASON_GAMES and ap >= MIN_SEASON_GAMES:
        text, variant_idx = _build_current_season_text_for_lang(
            lang,
            home=home,
            away=away,
            home_stats=home_stats,
            away_stats=away_stats,
            edge=season_edge,
            seed=variant_seed,
        )
        if collect_variants is not None:
            collect_variants["current_season"] = variant_idx
        sections["current_season"] = {"status": "available", "quality": "good", "sample_size": {"home": hp, "away": ap}, "text": text}
    else:
        text = _localized_limited_current_text(lang)
        sections["current_season"] = {"status": "limited" if home_stats or away_stats else "unavailable", "quality": "limited", "sample_size": {"home": hp, "away": ap}, "text": text}
    paragraphs.append(text)

    hhp = _as_int((home_stats or {}).get("home_played")) or 0
    aap = _as_int((away_stats or {}).get("away_played")) or 0
    if home_stats and away_stats and hhp >= MIN_SPLIT_GAMES and aap >= MIN_SPLIT_GAMES:
        text, variant_idx = _build_home_away_text_for_lang(
            lang,
            home=home,
            away=away,
            home_stats=home_stats,
            away_stats=away_stats,
            edge=home_away_edge,
            seed=variant_seed,
        )
        if collect_variants is not None:
            collect_variants["home_away"] = variant_idx
        sections["home_away"] = {"status": "available", "quality": "good", "sample_size": {"home_home": hhp, "away_away": aap}, "text": text}
    else:
        text = _localized_limited_home_away_text(lang)
        sections["home_away"] = {"status": "limited" if home_stats or away_stats else "unavailable", "quality": "limited", "sample_size": {"home_home": hhp, "away_away": aap}, "text": text}
    paragraphs.append(text)

    if h2h["status"] == "available":
        text, variant_idx = _build_h2h_text_for_lang(lang, home=home, away=away, h2h=h2h, edge=h2h_edge, seed=variant_seed)
        if collect_variants is not None:
            collect_variants["head_to_head"] = variant_idx
        sections["head_to_head"] = {"status": "available", "quality": "good", "sample_size": h2h["matches"], "text": text}
    elif h2h["status"] == "limited":
        matches = int(h2h.get("matches") or 0)
        text = _localized_h2h_limited_text(lang, matches)
        sections["head_to_head"] = {"status": "limited", "quality": "limited", "sample_size": h2h["matches"], "text": text}
    else:
        text = _localized_h2h_unavailable_text(lang)
        sections["head_to_head"] = {"status": "unavailable", "quality": "unavailable", "sample_size": 0, "text": text}
    paragraphs.append(text)

    market_text, variant_idx = _build_market_connection_text_for_lang(
        lang,
        context_side=context_side,
        home=home,
        away=away,
        seed=variant_seed,
        price_read=price_read,
        decision=decision,
    )
    if collect_variants is not None:
        collect_variants["market_connection"] = variant_idx
    sections["market_connection"] = {"status": "available", "quality": "good", "text": market_text}
    paragraphs.append(market_text)

    headline, variant_idx = _build_headline_for_lang(
        lang,
        home=home,
        away=away,
        context_side=context_side,
        season_edge=season_edge,
        home_away_edge=home_away_edge,
        h2h_status=str(h2h.get("status") or "unknown"),
        seed=variant_seed,
        decision=decision,
    )
    if collect_variants is not None:
        collect_variants["headline"] = variant_idx

    return {"headline": headline, "paragraphs": paragraphs, "sections": sections}


def _fallback_context(*, reason: str, home_name: Optional[str], away_name: Optional[str]) -> Dict[str, Any]:
    home = _team(home_name, "mandante")
    away = _team(away_name, "visitante")
    pt = {
        "headline": "Contexto narrativo indisponível para esta partida.",
        "paragraphs": [
            f"Ainda não há dados contextuais suficientes para montar uma leitura confiável de {home} x {away}. "
            "A análise probabilística segue disponível normalmente, mas o panorama narrativo fica limitado neste momento."
        ],
        "sections": {},
    }
    en = {
        "headline": "Narrative context is unavailable for this match.",
        "paragraphs": [
            f"There is still not enough context data to build reliable context for {home} vs {away}. "
            "The probability analysis remains available, but the narrative view is limited for now."
        ],
        "sections": {},
    }
    es = {
        "headline": "El contexto narrativo no está disponible para este partido.",
        "paragraphs": [
            f"Todavía no hay datos contextuales suficientes para armar un contexto confiable de {home} vs {away}. "
            "El análisis probabilístico sigue disponible, pero el panorama narrativo queda limitado por ahora."
        ],
        "sections": {},
    }
    return {
        "version": NARRATIVE_CONTEXT_VERSION,
        "status": "unavailable",
        "quality": "unavailable",
        "language": "pt-BR",
        "default_language": "pt-BR",
        "languages": ["pt-BR", "en", "es"],
        "generated_at_utc": _now_iso(),
        "headline": pt["headline"],
        "paragraphs": pt["paragraphs"],
        "sections": {},
        "texts": {"pt-BR": pt, "en": en, "es": es},
        "signals": {
            "tone": NARRATIVE_CONTEXT_TONE,
            "context_side": "unknown",
            "price_context_alignment": "missing_context",
        },
        "facts": {},
        "data_gaps": [reason],
        "warnings": ["A leitura contextual não representa promessa ou garantia de resultado."],
    }

def _load_team_stats(conn, *, league_id: int, season: int, team_id: int) -> Optional[Dict[str, Any]]:
    sql = """
      SELECT
        played, wins, draws, losses, goals_for, goals_against, points,
        home_played, home_wins, home_draws, home_losses, home_points,
        away_played, away_wins, away_draws, away_losses, away_points,
        metric_version, computed_at
      FROM core.team_season_stats
      WHERE league_id = %(league_id)s
        AND season = %(season)s
        AND team_id = %(team_id)s
      LIMIT 1
    """
    with conn.cursor() as cur:
        cur.execute(sql, {"league_id": league_id, "season": season, "team_id": team_id})
        row = cur.fetchone()
    if not row:
        return None

    keys = [
        "played", "wins", "draws", "losses", "goals_for", "goals_against", "points",
        "home_played", "home_wins", "home_draws", "home_losses", "home_points",
        "away_played", "away_wins", "away_draws", "away_losses", "away_points",
        "metric_version", "computed_at",
    ]
    out = dict(zip(keys, row))
    out["points_pct"] = _pct(_as_int(out.get("points")), _as_int(out.get("played")))
    out["home_points_pct"] = _pct(_as_int(out.get("home_points")), _as_int(out.get("home_played")))
    out["away_points_pct"] = _pct(_as_int(out.get("away_points")), _as_int(out.get("away_played")))
    if hasattr(out.get("computed_at"), "isoformat"):
        out["computed_at"] = out["computed_at"].isoformat()
    return out


def _load_h2h(conn, *, home_team_id: int, away_team_id: int, before_utc: Any) -> Dict[str, Any]:
    sql = """
      SELECT home_team_id, away_team_id, goals_home, goals_away
      FROM core.fixtures
      WHERE is_finished = true
        AND COALESCE(is_cancelled, false) = false
        AND goals_home IS NOT NULL
        AND goals_away IS NOT NULL
        AND kickoff_utc < COALESCE(%(before_utc)s, NOW())
        AND (
          (home_team_id = %(home_team_id)s AND away_team_id = %(away_team_id)s)
          OR (home_team_id = %(away_team_id)s AND away_team_id = %(home_team_id)s)
        )
      ORDER BY kickoff_utc DESC
      LIMIT 10
    """
    with conn.cursor() as cur:
        cur.execute(
            sql,
            {"home_team_id": home_team_id, "away_team_id": away_team_id, "before_utc": before_utc},
        )
        rows = cur.fetchall() or []

    home_wins = away_wins = draws = 0
    for db_home_id, _db_away_id, goals_home, goals_away in rows:
        gh = int(goals_home)
        ga = int(goals_away)
        if int(db_home_id) == int(home_team_id):
            hp, ap = gh, ga
        else:
            hp, ap = ga, gh
        if hp > ap:
            home_wins += 1
        elif hp < ap:
            away_wins += 1
        else:
            draws += 1

    return {
        "matches": len(rows),
        "home_wins": home_wins,
        "draws": draws,
        "away_wins": away_wins,
        "status": "available" if len(rows) >= MIN_H2H_GAMES else ("limited" if rows else "unavailable"),
    }


def _public_stats(stats: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not stats:
        return None
    return {
        k: stats.get(k)
        for k in (
            "played", "wins", "draws", "losses", "goals_for", "goals_against", "points",
            "points_pct", "home_played", "home_wins", "home_points_pct",
            "away_played", "away_wins", "away_points_pct", "metric_version", "computed_at",
        )
    }


def build_narrative_context_v1(
    conn,
    *,
    payload: Dict[str, Any],
    sport_key: Optional[str],
    home_name: Optional[str],
    away_name: Optional[str],
    kickoff_utc: Any = None,
) -> Dict[str, Any]:
    inputs = dict((payload or {}).get("inputs") or {})
    league_id = _as_int(inputs.get("league_id"))
    season = _as_int(inputs.get("season"))
    home_team_id = _as_int(inputs.get("home_team_id"))
    away_team_id = _as_int(inputs.get("away_team_id"))
    home = _team(home_name, "mandante")
    away = _team(away_name, "visitante")

    if league_id is None or season is None or home_team_id is None or away_team_id is None:
        return _fallback_context(reason="missing_league_season_or_team_ids", home_name=home, away_name=away)

    home_stats = _load_team_stats(conn, league_id=league_id, season=season, team_id=home_team_id)
    away_stats = _load_team_stats(conn, league_id=league_id, season=season, team_id=away_team_id)
    h2h = _load_h2h(conn, home_team_id=home_team_id, away_team_id=away_team_id, before_utc=kickoff_utc)

    data_gaps = []
    selected_variants: Dict[str, int] = {}
    variant_seed = _variant_seed(
        sport_key=sport_key,
        league_id=league_id,
        season=season,
        home_team_id=home_team_id,
        away_team_id=away_team_id,
        kickoff_utc=kickoff_utc,
    )

    hp = _as_int((home_stats or {}).get("played")) or 0
    ap = _as_int((away_stats or {}).get("played")) or 0
    season_edge = "unknown"
    if home_stats and away_stats and hp >= MIN_SEASON_GAMES and ap >= MIN_SEASON_GAMES:
        season_edge = _edge_from_delta(_as_float(home_stats.get("points_pct")), _as_float(away_stats.get("points_pct")))
    else:
        data_gaps.append("current_season_limited")

    hhp = _as_int((home_stats or {}).get("home_played")) or 0
    aap = _as_int((away_stats or {}).get("away_played")) or 0
    home_away_edge = "unknown"
    if home_stats and away_stats and hhp >= MIN_SPLIT_GAMES and aap >= MIN_SPLIT_GAMES:
        home_away_edge = _edge_from_delta(_as_float(home_stats.get("home_points_pct")), _as_float(away_stats.get("away_points_pct")))
    else:
        data_gaps.append("home_away_limited")

    h2h_edge = "unknown"
    if h2h["status"] == "available":
        h2h_edge = _h2h_edge(h2h)
    elif h2h["status"] == "limited":
        data_gaps.append("head_to_head_limited")
    else:
        data_gaps.append("head_to_head_unavailable")

    context_side = _context_side_from_edges(season_edge, home_away_edge, h2h_edge)

    price_read = _build_context_price_read(
        payload=payload or {},
        context_side=context_side,
        home=home,
        away=away,
    )

    decision = (payload or {}).get("decision")
    if not isinstance(decision, dict):
        decision = None

    pt = _compose_language_texts(
        lang="pt-BR",
        home=home,
        away=away,
        home_stats=home_stats,
        away_stats=away_stats,
        h2h=h2h,
        season_edge=season_edge,
        home_away_edge=home_away_edge,
        h2h_edge=h2h_edge,
        context_side=context_side,
        price_read=price_read,
        decision=decision,
        variant_seed=variant_seed,
        collect_variants=selected_variants,
    )
    en = _compose_language_texts(
        lang="en",
        home=home,
        away=away,
        home_stats=home_stats,
        away_stats=away_stats,
        h2h=h2h,
        season_edge=season_edge,
        home_away_edge=home_away_edge,
        h2h_edge=h2h_edge,
        context_side=context_side,
        price_read=price_read,
        decision=decision,
        variant_seed=variant_seed,
    )
    es = _compose_language_texts(
        lang="es",
        home=home,
        away=away,
        home_stats=home_stats,
        away_stats=away_stats,
        h2h=h2h,
        season_edge=season_edge,
        home_away_edge=home_away_edge,
        h2h_edge=h2h_edge,
        context_side=context_side,
        price_read=price_read,
        decision=decision,
        variant_seed=variant_seed,
    )

    available = sum(
        1
        for key, section in (pt.get("sections") or {}).items()
        if key != "market_connection" and section.get("status") == "available"
    )
    status = "available" if available >= 2 else "limited"
    quality = "good" if status == "available" else "limited"

    return {
        "version": NARRATIVE_CONTEXT_VERSION,
        "status": status,
        "quality": quality,
        "language": "pt-BR",
        "default_language": "pt-BR",
        "languages": ["pt-BR", "en", "es"],
        "generated_at_utc": _now_iso(),
        "sport_key": str(sport_key) if sport_key else None,
        # Backward compatible: top-level text remains pt-BR.
        "headline": pt["headline"],
        "paragraphs": pt["paragraphs"],
        "sections": pt["sections"],
        # New multilingual payload for frontend selection later.
        "texts": {
            "pt-BR": pt,
            "en": en,
            "es": es,
        },
        "signals": {
            "tone": NARRATIVE_CONTEXT_TONE,
            "pricing_status": price_read.get("status"),
            "pricing_outcome": price_read.get("outcome"),
            "decision_version": (decision or {}).get("version") if isinstance(decision, dict) else None,
            "decision_label": (decision or {}).get("label") if isinstance(decision, dict) else None,
            "decision_is_positive": (decision or {}).get("is_positive") if isinstance(decision, dict) else None,
            "decision_outcome": _decision_outcome_key(decision),
            "context_side": context_side,
            "season_edge": season_edge,
            "home_away_edge": home_away_edge,
            "head_to_head_edge": h2h_edge,

            # Novos sinais explicativos.
            "price_context_alignment": price_read.get("alignment"),
            "context_model_alignment": price_read.get("context_model_alignment"),
            "context_pricing_status": price_read.get("context_pricing_status"),
            "context_outcome": price_read.get("context_outcome"),
            "most_likely_outcome": price_read.get("most_likely_outcome"),
            "value_outcome": price_read.get("value_outcome"),
            "value_status": price_read.get("value_status"),
        },
        "selected_variants": selected_variants,
        "facts": {
            "decision_summary": {
                "version": (decision or {}).get("version"),
                "label": (decision or {}).get("label"),
                "is_positive": (decision or {}).get("is_positive"),
                "outcome_key": _decision_outcome_key(decision),
                "reasons": list((decision or {}).get("reasons") or []),
                "blocks": list((decision or {}).get("blocks") or []),
            } if isinstance(decision, dict) else None,
            "league_id": league_id,
            "season": season,
            "home_team_id": home_team_id,
            "away_team_id": away_team_id,
            "home_team": _public_stats(home_stats),
            "away_team": _public_stats(away_stats),
            "head_to_head": h2h,
            "pricing": price_read,
        },
        "data_gaps": sorted(set(data_gaps)),
        "warnings": [
            "A leitura contextual não representa promessa ou garantia de resultado.",
            "A narrativa é gerada apenas a partir de dados estruturados disponíveis no snapshot e no banco.",
        ],
    }

def attach_narrative_context_v1(
    conn,
    *,
    payload: Dict[str, Any],
    sport_key: Optional[str],
    home_name: Optional[str],
    away_name: Optional[str],
    kickoff_utc: Any = None,
    language: str = "pt-BR",
) -> Dict[str, Any]:
    # language fica reservado para seleção futura; v1 mantém pt-BR no topo e materializa textos em pt-BR, en e es.
    out = dict(payload or {})
    try:
        with conn.cursor() as cur:
            cur.execute("SAVEPOINT narrative_context_v1")
        out["narrative_context"] = build_narrative_context_v1(
            conn,
            payload=out,
            sport_key=sport_key,
            home_name=home_name,
            away_name=away_name,
            kickoff_utc=kickoff_utc,
        )
        with conn.cursor() as cur:
            cur.execute("RELEASE SAVEPOINT narrative_context_v1")
    except Exception as exc:
        try:
            with conn.cursor() as cur:
                cur.execute("ROLLBACK TO SAVEPOINT narrative_context_v1")
                cur.execute("RELEASE SAVEPOINT narrative_context_v1")
        except Exception:
            pass
        out["narrative_context"] = _fallback_context(
            reason=f"generation_failed:{type(exc).__name__}",
            home_name=home_name,
            away_name=away_name,
        )
    return out