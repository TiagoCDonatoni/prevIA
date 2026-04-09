from __future__ import annotations

from fastapi import APIRouter

from src.db.pg import pg_conn

router = APIRouter(prefix="/product", tags=["product"])


def _sport_key_country_hint(sport_key: str | None) -> str | None:
    parts = (sport_key or "").split("_")
    if len(parts) >= 3 and parts[0] == "soccer":
        raw = parts[1].replace("-", " ").replace("_", " ").strip()
        if not raw:
            return None
        return raw.title()
    return None


def _derive_country_name(
    sport_key: str | None,
    sport_title: str | None,
    sport_group: str | None,
) -> str:
    title = str(sport_title or "").strip()
    group = str(sport_group or "").strip()

    if group.lower() == "soccer" and " - " in title:
        left, _right = title.split(" - ", 1)
        left = left.strip()
        if left:
            return left

    hint = _sport_key_country_hint(sport_key)
    if hint:
        return hint

    return "International"


@router.get("/leagues")
def product_leagues():
    sql = """
      select
        m.sport_key,
        coalesce(nullif(btrim(m.official_name), ''), c.sport_title) as sport_title,
        m.official_name,
        m.official_country_code,
        c.sport_group,
        m.league_id,
        m.season_policy,
        m.fixed_season,
        m.regions,
        m.hours_ahead,
        m.tol_hours,
        c.sport_title as raw_sport_title
      from odds.odds_league_map m
      join odds.odds_sport_catalog c on c.sport_key = m.sport_key
      where m.enabled = true
        and m.mapping_status = 'approved'
      order by c.sport_group nulls last, coalesce(nullif(btrim(m.official_name), ''), c.sport_title)
    """

    items = []
    with pg_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql)
            rows = cur.fetchall()

    for r in rows:
        sport_key = r[0]
        display_title = r[1]
        official_name = r[2]
        official_country_code = r[3]
        sport_group = r[4]
        raw_sport_title = r[11]

        items.append(
            {
                "sport_key": sport_key,
                "sport_title": display_title,
                "official_name": official_name,
                "official_country_code": official_country_code,
                "sport_group": sport_group,
                "country_name": _derive_country_name(
                    sport_key=sport_key,
                    sport_title=raw_sport_title,
                    sport_group=sport_group,
                ),
                "league_id": r[5],
                "season_policy": r[6],
                "fixed_season": r[7],
                "regions": r[8],
                "hours_ahead": r[9],
                "tol_hours": r[10],
            }
        )

    return {"ok": True, "items": items, "count": len(items)}