from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict

from src.db.pg import pg_conn


def odds_league_gap_scan(*, default_enabled: bool = False) -> Dict[str, Any]:
    """
    Descobre sport_keys no catálogo que ainda não têm entrada em odds.odds_league_map
    e cria um registro PENDING (governança) sem hardcode.

    default_enabled:
      - False (recomendado): entra como pending e disabled
      - True: entra como pending e enabled (não roda pipeline enquanto não approved)
    """
    now = datetime.now(timezone.utc)

    # Refino v1: já nasce como ignored quando for ruído estrutural.
    # Mantém pending apenas para soccer + match markets (não-outrights/politics).
    sql_insert = """
      with candidates as (
        select
          c.sport_key,
          (
            c.sport_group ilike %s
            or c.sport_key not like %s
            or c.sport_key ilike %s
            or c.sport_key ilike %s
            or c.sport_key ilike %s
          ) as should_ignore
        from odds.odds_sport_catalog c
        left join odds.odds_league_map m on m.sport_key = c.sport_key
        where m.sport_key is null
      )
      insert into odds.odds_league_map
        (sport_key, league_id, season_policy, fixed_season, tol_hours, hours_ahead, regions,
         enabled, mapping_status, mapping_source, confidence, notes, created_at_utc, updated_at_utc)
      select
        sport_key,
        0 as league_id,
        'current' as season_policy,
        null as fixed_season,
        6 as tol_hours,
        720 as hours_ahead,
        'eu' as regions,
        case
          when should_ignore then false
          else %s
        end as enabled,
        case
          when should_ignore then 'ignored'
          else 'pending'
        end as mapping_status,
        'auto_low_conf' as mapping_source,
        0.0 as confidence,
        case
          when should_ignore then 'auto-created by gap_scan (ignored)'
          else 'auto-created by gap_scan (pending)'
        end as notes,
        %s as created_at_utc,
        %s as updated_at_utc
      from candidates
      returning sport_key, mapping_status
    """

    inserted = 0
    inserted_pending = 0
    inserted_ignored = 0
    inserted_keys = []
    inserted_pending_keys = []
    inserted_ignored_keys = []

    with pg_conn() as conn:
        conn.autocommit = False
        with conn.cursor() as cur:
            cur.execute(
                sql_insert,
                (
                    "Politics%",
                    "soccer_%",
                    "%winner%",
                    "%championship%",
                    "%world_series%",
                    bool(default_enabled),
                    now,
                    now,
                ),
            )
            rows = cur.fetchall() or []
            inserted_keys = [r[0] for r in rows]
            inserted = len(inserted_keys)

            for r in rows:
                if str(r[1]) == "pending":
                    inserted_pending += 1
                    inserted_pending_keys.append(r[0])
                else:
                    inserted_ignored += 1
                    inserted_ignored_keys.append(r[0])
        conn.commit()

    return {
        "inserted": inserted,
        "inserted_pending": inserted_pending,
        "inserted_ignored": inserted_ignored,
        "inserted_keys_sample": inserted_keys[:20],
        "inserted_pending_keys_sample": inserted_pending_keys[:20],
        "inserted_ignored_keys_sample": inserted_ignored_keys[:20],
        "default_enabled": bool(default_enabled),
        "captured_at_utc": now.isoformat(),
    }