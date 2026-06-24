from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from src.product.historical_context_v1 import build_match_historical_context
from src.product.hist5_candidate_policy_v1 import (
    estimate_hist5_candidate_from_context,
    get_hist5_candidate_policy,
)
from src.product.matchup_model_v0 import estimate_lambdas_with_fallback
from src.product.matchup_snapshot_builder_v1 import (
    _attach_narrative_context_to_payload,
    _build_empty_snapshot_payload,
    _build_inputs_dict,
    _build_snapshot_confidence,
    _load_fixture_context,
    _load_snapshot_season_policy_context,
    _record_narrative_context_counter,
    _resolve_league_and_season_from_sport_key,
    _select_candidates,
    _select_candidates_by_event_ids,
    _select_1x2_best_odds,
    _select_totals_main_line_and_best,
    upsert_matchup_snapshot_v1,
)
from src.product.score_engine_v1 import (
    derive_1x2,
    derive_btts,
    derive_totals,
    generate_score_matrix_v1,
)


HIST5_SHADOW_MODEL_VERSION = "model_v1_hist5_decay_shadow"


def _r(value: Any, digits: int = 6) -> float:
    return round(float(value), int(digits))


def _confidence_level(score: float) -> str:
    s = float(score)
    if s >= 0.75:
        return "high"
    if s >= 0.50:
        return "medium"
    return "low"


def _build_hist5_shadow_confidence(
    *,
    candidate: Dict[str, Any],
    fixture_resolved: bool,
    team_ids_resolved: bool,
    totals_available: bool,
) -> Dict[str, Any]:
    quality = str(candidate.get("quality") or "UNKNOWN")
    guardrails = [str(g) for g in list(candidate.get("guardrails") or [])]

    base_by_quality = {
        "STRONG": 0.70,
        "OK": 0.62,
        "THIN": 0.46,
        "CUP_LIKE": 0.30,
        "INSUFFICIENT": 0.34,
        "UNKNOWN": 0.20,
    }

    score = float(base_by_quality.get(quality, 0.20))

    if fixture_resolved:
        score += 0.05
    if team_ids_resolved:
        score += 0.05
    if totals_available:
        score += 0.02

    if "thin_or_insufficient_history" in guardrails:
        score -= 0.05

    if "cup_like_league_history" in guardrails:
        score -= 0.10

    score = max(0.0, min(score, 0.99))

    recommendation_allowed = quality in {"STRONG", "OK"} and not guardrails

    reasons = []
    if guardrails:
        reasons.extend(guardrails)
    if quality in {"THIN", "CUP_LIKE", "INSUFFICIENT", "UNKNOWN"}:
        reasons.append(f"history_quality_{quality.lower()}")

    return {
        "overall": _r(score, 4),
        "level": _confidence_level(score),
        "source": "hist5_candidate_v1_shadow",
        "recommendation_allowed": bool(recommendation_allowed),
        "factors": {
            "fixture_resolved": bool(fixture_resolved),
            "team_ids_resolved": bool(team_ids_resolved),
            "totals_available": bool(totals_available),
            "lambda_source": "hist5_candidate_v1",
            "history_quality": quality,
            "candidate_action": candidate.get("action"),
            "factor_cap": candidate.get("factor_cap"),
            "blend": candidate.get("blend"),
        },
        "coverage": {
            "history_quality": quality,
            "guardrails": guardrails,
            "fallback_reasons": candidate.get("fallback_reasons") or [],
        },
        "reasons": sorted(set(str(r) for r in reasons if r)),
    }


def _minimal_context_summary(context: Dict[str, Any]) -> Dict[str, Any]:
    if not isinstance(context, dict):
        return {}

    home = context.get("home") or {}
    away = context.get("away") or {}
    league_prior = context.get("league_prior") or {}

    return {
        "status": context.get("status"),
        "target_season": context.get("target_season"),
        "window_seasons": context.get("window_seasons"),
        "match_history_quality": context.get("match_history_quality"),
        "guardrails": context.get("guardrails") or [],
        "league_prior": {
            "quality": league_prior.get("quality"),
            "weighted_played": league_prior.get("weighted_played"),
            "weighted_avg_team_played": league_prior.get("weighted_avg_team_played"),
            "mu_home": league_prior.get("mu_home"),
            "mu_away": league_prior.get("mu_away"),
        },
        "home": {
            "same_league_quality": ((home.get("same_league") or {}).get("quality")),
            "global_quality": ((home.get("global") or {}).get("quality")),
            "effective_quality": ((home.get("effective") or {}).get("quality")),
        },
        "away": {
            "same_league_quality": ((away.get("same_league") or {}).get("quality")),
            "global_quality": ((away.get("global") or {}).get("quality")),
            "effective_quality": ((away.get("effective") or {}).get("quality")),
        },
    }


def _build_payload_from_lambdas(
    *,
    model_version: str,
    calc_version: str,
    totals: Dict[str, Any],
    one_x_two: Optional[Dict[str, Any]],
    league_id: Optional[int],
    season: Optional[int],
    fixture_id: Optional[int],
    home_team_id: Optional[int],
    away_team_id: Optional[int],
    lambda_home: float,
    lambda_away: float,
    lambda_source: str,
    lambda_meta: Dict[str, Any],
    confidence: Dict[str, Any],
) -> Dict[str, Any]:    
    one_x_two = one_x_two or {}
    mx = generate_score_matrix_v1(float(lambda_home), float(lambda_away), max_goals=6)
    p_1x2 = derive_1x2(mx.matrix)
    p_btts = derive_btts(mx.matrix)

    p_ov25 = derive_totals(mx.matrix, 2.5)
    p_main = (
        derive_totals(mx.matrix, float(totals["main_line"]))
        if totals.get("main_line") is not None
        else None
    )

    return {
        "model_version": model_version,
        "calc_version": calc_version,
        "engine": {
            "type": "poisson_independent",
            "max_goals": 6,
            "shadow": True,
            "shadow_policy": "hist5_candidate_v1",
        },
        "inputs": _build_inputs_dict(
            league_id=league_id,
            season=season,
            fixture_id=fixture_id,
            home_team_id=home_team_id,
            away_team_id=away_team_id,
            lam_home=float(lambda_home),
            lam_away=float(lambda_away),
            lambda_source=lambda_source,
            lambda_meta=lambda_meta,
        ),
        "confidence": confidence,
        "matrix": mx.matrix,
        "markets": {
            "1x2": {
                "p_model": p_1x2,
                "best_odds": dict((one_x_two or {}).get("best_odds") or {}),
                "source_captured_at_utc": (
                    one_x_two.get("source_captured_at_utc").isoformat().replace("+00:00", "Z")
                    if hasattr(one_x_two.get("source_captured_at_utc"), "isoformat")
                    else one_x_two.get("source_captured_at_utc")
                ),
                "odds_status": one_x_two.get("status"),
            },
            "btts": {"p_model": p_btts},
            "totals": {
                "main_line": totals.get("main_line"),
                "best_odds": {
                    "over": totals.get("best_over"),
                    "under": totals.get("best_under"),
                },
                "p_model": (
                    {"over": p_main["over"], "under": p_main["under"]}
                    if p_main is not None
                    else {"over": None, "under": None}
                ),
                "lines": {
                    "2.5": {
                        "over": p_ov25["over"],
                        "under": p_ov25["under"],
                        "push": p_ov25["push"],
                    }
                },
            },
        },
    }


def _build_hist5_or_v0_shadow_payload(
    conn,
    *,
    model_version: str,
    calc_version: str,
    totals: Dict[str, Any],
    one_x_two: Optional[Dict[str, Any]],
    league_id: int,
    season: int,
    fixture_id: Optional[int],
    home_team_id: int,
    away_team_id: int,
    fixture_resolved: bool,
    team_ids_resolved: bool,
    season_policy_ctx: Dict[str, Any],
    as_of_mode: str,
) -> Dict[str, Any]:
    requested_history_season = int(season) - 1 if str(as_of_mode) == "previous_seasons" else int(season)

    try:
        context = build_match_historical_context(
            conn,
            league_id=int(league_id),
            season=int(requested_history_season),
            home_team_id=int(home_team_id),
            away_team_id=int(away_team_id),
            profile_key="model_v1_hist5_decay",
        )
        policy = get_hist5_candidate_policy("hist5_candidate_v1")
        candidate = estimate_hist5_candidate_from_context(context, policy=policy)
    except Exception as exc:
        context = {
            "status": "error",
            "error": str(exc),
            "match_history_quality": "UNKNOWN",
            "guardrails": ["historical_context_error"],
        }
        candidate = {
            "status": "ok",
            "action": "fallback_to_v0",
            "quality": "UNKNOWN",
            "guardrails": ["historical_context_error"],
            "fallback_reasons": ["historical_context_error"],
        }

    if str(candidate.get("action")) == "use_hist5":
        lambda_home = float(candidate["lambda_home"])
        lambda_away = float(candidate["lambda_away"])

        confidence = _build_hist5_shadow_confidence(
            candidate=candidate,
            fixture_resolved=bool(fixture_resolved),
            team_ids_resolved=bool(team_ids_resolved),
            totals_available=bool(totals.get("main_line") is not None),
        )

        lambda_meta = {
            "shadow": True,
            "candidate_policy": "hist5_candidate_v1",
            "as_of_mode": str(as_of_mode),
            "requested_history_season": int(requested_history_season),
            "candidate": candidate,
            "historical_context_summary": _minimal_context_summary(context),
        }

        return _build_payload_from_lambdas(
            model_version=model_version,
            calc_version=calc_version,
            totals=totals,
            one_x_two=one_x_two,
            league_id=int(league_id),
            season=int(season),
            fixture_id=fixture_id,
            home_team_id=int(home_team_id),
            away_team_id=int(away_team_id),
            lambda_home=lambda_home,
            lambda_away=lambda_away,
            lambda_source="hist5_candidate_v1",
            lambda_meta=lambda_meta,
            confidence=confidence,
        )

    # Fallback para v0 quando a política manda, especialmente CUP_LIKE.
    estimate = estimate_lambdas_with_fallback(
        conn,
        league_id=int(league_id),
        season=int(season),
        home_team_id=int(home_team_id),
        away_team_id=int(away_team_id),
        n_games=10,
    )
    lambdas = estimate.lambdas

    confidence = _build_snapshot_confidence(
        estimate=estimate,
        fixture_resolved=bool(fixture_resolved),
        team_ids_resolved=bool(team_ids_resolved),
        totals_available=bool(totals.get("main_line") is not None),
        effective_season=int(season),
        season_policy=season_policy_ctx.get("season_policy"),
        fixed_season=season_policy_ctx.get("fixed_season"),
        candidate_seasons=season_policy_ctx.get("candidate_seasons"),
    )
    confidence = dict(confidence or {})
    reasons = list(confidence.get("reasons") or [])
    reasons.append("hist5_candidate_fallback_to_v0")
    reasons.extend(candidate.get("fallback_reasons") or [])
    confidence["reasons"] = sorted(set(str(r) for r in reasons if r))

    lambda_meta = {
        "shadow": True,
        "candidate_policy": "hist5_candidate_v1",
        "as_of_mode": str(as_of_mode),
        "requested_history_season": int(requested_history_season),
        "fallback_to_v0": True,
        "fallback_reasons": candidate.get("fallback_reasons") or [],
        "v0_source": estimate.source,
        "v0_diagnostics": estimate.diagnostics,
        "historical_context_summary": _minimal_context_summary(context),
    }

    return _build_payload_from_lambdas(
        model_version=model_version,
        calc_version=calc_version,
        totals=totals,
        one_x_two=one_x_two,
        league_id=int(league_id),
        season=int(season),
        fixture_id=fixture_id,
        home_team_id=int(home_team_id),
        away_team_id=int(away_team_id),
        lambda_home=float(lambdas.lam_home),
        lambda_away=float(lambdas.lam_away),
        lambda_source=f"v0_fallback:{estimate.source}",
        lambda_meta=lambda_meta,
        confidence=confidence,
    )


def rebuild_hist5_shadow_snapshots_v1(
    conn,
    *,
    sport_key: str,
    event_ids: Optional[List[str]] = None,
    hours_ahead: int = 720,
    limit: int = 200,
    calc_version: str = "",
    model_version: str = HIST5_SHADOW_MODEL_VERSION,
    as_of_mode: str = "previous_seasons",
    apply: bool = False,
) -> Dict[str, Any]:
    """
    Materializa snapshots shadow do hist5_candidate_v1.

    Segurança:
    - Não altera PREVIA_MODEL_VERSION.
    - Escreve em product.matchup_snapshot_v1 com model_version separado.
    - Só grava quando apply=True.
    """

    if str(as_of_mode) not in {"previous_seasons", "current_available"}:
        raise ValueError("as_of_mode must be 'previous_seasons' or 'current_available'")

    counters: Dict[str, Any] = {
        "sport_key": str(sport_key),
        "shadow_model_version": str(model_version),
        "as_of_mode": str(as_of_mode),
        "apply": bool(apply),
        "candidates": 0,
        "snapshots_shadow_upserted": 0,
        "snapshots_shadow_dry_run": 0,
        "snapshots_event_fallback": 0,
        "snapshots_team_fallback": 0,
        "skipped_no_fixture": 0,
        "skipped_no_team_ids": 0,
        "skipped_no_league_map": 0,
        "shadow_action_use_hist5": 0,
        "shadow_action_fallback_to_v0": 0,
        "narrative_status_available": 0,
        "narrative_status_limited": 0,
        "narrative_status_unavailable": 0,
        "narrative_status_unknown": 0,
        "narrative_quality_good": 0,
        "narrative_quality_limited": 0,
        "narrative_quality_unavailable": 0,
        "narrative_quality_unknown": 0,
        "errors": 0,
        "errors_sample": [],
    }

    if not calc_version:
        calc_version = "calc_v1"

    if event_ids is not None:
        candidates = _select_candidates_by_event_ids(
            conn,
            sport_key=str(sport_key),
            event_ids=[str(x) for x in event_ids],
        )
    else:
        candidates = _select_candidates(
            conn,
            sport_key=str(sport_key),
            hours_ahead=int(hours_ahead),
            limit=int(limit),
        )

    counters["candidates"] = len(candidates)

    for ev in candidates:
        event_id = str(ev["event_id"])
        fixture_id = ev.get("fixture_id")
        totals = _select_totals_main_line_and_best(conn, event_id=event_id)
        one_x_two = _select_1x2_best_odds(conn, event_id=event_id)

        try:
            if fixture_id is None:
                home_team_id = ev.get("home_team_id")
                away_team_id = ev.get("away_team_id")

                if home_team_id is None or away_team_id is None:
                    counters["skipped_no_team_ids"] += 1
                    payload = _build_empty_snapshot_payload(
                        model_version=str(model_version),
                        calc_version=str(calc_version),
                        totals=totals,
                        league_id=None,
                        season=None,
                        fixture_id=None,
                        home_team_id=None,
                        away_team_id=None,
                        one_x_two=one_x_two,
                    )
                    counters["snapshots_event_fallback"] += 1
                    upsert_fixture_id = None
                    kickoff_utc = ev["kickoff_utc"]

                else:
                    ctx = _resolve_league_and_season_from_sport_key(
                        conn,
                        sport_key=str(ev["sport_key"]),
                    )

                    if not ctx:
                        counters["skipped_no_league_map"] += 1
                        payload = _build_empty_snapshot_payload(
                            model_version=str(model_version),
                            calc_version=str(calc_version),
                            totals=totals,
                            league_id=None,
                            season=None,
                            fixture_id=None,
                            home_team_id=int(home_team_id),
                            away_team_id=int(away_team_id),
                            one_x_two=one_x_two,
                        )
                        counters["snapshots_event_fallback"] += 1
                        upsert_fixture_id = None
                        kickoff_utc = ev["kickoff_utc"]

                    else:
                        league_id = int(ctx["league_id"])
                        season = int(ctx["season"])
                        season_policy_ctx = _load_snapshot_season_policy_context(
                            conn,
                            sport_key=str(ev["sport_key"]),
                            league_id=league_id,
                        )

                        payload = _build_hist5_or_v0_shadow_payload(
                            conn,
                            model_version=str(model_version),
                            calc_version=str(calc_version),
                            totals=totals,
                            one_x_two=one_x_two,
                            league_id=league_id,
                            season=season,
                            fixture_id=None,
                            home_team_id=int(home_team_id),
                            away_team_id=int(away_team_id),
                            fixture_resolved=False,
                            team_ids_resolved=True,
                            season_policy_ctx=season_policy_ctx,
                            as_of_mode=str(as_of_mode),
                        )
                        counters["snapshots_team_fallback"] += 1
                        upsert_fixture_id = None
                        kickoff_utc = ev["kickoff_utc"]

            else:
                fx = _load_fixture_context(conn, fixture_id=int(fixture_id))
                if not fx:
                    counters["skipped_no_fixture"] += 1
                    continue

                season_policy_ctx = _load_snapshot_season_policy_context(
                    conn,
                    sport_key=str(ev["sport_key"]),
                    league_id=int(fx["league_id"]),
                )

                payload = _build_hist5_or_v0_shadow_payload(
                    conn,
                    model_version=str(model_version),
                    calc_version=str(calc_version),
                    totals=totals,
                    one_x_two=one_x_two,
                    league_id=int(fx["league_id"]),
                    season=int(fx["season"]),
                    fixture_id=int(fx["fixture_id"]),
                    home_team_id=int(fx["home_team_id"]),
                    away_team_id=int(fx["away_team_id"]),
                    fixture_resolved=True,
                    team_ids_resolved=True,
                    season_policy_ctx=season_policy_ctx,
                    as_of_mode=str(as_of_mode),
                )
                upsert_fixture_id = int(fx["fixture_id"])
                kickoff_utc = fx["kickoff_utc"]

            inputs = payload.get("inputs") or {}
            lambda_source = str(inputs.get("lambda_source") or "")
            if lambda_source == "hist5_candidate_v1":
                counters["shadow_action_use_hist5"] += 1
            elif lambda_source.startswith("v0_fallback:"):
                counters["shadow_action_fallback_to_v0"] += 1

            payload = _attach_narrative_context_to_payload(
                conn,
                payload=payload,
                sport_key=str(ev["sport_key"]),
                home_name=ev.get("home_name"),
                away_name=ev.get("away_name"),
                kickoff_utc=kickoff_utc,
            )
            _record_narrative_context_counter(counters, payload)

            if apply:
                upsert_matchup_snapshot_v1(
                    conn,
                    event_id=event_id,
                    sport_key=str(ev["sport_key"]),
                    kickoff_utc=kickoff_utc,
                    home_name=str(ev["home_name"]),
                    away_name=str(ev["away_name"]),
                    fixture_id=upsert_fixture_id,
                    source_captured_at_utc=totals.get("source_captured_at_utc"),
                    payload=payload,
                    model_version=str(model_version),
                )
                counters["snapshots_shadow_upserted"] += 1
            else:
                counters["snapshots_shadow_dry_run"] += 1

        except Exception as exc:
            counters["errors"] += 1
            if len(counters["errors_sample"]) < 20:
                counters["errors_sample"].append(
                    {
                        "event_id": event_id,
                        "fixture_id": fixture_id,
                        "error": str(exc),
                    }
                )

    counters["generated_at_utc"] = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    return counters