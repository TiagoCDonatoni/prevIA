from __future__ import annotations

import json
from typing import Any, Dict, List

from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile, status

from src.access.service import _resolve_current_actor, _today_date_key
from src.db.pg import pg_conn
from src.http.product_manual_analysis_router import (
    ManualAnalysisEvaluateRequest,
    _build_whatif_analysis_payload,
    _consume_credit_for_manual_analysis,
    _ensure_manual_analysis_access,
    _prune_manual_analysis_history,
)
from src.image_import.schemas import ImageImportBatchEvaluateRequest
from src.image_import.service import (
    DEFAULT_TOTALS_LINE,
    create_preview_request,
    ensure_image_import_access,
    limits_for_plan,
    mark_batch_generated,
    read_and_validate_image,
    require_image_import_enabled,
)

router = APIRouter(
    prefix="/product/manual-analysis/image-import",
    tags=["product-manual-analysis-image-import"],
)

_READY_STATUS = {"READY", "USER_CONFIRMED"}


def _actor_plan_and_user(request: Request) -> tuple[Dict[str, Any], str, int, bool]:
    actor = _resolve_current_actor(request)
    plan_code = _ensure_manual_analysis_access(actor)
    access_context = actor.get("access") or {}
    is_internal = bool(access_context.get("is_internal") or access_context.get("product_internal_access"))
    ensure_image_import_access(plan_code, is_internal=is_internal)
    user_id = int(actor["user"]["user_id"])
    return actor, plan_code, user_id, is_internal


@router.post("/preview")
async def product_manual_analysis_image_preview(
    request: Request,
    image: UploadFile = File(...),
    lang: str = Form("pt-BR"),
    timezone_name: str = Form("America/Sao_Paulo"),
):
    require_image_import_enabled()
    _actor, plan_code, user_id, _is_internal = _actor_plan_and_user(request)
    date_key = _today_date_key()

    image_bytes, image_meta = await read_and_validate_image(image)

    try:
        return create_preview_request(
            user_id=user_id,
            plan_code=plan_code,
            date_key=date_key,
            image_bytes=image_bytes,
            image_meta=image_meta,
            lang=lang,
            timezone_name=timezone_name,
        )
    finally:
        # A imagem não é persistida no MVP.
        del image_bytes


def _safe_float(raw: Any) -> float | None:
    if raw in (None, ""):
        return None
    try:
        value = float(raw)
    except Exception:
        return None
    return value if value > 0 else None


def _row_to_manual_payload(row: Dict[str, Any]) -> ManualAnalysisEvaluateRequest:
    normalized = row.get("normalized_json") or {}
    raw = row.get("raw_extraction_json") or {}

    if isinstance(normalized, str):
        try:
            normalized = json.loads(normalized)
        except Exception:
            normalized = {}

    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except Exception:
            raw = {}

    odds_1x2 = normalized.get("odds_1x2")
    odds_totals = normalized.get("odds_totals")
    odds_btts = normalized.get("odds_btts")

    if not isinstance(odds_1x2, dict):
        odds_1x2 = {"H": None, "D": None, "A": None}

    if not isinstance(odds_totals, dict):
        odds_totals = {"over": None, "under": None}

    if not isinstance(odds_btts, dict):
        odds_btts = {"yes": None, "no": None}

    # Compat com rows antigas de seleção única.
    market_key = str(normalized.get("market_key") or "").strip().upper()
    selection_key = str(normalized.get("selection_key") or "").strip().lower()
    odds_value = _safe_float(normalized.get("odds_value") or raw.get("odd"))

    if market_key == "1X2" and selection_key.upper() in odds_1x2:
        odds_1x2[selection_key.upper()] = odds_value
    elif market_key == "TOTALS" and selection_key in odds_totals:
        odds_totals[selection_key] = odds_value
    elif market_key == "BTTS" and selection_key in odds_btts:
        odds_btts[selection_key] = odds_value

    line_value = _safe_float(normalized.get("totals_line") or normalized.get("line"))
    if line_value is None and (odds_totals.get("over") is not None or odds_totals.get("under") is not None):
        line_value = DEFAULT_TOTALS_LINE

    return ManualAnalysisEvaluateRequest(
        sport_key="soccer",
        league_id=row.get("league_id"),
        season=row.get("season"),
        home_team_id=int(row["resolved_home_team_id"]),
        away_team_id=int(row["resolved_away_team_id"]),
        market_key="FULL",
        totals_line=line_value,
        bookmaker_name=(raw.get("bookmaker") or normalized.get("bookmaker_name") or None),
        odds_1x2={
            "H": _safe_float(odds_1x2.get("H")),
            "D": _safe_float(odds_1x2.get("D")),
            "A": _safe_float(odds_1x2.get("A")),
        },
        odds_totals={
            "over": _safe_float(odds_totals.get("over")),
            "under": _safe_float(odds_totals.get("under")),
        },
        odds_btts={
            "yes": _safe_float(odds_btts.get("yes")),
            "no": _safe_float(odds_btts.get("no")),
        },
    )


@router.post("/evaluate-batch")
def product_manual_analysis_image_evaluate_batch(
    request: Request,
    payload: ImageImportBatchEvaluateRequest,
):
    require_image_import_enabled()
    actor, plan_code, user_id, _is_internal = _actor_plan_and_user(request)
    entitlements = actor.get("entitlements") or {}
    date_key = _today_date_key()
    base_daily_limit = int(((entitlements.get("credits") or {}).get("daily_limit") or 0))

    requested_row_ids: List[int] = []
    seen = set()

    for raw_id in payload.row_ids:
        try:
            row_id = int(raw_id)
        except Exception:
            continue

        if row_id <= 0 or row_id in seen:
            continue

        seen.add(row_id)
        requested_row_ids.append(row_id)

    if not requested_row_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"ok": False, "code": "NO_ROWS_SELECTED", "message": "select at least one row"},
        )

    limits = limits_for_plan(plan_code)
    if len(requested_row_ids) > limits.max_rows_per_image:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "ok": False,
                "code": "IMAGE_IMPORT_ROW_LIMIT_EXCEEDED",
                "message": "too many rows selected for this plan",
                "max_rows": limits.max_rows_per_image,
            },
        )

    analyses: List[Dict[str, Any]] = []
    skipped: List[Dict[str, Any]] = []
    last_usage: Dict[str, Any] | None = None
    consumed_count = 0

    with pg_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT request_id
                FROM access.user_manual_analysis_image_requests
                WHERE request_id = %(request_id)s
                  AND user_id = %(user_id)s
                FOR UPDATE
                """,
                {"request_id": int(payload.request_id), "user_id": int(user_id)},
            )

            if cur.fetchone() is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail={"ok": False, "code": "IMAGE_IMPORT_REQUEST_NOT_FOUND", "message": "request not found"},
                )

            cur.execute(
                """
                SELECT row_id,
                       request_id,
                       row_index,
                       status,
                       raw_extraction_json,
                       normalized_json,
                       resolved_fixture_id,
                       resolved_home_team_id,
                       resolved_away_team_id,
                       league_id,
                       season,
                       match_confidence,
                       market_supported,
                       generated_analysis_id
                FROM access.user_manual_analysis_image_rows
                WHERE request_id = %(request_id)s
                  AND user_id = %(user_id)s
                  AND row_id = ANY(%(row_ids)s)
                ORDER BY row_index ASC, row_id ASC
                FOR UPDATE
                """,
                {
                    "request_id": int(payload.request_id),
                    "user_id": int(user_id),
                    "row_ids": requested_row_ids,
                },
            )

            db_rows = cur.fetchall()
            rows_by_id = {int(row[0]): row for row in db_rows}

            for row_id in requested_row_ids:
                db_row = rows_by_id.get(row_id)

                if not db_row:
                    skipped.append({"row_id": row_id, "status": "not_found"})
                    continue

                generated_analysis_id = db_row[13]
                if generated_analysis_id:
                    analysis_response = None

                    cur.execute(
                        """
                        SELECT result_payload, created_at_utc
                        FROM access.user_manual_analyses
                        WHERE analysis_id = %(analysis_id)s
                          AND user_id = %(user_id)s
                        LIMIT 1
                        """,
                        {
                            "analysis_id": int(generated_analysis_id),
                            "user_id": int(user_id),
                        },
                    )
                    existing_analysis = cur.fetchone()

                    if existing_analysis and existing_analysis[0]:
                        raw_result_payload = existing_analysis[0]

                        if isinstance(raw_result_payload, str):
                            try:
                                analysis_response = json.loads(raw_result_payload)
                            except Exception:
                                analysis_response = None
                        elif isinstance(raw_result_payload, dict):
                            analysis_response = dict(raw_result_payload)

                        if isinstance(analysis_response, dict):
                            analysis_response.update(
                                {
                                    "ok": True,
                                    "analysis_id": int(generated_analysis_id),
                                    "saved_at_utc": existing_analysis[1].isoformat().replace("+00:00", "Z")
                                    if existing_analysis[1]
                                    else None,
                                    "consumed_credit": False,
                                    "date_key": str(date_key),
                                }
                            )

                    analyses.append(
                        {
                            "row_id": row_id,
                            "analysis_id": int(generated_analysis_id),
                            "status": "already_generated",
                            "consumed_credit": False,
                            "analysis": analysis_response,
                        }
                    )
                    continue

                status_value = str(db_row[3] or "").strip().upper()
                market_supported = bool(db_row[12])

                if status_value not in _READY_STATUS or not market_supported:
                    skipped.append({"row_id": row_id, "status": "not_ready", "row_status": status_value})
                    continue

                if not db_row[7] or not db_row[8]:
                    skipped.append({"row_id": row_id, "status": "missing_resolved_teams"})
                    continue

                row_dict = {
                    "row_id": int(db_row[0]),
                    "request_id": int(db_row[1]),
                    "row_index": int(db_row[2]),
                    "status": status_value,
                    "raw_extraction_json": db_row[4],
                    "normalized_json": db_row[5],
                    "resolved_fixture_id": db_row[6],
                    "resolved_home_team_id": db_row[7],
                    "resolved_away_team_id": db_row[8],
                    "league_id": db_row[9],
                    "season": db_row[10],
                    "match_confidence": db_row[11],
                    "market_supported": market_supported,
                }

                manual_payload = _row_to_manual_payload(row_dict)
                analysis_payload = _build_whatif_analysis_payload(conn, manual_payload)

                credit_result = _consume_credit_for_manual_analysis(
                    cur,
                    user_id=user_id,
                    date_key=date_key,
                    base_daily_limit=base_daily_limit,
                    reason=(
                        f"manual_analysis_image:{payload.request_id}:{row_id}:"
                        f"{analysis_payload['event']['home_name']}:{analysis_payload['event']['away_name']}"
                    ),
                )

                if not credit_result.get("ok"):
                    last_usage = credit_result.get("usage")
                    skipped.append({"row_id": row_id, "status": "no_credits"})
                    break

                cur.execute(
                    """
                    INSERT INTO access.user_manual_analyses (
                        user_id,
                        sport_key,
                        event_id,
                        fixture_id,
                        home_name,
                        away_name,
                        market_key,
                        selection_line,
                        bookmaker_name,
                        plan_code,
                        source_type,
                        credits_cost,
                        input_payload,
                        result_payload
                    )
                    VALUES (
                        %(user_id)s,
                        %(sport_key)s,
                        %(event_id)s,
                        %(fixture_id)s,
                        %(home_name)s,
                        %(away_name)s,
                        %(market_key)s,
                        %(selection_line)s,
                        %(bookmaker_name)s,
                        %(plan_code)s,
                        'image_import',
                        1,
                        %(input_payload)s::jsonb,
                        %(result_payload)s::jsonb
                    )
                    RETURNING analysis_id, created_at_utc
                    """,
                    {
                        "user_id": user_id,
                        "sport_key": analysis_payload["event"]["sport_key"],
                        "event_id": analysis_payload["event"]["event_id"],
                        "fixture_id": analysis_payload["event"]["fixture_id"],
                        "home_name": analysis_payload["event"]["home_name"],
                        "away_name": analysis_payload["event"]["away_name"],
                        "market_key": analysis_payload["market"]["market_key"],
                        "selection_line": analysis_payload["market"].get("line"),
                        "bookmaker_name": analysis_payload["manual_input"].get("bookmaker_name"),
                        "plan_code": plan_code,
                        "input_payload": json.dumps(manual_payload.model_dump()),
                        "result_payload": json.dumps(analysis_payload),
                    },
                )

                saved = cur.fetchone()
                analysis_id = int(saved[0])

                cur.execute(
                    """
                    UPDATE access.user_manual_analysis_image_rows
                    SET generated_analysis_id = %(analysis_id)s,
                        status = 'ANALYSIS_GENERATED',
                        updated_at_utc = NOW()
                    WHERE row_id = %(row_id)s
                      AND user_id = %(user_id)s
                    """,
                    {"analysis_id": analysis_id, "row_id": row_id, "user_id": user_id},
                )

                analyses.append(
                    {
                        "row_id": row_id,
                        "analysis_id": analysis_id,
                        "status": "generated",
                        "consumed_credit": True,
                        "analysis": {
                            "ok": True,
                            "analysis_id": analysis_id,
                            "saved_at_utc": saved[1].isoformat().replace("+00:00", "Z")
                            if saved and saved[1]
                            else None,
                            "consumed_credit": True,
                            "date_key": str(date_key),
                            "usage": credit_result.get("usage"),
                            **analysis_payload,
                        },
                    }
                )

                consumed_count += 1
                last_usage = credit_result.get("usage")

            if consumed_count:
                mark_batch_generated(cur, user_id=user_id, date_key=date_key, generated_count=consumed_count)
                _prune_manual_analysis_history(cur, user_id=int(user_id))

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
                    'BATCH_EVALUATE',
                    'user',
                    %(payload_json)s::jsonb
                )
                """,
                {
                    "request_id": int(payload.request_id),
                    "user_id": int(user_id),
                    "payload_json": json.dumps(
                        {
                            "requested_row_ids": requested_row_ids,
                            "credits_consumed": consumed_count,
                            "generated_count": len([a for a in analyses if a.get("status") == "generated"]),
                            "skipped_count": len(skipped),
                        }
                    ),
                },
            )

            conn.commit()

    if skipped and any(item.get("status") == "no_credits" for item in skipped) and not analyses:
        return {
            "ok": False,
            "code": "NO_CREDITS",
            "message": "daily credit limit reached",
            "credits_required": len(requested_row_ids),
            "credits_consumed": consumed_count,
            "remaining_credits": int((last_usage or {}).get("remaining") or 0),
            "usage": last_usage,
            "analyses": analyses,
            "skipped": skipped,
        }

    return {
        "ok": True,
        "credits_required": len([item for item in requested_row_ids if item in rows_by_id]),
        "credits_consumed": consumed_count,
        "remaining_credits": int((last_usage or {}).get("remaining") or 0) if last_usage else None,
        "usage": last_usage,
        "analyses": analyses,
        "skipped": skipped,
    }