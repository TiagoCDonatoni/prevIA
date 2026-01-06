from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Optional

from src.db.pg import pg_conn, pg_tx


def _iter_response_items(raw_body: Any) -> Iterable[dict]:
    if not isinstance(raw_body, dict):
        return []
    resp = raw_body.get("response")
    if isinstance(resp, list):
        return [x for x in resp if isinstance(x, dict)]
    return []


def _parse_ts(value: Optional[str]) -> Optional[datetime]:
    if not value or not isinstance(value, str):
        return None
    s = value.strip()
    if not s:
        return None
    try:
        if s.endswith("Z"):
            s = s[:-1] + "+00:00"
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        return None


LEAGUES_UPSERT_SQL = """
insert into core.leagues (
  league_id, name, type, country_name, country_code,
  logo_url, flag_url, is_active, updated_at_utc
)
values (
  %(league_id)s, %(name)s, %(type)s, %(country_name)s, %(country_code)s,
  %(logo_url)s, %(flag_url)s, %(is_active)s, now()
)
on conflict (league_id) do update set
  name = excluded.name,
  type = excluded.type,
  country_name = excluded.country_name,
  country_code = excluded.country_code,
  logo_url = excluded.logo_url,
  flag_url = excluded.flag_url,
  is_active = excluded.is_active,
  updated_at_utc = now();
"""

TEAMS_UPSERT_SQL = """
insert into core.teams (
  team_id, name, code, country_name, founded_year, is_national, logo_url,
  venue_id, venue_name, venue_city, venue_capacity,
  updated_at_utc
)
values (
  %(team_id)s, %(name)s, %(code)s, %(country_name)s, %(founded_year)s, %(is_national)s, %(logo_url)s,
  %(venue_id)s, %(venue_name)s, %(venue_city)s, %(venue_capacity)s,
  now()
)
on conflict (team_id) do update set
  name = excluded.name,
  code = excluded.code,
  country_name = excluded.country_name,
  founded_year = excluded.founded_year,
  is_national = excluded.is_national,
  logo_url = excluded.logo_url,
  venue_id = excluded.venue_id,
  venue_name = excluded.venue_name,
  venue_city = excluded.venue_city,
  venue_capacity = excluded.venue_capacity,
  updated_at_utc = now();
"""

FIXTURES_UPSERT_SQL = """
insert into core.fixtures (
  fixture_id, league_id, season, round,
  kickoff_utc, timezone, venue_name, venue_city,
  home_team_id, away_team_id,
  status_long, status_short, elapsed_min,
  goals_home, goals_away,
  is_finished, is_cancelled,
  updated_at_utc
)
values (
  %(fixture_id)s, %(league_id)s, %(season)s, %(round)s,
  %(kickoff_utc)s, %(timezone)s, %(venue_name)s, %(venue_city)s,
  %(home_team_id)s, %(away_team_id)s,
  %(status_long)s, %(status_short)s, %(elapsed_min)s,
  %(goals_home)s, %(goals_away)s,
  %(is_finished)s, %(is_cancelled)s,
  now()
)
on conflict (fixture_id) do update set
  league_id = excluded.league_id,
  season = excluded.season,
  round = excluded.round,
  kickoff_utc = excluded.kickoff_utc,
  timezone = excluded.timezone,
  venue_name = excluded.venue_name,
  venue_city = excluded.venue_city,
  home_team_id = excluded.home_team_id,
  away_team_id = excluded.away_team_id,
  status_long = excluded.status_long,
  status_short = excluded.status_short,
  elapsed_min = excluded.elapsed_min,
  goals_home = excluded.goals_home,
  goals_away = excluded.goals_away,
  is_finished = excluded.is_finished,
  is_cancelled = excluded.is_cancelled,
  updated_at_utc = now();
"""


def map_league(item: dict) -> Optional[dict]:
    league = item.get("league") or {}
    country = item.get("country") or {}

    league_id = league.get("id")
    name = league.get("name")
    if league_id is None or not name:
        return None

    return {
        "league_id": int(league_id),
        "name": str(name),
        "type": league.get("type"),
        "country_name": country.get("name") or item.get("country"),
        "country_code": country.get("code"),
        "logo_url": league.get("logo"),
        "flag_url": country.get("flag"),
        "is_active": True,
    }


def map_team(item: dict) -> Optional[dict]:
    team = item.get("team") or {}
    venue = item.get("venue") or {}

    team_id = team.get("id")
    name = team.get("name")
    if team_id is None or not name:
        return None

    return {
        "team_id": int(team_id),
        "name": str(name),
        "code": team.get("code"),
        "country_name": team.get("country"),
        "founded_year": team.get("founded"),
        "is_national": team.get("national"),
        "logo_url": team.get("logo"),
        "venue_id": venue.get("id"),
        "venue_name": venue.get("name"),
        "venue_city": venue.get("city"),
        "venue_capacity": venue.get("capacity"),
    }


def map_fixture(item: dict) -> Optional[dict]:
    fixture = item.get("fixture") or {}
    league = item.get("league") or {}
    teams = item.get("teams") or {}
    goals = item.get("goals") or {}
    status = (fixture.get("status") or {})

    fixture_id = fixture.get("id")
    league_id = league.get("id")
    season = league.get("season")
    home_id = (teams.get("home") or {}).get("id")
    away_id = (teams.get("away") or {}).get("id")

    kickoff_dt = _parse_ts(fixture.get("date"))

    if None in (fixture_id, league_id, season, home_id, away_id) or kickoff_dt is None:
        return None

    status_short = status.get("short")
    is_finished = status_short in ("FT", "AET", "PEN")
    is_cancelled = status_short in ("CANC", "PST")

    venue = fixture.get("venue") or {}

    return {
        "fixture_id": int(fixture_id),
        "league_id": int(league_id),
        "season": int(season),
        "round": league.get("round"),
        "kickoff_utc": kickoff_dt,
        "timezone": fixture.get("timezone"),
        "venue_name": venue.get("name"),
        "venue_city": venue.get("city"),
        "home_team_id": int(home_id),
        "away_team_id": int(away_id),
        "status_long": status.get("long"),
        "status_short": status_short,
        "elapsed_min": status.get("elapsed"),
        "goals_home": goals.get("home"),
        "goals_away": goals.get("away"),
        "is_finished": bool(is_finished),
        "is_cancelled": bool(is_cancelled),
    }


def _load_raw_bodies(*, provider: str, endpoint: str, limit: int) -> List[dict]:
    sql = """
    select response_body
    from raw.api_responses
    where provider = %(provider)s
      and endpoint = %(endpoint)s
      and ok = true
    order by fetched_at_utc desc
    limit %(limit)s
    """
    with pg_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, {"provider": provider, "endpoint": endpoint, "limit": limit})
            return [r[0] for r in cur.fetchall()]


def _apply_upserts(upsert_sql: str, rows: List[dict]) -> int:
    if not rows:
        return 0
    with pg_conn() as conn:
        with pg_tx(conn):
            with conn.cursor() as cur:
                n = 0
                for r in rows:
                    cur.execute(upsert_sql, r)
                    n += 1
                return n

def run_core_etl(*, provider: str, endpoint: str, limit: int, league_ids: Optional[List[int]] = None) -> Dict[str, int]:
    bodies = _load_raw_bodies(provider=provider, endpoint=endpoint, limit=limit)

    if endpoint == "leagues":
        mapped = [map_league(it) for b in bodies for it in _iter_response_items(b)]
        mapped = [m for m in mapped if m is not None]

        if league_ids:
            allow = set(int(x) for x in league_ids)
            mapped = [m for m in mapped if int(m["league_id"]) in allow]

        upserts = _apply_upserts(LEAGUES_UPSERT_SQL, mapped)
        return {"raw_rows": len(bodies), "items": len(mapped), "upserts": upserts}

    if endpoint == "teams":
        mapped = [map_team(it) for b in bodies for it in _iter_response_items(b)]
        mapped = [m for m in mapped if m is not None]
        upserts = _apply_upserts(TEAMS_UPSERT_SQL, mapped)
        return {"raw_rows": len(bodies), "items": len(mapped), "upserts": upserts}

    if endpoint == "fixtures":
        mapped = [map_fixture(it) for b in bodies for it in _iter_response_items(b)]
        mapped = [m for m in mapped if m is not None]
        upserts = _apply_upserts(FIXTURES_UPSERT_SQL, mapped)
        return {"raw_rows": len(bodies), "items": len(mapped), "upserts": upserts}

    raise ValueError("endpoint must be one of: leagues|teams|fixtures")
