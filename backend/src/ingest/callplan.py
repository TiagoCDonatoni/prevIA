from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List, Tuple

from src.core.settings import load_settings, CONFIG_DIR
from src.db.engine import connect_sqlite
from src.catalog.json_pick import pick, pick_season_year

def _read_json(path: Path) -> Dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))

def load_latest_raw_payload(con, endpoint_key: str) -> Dict[str, Any]:
    cur = con.execute(
        """
        select payload_json
        from api_raw
        where endpoint = ?
        order by id desc
        limit 1
        """,
        (endpoint_key,),
    )
    row = cur.fetchone()
    if not row:
        raise ValueError(f"RAW não encontrado para endpoint: {endpoint_key}")
    return json.loads(row[0])

def build_calls_from_callplan(payload: Dict[str, Any], callplan: Dict[str, Any]) -> List[Dict[str, Any]]:
    source = callplan["source"]
    items_path = source["items_path"]
    fields = source["fields"]
    rules = callplan.get("rules", {})
    derived = [d for d in callplan.get("derived_endpoints", []) if d.get("enabled")]

    items = pick(payload, items_path)
    if not isinstance(items, list):
        raise ValueError("source.items_path não retornou lista")

    max_leagues = int(rules.get("max_leagues", 5))
    seasons_pick = str(rules.get("seasons_pick", "latest"))

    calls: List[Dict[str, Any]] = []

    for item in items[:max_leagues]:
        league_id = pick(item, fields["league_id"])
        seasons_list = pick(item, fields["season_years"])
        season = pick_season_year(seasons_list, mode=seasons_pick)

        if league_id is None or season is None:
            continue

        for d in derived:
            params_template: Dict[str, Any] = d.get("params", {})
            params: Dict[str, Any] = {}
            for k, v in params_template.items():
                if isinstance(v, str):
                    v = v.replace("{league_id}", str(league_id)).replace("{season}", str(season))
                params[k] = v

            calls.append({
                "id": d["id"],
                "path": d["path"],
                "params": params,
                "meta": {"league_id": league_id, "season": season}
            })

    return calls

def build_apifootball_calls_from_db() -> List[Dict[str, Any]]:
    settings = load_settings()
    callplan = _read_json(CONFIG_DIR / "callplan.apifootball.json")

    con = connect_sqlite(settings.db_path)
    try:
        payload = load_latest_raw_payload(con, callplan["source"]["endpoint_key"])
    finally:
        con.close()

    return build_calls_from_callplan(payload, callplan)
