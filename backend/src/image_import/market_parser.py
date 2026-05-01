from __future__ import annotations

import re
import unicodedata
from typing import Any, Dict, Optional


DEFAULT_TOTALS_LINE = 2.5


def _strip_accents(value: str) -> str:
    value = unicodedata.normalize("NFKD", value or "")
    return "".join(ch for ch in value if not unicodedata.combining(ch))


def _norm(value: Any) -> str:
    raw = _strip_accents(str(value or "").lower())
    raw = re.sub(r"[^a-z0-9,+.\-\s]", " ", raw)
    raw = re.sub(r"\b(ksa|sau|saudi)\b", " ", raw)
    raw = re.sub(r"\s+", " ", raw)
    return raw.strip()


def _parse_decimal(raw: Any) -> Optional[float]:
    if raw in (None, ""):
        return None

    value = str(raw).strip()
    value = value.replace("@", " ")
    value = re.sub(r"[^0-9,.\-+]", " ", value)
    value = value.strip()

    if not value:
        return None

    # Odds/linhas em PT-BR costumam vir com vírgula decimal.
    if "," in value and "." not in value:
        value = value.replace(",", ".")

    # Se ainda sobrar espaço, pega o primeiro número plausível.
    match = re.search(r"[-+]?\d+(?:\.\d+)?", value)
    if not match:
        return None

    try:
        return float(match.group(0))
    except Exception:
        return None


def _contains_any(text: str, needles: list[str]) -> bool:
    return any(needle in text for needle in needles)


def _detect_market(raw_market: str, raw_selection: str) -> str | None:
    text = f"{raw_market} {raw_selection}".strip()

    if _contains_any(
        text,
        [
            "ambas marcam",
            "ambos marcam",
            "btts",
            "both teams",
            "both score",
            "gg",
        ],
    ):
        return "BTTS"

    if _contains_any(
        text,
        [
            "over",
            "under",
            "mais de",
            "menos de",
            "acima de",
            "abaixo de",
            "total",
            "totals",
            "gols",
            "goals",
            "o/u",
            "ou",
        ],
    ):
        return "TOTALS"

    if _contains_any(
        text,
        [
            "1x2",
            "resultado",
            "vencedor",
            "winner",
            "match winner",
            "resultado final",
            "tempo regulamentar",
            "full time result",
        ],
    ):
        return "1X2"

    # Muitas grades mostram apenas 1 / X / 2 como seleção.
    if raw_selection in {"1", "x", "2"} or raw_market in {"1", "x", "2"}:
        return "1X2"

    return None


def _detect_totals_selection(raw_market: str, raw_selection: str) -> str | None:
    text = f"{raw_market} {raw_selection}".strip()

    if _contains_any(text, ["over", "mais", "acima", "+"]):
        return "over"

    if _contains_any(text, ["under", "menos", "abaixo", "-"]):
        return "under"

    return None


def _detect_btts_selection(raw_market: str, raw_selection: str) -> str | None:
    text = f"{raw_market} {raw_selection}".strip()

    if _contains_any(text, ["sim", "yes", "ambas marcam", "ambos marcam"]):
        return "yes"

    if _contains_any(text, ["nao", "não", "no", "ambas nao", "ambos nao"]):
        return "no"

    return None


def _detect_1x2_selection(
    *,
    raw_market: str,
    raw_selection: str,
    home_name: str,
    away_name: str,
) -> str | None:
    selection = raw_selection.strip()
    market = raw_market.strip()
    text = f"{market} {selection}".strip()

    if selection == "1" or text in {"1"}:
        return "H"

    if selection == "x" or selection == "empate" or _contains_any(text, ["draw", "empate"]):
        return "D"

    if selection == "2" or text in {"2"}:
        return "A"

    home_norm = _norm(home_name)
    away_norm = _norm(away_name)

    if home_norm and home_norm in text:
        return "H"

    if away_norm and away_norm in text:
        return "A"

    if _contains_any(text, ["mandante", "casa", "home"]):
        return "H"

    if _contains_any(text, ["visitante", "fora", "away"]):
        return "A"

    return None


def normalize_image_import_market(raw_item: Dict[str, Any]) -> Dict[str, Any]:
    home = str(raw_item.get("home") or "").strip()
    away = str(raw_item.get("away") or "").strip()

    raw_market = _norm(raw_item.get("market"))
    raw_selection = _norm(raw_item.get("selection"))
    raw_line = raw_item.get("line")
    raw_odd = raw_item.get("odd")

    odds_value = _parse_decimal(raw_odd)
    line_value = _parse_decimal(raw_line)

    normalized: Dict[str, Any] = {
        "market_key": None,
        "selection_key": None,
        "line": None,
        "odds_value": odds_value,
        "line_was_defaulted": False,
    }

    if not home or not away:
        return {
            "status": "UNREADABLE",
            "market_supported": False,
            "normalized": normalized,
            "message": "home/away not readable",
        }

    if odds_value is None or odds_value <= 1:
        return {
            "status": "UNREADABLE",
            "market_supported": False,
            "normalized": normalized,
            "message": "odd not readable",
        }

    market_key = _detect_market(raw_market, raw_selection)

    if not market_key:
        return {
            "status": "UNSUPPORTED_MARKET",
            "market_supported": False,
            "normalized": normalized,
            "message": "market is not supported in MVP",
        }

    selection_key: str | None = None

    if market_key == "TOTALS":
        selection_key = _detect_totals_selection(raw_market, raw_selection)
        if line_value is None:
            line_value = DEFAULT_TOTALS_LINE
            normalized["line_was_defaulted"] = True

    elif market_key == "BTTS":
        selection_key = _detect_btts_selection(raw_market, raw_selection)
        line_value = None

    elif market_key == "1X2":
        selection_key = _detect_1x2_selection(
            raw_market=raw_market,
            raw_selection=raw_selection,
            home_name=home,
            away_name=away,
        )
        line_value = None

    normalized.update(
        {
            "market_key": market_key,
            "selection_key": selection_key,
            "line": line_value,
            "odds_value": odds_value,
        }
    )

    if not selection_key:
        return {
            "status": "LOW_CONFIDENCE",
            "market_supported": False,
            "normalized": normalized,
            "message": "selection could not be mapped",
        }

    return {
        "status": "READY",
        "market_supported": True,
        "normalized": normalized,
        "message": None,
    }