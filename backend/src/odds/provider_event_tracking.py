from __future__ import annotations

import json
from typing import Any, Dict, Optional


TERMINAL_REFRESH_STATUSES = {
    "ok",
    "skipped_no_match",
    "skipped_no_supported_bookmakers",
    "skipped_no_supported_markets",
    "skipped_already_started",
    "skipped_not_eligible",
}


def _json_dumps_or_none(value: Any) -> Optional[str]:
    if value is None:
        return None

    try:
        return json.dumps(value, ensure_ascii=False, default=str)
    except Exception:
        return json.dumps({"raw": str(value)}, ensure_ascii=False)


def _row_to_provider_event_map(row: Any) -> Optional[Dict[str, Any]]:
    if not row:
        return None

    return {
        "provider": row[0],
        "provider_event_id": row[1],
        "canonical_event_id": row[2],
        "core_fixture_id": int(row[3]) if row[3] is not None else None,
        "sport_key": row[4],
        "confidence": float(row[5]) if row[5] is not None else None,
        "match_reason": row[6],
        "raw_json": row[7],
        "active": bool(row[8]),
        "created_at_utc": row[9].isoformat() if row[9] else None,
        "updated_at_utc": row[10].isoformat() if row[10] else None,
    }


def _row_to_refresh_log(row: Any) -> Optional[Dict[str, Any]]:
    if not row:
        return None

    return {
        "provider": row[0],
        "core_fixture_id": int(row[1]) if row[1] is not None else None,
        "canonical_event_id": row[2],
        "provider_event_id": row[3],
        "policy_bucket": row[4],
        "status": row[5],
        "error": row[6],
        "attempt_count": int(row[7] or 0),
        "last_attempt_at_utc": row[8].isoformat() if row[8] else None,
        "refreshed_at_utc": row[9].isoformat() if row[9] else None,
        "created_at_utc": row[10].isoformat() if row[10] else None,
        "updated_at_utc": row[11].isoformat() if row[11] else None,
    }


def upsert_provider_event_map(
    conn,
    *,
    provider: str,
    provider_event_id: str,
    canonical_event_id: str,
    core_fixture_id: int,
    sport_key: str,
    confidence: Optional[float] = None,
    match_reason: Optional[str] = None,
    raw_json: Any = None,
    active: bool = True,
) -> Dict[str, Any]:
    """
    Registra o vínculo entre evento externo e evento canônico do prevIA.

    Para OddsPapi:
    - provider = "oddspapi"
    - provider_event_id = id do evento/fixture na OddsPapi
    - canonical_event_id = odds.odds_events.event_id atual
    - core_fixture_id = core.fixtures.fixture_id atual
    """

    safe_provider = str(provider or "").strip()
    safe_provider_event_id = str(provider_event_id or "").strip()
    safe_canonical_event_id = str(canonical_event_id or "").strip()
    safe_sport_key = str(sport_key or "").strip()

    if not safe_provider:
        raise ValueError("provider_required")
    if not safe_provider_event_id:
        raise ValueError("provider_event_id_required")
    if not safe_canonical_event_id:
        raise ValueError("canonical_event_id_required")
    if not int(core_fixture_id or 0):
        raise ValueError("core_fixture_id_required")
    if not safe_sport_key:
        raise ValueError("sport_key_required")

    sql = """
      INSERT INTO odds.provider_event_map (
        provider,
        provider_event_id,
        canonical_event_id,
        core_fixture_id,
        sport_key,
        confidence,
        match_reason,
        raw_json,
        active,
        created_at_utc,
        updated_at_utc
      )
      VALUES (
        %(provider)s,
        %(provider_event_id)s,
        %(canonical_event_id)s,
        %(core_fixture_id)s,
        %(sport_key)s,
        %(confidence)s,
        %(match_reason)s,
        %(raw_json)s::jsonb,
        %(active)s,
        now(),
        now()
      )
      ON CONFLICT (provider, provider_event_id) DO UPDATE SET
        canonical_event_id = EXCLUDED.canonical_event_id,
        core_fixture_id = EXCLUDED.core_fixture_id,
        sport_key = EXCLUDED.sport_key,
        confidence = EXCLUDED.confidence,
        match_reason = EXCLUDED.match_reason,
        raw_json = EXCLUDED.raw_json,
        active = EXCLUDED.active,
        updated_at_utc = now()
      RETURNING
        provider,
        provider_event_id,
        canonical_event_id,
        core_fixture_id,
        sport_key,
        confidence,
        match_reason,
        raw_json,
        active,
        created_at_utc,
        updated_at_utc
    """

    with conn.cursor() as cur:
        cur.execute(
            sql,
            {
                "provider": safe_provider,
                "provider_event_id": safe_provider_event_id,
                "canonical_event_id": safe_canonical_event_id,
                "core_fixture_id": int(core_fixture_id),
                "sport_key": safe_sport_key,
                "confidence": confidence,
                "match_reason": str(match_reason)[:255] if match_reason else None,
                "raw_json": _json_dumps_or_none(raw_json),
                "active": bool(active),
            },
        )
        row = cur.fetchone()

    result = _row_to_provider_event_map(row)
    if not result:
        raise RuntimeError("provider_event_map_upsert_failed")

    return result


def get_active_provider_event_map(
    conn,
    *,
    provider: str,
    core_fixture_id: int,
) -> Optional[Dict[str, Any]]:
    sql = """
      SELECT
        provider,
        provider_event_id,
        canonical_event_id,
        core_fixture_id,
        sport_key,
        confidence,
        match_reason,
        raw_json,
        active,
        created_at_utc,
        updated_at_utc
      FROM odds.provider_event_map
      WHERE provider = %(provider)s
        AND core_fixture_id = %(core_fixture_id)s
        AND active = true
      ORDER BY updated_at_utc DESC
      LIMIT 1
    """

    with conn.cursor() as cur:
        cur.execute(
            sql,
            {
                "provider": str(provider or "").strip(),
                "core_fixture_id": int(core_fixture_id),
            },
        )
        row = cur.fetchone()

    return _row_to_provider_event_map(row)


def get_provider_refresh_log(
    conn,
    *,
    provider: str,
    core_fixture_id: int,
    policy_bucket: str,
) -> Optional[Dict[str, Any]]:
    sql = """
      SELECT
        provider,
        core_fixture_id,
        canonical_event_id,
        provider_event_id,
        policy_bucket,
        status,
        error,
        attempt_count,
        last_attempt_at_utc,
        refreshed_at_utc,
        created_at_utc,
        updated_at_utc
      FROM odds.provider_event_refresh_log
      WHERE provider = %(provider)s
        AND core_fixture_id = %(core_fixture_id)s
        AND policy_bucket = %(policy_bucket)s
      LIMIT 1
    """

    with conn.cursor() as cur:
        cur.execute(
            sql,
            {
                "provider": str(provider or "").strip(),
                "core_fixture_id": int(core_fixture_id),
                "policy_bucket": str(policy_bucket or "").strip(),
            },
        )
        row = cur.fetchone()

    return _row_to_refresh_log(row)


def should_skip_provider_refresh(
    conn,
    *,
    provider: str,
    core_fixture_id: int,
    policy_bucket: str,
) -> Dict[str, Any]:
    """
    Evita consumir request duas vezes no mesmo bucket operacional.

    Exemplo:
    - matchday já atualizado com ok -> pula
    - d_1 já atualizado com ok -> pula
    - erro/network_error -> não pula, permite tentativa futura
    """

    existing = get_provider_refresh_log(
        conn,
        provider=provider,
        core_fixture_id=core_fixture_id,
        policy_bucket=policy_bucket,
    )

    if not existing:
        return {
            "skip": False,
            "reason": None,
            "existing": None,
        }

    status = str(existing.get("status") or "").strip()

    if status in TERMINAL_REFRESH_STATUSES:
        return {
            "skip": True,
            "reason": f"already_terminal_status:{status}",
            "existing": existing,
        }

    return {
        "skip": False,
        "reason": None,
        "existing": existing,
    }


def record_provider_refresh_log(
    conn,
    *,
    provider: str,
    core_fixture_id: int,
    canonical_event_id: str,
    policy_bucket: str,
    status: str,
    provider_event_id: Optional[str] = None,
    error: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Registra uma tentativa de refresh/enriquecimento por provider/bucket.

    Status sugeridos:
    - ok
    - skipped_no_match
    - skipped_no_supported_bookmakers
    - skipped_no_supported_markets
    - skipped_already_started
    - skipped_not_eligible
    - failed_provider_http
    - failed_network
    - failed_parse
    - failed_internal
    """

    safe_provider = str(provider or "").strip()
    safe_canonical_event_id = str(canonical_event_id or "").strip()
    safe_policy_bucket = str(policy_bucket or "").strip()
    safe_status = str(status or "").strip()[:80]
    safe_provider_event_id = str(provider_event_id).strip() if provider_event_id else None
    safe_error = str(error)[:1000] if error else None

    if not safe_provider:
        raise ValueError("provider_required")
    if not int(core_fixture_id or 0):
        raise ValueError("core_fixture_id_required")
    if not safe_canonical_event_id:
        raise ValueError("canonical_event_id_required")
    if not safe_policy_bucket:
        raise ValueError("policy_bucket_required")
    if not safe_status:
        raise ValueError("status_required")

    is_terminal = safe_status in TERMINAL_REFRESH_STATUSES

    sql = """
      INSERT INTO odds.provider_event_refresh_log (
        provider,
        core_fixture_id,
        canonical_event_id,
        provider_event_id,
        policy_bucket,
        status,
        error,
        attempt_count,
        last_attempt_at_utc,
        refreshed_at_utc,
        created_at_utc,
        updated_at_utc
      )
      VALUES (
        %(provider)s,
        %(core_fixture_id)s,
        %(canonical_event_id)s,
        %(provider_event_id)s,
        %(policy_bucket)s,
        %(status)s,
        %(error)s,
        1,
        now(),
        CASE WHEN %(is_terminal)s THEN now() ELSE NULL END,
        now(),
        now()
      )
      ON CONFLICT (provider, core_fixture_id, policy_bucket) DO UPDATE SET
        canonical_event_id = EXCLUDED.canonical_event_id,
        provider_event_id = EXCLUDED.provider_event_id,
        status = EXCLUDED.status,
        error = EXCLUDED.error,
        attempt_count = odds.provider_event_refresh_log.attempt_count + 1,
        last_attempt_at_utc = now(),
        refreshed_at_utc = CASE
          WHEN %(is_terminal)s THEN now()
          ELSE odds.provider_event_refresh_log.refreshed_at_utc
        END,
        updated_at_utc = now()
      RETURNING
        provider,
        core_fixture_id,
        canonical_event_id,
        provider_event_id,
        policy_bucket,
        status,
        error,
        attempt_count,
        last_attempt_at_utc,
        refreshed_at_utc,
        created_at_utc,
        updated_at_utc
    """

    with conn.cursor() as cur:
        cur.execute(
            sql,
            {
                "provider": safe_provider,
                "core_fixture_id": int(core_fixture_id),
                "canonical_event_id": safe_canonical_event_id,
                "provider_event_id": safe_provider_event_id,
                "policy_bucket": safe_policy_bucket,
                "status": safe_status,
                "error": safe_error,
                "is_terminal": bool(is_terminal),
            },
        )
        row = cur.fetchone()

    result = _row_to_refresh_log(row)
    if not result:
        raise RuntimeError("provider_refresh_log_record_failed")

    return result