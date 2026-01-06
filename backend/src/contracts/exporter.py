from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from src.core.settings import load_settings
from src.db.engine import connect_sqlite


def _utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def export_field_catalog(provider: str, out_path: Path, limit_per_endpoint: int = 5000) -> Dict[str, Any]:
    """
    Exporta api_field_catalog para JSON versionável.
    - provider: "apifootball"
    - out_path: ex. backend/contracts/apifootball.field_catalog.v1.json
    """
    settings = load_settings()
    con = connect_sqlite(settings.db_path)
    try:
        cur = con.execute(
            """
            select endpoint,
                   json_path,
                   field_name,
                   value_type,
                   example_value,
                   seen_count,
                   first_seen_utc,
                   last_seen_utc
            from api_field_catalog
            where provider = ?
            order by endpoint, json_path
            """,
            (provider,),
        )
        rows = cur.fetchall()
        cols = [c[0] for c in cur.description]
    finally:
        con.close()

    # Agrupa por endpoint
    by_endpoint: Dict[str, List[Dict[str, Any]]] = {}
    for r in rows:
        rec = dict(zip(cols, r))
        endpoint = rec.pop("endpoint")
        by_endpoint.setdefault(endpoint, []).append(rec)

    # Aplica limite (segurança)
    for ep, items in list(by_endpoint.items()):
        if len(items) > limit_per_endpoint:
            by_endpoint[ep] = items[:limit_per_endpoint]

    payload = {
        "schema": "field_catalog.v1",
        "provider": provider,
        "exported_at_utc": _utcnow_iso(),
        "db_path": settings.db_path,
        "endpoints": [
            {
                "endpoint": ep,
                "count": len(items),
                "fields": items,
            }
            for ep, items in sorted(by_endpoint.items(), key=lambda x: x[0])
        ],
    }

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    return {
        "ok": True,
        "provider": provider,
        "out_path": str(out_path),
        "endpoints": len(payload["endpoints"]),
        "fields_total": sum(e["count"] for e in payload["endpoints"]),
    }
