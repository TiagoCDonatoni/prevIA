from fastapi import APIRouter, Query
from fastapi import HTTPException
import traceback

from src.core.settings import load_settings
from src.db.engine import connect_sqlite
from src.ingest.runner import (
    run_apifootball_manifest,
    run_apifootball_callplan,
    run_apifootball_fixtures_callplan,
)

from src.ingest.callplan_fixtures import preview_apifootball_fixture_calls_from_db

from pathlib import Path
from src.contracts.exporter import export_field_catalog
from src.core.settings import BASE_DIR

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/status")
def admin_status():
    """
    Endpoint para você ter controle do que existe e como chamar.
    """
    return {
        "ok": True,
        "endpoints": [
            {"method": "POST", "path": "/api/admin/ingest/apifootball", "desc": "Ingest base (seasons/countries/leagues) via manifest"},
            {"method": "GET",  "path": "/api/admin/ingest/apifootball", "desc": "Atalho no browser (mesmo do POST)"},
            {"method": "POST", "path": "/api/admin/ingest/apifootball/callplan", "desc": "Callplan nível 1 (leagues -> teams/standings/fixtures)"},
            {"method": "GET",  "path": "/api/admin/ingest/apifootball/callplan", "desc": "Atalho no browser (mesmo do POST)"},
            {"method": "POST", "path": "/api/admin/ingest/apifootball/fixtures-callplan", "desc": "Callplan nível 2 (fixtures -> events/lineups/statistics)"},
            {"method": "GET",  "path": "/api/admin/ingest/apifootball/fixtures-callplan", "desc": "Atalho no browser (mesmo do POST)"},
            {"method": "GET",  "path": "/api/admin/catalog/fields?endpoint=...", "desc": "Lista catálogo de campos para um endpoint_key"},
            {"method": "GET",  "path": "/api/admin/raw/latest?endpoint=...", "desc": "Mostra o RAW mais recente salvo para um endpoint_key"}
        ]
    }


def _run_with_trace(fn):
    try:
        return fn()
    except Exception as ex:
        tb = traceback.format_exc()
        raise HTTPException(status_code=500, detail={
            "error": str(ex),
            "trace": tb.splitlines()[-30:]
        })


@router.post("/ingest/apifootball")
def ingest_apifootball():
    return {"ok": True, "results": _run_with_trace(run_apifootball_manifest)}


@router.get("/ingest/apifootball")
def ingest_apifootball_get():
    return {"ok": True, "method": "GET", "results": _run_with_trace(run_apifootball_manifest)}


@router.post("/ingest/apifootball/callplan")
def ingest_apifootball_callplan():
    return {"ok": True, "results": _run_with_trace(run_apifootball_callplan)}


@router.get("/ingest/apifootball/callplan")
def ingest_apifootball_callplan_get():
    return {"ok": True, "method": "GET", "results": _run_with_trace(run_apifootball_callplan)}


@router.post("/ingest/apifootball/fixtures-callplan")
def ingest_apifootball_fixtures_callplan():
    return {"ok": True, "results": _run_with_trace(run_apifootball_fixtures_callplan)}


@router.get("/ingest/apifootball/fixtures-callplan")
def ingest_apifootball_fixtures_callplan_get():
    return {"ok": True, "method": "GET", "results": _run_with_trace(run_apifootball_fixtures_callplan)}


@router.get("/catalog/fields")
def list_fields(endpoint: str = Query(...), limit: int = 200):
    settings = load_settings()
    con = connect_sqlite(settings.db_path)
    try:
        cur = con.execute(
            """
            select json_path, field_name, value_type, example_value, seen_count, first_seen_utc, last_seen_utc
            from api_field_catalog
            where endpoint = ?
            order by json_path
            limit ?
            """,
            (endpoint, int(limit)),
        )
        rows = [dict(zip([c[0] for c in cur.description], r)) for r in cur.fetchall()]
        return {"ok": True, "endpoint": endpoint, "count": len(rows), "rows": rows}
    finally:
        con.close()


@router.get("/raw/latest")
def latest_raw(endpoint: str = Query(...)):
    settings = load_settings()
    con = connect_sqlite(settings.db_path)
    try:
        cur = con.execute(
            """
            select id, fetched_at_utc, status_code, params_json, payload_json, error_json
            from api_raw
            where endpoint = ?
            order by id desc
            limit 1
            """,
            (endpoint,),
        )
        row = cur.fetchone()
        if not row:
            return {"ok": True, "found": False}
        keys = [c[0] for c in cur.description]
        return {"ok": True, "found": True, "row": dict(zip(keys, row))}
    finally:
        con.close()

from fastapi import HTTPException
import traceback

@router.get("/plan/apifootball/fixtures-callplan")
def preview_fixtures_callplan():
    try:
        return {"ok": True, "preview": preview_apifootball_fixture_calls_from_db()}
    except Exception as ex:
        tb = traceback.format_exc()
        raise HTTPException(status_code=500, detail={
            "error": str(ex),
            "trace": tb.splitlines()[-30:]
        })

@router.get("/contracts/export/apifootball")
def export_apifootball_contract():
    # arquivo versionado; pode mudar no futuro para v2 sem quebrar
    out_path = Path(BASE_DIR) / "contracts" / "apifootball.field_catalog.v1.json"
    result = export_field_catalog(provider="apifootball", out_path=out_path)
    return result

@router.get("/raw/latest-by-instance")
def raw_latest_by_instance(instance: str):
    settings = load_settings()
    con = connect_sqlite(settings.db_path)
    try:
        cur = con.execute(
            """
            select id, fetched_at_utc, status_code, params_json, payload_json, error_json, endpoint, instance_key
            from api_raw
            where instance_key = ?
            order by id desc
            limit 1
            """,
            (instance,),
        )
        row = cur.fetchone()
        if not row:
            return {"ok": True, "found": False, "instance": instance}
        cols = [c[0] for c in cur.description]
        return {"ok": True, "found": True, "row": dict(zip(cols, row))}
    finally:
        con.close()
