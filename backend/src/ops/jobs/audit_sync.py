from __future__ import annotations

from datetime import datetime, timezone, timedelta
from time import perf_counter
from typing import Any, Dict, Optional

from src.db.pg import pg_conn


def _safe_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except Exception:
        return default


def _resolve_snapshot_payload_column(conn) -> str:
    sql = """
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'product'
        AND table_name = 'matchup_snapshot_v1'
        AND column_name = %(column_name)s
      LIMIT 1
    """
    with conn.cursor() as cur:
        for column_name in ("payload", "payload_json"):
            cur.execute(sql, {"column_name": column_name})
            if cur.fetchone():
                return column_name

    return "payload"


def _count_product_snapshot_candidates(
    conn,
    *,
    payload_col: str,
    sport_key: Optional[str],
    league_id: Optional[int],
    lookback_utc: Optional[datetime],
) -> Dict[str, int]:
    payload_expr = f"s.{payload_col}"

    sql = f"""
      WITH extracted AS (
        SELECT
          s.event_id,
          s.fixture_id,
          s.sport_key,
          s.kickoff_utc,
          COALESCE(
            CASE WHEN NULLIF({payload_expr} #>> '{{inputs,league_id}}', '') ~ '^[0-9]+$'
              THEN NULLIF({payload_expr} #>> '{{inputs,league_id}}', '')::int
              ELSE NULL
            END,
            f.league_id
          ) AS resolved_league_id,
          NULLIF({payload_expr} #>> '{{markets,1x2,p_model,home}}', '') AS p_model_h_txt,
          NULLIF({payload_expr} #>> '{{markets,1x2,p_model,draw}}', '') AS p_model_d_txt,
          NULLIF({payload_expr} #>> '{{markets,1x2,p_model,away}}', '') AS p_model_a_txt
        FROM product.matchup_snapshot_v1 s
        LEFT JOIN core.fixtures f
          ON f.fixture_id = s.fixture_id
        WHERE s.kickoff_utc IS NOT NULL
          AND (%(sport_key)s::text IS NULL OR s.sport_key = %(sport_key)s::text)
          AND (%(lookback_utc)s::timestamptz IS NULL OR s.kickoff_utc >= %(lookback_utc)s::timestamptz)
      )
      SELECT
        COUNT(*) AS product_snapshots_seen,
        COUNT(*) FILTER (WHERE event_id IS NULL) AS missing_event_id,
        COUNT(*) FILTER (WHERE fixture_id IS NULL) AS missing_fixture_id,
        COUNT(*) FILTER (
          WHERE p_model_h_txt IS NULL OR p_model_d_txt IS NULL OR p_model_a_txt IS NULL
        ) AS missing_model_probs,
        COUNT(*) FILTER (
          WHERE event_id IS NOT NULL
            AND p_model_h_txt IS NOT NULL
            AND p_model_d_txt IS NOT NULL
            AND p_model_a_txt IS NOT NULL
            AND (%(league_id)s::int IS NULL OR resolved_league_id = %(league_id)s::int)
        ) AS eligible_prediction_snapshots
      FROM extracted
    """

    with conn.cursor() as cur:
        cur.execute(
            sql,
            {
                "sport_key": sport_key,
                "league_id": int(league_id) if league_id is not None else None,
                "lookback_utc": lookback_utc,
            },
        )
        row = cur.fetchone() or (0, 0, 0, 0, 0)

    return {
        "product_snapshots_seen": _safe_int(row[0]),
        "missing_event_id": _safe_int(row[1]),
        "missing_fixture_id": _safe_int(row[2]),
        "missing_model_probs": _safe_int(row[3]),
        "eligible_prediction_snapshots": _safe_int(row[4]),
    }


def sync_audit_predictions_from_product_snapshots(
    *,
    sport_key: Optional[str] = None,
    league_id: Optional[int] = None,
    lookback_days: Optional[int] = 60,
    max_rows: int = 10000,
) -> Dict[str, Any]:
    """
    Materializa odds.audit_predictions a partir do read model oficial do produto.

    Antes dessa rotina, a Odds Audit dependia de fluxos administrativos como Queue Intel.
    Com isso, todo snapshot criado pelo pipeline do produto passa a alimentar a auditoria
    histórica, preservando o timestamp de captura usado no cálculo.
    """

    t0 = perf_counter()
    now_utc = datetime.now(timezone.utc)
    lookback_utc = (
        now_utc - timedelta(days=int(lookback_days))
        if lookback_days is not None and int(lookback_days) > 0
        else None
    )

    with pg_conn() as conn:
        payload_col = _resolve_snapshot_payload_column(conn)
        payload_expr = f"s.{payload_col}"

        diagnostics = _count_product_snapshot_candidates(
            conn,
            payload_col=payload_col,
            sport_key=sport_key,
            league_id=league_id,
            lookback_utc=lookback_utc,
        )

        sql = f"""
          WITH latest_odds AS (
            SELECT DISTINCT ON (event_id)
              event_id,
              bookmaker,
              market,
              odds_home,
              odds_draw,
              odds_away,
              captured_at_utc
            FROM odds.odds_snapshots_1x2
            ORDER BY event_id, captured_at_utc DESC
          ),
          extracted AS (
            SELECT
              s.event_id,
              s.sport_key,
              s.kickoff_utc,
              COALESCE(s.source_captured_at_utc, s.updated_at_utc, s.generated_at_utc) AS captured_at_utc,
              s.model_version,
              s.fixture_id AS snapshot_fixture_id,
              {payload_expr} AS payload,
              e.resolved_fixture_id,
              e.resolved_home_team_id,
              e.resolved_away_team_id,
              e.match_confidence,
              lo.bookmaker,
              lo.market,
              lo.odds_home,
              lo.odds_draw,
              lo.odds_away,
              CASE WHEN NULLIF({payload_expr} #>> '{{inputs,league_id}}', '') ~ '^[0-9]+$'
                THEN NULLIF({payload_expr} #>> '{{inputs,league_id}}', '')::int
                ELSE NULL
              END AS payload_league_id,
              CASE WHEN NULLIF({payload_expr} #>> '{{inputs,season}}', '') ~ '^[0-9]+$'
                THEN NULLIF({payload_expr} #>> '{{inputs,season}}', '')::int
                ELSE NULL
              END AS payload_season,
              CASE WHEN NULLIF({payload_expr} #>> '{{inputs,fixture_id}}', '') ~ '^[0-9]+$'
                THEN NULLIF({payload_expr} #>> '{{inputs,fixture_id}}', '')::int
                ELSE NULL
              END AS payload_fixture_id,
              CASE WHEN NULLIF({payload_expr} #>> '{{inputs,home_team_id}}', '') ~ '^[0-9]+$'
                THEN NULLIF({payload_expr} #>> '{{inputs,home_team_id}}', '')::int
                ELSE NULL
              END AS payload_home_team_id,
              CASE WHEN NULLIF({payload_expr} #>> '{{inputs,away_team_id}}', '') ~ '^[0-9]+$'
                THEN NULLIF({payload_expr} #>> '{{inputs,away_team_id}}', '')::int
                ELSE NULL
              END AS payload_away_team_id,
              NULLIF({payload_expr} #>> '{{markets,1x2,p_model,home}}', '')::numeric AS p_model_h,
              NULLIF({payload_expr} #>> '{{markets,1x2,p_model,draw}}', '')::numeric AS p_model_d,
              NULLIF({payload_expr} #>> '{{markets,1x2,p_model,away}}', '')::numeric AS p_model_a
            FROM product.matchup_snapshot_v1 s
            JOIN odds.odds_events e
              ON e.event_id = s.event_id
            LEFT JOIN latest_odds lo
              ON lo.event_id = s.event_id
            WHERE s.event_id IS NOT NULL
              AND s.kickoff_utc IS NOT NULL
              AND COALESCE(s.source_captured_at_utc, s.updated_at_utc, s.generated_at_utc) IS NOT NULL
              AND (%(sport_key)s::text IS NULL OR s.sport_key = %(sport_key)s::text)
              AND (%(lookback_utc)s::timestamptz IS NULL OR s.kickoff_utc >= %(lookback_utc)s::timestamptz)
              AND NULLIF({payload_expr} #>> '{{markets,1x2,p_model,home}}', '') IS NOT NULL
              AND NULLIF({payload_expr} #>> '{{markets,1x2,p_model,draw}}', '') IS NOT NULL
              AND NULLIF({payload_expr} #>> '{{markets,1x2,p_model,away}}', '') IS NOT NULL
          ),
          src AS (
            SELECT
              x.event_id,
              x.sport_key,
              x.kickoff_utc,
              x.captured_at_utc,
              x.bookmaker,
              x.market,
              COALESCE(x.payload_league_id, f.league_id) AS league_id,
              COALESCE(x.payload_season, f.season) AS season,
              COALESCE(x.snapshot_fixture_id, x.payload_fixture_id, x.resolved_fixture_id) AS fixture_id,
              COALESCE(x.payload_home_team_id, f.home_team_id, x.resolved_home_team_id) AS home_team_id,
              COALESCE(x.payload_away_team_id, f.away_team_id, x.resolved_away_team_id) AS away_team_id,
              COALESCE(
                x.match_confidence,
                CASE WHEN COALESCE(x.snapshot_fixture_id, x.payload_fixture_id, x.resolved_fixture_id) IS NOT NULL THEN 'EXACT' ELSE 'NONE' END
              ) AS match_confidence,
              'product_snapshot_v1:' || x.model_version AS artifact_filename,
              x.odds_home,
              x.odds_draw,
              x.odds_away,
              x.p_model_h,
              x.p_model_d,
              x.p_model_a
            FROM extracted x
            LEFT JOIN core.fixtures f
              ON f.fixture_id = COALESCE(x.snapshot_fixture_id, x.payload_fixture_id, x.resolved_fixture_id)
          ),
          calc AS (
            SELECT
              *,
              CASE
                WHEN odds_home > 1 AND odds_draw > 1 AND odds_away > 1
                THEN (1 / odds_home) / ((1 / odds_home) + (1 / odds_draw) + (1 / odds_away))
                ELSE NULL
              END AS p_mkt_h,
              CASE
                WHEN odds_home > 1 AND odds_draw > 1 AND odds_away > 1
                THEN (1 / odds_draw) / ((1 / odds_home) + (1 / odds_draw) + (1 / odds_away))
                ELSE NULL
              END AS p_mkt_d,
              CASE
                WHEN odds_home > 1 AND odds_draw > 1 AND odds_away > 1
                THEN (1 / odds_away) / ((1 / odds_home) + (1 / odds_draw) + (1 / odds_away))
                ELSE NULL
              END AS p_mkt_a,
              CASE
                WHEN p_model_h >= p_model_d AND p_model_h >= p_model_a THEN 'H'
                WHEN p_model_d >= p_model_h AND p_model_d >= p_model_a THEN 'D'
                ELSE 'A'
              END AS model_top_side,
              CASE
                WHEN odds_home > 1 AND odds_draw > 1 AND odds_away > 1 THEN GREATEST(
                  p_model_h * odds_home - 1,
                  p_model_d * odds_draw - 1,
                  p_model_a * odds_away - 1
                )
                ELSE NULL
              END AS best_ev
            FROM src
            WHERE (%(league_id)s::int IS NULL OR league_id = %(league_id)s::int)
            ORDER BY kickoff_utc DESC, event_id ASC
            LIMIT %(max_rows)s
          )
          INSERT INTO odds.audit_predictions (
            event_id,
            sport_key,
            kickoff_utc,
            captured_at_utc,
            bookmaker,
            market,
            league_id,
            season,
            fixture_id,
            home_team_id,
            away_team_id,
            match_confidence,
            artifact_filename,
            odds_h,
            odds_d,
            odds_a,
            p_mkt_h,
            p_mkt_d,
            p_mkt_a,
            p_model_h,
            p_model_d,
            p_model_a,
            best_side,
            best_ev,
            status,
            reason,
            created_at_utc,
            updated_at_utc
          )
          SELECT
            event_id,
            sport_key,
            kickoff_utc,
            captured_at_utc,
            bookmaker,
            market,
            league_id,
            season,
            fixture_id,
            home_team_id,
            away_team_id,
            match_confidence,
            artifact_filename,
            odds_home,
            odds_draw,
            odds_away,
            p_mkt_h,
            p_mkt_d,
            p_mkt_a,
            p_model_h,
            p_model_d,
            p_model_a,
            model_top_side,
            best_ev,
            'ok',
            'product_snapshot_sync',
            now(),
            now()
          FROM calc
          ON CONFLICT (event_id, artifact_filename, captured_at_utc)
          DO UPDATE SET
            sport_key = EXCLUDED.sport_key,
            kickoff_utc = EXCLUDED.kickoff_utc,
            bookmaker = EXCLUDED.bookmaker,
            market = EXCLUDED.market,
            league_id = EXCLUDED.league_id,
            season = EXCLUDED.season,
            fixture_id = EXCLUDED.fixture_id,
            home_team_id = EXCLUDED.home_team_id,
            away_team_id = EXCLUDED.away_team_id,
            match_confidence = EXCLUDED.match_confidence,
            odds_h = EXCLUDED.odds_h,
            odds_d = EXCLUDED.odds_d,
            odds_a = EXCLUDED.odds_a,
            p_mkt_h = EXCLUDED.p_mkt_h,
            p_mkt_d = EXCLUDED.p_mkt_d,
            p_mkt_a = EXCLUDED.p_mkt_a,
            p_model_h = EXCLUDED.p_model_h,
            p_model_d = EXCLUDED.p_model_d,
            p_model_a = EXCLUDED.p_model_a,
            best_side = EXCLUDED.best_side,
            best_ev = EXCLUDED.best_ev,
            status = EXCLUDED.status,
            reason = EXCLUDED.reason,
            updated_at_utc = now()
        """

        with conn.cursor() as cur:
            cur.execute(
                sql,
                {
                    "sport_key": sport_key,
                    "league_id": int(league_id) if league_id is not None else None,
                    "lookback_utc": lookback_utc,
                    "max_rows": int(max_rows),
                },
            )
            upserted = cur.rowcount if cur.rowcount is not None and cur.rowcount >= 0 else 0

        conn.commit()

    return {
        "ok": True,
        "sport_key": sport_key,
        "league_id": int(league_id) if league_id is not None else None,
        "lookback_days": int(lookback_days) if lookback_days is not None else None,
        "lookback_utc": lookback_utc.isoformat() if lookback_utc is not None else None,
        "audit_predictions_upserted": int(upserted),
        "diagnostics": diagnostics,
        "elapsed_ms": int((perf_counter() - t0) * 1000),
    }


def sync_audit_results_from_core_fixtures(
    *,
    sport_key: Optional[str] = None,
    league_id: Optional[int] = None,
    season: Optional[int] = None,
    lookback_days: Optional[int] = 60,
    finished_before_hours: int = 1,
    max_rows: int = 10000,
) -> Dict[str, Any]:
    """
    Sincroniza odds.audit_result usando core.fixtures para eventos já existentes
    em odds.audit_predictions.
    """

    t0 = perf_counter()
    now_utc = datetime.now(timezone.utc)
    cutoff_utc = now_utc - timedelta(hours=int(finished_before_hours))
    lookback_utc = (
        now_utc - timedelta(days=int(lookback_days))
        if lookback_days is not None and int(lookback_days) > 0
        else None
    )

    sql = """
      WITH picked AS (
        SELECT DISTINCT ON (p.event_id)
          p.event_id,
          p.fixture_id,
          p.league_id,
          p.season,
          p.kickoff_utc,
          f.goals_home,
          f.goals_away
        FROM odds.audit_predictions p
        JOIN core.fixtures f
          ON f.fixture_id = p.fixture_id
        WHERE p.fixture_id IS NOT NULL
          AND f.is_finished = TRUE
          AND COALESCE(f.is_cancelled, FALSE) = FALSE
          AND f.goals_home IS NOT NULL
          AND f.goals_away IS NOT NULL
          AND p.kickoff_utc IS NOT NULL
          AND p.kickoff_utc <= %(cutoff_utc)s
          AND (%(lookback_utc)s::timestamptz IS NULL OR p.kickoff_utc >= %(lookback_utc)s::timestamptz)
          AND (%(sport_key)s::text IS NULL OR p.sport_key = %(sport_key)s::text)
          AND (%(league_id)s::int IS NULL OR p.league_id = %(league_id)s::int)
          AND (%(season)s::int IS NULL OR p.season = %(season)s::int)
        ORDER BY p.event_id, p.captured_at_utc DESC NULLS LAST, p.updated_at_utc DESC NULLS LAST
        LIMIT %(max_rows)s
      )
      INSERT INTO odds.audit_result (
        event_id,
        fixture_id,
        league_id,
        season,
        kickoff_utc,
        result_1x2,
        home_goals,
        away_goals,
        finished_at_utc,
        updated_at_utc
      )
      SELECT
        event_id,
        fixture_id,
        league_id,
        season,
        kickoff_utc,
        CASE
          WHEN goals_home > goals_away THEN 'H'
          WHEN goals_home = goals_away THEN 'D'
          ELSE 'A'
        END AS result_1x2,
        goals_home,
        goals_away,
        now(),
        now()
      FROM picked
      ON CONFLICT (event_id)
      DO UPDATE SET
        fixture_id = EXCLUDED.fixture_id,
        league_id = EXCLUDED.league_id,
        season = EXCLUDED.season,
        kickoff_utc = EXCLUDED.kickoff_utc,
        result_1x2 = EXCLUDED.result_1x2,
        home_goals = EXCLUDED.home_goals,
        away_goals = EXCLUDED.away_goals,
        finished_at_utc = now(),
        updated_at_utc = now()
    """

    with pg_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                sql,
                {
                    "sport_key": sport_key,
                    "league_id": int(league_id) if league_id is not None else None,
                    "season": int(season) if season is not None else None,
                    "cutoff_utc": cutoff_utc,
                    "lookback_utc": lookback_utc,
                    "max_rows": int(max_rows),
                },
            )
            upserted = cur.rowcount if cur.rowcount is not None and cur.rowcount >= 0 else 0

        conn.commit()

    return {
        "ok": True,
        "sport_key": sport_key,
        "league_id": int(league_id) if league_id is not None else None,
        "season": int(season) if season is not None else None,
        "lookback_days": int(lookback_days) if lookback_days is not None else None,
        "finished_before_hours": int(finished_before_hours),
        "cutoff_utc": cutoff_utc.isoformat(),
        "lookback_utc": lookback_utc.isoformat() if lookback_utc is not None else None,
        "audit_results_upserted": int(upserted),
        "elapsed_ms": int((perf_counter() - t0) * 1000),
    }


def audit_sync_from_product_snapshots(
    *,
    sport_key: Optional[str] = None,
    league_id: Optional[int] = None,
    season: Optional[int] = None,
    lookback_days: Optional[int] = 60,
    finished_before_hours: int = 1,
    max_prediction_rows: int = 10000,
    max_result_rows: int = 10000,
) -> Dict[str, Any]:
    t0 = perf_counter()

    pred = sync_audit_predictions_from_product_snapshots(
        sport_key=sport_key,
        league_id=league_id,
        lookback_days=lookback_days,
        max_rows=max_prediction_rows,
    )

    res = sync_audit_results_from_core_fixtures(
        sport_key=sport_key,
        league_id=league_id,
        season=season,
        lookback_days=lookback_days,
        finished_before_hours=finished_before_hours,
        max_rows=max_result_rows,
    )

    return {
        "ok": bool(pred.get("ok")) and bool(res.get("ok")),
        "sport_key": sport_key,
        "league_id": int(league_id) if league_id is not None else None,
        "season": int(season) if season is not None else None,
        "lookback_days": int(lookback_days) if lookback_days is not None else None,
        "finished_before_hours": int(finished_before_hours),
        "audit_predictions_upserted": int(pred.get("audit_predictions_upserted") or 0),
        "audit_results_upserted": int(res.get("audit_results_upserted") or 0),
        "diagnostics": pred.get("diagnostics") or {},
        "steps": {
            "predictions": pred,
            "results": res,
        },
        "elapsed_ms": int((perf_counter() - t0) * 1000),
    }