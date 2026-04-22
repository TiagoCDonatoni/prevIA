from __future__ import annotations

import logging
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

from src.core.settings import load_settings
from src.db.pg import pg_conn
from src.integrations.theodds.client import TheOddsClient, TheOddsApiError
from src.odds.matchup_resolver import resolve_odds_event

logger = logging.getLogger(__name__)

def _client() -> TheOddsClient:
    s = load_settings()
    return TheOddsClient(
        base_url=s.the_odds_api_base_url or "",
        api_key=s.the_odds_api_key or "",
        timeout_sec=20,
    )


def _normalize_market_key(raw_key: Optional[str]) -> Optional[str]:
    k = str(raw_key or "").strip().lower()
    if not k:
        return None

    if k == "h2h":
        return "h2h"
    if k == "totals":
        return "totals"
    if k in ("btts", "both_teams_to_score"):
        return "btts"

    return None


def _normalize_selection_key(
    *,
    market_key: str,
    outcome_name: Optional[str],
    home_name: Optional[str],
    away_name: Optional[str],
) -> Optional[str]:
    nm = str(outcome_name or "").strip()
    low = nm.lower()

    if market_key == "btts":
        if low in ("yes", "y", "sim"):
            return "yes"
        if low in ("no", "n", "nao", "não"):
            return "no"
        return None

    if market_key == "totals":
        if low == "over":
            return "over"
        if low == "under":
            return "under"
        return None

    if market_key == "h2h":
        if home_name and nm == home_name:
            return "home"
        if away_name and nm == away_name:
            return "away"
        if low in ("draw", "tie", "empate"):
            return "draw"
        return None

    return None


def _extract_point(outcome: Dict[str, Any]) -> Optional[float]:
    pt = outcome.get("point")
    if pt is None:
        return None
    try:
        return float(pt)
    except Exception:
        return None


def _persist_odds_h2h_batch(
    conn,
    sport_key: str,
    raw_events: List[Dict[str, Any]],
    captured_at_utc: datetime,
) -> Dict[str, int]:
    """
    Mantém a persistência legada de 1x2:
      - odds.odds_events
      - odds.odds_snapshots_1x2
    """
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
                    "commence": commence_time,
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
                    if (mkt.get("key") or "") != "h2h":
                        continue

                    outcomes = mkt.get("outcomes") or []
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
                        elif isinstance(nm, str) and nm.strip().lower() in ("draw", "tie", "empate"):
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
                    else:
                        c_snapshots_skipped += 1

    return {
        "events_upserted": c_events_upsert,
        "snapshots_inserted": c_snapshots_inserted,
        "snapshots_skipped": c_snapshots_skipped,
    }


def _persist_odds_market_batch(
    conn,
    *,
    raw_events: List[Dict[str, Any]],
    captured_at_utc: datetime,
) -> Dict[str, int]:
    """
    Persistência genérica paralela:
      - totals
      - btts
    """
    c_attempted = 0
    c_inserted = 0
    c_skipped = 0

    sql_insert_market = """
      INSERT INTO odds.odds_snapshots_market
        (event_id, bookmaker, market_key, selection_key, point, price, captured_at_utc)
      VALUES
        (%(event_id)s, %(bookmaker)s, %(market_key)s, %(selection_key)s, %(point)s, %(price)s, %(captured_at_utc)s)
      ON CONFLICT DO NOTHING
    """

    with conn.cursor() as cur:
        for ev in raw_events:
            event_id = ev.get("id") or ev.get("event_id")
            if not event_id:
                continue

            home = ev.get("home_team") or ev.get("home_name")
            away = ev.get("away_team") or ev.get("away_name")

            bookmakers = ev.get("bookmakers") or []
            for bk in bookmakers:
                bk_title = bk.get("title") or bk.get("key")
                markets = bk.get("markets") or []

                for mkt in markets:
                    market_key = _normalize_market_key(mkt.get("key") or mkt.get("market"))
                    if market_key not in ("totals", "btts"):
                        continue

                    outcomes = mkt.get("outcomes") or []
                    for o in outcomes:
                        selection_key = _normalize_selection_key(
                            market_key=market_key,
                            outcome_name=o.get("name"),
                            home_name=home,
                            away_name=away,
                        )
                        price = o.get("price")
                        point = _extract_point(o)

                        if selection_key is None or price is None:
                            continue

                        if market_key == "btts":
                            point = None

                        c_attempted += 1

                        cur.execute(
                            sql_insert_market,
                            {
                                "event_id": str(event_id),
                                "bookmaker": str(bk_title) if bk_title else None,
                                "market_key": market_key,
                                "selection_key": selection_key,
                                "point": point,
                                "price": price,
                                "captured_at_utc": captured_at_utc,
                            },
                        )

                        if cur.rowcount == 1:
                            c_inserted += 1
                        else:
                            c_skipped += 1

    return {
        "market_snapshots_attempted": c_attempted,
        "market_snapshots_inserted": c_inserted,
        "market_snapshots_skipped": c_skipped,
    }


def _build_btts_event_records(
    *,
    sport_key: str,
    regions: str,
    event_ids: List[str],
) -> Dict[str, Any]:
    """
    Segunda passada por evento para BTTS.
    Retorna records + observabilidade real de erro/provider.
    """
    cli = _client()
    records: List[Dict[str, Any]] = []

    counters = {
        "events_attempted": 0,
        "events_ok": 0,
        "events_fail": 0,
    }
    sample_issues: List[Dict[str, Any]] = []

    for event_id in event_ids:
        counters["events_attempted"] += 1

        try:
            raw = cli.get_event_odds(
                sport_key=sport_key,
                event_id=str(event_id),
                regions=regions,
                markets="btts",
            )
        except TheOddsApiError as e:
            counters["events_fail"] += 1
            if len(sample_issues) < 8:
                sample_issues.append(
                    {
                        "event_id": str(event_id),
                        "status": "PROVIDER_ERROR",
                        "error": str(e),
                    }
                )
            logger.debug("[BTTS] event_id=%s provider_error=%s", event_id, str(e))
            continue

        logger.debug("[BTTS] event_id=%s", event_id)

        if isinstance(raw, dict):
            logger.debug("[BTTS] raw_keys=%s", list(raw.keys()))
            logger.debug("[BTTS] bookmakers_count=%s", len(raw.get("bookmakers") or []))
            logger.debug("[BTTS] bookmakers_sample=%s", (raw.get("bookmakers") or [])[:1])
        else:
            logger.debug("[BTTS] raw_type=%s", type(raw))
            logger.debug("[BTTS] raw_value=%s", raw)
            counters["events_fail"] += 1
            if len(sample_issues) < 8:
                sample_issues.append(
                    {
                        "event_id": str(event_id),
                        "status": "INVALID_RAW_TYPE",
                        "raw_type": str(type(raw)),
                    }
                )
            continue

        bookmakers = raw.get("bookmakers") or []
        if not bookmakers:
            counters["events_fail"] += 1
            if len(sample_issues) < 8:
                sample_issues.append(
                    {
                        "event_id": str(event_id),
                        "status": "EMPTY_BOOKMAKERS",
                        "raw_keys": list(raw.keys()),
                    }
                )
            continue

        counters["events_ok"] += 1
        records.append(
            {
                "id": str(raw.get("id") or event_id),
                "home_team": raw.get("home_team"),
                "away_team": raw.get("away_team"),
                "commence_time": raw.get("commence_time"),
                "bookmakers": bookmakers,
            }
        )

    return {
        "records": records,
        "counters": counters,
        "sample_issues": sample_issues,
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
    Job oficial / cron-ready:
    1) provider base: h2h + totals
    2) persist legado 1x2
    3) persist totals na tabela genérica
    4) provider por evento: btts
    5) persist btts na tabela genérica
    6) resolve em lote
    """
    try:
        raw = _client().get_odds_h2h(
            sport_key=sport_key,
            regions=regions,
            markets="h2h,totals",
        )
    except TheOddsApiError as e:
        return {"ok": False, "stage": "provider_base", "error": str(e)}

    captured_at = datetime.now(timezone.utc)
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

        counters_refresh = _persist_odds_h2h_batch(
            conn,
            sport_key=sport_key,
            raw_events=raw,
            captured_at_utc=captured_at,
        )

        counters_market_base = _persist_odds_market_batch(
            conn,
            raw_events=raw,
            captured_at_utc=captured_at,
        )

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
            cur.execute(
                sql,
                {
                    "sport_key": sport_key,
                    "now": now,
                    "end": end,
                    "limit": int(limit),
                },
            )
            event_ids = [str(r[0]) for r in cur.fetchall()]

            btts_fetch = _build_btts_event_records(
                sport_key=sport_key,
                regions=regions,
                event_ids=event_ids,
            )

            raw_btts = btts_fetch["records"]

            counters_market_btts = _persist_odds_market_batch(
                conn,
                raw_events=raw_btts,
                captured_at_utc=captured_at,
            )

            sample_issues.extend(btts_fetch["sample_issues"][:4])

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
                        sample_issues.append(
                            {
                                "event_id": str(event_id),
                                "status": res.status,
                                "confidence": res.confidence,
                                "reason": res.reason,
                            }
                        )
                elif res.status == "AMBIGUOUS":
                    counters_resolve["ambiguous"] += 1
                    if len(sample_issues) < 8:
                        sample_issues.append(
                            {
                                "event_id": str(event_id),
                                "status": res.status,
                                "confidence": res.confidence,
                                "reason": res.reason,
                                "candidates": res.candidates[:3],
                            }
                        )
                else:
                    counters_resolve["not_found"] += 1
                    if len(sample_issues) < 8:
                        sample_issues.append(
                            {
                                "event_id": str(event_id),
                                "status": res.status,
                                "confidence": res.confidence,
                                "reason": res.reason,
                            }
                        )
            except Exception as e:
                counters_resolve["errors"] += 1
                if len(sample_issues) < 8:
                    sample_issues.append(
                        {"event_id": str(event_id), "status": "ERROR", "error": str(e)}
                    )

        conn.commit()

    refresh = {
        **counters_refresh,
        "market_base": counters_market_base,
        "market_btts_fetch": btts_fetch["counters"],
        "market_btts": counters_market_btts,
    }

    return {
        "ok": True,
        "sport_key": sport_key,
        "regions": regions,
        "captured_at_utc": captured_at.isoformat().replace("+00:00", "Z"),
        "refresh": refresh,
        "resolve": {
            "window_hours": int(hours_ahead),
            "assume_league_id": int(assume_league_id),
            "assume_season": int(assume_season),
            "tol_hours": int(tol_hours),
            "counters": counters_resolve,
            "sample_issues": sample_issues,
        },
    }