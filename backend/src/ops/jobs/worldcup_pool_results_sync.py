from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

from src.core.settings import load_settings
from src.db.pg import pg_conn
from src.provider.apifootball.client import ApiFootballClient

API_PROVIDER = "api_football"
COMPETITION_KEY = "fifa_world_cup_2026"

FINAL_STATUS_SHORTS = {"FT", "AET", "PEN", "AWD", "WO"}
POSTPONED_STATUS_SHORTS = {"PST", "SUSP", "INT"}
CANCELLED_STATUS_SHORTS = {"CANC", "ABD"}


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _jsonb(value: Any) -> str:
    return json.dumps(value or {}, ensure_ascii=False, default=str)


def _chunks(items: Sequence[int], size: int) -> Iterable[List[int]]:
    chunk_size = max(1, int(size or 20))
    for i in range(0, len(items), chunk_size):
        yield list(items[i:i + chunk_size])


def _safe_int(value: Any) -> Optional[int]:
    if value is None:
        return None

    try:
        return int(value)
    except Exception:
        return None


def _fixture_id(item: Dict[str, Any]) -> Optional[int]:
    return _safe_int(((item.get("fixture") or {}).get("id")))


def _status_short(item: Dict[str, Any]) -> str:
    status = ((item.get("fixture") or {}).get("status") or {})
    return str(status.get("short") or "").strip().upper()


def _status_long(item: Dict[str, Any]) -> Optional[str]:
    status = ((item.get("fixture") or {}).get("status") or {})
    value = status.get("long")
    return str(value).strip() if value is not None else None


def _status_elapsed(item: Dict[str, Any]) -> Optional[int]:
    status = ((item.get("fixture") or {}).get("status") or {})
    return _safe_int(status.get("elapsed"))


def _score_from_fixture(item: Dict[str, Any]) -> Tuple[Optional[int], Optional[int]]:
    goals = item.get("goals") or {}
    return _safe_int(goals.get("home")), _safe_int(goals.get("away"))


def _api_team_id(item: Dict[str, Any], side: str) -> Optional[int]:
    teams = item.get("teams") or {}
    team = teams.get(side) or {}
    return _safe_int(team.get("id"))


def _api_round(item: Dict[str, Any]) -> Optional[str]:
    league = item.get("league") or {}
    value = league.get("round")
    return str(value).strip() if value is not None else None


def _normalize_api_round_phase(api_round: Optional[str]) -> Optional[str]:
    raw = str(api_round or "").strip().lower()

    if not raw:
        return None

    normalized = raw
    normalized = normalized.replace("-", " ")
    normalized = normalized.replace("_", " ")
    normalized = " ".join(normalized.split())

    if "group" in normalized:
        return "group"

    if (
        "round of 32" in normalized
        or "last 32" in normalized
        or "1/16" in normalized
        or "32" in normalized
    ):
        return "round_of_32"

    if (
        "round of 16" in normalized
        or "last 16" in normalized
        or "1/8" in normalized
        or "16" in normalized
    ):
        return "round_of_16"

    if (
        "quarter" in normalized
        or "quarter final" in normalized
        or "quarter finals" in normalized
        or "1/4" in normalized
    ):
        return "quarter_final"

    if (
        "semi" in normalized
        or "semi final" in normalized
        or "semi finals" in normalized
        or "1/2" in normalized
    ):
        return "semi_final"

    if (
        "third" in normalized
        or "3rd" in normalized
        or "third place" in normalized
        or "3rd place" in normalized
    ):
        return "third_place"

    if normalized == "final" or normalized.endswith(" final"):
        return "final"

    return None


def _api_round_phase_diagnostic(
    *,
    internal_phase: Optional[str],
    item: Dict[str, Any],
) -> Tuple[Optional[str], Optional[str], Optional[str]]:
    api_round = _api_round(item)
    api_phase = _normalize_api_round_phase(api_round)
    clean_internal_phase = str(internal_phase or "").strip()

    if not api_round or not api_phase or not clean_internal_phase:
        return api_phase, None, None

    if api_phase == clean_internal_phase:
        return api_phase, None, None

    return (
        api_phase,
        "api_round_phase_mismatch",
        (
            f"API round '{api_round}' maps to phase '{api_phase}', "
            f"but internal phase is '{clean_internal_phase}'. "
            "Internal phase was kept as source of truth."
        ),
    )


def _api_venue_name(item: Dict[str, Any]) -> Optional[str]:
    venue = (item.get("fixture") or {}).get("venue") or {}
    value = venue.get("name")
    return str(value).strip() if value is not None else None


def _api_venue_city(item: Dict[str, Any]) -> Optional[str]:
    venue = (item.get("fixture") or {}).get("venue") or {}
    value = venue.get("city")
    return str(value).strip() if value is not None else None


def _load_candidate_matches(
    *,
    competition_key: str,
    limit: int,
    lookback_days: int,
    min_minutes_after_kickoff: int,
    match_ids: Optional[Sequence[int]] = None,
    api_fixture_ids: Optional[Sequence[int]] = None,
) -> List[Dict[str, Any]]:
    clean_match_ids = [int(item) for item in (match_ids or []) if item]
    clean_api_fixture_ids = [int(item) for item in (api_fixture_ids or []) if item]
    has_targets = bool(clean_match_ids or clean_api_fixture_ids)

    sql = """
      SELECT
        id,
        api_fixture_id,
        phase,
        kickoff_utc,
        status,
        home_score,
        away_score,
        result_source,
        api_final_seen_at_utc
      FROM worldcup_pool.matches
      WHERE competition_key = %(competition_key)s
        AND api_provider = %(api_provider)s
        AND api_fixture_id IS NOT NULL
        AND status <> 'cancelled'
        AND (
          (
            %(has_targets)s = TRUE
            AND (
              (
                %(match_ids)s::bigint[] IS NOT NULL
                AND id = ANY(%(match_ids)s::bigint[])
              )
              OR (
                %(api_fixture_ids)s::bigint[] IS NOT NULL
                AND api_fixture_id = ANY(%(api_fixture_ids)s::bigint[])
              )
            )
          )
          OR (
            %(has_targets)s = FALSE
            AND kickoff_utc IS NOT NULL
            AND kickoff_utc >= NOW() - (%(lookback_days)s::int * INTERVAL '1 day')
            AND kickoff_utc <= NOW() - (%(min_minutes_after_kickoff)s::int * INTERVAL '1 minute')
            AND (
              status <> 'finished'
              OR api_final_confirmed_at_utc IS NULL
            )
          )
        )
      ORDER BY kickoff_utc ASC NULLS LAST, id ASC
      LIMIT %(limit)s
    """


    with pg_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                sql,
                {
                    "competition_key": competition_key,
                    "api_provider": API_PROVIDER,
                    "lookback_days": max(1, int(lookback_days or 14)),
                    "min_minutes_after_kickoff": max(1, int(min_minutes_after_kickoff or 100)),
                    "limit": max(1, int(limit or 60)),
                    "has_targets": has_targets,
                    "match_ids": clean_match_ids or None,
                    "api_fixture_ids": clean_api_fixture_ids or None,
                },
            )
            rows = cur.fetchall()

    return [
        {
            "id": int(row[0]),
            "api_fixture_id": int(row[1]),
            "phase": str(row[2] or "").strip() or None,
            "kickoff_utc": row[3],
            "status": str(row[4] or ""),
            "home_score": row[5],
            "away_score": row[6],
            "result_source": str(row[7] or "").strip() or None,
            "api_final_seen_at_utc": row[8],
        }
        for row in rows
    ]


def _fetch_fixtures_by_ids(
    client: ApiFootballClient,
    fixture_ids: Sequence[int],
) -> Tuple[int, Dict[str, Any]]:
    ids_param = "-".join(str(int(item)) for item in fixture_ids if item)
    return client.get("/fixtures", {"ids": ids_param})


def _update_api_snapshot_only(
    *,
    match_id: int,
    item: Dict[str, Any],
    mapping_status: Optional[str] = None,
    mapping_note: Optional[str] = None,
) -> None:
    sql = """
      UPDATE worldcup_pool.matches
      SET
        api_home_team_id = COALESCE(%(api_home_team_id)s, api_home_team_id),
        api_away_team_id = COALESCE(%(api_away_team_id)s, api_away_team_id),
        api_status_short = %(api_status_short)s,
        api_status_long = %(api_status_long)s,
        api_status_elapsed = %(api_status_elapsed)s,
        api_round = %(api_round)s,
        api_venue_name = %(api_venue_name)s,
        api_venue_city = %(api_venue_city)s,
        api_mapping_status = COALESCE(%(api_mapping_status)s, api_mapping_status),
        api_mapping_note = COALESCE(%(api_mapping_note)s, api_mapping_note),
        api_raw_snapshot = %(api_raw_snapshot)s::jsonb,
        api_last_synced_at_utc = NOW(),
        updated_at_utc = NOW()
      WHERE id = %(match_id)s
    """

    with pg_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                sql,
                {
                    "match_id": match_id,
                    "api_home_team_id": _api_team_id(item, "home"),
                    "api_away_team_id": _api_team_id(item, "away"),
                    "api_status_short": _status_short(item) or None,
                    "api_status_long": _status_long(item),
                    "api_status_elapsed": _status_elapsed(item),
                    "api_round": _api_round(item),
                    "api_venue_name": _api_venue_name(item),
                    "api_venue_city": _api_venue_city(item),
                    "api_mapping_status": mapping_status,
                    "api_mapping_note": mapping_note,
                    "api_raw_snapshot": _jsonb(item),
                },
            )
        conn.commit()


def _mark_final_seen(
    *,
    match_id: int,
    item: Dict[str, Any],
    mapping_status: Optional[str] = None,
    mapping_note: Optional[str] = None,
) -> None:
    sql = """
      UPDATE worldcup_pool.matches
      SET
        api_home_team_id = COALESCE(%(api_home_team_id)s, api_home_team_id),
        api_away_team_id = COALESCE(%(api_away_team_id)s, api_away_team_id),
        api_status_short = %(api_status_short)s,
        api_status_long = %(api_status_long)s,
        api_status_elapsed = %(api_status_elapsed)s,
        api_round = %(api_round)s,
        api_venue_name = %(api_venue_name)s,
        api_venue_city = %(api_venue_city)s,
        api_mapping_status = COALESCE(%(api_mapping_status)s, api_mapping_status),
        api_mapping_note = COALESCE(%(api_mapping_note)s, api_mapping_note),
        api_final_seen_at_utc = COALESCE(api_final_seen_at_utc, NOW()),
        api_raw_snapshot = %(api_raw_snapshot)s::jsonb,
        api_last_synced_at_utc = NOW(),
        updated_at_utc = NOW()
      WHERE id = %(match_id)s
    """

    with pg_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                sql,
                {
                    "match_id": match_id,
                    "api_home_team_id": _api_team_id(item, "home"),
                    "api_away_team_id": _api_team_id(item, "away"),
                    "api_status_short": _status_short(item),
                    "api_status_long": _status_long(item),
                    "api_status_elapsed": _status_elapsed(item),
                    "api_round": _api_round(item),
                    "api_venue_name": _api_venue_name(item),
                    "api_venue_city": _api_venue_city(item),
                    "api_mapping_status": mapping_status,
                    "api_mapping_note": mapping_note,
                    "api_raw_snapshot": _jsonb(item),
                },
            )
        conn.commit()


def _finalize_match_from_api(
    *,
    match: Dict[str, Any],
    item: Dict[str, Any],
    home_score: int,
    away_score: int,
) -> Dict[str, Any]:
    existing_result_source = match.get("result_source")
    existing_home_score = match.get("home_score")
    existing_away_score = match.get("away_score")
    _, mapping_status, mapping_note = _api_round_phase_diagnostic(
        internal_phase=match.get("phase"),
        item=item,
    )

    if (
        existing_result_source
        and existing_result_source != API_PROVIDER
        and (existing_home_score != home_score or existing_away_score != away_score)
    ):
        sql = """
          UPDATE worldcup_pool.matches
          SET
            api_status_short = %(api_status_short)s,
            api_status_long = %(api_status_long)s,
            api_status_elapsed = %(api_status_elapsed)s,
            api_mapping_status = 'result_conflict',
            api_mapping_note = %(api_mapping_note)s,
            api_raw_snapshot = %(api_raw_snapshot)s::jsonb,
            api_last_synced_at_utc = NOW(),
            updated_at_utc = NOW()
          WHERE id = %(match_id)s
        """

        with pg_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    sql,
                    {
                        "match_id": int(match["id"]),
                        "api_status_short": _status_short(item),
                        "api_status_long": _status_long(item),
                        "api_status_elapsed": _status_elapsed(item),
                        "api_mapping_note": (
                            f"API score {home_score}-{away_score} conflicts with "
                            f"existing {existing_result_source} score "
                            f"{existing_home_score}-{existing_away_score}."
                        ),
                        "api_raw_snapshot": _jsonb(item),
                    },
                )
            conn.commit()

        return {"finalized": False, "conflict": True}

    sql = """
      UPDATE worldcup_pool.matches
      SET
        status = 'finished',
        home_score = %(home_score)s,
        away_score = %(away_score)s,
        result_source = CASE
          WHEN result_source IS NULL OR result_source = '' OR result_source = %(api_provider)s
            THEN %(api_provider)s
          ELSE result_source
        END,
        result_confirmed_at_utc = COALESCE(result_confirmed_at_utc, NOW()),
        api_home_team_id = COALESCE(%(api_home_team_id)s, api_home_team_id),
        api_away_team_id = COALESCE(%(api_away_team_id)s, api_away_team_id),
        api_status_short = %(api_status_short)s,
        api_status_long = %(api_status_long)s,
        api_status_elapsed = %(api_status_elapsed)s,
        api_round = %(api_round)s,
        api_venue_name = %(api_venue_name)s,
        api_venue_city = %(api_venue_city)s,
        api_mapping_status = COALESCE(%(api_mapping_status)s, api_mapping_status),
        api_mapping_note = COALESCE(%(api_mapping_note)s, api_mapping_note),
        api_final_seen_at_utc = COALESCE(api_final_seen_at_utc, NOW()),
        api_final_confirmed_at_utc = NOW(),
        api_raw_snapshot = %(api_raw_snapshot)s::jsonb,
        api_last_synced_at_utc = NOW(),
        updated_at_utc = NOW()
      WHERE id = %(match_id)s
      RETURNING id
    """

    lock_predictions_sql = """
      UPDATE worldcup_pool.predictions
      SET
        locked_at_utc = COALESCE(locked_at_utc, NOW()),
        updated_at_utc = NOW()
      WHERE match_id = %(match_id)s
        AND locked_at_utc IS NULL
    """

    event_sql = """
      INSERT INTO worldcup_pool.events (
        pool_id,
        participant_id,
        actor_type,
        actor_id,
        event_name,
        payload
      )
      VALUES (
        NULL,
        NULL,
        'system',
        NULL,
        'worldcup_match_result_synced_from_api',
        %(payload)s::jsonb
      )
    """

    with pg_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                sql,
                {
                    "match_id": int(match["id"]),
                    "home_score": home_score,
                    "away_score": away_score,
                    "api_provider": API_PROVIDER,
                    "api_home_team_id": _api_team_id(item, "home"),
                    "api_away_team_id": _api_team_id(item, "away"),
                    "api_status_short": _status_short(item),
                    "api_status_long": _status_long(item),
                    "api_status_elapsed": _status_elapsed(item),
                    "api_round": _api_round(item),
                    "api_venue_name": _api_venue_name(item),
                    "api_venue_city": _api_venue_city(item),
                    "api_mapping_status": mapping_status,
                    "api_mapping_note": mapping_note,
                    "api_raw_snapshot": _jsonb(item),
                },
            )
            updated = cur.fetchone() is not None

            if updated:
                cur.execute(lock_predictions_sql, {"match_id": int(match["id"])})
                predictions_locked = int(cur.rowcount or 0)

                cur.execute(
                    event_sql,
                    {
                        "payload": _jsonb(
                            {
                                "match_id": int(match["id"]),
                                "api_fixture_id": int(match["api_fixture_id"]),
                                "home_score": home_score,
                                "away_score": away_score,
                                "api_status_short": _status_short(item),
                                "synced_at_utc": _utc_now().isoformat(),
                            }
                        )
                    },
                )
                events_inserted = int(cur.rowcount or 0)
            else:
                predictions_locked = 0
                events_inserted = 0

        conn.commit()

    return {
        "finalized": bool(updated),
        "conflict": False,
        "predictions_locked": predictions_locked,
        "events_inserted": events_inserted,
    }


def _mark_non_final_special_status(
    *,
    match_id: int,
    item: Dict[str, Any],
    internal_status: str,
    mapping_status: Optional[str] = None,
    mapping_note: Optional[str] = None,
) -> None:
    sql = """
      UPDATE worldcup_pool.matches
      SET
        status = %(internal_status)s,
        api_status_short = %(api_status_short)s,
        api_status_long = %(api_status_long)s,
        api_status_elapsed = %(api_status_elapsed)s,
        api_mapping_status = COALESCE(%(api_mapping_status)s, api_mapping_status),
        api_mapping_note = COALESCE(%(api_mapping_note)s, api_mapping_note),
        api_raw_snapshot = %(api_raw_snapshot)s::jsonb,
        api_last_synced_at_utc = NOW(),
        updated_at_utc = NOW()
      WHERE id = %(match_id)s
        AND status <> 'finished'
    """

    with pg_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                sql,
                {
                    "match_id": match_id,
                    "internal_status": internal_status,
                    "api_status_short": _status_short(item),
                    "api_status_long": _status_long(item),
                    "api_status_elapsed": _status_elapsed(item),
                    "api_mapping_status": mapping_status,
                    "api_mapping_note": mapping_note,
                    "api_raw_snapshot": _jsonb(item),
                },
            )
        conn.commit()

def _parse_int_list(value: Any) -> List[int]:
    if value is None:
        return []

    if isinstance(value, int):
        return [int(value)]

    if isinstance(value, (list, tuple, set)):
        out: List[int] = []
        for item in value:
            parsed = _safe_int(item)
            if parsed is not None:
                out.append(parsed)
        return out

    raw = str(value or "").strip()
    if not raw:
        return []

    normalized = raw.replace(";", ",").replace("|", ",").replace(" ", ",")
    out = []
    for part in normalized.split(","):
        parsed = _safe_int(part.strip())
        if parsed is not None:
            out.append(parsed)

    return out

def worldcup_pool_results_sync(
    *,
    competition_key: str = COMPETITION_KEY,
    lookback_days: int = 14,
    min_minutes_after_kickoff: int = 100,
    confirmation_delay_minutes: int = 1,
    limit: int = 60,
    batch_size: int = 20,
    dry_run: bool = False,
    match_ids: Optional[Any] = None,
    api_fixture_ids: Optional[Any] = None,
) -> Dict[str, Any]:
    """
    Sincroniza resultados da Copa para o bolão sem live polling.

    O job só consulta partidas mapeadas com api_fixture_id cujo kickoff já passou
    por uma janela mínima. Ele só atualiza o ranking indiretamente quando a API
    retorna status final e o resultado passa pela confirmação curta.
    """
    settings = load_settings()
    client = ApiFootballClient(
        base_url=settings.apifootball_base_url,
        api_key=settings.apifootball_key,
        timeout_s=30,
    )

    parsed_match_ids = _parse_int_list(match_ids)
    parsed_api_fixture_ids = _parse_int_list(api_fixture_ids)

    matches = _load_candidate_matches(
        competition_key=competition_key,
        limit=limit,
        lookback_days=lookback_days,
        min_minutes_after_kickoff=min_minutes_after_kickoff,
        match_ids=parsed_match_ids,
        api_fixture_ids=parsed_api_fixture_ids,
    )

    counters: Dict[str, Any] = {
        "candidate_matches": len(matches),
        "target_match_ids": parsed_match_ids,
        "target_api_fixture_ids": parsed_api_fixture_ids,
        "targeted_run": bool(parsed_match_ids or parsed_api_fixture_ids),
        "api_batches": 0,
        "api_fixtures_seen": 0,
        "final_seen_first_time": 0,
        "final_confirmed": 0,
        "not_final": 0,
        "postponed_or_suspended": 0,
        "cancelled_or_abandoned": 0,
        "missing_score": 0,
        "missing_api_fixture": 0,
        "api_round_phase_mismatches": 0,
        "conflicts": 0,
        "predictions_locked": 0,
        "events_inserted": 0,
        "dry_run": bool(dry_run),
    }

    if not matches:
        return {"ok": True, "counters": counters}

    by_fixture_id = {int(m["api_fixture_id"]): m for m in matches}
    now = _utc_now()

    for chunk in _chunks(
        list(by_fixture_id.keys()),
        min(20, max(1, int(batch_size or 20))),
    ):
        status_code, payload = _fetch_fixtures_by_ids(client, chunk)
        counters["api_batches"] += 1

        if status_code >= 400:
            return {
                "ok": False,
                "error": f"api_football_http_{status_code}",
                "counters": counters,
                "diagnostics": {
                    "status_code": status_code,
                    "payload_errors": (payload or {}).get("errors"),
                },
            }

        api_errors = (payload or {}).get("errors")
        if api_errors:
            return {
                "ok": False,
                "error": "api_football_returned_errors",
                "counters": counters,
                "diagnostics": {
                    "status_code": status_code,
                    "payload_errors": api_errors,
                },
            }

        response = (payload or {}).get("response") or []
        if not isinstance(response, list):
            response = []

        for item in response:
            if not isinstance(item, dict):
                continue

            api_fixture_id = _fixture_id(item)
            if not api_fixture_id or api_fixture_id not in by_fixture_id:
                counters["missing_api_fixture"] += 1
                continue

            counters["api_fixtures_seen"] += 1

            match = by_fixture_id[api_fixture_id]
            match_id = int(match["id"])
            status_short = _status_short(item)

            _, mapping_status, mapping_note = _api_round_phase_diagnostic(
                internal_phase=match.get("phase"),
                item=item,
            )

            if mapping_status == "api_round_phase_mismatch":
                counters["api_round_phase_mismatches"] += 1

            if dry_run:
                if status_short in FINAL_STATUS_SHORTS:
                    counters["final_seen_first_time"] += 1
                else:
                    counters["not_final"] += 1
                continue

            if status_short in CANCELLED_STATUS_SHORTS:
                _mark_non_final_special_status(
                    match_id=match_id,
                    item=item,
                    internal_status="cancelled",
                    mapping_status=mapping_status,
                    mapping_note=mapping_note,
                )
                counters["cancelled_or_abandoned"] += 1
                continue

            if status_short in POSTPONED_STATUS_SHORTS:
                _mark_non_final_special_status(
                    match_id=match_id,
                    item=item,
                    internal_status="postponed",
                    mapping_status=mapping_status,
                    mapping_note=mapping_note,
                )
                counters["postponed_or_suspended"] += 1
                continue

            if status_short not in FINAL_STATUS_SHORTS:
                _update_api_snapshot_only(
                    match_id=match_id,
                    item=item,
                    mapping_status=mapping_status,
                    mapping_note=mapping_note,
                )
                counters["not_final"] += 1
                continue

            home_score, away_score = _score_from_fixture(item)
            if home_score is None or away_score is None:
                _mark_final_seen(
                    match_id=match_id,
                    item=item,
                    mapping_status=mapping_status,
                    mapping_note=mapping_note,
                )
                counters["missing_score"] += 1
                continue

            final_seen_at = match.get("api_final_seen_at_utc")
            if not final_seen_at:
                _mark_final_seen(
                    match_id=match_id,
                    item=item,
                    mapping_status=mapping_status,
                    mapping_note=mapping_note,
                )
                counters["final_seen_first_time"] += 1
                continue

            elapsed_after_seen = now - final_seen_at
            delay_seconds = max(0, int(confirmation_delay_minutes or 0)) * 60
            if elapsed_after_seen.total_seconds() < delay_seconds:
                _mark_final_seen(
                    match_id=match_id,
                    item=item,
                    mapping_status=mapping_status,
                    mapping_note=mapping_note,
                )
                counters["final_seen_first_time"] += 1
                continue

            result = _finalize_match_from_api(
                match=match,
                item=item,
                home_score=home_score,
                away_score=away_score,
            )

            if result.get("conflict"):
                counters["conflicts"] += 1

            if result.get("finalized"):
                counters["final_confirmed"] += 1
                counters["predictions_locked"] += int(result.get("predictions_locked") or 0)
                counters["events_inserted"] += int(result.get("events_inserted") or 0)

    return {"ok": True, "counters": counters}