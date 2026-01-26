from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional, Tuple, Literal

import re
import unicodedata

from fastapi import APIRouter, Query, HTTPException

from src.db.pg import pg_conn

from src.models.one_x_two_logreg_v1 import predict_1x2_from_artifact

from src.core.settings import load_settings
from src.provider.apifootball.client import ApiFootballClient
from src.etl.raw_ingest_pg import insert_raw_response
from src.etl.core_etl_pg import run_core_etl

admin_router = APIRouter(prefix="/admin", tags=["admin"])
admin_odds_router = APIRouter(prefix="/admin/odds", tags=["admin-odds"])

# --- AUDIT (reliability) helpers ---

import math
from datetime import datetime, timezone, timedelta

def _artifact_filename_from_id(artifact_id: str) -> str:
    a = (artifact_id or "").strip()
    if not a:
        raise HTTPException(status_code=400, detail="artifact_id is required")
    return a if a.endswith(".json") else f"{a}.json"


def _label_1x2(home_goals: int, away_goals: int) -> str:
    if home_goals > away_goals:
        return "H"
    if home_goals == away_goals:
        return "D"
    return "A"

def _safe_log(x: float, eps: float = 1e-15) -> float:
    return math.log(max(min(x, 1.0 - eps), eps))

def _brier_3(pH: float, pD: float, pA: float, y: str) -> float:
    yH = 1.0 if y == "H" else 0.0
    yD = 1.0 if y == "D" else 0.0
    yA = 1.0 if y == "A" else 0.0
    return (pH - yH) ** 2 + (pD - yD) ** 2 + (pA - yA) ** 2

def _logloss_3(pH: float, pD: float, pA: float, y: str) -> float:
    p = {"H": pH, "D": pD, "A": pA}.get(y, 0.0)
    return -_safe_log(p)

def _top1(pH: float, pD: float, pA: float) -> str:
    m = max((pH, "H"), (pD, "D"), (pA, "A"), key=lambda t: t[0])
    return m[1]

# -----------------------------
# /admin/teams
# -----------------------------
@admin_router.get("/teams")
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
@admin_router.get("/fixtures/upcoming")
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
@admin_router.get("/team/summary")
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
                    _team_id,
                    name,
                    country_name,
                    is_national,
                    logo_url,
                    venue_name,
                    venue_city,
                    venue_capacity,
                ) = team_row

                cur.execute(agg_sql, params)
                agg = cur.fetchone()

                if not agg:
                    agg = (0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0)

                (
                    matches,
                    matches_home,
                    matches_away,
                    wins,
                    draws,
                    losses,
                    goals_for,
                    goals_against,
                    points,
                    home_w,
                    home_d,
                    home_l,
                    home_gf,
                    home_ga,
                    away_w,
                    away_d,
                    away_l,
                    away_gf,
                    away_ga,
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
            "home": {
                "w": int(home_w),
                "d": int(home_d),
                "l": int(home_l),
                "gf": int(home_gf),
                "ga": int(home_ga),
            },
            "away": {
                "w": int(away_w),
                "d": int(away_d),
                "l": int(away_l),
                "gf": int(away_gf),
                "ga": int(away_ga),
            },
        },
        "last_matches": last_matches,
    }


@admin_router.get("/teams/list")
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


@admin_router.get("/metrics/overview")
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


@admin_router.get("/metrics/artifacts")
@admin_router.get("/metrics/artifacts/raw")
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

    Aliases:
      - /admin/metrics/artifacts
      - /admin/metrics/artifacts/raw
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


def _norm_name(s: str) -> str:
    s = (s or "").strip().lower()
    s = unicodedata.normalize("NFKD", s)
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    s = re.sub(r"[^a-z0-9\s]", " ", s)
    parts = [p for p in s.split() if p and p not in _STOPWORDS]
    return " ".join(parts).strip()


def _find_team_id(
    conn,
    raw_name: str,
    limit_suggestions: int = 5
) -> Tuple[Optional[int], str, List[Dict[str, Any]]]:
    """
    Returns (team_id, match_type, suggestions[])
    match_type: EXACT | ILIKE | NONE
    """
    name_norm = _norm_name(raw_name)
    if not name_norm:
        return None, "NONE", []

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

    best_id = int(rows[0][0])
    suggestions = [{"team_id": int(r[0]), "name": str(r[1]), "country": (str(r[2]) if r[2] else None)} for r in rows]
    return best_id, "ILIKE", suggestions


@admin_odds_router.get("/resolve")
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


__all__ = ["admin_router", "admin_odds_router"]

@admin_odds_router.post("/audit/sync-results")
def admin_odds_audit_sync_results(
    league_id: Optional[int] = Query(default=None, ge=1),
    season: Optional[int] = Query(default=None, ge=1900, le=2100),
    max_rows: int = Query(default=500, ge=1, le=5000),
    finished_before_hours: int = Query(default=1, ge=0, le=168),
) -> Dict[str, Any]:
    """
    Preenche odds.audit_result usando core.fixtures (quando is_finished=true).
    Regra: busca fixtures finalizados e gera label H/D/A.
    """
    now_utc = datetime.now(timezone.utc)
    cutoff = now_utc - timedelta(hours=int(finished_before_hours))

    sql_pick = """
      SELECT
        p.event_id,
        p.fixture_id,
        p.league_id,
        p.season,
        p.kickoff_utc,
        f.goals_home,
        f.goals_away
      FROM odds.audit_prediction p
      JOIN core.fixtures f ON f.fixture_id = p.fixture_id
      LEFT JOIN odds.audit_result r ON r.event_id = p.event_id
      WHERE p.fixture_id IS NOT NULL
        AND r.event_id IS NULL
        AND f.is_finished = true
        AND COALESCE(f.is_cancelled, false) = false
        AND p.kickoff_utc <= %(cutoff)s
        AND (%(league_id)s IS NULL OR p.league_id = %(league_id)s)
        AND (%(season)s IS NULL OR p.season = %(season)s)
      ORDER BY p.kickoff_utc DESC
      LIMIT %(max_rows)s
    """

    sql_ins = """
      INSERT INTO odds.audit_result (
        event_id, fixture_id, league_id, season, kickoff_utc,
        result_1x2, home_goals, away_goals
      )
      VALUES (
        %(event_id)s, %(fixture_id)s, %(league_id)s, %(season)s, %(kickoff_utc)s,
        %(result_1x2)s, %(home_goals)s, %(away_goals)s
      )
      ON CONFLICT (event_id) DO UPDATE SET
        fixture_id = EXCLUDED.fixture_id,
        league_id = EXCLUDED.league_id,
        season = EXCLUDED.season,
        kickoff_utc = EXCLUDED.kickoff_utc,
        result_1x2 = EXCLUDED.result_1x2,
        home_goals = EXCLUDED.home_goals,
        away_goals = EXCLUDED.away_goals,
        finished_at_utc = now()
    """

    inserted = 0
    rows = []

    with pg_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql_pick, {"cutoff": cutoff, "league_id": league_id, "season": season, "max_rows": max_rows})
            rows = cur.fetchall()

        with conn.cursor() as cur:
            for (event_id, fixture_id, l_id, s, kickoff_utc, gh, ga) in rows:
                if gh is None or ga is None:
                    continue
                y = _label_1x2(int(gh), int(ga))
                cur.execute(
                    sql_ins,
                    {
                        "event_id": event_id,
                        "fixture_id": fixture_id,
                        "league_id": l_id,
                        "season": s,
                        "kickoff_utc": kickoff_utc,
                        "result_1x2": y,
                        "home_goals": int(gh),
                        "away_goals": int(ga),
                    },
                )
                inserted += 1

        conn.commit()

    return {"ok": True, "inserted": inserted, "scanned": len(rows), "cutoff_utc": cutoff.isoformat()}

@admin_odds_router.get("/audit/reliability")
def admin_odds_audit_reliability(
    league_id: Optional[int] = Query(default=None, ge=1),
    season: Optional[int] = Query(default=None, ge=1900, le=2100),
    window_days: int = Query(default=30, ge=1, le=365),
    cutoff_hours: int = Query(default=6, ge=0, le=168),
    artifact_filename: Optional[str] = Query(default=None),
    min_confidence: str = Query(default="NONE", pattern="^(NONE|ILIKE|EXACT)$"),
) -> Dict[str, Any]:
    """
    Retorna KPIs de confiabilidade (Modelo vs Mercado novig) em uma janela temporal,
    escolhendo 1 snapshot por jogo: o mais recente capturado até (kickoff - cutoff_hours).
    """
    now_utc = datetime.now(timezone.utc)
    start = now_utc - timedelta(days=int(window_days))

    # min_confidence: NONE inclui tudo; ILIKE inclui ILIKE+EXACT; EXACT só EXACT
    confs = None
    if min_confidence == "EXACT":
        confs = ("EXACT",)
    elif min_confidence == "ILIKE":
        confs = ("ILIKE", "EXACT")

    sql = """
      WITH cand AS (
        SELECT
          p.event_id,
          p.kickoff_utc,
          p.captured_at_utc,
          p.league_id,
          p.season,
          p.match_confidence,

          p.market_p_h, p.market_p_d, p.market_p_a,
          p.model_p_h,  p.model_p_d,  p.model_p_a,

          r.result_1x2
        FROM odds.audit_prediction p
        JOIN odds.audit_result r ON r.event_id = p.event_id
        WHERE p.kickoff_utc >= %(start)s
          AND p.kickoff_utc <= %(end)s
          AND (%(league_id)s IS NULL OR p.league_id = %(league_id)s)
          AND (%(season)s   IS NULL OR p.season   = %(season)s)
          AND (%(artifact_filename)s IS NULL OR p.artifact_filename = %(artifact_filename)s)
          AND (%(confs)s IS NULL OR p.match_confidence = ANY(%(confs)s))
          AND p.captured_at_utc <= (p.kickoff_utc - (%(cutoff_hours)s || ' hours')::interval)
      ),
      picked AS (
        SELECT DISTINCT ON (event_id)
          *
        FROM cand
        ORDER BY event_id, captured_at_utc DESC
      )
      SELECT
        event_id, kickoff_utc, captured_at_utc,
        market_p_h, market_p_d, market_p_a,
        model_p_h,  model_p_d,  model_p_a,
        result_1x2
      FROM picked
      ORDER BY kickoff_utc DESC
    """

    rows = []
    with pg_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                sql,
                {
                    "start": start,
                    "end": now_utc,
                    "league_id": league_id,
                    "season": season,
                    "artifact_filename": artifact_filename,
                    "confs": confs,
                    "cutoff_hours": int(cutoff_hours),
                },
            )
            rows = cur.fetchall()

    # métricas
    n_total = len(rows)
    n_model = 0
    n_market = 0
    n_both = 0

    sum_brier_model = 0.0
    sum_ll_model = 0.0
    sum_top1_model = 0

    sum_brier_mkt = 0.0
    sum_ll_mkt = 0.0
    sum_top1_mkt = 0

    for (_event_id, _kickoff, _cap, mH, mD, mA, pH, pD, pA, y) in rows:
        y = str(y)

        has_model = (pH is not None and pD is not None and pA is not None)
        has_mkt = (mH is not None and mD is not None and mA is not None)

        if has_model:
            n_model += 1
            pHf, pDf, pAf = float(pH), float(pD), float(pA)
            sum_brier_model += _brier_3(pHf, pDf, pAf, y)
            sum_ll_model += _logloss_3(pHf, pDf, pAf, y)
            sum_top1_model += (1 if _top1(pHf, pDf, pAf) == y else 0)

        if has_mkt:
            n_market += 1
            mHf, mDf, mAf = float(mH), float(mD), float(mA)
            sum_brier_mkt += _brier_3(mHf, mDf, mAf, y)
            sum_ll_mkt += _logloss_3(mHf, mDf, mAf, y)
            sum_top1_mkt += (1 if _top1(mHf, mDf, mAf) == y else 0)

        if has_model and has_mkt:
            n_both += 1

    def _avg(s: float, n: int) -> Optional[float]:
        return (s / n) if n > 0 else None

    out = {
        "meta": {
            "league_id": league_id,
            "season": season,
            "window_days": window_days,
            "cutoff_hours": cutoff_hours,
            "artifact_filename": artifact_filename,
            "min_confidence": min_confidence,
            "start_utc": start.isoformat(),
            "end_utc": now_utc.isoformat(),
        },
        "counts": {
            "picked_games": n_total,
            "with_model_probs": n_model,
            "with_market_probs": n_market,
            "with_both": n_both,
        },
        "model": {
            "brier": _avg(sum_brier_model, n_model),
            "logloss": _avg(sum_ll_model, n_model),
            "top1_acc": (_avg(float(sum_top1_model), n_model)),
        },
        "market_novig": {
            "brier": _avg(sum_brier_mkt, n_market),
            "logloss": _avg(sum_ll_mkt, n_market),
            "top1_acc": (_avg(float(sum_top1_mkt), n_market)),
        },
    }
    return out

@admin_router.get("/matchup/whatif")
def admin_matchup_whatif(
    home_team_id: int = Query(..., ge=1),
    away_team_id: int = Query(..., ge=1),
    league_id: int = Query(default=39, ge=1),  # default EPL
    season: Optional[int] = Query(default=None, ge=1900, le=2100),
    artifact_id: str = Query(...),
) -> Dict[str, Any]:
    artifact_filename = _artifact_filename_from_id(artifact_id)

    # se season não vier, pega a última disponível na team_season_stats para essa liga
    if season is None:
        sql_season = "SELECT COALESCE(MAX(season), 0) FROM core.team_season_stats WHERE league_id = %s"
        with pg_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(sql_season, (league_id,))
                (max_season,) = cur.fetchone()
        if not max_season:
            raise HTTPException(status_code=400, detail="no team_season_stats found for league_id")
        season = int(max_season)

    pred = predict_1x2_from_artifact(
        artifact_filename=artifact_filename,
        league_id=int(league_id),
        season=int(season),
        home_team_id=int(home_team_id),
        away_team_id=int(away_team_id),
    )

    p = pred["probs"]
    fair = {"H": 1.0 / p["H"], "D": 1.0 / p["D"], "A": 1.0 / p["A"]}

    return {
        "meta": {
            "artifact_id": artifact_id,
            "league_id": int(league_id),
            "season": int(season),
            "is_whatif": True,
        },
        "probs_1x2": p,
        "fair_odds_1x2": fair,
        # útil para depurar “sempre igual”: se isso variar, o modelo está variando
        "debug": pred.get("debug"),
        "features": pred.get("features"),
    }

@admin_router.get("/matchup/by-fixture")
def admin_matchup_by_fixture(
    fixture_id: int = Query(..., ge=1),
    artifact_id: str = Query(...),
) -> Dict[str, Any]:
    artifact_filename = _artifact_filename_from_id(artifact_id)

    sql = """
      SELECT
        f.fixture_id,
        f.kickoff_utc,
        f.league_id,
        f.season,
        f.home_team_id,
        ht.name AS home_team_name,
        f.away_team_id,
        at.name AS away_team_name
      FROM core.fixtures f
      JOIN core.teams ht ON ht.team_id = f.home_team_id
      JOIN core.teams at ON at.team_id = f.away_team_id
      WHERE f.fixture_id = %(fixture_id)s
      LIMIT 1
    """

    with pg_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, {"fixture_id": int(fixture_id)})
            row = cur.fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="fixture not found")

    (
        fx_id,
        kickoff_utc,
        league_id,
        season,
        home_team_id,
        home_team_name,
        away_team_id,
        away_team_name,
    ) = row

    pred = predict_1x2_from_artifact(
        artifact_filename=artifact_filename,
        league_id=int(league_id),
        season=int(season),
        home_team_id=int(home_team_id),
        away_team_id=int(away_team_id),
    )

    p = pred["probs"]
    fair = {"H": 1.0 / p["H"], "D": 1.0 / p["D"], "A": 1.0 / p["A"]}

    return {
        "meta": {
            "fixture_id": int(fx_id),
            "kickoff_utc": kickoff_utc.isoformat().replace("+00:00", "Z") if kickoff_utc else None,
            "league_id": int(league_id),
            "season": int(season),
            "home": {"team_id": int(home_team_id), "name": str(home_team_name)},
            "away": {"team_id": int(away_team_id), "name": str(away_team_name)},
            "artifact_id": artifact_id,
            "is_whatif": False,
        },
        "probs_1x2": p,
        "fair_odds_1x2": fair,
        "debug": pred.get("debug"),
        "features": pred.get("features"),
    }

@admin_router.post("/fixtures/refresh")
def admin_refresh_fixtures(
    league_id: int = Query(default=39, ge=1),          # EPL = 39
    season: int = Query(default=2025, ge=1900, le=2100),  # 2025 costuma representar 2025–26 em muitas bases
    max_calls: int = Query(default=10, ge=1, le=200),
) -> Dict[str, Any]:
    """
    Faz fetch na API-Football e atualiza o banco:
      API-Football -> RAW (raw.api_responses) -> CORE (core.leagues/teams/fixtures)

    Uso: botão/manual no Admin, sem cron.
    """

    s = load_settings()
    client = ApiFootballClient(
        base_url=s.apifootball_base_url,
        api_key=s.apifootball_key,
        timeout_s=int(s.app_defaults.get("http_timeout_s", 30)),
    )

    calls_left = int(max_calls)

    report = {
        "ok": True,
        "plan": {"league_id": league_id, "season": season, "max_calls": max_calls},
        "raw": {"leagues": 0, "teams": 0, "fixtures": 0, "dedup": 0},
        "core": {},
        "calls": {"ok": 0, "fail": 0},
    }

    def ingest(endpoint: str, path: str, params: Dict[str, Any]) -> bool:
        nonlocal calls_left
        if calls_left <= 0:
            return False

        status, payload = client.get(path, params)
        if not isinstance(payload, dict):
            payload = {"errors": {"non_dict_payload": True}, "response": None}

        ok = 200 <= int(status) < 300

        inserted, _ = insert_raw_response(
            provider="apifootball",
            endpoint=endpoint,
            request_params={"path": path, "params": params},
            response_body=payload,
            http_status=int(status),
            ok=ok,
            error_message=None if ok else str(payload.get("errors")),
        )

        calls_left -= 1
        if ok:
            report["calls"]["ok"] += 1
        else:
            report["calls"]["fail"] += 1

        if inserted:
            report["raw"][endpoint] += 1
        else:
            report["raw"]["dedup"] += 1

        return ok

    # 1) leagues por season (dimensão)
    ingest("leagues", "/leagues", {"season": season})

    # 2) teams e fixtures por (league, season)
    ingest("teams", "/teams", {"league": league_id, "season": season})
    ingest("fixtures", "/fixtures", {"league": league_id, "season": season})

    # aplica CORE a partir do RAW recém inserido
    report["core"]["leagues"] = run_core_etl(provider="apifootball", endpoint="leagues", limit=5000, league_ids=[league_id])
    report["core"]["teams"] = run_core_etl(provider="apifootball", endpoint="teams", limit=5000)
    report["core"]["fixtures"] = run_core_etl(provider="apifootball", endpoint="fixtures", limit=20000)

    report["plan"]["calls_left"] = calls_left
    return report
