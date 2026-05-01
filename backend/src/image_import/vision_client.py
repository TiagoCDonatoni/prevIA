from __future__ import annotations

import base64
import json
import os
from typing import Any, Dict, List

import httpx
from fastapi import HTTPException, status


OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses"


def _env_str(name: str, default: str = "") -> str:
    return str(os.getenv(name, default)).strip()


def _env_int(name: str, default: int) -> int:
    raw = str(os.getenv(name, "")).strip()
    if not raw:
        return default
    try:
        return int(raw)
    except Exception:
        return default


def _openai_api_key() -> str:
    return _env_str("OPENAI_API_KEY")


def _image_import_model() -> str:
    return _env_str("OPENAI_IMAGE_IMPORT_MODEL", "gpt-4.1-mini")


def _image_import_detail() -> str:
    value = _env_str("OPENAI_IMAGE_IMPORT_DETAIL", "low").lower()
    if value not in {"low", "high", "auto"}:
        return "low"
    return value


def _max_output_tokens() -> int:
    return max(800, _env_int("OPENAI_IMAGE_IMPORT_MAX_OUTPUT_TOKENS", 2500))


def _timeout_seconds() -> int:
    return max(10, _env_int("OPENAI_IMAGE_IMPORT_TIMEOUT_SECONDS", 45))


def _schema() -> Dict[str, Any]:
    return {
        "type": "object",
        "additionalProperties": False,
        "required": ["image_type", "image_quality", "items", "warnings"],
        "properties": {
            "image_type": {
                "type": "string",
                "enum": [
                    "single_event",
                    "multi_event_list",
                    "betslip",
                    "live",
                    "unknown",
                ],
            },
            "image_quality": {
                "type": "number",
                "minimum": 0,
                "maximum": 1,
            },
            "warnings": {
                "type": "array",
                "items": {"type": "string"},
            },
            "items": {
                "type": "array",
                "maxItems": 15,
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "required": [
                        "home",
                        "away",
                        "league",
                        "kickoff_text",
                        "kickoff_iso_local",
                        "market",
                        "selection",
                        "line",
                        "odd",
                        "bookmaker",
                        "confidence",
                        "notes",
                    ],
                    "properties": {
                        "home": {"type": ["string", "null"]},
                        "away": {"type": ["string", "null"]},
                        "league": {"type": ["string", "null"]},
                        "kickoff_text": {"type": ["string", "null"]},
                        "kickoff_iso_local": {"type": ["string", "null"]},
                        "market": {"type": ["string", "null"]},
                        "selection": {"type": ["string", "null"]},
                        "line": {"type": ["string", "null"]},
                        "odd": {"type": ["string", "null"]},
                        "bookmaker": {"type": ["string", "null"]},
                        "confidence": {
                            "type": "number",
                            "minimum": 0,
                            "maximum": 1,
                        },
                        "notes": {"type": ["string", "null"]},
                    },
                },
            },
        },
    }


def _prompt(*, max_items: int, lang: str, timezone_name: str) -> str:
    return f"""
Você é um extrator de dados para o produto prevIA.

Tarefa:
Ler um print de casa de apostas e extrair jogos/mercados/odds para pré-preencher a tela "Montar aposta".

Idioma preferencial do usuário: {lang}
Timezone do usuário: {timezone_name}

Regras obrigatórias:
- Extraia no máximo {max_items} itens.
- Considere apenas futebol/soccer.
- Priorize mercados pré-jogo.
- NÃO invente dados que não aparecem.
- Se a linha do mercado não estiver visível, retorne line = null.
- O backend aplicará fallback 2.5 para totals sem linha.
- Se a imagem parecer live, betslip complexo, bet builder ou prop de jogador, classifique image_type corretamente e extraia apenas o que estiver claro.
- Mercados suportados pelo MVP:
  1) 1X2 / resultado final / vencedor da partida
  2) totals / over-under / mais-menos gols
  3) BTTS / ambas marcam
- Se o mercado não for um destes, preserve o texto bruto em market/selection.
- Odds devem ser retornadas como texto legível, por exemplo "1.87" ou "1,87".
- kickoff_iso_local só deve ser preenchido se houver data/hora suficientes para formar ISO local.
- Se houver horário mas não houver data, deixe kickoff_iso_local = null e preserve kickoff_text.
- Se não tiver certeza de um item, reduza confidence.
- Retorne somente JSON no schema solicitado.
""".strip()


def _extract_output_text(payload: Dict[str, Any]) -> str:
    output_text = payload.get("output_text")
    if isinstance(output_text, str) and output_text.strip():
        return output_text.strip()

    parts: List[str] = []

    for item in payload.get("output") or []:
        if not isinstance(item, dict):
            continue

        for content in item.get("content") or []:
            if not isinstance(content, dict):
                continue

            if isinstance(content.get("text"), str):
                parts.append(content["text"])

    return "\n".join(part for part in parts if part.strip()).strip()


def extract_image_items_from_openai(
    *,
    image_bytes: bytes,
    mime_type: str,
    max_items: int,
    lang: str = "pt-BR",
    timezone_name: str = "America/Sao_Paulo",
) -> Dict[str, Any]:
    api_key = _openai_api_key()
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "ok": False,
                "code": "OPENAI_API_KEY_MISSING",
                "message": "OPENAI_API_KEY is not configured",
            },
        )

    encoded = base64.b64encode(image_bytes).decode("ascii")
    data_url = f"data:{mime_type};base64,{encoded}"

    body = {
        "model": _image_import_model(),
        "input": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "input_text",
                        "text": _prompt(
                            max_items=int(max_items),
                            lang=lang,
                            timezone_name=timezone_name,
                        ),
                    },
                    {
                        "type": "input_image",
                        "image_url": data_url,
                        "detail": _image_import_detail(),
                    },
                ],
            }
        ],
        "text": {
            "format": {
                "type": "json_schema",
                "name": "previa_manual_analysis_image_import_v1",
                "schema": _schema(),
                "strict": False,
            }
        },
        "max_output_tokens": _max_output_tokens(),
    }

    try:
        with httpx.Client(timeout=_timeout_seconds()) as client:
            response = client.post(
                OPENAI_RESPONSES_URL,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json=body,
            )
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={
                "ok": False,
                "code": "OPENAI_IMAGE_IMPORT_REQUEST_FAILED",
                "message": f"{type(exc).__name__}: {exc}",
            },
        )

    if response.status_code >= 400:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={
                "ok": False,
                "code": "OPENAI_IMAGE_IMPORT_FAILED",
                "message": response.text[:800],
            },
        )

    payload = response.json()
    text = _extract_output_text(payload)

    if not text:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={
                "ok": False,
                "code": "OPENAI_IMAGE_IMPORT_EMPTY_OUTPUT",
                "message": "empty model output",
            },
        )

    try:
        parsed = json.loads(text)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={
                "ok": False,
                "code": "OPENAI_IMAGE_IMPORT_INVALID_JSON",
                "message": f"{type(exc).__name__}: {str(exc)}",
            },
        )

    if not isinstance(parsed, dict):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={
                "ok": False,
                "code": "OPENAI_IMAGE_IMPORT_INVALID_SHAPE",
                "message": "model output is not an object",
            },
        )

    items = parsed.get("items")
    if not isinstance(items, list):
        parsed["items"] = []

    parsed["items"] = parsed["items"][: int(max_items)]

    if not parsed.get("image_type"):
        parsed["image_type"] = "unknown"

    if parsed.get("image_quality") is None:
        parsed["image_quality"] = 0

    if not isinstance(parsed.get("warnings"), list):
        parsed["warnings"] = []

    return parsed