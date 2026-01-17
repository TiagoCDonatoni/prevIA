from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Query, HTTPException

from src.db.pg import pg_conn

router = APIRouter(prefix="/admin", tags=["admin"])


# -----------------------------
# /admin/teams
# -----------------------------
@router.get("/teams")
def admin_search_teams(
    q: str = Query(default="", max_length=80),
    limit: int = Query(default=20, ge=1, le=50),
) -> List[Dict[str, Any]]:
    qq = (q or "").strip()

    sql = """
      SELECT
        t.team_id,
        t.name,
        t.country_name AS country
      FROM core.teams t
      WHERE (%(q)s = '' OR t.name ILIKE %(pattern)s)
      ORDER BY t.name ASC
      LIMIT %(limit)s
    """

    params = {"q": qq, "pattern": f"%{qq}%", "limit": limit}

    try:
        with pg_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(sql, params)
                rows = cur.fetchall()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    out: List[Dict[str, Any]] = []
    for team_id, name, country in rows:
        item = {"team_id": int(team_id), "name": str(name)}
        if country:
            item["country"] = str(country)
        out.append(item)
    return out


# -----------------------------
# /admin/fixtures/upcoming
# -----------------------------
@router.get("/fixtures/upcoming")
def admin_upcoming_fixtures(
    team_id: Optional[int] = Query(default=None, ge=1),
    days_ahead: int = Query(default=14, ge=1, le=60),
    include_finished: bool = Query(default=False),
    include_cancelled: bool = Query(default=False),
    limit: int = Query(default=50, ge=1, le=200),
) -> List[Dict[str, Any]]:
    now_utc = datetime.now(timezone.utc)
    end_utc = now_utc + timedelta(days=days_ahead)

    sql = """
      SELECT
        f.fixture_id,
        f.kickoff_utc,
        f.league_id,
        f.season,
        f."round" AS round_txt,
        f.home_team_id,
        ht.name AS home_team_name,
        f.away_team_id,
        at.name AS away_team_name,
        f.is_finished,
        f.is_cancelled
      FROM core.fixtures f
      JOIN core.teams ht ON ht.team_id = f.home_team_id
      JOIN core.teams at ON at.team_id = f.away_team_id
      WHERE f.kickoff_utc >= %(now)s
        AND f.kickoff_utc < %(end)s
        AND (
          CAST(%(team_id)s AS integer) IS NULL
          OR f.home_team_id = CAST(%(team_id)s AS integer)
          OR f.away_team_id = CAST(%(team_id)s AS integer)
        )
        AND (%(include_finished)s = TRUE OR f.is_finished = FALSE)
        AND (%(include_cancelled)s = TRUE OR f.is_cancelled = FALSE)
      ORDER BY f.kickoff_utc ASC
      LIMIT %(limit)s
    """

    params = {
        "now": now_utc,
        "end": end_utc,
        "team_id": team_id,
        "include_finished": include_finished,
        "include_cancelled": include_cancelled,
        "limit": limit,
    }

    try:
        with pg_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(sql, params)
                rows = cur.fetchall()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    out: List[Dict[str, Any]] = []
    for (
        fixture_id,
        kickoff_utc,
        league_id,
        season,
        round_txt,
        home_team_id,
        home_team_name,
        away_team_id,
        away_team_name,
        is_finished,
        is_cancelled,
    ) in rows:
        out.append(
            {
                "fixture_id": int(fixture_id),
                "kickoff_utc": kickoff_utc.isoformat().replace("+00:00", "Z") if kickoff_utc else None,
                "league_id": int(league_id) if league_id is not None else None,
                "season": int(season) if season is not None else None,
                "round": round_txt,
                "home_team": {"team_id": int(home_team_id), "name": str(home_team_name)},
                "away_team": {"team_id": int(away_team_id), "name": str(away_team_name)},
                "is_finished": bool(is_finished),
                "is_cancelled": bool(is_cancelled),
            }
        )
    return out


# -----------------------------
# /admin/team/summary
# -----------------------------
@router.get("/team/summary")
def admin_team_summary(
    team_id: int = Query(..., ge=1),
    season: Optional[int] = Query(default=None, ge=1900, le=2100),
    last_n: int = Query(default=20, ge=5, le=200),
) -> Dict[str, Any]:
    team_sql = """
      SELECT
        team_id, name, country_name, is_national, logo_url,
        venue_name, venue_city, venue_capacity
      FROM core.teams
      WHERE team_id = %(team_id)s
      LIMIT 1
    """

    agg_sql = """
      WITH base AS (
        SELECT
          f.fixture_id,
          f.kickoff_utc,
          f.league_id,
          f.season,
          f."round" AS round_txt,
          f.home_team_id,
          f.away_team_id,
          f.goals_home,
          f.goals_away
        FROM core.fixtures f
        WHERE f.is_finished = TRUE
          AND f.is_cancelled = FALSE
          AND (f.goals_home IS NOT NULL AND f.goals_away IS NOT NULL)
          AND (f.home_team_id = %(team_id)s OR f.away_team_id = %(team_id)s)
          AND (CAST(%(season)s AS integer) IS NULL OR f.season = CAST(%(season)s AS integer))
      ),
      enriched AS (
        SELECT
          *,
          CASE WHEN home_team_id = %(team_id)s THEN 'H' ELSE 'A' END AS ha,
          CASE WHEN home_team_id = %(team_id)s THEN goals_home ELSE goals_away END AS gf,
          CASE WHEN home_team_id = %(team_id)s THEN goals_away ELSE goals_home END AS ga,
          CASE
            WHEN (home_team_id = %(team_id)s AND goals_home > goals_away)
              OR (away_team_id = %(team_id)s AND goals_away > goals_home) THEN 'W'
            WHEN goals_home = goals_away THEN 'D'
            ELSE 'L'
          END AS result
        FROM base
      )
      SELECT
        COUNT(*)::int AS matches,
        SUM(CASE WHEN ha='H' THEN 1 ELSE 0 END)::int AS matches_home,
        SUM(CASE WHEN ha='A' THEN 1 ELSE 0 END)::int AS matches_away,

        SUM(CASE WHEN result='W' THEN 1 ELSE 0 END)::int AS wins,
        SUM(CASE WHEN result='D' THEN 1 ELSE 0 END)::int AS draws,
        SUM(CASE WHEN result='L' THEN 1 ELSE 0 END)::int AS losses,

        SUM(gf)::int AS goals_for,
        SUM(ga)::int AS goals_against,

        SUM(CASE WHEN result='W' THEN 3 WHEN result='D' THEN 1 ELSE 0 END)::int AS points,

        SUM(CASE WHEN ha='H' AND result='W' THEN 1 ELSE 0 END)::int AS home_w,
        SUM(CASE WHEN ha='H' AND result='D' THEN 1 ELSE 0 END)::int AS home_d,
        SUM(CASE WHEN ha='H' AND result='L' THEN 1 ELSE 0 END)::int AS home_l,
        SUM(CASE WHEN ha='H' THEN gf ELSE 0 END)::int AS home_gf,
        SUM(CASE WHEN ha='H' THEN ga ELSE 0 END)::int AS home_ga,

        SUM(CASE WHEN ha='A' AND result='W' THEN 1 ELSE 0 END)::int AS away_w,
        SUM(CASE WHEN ha='A' AND result='D' THEN 1 ELSE 0 END)::int AS away_d,
        SUM(CASE WHEN ha='A' AND result='L' THEN 1 ELSE 0 END)::int AS away_l,
        SUM(CASE WHEN ha='A' THEN gf ELSE 0 END)::int AS away_gf,
        SUM(CASE WHEN ha='A' THEN ga ELSE 0 END)::int AS away_ga
      FROM enriched
    """

    last_sql = """
      WITH base AS (
        SELECT
          f.fixture_id,
          f.kickoff_utc,
          f.league_id,
          f.season,
          f."round" AS round_txt,
          f.home_team_id,
          ht.name AS home_team_name,
          f.away_team_id,
          at.name AS away_team_name,
          f.goals_home,
          f.goals_away
        FROM core.fixtures f
        JOIN core.teams ht ON ht.team_id = f.home_team_id
        JOIN core.teams at ON at.team_id = f.away_team_id
        WHERE f.is_finished = TRUE
          AND f.is_cancelled = FALSE
          AND (f.goals_home IS NOT NULL AND f.goals_away IS NOT NULL)
          AND (f.home_team_id = %(team_id)s OR f.away_team_id = %(team_id)s)
          AND (CAST(%(season)s AS integer) IS NULL OR f.season = CAST(%(season)s AS integer))
        ORDER BY f.kickoff_utc DESC
        LIMIT %(last_n)s
      )
      SELECT * FROM base
      ORDER BY kickoff_utc ASC
    """

    params = {"team_id": team_id, "season": season, "last_n": last_n}

    try:
        with pg_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(team_sql, {"team_id": team_id})
                team_row = cur.fetchone()
                if not team_row:
                    raise HTTPException(status_code=404, detail="team not found")

                (
                    _team_id, name, country_name, is_national, logo_url,
                    venue_name, venue_city, venue_capacity
                ) = team_row

                cur.execute(agg_sql, params)
                agg = cur.fetchone()

                if not agg:
                    # no finished matches
                    agg = (0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0)

                (
                    matches, matches_home, matches_away,
                    wins, draws, losses,
                    goals_for, goals_against,
                    points,
                    home_w, home_d, home_l, home_gf, home_ga,
                    away_w, away_d, away_l, away_gf, away_ga
                ) = agg

                cur.execute(last_sql, params)
                last_rows = cur.fetchall()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    def safe_div(a: int, b: int) -> float:
        return float(a) / float(b) if b else 0.0

    last_matches: List[Dict[str, Any]] = []
    for (
        fixture_id,
        kickoff_utc,
        league_id,
        season_i,
        round_txt,
        home_team_id,
        home_team_name,
        away_team_id,
        away_team_name,
        goals_home,
        goals_away,
    ) in last_rows:
        if home_team_id == team_id:
            gf = goals_home
            ga = goals_away
        else:
            gf = goals_away
            ga = goals_home

        if gf > ga:
            res = "W"
        elif gf == ga:
            res = "D"
        else:
            res = "L"

        last_matches.append(
            {
                "fixture_id": int(fixture_id),
                "kickoff_utc": kickoff_utc.isoformat().replace("+00:00", "Z") if kickoff_utc else None,
                "league_id": int(league_id) if league_id is not None else None,
                "season": int(season_i) if season_i is not None else None,
                "round": round_txt,
                "home_team": {"team_id": int(home_team_id), "name": str(home_team_name)},
                "away_team": {"team_id": int(away_team_id), "name": str(away_team_name)},
                "goals_home": int(goals_home) if goals_home is not None else None,
                "goals_away": int(goals_away) if goals_away is not None else None,
                "team_result": res,
                "team_gf": int(gf) if gf is not None else None,
                "team_ga": int(ga) if ga is not None else None,
            }
        )

    return {
        "team": {
            "team_id": int(_team_id),
            "name": str(name),
            "country": str(country_name) if country_name else None,
            "is_national": bool(is_national),
            "logo_url": str(logo_url) if logo_url else None,
            "venue": {
                "name": str(venue_name) if venue_name else None,
                "city": str(venue_city) if venue_city else None,
                "capacity": int(venue_capacity) if venue_capacity is not None else None,
            },
        },
        "filters": {"season": season, "last_n": last_n},
        "stats": {
            "matches": int(matches),
            "matches_home": int(matches_home),
            "matches_away": int(matches_away),
            "wins": int(wins),
            "draws": int(draws),
            "losses": int(losses),
            "goals_for": int(goals_for),
            "goals_against": int(goals_against),
            "points": int(points),
            "ppg": safe_div(points, matches),
            "avg_goals_for": safe_div(goals_for, matches),
            "avg_goals_against": safe_div(goals_against, matches),
        },
        "splits": {
            "home": {"w": int(home_w), "d": int(home_d), "l": int(home_l), "gf": int(home_gf), "ga": int(home_ga)},
            "away": {"w": int(away_w), "d": int(away_d), "l": int(away_l), "gf": int(away_gf), "ga": int(away_ga)},
        },
        "last_matches": last_matches,
    }

@router.get("/teams/list")
def admin_list_teams(
    limit: int = Query(default=300, ge=1, le=2000),
    offset: int = Query(default=0, ge=0, le=200000),
) -> List[Dict[str, Any]]:
    """
    List teams (paged). For Admin convenience.
    """
    sql = """
      SELECT team_id, name, country_name
      FROM core.teams
      ORDER BY name ASC
      LIMIT %(limit)s OFFSET %(offset)s
    """
    params = {"limit": limit, "offset": offset}

    with pg_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            rows = cur.fetchall()

    out: List[Dict[str, Any]] = []
    for team_id, name, country_name in rows:
        out.append(
            {
                "team_id": int(team_id),
                "name": str(name),
                "country": str(country_name) if country_name else None,
            }
        )
    return out

@router.get("/metrics/overview")
def admin_metrics_overview() -> Dict[str, Any]:
    """
    High-level DB coverage metrics for Admin Dashboard.
    Uses only your confirmed schema: core.teams, core.fixtures.
    """
    sql = """
      SELECT
        (SELECT COUNT(*) FROM core.teams) AS teams,
        (SELECT COUNT(*) FROM core.fixtures) AS fixtures_total,
        (SELECT COUNT(*) FROM core.fixtures WHERE is_finished = TRUE) AS fixtures_finished,
        (SELECT COUNT(*) FROM core.fixtures WHERE is_cancelled = TRUE) AS fixtures_cancelled,
        (SELECT COUNT(DISTINCT league_id) FROM core.fixtures WHERE league_id IS NOT NULL) AS leagues,
        (SELECT MIN(kickoff_utc) FROM core.fixtures) AS kickoff_min,
        (SELECT MAX(kickoff_utc) FROM core.fixtures) AS kickoff_max
    """
    with pg_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql)
            (teams, fixtures_total, fixtures_finished, fixtures_cancelled, leagues, kickoff_min, kickoff_max) = cur.fetchone()

    return {
        "teams": int(teams),
        "fixtures_total": int(fixtures_total),
        "fixtures_finished": int(fixtures_finished),
        "fixtures_cancelled": int(fixtures_cancelled),
        "leagues": int(leagues),
        "kickoff_min_utc": kickoff_min.isoformat().replace("+00:00", "Z") if kickoff_min else None,
        "kickoff_max_utc": kickoff_max.isoformat().replace("+00:00", "Z") if kickoff_max else None,
    }

from typing import Any, Dict, List, Optional
from fastapi import Query

@router.get("/metrics/artifacts")
def admin_metrics_artifacts(
    league_id: Optional[int] = Query(default=None, ge=1),
    season: Optional[int] = Query(default=None, ge=1900, le=2100),
    limit: int = Query(default=50, ge=1, le=200),
    sort: str = Query(default="brier", pattern="^(brier|logloss|top1_acc|created_at_utc)$"),
    order: str = Query(default="asc", pattern="^(asc|desc)$"),
) -> List[Dict[str, Any]]:
    """
    Returns latest metrics snapshot per (artifact_id, league_id, season).
    Default: sorted by brier asc.
    """
    sort_sql = {
        "brier": "brier",
        "logloss": "logloss",
        "top1_acc": "top1_acc",
        "created_at_utc": "created_at_utc",
    }[sort]
    order_sql = "ASC" if order.lower() == "asc" else "DESC"

    sql = f"""
      SELECT
        artifact_id,
        league_id,
        season,
        n_games,
        brier,
        logloss,
        top1_acc,
        eval_from_utc,
        eval_to_utc,
        notes,
        created_at_utc
      FROM core.v_artifact_metrics_latest
      WHERE (%(league_id)s IS NULL OR league_id = %(league_id)s)
        AND (%(season)s IS NULL OR season = %(season)s)
      ORDER BY {sort_sql} {order_sql}
      LIMIT %(limit)s
    """

    params = {
        "league_id": league_id,
        "season": season,
        "limit": limit,
    }

    with pg_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            rows = cur.fetchall()

    out: List[Dict[str, Any]] = []
    for (
        artifact_id,
        league_id_db,
        season_db,
        n_games,
        brier,
        logloss,
        top1_acc,
        eval_from_utc,
        eval_to_utc,
        notes,
        created_at_utc,
    ) in rows:
        out.append(
            {
                "artifact_id": artifact_id,
                "league_id": int(league_id_db) if league_id_db is not None else None,
                "season": int(season_db) if season_db is not None else None,
                "n_games": int(n_games),
                "brier": float(brier),
                "logloss": float(logloss),
                "top1_acc": float(top1_acc),
                "eval_from_utc": eval_from_utc.isoformat() if eval_from_utc else None,
                "eval_to_utc": eval_to_utc.isoformat() if eval_to_utc else None,
                "notes": notes,
                "created_at_utc": created_at_utc.isoformat() if created_at_utc else None,
            }
        )
    return out

from typing import Any, Dict, List, Optional, Tuple
import re
import unicodedata
from fastapi import APIRouter, Query, HTTPException

from src.db.pg import pg_conn

router = APIRouter(prefix="/admin/odds", tags=["admin-odds"])

_STOPWORDS = {
    "fc", "cf", "sc", "ac", "afc", "cfc", "the", "club", "de", "da", "do", "and", "&"
}

def _norm_name(s: str) -> str:
    s = (s or "").strip().lower()
    s = unicodedata.normalize("NFKD", s)
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    s = re.sub(r"[^a-z0-9\s]", " ", s)
    parts = [p for p in s.split() if p and p not in _STOPWORDS]
    return " ".join(parts).strip()

def _find_team_id(conn, raw_name: str, limit_suggestions: int = 5) -> Tuple[Optional[int], str, List[Dict[str, Any]]]:
    """
    Returns (team_id, match_type, suggestions[])
    match_type: EXACT | ILIKE | NONE
    """
    name_norm = _norm_name(raw_name)
    if not name_norm:
        return None, "NONE", []

    # 1) EXACT match (normalized vs normalized in SQL)
    # We don't have a normalized column, so do best-effort: exact on lower(name)
    sql_exact = """
      SELECT team_id, name, country_name
      FROM core.teams
      WHERE lower(name) = %(n)s
      LIMIT 1
    """
    with conn.cursor() as cur:
        cur.execute(sql_exact, {"n": raw_name.strip().lower()})
        row = cur.fetchone()
        if row:
            return int(row[0]), "EXACT", []

    # 2) ILIKE contains (fast with pg_trgm index on name)
    # Use the normalized tokens as pattern, but against raw "name"
    # Pattern: all tokens must appear somewhere (AND)
    tokens = [t for t in name_norm.split() if t]
    if not tokens:
        return None, "NONE", []

    where = " AND ".join([f"lower(name) ILIKE %(t{i})s" for i in range(len(tokens))])
    params = {f"t{i}": f"%{tok}%" for i, tok in enumerate(tokens)}

    sql_like = f"""
      SELECT team_id, name, country_name
      FROM core.teams
      WHERE {where}
      ORDER BY similarity(name, %(q)s) DESC NULLS LAST, name ASC
      LIMIT {limit_suggestions}
    """
    params["q"] = raw_name

    with conn.cursor() as cur:
        cur.execute(sql_like, params)
        rows = cur.fetchall()

    if not rows:
        return None, "NONE", []

    # If top result is very likely, return it as match
    best_id = int(rows[0][0])
    suggestions = [{"team_id": int(r[0]), "name": str(r[1]), "country": (str(r[2]) if r[2] else None)} for r in rows]
    return best_id, "ILIKE", suggestions


@router.get("/resolve")
def resolve_odds_teams(
    home_name: str = Query(..., min_length=2),
    away_name: str = Query(..., min_length=2),
) -> Dict[str, Any]:
    try:
        with pg_conn() as conn:
            home_id, home_type, home_sugg = _find_team_id(conn, home_name)
            away_id, away_type, away_sugg = _find_team_id(conn, away_name)

        return {
            "input": {"home_name": home_name, "away_name": away_name},
            "home": {"team_id": home_id, "match_type": home_type, "suggestions": home_sugg},
            "away": {"team_id": away_id, "match_type": away_type, "suggestions": away_sugg},
            "ok": bool(home_id and away_id),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
