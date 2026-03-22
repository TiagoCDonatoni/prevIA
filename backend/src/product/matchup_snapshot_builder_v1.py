from __future__ import annotations

import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from src.product.matchup_model_v0 import (
    estimate_lambdas_from_team_season_stats,
    estimate_lambdas_from_recent_fixtures,
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
    season_policy:
      - fixed   -> fixed_season
      - current -> usa última season disponível (fixtures, fallback stats)
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
    season_policy = str(r[1]) if r[1] is not None else None
    fixed_season = int(r[2]) if r[2] is not None else None

    if season_policy == "fixed" and fixed_season:
        return {"league_id": league_id, "season": fixed_season}

    season = _get_latest_season_for_league(conn, league_id=league_id)
    if season is None:
        return None

    return {"league_id": league_id, "season": int(season)}


def _get_latest_season_for_league(conn, *, league_id: int) -> Optional[int]:
    """
    Última season conhecida para a liga. Ordem:
      1) core.fixtures (mais confiável quando existe)
      2) core.team_season_stats (fallback)
    """
    sql_fx = """
      SELECT MAX(season)
      FROM core.fixtures
      WHERE league_id = %(league_id)s
    """
    with conn.cursor() as cur:
        cur.execute(sql_fx, {"league_id": int(league_id)})
        r = cur.fetchone()
    if r and r[0] is not None:
        return int(r[0])

    sql_stats = """
      SELECT MAX(season)
      FROM core.team_season_stats
      WHERE league_id = %(league_id)s
    """
    with conn.cursor() as cur:
        cur.execute(sql_stats, {"league_id": int(league_id)})
        r2 = cur.fetchone()
    if r2 and r2[0] is not None:
        return int(r2[0])

    return None


def _build_inputs_dict(
    *,
    league_id: Optional[int],
    season: Optional[int],
    fixture_id: Optional[int],
    home_team_id: Optional[int],
    away_team_id: Optional[int],
    lam_home: Optional[float],
    lam_away: Optional[float],
) -> Dict[str, Any]:
    return {
        "league_id": int(league_id) if league_id is not None else None,
        "season": int(season) if season is not None else None,
        "fixture_id": int(fixture_id) if fixture_id is not None else None,
        "home_team_id": int(home_team_id) if home_team_id is not None else None,
        "away_team_id": int(away_team_id) if away_team_id is not None else None,
        "lambda_home": float(lam_home) if lam_home is not None else None,
        "lambda_away": float(lam_away) if lam_away is not None else None,
    }

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
                payload = {
                    "model_version": model_version,
                    "calc_version": calc_version,
                    "engine": {"type": "poisson_independent", "max_goals": 6},
                    "inputs": _build_inputs_dict(
                        league_id=None,
                        season=None,
                        fixture_id=None,
                        home_team_id=None,
                        away_team_id=None,
                        lam_home=None,
                        lam_away=None,
                    ),
                    "matrix": None,
                    "markets": {
                        "1x2": {"p_model": {"home": None, "draw": None, "away": None}},
                        "btts": {"p_model": {"yes": None, "no": None}},
                        "totals": {
                            "main_line": totals["main_line"],
                            "best_odds": {"over": totals["best_over"], "under": totals["best_under"]},
                            "p_model": {"over": None, "under": None},
                            "lines": {"2.5": {"over": None, "under": None, "push": None}},
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
                c["snapshots_event_fallback"] += 1
                continue

            # Precisamos de league_id+season para estimar lambdas a partir dos stats agregados.
            ctx = _resolve_league_and_season_from_sport_key(conn, sport_key=str(ev["sport_key"]))
            if not ctx:
                c["skipped_no_league_map"] += 1

                payload = {
                    "model_version": model_version,
                    "calc_version": calc_version,
                    "engine": {"type": "poisson_independent", "max_goals": 6},
                    "inputs": _build_inputs_dict(
                        league_id=None,
                        season=None,
                        fixture_id=None,
                        home_team_id=int(home_team_id),
                        away_team_id=int(away_team_id),
                        lam_home=None,
                        lam_away=None,
                    ),
                    "matrix": None,
                    "markets": {
                        "1x2": {"p_model": {"home": None, "draw": None, "away": None}},
                        "btts": {"p_model": {"yes": None, "no": None}},
                        "totals": {
                            "main_line": totals["main_line"],
                            "best_odds": {"over": totals["best_over"], "under": totals["best_under"]},
                            "p_model": {"over": None, "under": None},
                            "lines": {"2.5": {"over": None, "under": None, "push": None}},
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
                c["snapshots_event_fallback"] += 1
                continue

            league_id = int(ctx["league_id"])
            season = int(ctx["season"])

            lambdas = estimate_lambdas_from_team_season_stats(
                conn,
                league_id=league_id,
                season=season,
                home_team_id=int(home_team_id),
                away_team_id=int(away_team_id),
            )

            if lambdas is None:
                lambdas = estimate_lambdas_from_recent_fixtures(
                    conn,
                    league_id=league_id,
                    season=season,
                    home_team_id=int(home_team_id),
                    away_team_id=int(away_team_id),
                    n_games=10,
                )

            if lambdas is None:
                c["skipped_no_stats"] += 1

                payload = _build_empty_snapshot_payload(
                    model_version=model_version,
                    calc_version=calc_version,
                    totals=totals,
                    league_id=league_id,
                    season=season,
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

        lambdas = estimate_lambdas_from_team_season_stats(
            conn,
            league_id=fx["league_id"],
            season=fx["season"],
            home_team_id=fx["home_team_id"],
            away_team_id=fx["away_team_id"],
        )

        if lambdas is None:
            # fallback por últimos N jogos (garante snapshot mesmo sem stats agregadas)
            lambdas = estimate_lambdas_from_recent_fixtures(
                conn,
                league_id=fx["league_id"],
                season=fx["season"],
                home_team_id=fx["home_team_id"],
                away_team_id=fx["away_team_id"],
                n_games=10,
            )

        if lambdas is None:
            c["skipped_no_stats"] += 1

            payload = _build_empty_snapshot_payload(
                model_version=model_version,
                calc_version=calc_version,
                totals=totals,
                league_id=fx.get("league_id"),
                season=fx.get("season"),
                fixture_id=fixture_id,
                home_team_id=fx.get("home_team_id"),
                away_team_id=fx.get("away_team_id"),
            )

            upsert_matchup_snapshot_v1(
                conn,
                event_id=event_id,
                sport_key=ev["sport_key"],
                kickoff_utc=ev["kickoff_utc"],
                home_name=ev["home_name"],
                away_name=ev["away_name"],
                fixture_id=fixture_id,
                source_captured_at_utc=totals["source_captured_at_utc"],
                payload=payload,
                model_version=model_version,
            )
            c["snapshots_event_fallback"] += 1
            continue

        # Score Engine v1: matriz -> mercados.
        # (model_version = como lambda foi estimado; calc_version = como geramos/derivamos)
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
                lam_home=float(lambdas.lam_home) if lambdas is not None else None,
                lam_away=float(lambdas.lam_away) if lambdas is not None else None,
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