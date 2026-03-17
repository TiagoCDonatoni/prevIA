# portable/backend/src/odds/fixture_candidates.py
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from src.db.pg import pg_conn


def _to_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        # se vier naive, assume UTC
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def fetch_candidate_fixtures(
    *,
    league_id: Optional[int],
    season: Optional[int],
    kickoff_utc: datetime,
    tol_hours: int = 6,
    limit: int = 60,
) -> List[Dict[str, Any]]:
    """
    Busca fixtures candidatos em core.fixtures para resolver odds_event -> fixture_id.
    Estratégia:
      - janela temporal kickoff_utc +/- tol_hours
      - filtra por league_id/season quando disponíveis (>0)
      - junta nomes de times (core.teams) para scoring no resolver
    """
    k = _to_utc(kickoff_utc)
    tol = int(tol_hours)
    start_utc = k - timedelta(hours=tol)
    end_utc = k + timedelta(hours=tol)

    # filtros opcionais (quando league_id/season não estão resolvidos ainda)
    league_ok = isinstance(league_id, int) and league_id > 0
    season_ok = isinstance(season, int) and season > 0

    sql = """
        SELECT
            f.fixture_id,
            f.league_id,
            f.season,
            f.kickoff_utc,
            f.home_team_id,
            th.name AS home_team_name,
            f.away_team_id,
            ta.name AS away_team_name,
            f.status_short
        FROM core.fixtures f
        JOIN core.teams th ON th.team_id = f.home_team_id
        JOIN core.teams ta ON ta.team_id = f.away_team_id
        WHERE f.kickoff_utc >= %(start_utc)s
          AND f.kickoff_utc <= %(end_utc)s
          AND (%(league_ok)s = FALSE OR f.league_id = %(league_id)s)
          AND (%(season_ok)s = FALSE OR f.season = %(season)s)
        ORDER BY ABS(EXTRACT(EPOCH FROM (f.kickoff_utc - %(kickoff_utc)s))) ASC
        LIMIT %(limit)s
    """

    params = {
        "start_utc": start_utc,
        "end_utc": end_utc,
        "kickoff_utc": k,
        "league_ok": league_ok,
        "league_id": int(league_id) if league_ok else 0,
        "season_ok": season_ok,
        "season": int(season) if season_ok else 0,
        "limit": int(limit),
    }

    with pg_conn() as conn, conn.cursor() as cur:
        cur.execute(sql, params)
        rows = cur.fetchall()

    out: List[Dict[str, Any]] = []
    for r in rows:
        out.append(
            {
                "fixture_id": r[0],
                "league_id": r[1],
                "season": r[2],
                "kickoff_utc": r[3],
                "home_team_id": r[4],
                "home_team_name": r[5],
                "away_team_id": r[6],
                "away_team_name": r[7],
                "status_short": r[8],
            }
        )
    return out