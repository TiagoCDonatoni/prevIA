from __future__ import annotations

import hashlib
import json
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from io import BytesIO
from typing import Any, Dict, List, Tuple

from fastapi import HTTPException, UploadFile, status
from PIL import Image, UnidentifiedImageError

from src.db.pg import pg_conn

from src.image_import.candidate_resolver import resolve_image_import_item
from src.image_import.market_parser import normalize_image_import_market
from src.image_import.vision_client import extract_image_items_from_openai

IMAGE_IMPORT_ALLOWED_PLANS = {"LIGHT", "PRO"}
SUPPORTED_IMAGE_MIME_TYPES = {"image/jpeg", "image/png", "image/webp"}
DEFAULT_MAX_IMAGE_BYTES = 8 * 1024 * 1024
MIN_LONG_SIDE_PX = 600
DEFAULT_TOTALS_LINE = 2.5


@dataclass(frozen=True)
class ImageImportLimits:
    max_rows_per_image: int
    uploads_per_day: int
    cooldown_seconds: int


def _env_bool(name: str, default: bool = False) -> bool:
    raw = str(os.getenv(name, "")).strip().lower()
    if not raw:
        return default
    return raw in {"1", "true", "yes", "on"}


def _env_int(name: str, default: int) -> int:
    raw = str(os.getenv(name, "")).strip()
    if not raw:
        return default
    try:
        return int(raw)
    except Exception:
        return default


def image_import_enabled() -> bool:
    return _env_bool("IMAGE_IMPORT_ENABLED", default=False)


def max_image_bytes() -> int:
    return max(256 * 1024, _env_int("IMAGE_IMPORT_MAX_BYTES", DEFAULT_MAX_IMAGE_BYTES))


def limits_for_plan(plan_code: str) -> ImageImportLimits:
    normalized = str(plan_code or "").strip().upper()
    if normalized == "PRO":
        return ImageImportLimits(
            max_rows_per_image=max(1, _env_int("IMAGE_IMPORT_PRO_MAX_ROWS", 15)),
            uploads_per_day=max(1, _env_int("IMAGE_IMPORT_PRO_UPLOADS_PER_DAY", 30)),
            cooldown_seconds=max(0, _env_int("IMAGE_IMPORT_PRO_COOLDOWN_SECONDS", 8)),
        )

    return ImageImportLimits(
        max_rows_per_image=max(1, _env_int("IMAGE_IMPORT_LIGHT_MAX_ROWS", 5)),
        uploads_per_day=max(1, _env_int("IMAGE_IMPORT_LIGHT_UPLOADS_PER_DAY", 10)),
        cooldown_seconds=max(0, _env_int("IMAGE_IMPORT_LIGHT_COOLDOWN_SECONDS", 20)),
    )


def ensure_image_import_access(plan_code: str, *, is_internal: bool = False) -> None:
    normalized = str(plan_code or "").strip().upper()
    if normalized in IMAGE_IMPORT_ALLOWED_PLANS or is_internal:
        return

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail={
            "ok": False,
            "code": "FEATURE_LOCKED",
            "message": "image import requires Light or Pro",
        },
    )


def require_image_import_enabled() -> None:
    if image_import_enabled():
        return

    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail={
            "ok": False,
            "code": "IMAGE_IMPORT_DISABLED",
            "message": "image import is disabled by configuration",
        },
    )


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _iso_or_none(value: Any) -> str | None:
    if not value:
        return None
    try:
        return value.isoformat().replace("+00:00", "Z")
    except Exception:
        return None


def _image_usage_payload(row: Any, *, limits: ImageImportLimits) -> Dict[str, Any]:
    attempts = int(row[0] or 0) if row else 0
    accepted = int(row[1] or 0) if row else 0
    rejected = int(row[2] or 0) if row else 0
    generated = int(row[3] or 0) if row else 0
    risk_score = float(row[4] or 0) if row else 0
    blocked_until = row[5] if row else None

    return {
        "upload_attempts_today": attempts,
        "accepted_uploads_today": accepted,
        "rejected_uploads_today": rejected,
        "generated_analyses_today": generated,
        "uploads_remaining_today": max(0, int(limits.uploads_per_day) - attempts),
        "blocked_until_utc": _iso_or_none(blocked_until),
        "risk_score": risk_score,
    }


def lock_and_increment_upload_attempt(cur, *, user_id: int, date_key, limits: ImageImportLimits) -> Dict[str, Any]:
    cur.execute(
        """
        INSERT INTO access.user_manual_analysis_image_usage_daily (
            user_id,
            date_key,
            upload_attempts,
            accepted_uploads,
            rejected_uploads,
            generated_analyses,
            risk_score
        )
        VALUES (%(user_id)s, %(date_key)s, 0, 0, 0, 0, 0)
        ON CONFLICT (user_id, date_key) DO NOTHING
        """,
        {"user_id": int(user_id), "date_key": date_key},
    )

    cur.execute(
        """
        SELECT upload_attempts,
               accepted_uploads,
               rejected_uploads,
               generated_analyses,
               risk_score,
               blocked_until_utc
        FROM access.user_manual_analysis_image_usage_daily
        WHERE user_id = %(user_id)s
          AND date_key = %(date_key)s
        FOR UPDATE
        """,
        {"user_id": int(user_id), "date_key": date_key},
    )
    row = cur.fetchone()
    usage = _image_usage_payload(row, limits=limits)

    blocked_until = row[5] if row else None
    if blocked_until and blocked_until > _utc_now():
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "ok": False,
                "code": "IMAGE_IMPORT_TEMPORARILY_BLOCKED",
                "message": "image import is temporarily blocked for this user",
                "usage": usage,
            },
        )

    if int(usage["upload_attempts_today"]) >= int(limits.uploads_per_day):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "ok": False,
                "code": "IMAGE_IMPORT_UPLOAD_LIMIT_REACHED",
                "message": "daily image upload limit reached",
                "usage": usage,
            },
        )

    cur.execute(
        """
        UPDATE access.user_manual_analysis_image_usage_daily
        SET upload_attempts = upload_attempts + 1,
            updated_at_utc = NOW()
        WHERE user_id = %(user_id)s
          AND date_key = %(date_key)s
        RETURNING upload_attempts,
                  accepted_uploads,
                  rejected_uploads,
                  generated_analyses,
                  risk_score,
                  blocked_until_utc
        """,
        {"user_id": int(user_id), "date_key": date_key},
    )
    return _image_usage_payload(cur.fetchone(), limits=limits)


def mark_upload_accepted(cur, *, user_id: int, date_key, limits: ImageImportLimits) -> Dict[str, Any]:
    cur.execute(
        """
        UPDATE access.user_manual_analysis_image_usage_daily
        SET accepted_uploads = accepted_uploads + 1,
            updated_at_utc = NOW()
        WHERE user_id = %(user_id)s
          AND date_key = %(date_key)s
        RETURNING upload_attempts,
                  accepted_uploads,
                  rejected_uploads,
                  generated_analyses,
                  risk_score,
                  blocked_until_utc
        """,
        {"user_id": int(user_id), "date_key": date_key},
    )
    return _image_usage_payload(cur.fetchone(), limits=limits)


def mark_upload_rejected(cur, *, user_id: int, date_key, limits: ImageImportLimits) -> Dict[str, Any]:
    cur.execute(
        """
        UPDATE access.user_manual_analysis_image_usage_daily
        SET rejected_uploads = rejected_uploads + 1,
            updated_at_utc = NOW()
        WHERE user_id = %(user_id)s
          AND date_key = %(date_key)s
        RETURNING upload_attempts,
                  accepted_uploads,
                  rejected_uploads,
                  generated_analyses,
                  risk_score,
                  blocked_until_utc
        """,
        {"user_id": int(user_id), "date_key": date_key},
    )
    return _image_usage_payload(cur.fetchone(), limits=limits)


def mark_batch_generated(cur, *, user_id: int, date_key, generated_count: int) -> None:
    cur.execute(
        """
        INSERT INTO access.user_manual_analysis_image_usage_daily (
            user_id,
            date_key,
            upload_attempts,
            accepted_uploads,
            rejected_uploads,
            generated_analyses,
            risk_score
        )
        VALUES (%(user_id)s, %(date_key)s, 0, 0, 0, %(generated_count)s, 0)
        ON CONFLICT (user_id, date_key) DO UPDATE
        SET generated_analyses = access.user_manual_analysis_image_usage_daily.generated_analyses + EXCLUDED.generated_analyses,
            updated_at_utc = NOW()
        """,
        {"user_id": int(user_id), "date_key": date_key, "generated_count": int(generated_count)},
    )


async def read_and_validate_image(file: UploadFile) -> Tuple[bytes, Dict[str, Any]]:
    content_type = str(file.content_type or "").strip().lower()

    if content_type not in SUPPORTED_IMAGE_MIME_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"ok": False, "code": "UNSUPPORTED_IMAGE_TYPE", "message": "unsupported image type"},
        )

    raw = await file.read()
    if not raw:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"ok": False, "code": "EMPTY_IMAGE", "message": "image is empty"},
        )

    if len(raw) > max_image_bytes():
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail={"ok": False, "code": "IMAGE_TOO_LARGE", "message": "image is too large"},
        )

    try:
        with Image.open(BytesIO(raw)) as img:
            width, height = img.size
            fmt = img.format
    except UnidentifiedImageError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"ok": False, "code": "INVALID_IMAGE", "message": "invalid image"},
        )

    if max(width, height) < MIN_LONG_SIDE_PX:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"ok": False, "code": "IMAGE_TOO_SMALL", "message": "image resolution is too low"},
        )

    return raw, {
        "sha256": hashlib.sha256(raw).hexdigest(),
        "mime_type": content_type,
        "size_bytes": len(raw),
        "width": int(width),
        "height": int(height),
        "format": fmt,
    }


def _summarize_rows(rows: List[Dict[str, Any]]) -> Dict[str, int]:
    summary = {
        "items_detected": len(rows),
        "auto_resolved": 0,
        "needs_confirmation": 0,
        "rejected": 0,
    }

    for row in rows:
        status_value = str(row.get("status") or "").upper()
        if status_value == "READY":
            summary["auto_resolved"] += 1
        elif status_value == "NEEDS_CONFIRMATION":
            summary["needs_confirmation"] += 1
        else:
            summary["rejected"] += 1

    return summary


def _to_raw_item(raw: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "home": raw.get("home"),
        "away": raw.get("away"),
        "league": raw.get("league"),
        "kickoff": raw.get("kickoff_text"),
        "kickoff_iso_local": raw.get("kickoff_iso_local"),
        "market": raw.get("market"),
        "selection": raw.get("selection"),
        "line": raw.get("line"),
        "odd": raw.get("odd"),
        "bookmaker": raw.get("bookmaker"),
        "confidence": raw.get("confidence"),
        "notes": raw.get("notes"),
    }

def _raw_group_key(raw_item: Dict[str, Any]) -> str:
    def clean(value: Any) -> str:
        return " ".join(str(value or "").strip().lower().split())

    return "|".join(
        [
            clean(raw_item.get("home")),
            clean(raw_item.get("away")),
            clean(raw_item.get("league")),
            clean(raw_item.get("kickoff")),
            clean(raw_item.get("kickoff_iso_local")),
        ]
    )


def _group_raw_items_by_event(raw_items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    grouped: Dict[str, Dict[str, Any]] = {}

    for raw_model_item in raw_items:
        raw_item = _to_raw_item(raw_model_item if isinstance(raw_model_item, dict) else {})
        key = _raw_group_key(raw_item)

        if key not in grouped:
            grouped[key] = {
                **raw_item,
                "selections": [],
            }

        grouped[key]["selections"].append(
            {
                "market": raw_item.get("market"),
                "selection": raw_item.get("selection"),
                "line": raw_item.get("line"),
                "odd": raw_item.get("odd"),
                "confidence": raw_item.get("confidence"),
                "notes": raw_item.get("notes"),
            }
        )

    return list(grouped.values())


def _normalize_grouped_market(raw_item: Dict[str, Any]) -> Dict[str, Any]:
    selections = raw_item.get("selections") or []

    odds_1x2 = {"H": None, "D": None, "A": None}
    odds_totals = {"over": None, "under": None}
    odds_btts = {"yes": None, "no": None}
    totals_line = None
    line_was_defaulted = False
    supported_count = 0
    unsupported_count = 0
    messages: List[str] = []

    for selection in selections:
        item_for_parser = {
            **raw_item,
            "market": selection.get("market"),
            "selection": selection.get("selection"),
            "line": selection.get("line"),
            "odd": selection.get("odd"),
        }

        parsed = normalize_image_import_market(item_for_parser)
        normalized = parsed.get("normalized") or {}
        market_key = normalized.get("market_key")
        selection_key = normalized.get("selection_key")
        odds_value = normalized.get("odds_value")

        if parsed.get("status") == "UNSUPPORTED_MARKET":
            unsupported_count += 1
            continue

        if not parsed.get("market_supported"):
            if parsed.get("message"):
                messages.append(str(parsed["message"]))
            continue

        if market_key == "1X2" and selection_key in odds_1x2:
            odds_1x2[selection_key] = odds_value
            supported_count += 1

        elif market_key == "TOTALS" and selection_key in odds_totals:
            odds_totals[selection_key] = odds_value
            totals_line = normalized.get("line")
            line_was_defaulted = bool(normalized.get("line_was_defaulted"))
            supported_count += 1

        elif market_key == "BTTS" and selection_key in odds_btts:
            odds_btts[selection_key] = odds_value
            supported_count += 1

    normalized_group = {
        "market_key": "FULL",
        "selection_key": None,
        "line": totals_line,
        "totals_line": totals_line,
        "odds_value": None,
        "line_was_defaulted": line_was_defaulted,
        "odds_1x2": odds_1x2,
        "odds_totals": odds_totals,
        "odds_btts": odds_btts,
        "supported_selection_count": supported_count,
        "unsupported_selection_count": unsupported_count,
    }

    if supported_count <= 0:
        return {
            "status": "UNSUPPORTED_MARKET",
            "market_supported": False,
            "normalized": normalized_group,
            "message": "no supported market selection found",
        }

    return {
        "status": "READY",
        "market_supported": True,
        "normalized": normalized_group,
        "message": "; ".join(messages) if messages else None,
    }


def _merge_status(*, parser_status: str, resolver_status: str, market_supported: bool) -> str:
    if parser_status != "READY":
        return parser_status

    if not market_supported:
        return "UNSUPPORTED_MARKET"

    return resolver_status


def _response_item_from_row(
    *,
    row_id: int,
    row_index: int,
    status_value: str,
    raw: Dict[str, Any],
    normalized: Dict[str, Any],
    resolved: Dict[str, Any],
    candidates: List[Dict[str, Any]],
    message: str | None,
) -> Dict[str, Any]:
    return {
        "row_id": int(row_id),
        "row_index": int(row_index),
        "status": status_value,
        "raw": raw,
        "normalized": normalized,
        "resolved": {
            "fixture_id": resolved.get("fixture_id"),
            "home_team_id": resolved.get("home_team_id"),
            "away_team_id": resolved.get("away_team_id"),
            "home_name": resolved.get("home_name"),
            "away_name": resolved.get("away_name"),
            "kickoff_utc": resolved.get("kickoff_utc"),
            "confidence": resolved.get("confidence"),
        },
        "candidates": candidates or [],
        "message": message,
    }


def create_preview_request(
    *,
    user_id: int,
    plan_code: str,
    date_key,
    image_bytes: bytes,
    image_meta: Dict[str, Any],
    lang: str = "pt-BR",
    timezone_name: str = "America/Sao_Paulo",
    source_type: str = "manual_analysis_image",
) -> Dict[str, Any]:
    limits = limits_for_plan(plan_code)

    # 1) Registra tentativa e solta a transação antes de chamar IA externa.
    with pg_conn() as conn:
        with conn.cursor() as cur:
            lock_and_increment_upload_attempt(
                cur,
                user_id=int(user_id),
                date_key=date_key,
                limits=limits,
            )
            conn.commit()

    # 2) Chama o motor de visão fora de lock/transaction longa.
    try:
        extracted = extract_image_items_from_openai(
            image_bytes=image_bytes,
            mime_type=str(image_meta.get("mime_type") or "image/png"),
            max_items=int(limits.max_rows_per_image),
            lang=lang,
            timezone_name=timezone_name,
        )
    except HTTPException:
        with pg_conn() as conn:
            with conn.cursor() as cur:
                mark_upload_rejected(cur, user_id=int(user_id), date_key=date_key, limits=limits)
                conn.commit()
        raise

    raw_items = extracted.get("items") or []
    if not isinstance(raw_items, list):
        raw_items = []

    grouped_items = _group_raw_items_by_event(raw_items)

    image_type = str(extracted.get("image_type") or "unknown")
    image_quality = float(extracted.get("image_quality") or 0)

    response_rows: List[Dict[str, Any]] = []

    # 3) Persiste request + rows estruturadas. A imagem em si já pode ser descartada.
    with pg_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO access.user_manual_analysis_image_requests (
                    user_id,
                    plan_code,
                    source_type,
                    image_type,
                    status,
                    image_sha256,
                    image_mime_type,
                    image_size_bytes,
                    image_width,
                    image_height,
                    risk_score,
                    finished_at_utc
                )
                VALUES (
                    %(user_id)s,
                    %(plan_code)s,
                    %(source_type)s,
                    %(image_type)s,
                    %(status)s,
                    %(image_sha256)s,
                    %(image_mime_type)s,
                    %(image_size_bytes)s,
                    %(image_width)s,
                    %(image_height)s,
                    0,
                    NOW()
                )
                RETURNING request_id
                """,
                {
                    "user_id": int(user_id),
                    "plan_code": str(plan_code or "").strip().upper(),
                    "source_type": source_type,
                    "image_type": image_type,
                    "status": "preview_ready",
                    "image_sha256": image_meta.get("sha256"),
                    "image_mime_type": image_meta.get("mime_type"),
                    "image_size_bytes": int(image_meta.get("size_bytes") or 0),
                    "image_width": int(image_meta.get("width") or 0),
                    "image_height": int(image_meta.get("height") or 0),
                },
            )
            request_id = int(cur.fetchone()[0])

            for row_index, raw_item in enumerate(grouped_items[: int(limits.max_rows_per_image)], start=1):
                parser_result = _normalize_grouped_market(raw_item)
                normalized = parser_result.get("normalized") or {}
                market_supported = bool(parser_result.get("market_supported"))

                resolver_result = {
                    "status": "UNREADABLE",
                    "resolved": {},
                    "candidates": [],
                    "match_confidence": 0,
                    "message": "not resolved",
                }

                if parser_result.get("status") == "READY":
                    resolver_result = resolve_image_import_item(
                        conn,
                        raw_item=raw_item,
                        normalized_result=parser_result,
                        timezone_name=timezone_name,
                        sport_key="soccer",
                    )

                resolved = resolver_result.get("resolved") or {}
                candidates = resolver_result.get("candidates") or []
                status_value = _merge_status(
                    parser_status=str(parser_result.get("status") or "UNREADABLE"),
                    resolver_status=str(resolver_result.get("status") or "UNREADABLE"),
                    market_supported=market_supported,
                )
                message = parser_result.get("message") or resolver_result.get("message")

                cur.execute(
                    """
                    INSERT INTO access.user_manual_analysis_image_rows (
                        request_id,
                        user_id,
                        row_index,
                        status,
                        raw_extraction_json,
                        normalized_json,
                        candidates_json,
                        resolved_fixture_id,
                        resolved_home_team_id,
                        resolved_away_team_id,
                        league_id,
                        season,
                        match_confidence,
                        market_supported,
                        user_confirmed
                    )
                    VALUES (
                        %(request_id)s,
                        %(user_id)s,
                        %(row_index)s,
                        %(status)s,
                        %(raw_extraction_json)s::jsonb,
                        %(normalized_json)s::jsonb,
                        %(candidates_json)s::jsonb,
                        %(resolved_fixture_id)s,
                        %(resolved_home_team_id)s,
                        %(resolved_away_team_id)s,
                        %(league_id)s,
                        %(season)s,
                        %(match_confidence)s,
                        %(market_supported)s,
                        false
                    )
                    RETURNING row_id
                    """,
                    {
                        "request_id": int(request_id),
                        "user_id": int(user_id),
                        "row_index": int(row_index),
                        "status": status_value,
                        "raw_extraction_json": json.dumps(raw_item),
                        "normalized_json": json.dumps(normalized),
                        "candidates_json": json.dumps(candidates),
                        "resolved_fixture_id": resolved.get("fixture_id"),
                        "resolved_home_team_id": resolved.get("home_team_id"),
                        "resolved_away_team_id": resolved.get("away_team_id"),
                        "league_id": resolved.get("league_id"),
                        "season": resolved.get("season"),
                        "match_confidence": resolver_result.get("match_confidence"),
                        "market_supported": market_supported,
                    },
                )
                row_id = int(cur.fetchone()[0])

                response_rows.append(
                    _response_item_from_row(
                        row_id=row_id,
                        row_index=row_index,
                        status_value=status_value,
                        raw=raw_item,
                        normalized=normalized,
                        resolved=resolved,
                        candidates=candidates,
                        message=message,
                    )
                )

            cur.execute(
                """
                INSERT INTO access.user_manual_analysis_image_actions (
                    request_id,
                    user_id,
                    action_type,
                    actor_type,
                    payload_json
                )
                VALUES (
                    %(request_id)s,
                    %(user_id)s,
                    'PREVIEW_CREATED',
                    'system',
                    %(payload_json)s::jsonb
                )
                """,
                {
                    "request_id": int(request_id),
                    "user_id": int(user_id),
                    "payload_json": json.dumps(
                        {
                            "image_meta": image_meta,
                            "image_type": image_type,
                            "image_quality": image_quality,
                            "warnings": extracted.get("warnings") or [],
                            "raw_items": len(raw_items),
                            "grouped_rows": len(response_rows),
                        }
                    ),
                },
            )

            usage = mark_upload_accepted(cur, user_id=int(user_id), date_key=date_key, limits=limits)
            conn.commit()

    return {
        "ok": True,
        "request_id": request_id,
        "image_type": image_type,
        "status": "preview_ready",
        "summary": _summarize_rows(response_rows),
        "usage": usage,
        "items": response_rows,
    }