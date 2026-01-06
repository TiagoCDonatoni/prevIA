from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List

from src.core.settings import load_settings, CONFIG_DIR
from src.db.engine import connect_sqlite
from src.catalog.field_catalog import iter_json_paths, utcnow_iso

from src.provider.apifootball.client import ApiFootballClient
from src.ingest.callplan import build_apifootball_calls_from_db
from src.ingest.callplan_fixtures import build_apifootball_fixture_calls_from_db

from src.contracts.endpoint_registry import make_instance_key


def _read_json(path: Path) -> Dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _dump(obj: Any) -> str:
    return json.dumps(obj, ensure_ascii=False)


def save_raw(
    con,
    provider: str,
    endpoint: str,  # endpoint_key (ex: "apifootball:fixtures:/fixtures")
    path: str,      # path cru (ex: "/fixtures")
    params: Dict[str, Any],
    status_code: int,
    payload: Dict[str, Any],
) -> None:
    fetched_at_utc = utcnow_iso()

    params_json = _dump(params)
    payload_json = _dump(payload) if payload is not None else None

    error_obj = payload.get("errors") if isinstance(payload, dict) else None
    error_json = _dump(error_obj) if error_obj else None

    instance_key = make_instance_key(provider, path, params)

    con.execute(
        """
        insert into api_raw(
          provider, endpoint, instance_key,
          params_json, fetched_at_utc, status_code,
          payload_json, error_json
        )
        values (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            provider,
            endpoint,
            instance_key,
            params_json,
            fetched_at_utc,
            status_code,
            payload_json,
            error_json,
        ),
    )


def upsert_field(
    con,
    provider: str,
    endpoint: str,
    json_path: str,
    field_name: str,
    value_type: str,
    example_value: str | None,
) -> None:
    now = utcnow_iso()
    con.execute(
        """
        insert into api_field_catalog(
          provider, endpoint, json_path, field_name, value_type, example_value,
          first_seen_utc, last_seen_utc, seen_count
        )
        values(?,?,?,?,?,?,?,?,1)
        on conflict(provider, endpoint, json_path)
        do update set
          last_seen_utc=excluded.last_seen_utc,
          seen_count=api_field_catalog.seen_count+1,
          value_type=excluded.value_type,
          example_value=excluded.example_value
        """,
        (provider, endpoint, json_path, field_name, value_type, example_value, now, now),
    )


def catalog_payload(con, provider: str, endpoint: str, payload: Dict[str, Any]) -> None:
    for json_path, field_name, value_type, example_value in iter_json_paths(payload):
        upsert_field(con, provider, endpoint, json_path, field_name, value_type, example_value)


def run_apifootball_manifest() -> List[Dict[str, Any]]:
    settings = load_settings()

    manifest = _read_json(CONFIG_DIR / "endpoints.apifootball.json")
    provider = manifest.get("provider", "apifootball")
    endpoints = [e for e in manifest.get("endpoints", []) if e.get("enabled")]

    client = ApiFootballClient(
        base_url=settings.apifootball_base_url,
        api_key=settings.apifootball_key,
        timeout_s=int(settings.app_defaults.get("http_timeout_s", 30)),
    )

    results: List[Dict[str, Any]] = []

    con = connect_sqlite(settings.db_path)
    try:
        con.execute("begin;")

        for ep in endpoints:
            ep_id = ep.get("id")
            path = ep.get("path")
            params = ep.get("sample_params", {}) or {}

            try:
                status, payload = client.get(path, params)
            except Exception as ex:
                status, payload = 599, {"errors": {"exception": str(ex)}, "response": None}

            endpoint_key = f"{provider}:{ep_id}:{path}"

            # IMPORTANT: agora passamos o path para gerar instance_key corretamente
            save_raw(con, provider, endpoint_key, path, params, status, payload)

            if isinstance(payload, dict):
                catalog_payload(con, provider, endpoint_key, payload)

            results.append(
                {
                    "provider": provider,
                    "id": ep_id,
                    "path": path,
                    "status": status,
                    "saved_as": endpoint_key,
                }
            )

        con.execute("commit;")
    except Exception:
        con.execute("rollback;")
        raise
    finally:
        con.close()

    return results


def ingest_apifootball_calls(calls: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    settings = load_settings()

    client = ApiFootballClient(
        base_url=settings.apifootball_base_url,
        api_key=settings.apifootball_key,
        timeout_s=int(settings.app_defaults.get("http_timeout_s", 30)),
    )

    provider = "apifootball"
    results: List[Dict[str, Any]] = []

    con = connect_sqlite(settings.db_path)
    try:
        for c in calls:
            ep_id = c["id"]
            path = c["path"]
            params = c["params"]

            try:
                status, payload = client.get(path, params)
            except Exception as ex:
                status, payload = 599, {"errors": {"exception": str(ex)}, "response": None}

            endpoint_key = f"{provider}:{ep_id}:{path}"

            # commit por call = previsível (como você quer)
            save_raw(con, provider, endpoint_key, path, params, status, payload)
            if isinstance(payload, dict):
                catalog_payload(con, provider, endpoint_key, payload)
            con.commit()

            results.append(
                {
                    "provider": provider,
                    "id": ep_id,
                    "path": path,
                    "status": status,
                    "saved_as": endpoint_key,
                    "meta": c.get("meta", {}),
                }
            )
    finally:
        con.close()

    return results


def run_apifootball_callplan() -> List[Dict[str, Any]]:
    calls = build_apifootball_calls_from_db()
    return ingest_apifootball_calls(calls)


def run_apifootball_fixtures_callplan() -> List[Dict[str, Any]]:
    calls = build_apifootball_fixture_calls_from_db()
    return ingest_apifootball_calls(calls)
