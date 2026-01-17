from __future__ import annotations

from typing import Any, Dict, List, Optional
from fastapi import APIRouter, HTTPException, Query

from src.core.settings import load_settings
from src.integrations.theodds.client import TheOddsClient, TheOddsApiError

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
