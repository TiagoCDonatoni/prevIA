from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List

from src.core.settings import load_settings, CONFIG_DIR
from src.db.engine import connect_sqlite
from src.catalog.json_pick import pick, pick_top_fixture_ids


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


def build_fixture_calls(payload: Dict[str, Any], plan: Dict[str, Any]) -> List[Dict[str, Any]]:
    source = plan["source"]
    items = pick(payload, source["items_path"])
    rules = plan.get("rules", {})
    derived = [d for d in plan.get("derived_endpoints", []) if d.get("enabled")]

    max_fixtures = int(rules.get("max_fixtures", 2))
    pick_order = str(rules.get("pick_order", "latest"))

    fixture_ids = pick_top_fixture_ids(
        items=items,
        fixture_id_path=source["fields"]["fixture_id"],
        fixture_date_path=source["fields"]["fixture_date"],
        max_n=max_fixtures,
        order=pick_order,
    )

    calls: List[Dict[str, Any]] = []
    for fid in fixture_ids:
        for d in derived:
            params_template: Dict[str, Any] = d.get("params", {})
            params: Dict[str, Any] = {}
            for k, v in params_template.items():
                if isinstance(v, str):
                    v = v.replace("{fixture_id}", str(fid))
                params[k] = v

            calls.append(
                {
                    "id": d["id"],
                    "path": d["path"],
                    "params": params,
                    "meta": {"fixture_id": fid},
                }
            )

    return calls


def build_apifootball_fixture_calls_from_db() -> List[Dict[str, Any]]:
    """
    Esta é a função que o runner importa.
    """
    settings = load_settings()
    plan = _read_json(CONFIG_DIR / "callplan.apifootball.fixtures.json")

    con = connect_sqlite(settings.db_path)
    try:
        payload = load_latest_raw_payload(con, plan["source"]["endpoint_key"])
    finally:
        con.close()

    return build_fixture_calls(payload, plan)


def preview_apifootball_fixture_calls_from_db() -> Dict[str, Any]:
    calls = build_apifootball_fixture_calls_from_db()
    return {"count": len(calls), "calls": calls[:50]}
