from __future__ import annotations

import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from src.product.matchup_model_v0 import estimate_lambdas_with_fallback

from src.core.season_policy import (
    choose_current_operational_season,
    current_year_utc,
    fixed_season_should_reduce_confidence,
    resolve_candidate_seasons,
)

from src.product.model_registry import get_calc_version
from src.product.score_engine_v1 import (
    generate_score_matrix_v1,
    derive_1x2,
    derive_btts,
    derive_totals,
)

def _select_candidates(conn, *, sport_key: str, hours_ahead: int, limit: int) -> List[Dict[str, Any]]:
    """
    Pega próximos odds_events (com fixture resolvida quando possível).
    """
    now = datetime.now(timezone.utc)
    end = now + timedelta(hours=int(hours_ahead))

    sql = """
      SELECT
        e.event_id,
        e.sport_key,
        e.commence_time_utc AS kickoff_utc,
        e.home_name,
        e.away_name,
        e.resolved_fixture_id AS fixture_id,
        e.resolved_home_team_id AS home_team_id,
        e.resolved_away_team_id AS away_team_id
      FROM odds.odds_events e
      WHERE e.sport_key = %(sport_key)s
        AND e.commence_time_utc >= %(now)s
        AND e.commence_time_utc < %(end)s
      ORDER BY e.commence_time_utc ASC
      LIMIT %(limit)s
    """
    with conn.cursor() as cur:
        cur.execute(
            sql,
            {
                "sport_key": str(sport_key),
                "now": now,
                "end": end,
                "limit": int(limit),
            },
        )
        rows = cur.fetchall()

    out: List[Dict[str, Any]] = []
    for r in rows:
        out.append(
            {
                "event_id": r[0],
                "sport_key": r[1],
                "kickoff_utc": r[2],
                "home_name": r[3],
                "away_name": r[4],
                "fixture_id": r[5],
                "home_team_id": r[6],
                "away_team_id": r[7],
            }
        )
    return out


def _select_candidates_by_event_ids(conn, *, sport_key: str, event_ids: List[str]) -> List[Dict[str, Any]]:
    """
    Incremental: seleciona candidates por lista de event_ids.
    Cast explícito para text[] evita problemas no ANY().
    """
    if not event_ids:
        return []

    sql = """
      SELECT
        e.event_id,
        e.sport_key,
        e.commence_time_utc AS kickoff_utc,
        e.home_name,
        e.away_name,
        e.resolved_fixture_id AS fixture_id,
        e.resolved_home_team_id AS home_team_id,
        e.resolved_away_team_id AS away_team_id
      FROM odds.odds_events e
      WHERE e.sport_key = %(sport_key)s
        AND e.event_id = ANY(%(event_ids)s::text[])
    """
    with conn.cursor() as cur:
        cur.execute(sql, {"sport_key": str(sport_key), "event_ids": [str(x) for x in event_ids]})
        rows = cur.fetchall()

    out: List[Dict[str, Any]] = []
    for r in rows:
        out.append(
            {
                "event_id": r[0],
                "sport_key": r[1],
                "kickoff_utc": r[2],
                "home_name": r[3],
                "away_name": r[4],
                "fixture_id": r[5],
                "home_team_id": r[6],
                "away_team_id": r[7],
            }
        )
    return out


def _load_fixture_context(conn, *, fixture_id: int) -> Optional[Dict[str, Any]]:
    sql = """
      SELECT fixture_id, league_id, season, home_team_id, away_team_id, kickoff_utc
      FROM core.fixtures
      WHERE fixture_id = %(fixture_id)s
      LIMIT 1
    """
    with conn.cursor() as cur:
        cur.execute(sql, {"fixture_id": int(fixture_id)})
        r = cur.fetchone()

    if not r:
        return None

    return {
        "fixture_id": int(r[0]),
        "league_id": int(r[1]),
        "season": int(r[2]),
        "home_team_id": int(r[3]),
        "away_team_id": int(r[4]),
        "kickoff_utc": r[5],
    }

def _resolve_market_snapshots_table(conn) -> Optional[str]:
    """
    Detecta o nome real da tabela de market snapshots no schema odds.
    Retorna um identificador SQL (schema.table) ou None se não existir.
    """
    candidates = [
        "odds.odds_snapshots_market",  # tabela usada pelo projeto atual
        "odds.market_snapshots",
        "odds.market_snapshot",
        "odds.market_snapshots_v1",
        "odds.market_snapshot_v1",
    ]

    sql = "SELECT to_regclass(%(name)s)"
    with conn.cursor() as cur:
        for name in candidates:
            cur.execute(sql, {"name": name})
            r = cur.fetchone()
            if r and r[0]:
                return name

    return None

def _select_totals_main_line_and_best(conn, *, event_id: str) -> Dict[str, Any]:
    """
    Lê totals diretamente de odds.odds_snapshots_market.
    Não depende de odds.snapshots.
    """
    sql = """
      SELECT
        captured_at_utc,
        market_key,
        point AS line,
        selection_key,
        price
      FROM odds.odds_snapshots_market
      WHERE event_id = %(event_id)s
        AND market_key IN ('totals', 'totals_points')
      ORDER BY captured_at_utc DESC
      LIMIT 500
    """
    with conn.cursor() as cur:
        cur.execute(sql, {"event_id": str(event_id)})
        rows = cur.fetchall()

    if not rows:
        return {
            "main_line": None,
            "best_over": None,
            "best_under": None,
            "source_captured_at_utc": None,
        }

    source_ts = rows[0][0]

    by_line: Dict[float, Dict[str, Any]] = {}
    for r in rows:
        captured_at = r[0]
        line = r[2]
        selection_key = r[3]
        price = r[4]

        if captured_at != source_ts:
            continue

        if line is None or selection_key is None:
            continue

        try:
            fline = float(line)
        except Exception:
            continue

        sel = str(selection_key).strip().lower()
        if sel in ("over", "o"):
            outcome = "over"
        elif sel in ("under", "u"):
            outcome = "under"
        else:
            continue

        if fline not in by_line:
            by_line[fline] = {"over": None, "under": None}

        prev = by_line[fline][outcome]
        if prev is None or (price is not None and float(price) > float(prev)):
            by_line[fline][outcome] = price

    if not by_line:
        return {
            "main_line": None,
            "best_over": None,
            "best_under": None,
            "source_captured_at_utc": source_ts,
        }

    target = 2.5
    lines_sorted = sorted(by_line.keys(), key=lambda x: abs(x - target))
    main_line = lines_sorted[0]

    return {
        "main_line": main_line,
        "best_over": by_line[main_line]["over"],
        "best_under": by_line[main_line]["under"],
        "source_captured_at_utc": source_ts,
    }

def _resolve_matchup_payload_column(conn) -> str:
    """
    Detecta o nome da coluna JSONB onde o payload do snapshot é armazenado.
    Suporta versões de schema:
      - product.matchup_snapshot_v1.payload (jsonb)
      - product.matchup_snapshot_v1.payload_json (jsonb)
    Retorna o nome da coluna (sem schema).
    """
    sql = """
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'product'
        AND table_name = 'matchup_snapshot_v1'
        AND column_name = %(col)s
      LIMIT 1
    """
    with conn.cursor() as cur:
        # preferimos 'payload' (se existir) por ser o mais comum no seu DB
        for col in ("payload", "payload_json"):
            cur.execute(sql, {"col": col})
            r = cur.fetchone()
            if r:
                return col

    # fallback conservador (pra não quebrar em prod): tenta 'payload'
    return "payload"

def _json_dumps_safe(payload: Dict[str, Any]) -> str:
    import json
    from decimal import Decimal

    def _json_default(obj):
        if isinstance(obj, Decimal):
            return float(obj)
        raise TypeError(f"Object of type {type(obj).__name__} is not JSON serializable")

    return json.dumps(payload, default=_json_default)

def upsert_matchup_snapshot_v1(
    conn,
    *,
    event_id: str,
    sport_key: str,
    kickoff_utc,
    home_name: str,
    away_name: str,
    fixture_id: Optional[int],
    source_captured_at_utc,
    payload: Dict[str, Any],
    model_version: str = "model_v0",
) -> None:
    """
    UPSERT idempotente.

    - conflito primário: (event_id, model_version) via ux_matchup_snapshot_event_model
    - se fixture_id existir: remove linha de (fixture_id, model_version) para outro event_id
      (evita violação de ux_matchup_snapshot_fixture_model em remapeamento)
    """
    payload_text = _json_dumps_safe(payload)

    sql_cleanup = """
      DELETE FROM product.matchup_snapshot_v1
      WHERE fixture_id = %(fixture_id)s
        AND model_version = %(model_version)s
        AND event_id <> %(event_id)s
    """
    if fixture_id is not None:
        with conn.cursor() as cur:
            cur.execute(
                sql_cleanup,
                {"fixture_id": int(fixture_id), "model_version": str(model_version), "event_id": str(event_id)},
            )

    sql = """
      INSERT INTO product.matchup_snapshot_v1 (
        event_id,
        sport_key,
        fixture_id,
        kickoff_utc,
        home_name,
        away_name,
        source_captured_at_utc,
        payload,
        model_version,
        generated_at_utc
      )
      VALUES (
        %(event_id)s,
        %(sport_key)s,
        %(fixture_id)s,
        %(kickoff_utc)s,
        %(home_name)s,
        %(away_name)s,
        %(source_captured_at_utc)s,
        %(payload)s::jsonb,
        %(model_version)s,
        NOW()
      )
      ON CONFLICT (event_id, model_version)
      DO UPDATE SET
        sport_key = EXCLUDED.sport_key,
        fixture_id = EXCLUDED.fixture_id,
        kickoff_utc = EXCLUDED.kickoff_utc,
        home_name = EXCLUDED.home_name,
        away_name = EXCLUDED.away_name,
        source_captured_at_utc = EXCLUDED.source_captured_at_utc,
        payload = EXCLUDED.payload,
        updated_at_utc = NOW()
    """
    with conn.cursor() as cur:
        cur.execute(
            sql,
            {
                "event_id": str(event_id),
                "sport_key": str(sport_key),
                "fixture_id": int(fixture_id) if fixture_id is not None else None,
                "kickoff_utc": kickoff_utc,
                "home_name": str(home_name),
                "away_name": str(away_name),
                "source_captured_at_utc": source_captured_at_utc,
                "payload": payload_text,
                "model_version": str(model_version),
            },
        )

def _resolve_league_and_season_from_sport_key(conn, *, sport_key: str) -> Optional[Dict[str, Any]]:
    """
    Resolve (league_id, season) a partir de odds.odds_league_map (approved+enabled).

    Política:
      - fixed   -> fixed_season
      - current -> usa somente a janela operacional [ano atual, ano atual - 1]
                   escolhendo a melhor disponível no core
    """
    sql_map = """
      SELECT league_id, season_policy, fixed_season
      FROM odds.odds_league_map
      WHERE sport_key = %(sport_key)s
        AND enabled = true
        AND mapping_status = 'approved'
      LIMIT 1
    """
    with conn.cursor() as cur:
        cur.execute(sql_map, {"sport_key": str(sport_key)})
        r = cur.fetchone()

    if not r:
        return None

    league_id = int(r[0])
    season_policy = str(r[1]) if r[1] is not None else "current"
    fixed_season = int(r[2]) if r[2] is not None else None

    if season_policy == "fixed" and fixed_season is not None:
        return {
            "league_id": league_id,
            "season": int(fixed_season),
            "season_resolution": "fixed",
        }

    available_seasons = _list_available_seasons_for_league(conn, league_id=league_id)
    picked = choose_current_operational_season(available_seasons)

    if picked is None:
        return None

    return {
        "league_id": league_id,
        "season": int(picked),
        "season_resolution": "current_window",
        "available_seasons": available_seasons,
    }


def _list_available_seasons_for_league(conn, *, league_id: int) -> List[int]:
    """
    Seasons conhecidas para a liga, agregando:
      1) core.fixtures
      2) core.team_season_stats
    Retorna lista desc sem duplicidade.
    """
    seasons = set()

    sql_fx = """
      SELECT DISTINCT season
      FROM core.fixtures
      WHERE league_id = %(league_id)s
        AND season IS NOT NULL
    """
    with conn.cursor() as cur:
        cur.execute(sql_fx, {"league_id": int(league_id)})
        for r in cur.fetchall() or []:
            if r and r[0] is not None:
                seasons.add(int(r[0]))

    sql_stats = """
      SELECT DISTINCT season
      FROM core.team_season_stats
      WHERE league_id = %(league_id)s
        AND season IS NOT NULL
    """
    with conn.cursor() as cur:
        cur.execute(sql_stats, {"league_id": int(league_id)})
        for r in cur.fetchall() or []:
            if r and r[0] is not None:
                seasons.add(int(r[0]))

    return sorted(seasons, reverse=True)

def _load_snapshot_season_policy_context(
    conn,
    *,
    sport_key: Optional[str],
    league_id: Optional[int],
) -> Dict[str, Any]:
    if not sport_key and league_id is None:
        return {
            "season_policy": "unknown",
            "fixed_season": None,
            "candidate_seasons": [],
        }

    sql = """
      SELECT season_policy, fixed_season
      FROM odds.odds_league_map
      WHERE enabled = true
        AND mapping_status = 'approved'
        AND (
          (%(sport_key)s::text IS NOT NULL AND sport_key = %(sport_key)s::text)
          OR (%(league_id)s::int IS NOT NULL AND league_id = %(league_id)s::int)
        )
      ORDER BY
        CASE WHEN %(sport_key)s::text IS NOT NULL AND sport_key = %(sport_key)s::text THEN 0 ELSE 1 END
      LIMIT 1
    """

    with conn.cursor() as cur:
        cur.execute(
            sql,
            {
                "sport_key": str(sport_key) if sport_key else None,
                "league_id": int(league_id) if league_id is not None else None,
            },
        )
        row = cur.fetchone()

    if not row:
        return {
            "season_policy": "unknown",
            "fixed_season": None,
            "candidate_seasons": [],
        }

    season_policy = str(row[0] or "current")
    fixed_season = int(row[1]) if row[1] is not None else None

    try:
        candidate_seasons = resolve_candidate_seasons(
            season_policy=season_policy,
            fixed_season=fixed_season,
        )
    except Exception:
        candidate_seasons = []

    return {
        "season_policy": season_policy,
        "fixed_season": fixed_season,
        "candidate_seasons": candidate_seasons,
    }

def _apply_season_confidence_overlay(
    confidence: Dict[str, Any],
    *,
    effective_season: Optional[int],
    season_policy: Optional[str],
    fixed_season: Optional[int],
    candidate_seasons: Optional[List[int]] = None,
) -> Dict[str, Any]:
    out = dict(confidence or {})
    factors = dict(out.get("factors") or {})
    reasons = list(out.get("reasons") or [])

    policy = str(season_policy or "unknown")
    year = current_year_utc()

    gap = None
    status = "unknown"

    if effective_season is not None:
        gap = int(year - int(effective_season))

        if gap == 0:
            status = "current_year"
            reasons.append("effective_season_current_year")
        elif gap == 1:
            status = "previous_year"
            reasons.append("effective_season_previous_year")
        elif gap >= 2:
            status = "stale_year"
            reasons.append("effective_season_stale_year")
        else:
            status = "future_year"
            reasons.append("effective_season_future_year")

    if policy == "fixed":
        factors["fixed_season"] = int(fixed_season) if fixed_season is not None else None

        if fixed_season_should_reduce_confidence(fixed_season=fixed_season):
            reasons.append("fixed_season_outdated")
            status = "fixed_stale"

            base = float(out.get("overall") or 0.0)
            out["overall"] = round(max(0.0, min(base - 0.20, 0.99)), 4)
            out["level"] = _confidence_level(float(out["overall"]))
        else:
            reasons.append("fixed_season_accepted")

    elif policy == "current":
        candidates = [int(s) for s in (candidate_seasons or []) if s is not None]
        factors["candidate_seasons"] = candidates

        if effective_season is not None and candidates and int(effective_season) not in candidates:
            reasons.append("effective_season_outside_current_window")
            status = "current_policy_outside_window"

            base = float(out.get("overall") or 0.0)
            out["overall"] = round(max(0.0, min(base - 0.25, 0.99)), 4)
            out["level"] = _confidence_level(float(out["overall"]))

    factors["effective_season"] = int(effective_season) if effective_season is not None else None
    factors["season_policy"] = policy
    factors["season_recency_gap"] = gap
    factors["season_window_status"] = status

    out["factors"] = factors
    out["reasons"] = sorted(set(str(r) for r in reasons if r))

    return out

def _build_inputs_dict(
    *,
    league_id: Optional[int],
    season: Optional[int],
    fixture_id: Optional[int],
    home_team_id: Optional[int],
    away_team_id: Optional[int],
    lam_home: Optional[float],
    lam_away: Optional[float],
    lambda_source: Optional[str] = None,
    lambda_meta: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    lambda_total = None
    if lam_home is not None and lam_away is not None:
        lambda_total = float(lam_home) + float(lam_away)

    return {
        "league_id": int(league_id) if league_id is not None else None,
        "season": int(season) if season is not None else None,
        "fixture_id": int(fixture_id) if fixture_id is not None else None,
        "home_team_id": int(home_team_id) if home_team_id is not None else None,
        "away_team_id": int(away_team_id) if away_team_id is not None else None,
        "lambda_home": float(lam_home) if lam_home is not None else None,
        "lambda_away": float(lam_away) if lam_away is not None else None,
        "lambda_total": float(lambda_total) if lambda_total is not None else None,
        "lambda_source": str(lambda_source) if lambda_source is not None else None,
        "lambda_meta": lambda_meta if isinstance(lambda_meta, dict) else None,
    }

def _confidence_level(score: float) -> str:
    s = float(score)
    if s >= 0.75:
        return "high"
    if s >= 0.50:
        return "medium"
    return "low"


def _build_snapshot_confidence(
    *,
    estimate=None,
    fixture_resolved: bool,
    team_ids_resolved: bool,
    totals_available: bool,
    effective_season: Optional[int] = None,
    season_policy: Optional[str] = None,
    fixed_season: Optional[int] = None,
    candidate_seasons: Optional[List[int]] = None,
) -> Dict[str, Any]:
    diagnostics = getattr(estimate, "diagnostics", {}) or {}
    source = getattr(estimate, "source", None)

    confidence_from_model = diagnostics.get("confidence") if isinstance(diagnostics, dict) else None
    if isinstance(confidence_from_model, dict) and confidence_from_model.get("overall") is not None:
        base_score = float(confidence_from_model["overall"])
        level = str(confidence_from_model.get("level") or _confidence_level(base_score))
        factors = dict(confidence_from_model.get("factors") or {})
        coverage = dict(confidence_from_model.get("coverage") or {})
    else:
        if source == "team_season_stats_blended":
            base_score = 0.70
        elif source == "team_season_stats":
            base_score = 0.58
        elif source == "recent_fixtures":
            base_score = 0.46
        elif source == "league_prior":
            base_score = 0.28
        else:
            base_score = 0.15
        level = _confidence_level(base_score)
        factors = {}
        coverage = {}

    score = float(base_score)
    if fixture_resolved:
        score += 0.05
    if team_ids_resolved:
        score += 0.05
    if totals_available:
        score += 0.02

    score = min(max(score, 0.0), 0.99)

    factors["fixture_resolved"] = bool(fixture_resolved)
    factors["team_ids_resolved"] = bool(team_ids_resolved)
    factors["totals_available"] = bool(totals_available)
    factors["lambda_source"] = source

    base_confidence = {
        "overall": round(score, 4),
        "level": _confidence_level(score),
        "source": source,
        "factors": factors,
        "coverage": coverage,
        "reasons": [],
    }

    return _apply_season_confidence_overlay(
        base_confidence,
        effective_season=effective_season,
        season_policy=season_policy,
        fixed_season=fixed_season,
        candidate_seasons=candidate_seasons,
    )

def _build_empty_snapshot_payload(
    *,
    model_version: str,
    calc_version: str,
    totals: Dict[str, Any],
    league_id: Optional[int],
    season: Optional[int],
    fixture_id: Optional[int],
    home_team_id: Optional[int],
    away_team_id: Optional[int],
) -> Dict[str, Any]:
    return {
        "model_version": model_version,
        "calc_version": calc_version,
        "engine": {"type": "poisson_independent", "max_goals": 6},
        "inputs": _build_inputs_dict(
            league_id=league_id,
            season=season,
            fixture_id=fixture_id,
            home_team_id=home_team_id,
            away_team_id=away_team_id,
            lam_home=None,
            lam_away=None,
        ),
        "confidence": {
            "overall": 0.12,
            "level": "low",
            "source": "empty_snapshot",
            "factors": {
                "fixture_resolved": bool(fixture_id is not None),
                "team_ids_resolved": bool(home_team_id is not None and away_team_id is not None),
                "totals_available": bool(totals.get("main_line") is not None),
                "has_model": False,
            },
            "coverage": {},
        },
        "matrix": None,
        "markets": {
            "1x2": {"p_model": {"home": None, "draw": None, "away": None}},
            "btts": {"p_model": {"yes": None, "no": None}},
            "totals": {
                "main_line": totals.get("main_line"),
                "best_odds": {
                    "over": totals.get("best_over"),
                    "under": totals.get("best_under"),
                },
                "p_model": {"over": None, "under": None},
                "lines": {
                    "2.5": {"over": None, "under": None, "push": None},
                },
            },
        },
    }

def rebuild_matchup_snapshots_v1(
    conn,
    *,
    sport_key: str,
    model_version: str,
    event_ids: Optional[List[str]] = None,
    hours_ahead: int = 720,
    limit: int = 200,
    calc_version: str = "",
    force: bool = False,
) -> Dict[str, Any]:

    """
    Rebuild em lote: candidates -> totals main line -> lambdas -> payload -> upsert snapshots.

    Observação:
      - Este builder tenta operar mesmo sem fixture_id (team-first).
      - fixture_id passa a ser enriquecimento opcional.
    """
    c = {
        "candidates": 0,
        "snapshots_upserted": 0,
        "snapshots_team_fallback": 0,
        "snapshots_event_fallback": 0,
        "skipped_no_fixture": 0,
        "skipped_no_stats": 0,
        "skipped_no_league_map": 0,
        "skipped_no_team_ids": 0,
        "lambda_source_team_season_stats": 0,
        "lambda_source_recent_fixtures": 0,
        "lambda_source_league_prior": 0,
        "lambda_source_team_season_stats_blended": 0,
    }

    # candidates: normal (window) ou incremental (event_ids)
    if event_ids is not None:
        candidates = _select_candidates_by_event_ids(conn, sport_key=sport_key, event_ids=event_ids)
    else:
        candidates = _select_candidates(conn, sport_key=sport_key, hours_ahead=hours_ahead, limit=limit)

    c["candidates"] = len(candidates)

    if not calc_version:
        calc_version = get_calc_version()
    print(f"[SNAPSHOT] candidates={len(candidates)} calc_version={calc_version}", flush=True)

    for idx, ev in enumerate(candidates, start=1):
        event_id = ev["event_id"]
        fixture_id = ev.get("fixture_id")

        print(
            f"[SNAPSHOT] {idx}/{len(candidates)} event_id={event_id} fixture_id={fixture_id} "
            f"home={ev.get('home_name')} away={ev.get('away_name')}",
            flush=True,
        )

        totals = _select_totals_main_line_and_best(conn, event_id=event_id)
        print(
            f"[SNAPSHOT] totals main_line={totals.get('main_line')} "
            f"source_ts={totals.get('source_captured_at_utc')}",
            flush=True,
        )

        if fixture_id is None:
            # Novo fluxo: se temos team_ids resolvidos, geramos snapshot completo (team-first).
            home_team_id = ev.get("home_team_id")
            away_team_id = ev.get("away_team_id")

            if home_team_id is None or away_team_id is None:
                c["skipped_no_team_ids"] += 1

                # Mantém fallback vazio (por enquanto) para não "sumir" do produto.
                payload = _build_empty_snapshot_payload(
                    model_version=model_version,
                    calc_version=calc_version,
                    totals=totals,
                    league_id=None,
                    season=None,
                    fixture_id=None,
                    home_team_id=None,
                    away_team_id=None,
                )

                upsert_matchup_snapshot_v1(
                    conn,
                    event_id=event_id,
                    sport_key=ev["sport_key"],
                    kickoff_utc=ev["kickoff_utc"],
                    home_name=ev["home_name"],
                    away_name=ev["away_name"],
                    fixture_id=None,
                    source_captured_at_utc=totals["source_captured_at_utc"],
                    payload=payload,
                    model_version=model_version,
                )
                c["snapshots_event_fallback"] += 1
                continue

            # Precisamos de league_id+season para estimar lambdas a partir dos stats agregados.
            ctx = _resolve_league_and_season_from_sport_key(conn, sport_key=str(ev["sport_key"]))
            if not ctx:
                c["skipped_no_league_map"] += 1

                payload = _build_empty_snapshot_payload(
                    model_version=model_version,
                    calc_version=calc_version,
                    totals=totals,
                    league_id=None,
                    season=None,
                    fixture_id=None,
                    home_team_id=int(home_team_id),
                    away_team_id=int(away_team_id),
                )

                upsert_matchup_snapshot_v1(
                    conn,
                    event_id=event_id,
                    sport_key=ev["sport_key"],
                    kickoff_utc=ev["kickoff_utc"],
                    home_name=ev["home_name"],
                    away_name=ev["away_name"],
                    fixture_id=None,
                    source_captured_at_utc=totals["source_captured_at_utc"],
                    payload=payload,
                    model_version=model_version,
                )
                c["snapshots_event_fallback"] += 1
                continue

            league_id = int(ctx["league_id"])
            season = int(ctx["season"])

            season_policy_ctx = _load_snapshot_season_policy_context(
                conn,
                sport_key=str(ev["sport_key"]),
                league_id=league_id,
            )

            season_policy_ctx = _load_snapshot_season_policy_context(
                conn,
                sport_key=str(ev["sport_key"]),
                league_id=int(fx["league_id"]),
            )

            estimate = estimate_lambdas_with_fallback(
                conn,
                league_id=league_id,
                season=season,
                home_team_id=int(home_team_id),
                away_team_id=int(away_team_id),
                n_games=10,
            )
            lambdas = estimate.lambdas
            c[f"lambda_source_{estimate.source}"] = c.get(f"lambda_source_{estimate.source}", 0) + 1

            mx = generate_score_matrix_v1(lambdas.lam_home, lambdas.lam_away, max_goals=6)
            p_1x2 = derive_1x2(mx.matrix)
            p_btts = derive_btts(mx.matrix)

            p_ov25 = derive_totals(mx.matrix, 2.5)
            p_main = derive_totals(mx.matrix, float(totals["main_line"])) if totals["main_line"] is not None else None

            payload = {
                "model_version": model_version,
                "calc_version": calc_version,
                "engine": {"type": "poisson_independent", "max_goals": 6},
                "inputs": _build_inputs_dict(
                    league_id=league_id,
                    season=season,
                    fixture_id=None,
                    home_team_id=int(home_team_id),
                    away_team_id=int(away_team_id),
                    lam_home=float(lambdas.lam_home),
                    lam_away=float(lambdas.lam_away),
                    lambda_source=estimate.source,
                    lambda_meta=estimate.diagnostics,
                ),
                "confidence": _build_snapshot_confidence(
                    estimate=estimate,
                    fixture_resolved=False,
                    team_ids_resolved=True,
                    totals_available=bool(totals["main_line"] is not None),
                    effective_season=season,
                    season_policy=season_policy_ctx.get("season_policy"),
                    fixed_season=season_policy_ctx.get("fixed_season"),
                    candidate_seasons=season_policy_ctx.get("candidate_seasons"),
                ),
                "matrix": mx.matrix,
                "markets": {
                    "1x2": {"p_model": p_1x2},
                    "btts": {"p_model": p_btts},
                    "totals": {
                        "main_line": totals["main_line"],
                        "best_odds": {"over": totals["best_over"], "under": totals["best_under"]},
                        "p_model": (
                            {"over": p_main["over"], "under": p_main["under"]}
                            if p_main is not None
                            else {"over": None, "under": None}
                        ),
                        "lines": {
                            "2.5": {"over": p_ov25["over"], "under": p_ov25["under"], "push": p_ov25["push"]}
                        },
                    },
                },
            }

            upsert_matchup_snapshot_v1(
                conn,
                event_id=event_id,
                sport_key=ev["sport_key"],
                kickoff_utc=ev["kickoff_utc"],
                home_name=ev["home_name"],
                away_name=ev["away_name"],
                fixture_id=None,
                source_captured_at_utc=totals["source_captured_at_utc"],
                payload=payload,
                model_version=model_version,
            )
            c["snapshots_team_fallback"] += 1
            continue

        # fixture_id existe: usa fixtures
        fx = _load_fixture_context(conn, fixture_id=int(fixture_id))
        print(f"[SNAPSHOT] fixture ctx ok={bool(fx)}", flush=True)
        if not fx:
            c["skipped_no_fixture"] += 1
            continue

        estimate = estimate_lambdas_with_fallback(
            conn,
            league_id=fx["league_id"],
            season=fx["season"],
            home_team_id=fx["home_team_id"],
            away_team_id=fx["away_team_id"],
            n_games=10,
        )
        lambdas = estimate.lambdas
        c[f"lambda_source_{estimate.source}"] = c.get(f"lambda_source_{estimate.source}", 0) + 1

        # Score Engine v1: matriz -> mercados.
        mx = generate_score_matrix_v1(lambdas.lam_home, lambdas.lam_away, max_goals=6)
        p_1x2 = derive_1x2(mx.matrix)
        p_btts = derive_btts(mx.matrix)

        # Totals: sempre derivamos 2.5 (critério v1) e também a main_line se existir
        p_ov25 = derive_totals(mx.matrix, 2.5)
        p_main = derive_totals(mx.matrix, float(totals["main_line"])) if totals["main_line"] is not None else None

        payload = {
            "model_version": model_version,
            "calc_version": calc_version,
            "engine": {"type": "poisson_independent", "max_goals": 6},
            "inputs": _build_inputs_dict(
                league_id=fx.get("league_id"),
                season=fx.get("season"),
                fixture_id=fixture_id,
                home_team_id=fx.get("home_team_id"),
                away_team_id=fx.get("away_team_id"),
                lam_home=float(lambdas.lam_home),
                lam_away=float(lambdas.lam_away),
                lambda_source=estimate.source,
                lambda_meta=estimate.diagnostics,
            ),
            "confidence": _build_snapshot_confidence(
                estimate=estimate,
                fixture_resolved=True,
                team_ids_resolved=True,
                totals_available=bool(totals["main_line"] is not None),
                effective_season=int(fx["season"]) if fx.get("season") is not None else None,
                season_policy=season_policy_ctx.get("season_policy"),
                fixed_season=season_policy_ctx.get("fixed_season"),
                candidate_seasons=season_policy_ctx.get("candidate_seasons"),
            ),
            # 7x7 (0..6) => 49 entradas, ok salvar como dict
            "matrix": mx.matrix,
            "markets": {
                "1x2": {"p_model": p_1x2},
                "btts": {"p_model": p_btts},
                "totals": {
                    "main_line": totals["main_line"],
                    "best_odds": {"over": totals["best_over"], "under": totals["best_under"]},
                    # backward compatible: p_model da main_line (se existir)
                    "p_model": (
                        {"over": p_main["over"], "under": p_main["under"]}
                        if p_main is not None
                        else {"over": None, "under": None}
                    ),
                    # novo: linhas explícitas
                    "lines": {
                        "2.5": {"over": p_ov25["over"], "under": p_ov25["under"], "push": p_ov25["push"]}
                    },
                },
            },
        }

        upsert_matchup_snapshot_v1(
            conn,
            event_id=event_id,
            sport_key=ev["sport_key"],
            kickoff_utc=fx["kickoff_utc"],
            home_name=ev["home_name"],
            away_name=ev["away_name"],
            fixture_id=fx["fixture_id"],
            source_captured_at_utc=totals["source_captured_at_utc"],
            payload=payload,
            model_version=model_version,
        )
        c["snapshots_upserted"] += 1

    return c