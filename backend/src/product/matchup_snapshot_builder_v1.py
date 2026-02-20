from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
from src.product.matchup_model_v0 import (
    estimate_lambdas_from_team_season_stats,
    estimate_lambdas_from_recent_fixtures,
    build_model_payload_v0,
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
        e.resolved_fixture_id AS fixture_id
      FROM odds.odds_events e
      WHERE e.sport_key = %(sport_key)s
        AND e.commence_time_utc IS NOT NULL
        AND e.commence_time_utc >= %(now)s
        AND e.commence_time_utc <= %(end)s
      ORDER BY e.commence_time_utc ASC
      LIMIT %(limit)s
    """
    with conn.cursor() as cur:
        cur.execute(sql, {"sport_key": sport_key, "now": now, "end": end, "limit": int(limit)})
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


def _select_totals_main_line_and_best(conn, *, event_id: str) -> Dict[str, Any]:
    """
    Usa odds.odds_snapshots_market (totals) no último captured_at_utc para escolher:
      - main_line (mode do point)
      - best_over / best_under nessa line
    """
    sql = """
      WITH last_ts AS (
        SELECT MAX(captured_at_utc) AS ts
        FROM odds.odds_snapshots_market
        WHERE event_id=%(event_id)s AND market_key='totals'
      ),
      last_rows AS (
        SELECT *
        FROM odds.odds_snapshots_market
        WHERE event_id=%(event_id)s
          AND market_key='totals'
          AND captured_at_utc = (SELECT ts FROM last_ts)
      ),
      main_line AS (
        SELECT point
        FROM last_rows
        GROUP BY point
        ORDER BY COUNT(*) DESC, point ASC
        LIMIT 1
      ),
      best AS (
        SELECT
          selection_key,
          MAX(price) AS best_price
        FROM last_rows
        WHERE point = (SELECT point FROM main_line)
          AND selection_key IN ('over','under')
        GROUP BY selection_key
      )
      SELECT
        (SELECT point FROM main_line) AS main_point,
        MAX(CASE WHEN selection_key='over' THEN best_price END) AS best_over,
        MAX(CASE WHEN selection_key='under' THEN best_price END) AS best_under,
        (SELECT ts FROM last_ts) AS source_captured_at_utc
      FROM best;
    """
    with conn.cursor() as cur:
        cur.execute(sql, {"event_id": str(event_id)})
        r = cur.fetchone()

    if not r:
        return {"main_line": None, "best_over": None, "best_under": None, "source_captured_at_utc": None}

    return {
        "main_line": float(r[0]) if r[0] is not None else None,
        "best_over": float(r[1]) if r[1] is not None else None,
        "best_under": float(r[2]) if r[2] is not None else None,
        "source_captured_at_utc": r[3],
    }


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
    sql = """
      INSERT INTO product.matchup_snapshot_v1 (
        fixture_id, event_id, sport_key, kickoff_utc,
        home_name, away_name,
        source_captured_at_utc,
        model_version, payload,
        generated_at_utc, updated_at_utc
      )
      VALUES (
        %(fixture_id)s, %(event_id)s, %(sport_key)s, %(kickoff_utc)s,
        %(home_name)s, %(away_name)s,
        %(source_captured_at_utc)s,
        %(model_version)s, %(payload)s::jsonb,
        now(), now()
      )
      ON CONFLICT ON CONSTRAINT ux_matchup_snapshot_fixture_model
      DO UPDATE SET
        event_id = EXCLUDED.event_id,
        sport_key = EXCLUDED.sport_key,
        kickoff_utc = EXCLUDED.kickoff_utc,
        home_name = EXCLUDED.home_name,
        away_name = EXCLUDED.away_name,
        source_captured_at_utc = EXCLUDED.source_captured_at_utc,
        payload = EXCLUDED.payload,
        updated_at_utc = now()
    """
    # Se fixture_id for NULL, o conflict correto é o index parcial por event+model
    # então fazemos um segundo upsert por event_id quando fixture_id é NULL.
    sql_event_fallback = """
      INSERT INTO product.matchup_snapshot_v1 (
        fixture_id, event_id, sport_key, kickoff_utc,
        home_name, away_name,
        source_captured_at_utc,
        model_version, payload,
        generated_at_utc, updated_at_utc
      )
      VALUES (
        NULL, %(event_id)s, %(sport_key)s, %(kickoff_utc)s,
        %(home_name)s, %(away_name)s,
        %(source_captured_at_utc)s,
        %(model_version)s, %(payload)s::jsonb,
        now(), now()
      )
      ON CONFLICT ON CONSTRAINT ux_matchup_snapshot_event_model
      DO UPDATE SET
        sport_key = EXCLUDED.sport_key,
        kickoff_utc = EXCLUDED.kickoff_utc,
        home_name = EXCLUDED.home_name,
        away_name = EXCLUDED.away_name,
        source_captured_at_utc = EXCLUDED.source_captured_at_utc,
        payload = EXCLUDED.payload,
        updated_at_utc = now()
    """

    params = {
        "fixture_id": int(fixture_id) if fixture_id is not None else None,
        "event_id": str(event_id),
        "sport_key": str(sport_key),
        "kickoff_utc": kickoff_utc,
        "home_name": str(home_name) if home_name else None,
        "away_name": str(away_name) if away_name else None,
        "source_captured_at_utc": source_captured_at_utc,
        "model_version": str(model_version),
        "payload": __import__("json").dumps(payload),
    }

    with conn.cursor() as cur:
        if fixture_id is not None:
            cur.execute(sql, params)
        else:
            cur.execute(sql_event_fallback, params)


def rebuild_matchup_snapshots_v1(
    conn,
    *,
    sport_key: str,
    hours_ahead: int = 720,
    limit: int = 200,
    model_version: str = "model_v0",
) -> Dict[str, int]:
    """
    Rebuild em lote: candidates -> totals main line -> lambdas -> payload -> upsert snapshot.
    """
    c = {"candidates": 0, "snapshots_upserted": 0, "skipped_no_fixture": 0, "skipped_no_stats": 0}

    candidates = _select_candidates(conn, sport_key=sport_key, hours_ahead=hours_ahead, limit=limit)
    c["candidates"] = len(candidates)

    print(f"[SNAPSHOT] candidates={len(candidates)}", flush=True)

    for idx, ev in enumerate(candidates, start=1):
        event_id = ev["event_id"]
        fixture_id = ev.get("fixture_id")

        print(
            f"[SNAPSHOT] {idx}/{len(candidates)} "
            f"event_id={event_id} fixture_id={fixture_id}",
            flush=True
        )

        totals = _select_totals_main_line_and_best(conn, event_id=event_id)
        print(
            f"[SNAPSHOT] totals main_line={totals.get('main_line')} "
            f"source_ts={totals.get('source_captured_at_utc')}",
            flush=True,
        )

        if fixture_id is None:
            # MVP: se não resolveu fixture ainda, você pode:
            # - gerar snapshot por event_id mesmo (funciona)
            # - OU pular. Aqui: gerar por event_id mesmo, sem lambdas (skipped_no_fixture)
            c["skipped_no_fixture"] += 1
            payload = {
                "model_version": model_version,
                "markets": {
                    "totals": {
                        "main_line": totals["main_line"],
                        "best_odds": {"over": totals["best_over"], "under": totals["best_under"]},
                        "p_model": {"over": None, "under": None},
                    },
                    "btts": {"p_model": {"yes": None, "no": None}},
                },
                "inputs": None,
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
            c["snapshots_upserted"] += 1
            continue

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
            continue

        payload = build_model_payload_v0(
            lam_home=lambdas.lam_home,
            lam_away=lambdas.lam_away,
            totals_main_line=totals["main_line"],
        )

        # anexar best_odds no payload sem misturar com cálculo
        payload.setdefault("markets", {}).setdefault("totals", {}).setdefault("best_odds", {})
        payload["markets"]["totals"]["best_odds"] = {"over": totals["best_over"], "under": totals["best_under"]}

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