from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from src.db.pg import pg_conn
from src.models.one_x_two_logreg_v1 import predict_1x2_from_artifact


LOOKBACK_DAYS = 5


def market_probs_from_odds(odds_h: Optional[float], odds_d: Optional[float], odds_a: Optional[float]):
    vals = []
    for o in (odds_h, odds_d, odds_a):
        vals.append((1.0 / float(o)) if (o and float(o) > 0) else None)

    if all(v is None for v in vals):
        return None

    raw = {"H": vals[0], "D": vals[1], "A": vals[2]}
    s = sum(v for v in vals if v is not None)
    if s <= 0:
        return None

    return {k: (v / s if v is not None else None) for k, v in raw.items()}


def label_1x2(goals_home: int, goals_away: int) -> str:
    if goals_home > goals_away:
        return "H"
    if goals_home < goals_away:
        return "A"
    return "D"


def best_ev_and_side(p_model: Dict[str, float], odds_h, odds_d, odds_a):
    evs = {
        "H": (float(p_model["H"]) * float(odds_h) - 1.0) if odds_h else None,
        "D": (float(p_model["D"]) * float(odds_d) - 1.0) if odds_d else None,
        "A": (float(p_model["A"]) * float(odds_a) - 1.0) if odds_a else None,
    }
    best_side = None
    best_ev = None
    for side in ("H", "D", "A"):
        v = evs.get(side)
        if v is None:
            continue
        if best_ev is None or v > best_ev:
            best_ev = v
            best_side = side
    return best_side, best_ev


def main():
    now_utc = datetime.now(timezone.utc)
    start_utc = now_utc - timedelta(days=LOOKBACK_DAYS)

    with pg_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT COUNT(*)
                FROM odds.odds_league_map
                WHERE enabled = TRUE
                  AND mapping_status = 'approved'
                  AND artifact_filename IS NOT NULL
            """)
            print({"approved_enabled_with_artifact": cur.fetchone()[0]})

            cur.execute("""
                SELECT COUNT(*)
                FROM odds.odds_events
                WHERE commence_time_utc >= %(start_utc)s
                  AND commence_time_utc <= %(end_utc)s
            """, {"start_utc": start_utc, "end_utc": now_utc})
            print({"events_last_5d": cur.fetchone()[0]})

            cur.execute("""
                SELECT COUNT(*)
                FROM odds.odds_events
                WHERE commence_time_utc >= %(start_utc)s
                  AND commence_time_utc <= %(end_utc)s
                  AND resolved_fixture_id IS NOT NULL
            """, {"start_utc": start_utc, "end_utc": now_utc})
            print({"events_last_5d_with_resolved_fixture": cur.fetchone()[0]})

            cur.execute("""
                SELECT COUNT(DISTINCT e.event_id)
                FROM odds.odds_events e
                JOIN odds.odds_snapshots_1x2 s
                  ON s.event_id = e.event_id
                WHERE e.commence_time_utc >= %(start_utc)s
                  AND e.commence_time_utc <= %(end_utc)s
                  AND e.resolved_fixture_id IS NOT NULL
                  AND s.captured_at_utc <= e.commence_time_utc
            """, {"start_utc": start_utc, "end_utc": now_utc})
            print({"events_with_prematch_snapshot": cur.fetchone()[0]})

            cur.execute("""
                WITH approved AS (
                  SELECT sport_key, league_id, artifact_filename
                  FROM odds.odds_league_map
                  WHERE enabled = TRUE
                    AND mapping_status = 'approved'
                    AND artifact_filename IS NOT NULL
                ),
                latest_pre AS (
                  SELECT DISTINCT ON (e.event_id)
                    e.event_id,
                    e.sport_key,
                    e.commence_time_utc,
                    e.resolved_fixture_id,
                    s.captured_at_utc
                  FROM odds.odds_events e
                  JOIN approved a
                    ON a.sport_key = e.sport_key
                  JOIN odds.odds_snapshots_1x2 s
                    ON s.event_id = e.event_id
                  WHERE e.resolved_fixture_id IS NOT NULL
                    AND e.commence_time_utc >= %(start_utc)s
                    AND e.commence_time_utc <= %(end_utc)s
                    AND s.captured_at_utc <= e.commence_time_utc
                  ORDER BY e.event_id, s.captured_at_utc DESC
                )
                SELECT COUNT(*)
                FROM latest_pre lp
                JOIN core.fixtures f
                  ON f.fixture_id = lp.resolved_fixture_id
            """, {"start_utc": start_utc, "end_utc": now_utc})
            print({"rows_join_fixture": cur.fetchone()[0]})

            cur.execute("""
                WITH approved AS (
                  SELECT sport_key, league_id, artifact_filename
                  FROM odds.odds_league_map
                  WHERE enabled = TRUE
                    AND mapping_status = 'approved'
                    AND artifact_filename IS NOT NULL
                ),
                latest_pre AS (
                  SELECT DISTINCT ON (e.event_id)
                    e.event_id,
                    e.sport_key,
                    e.commence_time_utc,
                    e.resolved_fixture_id,
                    s.captured_at_utc
                  FROM odds.odds_events e
                  JOIN approved a
                    ON a.sport_key = e.sport_key
                  JOIN odds.odds_snapshots_1x2 s
                    ON s.event_id = e.event_id
                  WHERE e.resolved_fixture_id IS NOT NULL
                    AND e.commence_time_utc >= %(start_utc)s
                    AND e.commence_time_utc <= %(end_utc)s
                    AND s.captured_at_utc <= e.commence_time_utc
                  ORDER BY e.event_id, s.captured_at_utc DESC
                )
                SELECT COUNT(*)
                FROM latest_pre lp
                JOIN core.fixtures f
                  ON f.fixture_id = lp.resolved_fixture_id
                WHERE f.is_finished = TRUE
                  AND COALESCE(f.is_cancelled, FALSE) = FALSE
                  AND f.goals_home IS NOT NULL
                  AND f.goals_away IS NOT NULL
            """, {"start_utc": start_utc, "end_utc": now_utc})
            print({"rows_finished_with_goals": cur.fetchone()[0]})

            cur.execute("""
                WITH approved AS (
                  SELECT sport_key, league_id, artifact_filename
                  FROM odds.odds_league_map
                  WHERE enabled = TRUE
                    AND mapping_status = 'approved'
                    AND artifact_filename IS NOT NULL
                ),
                latest_pre AS (
                  SELECT DISTINCT ON (e.event_id)
                    e.event_id,
                    e.sport_key,
                    e.commence_time_utc,
                    e.resolved_fixture_id,
                    s.captured_at_utc
                  FROM odds.odds_events e
                  JOIN approved a
                    ON a.sport_key = e.sport_key
                  JOIN odds.odds_snapshots_1x2 s
                    ON s.event_id = e.event_id
                  WHERE e.resolved_fixture_id IS NOT NULL
                    AND e.commence_time_utc >= %(start_utc)s
                    AND e.commence_time_utc <= %(end_utc)s
                    AND s.captured_at_utc <= e.commence_time_utc
                  ORDER BY e.event_id, s.captured_at_utc DESC
                )
                SELECT COUNT(*)
                FROM latest_pre lp
                JOIN core.fixtures f
                  ON f.fixture_id = lp.resolved_fixture_id
                JOIN approved a
                  ON a.sport_key = lp.sport_key
                 AND a.league_id = f.league_id
                WHERE f.is_finished = TRUE
                  AND COALESCE(f.is_cancelled, FALSE) = FALSE
                  AND f.goals_home IS NOT NULL
                  AND f.goals_away IS NOT NULL
            """, {"start_utc": start_utc, "end_utc": now_utc})
            print({"rows_finished_with_goals_and_league_match": cur.fetchone()[0]})

            with pg_conn() as conn:
                with conn.cursor() as cur:
                    cur.execute("""
                        WITH approved AS (
                          SELECT sport_key, league_id, artifact_filename
                          FROM odds.odds_league_map
                          WHERE enabled = TRUE
                            AND mapping_status = 'approved'
                            AND artifact_filename IS NOT NULL
                        ),
                        latest_pre AS (
                          SELECT DISTINCT ON (e.event_id)
                            e.event_id,
                            e.sport_key,
                            e.commence_time_utc,
                            e.resolved_fixture_id
                          FROM odds.odds_events e
                          JOIN approved a
                            ON a.sport_key = e.sport_key
                          JOIN odds.odds_snapshots_1x2 s
                            ON s.event_id = e.event_id
                          WHERE e.resolved_fixture_id IS NOT NULL
                            AND e.commence_time_utc >= %(start_utc)s
                            AND e.commence_time_utc <= %(end_utc)s
                            AND s.captured_at_utc <= e.commence_time_utc
                          ORDER BY e.event_id, s.captured_at_utc DESC
                        )
                        SELECT
                          lp.event_id,
                          lp.resolved_fixture_id,
                          f.league_id,
                          f.season,
                          f.is_finished,
                          f.goals_home,
                          f.goals_away
                        FROM latest_pre lp
                        JOIN core.fixtures f
                          ON f.fixture_id = lp.resolved_fixture_id
                        ORDER BY lp.commence_time_utc DESC
                        LIMIT 20
                    """, {"start_utc": start_utc, "end_utc": now_utc})

                    for row in cur.fetchall():
                        print({"fixture_sample": row})

            cur.execute("""
                WITH approved AS (
                  SELECT sport_key, league_id, artifact_filename
                  FROM odds.odds_league_map
                  WHERE enabled = TRUE
                    AND mapping_status = 'approved'
                    AND artifact_filename IS NOT NULL
                ),
                latest_pre AS (
                  SELECT DISTINCT ON (e.event_id)
                    e.event_id,
                    e.sport_key,
                    e.commence_time_utc,
                    e.resolved_fixture_id,
                    s.captured_at_utc
                  FROM odds.odds_events e
                  JOIN approved a
                    ON a.sport_key = e.sport_key
                  JOIN odds.odds_snapshots_1x2 s
                    ON s.event_id = e.event_id
                  WHERE e.resolved_fixture_id IS NOT NULL
                    AND e.commence_time_utc >= %(start_utc)s
                    AND e.commence_time_utc <= %(end_utc)s
                    AND s.captured_at_utc <= e.commence_time_utc
                  ORDER BY e.event_id, s.captured_at_utc DESC
                )
                SELECT COUNT(*)
                FROM latest_pre lp
                JOIN core.fixtures f
                  ON f.fixture_id = lp.resolved_fixture_id
                JOIN approved a
                  ON a.sport_key = lp.sport_key
                 AND a.league_id = f.league_id
                WHERE f.is_finished = TRUE
                  AND COALESCE(f.is_cancelled, FALSE) = FALSE
                  AND f.goals_home IS NOT NULL
                  AND f.goals_away IS NOT NULL
            """, {"start_utc": start_utc, "end_utc": now_utc})
            print({"fully_eligible_rows": cur.fetchone()[0]})

    sql = """
      WITH approved AS (
        SELECT
          m.sport_key,
          m.league_id,
          m.artifact_filename
        FROM odds.odds_league_map m
        WHERE m.enabled = TRUE
          AND m.mapping_status = 'approved'
          AND m.artifact_filename IS NOT NULL
      ),
      latest_pre AS (
        SELECT DISTINCT ON (e.event_id)
          e.event_id,
          e.sport_key,
          e.commence_time_utc,
          e.home_name,
          e.away_name,
          e.resolved_fixture_id,
          e.resolved_home_team_id,
          e.resolved_away_team_id,
          e.match_confidence,
          s.bookmaker,
          s.market,
          s.odds_home,
          s.odds_draw,
          s.odds_away,
          s.captured_at_utc
        FROM odds.odds_events e
        JOIN approved a
          ON a.sport_key = e.sport_key
        JOIN odds.odds_snapshots_1x2 s
          ON s.event_id = e.event_id
        WHERE e.resolved_fixture_id IS NOT NULL
          AND e.commence_time_utc IS NOT NULL
          AND e.commence_time_utc >= %(start_utc)s
          AND e.commence_time_utc <= %(end_utc)s
          AND s.captured_at_utc <= e.commence_time_utc
        ORDER BY e.event_id, s.captured_at_utc DESC
      )
      SELECT
        lp.event_id,
        lp.sport_key,
        lp.commence_time_utc,
        lp.home_name,
        lp.away_name,
        lp.resolved_fixture_id,
        lp.resolved_home_team_id,
        lp.resolved_away_team_id,
        lp.match_confidence,
        lp.bookmaker,
        lp.market,
        lp.odds_home,
        lp.odds_draw,
        lp.odds_away,
        lp.captured_at_utc,
        f.league_id,
        f.season,
        f.home_team_id,
        f.away_team_id,
        f.goals_home,
        f.goals_away,
        a.artifact_filename
      FROM latest_pre lp
      JOIN core.fixtures f
        ON f.fixture_id = lp.resolved_fixture_id
      JOIN approved a
        ON a.sport_key = lp.sport_key
       AND a.league_id = f.league_id
      WHERE f.is_finished = TRUE
        AND COALESCE(f.is_cancelled, FALSE) = FALSE
        AND f.goals_home IS NOT NULL
        AND f.goals_away IS NOT NULL
      ORDER BY lp.commence_time_utc DESC
    """

    sql_upsert_pred = """
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
      VALUES (
        %(event_id)s,
        %(sport_key)s,
        %(kickoff_utc)s,
        %(captured_at_utc)s,
        %(bookmaker)s,
        %(market)s,
        %(league_id)s,
        %(season)s,
        %(fixture_id)s,
        %(home_team_id)s,
        %(away_team_id)s,
        %(match_confidence)s,
        %(artifact_filename)s,
        %(odds_h)s,
        %(odds_d)s,
        %(odds_a)s,
        %(p_mkt_h)s,
        %(p_mkt_d)s,
        %(p_mkt_a)s,
        %(p_model_h)s,
        %(p_model_d)s,
        %(p_model_a)s,
        %(best_side)s,
        %(best_ev)s,
        %(status)s,
        %(reason)s,
        now(),
        now()
      )
      ON CONFLICT (event_id, artifact_filename)
      DO UPDATE SET
        sport_key = EXCLUDED.sport_key,
        kickoff_utc = EXCLUDED.kickoff_utc,
        captured_at_utc = EXCLUDED.captured_at_utc,
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

    sql_upsert_result = """
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
      VALUES (
        %(event_id)s,
        %(fixture_id)s,
        %(league_id)s,
        %(season)s,
        %(kickoff_utc)s,
        %(result_1x2)s,
        %(home_goals)s,
        %(away_goals)s,
        now(),
        now()
      )
      ON CONFLICT (event_id) DO UPDATE SET
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

    processed = 0
    ok = 0
    errors = 0

    with pg_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, {"start_utc": start_utc, "end_utc": now_utc})
            rows = cur.fetchall()

        with conn.cursor() as cur:
            for row in rows:
                processed += 1
                (
                    event_id,
                    sport_key,
                    kickoff_utc,
                    home_name,
                    away_name,
                    fixture_id,
                    resolved_home_team_id,
                    resolved_away_team_id,
                    match_confidence,
                    bookmaker,
                    market,
                    odds_h,
                    odds_d,
                    odds_a,
                    captured_at_utc,
                    league_id,
                    season,
                    home_team_id,
                    away_team_id,
                    goals_home,
                    goals_away,
                    artifact_filename,
                ) = row

                try:
                    pred = predict_1x2_from_artifact(
                        artifact_filename=str(artifact_filename),
                        league_id=int(league_id),
                        season=int(season),
                        home_team_id=int(home_team_id),
                        away_team_id=int(away_team_id),
                    )
                    p_model = pred["probs"]
                    p_mkt = market_probs_from_odds(odds_h, odds_d, odds_a)
                    best_side, best_ev = best_ev_and_side(p_model, odds_h, odds_d, odds_a)
                    result_1x2 = label_1x2(int(goals_home), int(goals_away))

                    cur.execute(
                        sql_upsert_pred,
                        {
                            "event_id": str(event_id),
                            "sport_key": str(sport_key),
                            "kickoff_utc": kickoff_utc,
                            "captured_at_utc": captured_at_utc,
                            "bookmaker": bookmaker,
                            "market": market,
                            "league_id": int(league_id),
                            "season": int(season),
                            "fixture_id": int(fixture_id),
                            "home_team_id": int(home_team_id),
                            "away_team_id": int(away_team_id),
                            "match_confidence": str(match_confidence) if match_confidence is not None else None,
                            "artifact_filename": str(artifact_filename),
                            "odds_h": float(odds_h) if odds_h is not None else None,
                            "odds_d": float(odds_d) if odds_d is not None else None,
                            "odds_a": float(odds_a) if odds_a is not None else None,
                            "p_mkt_h": float(p_mkt["H"]) if p_mkt and p_mkt.get("H") is not None else None,
                            "p_mkt_d": float(p_mkt["D"]) if p_mkt and p_mkt.get("D") is not None else None,
                            "p_mkt_a": float(p_mkt["A"]) if p_mkt and p_mkt.get("A") is not None else None,
                            "p_model_h": float(p_model["H"]),
                            "p_model_d": float(p_model["D"]),
                            "p_model_a": float(p_model["A"]),
                            "best_side": best_side,
                            "best_ev": float(best_ev) if best_ev is not None else None,
                            "status": "ok",
                            "reason": None,
                        },
                    )

                    cur.execute(
                        sql_upsert_result,
                        {
                            "event_id": str(event_id),
                            "fixture_id": int(fixture_id),
                            "league_id": int(league_id),
                            "season": int(season),
                            "kickoff_utc": kickoff_utc,
                            "result_1x2": result_1x2,
                            "home_goals": int(goals_home),
                            "away_goals": int(goals_away),
                        },
                    )

                    ok += 1

                except Exception as e:
                    errors += 1
                    print(f"[ERR] fixture_id={fixture_id} event_id={event_id} artifact={artifact_filename}: {e}")

        conn.commit()

    print(
        {
            "ok": True,
            "lookback_days": LOOKBACK_DAYS,
            "processed": processed,
            "upserted_ok": ok,
            "errors": errors,
        }
    )


if __name__ == "__main__":
    main()