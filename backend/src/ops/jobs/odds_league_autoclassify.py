from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict

from src.db.pg import pg_conn


def odds_league_autoclassify() -> Dict[str, Any]:
    """
    Marca automaticamente como 'ignored' tudo que não faz sentido pro produto de futebol (v1):
      - não-soccer
      - outrights (winner/championship/etc)
      - politics
    Mantém 'pending' para soccer_ (match markets) para aprovação humana.

    Importante: não deleta nada; só muda mapping_status.
    """
    now = datetime.now(timezone.utc)

    sql = """
      update odds.odds_league_map m
      set
        mapping_status = 'ignored',
        notes = coalesce(m.notes,'')
             || case when m.notes is null or m.notes = '' then '' else ' | ' end
             || 'auto-ignored by autoclassify',
        updated_at_utc = %(now)s
      from odds.odds_sport_catalog c
      where c.sport_key = m.sport_key
        and m.mapping_status = 'pending'
        and (
          c.sport_group ilike %(grp_politics)s
          or m.sport_key not like %(soccer_prefix)s
          or m.sport_key ilike %(p_winner)s
          or m.sport_key ilike %(p_championship)s
          or m.sport_key ilike %(p_world_series)s
        )
      returning m.sport_key
    """

    ignored_keys = []
    with pg_conn() as conn:
        conn.autocommit = False
        with conn.cursor() as cur:
            cur.execute(
                sql,
                {
                    "now": now,
                    "grp_politics": "Politics%",
                    "soccer_prefix": "soccer_%",
                    "p_winner": "%winner%",
                    "p_championship": "%championship%",
                    "p_world_series": "%world_series%",
                },
            )
            rows = cur.fetchall() or []
            ignored_keys = [r[0] for r in rows]
        conn.commit()

    return {
        "ignored": len(ignored_keys),
        "ignored_keys_sample": ignored_keys[:20],
        "captured_at_utc": now.isoformat(),
    }