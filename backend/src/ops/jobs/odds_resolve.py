from __future__ import annotations

from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

from src.db.pg import pg_conn
from src.odds.matchup_resolver import resolve_odds_event


def _pick_season_for_league(conn, league_id: int, season_policy: str, fixed_season: Optional[int]) -> int:
    """
    Política de season sem hardcode:
    - fixed: usa fixed_season
    - current: usa max(season) existente no core.fixtures para a liga
    - by_kickoff_year: fallback pro 'current' aqui (refinamos depois quando tivermos kickoff->season robusto)
    """
    if season_policy == "fixed":
        if not fixed_season:
            raise ValueError("season_policy='fixed' requires fixed_season")
        return int(fixed_season)

    # current / by_kickoff_year (v1): usa max season existente
    sql = "select coalesce(max(season), extract(year from now())::int) from core.fixtures where league_id = %(lid)s"
    with conn.cursor() as cur:
        cur.execute(sql, {"lid": int(league_id)})
        row = cur.fetchone()
        return int(row[0]) if row and row[0] else datetime.now(timezone.utc).year


def odds_resolve_batch(
    *,
    sport_key: str,
    assume_league_id: int,
    season_policy: str = "current",
    fixed_season: Optional[int] = None,
    tol_hours: int = 6,
    hours_ahead: int = 720,
    limit: int = 500,
) -> Dict[str, Any]:
    """
    Job cron-ready:
    - pega odds.odds_events no window
    - resolve para fixture_id preenchendo match_status/match_score/etc. via resolve_odds_event
    """
    now = datetime.now(timezone.utc)
    end = now + timedelta(hours=int(hours_ahead))

    counters = {
        "events_scanned": 0,
        "exact": 0,
        "probable": 0,
        "ambiguous": 0,
        "not_found": 0,
        "errors": 0,
    }
    sample_issues: List[Dict[str, Any]] = []

    with pg_conn() as conn:
        conn.autocommit = False

        season = _pick_season_for_league(conn, int(assume_league_id), season_policy, fixed_season)

        sql_pick = """
          select event_id, sport_key, commence_time_utc, home_name, away_name
          from odds.odds_events
          where sport_key = %(sport_key)s
            and commence_time_utc >= %(now)s
            and commence_time_utc <= %(end)s
          order by commence_time_utc asc
          limit %(limit)s
        """

        with conn.cursor() as cur:
            cur.execute(sql_pick, {"sport_key": sport_key, "now": now, "end": end, "limit": int(limit)})
            rows = cur.fetchall()

        for r in rows:
            counters["events_scanned"] += 1
            event = {
                "event_id": str(r[0]),
                "sport_key": str(r[1]),
                "kickoff_utc": r[2].isoformat() if hasattr(r[2], "isoformat") else str(r[2]),
                "home_name": r[3],
                "away_name": r[4],
            }

            try:
                out = resolve_odds_event(
                    conn,
                    event_id=event["event_id"],
                    kickoff_utc_iso=event.get("kickoff_utc"),
                    home_name=event.get("home_name"),
                    away_name=event.get("away_name"),
                    assume_league_id=int(assume_league_id),
                    assume_season=int(season),
                    tol_hours=int(tol_hours),
                )

                # ResolveResult usa "status" (EXACT/PROBABLE/AMBIGUOUS/NOT_FOUND/...)
                mt = getattr(out, "status", None) or "NOT_FOUND"

                if mt == "EXACT":
                    counters["exact"] += 1
                elif mt == "PROBABLE":
                    counters["probable"] += 1
                elif mt == "AMBIGUOUS":
                    counters["ambiguous"] += 1
                else:
                    counters["not_found"] += 1
            except Exception as e:
                counters["errors"] += 1
                if len(sample_issues) < 20:
                    sample_issues.append({"event_id": event["event_id"], "error": str(e)})

        conn.commit()

    return {
        "ok": True,
        "sport_key": sport_key,
        "assume_league_id": int(assume_league_id),
        "season": int(season),
        "season_policy": season_policy,
        "fixed_season": fixed_season,
        "tol_hours": int(tol_hours),
        "window_hours": int(hours_ahead),
        "limit": int(limit),
        "counters": counters,
        "sample_issues": sample_issues,
    }