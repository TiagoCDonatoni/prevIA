from __future__ import annotations

from fastapi import APIRouter

from src.db.pg import pg_conn

router = APIRouter(prefix="/product", tags=["product"])


@router.get("/leagues")
def product_leagues():
    sql = """
      select
        m.sport_key,
        coalesce(nullif(btrim(m.official_name), ''), c.sport_title) as sport_title,
        m.official_name,
        c.sport_group,
        m.league_id,
        m.season_policy,
        m.fixed_season,
        m.regions,
        m.hours_ahead,
        m.tol_hours
      from odds.odds_league_map m
      join odds.odds_sport_catalog c on c.sport_key = m.sport_key
      where m.enabled = true and m.mapping_status = 'approved'
      order by c.sport_group nulls last, coalesce(nullif(btrim(m.official_name), ''), c.sport_title)
    """

    items = []
    with pg_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql)
            rows = cur.fetchall()

    for r in rows:
        items.append(
            {
                "sport_key": r[0],
                "sport_title": r[1],      # mantém compatibilidade com o frontend atual
                "official_name": r[2],    # novo campo explícito
                "sport_group": r[3],
                "league_id": r[4],
                "season_policy": r[5],
                "fixed_season": r[6],
                "regions": r[7],
                "hours_ahead": r[8],
                "tol_hours": r[9],
            }
        )

    return {"ok": True, "items": items, "count": len(items)}