from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Dict, List

from src.db.pg import pg_conn
from src.odds.jobs.odds_refresh_resolve_job import _client


def sync_odds_sport_catalog() -> Dict[str, Any]:
    """
    Sync automático do catálogo de esportes/ligas disponíveis na Odds API.
    Persiste em odds.odds_sport_catalog.

    Cron-ready:
      - Sem dependência de FastAPI
      - Retorna counters
      - Idempotente via UPSERT
    """
    sports: List[Dict[str, Any]] = _client().list_sports()
    now = datetime.now(timezone.utc)

    upserted = 0
    skipped = 0

    sql = """
    insert into odds.odds_sport_catalog
      (sport_key, sport_group, sport_title, active, last_seen_at_utc, meta_json, updated_at_utc)
    values
      (%s, %s, %s, %s, %s, %s::jsonb, %s)
    on conflict (sport_key) do update set
      sport_group = excluded.sport_group,
      sport_title = excluded.sport_title,
      active = excluded.active,
      last_seen_at_utc = excluded.last_seen_at_utc,
      meta_json = excluded.meta_json,
      updated_at_utc = excluded.updated_at_utc
    """

    with pg_conn() as conn:
        conn.autocommit = False
        with conn.cursor() as cur:
            for s in sports:
                sport_key = s.get("key")
                if not sport_key:
                    skipped += 1
                    continue

                cur.execute(
                    sql,
                    (
                        sport_key,
                        s.get("group"),
                        s.get("title"),
                        bool(s.get("active", True)),
                        now,
                        json.dumps(s),
                        now,
                    ),
                )
                upserted += 1

        conn.commit()

    return {
        "sports_seen": len(sports),
        "catalog_upserted": upserted,
        "skipped": skipped,
        "captured_at_utc": now.isoformat(),
    }