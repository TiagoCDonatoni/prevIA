from __future__ import annotations

from typing import Any, Dict, List, Optional
from fastapi import APIRouter, HTTPException, Query

from src.core.settings import load_settings
from src.integrations.theodds.client import TheOddsClient, TheOddsApiError

from datetime import datetime, timezone, timedelta
import re
import unicodedata

from src.db.pg import pg_conn
from src.models.one_x_two_logreg_v1 import predict_1x2_from_artifact


router = APIRouter(prefix="/admin/odds", tags=["admin-odds"])


def _client() -> TheOddsClient:
    s = load_settings()
    # Se o nome da env var da key for diferente, ajuste no settings.py (recomendado),
    # ou ajuste aqui temporariamente.
    return TheOddsClient(
        base_url=s.the_odds_api_base_url or "",
        api_key=s.the_odds_api_key or "",
        timeout_sec=20,
    )

_STOPWORDS = {"fc", "cf", "sc", "ac", "afc", "cfc", "the", "club", "de", "da", "do", "and", "&"}

def _norm_name(s: str) -> str:
    s = (s or "").strip().lower()
    s = unicodedata.normalize("NFKD", s)
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    s = re.sub(r"[^a-z0-9\\s]", " ", s)
    parts = [p for p in s.split() if p and p not in _STOPWORDS]
    return " ".join(parts).strip()

def _find_team_id(conn, raw_name: str, limit_suggestions: int = 5):
    name_norm = _norm_name(raw_name)
    if not name_norm:
        return None, "NONE", []

    # EXACT
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

    # Token ILIKE fallback
    tokens = [t for t in name_norm.split() if t]
    if not tokens:
        return None, "NONE", []

    where = " AND ".join([f"lower(name) ILIKE %(t{i})s" for i in range(len(tokens))])
    params = {f"t{i}": f"%{tok}%" for i, tok in enumerate(tokens)}

    # NOTE: se você não tiver pg_trgm/similarity habilitado, troque o ORDER BY por name ASC.
    sql_like = f"""
      SELECT team_id, name, country_name
      FROM core.teams
      WHERE {where}
      ORDER BY name ASC
      LIMIT {limit_suggestions}
    """
    with conn.cursor() as cur:
        cur.execute(sql_like, params)
        rows = cur.fetchall()

    if not rows:
        return None, "NONE", []

    best_id = int(rows[0][0])
    sugg = [{"team_id": int(r[0]), "name": str(r[1]), "country": (str(r[2]) if r[2] else None)} for r in rows]
    return best_id, "ILIKE", sugg

def _try_find_fixture(conn, kickoff_utc_iso: str, home_team_id: int, away_team_id: int, tol_hours: int = 36):
    # kickoff_utc_iso vem em ISO string (The Odds API). Converter para datetime UTC.
    # Ex: "2026-01-17T20:00:00Z" ou "...+00:00"
    s = kickoff_utc_iso.replace("Z", "+00:00")
    k = datetime.fromisoformat(s).astimezone(timezone.utc)

    start = k - timedelta(hours=tol_hours)
    end = k + timedelta(hours=tol_hours)

    sql = """
      SELECT fixture_id, league_id, season, kickoff_utc
      FROM core.fixtures
      WHERE kickoff_utc >= %(start)s
        AND kickoff_utc <= %(end)s
        AND home_team_id = %(home)s
        AND away_team_id = %(away)s
      ORDER BY ABS(EXTRACT(EPOCH FROM (kickoff_utc - %(k)s))) ASC
      LIMIT 1
    """
    with conn.cursor() as cur:
        cur.execute(sql, {"start": start, "end": end, "home": home_team_id, "away": away_team_id, "k": k})
        row = cur.fetchone()
        if not row:
            return None
        fixture_id, league_id, season, kickoff_db = row
        return {
            "fixture_id": int(fixture_id),
            "league_id": int(league_id) if league_id is not None else None,
            "season": int(season) if season is not None else None,
            "kickoff_utc": kickoff_db.isoformat().replace("+00:00", "Z") if kickoff_db else None,
        }

def _market_probs_from_odds(odds_h: float | None, odds_d: float | None, odds_a: float | None):
    # MVP: implied probs + normalização (remove vig proporcional)
    vals = []
    for o in (odds_h, odds_d, odds_a):
        vals.append((1.0 / o) if (o and o > 0) else None)

    if all(v is None for v in vals):
        return {"raw": None, "novig": None, "overround": None}

    raw = {"H": vals[0], "D": vals[1], "A": vals[2]}
    s = sum(v for v in vals if v is not None)
    if s <= 0:
        return {"raw": raw, "novig": None, "overround": None}

    novig = {k: (v / s if v is not None else None) for k, v in raw.items()}
    return {"raw": raw, "novig": novig, "overround": s}


@router.get("/sports")
def admin_odds_list_sports() -> List[Dict[str, Any]]:
    """
    Debug/Discovery: list available sports keys.
    """
    try:
        rows = _client().list_sports()
        # Retorna enxuto
        out: List[Dict[str, Any]] = []
        for x in rows:
            out.append(
                {
                    "key": x.get("key"),
                    "group": x.get("group"),
                    "title": x.get("title"),
                    "active": x.get("active"),
                }
            )
        return out
    except TheOddsApiError as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/upcoming")
def admin_odds_upcoming(
    sport_key: str = Query(..., min_length=2),
    regions: str = Query(default="eu"),
    limit: int = Query(default=50, ge=1, le=200),
) -> List[Dict[str, Any]]:
    """
    Returns upcoming events with H2H odds normalized into a stable internal assumption:
    - event_id
    - kickoff_utc
    - home_name / away_name
    - odds_1x2 {H,D,A} (when available)
    """
    try:
        raw = _client().get_odds_h2h(sport_key=sport_key, regions=regions)
    except TheOddsApiError as e:
        raise HTTPException(status_code=500, detail=str(e))

    out: List[Dict[str, Any]] = []

    for ev in raw[:limit]:
        event_id = ev.get("id")
        commence_time = ev.get("commence_time")
        home = ev.get("home_team")
        away = ev.get("away_team")

        # Pega a melhor linha de odds (MVP): primeiro bookmaker/market.
        odds_h = None
        odds_d = None
        odds_a = None

        bookmakers = ev.get("bookmakers") or []
        if bookmakers:
            mk = bookmakers[0]
            markets = mk.get("markets") or []
            # h2h geralmente vem como uma lista de outcomes (2 ou 3 outcomes)
            mkt = markets[0] if markets else None
            outcomes = (mkt or {}).get("outcomes") or []
            # outcomes: [{"name": "...", "price": 1.9}, ...]
            # Para 1x2: pode vir HOME/AWAY ou HOME/DRAW/AWAY dependendo do esporte/mercado.
            for o in outcomes:
                name = str(o.get("name") or "").strip()
                price = o.get("price")
                if price is None:
                    continue

                # Normalização MVP por nome:
                if name.lower() == str(home).lower():
                    odds_h = float(price)
                elif name.lower() == str(away).lower():
                    odds_a = float(price)
                elif name.lower() in ("draw", "tie", "empate"):
                    odds_d = float(price)

        out.append(
            {
                "event_id": event_id,
                "kickoff_utc": commence_time,  # já vem ISO UTC
                "home_name": home,
                "away_name": away,
                "sport_key": sport_key,
                "regions": regions,
                "odds_1x2": {"H": odds_h, "D": odds_d, "A": odds_a},
            }
        )

    return out

@router.get("/upcoming/orchestrate")
def admin_odds_upcoming_orchestrate(
    sport_key: str = Query(..., min_length=2),
    regions: str = Query(default="eu"),
    limit: int = Query(default=50, ge=1, le=200),
    artifact_filename: Optional[str] = Query(default=None),
    assume_league_id: Optional[int] = Query(default=None, ge=1),
    assume_season: Optional[int] = Query(default=None, ge=1900, le=2100),
) -> List[Dict[str, Any]]:
    """
    Orquestra: Odds API -> resolve team_ids -> tenta achar fixture -> (opcional) P_model + compare.
    - Se artifact_filename não for informado, retorna só resolução + fixture + market probs.
    - Se artifact_filename for informado, calcula P_model quando tiver league_id/season (do fixture ou assume_*).
    """
    try:
        raw = _client().get_odds_h2h(sport_key=sport_key, regions=regions)
    except TheOddsApiError as e:
        raise HTTPException(status_code=500, detail=str(e))

    out: List[Dict[str, Any]] = []

    with pg_conn() as conn:
        for ev in raw[:limit]:
            event_id = ev.get("id")
            commence_time = ev.get("commence_time")
            home = str(ev.get("home_team") or "")
            away = str(ev.get("away_team") or "")

            # odds MVP: primeiro bookmaker/market
            odds_h = odds_d = odds_a = None
            bookmakers = ev.get("bookmakers") or []
            if bookmakers:
                mk = bookmakers[0]
                markets = mk.get("markets") or []
                mkt = markets[0] if markets else None
                outcomes = (mkt or {}).get("outcomes") or []
                for o in outcomes:
                    name = str(o.get("name") or "").strip()
                    price = o.get("price")
                    if price is None:
                        continue
                    if name.lower() == home.lower():
                        odds_h = float(price)
                    elif name.lower() == away.lower():
                        odds_a = float(price)
                    elif name.lower() in ("draw", "tie", "empate"):
                        odds_d = float(price)

            # resolve team ids
            home_id, home_type, home_sugg = _find_team_id(conn, home)
            away_id, away_type, away_sugg = _find_team_id(conn, away)

            fixture = None
            if home_id and away_id and commence_time:
                fixture = _try_find_fixture(conn, commence_time, home_id, away_id)

            market = _market_probs_from_odds(odds_h, odds_d, odds_a)

            # decide league/season para o modelo
            league_id = (fixture or {}).get("league_id") if fixture else None
            season = (fixture or {}).get("season") if fixture else None
            if league_id is None:
                league_id = assume_league_id
            if season is None:
                season = assume_season

            model_block = None
            if artifact_filename and home_id and away_id and league_id and season:
                try:
                    pred = predict_1x2_from_artifact(
                        artifact_filename=artifact_filename,
                        league_id=int(league_id),
                        season=int(season),
                        home_team_id=int(home_id),
                        away_team_id=int(away_id),
                    )
                    p_model = pred["probs"]
                    p_mkt = market["novig"]

                    edge = None
                    evv = None
                    if p_mkt:
                        edge = {
                            "H": (p_model["H"] - (p_mkt["H"] or 0.0)) if p_mkt["H"] is not None else None,
                            "D": (p_model["D"] - (p_mkt["D"] or 0.0)) if p_mkt["D"] is not None else None,
                            "A": (p_model["A"] - (p_mkt["A"] or 0.0)) if p_mkt["A"] is not None else None,
                        }

                    evv = {
                        "H": (p_model["H"] * odds_h - 1.0) if odds_h else None,
                        "D": (p_model["D"] * odds_d - 1.0) if odds_d else None,
                        "A": (p_model["A"] * odds_a - 1.0) if odds_a else None,
                    }

                    model_block = {
                        "league_id": int(league_id),
                        "season": int(season),
                        "artifact_filename": artifact_filename,
                        "probs_model": p_model,
                        "edge_vs_market": edge,
                        "ev_decimal": evv,
                        "features": pred.get("features"),
                        "artifact_meta": pred.get("artifact"),
                    }
                except Exception as e:
                    model_block = {"error": str(e)}

            out.append(
                {
                    "event_id": event_id,
                    "kickoff_utc": commence_time,
                    "home_name": home,
                    "away_name": away,
                    "sport_key": sport_key,
                    "regions": regions,
                    "odds_1x2": {"H": odds_h, "D": odds_d, "A": odds_a},
                    "market_probs": market,
                    "resolve": {
                        "home": {"team_id": home_id, "match_type": home_type, "suggestions": home_sugg},
                        "away": {"team_id": away_id, "match_type": away_type, "suggestions": away_sugg},
                        "ok": bool(home_id and away_id),
                    },
                    "fixture_hint": fixture,
                    "model": model_block,
                }
            )

    return out

