from __future__ import annotations

from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List

from src.core.settings import load_settings
from src.db.pg import pg_conn
from src.integrations.theodds.client import TheOddsClient, TheOddsApiError
from src.odds.matchup_resolver import resolve_odds_event


def _client() -> TheOddsClient:
    s = load_settings()
    return TheOddsClient(
        base_url=s.the_odds_api_base_url or "",
        api_key=s.the_odds_api_key or "",
        timeout_sec=20,
    )


def _persist_odds_h2h_batch(conn, sport_key: str, raw_events: List[Dict[str, Any]], captured_at_utc: datetime) -> Dict[str, int]:
    """
    Copiado do admin_odds_router.py (persistência em odds.odds_events + odds.odds_snapshots_1x2).
    Mantém a mesma lógica/SQL para não mudar comportamento.
    """
    market_inserted = 0
    c_events_upsert = 0
    c_snapshots_inserted = 0
    c_snapshots_skipped = 0

    sql_upsert_event = """
      INSERT INTO odds.odds_events (event_id, sport_key, commence_time_utc, home_name, away_name, latest_captured_at_utc)
      VALUES (%(event_id)s, %(sport_key)s, %(commence)s, %(home)s, %(away)s, %(captured)s)
      ON CONFLICT (event_id) DO UPDATE SET
        sport_key = EXCLUDED.sport_key,
        commence_time_utc = EXCLUDED.commence_time_utc,
        home_name = EXCLUDED.home_name,
        away_name = EXCLUDED.away_name,
        latest_captured_at_utc = EXCLUDED.latest_captured_at_utc
    """

    sql_insert_snapshot = """
      INSERT INTO odds.odds_snapshots_1x2 (event_id, bookmaker, market, odds_home, odds_draw, odds_away, captured_at_utc)
      VALUES (%(event_id)s, %(bookmaker)s, %(market)s, %(odds_home)s, %(odds_draw)s, %(odds_away)s, %(captured_at_utc)s)
      ON CONFLICT DO NOTHING
    """

    sql_insert_market_snapshot = """
      INSERT INTO odds.odds_snapshots_market (
        event_id, bookmaker, market_key, selection_key, point, price, captured_at_utc
      )
      VALUES (
        %(event_id)s, %(bookmaker)s, %(market_key)s, %(selection_key)s, %(point)s, %(price)s, %(captured_at_utc)s
      )
      ON CONFLICT DO NOTHING
    """

    with conn.cursor() as cur:
        for ev in raw_events:
            event_id = ev.get("id")
            if not event_id:
                continue

            commence_time = ev.get("commence_time")
            home = ev.get("home_team")
            away = ev.get("away_team")

            cur.execute(
                sql_upsert_event,
                {
                    "event_id": str(event_id),
                    "sport_key": str(sport_key),
                    "commence": commence_time,  # iso string do provider (ok)
                    "home": str(home) if home else None,
                    "away": str(away) if away else None,
                    "captured": captured_at_utc,
                },
            )
            c_events_upsert += 1

            bookmakers = ev.get("bookmakers") or []
            for bk in bookmakers:
                bk_title = bk.get("title") or bk.get("key")
                markets = bk.get("markets") or []
                for mkt in markets:
                    mkey = (mkt.get("key") or "").strip().lower()
                    if mkey not in ("h2h", "totals", "btts"):
                        continue

                    outcomes = mkt.get("outcomes") or []

                    # 1) Persistência genérica (odds_snapshots_market)
                    # - h2h: H/D/A (point = None)
                    # - totals: over/under (point obrigatório)
                    # - btts: yes/no (point = None)
                    for o in outcomes:
                        nm = o.get("name")
                        pr = o.get("price")
                        pt = o.get("point")

                        if pr is None or nm is None:
                            continue

                        selection_key = None
                        point = None

                        if mkey == "h2h":
                            # name vem como home_team / away_team / Draw
                            if nm == home:
                                selection_key = "H"
                            elif nm == away:
                                selection_key = "A"
                            elif isinstance(nm, str) and nm.strip().lower() == "draw":
                                selection_key = "D"
                            point = None

                        elif mkey == "totals":
                            # name vem como Over/Under e point = 2.5 etc.
                            if isinstance(nm, str):
                                low = nm.strip().lower()
                                if low == "over":
                                    selection_key = "over"
                                elif low == "under":
                                    selection_key = "under"
                            # point é obrigatório para totals (se não vier, não gravamos)
                            point = pt if pt is not None else None
                            if point is None:
                                continue

                        elif mkey == "btts":
                            # name vem como Yes/No
                            if isinstance(nm, str):
                                low = nm.strip().lower()
                                if low == "yes":
                                    selection_key = "yes"
                                elif low == "no":
                                    selection_key = "no"
                            point = None

                        if not selection_key:
                            continue

                        cur.execute(
                            sql_insert_market_snapshot,
                            {
                                "event_id": str(event_id),
                                "bookmaker": str(bk_title) if bk_title else None,
                                "market_key": mkey,
                                "selection_key": selection_key,
                                "point": point,
                                "price": pr,
                                "captured_at_utc": captured_at_utc,
                            },
                        )

                    # 2) Persistência legada (odds_snapshots_1x2) - mantém comportamento atual
                    if mkey != "h2h":
                        continue

                    odds_home = None
                    odds_draw = None
                    odds_away = None

                    for o in outcomes:
                        nm = o.get("name")
                        pr = o.get("price")
                        if pr is None:
                            continue
                        if nm == home:
                            odds_home = pr
                        elif nm == away:
                            odds_away = pr
                        else:
                            if isinstance(nm, str) and nm.strip().lower() == "draw":
                                odds_draw = pr

                    cur.execute(
                        sql_insert_snapshot,
                        {
                            "event_id": str(event_id),
                            "bookmaker": str(bk_title) if bk_title else None,
                            "market": "h2h",
                            "odds_home": odds_home,
                            "odds_draw": odds_draw,
                            "odds_away": odds_away,
                            "captured_at_utc": captured_at_utc,
                        },
                    )
                    if cur.rowcount == 1:
                        c_snapshots_inserted += 1
                        market_inserted += 1
                    else:
                        c_snapshots_skipped += 1
                        market_inserted += 1

    return {
        "events_upserted": c_events_upsert,
        "snapshots_inserted": c_snapshots_inserted,
        "snapshots_skipped": c_snapshots_skipped,
        "market_snapshots_attempted": market_inserted,
    }


def run_odds_refresh_and_resolve(
    *,
    sport_key: str,
    regions: str = "eu",
    hours_ahead: int = 720,
    limit: int = 500,
    assume_league_id: int,
    assume_season: int,
    tol_hours: int = 6,
) -> Dict[str, Any]:
    """
    Job cron-ready:
    1) chama provider (odds h2h) e persiste (odds_events + snapshots_1x2)
    2) resolve em lote (preenche match_status/match_score etc. via resolve_odds_event)
    """
    # 1) provider
    try:
        raw = _client().get_odds_h2h(sport_key=sport_key, regions=regions)
    except TheOddsApiError as e:
        return {"ok": False, "stage": "provider", "error": str(e)}

    captured_at = datetime.now(timezone.utc)

    # 2) persist + resolve
    now = datetime.now(timezone.utc)
    end = now + timedelta(hours=int(hours_ahead))

    counters_resolve = {
        "events_scanned": 0,
        "exact": 0,
        "probable": 0,
        "ambiguous": 0,
        "not_found": 0,
        "errors": 0,
        "persisted": 0,
    }
    sample_issues: List[Dict[str, Any]] = []

    with pg_conn() as conn:
        conn.autocommit = False

        # persist
        counters_refresh = _persist_odds_h2h_batch(conn, sport_key=sport_key, raw_events=raw, captured_at_utc=captured_at)

        # resolve
        sql = """
          SELECT event_id
          FROM odds.odds_events
          WHERE sport_key = %(sport_key)s
            AND commence_time_utc IS NOT NULL
            AND commence_time_utc >= %(now)s
            AND commence_time_utc <= %(end)s
          ORDER BY commence_time_utc ASC
          LIMIT %(limit)s
        """
        with conn.cursor() as cur:
            cur.execute(sql, {"sport_key": sport_key, "now": now, "end": end, "limit": int(limit)})
            event_ids = [r[0] for r in cur.fetchall()]

        for event_id in event_ids:
            counters_resolve["events_scanned"] += 1
            try:
                res = resolve_odds_event(
                    conn,
                    event_id=str(event_id),
                    assume_league_id=int(assume_league_id),
                    assume_season=int(assume_season),
                    tol_hours=int(tol_hours),
                    max_candidates=5,
                    persist_resolution=True,
                )
                counters_resolve["persisted"] += 1

                if res.status == "EXACT":
                    counters_resolve["exact"] += 1
                elif res.status == "PROBABLE":
                    counters_resolve["probable"] += 1
                    if len(sample_issues) < 8:
                        sample_issues.append({"event_id": str(event_id), "status": res.status, "confidence": res.confidence, "reason": res.reason})
                elif res.status == "AMBIGUOUS":
                    counters_resolve["ambiguous"] += 1
                    if len(sample_issues) < 8:
                        sample_issues.append({"event_id": str(event_id), "status": res.status, "confidence": res.confidence, "reason": res.reason, "candidates": res.candidates[:3]})
                else:
                    counters_resolve["not_found"] += 1
                    if len(sample_issues) < 8:
                        sample_issues.append({"event_id": str(event_id), "status": res.status, "confidence": res.confidence, "reason": res.reason})

            except Exception as e:
                counters_resolve["errors"] += 1
                if len(sample_issues) < 8:
                    sample_issues.append({"event_id": str(event_id), "status": "ERROR", "error": str(e)})

        conn.commit()

    return {
        "ok": True,
        "sport_key": sport_key,
        "regions": regions,
        "captured_at_utc": captured_at.isoformat().replace("+00:00", "Z"),
        "refresh": counters_refresh,
        "resolve": {
            "window_hours": int(hours_ahead),
            "assume_league_id": int(assume_league_id),
            "assume_season": int(assume_season),
            "tol_hours": int(tol_hours),
            "counters": counters_resolve,
            "sample_issues": sample_issues,
        },
    }
