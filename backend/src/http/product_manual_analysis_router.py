from __future__ import annotations

import json
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Body, HTTPException, Query, Request, status
from pydantic import BaseModel

from src.access.service import (
    _build_usage_payload,
    _consume_one_bonus_credit,
    _fetch_bonus_credit_balance,
    _resolve_current_actor,
    _resolve_product_plan_code,
    _today_date_key,
)
from src.db.pg import pg_conn
from src.models.one_x_two_logreg_v1 import predict_1x2_from_artifact
from src.product.matchup_model_v0 import estimate_lambdas_with_fallback
from src.product.score_engine_v1 import derive_1x2, derive_btts, derive_totals, generate_score_matrix_v1

router = APIRouter(prefix="/product/manual-analysis", tags=["product-manual-analysis"])

MANUAL_ANALYSIS_ALLOWED_PLANS = {"LIGHT", "PRO"}
INTERESTING_ODD_PREMIUM = 0.03
ALIGNED_ODD_DISCOUNT = 0.02


class ManualAnalysisEvaluateRequest(BaseModel):
    sport_key: str = "soccer"
    league_id: int | None = None
    season: int | None = None
    artifact_filename: str | None = None

    home_team_id: int
    away_team_id: int

    market_key: str  # 1X2 | TOTALS | BTTS
    totals_line: float | None = None

    bookmaker_name: str | None = None
    odds_1x2: Dict[str, float | None] | None = None
    odds_totals: Dict[str, float | None] | None = None
    odds_btts: Dict[str, float | None] | None = None


def _normalize_market_key(raw: Any) -> str:
    value = str(raw or "").strip().upper()
    if value in {"1X2", "TOTALS", "BTTS"}:
        return value
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail={"ok": False, "code": "INVALID_MARKET", "message": "market_key is invalid"},
    )


def _ensure_manual_analysis_access(actor: Dict[str, Any]) -> str:
    plan_code = _resolve_product_plan_code(actor)
    access_context = actor.get("access") or {}
    is_internal = bool(access_context.get("is_internal") or access_context.get("product_internal_access"))

    if plan_code in MANUAL_ANALYSIS_ALLOWED_PLANS or is_internal:
        return plan_code

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail={
            "ok": False,
            "code": "FEATURE_LOCKED",
            "message": "manual analysis requires Light or Pro",
        },
    )


def _safe_float(raw: Any) -> Optional[float]:
    if raw in (None, ""):
        return None
    try:
        value = float(raw)
    except Exception:
        return None
    if value <= 1.0:
        return None
    return value


def _fair_odd(prob: Optional[float]) -> Optional[float]:
    if prob is None or prob <= 0:
        return None
    return 1.0 / prob


def _interesting_odd(prob: Optional[float]) -> Optional[float]:
    fair = _fair_odd(prob)
    if fair is None:
        return None
    return fair * (1.0 + INTERESTING_ODD_PREMIUM)


def _implied_prob(odd: Optional[float]) -> Optional[float]:
    if odd is None or odd <= 0:
        return None
    return 1.0 / odd


def _build_selection(prob: Optional[float]) -> Dict[str, Any]:
    fair = _fair_odd(prob)
    return {
        "model_prob": prob,
        "fair_odd": fair,
        "interesting_above": _interesting_odd(prob),
    }


def _compare_price(prob: Optional[float], odd: Optional[float]) -> Optional[Dict[str, Any]]:
    odd_value = _safe_float(odd)
    if prob is None or odd_value is None:
        return None

    implied = _implied_prob(odd_value)
    fair = _fair_odd(prob)
    interesting = _interesting_odd(prob)
    edge = None if implied is None else float(prob) - float(implied)

    classification = "ALIGNED"
    if interesting is not None and odd_value >= interesting:
        classification = "GOOD"
    elif fair is not None and odd_value < (fair * (1.0 - ALIGNED_ODD_DISCOUNT)):
        classification = "BAD"

    return {
        "odd": odd_value,
        "implied_prob": implied,
        "model_prob": prob,
        "fair_odd": fair,
        "interesting_above": interesting,
        "edge": edge,
        "classification": classification,
    }


def _fetch_effective_season(conn, *, league_id: int, requested_season: Optional[int]) -> int:
    if requested_season is not None:
        return int(requested_season)

    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT COALESCE(MAX(season), 0)
            FROM core.team_season_stats
            WHERE league_id = %(league_id)s
            """,
            {"league_id": int(league_id)},
        )
        row = cur.fetchone()

    season = int(row[0] or 0) if row else 0
    if season <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"ok": False, "code": "NO_SEASON_FOUND", "message": "no season found for selected league"},
        )
    return season

def _fetch_reference_context(
    conn,
    *,
    home_team_id: int,
    requested_league_id: Optional[int],
    requested_season: Optional[int],
) -> Dict[str, Any]:
    """
    Resolve a liga/temporada usada como contexto estatístico da análise manual.

    Regra v1:
    - se a UI mandar league_id, usamos essa liga como referência;
    - se não mandar, usamos a liga/temporada mais recente do mandante.

    Isso libera matchups entre times de países/ligas diferentes sem obrigar que ambos
    estejam na mesma competition/season.
    """

    if requested_league_id is not None:
        league_id = int(requested_league_id)
        season = _fetch_effective_season(
            conn,
            league_id=league_id,
            requested_season=requested_season,
        )

        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT league_id, name
                FROM core.leagues
                WHERE league_id = %(league_id)s
                LIMIT 1
                """,
                {"league_id": league_id},
            )
            row = cur.fetchone()

        if not row:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"ok": False, "code": "LEAGUE_NOT_FOUND", "message": "league not found"},
            )

        return {
            "league_id": league_id,
            "season": int(season),
            "competition_name": str(row[1]),
            "context_source": "selected_league",
        }

    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT s.league_id, s.season, l.name, s.played
            FROM core.team_season_stats s
            JOIN core.leagues l ON l.league_id = s.league_id
            WHERE s.team_id = %(home_team_id)s
            ORDER BY s.season DESC, s.played DESC, s.league_id ASC
            LIMIT 1
            """,
            {"home_team_id": int(home_team_id)},
        )
        row = cur.fetchone()

    if not row:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "ok": False,
                "code": "NO_REFERENCE_CONTEXT",
                "message": "no reference league/season found for selected home team",
            },
        )

    return {
        "league_id": int(row[0]),
        "season": int(row[1]),
        "competition_name": str(row[2]),
        "context_source": "home_team_latest_league",
    }

def _fetch_context_names(
    conn,
    *,
    competition_name: str,
    home_team_id: int,
    away_team_id: int,
) -> Dict[str, Any]:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT team_id, name
            FROM core.teams
            WHERE team_id IN (%(home_team_id)s, %(away_team_id)s)
            """,
            {
                "home_team_id": int(home_team_id),
                "away_team_id": int(away_team_id),
            },
        )
        team_rows = cur.fetchall()

    team_map = {int(team_id): str(name) for team_id, name in (team_rows or [])}
    home_name = team_map.get(int(home_team_id))
    away_name = team_map.get(int(away_team_id))

    if not home_name or not away_name:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"ok": False, "code": "TEAM_NOT_FOUND", "message": "one or more selected teams were not found"},
        )

    return {
        "competition_name": str(competition_name),
        "home_name": home_name,
        "away_name": away_name,
    }

def _teams_have_reference_league_stats(
    conn,
    *,
    league_id: int,
    season: int,
    home_team_id: int,
    away_team_id: int,
) -> bool:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT COUNT(DISTINCT team_id)
            FROM core.team_season_stats
            WHERE league_id = %(league_id)s
              AND season = %(season)s
              AND team_id IN (%(home_team_id)s, %(away_team_id)s)
            """,
            {
                "league_id": int(league_id),
                "season": int(season),
                "home_team_id": int(home_team_id),
                "away_team_id": int(away_team_id),
            },
        )
        row = cur.fetchone()

    return int(row[0] or 0) >= 2 if row else False


def _fetch_artifact_filename(
    conn,
    *,
    sport_key: str,
    league_id: int,
    explicit_artifact_filename: Optional[str],
) -> str:
    explicit = str(explicit_artifact_filename or "").strip()
    if explicit:
        return explicit

    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT artifact_filename
            FROM odds.odds_league_map
            WHERE league_id = %(league_id)s
              AND sport_key = %(sport_key)s
              AND enabled = true
              AND mapping_status = 'approved'
              AND artifact_filename IS NOT NULL
            ORDER BY updated_at_utc DESC NULLS LAST, artifact_filename DESC
            LIMIT 1
            """,
            {
                "league_id": int(league_id),
                "sport_key": str(sport_key),
            },
        )
        row = cur.fetchone()

    artifact_filename = str(row[0]).strip() if row and row[0] else ""
    if not artifact_filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"ok": False, "code": "NO_MODEL_ARTIFACT", "message": "no model artifact found for selected league"},
        )

    return artifact_filename


def _build_whatif_analysis_payload(conn, req: ManualAnalysisEvaluateRequest) -> Dict[str, Any]:
    market_key = _normalize_market_key(req.market_key)
    sport_key = str(req.sport_key or "soccer").strip() or "soccer"

    if int(req.home_team_id) == int(req.away_team_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"ok": False, "code": "SAME_TEAM", "message": "home and away teams must be different"},
        )

    reference_context = _fetch_reference_context(
        conn,
        home_team_id=int(req.home_team_id),
        requested_league_id=req.league_id,
        requested_season=req.season,
    )
    reference_league_id = int(reference_context["league_id"])
    effective_season = int(reference_context["season"])

    context_names = _fetch_context_names(
        conn,
        competition_name=str(reference_context["competition_name"]),
        home_team_id=int(req.home_team_id),
        away_team_id=int(req.away_team_id),
    )

    artifact_filename: Optional[str] = None
    try:
        artifact_filename = _fetch_artifact_filename(
            conn,
            sport_key=sport_key,
            league_id=reference_league_id,
            explicit_artifact_filename=req.artifact_filename,
        )
    except HTTPException:
        artifact_filename = None

    try:
        estimate = estimate_lambdas_with_fallback(
            conn,
            league_id=reference_league_id,
            season=int(effective_season),
            home_team_id=int(req.home_team_id),
            away_team_id=int(req.away_team_id),
        )
        lambdas = estimate.lambdas
        matrix_result = generate_score_matrix_v1(
            lam_home=float(lambdas.lam_home),
            lam_away=float(lambdas.lam_away),
            max_goals=6,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"ok": False, "code": "SCORE_ENGINE_FAILED", "message": f"{type(exc).__name__}: {exc}"},
        )

    matrix_1x2 = derive_1x2(matrix_result.matrix)
    probs_1x2 = {
        "H": float(matrix_1x2["home"]),
        "D": float(matrix_1x2["draw"]),
        "A": float(matrix_1x2["away"]),
    }

    can_use_league_artifact = bool(artifact_filename) and _teams_have_reference_league_stats(
        conn,
        league_id=reference_league_id,
        season=int(effective_season),
        home_team_id=int(req.home_team_id),
        away_team_id=int(req.away_team_id),
    )
    model_source = "score_matrix_1x2"

    if can_use_league_artifact:
        try:
            pred_1x2 = predict_1x2_from_artifact(
                artifact_filename=str(artifact_filename),
                league_id=reference_league_id,
                season=int(effective_season),
                home_team_id=int(req.home_team_id),
                away_team_id=int(req.away_team_id),
            )
            artifact_probs = pred_1x2.get("probs") or {}
            probs_1x2 = {
                "H": float(artifact_probs["H"]),
                "D": float(artifact_probs["D"]),
                "A": float(artifact_probs["A"]),
            }
            model_source = "league_artifact_1x2"
        except Exception:
            model_source = "score_matrix_1x2_artifact_fallback"

    probs_btts = derive_btts(matrix_result.matrix)
    totals_line = float(req.totals_line) if req.totals_line is not None else 2.5
    probs_totals = derive_totals(matrix_result.matrix, totals_line)

    confidence = dict((estimate.diagnostics or {}).get("confidence") or {})
    if not confidence.get("source"):
        confidence["source"] = str(estimate.source)

    event_id = f"manual:{sport_key}:{reference_league_id}:{int(effective_season)}:{int(req.home_team_id)}:{int(req.away_team_id)}"

    event_block = {
        "event_id": event_id,
        "sport_key": sport_key,
        "fixture_id": None,
        "commence_time_utc": None,
        "competition_name": context_names["competition_name"],
        "league_id": reference_league_id,
        "season": int(effective_season),
        "home_name": context_names["home_name"],
        "away_name": context_names["away_name"],
    }

    inputs = {
        "league_id": reference_league_id,
        "season": int(effective_season),
        "home_team_id": int(req.home_team_id),
        "away_team_id": int(req.away_team_id),
        "lambda_home": float(lambdas.lam_home),
        "lambda_away": float(lambdas.lam_away),
        "lambda_total": float(lambdas.lam_total),
        "lambda_source": str(estimate.source),
        "context_source": str(reference_context.get("context_source") or "selected_league"),
        "model_source_1x2": model_source,
        "artifact_filename": str(artifact_filename) if artifact_filename else None,
    }

    if market_key == "1X2":
        selections = {
            "H": _build_selection(float(probs_1x2["H"])),
            "D": _build_selection(float(probs_1x2["D"])),
            "A": _build_selection(float(probs_1x2["A"])),
        }
        provided = req.odds_1x2 or {}
        comparisons = {
            key: _compare_price(selections[key]["model_prob"], provided.get(key))
            for key in ["H", "D", "A"]
        }
        manual_odds = {key: _safe_float(provided.get(key)) for key in ["H", "D", "A"]}

        return {
            "event": event_block,
            "market": {"market_key": market_key, "line": None},
            "model": {
                "selections": selections,
                "confidence": confidence,
                "inputs": inputs,
            },
            "manual_input": {
                "bookmaker_name": (req.bookmaker_name or "").strip() or None,
                "selections": manual_odds,
            },
            "evaluation": {
                "provided_count": sum(1 for value in manual_odds.values() if value is not None),
                "comparisons": comparisons,
            },
        }

    if market_key == "TOTALS":
        selections = {
            "over": _build_selection(float(probs_totals["over"])),
            "under": _build_selection(float(probs_totals["under"])),
        }
        provided = req.odds_totals or {}
        comparisons = {
            key: _compare_price(selections[key]["model_prob"], provided.get(key))
            for key in ["over", "under"]
        }
        manual_odds = {key: _safe_float(provided.get(key)) for key in ["over", "under"]}

        return {
            "event": event_block,
            "market": {"market_key": market_key, "line": float(totals_line)},
            "model": {
                "selections": selections,
                "confidence": confidence,
                "inputs": inputs,
            },
            "manual_input": {
                "bookmaker_name": (req.bookmaker_name or "").strip() or None,
                "selections": manual_odds,
            },
            "evaluation": {
                "provided_count": sum(1 for value in manual_odds.values() if value is not None),
                "comparisons": comparisons,
            },
        }

    selections = {
        "yes": _build_selection(float(probs_btts["yes"])),
        "no": _build_selection(float(probs_btts["no"])),
    }
    provided = req.odds_btts or {}
    comparisons = {
        key: _compare_price(selections[key]["model_prob"], provided.get(key))
        for key in ["yes", "no"]
    }
    manual_odds = {key: _safe_float(provided.get(key)) for key in ["yes", "no"]}

    return {
        "event": event_block,
        "market": {"market_key": market_key, "line": None},
        "model": {
            "selections": selections,
            "confidence": confidence,
            "inputs": inputs,
        },
        "manual_input": {
            "bookmaker_name": (req.bookmaker_name or "").strip() or None,
            "selections": manual_odds,
        },
        "evaluation": {
            "provided_count": sum(1 for value in manual_odds.values() if value is not None),
            "comparisons": comparisons,
        },
    }


def _consume_credit_for_manual_analysis(cur, *, user_id: int, date_key, base_daily_limit: int, reason: str) -> Dict[str, Any]:
    cur.execute(
        """
        INSERT INTO access.user_daily_usage (
            user_id,
            date_key,
            credits_used,
            revealed_count
        )
        VALUES (
            %(user_id)s,
            %(date_key)s,
            0,
            0
        )
        ON CONFLICT (user_id, date_key) DO NOTHING
        """,
        {"user_id": user_id, "date_key": date_key},
    )

    cur.execute(
        """
        SELECT credits_used, revealed_count
        FROM access.user_daily_usage
        WHERE user_id = %(user_id)s
          AND date_key = %(date_key)s
        FOR UPDATE
        """,
        {"user_id": user_id, "date_key": date_key},
    )
    row = cur.fetchone()
    credits_used = int(row[0]) if row else 0
    revealed_count = int(row[1]) if row else 0

    using_bonus_credit = credits_used >= base_daily_limit
    bonus_balance = _fetch_bonus_credit_balance(cur, user_id=user_id, for_update=using_bonus_credit)

    if using_bonus_credit and bonus_balance <= 0:
        return {
            "ok": False,
            "usage": _build_usage_payload(
                credits_used=credits_used,
                revealed_count=revealed_count,
                base_daily_limit=base_daily_limit,
                bonus_balance=bonus_balance,
            ),
        }

    bonus_balance_after = bonus_balance
    if using_bonus_credit:
        bonus_balance_after = _consume_one_bonus_credit(cur, user_id=user_id, reason=reason)

    cur.execute(
        """
        UPDATE access.user_daily_usage
        SET credits_used = credits_used + 1,
            updated_at_utc = NOW()
        WHERE user_id = %(user_id)s
          AND date_key = %(date_key)s
        RETURNING credits_used, revealed_count
        """,
        {"user_id": user_id, "date_key": date_key},
    )
    updated = cur.fetchone()
    updated_used = int(updated[0]) if updated else credits_used + 1
    updated_revealed = int(updated[1]) if updated else revealed_count

    return {
        "ok": True,
        "usage": _build_usage_payload(
            credits_used=updated_used,
            revealed_count=updated_revealed,
            base_daily_limit=base_daily_limit,
            bonus_balance=bonus_balance_after,
        ),
    }


@router.post("/evaluate")
def product_manual_analysis_evaluate(request: Request, payload: ManualAnalysisEvaluateRequest = Body(...)):
    actor = _resolve_current_actor(request)
    plan_code = _ensure_manual_analysis_access(actor)
    entitlements = actor.get("entitlements") or {}
    user_id = int(actor["user"]["user_id"])
    date_key = _today_date_key()
    base_daily_limit = int(((entitlements.get("credits") or {}).get("daily_limit") or 0))

    with pg_conn() as conn:
        analysis_payload = _build_whatif_analysis_payload(conn, payload)

        with conn.cursor() as cur:
            credit_result = _consume_credit_for_manual_analysis(
                cur,
                user_id=user_id,
                date_key=date_key,
                base_daily_limit=base_daily_limit,
                reason=(
                    f"manual_analysis:"
                    f"{analysis_payload['event']['league_id']}:"
                    f"{analysis_payload['event']['season']}:"
                    f"{analysis_payload['event']['home_name']}:"
                    f"{analysis_payload['event']['away_name']}:"
                    f"{analysis_payload['market']['market_key']}"
                ),
            )
            if not credit_result.get("ok"):
                return {
                    "ok": False,
                    "code": "NO_CREDITS",
                    "message": "daily credit limit reached",
                    "usage": credit_result.get("usage"),
                }

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
                    'manual',
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
                    "input_payload": json.dumps(payload.model_dump()),
                    "result_payload": json.dumps(analysis_payload),
                },
            )
            saved = cur.fetchone()
            conn.commit()

    return {
        "ok": True,
        "analysis_id": int(saved[0]),
        "saved_at_utc": saved[1].isoformat().replace("+00:00", "Z") if saved and saved[1] else None,
        "consumed_credit": True,
        "usage": credit_result.get("usage"),
        **analysis_payload,
    }


@router.get("/history")
def product_manual_analysis_history(request: Request, limit: int = Query(20, ge=1, le=100)):
    actor = _resolve_current_actor(request)
    _ensure_manual_analysis_access(actor)
    user_id = int(actor["user"]["user_id"])

    items: List[Dict[str, Any]] = []

    with pg_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT analysis_id, created_at_utc, result_payload
                FROM access.user_manual_analyses
                WHERE user_id = %(user_id)s
                ORDER BY created_at_utc DESC, analysis_id DESC
                LIMIT %(limit)s
                """,
                {"user_id": user_id, "limit": int(limit)},
            )
            rows = cur.fetchall()

    for analysis_id, created_at_utc, result_payload in rows:
        payload = result_payload
        if isinstance(payload, str):
            try:
                payload = json.loads(payload)
            except Exception:
                payload = {}
        if not isinstance(payload, dict):
            payload = {}

        items.append(
            {
                "analysis_id": int(analysis_id),
                "created_at_utc": created_at_utc.isoformat().replace("+00:00", "Z") if created_at_utc else None,
                **payload,
            }
        )

    return {"ok": True, "items": items, "count": len(items)}