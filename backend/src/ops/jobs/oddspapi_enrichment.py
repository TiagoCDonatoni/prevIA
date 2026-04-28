from __future__ import annotations

import re
import unicodedata
from datetime import datetime, timezone
from difflib import SequenceMatcher
from typing import Any, Dict, List, Optional

from src.core.settings import load_settings
from src.db.pg import pg_conn
from src.integrations.oddspapi.client import (
    OddspapiClient,
    OddspapiClientError,
    OddspapiUsageCapReached,
)
from src.odds.provider_event_tracking import (
    get_active_provider_event_map,
    record_provider_refresh_log,
    should_skip_provider_refresh,
    upsert_provider_event_map,
)
from src.odds.provider_usage import (
    ENDPOINT_GROUP_REST,
    PROVIDER_ODDSPAPI,
    get_provider_usage_status,
)


def _iso_dt(value: Any) -> str | None:
    if value is None:
        return None
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return str(value)


def _policy_bucket(hours_until: float | None) -> str:
    if hours_until is None:
        return "unknown"

    try:
        h = float(hours_until)
    except Exception:
        return "unknown"

    if h < 0:
        return "started_or_past"
    if h <= 24:
        return "matchday"
    if h <= 48:
        return "d_1"
    if h <= 72:
        return "d_3"

    return "outside_window"


def _empty_bucket_counts() -> Dict[str, int]:
    return {
        "matchday": 0,
        "d_1": 0,
        "d_3": 0,
        "outside_window": 0,
        "started_or_past": 0,
        "unknown": 0,
    }


def _empty_decision_counts() -> Dict[str, int]:
    return {
        "would_call_provider": 0,
        "skipped_by_refresh_log": 0,
        "skipped_not_eligible": 0,
    }


def oddspapi_enrichment_dry_run(
    *,
    window_hours: int = 72,
    limit: int = 50,
    respect_refresh_log: bool = True,
) -> Dict[str, Any]:
    """
    Lista eventos elegíveis para enriquecimento OddsPapi sem chamar provider externo.

    Contrato:
    - parte apenas de eventos já existentes em odds.odds_events;
    - exige resolved_fixture_id no core;
    - usa apenas futebol;
    - usa apenas jogos futuros;
    - não atualiza eventos iniciados/finalizados/cancelados;
    - não consome request da OddsPapi;
    - quando respect_refresh_log=True, mostra quais eventos seriam pulados
      por já terem status terminal no bucket operacional.
    """

    window_hours = max(1, min(int(window_hours or 72), 72))
    limit = max(1, min(int(limit or 50), 200))

    sql = """
      WITH eligible AS (
        SELECT
          oe.event_id,
          oe.sport_key,
          oe.commence_time_utc,
          oe.home_name AS odds_home_name,
          oe.away_name AS odds_away_name,
          oe.resolved_fixture_id,

          f.fixture_id,
          f.kickoff_utc,
          f.status_short,
          f.status_long,
          f.is_finished,
          f.is_cancelled,

          l.league_id,
          l.name AS league_name,
          l.country_name AS league_country_name,

          ht.name AS core_home_name,
          at.name AS core_away_name,

          EXTRACT(EPOCH FROM (f.kickoff_utc - now())) / 3600.0 AS hours_until,

          oddspapi_1x2.last_oddspapi_1x2_at_utc,
          COALESCE(oddspapi_1x2.oddspapi_1x2_snapshots, 0) AS oddspapi_1x2_snapshots

        FROM odds.odds_events oe
        JOIN core.fixtures f
          ON f.fixture_id = oe.resolved_fixture_id
        JOIN core.leagues l
          ON l.league_id = f.league_id
        JOIN core.teams ht
          ON ht.team_id = f.home_team_id
        JOIN core.teams at
          ON at.team_id = f.away_team_id
        LEFT JOIN (
          SELECT
            event_id,
            MAX(captured_at_utc) AS last_oddspapi_1x2_at_utc,
            COUNT(*) AS oddspapi_1x2_snapshots
          FROM odds.odds_snapshots_1x2
          WHERE bookmaker LIKE 'oddspapi:%%'
          GROUP BY event_id
        ) oddspapi_1x2
          ON oddspapi_1x2.event_id = oe.event_id
        WHERE oe.resolved_fixture_id IS NOT NULL
          AND oe.sport_key LIKE 'soccer_%%'
          AND f.kickoff_utc > now()
          AND f.kickoff_utc <= now() + (%(window_hours)s || ' hours')::interval
          AND COALESCE(f.is_finished, false) = false
          AND COALESCE(f.is_cancelled, false) = false
          AND COALESCE(f.status_short, 'NS') NOT IN (
            '1H', 'HT', '2H', 'ET', 'P', 'FT', 'AET', 'PEN', 'BT',
            'SUSP', 'INT', 'PST', 'CANC', 'ABD', 'AWD', 'WO'
          )
      )
      SELECT
        event_id,
        sport_key,
        commence_time_utc,
        odds_home_name,
        odds_away_name,
        resolved_fixture_id,
        fixture_id,
        kickoff_utc,
        status_short,
        status_long,
        is_finished,
        is_cancelled,
        league_id,
        league_name,
        league_country_name,
        core_home_name,
        core_away_name,
        hours_until,
        last_oddspapi_1x2_at_utc,
        oddspapi_1x2_snapshots
      FROM eligible
      ORDER BY kickoff_utc ASC, sport_key ASC, event_id ASC
      LIMIT %(limit)s
    """

    items: List[Dict[str, Any]] = []
    buckets = _empty_bucket_counts()
    decisions = _empty_decision_counts()

    with pg_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                sql,
                {
                    "window_hours": int(window_hours),
                    "limit": int(limit),
                },
            )
            rows = cur.fetchall() or []

        for r in rows:
            event_id = str(r[0])
            sport_key = str(r[1])
            core_fixture_id = int(r[6]) if r[6] is not None else None
            hours_until = float(r[17]) if r[17] is not None else None
            bucket = _policy_bucket(hours_until)
            buckets[bucket] = int(buckets.get(bucket, 0)) + 1

            is_eligible_bucket = bucket in {"matchday", "d_1", "d_3"}

            skip_info: Dict[str, Any] = {
                "skip": False,
                "reason": None,
                "existing": None,
            }

            if is_eligible_bucket and respect_refresh_log and core_fixture_id is not None:
                skip_info = should_skip_provider_refresh(
                    conn,
                    provider=PROVIDER_ODDSPAPI,
                    core_fixture_id=core_fixture_id,
                    policy_bucket=bucket,
                )

            would_call_provider = bool(is_eligible_bucket and not skip_info.get("skip"))

            if not is_eligible_bucket:
                decisions["skipped_not_eligible"] += 1
            elif skip_info.get("skip"):
                decisions["skipped_by_refresh_log"] += 1
            else:
                decisions["would_call_provider"] += 1

            oddspapi_snapshot_count = int(r[19] or 0)

            items.append(
                {
                    "event_id": event_id,
                    "sport_key": sport_key,
                    "commence_time_utc": _iso_dt(r[2]),
                    "odds_home_name": str(r[3]) if r[3] is not None else None,
                    "odds_away_name": str(r[4]) if r[4] is not None else None,
                    "resolved_fixture_id": int(r[5]) if r[5] is not None else None,
                    "fixture_id": core_fixture_id,
                    "kickoff_utc": _iso_dt(r[7]),
                    "status_short": str(r[8]) if r[8] is not None else None,
                    "status_long": str(r[9]) if r[9] is not None else None,
                    "is_finished": bool(r[10]),
                    "is_cancelled": bool(r[11]),
                    "league": {
                        "league_id": int(r[12]) if r[12] is not None else None,
                        "name": str(r[13]) if r[13] is not None else None,
                        "country_name": str(r[14]) if r[14] is not None else None,
                    },
                    "core_home_name": str(r[15]) if r[15] is not None else None,
                    "core_away_name": str(r[16]) if r[16] is not None else None,
                    "hours_until": round(hours_until, 3) if hours_until is not None else None,
                    "policy_bucket": bucket,
                    "existing_oddspapi": {
                        "last_1x2_at_utc": _iso_dt(r[18]),
                        "snapshots_1x2": oddspapi_snapshot_count,
                        "has_snapshots": oddspapi_snapshot_count > 0,
                    },
                    "refresh_decision": {
                        "would_call_provider": would_call_provider,
                        "skip": bool(skip_info.get("skip")),
                        "skip_reason": skip_info.get("reason"),
                        "respect_refresh_log": bool(respect_refresh_log),
                        "existing_refresh_log": skip_info.get("existing"),
                    },
                }
            )

    return {
        "ok": True,
        "mode": "dry_run",
        "provider": PROVIDER_ODDSPAPI,
        "source_of_truth": "current_primary_provider",
        "request_count_consumed": 0,
        "window_hours": int(window_hours),
        "limit": int(limit),
        "count": len(items),
        "buckets": buckets,
        "decisions": decisions,
        "event_level_provider_call_candidates": decisions["would_call_provider"],
        "respect_refresh_log": bool(respect_refresh_log),
        "policy": {
            "runs_inside_pipeline_run_all": False,
            "calls_oddspapi": False,
            "creates_events": False,
            "updates_event_metadata": False,
            "requires_resolved_fixture_id": True,
            "skip_started_or_finished": True,
            "skip_terminal_refresh_log": bool(respect_refresh_log),
        },
        "items": items,
    }

def _normalize_bookmaker_token(value: Any) -> str:
    raw = str(value or "").strip().lower()
    if not raw:
        return ""
    return re.sub(r"[^a-z0-9]+", "", raw)


def _extract_bookmaker_items(data: Any) -> List[Any]:
    if isinstance(data, list):
        return data

    if isinstance(data, dict):
        for key in ("bookmakers", "data", "items", "results"):
            value = data.get(key)
            if isinstance(value, list):
                return value

        # Fallback para payloads no formato {"betano": {...}, "superbet": {...}}
        if data and all(isinstance(key, str) for key in data.keys()):
            values = list(data.values())
            if values and all(isinstance(item, dict) for item in values):
                return [
                    {
                        **item,
                        "_dict_key": key,
                    }
                    for key, item in data.items()
                    if isinstance(item, dict)
                ]

    return []


def _extract_bookmaker_slug(item: Any) -> str | None:
    if isinstance(item, str):
        return item.strip() or None

    if not isinstance(item, dict):
        return None

    for key in (
        "slug",
        "bookmaker",
        "bookmakerSlug",
        "bookmaker_slug",
        "key",
        "code",
        "_dict_key",
    ):
        value = item.get(key)
        if value is not None and str(value).strip():
            return str(value).strip()

    return None


def _extract_bookmaker_name(item: Any) -> str | None:
    if isinstance(item, str):
        return item.strip() or None

    if not isinstance(item, dict):
        return None

    for key in (
        "name",
        "title",
        "bookmakerName",
        "bookmaker_name",
        "label",
        "displayName",
    ):
        value = item.get(key)
        if value is not None and str(value).strip():
            return str(value).strip()

    return _extract_bookmaker_slug(item)


def _summarize_bookmakers(data: Any, configured_bookmakers: List[str]) -> Dict[str, Any]:
    items = _extract_bookmaker_items(data)

    summarized: List[Dict[str, Any]] = []
    seen = set()

    configured_tokens = {
        _normalize_bookmaker_token(item): item
        for item in configured_bookmakers
        if str(item or "").strip()
    }

    matched_configured = []
    unmatched_configured = set(configured_bookmakers)

    for item in items:
        slug = _extract_bookmaker_slug(item)
        name = _extract_bookmaker_name(item)

        token_candidates = {
            _normalize_bookmaker_token(slug),
            _normalize_bookmaker_token(name),
        }
        token_candidates = {token for token in token_candidates if token}

        key = _normalize_bookmaker_token(slug or name)
        if not key or key in seen:
            continue

        seen.add(key)

        matched_config = None
        for token in token_candidates:
            if token in configured_tokens:
                matched_config = configured_tokens[token]
                break

        if matched_config:
            matched_configured.append(
                {
                    "configured": matched_config,
                    "returned_slug": slug,
                    "returned_name": name,
                }
            )
            unmatched_configured.discard(matched_config)

        summarized.append(
            {
                "slug": slug,
                "name": name,
                "matched_configured": matched_config,
            }
        )

    return {
        "total_detected": len(summarized),
        "sample": summarized[:80],
        "configured": configured_bookmakers,
        "matched_configured": matched_configured,
        "unmatched_configured": sorted(unmatched_configured),
        "raw_shape": {
            "type": type(data).__name__,
            "top_level_keys": list(data.keys())[:30] if isinstance(data, dict) else None,
        },
    }


def oddspapi_bookmakers_diagnostic(
    *,
    include_raw: bool = False,
) -> Dict[str, Any]:
    """
    Diagnóstico manual de bookmakers OddsPapi.

    Atenção:
    - Consome 1 request real.
    - Exige ODDSPAPI_ENRICHMENT_ENABLED=true.
    - Exige ODDSPAPI_API_KEY.
    - Não grava snapshots.
    - Não cria eventos.
    - Não entra no run_all.
    """

    settings = load_settings()

    if not settings.oddspapi_enrichment_enabled:
        return {
            "ok": False,
            "provider": PROVIDER_ODDSPAPI,
            "reason": "oddspapi_enrichment_disabled",
            "message": "Set ODDSPAPI_ENRICHMENT_ENABLED=true to run this diagnostic.",
            "request_count_consumed": 0,
        }

    if not settings.oddspapi_api_key:
        return {
            "ok": False,
            "provider": PROVIDER_ODDSPAPI,
            "reason": "missing_oddspapi_api_key",
            "message": "Set ODDSPAPI_API_KEY before running this diagnostic.",
            "request_count_consumed": 0,
        }

    configured_bookmakers = list(settings.oddspapi_primary_bookmakers or []) + list(
        settings.oddspapi_secondary_bookmakers or []
    )

    client = OddspapiClient.from_settings(settings)

    with pg_conn() as conn:
        try:
            response = client.get_bookmakers(
                usage_conn=conn,
                hard_cap=settings.oddspapi_monthly_hard_cap,
                reserve=settings.oddspapi_monthly_reserve,
            )
        except OddspapiUsageCapReached as exc:
            status = get_provider_usage_status(
                conn,
                provider=PROVIDER_ODDSPAPI,
                endpoint_group=ENDPOINT_GROUP_REST,
                hard_cap=settings.oddspapi_monthly_hard_cap,
                reserve=settings.oddspapi_monthly_reserve,
            )
            conn.commit()

            return {
                "ok": False,
                "provider": PROVIDER_ODDSPAPI,
                "reason": "provider_monthly_operational_cap_reached",
                "message": str(exc),
                "request_count_consumed": 0,
                "usage": status,
            }
        except OddspapiClientError as exc:
            status = get_provider_usage_status(
                conn,
                provider=PROVIDER_ODDSPAPI,
                endpoint_group=ENDPOINT_GROUP_REST,
                hard_cap=settings.oddspapi_monthly_hard_cap,
                reserve=settings.oddspapi_monthly_reserve,
            )
            conn.commit()

            return {
                "ok": False,
                "provider": PROVIDER_ODDSPAPI,
                "reason": "oddspapi_client_error",
                "message": str(exc),
                "endpoint": exc.endpoint,
                "status_code": exc.status_code,
                "payload": exc.payload,
                "usage": status,
            }

        summary = _summarize_bookmakers(response.data, configured_bookmakers)

        status = get_provider_usage_status(
            conn,
            provider=PROVIDER_ODDSPAPI,
            endpoint_group=ENDPOINT_GROUP_REST,
            hard_cap=settings.oddspapi_monthly_hard_cap,
            reserve=settings.oddspapi_monthly_reserve,
        )
        conn.commit()

    result: Dict[str, Any] = {
        "ok": True,
        "provider": PROVIDER_ODDSPAPI,
        "mode": "bookmakers_diagnostic",
        "endpoint": response.endpoint,
        "status_code": response.status_code,
        "request_url_redacted": response.request_url_redacted,
        "request_count_consumed": 1,
        "usage_claim": response.usage_claim,
        "usage": status,
        "bookmakers": summary,
        "policy": {
            "runs_inside_pipeline_run_all": False,
            "runs_in_realtime_product": False,
            "creates_events": False,
            "updates_event_metadata": False,
            "writes_snapshots": False,
        },
    }

    if include_raw:
        result["raw"] = response.data

    return result

def _normalize_match_text(value: Any) -> str:
    raw = str(value or "").strip().lower()
    if not raw:
        return ""

    without_accents = "".join(
        char
        for char in unicodedata.normalize("NFKD", raw)
        if not unicodedata.combining(char)
    )

    without_noise = re.sub(r"[^a-z0-9]+", " ", without_accents)
    without_common = re.sub(
        r"\b(fc|cf|sc|afc|ec|club|clube|de|da|do|the)\b",
        " ",
        without_noise,
    )

    return re.sub(r"\s+", " ", without_common).strip()


def _similarity(a: Any, b: Any) -> float:
    left = _normalize_match_text(a)
    right = _normalize_match_text(b)

    if not left or not right:
        return 0.0

    if left == right:
        return 1.0

    if left in right or right in left:
        return 0.88

    return SequenceMatcher(None, left, right).ratio()


def _parse_oddspapi_datetime(value: Any) -> Optional[datetime]:
    if value is None:
        return None

    if isinstance(value, (int, float)):
        # v5 às vezes usa epoch seconds; v4 normalmente usa ISO.
        try:
            timestamp = float(value)
            if timestamp > 10_000_000_000:
                timestamp = timestamp / 1000.0
            return datetime.fromtimestamp(timestamp, tz=timezone.utc)
        except Exception:
            return None

    raw = str(value or "").strip()
    if not raw:
        return None

    try:
        normalized = raw.replace("Z", "+00:00")
        parsed = datetime.fromisoformat(normalized)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)
    except Exception:
        return None


def _extract_fixture_start_time(item: Dict[str, Any]) -> Optional[datetime]:
    for key in ("startTime", "commenceTime", "kickoffTime", "start_time"):
        parsed = _parse_oddspapi_datetime(item.get(key))
        if parsed:
            return parsed
    return None


def _extract_fixture_id(item: Dict[str, Any]) -> Optional[str]:
    for key in ("fixtureId", "id", "eventId"):
        value = item.get(key)
        if value is not None and str(value).strip():
            return str(value).strip()
    return None


def _extract_fixture_team_names(item: Dict[str, Any]) -> Dict[str, Optional[str]]:
    # Formato comum v4: participant1Name / participant2Name
    home = item.get("participant1Name") or item.get("homeName") or item.get("homeTeamName")
    away = item.get("participant2Name") or item.get("awayName") or item.get("awayTeamName")

    participants = item.get("participants")
    if isinstance(participants, dict):
        home_obj = participants.get("home") or participants.get("participant1")
        away_obj = participants.get("away") or participants.get("participant2")

        if isinstance(home_obj, dict):
            home = home or home_obj.get("name") or home_obj.get("participantName")
        if isinstance(away_obj, dict):
            away = away or away_obj.get("name") or away_obj.get("participantName")

    if isinstance(participants, list) and len(participants) >= 2:
        first = participants[0]
        second = participants[1]
        if isinstance(first, dict):
            home = home or first.get("name") or first.get("participantName")
        if isinstance(second, dict):
            away = away or second.get("name") or second.get("participantName")

    return {
        "home": str(home).strip() if home else None,
        "away": str(away).strip() if away else None,
    }


def _extract_fixture_items(data: Any) -> List[Dict[str, Any]]:
    if isinstance(data, list):
        return [item for item in data if isinstance(item, dict)]

    if isinstance(data, dict):
        for key in ("fixtures", "data", "items", "results"):
            value = data.get(key)
            if isinstance(value, list):
                return [item for item in value if isinstance(item, dict)]

    return []


def _score_oddspapi_fixture_candidate(
    *,
    core_event: Dict[str, Any],
    candidate: Dict[str, Any],
) -> Dict[str, Any]:
    team_names = _extract_fixture_team_names(candidate)

    direct_home = _similarity(core_event.get("core_home_name"), team_names.get("home"))
    direct_away = _similarity(core_event.get("core_away_name"), team_names.get("away"))

    swapped_home = _similarity(core_event.get("core_home_name"), team_names.get("away"))
    swapped_away = _similarity(core_event.get("core_away_name"), team_names.get("home"))

    direct_score = (direct_home + direct_away) / 2.0
    swapped_score = (swapped_home + swapped_away) / 2.0

    orientation = "direct"
    team_score = direct_score

    if swapped_score > direct_score:
        orientation = "swapped"
        team_score = swapped_score

    candidate_start = _extract_fixture_start_time(candidate)
    core_kickoff = _parse_oddspapi_datetime(core_event.get("kickoff_utc"))

    minutes_delta = None
    time_score = 0.0

    if candidate_start and core_kickoff:
        minutes_delta = abs((candidate_start - core_kickoff).total_seconds()) / 60.0

        if minutes_delta <= 5:
            time_score = 1.0
        elif minutes_delta <= 15:
            time_score = 0.9
        elif minutes_delta <= 30:
            time_score = 0.75
        elif minutes_delta <= 60:
            time_score = 0.45
        else:
            time_score = 0.0

    league_name = (
        candidate.get("tournamentName")
        or candidate.get("leagueName")
        or candidate.get("competitionName")
    )
    league_score = _similarity(core_event.get("league_name"), league_name)

    final_score = (team_score * 0.7) + (time_score * 0.25) + (league_score * 0.05)

    return {
        "fixture_id": _extract_fixture_id(candidate),
        "candidate_start_time_utc": candidate_start.isoformat() if candidate_start else None,
        "candidate_home_name": team_names.get("home"),
        "candidate_away_name": team_names.get("away"),
        "candidate_tournament_name": league_name,
        "candidate_category_name": candidate.get("categoryName") or candidate.get("countryName"),
        "orientation": orientation,
        "scores": {
            "team_score": round(team_score, 4),
            "time_score": round(time_score, 4),
            "league_score": round(league_score, 4),
            "final_score": round(final_score, 4),
            "minutes_delta": round(minutes_delta, 2) if minutes_delta is not None else None,
        },
        "raw_sample": {
            "fixtureId": candidate.get("fixtureId"),
            "sportId": candidate.get("sportId"),
            "tournamentId": candidate.get("tournamentId"),
            "tournamentName": candidate.get("tournamentName"),
            "categoryName": candidate.get("categoryName"),
            "participant1Name": candidate.get("participant1Name"),
            "participant2Name": candidate.get("participant2Name"),
            "startTime": candidate.get("startTime"),
            "statusId": candidate.get("statusId"),
            "hasOdds": candidate.get("hasOdds"),
        },
    }


def _select_one_eligible_core_event(
    *,
    window_hours: int = 72,
) -> Optional[Dict[str, Any]]:
    dry_run = oddspapi_enrichment_dry_run(
        window_hours=window_hours,
        limit=1,
        respect_refresh_log=True,
    )

    items = dry_run.get("items") or []
    if not items:
        return None

    item = dict(items[0])
    league = item.get("league") or {}

    return {
        "event_id": item.get("event_id"),
        "sport_key": item.get("sport_key"),
        "resolved_fixture_id": item.get("resolved_fixture_id"),
        "fixture_id": item.get("fixture_id"),
        "kickoff_utc": item.get("kickoff_utc"),
        "policy_bucket": item.get("policy_bucket"),
        "core_home_name": item.get("core_home_name"),
        "core_away_name": item.get("core_away_name"),
        "odds_home_name": item.get("odds_home_name"),
        "odds_away_name": item.get("odds_away_name"),
        "league_id": league.get("league_id"),
        "league_name": league.get("name"),
        "league_country_name": league.get("country_name"),
        "hours_until": item.get("hours_until"),
    }


def oddspapi_fixture_match_diagnostic(
    *,
    window_hours: int = 72,
    max_candidates: int = 10,
    min_score: float = 0.65,
) -> Dict[str, Any]:
    """
    Diagnóstico manual de matching entre 1 evento canônico e fixtures da OddsPapi.

    Atenção:
    - Consome 1 request real.
    - Exige ODDSPAPI_ENRICHMENT_ENABLED=true.
    - Exige ODDSPAPI_API_KEY.
    - Não grava mapping.
    - Não grava snapshots.
    - Não cria eventos.
    """

    settings = load_settings()

    if not settings.oddspapi_enrichment_enabled:
        return {
            "ok": False,
            "provider": PROVIDER_ODDSPAPI,
            "reason": "oddspapi_enrichment_disabled",
            "request_count_consumed": 0,
        }

    if not settings.oddspapi_api_key:
        return {
            "ok": False,
            "provider": PROVIDER_ODDSPAPI,
            "reason": "missing_oddspapi_api_key",
            "request_count_consumed": 0,
        }

    core_event = _select_one_eligible_core_event(window_hours=window_hours)

    if not core_event:
        return {
            "ok": False,
            "provider": PROVIDER_ODDSPAPI,
            "reason": "no_eligible_core_event",
            "request_count_consumed": 0,
        }

    kickoff = _parse_oddspapi_datetime(core_event.get("kickoff_utc"))
    if not kickoff:
        return {
            "ok": False,
            "provider": PROVIDER_ODDSPAPI,
            "reason": "invalid_core_kickoff",
            "core_event": core_event,
            "request_count_consumed": 0,
        }

    query_from = kickoff.replace(minute=0, second=0, microsecond=0)
    query_from = query_from.replace(hour=max(0, query_from.hour - 4))

    query_to = kickoff.replace(minute=0, second=0, microsecond=0)
    query_to = query_to.replace(hour=min(23, query_to.hour + 4))

    query_from_iso = query_from.isoformat().replace("+00:00", "Z")
    query_to_iso = query_to.isoformat().replace("+00:00", "Z")

    client = OddspapiClient.from_settings(settings)

    with pg_conn() as conn:
        try:
            response = client.get_fixtures(
                params={
                    "sportId": 10,
                    "from": query_from_iso,
                    "to": query_to_iso,
                    "statusId": 0,
                    "hasOdds": "true",
                    "language": "en",
                },
                usage_conn=conn,
                hard_cap=settings.oddspapi_monthly_hard_cap,
                reserve=settings.oddspapi_monthly_reserve,
            )
        except OddspapiUsageCapReached as exc:
            status = get_provider_usage_status(
                conn,
                provider=PROVIDER_ODDSPAPI,
                endpoint_group=ENDPOINT_GROUP_REST,
                hard_cap=settings.oddspapi_monthly_hard_cap,
                reserve=settings.oddspapi_monthly_reserve,
            )
            conn.commit()

            return {
                "ok": False,
                "provider": PROVIDER_ODDSPAPI,
                "reason": "provider_monthly_operational_cap_reached",
                "message": str(exc),
                "request_count_consumed": 0,
                "usage": status,
            }
        except OddspapiClientError as exc:
            status = get_provider_usage_status(
                conn,
                provider=PROVIDER_ODDSPAPI,
                endpoint_group=ENDPOINT_GROUP_REST,
                hard_cap=settings.oddspapi_monthly_hard_cap,
                reserve=settings.oddspapi_monthly_reserve,
            )
            conn.commit()

            return {
                "ok": False,
                "provider": PROVIDER_ODDSPAPI,
                "reason": "oddspapi_client_error",
                "message": str(exc),
                "endpoint": exc.endpoint,
                "status_code": exc.status_code,
                "payload": exc.payload,
                "usage": status,
            }

        status = get_provider_usage_status(
            conn,
            provider=PROVIDER_ODDSPAPI,
            endpoint_group=ENDPOINT_GROUP_REST,
            hard_cap=settings.oddspapi_monthly_hard_cap,
            reserve=settings.oddspapi_monthly_reserve,
        )
        conn.commit()

    fixture_items = _extract_fixture_items(response.data)

    scored = [
        _score_oddspapi_fixture_candidate(
            core_event=core_event,
            candidate=item,
        )
        for item in fixture_items
    ]

    scored = sorted(
        scored,
        key=lambda item: item.get("scores", {}).get("final_score", 0),
        reverse=True,
    )

    top_candidates = scored[: max(1, min(int(max_candidates or 10), 25))]
    likely_matches = [
        item
        for item in top_candidates
        if float(item.get("scores", {}).get("final_score") or 0) >= float(min_score)
    ]

    best_match = likely_matches[0] if likely_matches else (top_candidates[0] if top_candidates else None)

    return {
        "ok": True,
        "provider": PROVIDER_ODDSPAPI,
        "mode": "fixture_match_diagnostic",
        "request_count_consumed": 1,
        "endpoint": response.endpoint,
        "request_url_redacted": response.request_url_redacted,
        "status_code": response.status_code,
        "usage_claim": response.usage_claim,
        "usage": status,
        "core_event": core_event,
        "oddspapi_query": {
            "sportId": 10,
            "from": query_from_iso,
            "to": query_to_iso,
            "statusId": 0,
            "hasOdds": True,
            "language": "en",
            "bookmakers_filter_applied": False,
            "note": "Bookmaker filter intentionally omitted to avoid restricted bookmaker errors during fixture matching.",
        },
        "fixtures_returned": len(fixture_items),
        "min_score": float(min_score),
        "likely_match_count": len(likely_matches),
        "best_match": best_match,
        "top_candidates": top_candidates,
        "policy": {
            "runs_inside_pipeline_run_all": False,
            "runs_in_realtime_product": False,
            "creates_events": False,
            "updates_event_metadata": False,
            "writes_mapping": False,
            "writes_snapshots": False,
        },
    }

def oddspapi_manual_confirm_mapping(
    *,
    payload: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Confirma manualmente um mapping entre evento canônico prevIA e fixture OddsPapi.

    Atenção:
    - Não chama OddsPapi.
    - Não consome request.
    - Não grava snapshot.
    - Não cria evento.
    - Não altera metadados do evento canônico.
    """

    provider_event_id = str(payload.get("provider_event_id") or "").strip()
    canonical_event_id = str(payload.get("canonical_event_id") or "").strip()
    core_fixture_id = int(payload.get("core_fixture_id") or 0)
    sport_key = str(payload.get("sport_key") or "").strip()
    confidence = payload.get("confidence")
    match_reason = str(payload.get("match_reason") or "manual_fixture_match_confirmed").strip()

    if not provider_event_id:
        return {
            "ok": False,
            "reason": "provider_event_id_required",
            "request_count_consumed": 0,
        }

    if not canonical_event_id:
        return {
            "ok": False,
            "reason": "canonical_event_id_required",
            "request_count_consumed": 0,
        }

    if not core_fixture_id:
        return {
            "ok": False,
            "reason": "core_fixture_id_required",
            "request_count_consumed": 0,
        }

    if not sport_key:
        return {
            "ok": False,
            "reason": "sport_key_required",
            "request_count_consumed": 0,
        }

    try:
        confidence_value = float(confidence) if confidence is not None else None
    except Exception:
        confidence_value = None

    raw_json = {
        "source": "manual_confirm_endpoint",
        "confirmed_from": "oddspapi_fixture_match_diagnostic",
        "payload": payload,
    }

    with pg_conn() as conn:
        mapping = upsert_provider_event_map(
            conn,
            provider=PROVIDER_ODDSPAPI,
            provider_event_id=provider_event_id,
            canonical_event_id=canonical_event_id,
            core_fixture_id=core_fixture_id,
            sport_key=sport_key,
            confidence=confidence_value,
            match_reason=match_reason[:255],
            raw_json=raw_json,
            active=True,
        )
        conn.commit()

    return {
        "ok": True,
        "provider": PROVIDER_ODDSPAPI,
        "mode": "manual_mapping_confirm",
        "request_count_consumed": 0,
        "mapping": mapping,
        "policy": {
            "calls_oddspapi": False,
            "runs_inside_pipeline_run_all": False,
            "creates_events": False,
            "updates_event_metadata": False,
            "writes_mapping": True,
            "writes_snapshots": False,
        },
    }

def _select_oddspapi_mapping_for_odds(
    conn,
    *,
    core_fixture_id: Optional[int] = None,
) -> Optional[Dict[str, Any]]:
    if core_fixture_id:
        return get_active_provider_event_map(
            conn,
            provider=PROVIDER_ODDSPAPI,
            core_fixture_id=int(core_fixture_id),
        )

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
        AND active = true
      ORDER BY updated_at_utc DESC
      LIMIT 1
    """

    with conn.cursor() as cur:
        cur.execute(
            sql,
            {
                "provider": PROVIDER_ODDSPAPI,
            },
        )
        row = cur.fetchone()

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


def _safe_float(value: Any) -> Optional[float]:
    if value is None:
        return None
    try:
        return float(value)
    except Exception:
        return None


def _extract_bookmaker_odds(data: Any) -> Dict[str, Any]:
    if not isinstance(data, dict):
        return {}

    value = data.get("bookmakerOdds")
    if isinstance(value, dict):
        return value

    value = data.get("bookmakers")
    if isinstance(value, dict):
        return value

    value = data.get("odds")
    if isinstance(value, dict):
        return value

    return {}


def _first_non_empty(*values: Any) -> Optional[str]:
    for value in values:
        if value is not None and str(value).strip():
            return str(value).strip()
    return None


def _extract_players_from_outcome(outcome: Any) -> List[Dict[str, Any]]:
    if not isinstance(outcome, dict):
        return []

    players = outcome.get("players")

    if isinstance(players, list):
        return [item for item in players if isinstance(item, dict)]

    if isinstance(players, dict):
        return [item for item in players.values() if isinstance(item, dict)]

    return []


def _extract_price_from_outcome(outcome: Any) -> Optional[float]:
    if not isinstance(outcome, dict):
        return None

    direct_price = (
        outcome.get("price")
        or outcome.get("odds")
        or outcome.get("decimal")
        or outcome.get("decimalOdds")
        or outcome.get("value")
    )

    direct = _safe_float(direct_price)
    if direct is not None:
        return direct

    for player in _extract_players_from_outcome(outcome):
        player_price = (
            player.get("price")
            or player.get("odds")
            or player.get("decimal")
            or player.get("decimalOdds")
            or player.get("value")
        )
        parsed = _safe_float(player_price)
        if parsed is not None:
            return parsed

    return None


def _extract_name_from_outcome(
    *,
    outcome_id: Optional[str],
    outcome: Any,
) -> Optional[str]:
    if not isinstance(outcome, dict):
        return None

    for player in _extract_players_from_outcome(outcome):
        player_name = _first_non_empty(
            player.get("name"),
            player.get("label"),
            player.get("outcomeName"),
            player.get("participantName"),
            player.get("selectionName"),
        )
        if player_name:
            return player_name

    direct_name = _first_non_empty(
        outcome.get("name"),
        outcome.get("label"),
        outcome.get("outcomeName"),
        outcome.get("participantName"),
        outcome.get("selectionName"),
    )

    if direct_name:
        return direct_name

    # Convenção usada para market 101 / 1X2.
    if str(outcome_id) == "101":
        return "home"
    if str(outcome_id) == "102":
        return "draw"
    if str(outcome_id) == "103":
        return "away"

    return None

def _extract_outcomes_from_market(market: Any) -> List[Dict[str, Any]]:
    if not isinstance(market, dict):
        return []

    raw_outcomes = market.get("outcomes")

    if isinstance(raw_outcomes, dict):
        iterable = raw_outcomes.items()
    elif isinstance(raw_outcomes, list):
        iterable = [(str(index), item) for index, item in enumerate(raw_outcomes)]
    else:
        iterable = []

    outcomes: List[Dict[str, Any]] = []

    for outcome_id, item in iterable:
        if not isinstance(item, dict):
            continue

        players = _extract_players_from_outcome(item)

        outcomes.append(
            {
                "outcome_id": str(outcome_id) if outcome_id is not None else None,
                "name": _extract_name_from_outcome(
                    outcome_id=str(outcome_id) if outcome_id is not None else None,
                    outcome=item,
                ),
                "price": _extract_price_from_outcome(item),
                "player_count": len(players),
                "players_sample": [
                    {
                        "price": _safe_float(
                            player.get("price")
                            or player.get("odds")
                            or player.get("decimal")
                            or player.get("decimalOdds")
                            or player.get("value")
                        ),
                        "name": _first_non_empty(
                            player.get("name"),
                            player.get("label"),
                            player.get("outcomeName"),
                            player.get("participantName"),
                            player.get("selectionName"),
                        ),
                        "raw_keys": sorted(list(player.keys()))[:20],
                    }
                    for player in players[:3]
                ],
                "raw_keys": sorted(list(item.keys()))[:20],
            }
        )

    return outcomes


def _extract_1x2_from_bookmaker_market(
    *,
    bookmaker: str,
    market: Any,
) -> Optional[Dict[str, Any]]:
    if not isinstance(market, dict):
        return None

    outcomes = _extract_outcomes_from_market(market)

    prices_by_outcome_id: Dict[str, Optional[float]] = {
        str(item.get("outcome_id")): item.get("price")
        for item in outcomes
        if item.get("outcome_id") is not None
    }

    home_price = prices_by_outcome_id.get("101")
    draw_price = prices_by_outcome_id.get("102")
    away_price = prices_by_outcome_id.get("103")

    if home_price is None or draw_price is None or away_price is None:
        return None

    return {
        "bookmaker": bookmaker,
        "market_id": "101",
        "market_active": bool(market.get("marketActive", True)),
        "bookmaker_market_id": market.get("bookmakerMarketId"),
        "home": home_price,
        "draw": draw_price,
        "away": away_price,
        "outcomes": outcomes,
        "raw_keys": sorted(list(market.keys()))[:20],
    }


def _extract_1x2_candidates_from_odds_payload(data: Any) -> List[Dict[str, Any]]:
    bookmaker_odds = _extract_bookmaker_odds(data)
    candidates: List[Dict[str, Any]] = []

    for bookmaker_slug, bookmaker_data in bookmaker_odds.items():
        if not isinstance(bookmaker_data, dict):
            continue

        markets = bookmaker_data.get("markets")
        if not isinstance(markets, dict):
            continue

        market_101 = markets.get("101")
        if not isinstance(market_101, dict):
            continue

        parsed = _extract_1x2_from_bookmaker_market(
            bookmaker=str(bookmaker_slug),
            market=market_101,
        )

        if parsed:
            candidates.append(parsed)

    return sorted(candidates, key=lambda item: item.get("bookmaker") or "")

def _summarize_oddspapi_odds_payload(data: Any) -> Dict[str, Any]:
    bookmaker_odds = _extract_bookmaker_odds(data)
    one_x_two_candidates = _extract_1x2_candidates_from_odds_payload(data)

    bookmaker_summaries: List[Dict[str, Any]] = []
    total_markets = 0
    total_outcomes = 0

    for bookmaker_slug, bookmaker_data in bookmaker_odds.items():
        if not isinstance(bookmaker_data, dict):
            continue

        markets = bookmaker_data.get("markets")
        if not isinstance(markets, dict):
            markets = {}

        market_summaries: List[Dict[str, Any]] = []

        for market_id, market_data in markets.items():
            outcomes = _extract_outcomes_from_market(market_data)
            total_markets += 1
            total_outcomes += len(outcomes)

            market_name = None
            if isinstance(market_data, dict):
                market_name = (
                    market_data.get("name")
                    or market_data.get("marketName")
                    or market_data.get("label")
                    or market_data.get("slug")
                )

            market_summaries.append(
                {
                    "market_id": str(market_id),
                    "market_name": str(market_name).strip() if market_name else None,
                    "outcome_count": len(outcomes),
                    "outcomes_sample": outcomes[:6],
                    "raw_keys": sorted(list(market_data.keys()))[:20] if isinstance(market_data, dict) else [],
                }
            )

        bookmaker_summaries.append(
            {
                "bookmaker": str(bookmaker_slug),
                "market_count": len(markets),
                "markets_sample": market_summaries[:12],
                "raw_keys": sorted(list(bookmaker_data.keys()))[:20],
            }
        )

    bookmaker_summaries = sorted(
        bookmaker_summaries,
        key=lambda item: item.get("bookmaker") or "",
    )

    top_level = data if isinstance(data, dict) else {}

    return {
        "fixture": {
            "fixtureId": top_level.get("fixtureId"),
            "sportId": top_level.get("sportId"),
            "tournamentId": top_level.get("tournamentId"),
            "statusId": top_level.get("statusId"),
            "hasOdds": top_level.get("hasOdds"),
            "startTime": top_level.get("startTime"),
            "participant1Name": top_level.get("participant1Name"),
            "participant2Name": top_level.get("participant2Name"),
            "tournamentName": top_level.get("tournamentName"),
            "categoryName": top_level.get("categoryName"),
            "updatedAt": top_level.get("updatedAt"),
        },
        "bookmaker_count": len(bookmaker_summaries),
        "total_markets_detected": total_markets,
        "total_outcomes_detected": total_outcomes,
        "one_x_two_candidate_count": len(one_x_two_candidates),
        "one_x_two_candidates": one_x_two_candidates[:80],
        "one_x_two_bookmakers": [
            item["bookmaker"]
            for item in one_x_two_candidates
            if item.get("bookmaker")
        ],
        "bookmakers": bookmaker_summaries[:40],
        "bookmaker_slugs": [item["bookmaker"] for item in bookmaker_summaries],
        "raw_shape": {
            "type": type(data).__name__,
            "top_level_keys": sorted(list(data.keys()))[:40] if isinstance(data, dict) else None,
        },
    }


def oddspapi_odds_diagnostic(
    *,
    core_fixture_id: Optional[int] = None,
    include_raw: bool = False,
    verbosity: int = 2,
) -> Dict[str, Any]:
    """
    Diagnóstico manual de odds para fixture OddsPapi mapeado.

    Atenção:
    - Consome 1 request real.
    - Usa provider_event_map já salvo.
    - Não grava snapshots.
    - Não cria eventos.
    - Não altera evento canônico.
    """

    settings = load_settings()

    if not settings.oddspapi_enrichment_enabled:
        return {
            "ok": False,
            "provider": PROVIDER_ODDSPAPI,
            "reason": "oddspapi_enrichment_disabled",
            "request_count_consumed": 0,
        }

    if not settings.oddspapi_api_key:
        return {
            "ok": False,
            "provider": PROVIDER_ODDSPAPI,
            "reason": "missing_oddspapi_api_key",
            "request_count_consumed": 0,
        }

    verbosity = max(1, min(int(verbosity or 2), 5))

    client = OddspapiClient.from_settings(settings)

    with pg_conn() as conn:
        mapping = _select_oddspapi_mapping_for_odds(
            conn,
            core_fixture_id=core_fixture_id,
        )

        if not mapping:
            return {
                "ok": False,
                "provider": PROVIDER_ODDSPAPI,
                "reason": "no_active_oddspapi_mapping",
                "core_fixture_id": core_fixture_id,
                "request_count_consumed": 0,
            }

        provider_event_id = str(mapping.get("provider_event_id") or "").strip()

        try:
            response = client.get_odds(
                params={
                    "fixtureId": provider_event_id,
                    "oddsFormat": "decimal",
                    "language": "en",
                    "verbosity": verbosity,
                },
                usage_conn=conn,
                hard_cap=settings.oddspapi_monthly_hard_cap,
                reserve=settings.oddspapi_monthly_reserve,
            )
        except OddspapiUsageCapReached as exc:
            status = get_provider_usage_status(
                conn,
                provider=PROVIDER_ODDSPAPI,
                endpoint_group=ENDPOINT_GROUP_REST,
                hard_cap=settings.oddspapi_monthly_hard_cap,
                reserve=settings.oddspapi_monthly_reserve,
            )
            conn.commit()

            return {
                "ok": False,
                "provider": PROVIDER_ODDSPAPI,
                "reason": "provider_monthly_operational_cap_reached",
                "message": str(exc),
                "mapping": mapping,
                "request_count_consumed": 0,
                "usage": status,
            }
        except OddspapiClientError as exc:
            status = get_provider_usage_status(
                conn,
                provider=PROVIDER_ODDSPAPI,
                endpoint_group=ENDPOINT_GROUP_REST,
                hard_cap=settings.oddspapi_monthly_hard_cap,
                reserve=settings.oddspapi_monthly_reserve,
            )
            conn.commit()

            return {
                "ok": False,
                "provider": PROVIDER_ODDSPAPI,
                "reason": "oddspapi_client_error",
                "message": str(exc),
                "endpoint": exc.endpoint,
                "status_code": exc.status_code,
                "payload": exc.payload,
                "mapping": mapping,
                "usage": status,
            }

        status = get_provider_usage_status(
            conn,
            provider=PROVIDER_ODDSPAPI,
            endpoint_group=ENDPOINT_GROUP_REST,
            hard_cap=settings.oddspapi_monthly_hard_cap,
            reserve=settings.oddspapi_monthly_reserve,
        )
        conn.commit()

    summary = _summarize_oddspapi_odds_payload(response.data)

    result: Dict[str, Any] = {
        "ok": True,
        "provider": PROVIDER_ODDSPAPI,
        "mode": "odds_diagnostic",
        "request_count_consumed": 1,
        "endpoint": response.endpoint,
        "request_url_redacted": response.request_url_redacted,
        "status_code": response.status_code,
        "usage_claim": response.usage_claim,
        "usage": status,
        "mapping": mapping,
        "odds_summary": summary,
        "policy": {
            "runs_inside_pipeline_run_all": False,
            "runs_in_realtime_product": False,
            "creates_events": False,
            "updates_event_metadata": False,
            "writes_mapping": False,
            "writes_snapshots": False,
            "bookmaker_filter_applied": False,
        },
    }

    if include_raw:
        result["raw"] = response.data

    return result

def _parse_allowed_bookmakers(value: Optional[str]) -> List[str]:
    if not value:
        return []

    return [
        item.strip()
        for item in str(value).split(",")
        if item and item.strip()
    ]


def _bookmaker_root(value: Any) -> str:
    raw = str(value or "").strip().lower()
    if not raw:
        return ""
    return raw.split(".")[0].strip()


def _bookmaker_is_allowed(
    *,
    bookmaker: str,
    allowed_bookmakers: List[str],
) -> bool:
    if not allowed_bookmakers:
        return True

    bookmaker_token = _normalize_bookmaker_token(bookmaker)
    bookmaker_root = _bookmaker_root(bookmaker)

    for allowed in allowed_bookmakers:
        allowed_token = _normalize_bookmaker_token(allowed)
        allowed_root = _bookmaker_root(allowed)

        if not allowed_token:
            continue

        if bookmaker_token == allowed_token:
            return True

        # Permite casar "estrelabet" com "estrelabet.bet.br",
        # "superbet.ro" com "superbet", etc.
        if bookmaker_root and allowed_root and bookmaker_root == allowed_root:
            return True

        if bookmaker_token and allowed_token:
            if bookmaker_token.startswith(allowed_token) or allowed_token.startswith(bookmaker_token):
                return True

    return False


def _select_1x2_candidates_for_write(
    *,
    candidates: List[Dict[str, Any]],
    allowed_bookmakers: List[str],
    max_bookmakers: int,
) -> List[Dict[str, Any]]:
    max_bookmakers = max(1, min(int(max_bookmakers or 10), 40))

    selected: List[Dict[str, Any]] = []
    seen = set()

    for item in candidates or []:
        bookmaker = str(item.get("bookmaker") or "").strip()
        if not bookmaker:
            continue

        if bookmaker in seen:
            continue

        if not _bookmaker_is_allowed(
            bookmaker=bookmaker,
            allowed_bookmakers=allowed_bookmakers,
        ):
            continue

        home = _safe_float(item.get("home"))
        draw = _safe_float(item.get("draw"))
        away = _safe_float(item.get("away"))

        if home is None or draw is None or away is None:
            continue

        if home <= 1.0 or draw <= 1.0 or away <= 1.0:
            continue

        selected.append(
            {
                "bookmaker": bookmaker,
                "market_id": item.get("market_id") or "101",
                "market_active": bool(item.get("market_active", True)),
                "bookmaker_market_id": item.get("bookmaker_market_id"),
                "home": home,
                "draw": draw,
                "away": away,
            }
        )
        seen.add(bookmaker)

        if len(selected) >= max_bookmakers:
            break

    return selected


def _get_core_fixture_policy_bucket(
    conn,
    *,
    core_fixture_id: int,
) -> str:
    sql = """
      SELECT EXTRACT(EPOCH FROM (kickoff_utc - now())) / 3600.0 AS hours_until
      FROM core.fixtures
      WHERE fixture_id = %(fixture_id)s
      LIMIT 1
    """

    with conn.cursor() as cur:
        cur.execute(sql, {"fixture_id": int(core_fixture_id)})
        row = cur.fetchone()

    if not row:
        return "unknown"

    hours_until = float(row[0]) if row[0] is not None else None
    return _policy_bucket(hours_until)


def _insert_oddspapi_1x2_snapshots(
    conn,
    *,
    canonical_event_id: str,
    selected_candidates: List[Dict[str, Any]],
    captured_at_utc: datetime,
) -> Dict[str, Any]:
    sql = """
      INSERT INTO odds.odds_snapshots_1x2 (
        event_id,
        bookmaker,
        market,
        odds_home,
        odds_draw,
        odds_away,
        captured_at_utc
      )
      VALUES (
        %(event_id)s,
        %(bookmaker)s,
        %(market)s,
        %(odds_home)s,
        %(odds_draw)s,
        %(odds_away)s,
        %(captured_at_utc)s
      )
      ON CONFLICT DO NOTHING
    """

    inserted = 0
    skipped = 0
    rows: List[Dict[str, Any]] = []

    with conn.cursor() as cur:
        for item in selected_candidates:
            bookmaker = str(item.get("bookmaker") or "").strip()
            if not bookmaker:
                skipped += 1
                continue

            params = {
                "event_id": str(canonical_event_id),
                "bookmaker": f"oddspapi:{bookmaker}",
                "market": "h2h",
                "odds_home": _safe_float(item.get("home")),
                "odds_draw": _safe_float(item.get("draw")),
                "odds_away": _safe_float(item.get("away")),
                "captured_at_utc": captured_at_utc,
            }

            if (
                params["odds_home"] is None
                or params["odds_draw"] is None
                or params["odds_away"] is None
            ):
                skipped += 1
                continue

            cur.execute(sql, params)

            if cur.rowcount == 1:
                inserted += 1
            else:
                skipped += 1

            rows.append(
                {
                    "event_id": params["event_id"],
                    "bookmaker": params["bookmaker"],
                    "market": params["market"],
                    "odds_home": float(params["odds_home"]),
                    "odds_draw": float(params["odds_draw"]),
                    "odds_away": float(params["odds_away"]),
                    "captured_at_utc": captured_at_utc.isoformat(),
                    "inserted": cur.rowcount == 1,
                }
            )

    return {
        "inserted": inserted,
        "skipped": skipped,
        "rows": rows,
    }


def oddspapi_write_1x2_snapshots(
    *,
    core_fixture_id: Optional[int] = None,
    allowed_bookmakers: Optional[str] = None,
    max_bookmakers: int = 10,
    dry_run: bool = True,
    force: bool = False,
    verbosity: int = 2,
) -> Dict[str, Any]:
    """
    Writer controlado de OddsPapi -> odds.odds_snapshots_1x2.

    Atenção:
    - Consome 1 request real quando não for pulado por refresh log.
    - Usa provider_event_map já salvo.
    - Grava somente market 1X2 / h2h.
    - Não cria evento.
    - Não altera fixture.
    - Não entra no run_all.
    """

    settings = load_settings()

    if not settings.oddspapi_enrichment_enabled:
        return {
            "ok": False,
            "provider": PROVIDER_ODDSPAPI,
            "reason": "oddspapi_enrichment_disabled",
            "request_count_consumed": 0,
        }

    if not settings.oddspapi_api_key:
        return {
            "ok": False,
            "provider": PROVIDER_ODDSPAPI,
            "reason": "missing_oddspapi_api_key",
            "request_count_consumed": 0,
        }

    verbosity = max(1, min(int(verbosity or 2), 5))
    max_bookmakers = max(1, min(int(max_bookmakers or 10), 40))

    explicit_allowed = _parse_allowed_bookmakers(allowed_bookmakers)

    configured_allowed = list(settings.oddspapi_primary_bookmakers or []) + list(
        settings.oddspapi_secondary_bookmakers or []
    )

    effective_allowed = explicit_allowed or configured_allowed

    client = OddspapiClient.from_settings(settings)

    with pg_conn() as conn:
        mapping = _select_oddspapi_mapping_for_odds(
            conn,
            core_fixture_id=core_fixture_id,
        )

        if not mapping:
            return {
                "ok": False,
                "provider": PROVIDER_ODDSPAPI,
                "reason": "no_active_oddspapi_mapping",
                "core_fixture_id": core_fixture_id,
                "request_count_consumed": 0,
            }

        core_fixture_id_value = int(mapping.get("core_fixture_id") or 0)
        canonical_event_id = str(mapping.get("canonical_event_id") or "").strip()
        provider_event_id = str(mapping.get("provider_event_id") or "").strip()

        if not core_fixture_id_value or not canonical_event_id or not provider_event_id:
            return {
                "ok": False,
                "provider": PROVIDER_ODDSPAPI,
                "reason": "invalid_mapping",
                "mapping": mapping,
                "request_count_consumed": 0,
            }

        policy_bucket = _get_core_fixture_policy_bucket(
            conn,
            core_fixture_id=core_fixture_id_value,
        )

        skip_info = should_skip_provider_refresh(
            conn,
            provider=PROVIDER_ODDSPAPI,
            core_fixture_id=core_fixture_id_value,
            policy_bucket=policy_bucket,
        )

        if skip_info.get("skip") and not force:
            return {
                "ok": True,
                "provider": PROVIDER_ODDSPAPI,
                "mode": "write_1x2_snapshots",
                "skipped": True,
                "skip_reason": skip_info.get("reason"),
                "existing_refresh_log": skip_info.get("existing"),
                "mapping": mapping,
                "policy_bucket": policy_bucket,
                "request_count_consumed": 0,
                "dry_run": bool(dry_run),
            }

        try:
            response = client.get_odds(
                params={
                    "fixtureId": provider_event_id,
                    "oddsFormat": "decimal",
                    "language": "en",
                    "verbosity": verbosity,
                },
                usage_conn=conn,
                hard_cap=settings.oddspapi_monthly_hard_cap,
                reserve=settings.oddspapi_monthly_reserve,
            )
        except OddspapiUsageCapReached as exc:
            status = get_provider_usage_status(
                conn,
                provider=PROVIDER_ODDSPAPI,
                endpoint_group=ENDPOINT_GROUP_REST,
                hard_cap=settings.oddspapi_monthly_hard_cap,
                reserve=settings.oddspapi_monthly_reserve,
            )
            conn.commit()

            return {
                "ok": False,
                "provider": PROVIDER_ODDSPAPI,
                "reason": "provider_monthly_operational_cap_reached",
                "message": str(exc),
                "mapping": mapping,
                "request_count_consumed": 0,
                "usage": status,
            }
        except OddspapiClientError as exc:
            status = get_provider_usage_status(
                conn,
                provider=PROVIDER_ODDSPAPI,
                endpoint_group=ENDPOINT_GROUP_REST,
                hard_cap=settings.oddspapi_monthly_hard_cap,
                reserve=settings.oddspapi_monthly_reserve,
            )
            conn.commit()

            return {
                "ok": False,
                "provider": PROVIDER_ODDSPAPI,
                "reason": "oddspapi_client_error",
                "message": str(exc),
                "endpoint": exc.endpoint,
                "status_code": exc.status_code,
                "payload": exc.payload,
                "mapping": mapping,
                "usage": status,
            }

        all_candidates = _extract_1x2_candidates_from_odds_payload(response.data)
        selected_candidates = _select_1x2_candidates_for_write(
            candidates=all_candidates,
            allowed_bookmakers=effective_allowed,
            max_bookmakers=max_bookmakers,
        )

        captured_at_utc = datetime.now(timezone.utc)

        write_result: Dict[str, Any] = {
            "inserted": 0,
            "skipped": 0,
            "rows": [],
        }

        refresh_log = None

        if not selected_candidates:
            if not dry_run:
                refresh_log = record_provider_refresh_log(
                    conn,
                    provider=PROVIDER_ODDSPAPI,
                    core_fixture_id=core_fixture_id_value,
                    canonical_event_id=canonical_event_id,
                    provider_event_id=provider_event_id,
                    policy_bucket=policy_bucket,
                    status="skipped_no_supported_bookmakers",
                    error=None,
                )
                conn.commit()
        elif not dry_run:
            write_result = _insert_oddspapi_1x2_snapshots(
                conn,
                canonical_event_id=canonical_event_id,
                selected_candidates=selected_candidates,
                captured_at_utc=captured_at_utc,
            )

            refresh_log = record_provider_refresh_log(
                conn,
                provider=PROVIDER_ODDSPAPI,
                core_fixture_id=core_fixture_id_value,
                canonical_event_id=canonical_event_id,
                provider_event_id=provider_event_id,
                policy_bucket=policy_bucket,
                status="ok",
                error=None,
            )
            conn.commit()
        else:
            conn.commit()

        status = get_provider_usage_status(
            conn,
            provider=PROVIDER_ODDSPAPI,
            endpoint_group=ENDPOINT_GROUP_REST,
            hard_cap=settings.oddspapi_monthly_hard_cap,
            reserve=settings.oddspapi_monthly_reserve,
        )

    return {
        "ok": True,
        "provider": PROVIDER_ODDSPAPI,
        "mode": "write_1x2_snapshots",
        "dry_run": bool(dry_run),
        "request_count_consumed": 1,
        "endpoint": response.endpoint,
        "request_url_redacted": response.request_url_redacted,
        "status_code": response.status_code,
        "usage_claim": response.usage_claim,
        "usage": status,
        "mapping": mapping,
        "policy_bucket": policy_bucket,
        "allowed_bookmakers": effective_allowed,
        "all_1x2_candidate_count": len(all_candidates),
        "selected_1x2_candidate_count": len(selected_candidates),
        "selected_1x2_candidates": selected_candidates,
        "write_result": write_result,
        "refresh_log": refresh_log,
        "policy": {
            "runs_inside_pipeline_run_all": False,
            "runs_in_realtime_product": False,
            "creates_events": False,
            "updates_event_metadata": False,
            "writes_snapshots": not bool(dry_run),
            "bookmaker_prefix": "oddspapi:",
            "market": "h2h",
        },
    }

def oddspapi_enrichment_events_status(
    *,
    core_fixture_id: Optional[int] = None,
    canonical_event_id: Optional[str] = None,
    limit: int = 50,
) -> Dict[str, Any]:
    """
    Status operacional da integração OddsPapi por evento.

    Atenção:
    - Não chama OddsPapi.
    - Não consome request.
    - Não grava nada.
    - Serve para Admin/observabilidade.
    """

    limit = max(1, min(int(limit or 50), 200))

    where_parts = [
        "pem.provider = %(provider)s",
    ]

    params: Dict[str, Any] = {
        "provider": PROVIDER_ODDSPAPI,
        "limit": int(limit),
    }

    if core_fixture_id:
        where_parts.append("pem.core_fixture_id = %(core_fixture_id)s")
        params["core_fixture_id"] = int(core_fixture_id)

    safe_canonical_event_id = str(canonical_event_id or "").strip()
    if safe_canonical_event_id:
        where_parts.append("pem.canonical_event_id = %(canonical_event_id)s")
        params["canonical_event_id"] = safe_canonical_event_id

    where_sql = " AND ".join(where_parts)

    sql = f"""
      SELECT
        pem.provider,
        pem.provider_event_id,
        pem.canonical_event_id,
        pem.core_fixture_id,
        pem.sport_key,
        pem.confidence,
        pem.match_reason,
        pem.active,
        pem.created_at_utc,
        pem.updated_at_utc,

        COALESCE(snapshot_stats.snapshot_count, 0) AS oddspapi_snapshot_count,
        snapshot_stats.last_captured_at_utc,
        snapshot_stats.bookmakers_csv,

        COALESCE(refresh_stats.refresh_log_count, 0) AS refresh_log_count,
        refresh_stats.last_refresh_log_at_utc,
        refresh_stats.refresh_summary

      FROM odds.provider_event_map pem

      LEFT JOIN LATERAL (
        SELECT
          COUNT(*) AS snapshot_count,
          MAX(os.captured_at_utc) AS last_captured_at_utc,
          (
            SELECT STRING_AGG(bookmaker, ',' ORDER BY bookmaker)
            FROM (
              SELECT DISTINCT os2.bookmaker
              FROM odds.odds_snapshots_1x2 os2
              WHERE os2.event_id = pem.canonical_event_id
                AND os2.bookmaker LIKE 'oddspapi:%%'
            ) distinct_bookmakers
          ) AS bookmakers_csv
        FROM odds.odds_snapshots_1x2 os
        WHERE os.event_id = pem.canonical_event_id
          AND os.bookmaker LIKE 'oddspapi:%%'
      ) snapshot_stats ON true

      LEFT JOIN LATERAL (
        SELECT
          COUNT(*) AS refresh_log_count,
          MAX(rl.updated_at_utc) AS last_refresh_log_at_utc,
          STRING_AGG(
            rl.policy_bucket || ':' || rl.status,
            ', ' ORDER BY rl.updated_at_utc DESC
          ) AS refresh_summary
        FROM odds.provider_event_refresh_log rl
        WHERE rl.provider = pem.provider
          AND rl.core_fixture_id = pem.core_fixture_id
      ) refresh_stats ON true

      WHERE {where_sql}
      ORDER BY pem.updated_at_utc DESC
      LIMIT %(limit)s
    """

    items: List[Dict[str, Any]] = []

    with pg_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            rows = cur.fetchall() or []

        usage = get_provider_usage_status(
            conn,
            provider=PROVIDER_ODDSPAPI,
            endpoint_group=ENDPOINT_GROUP_REST,
            hard_cap=load_settings().oddspapi_monthly_hard_cap,
            reserve=load_settings().oddspapi_monthly_reserve,
        )

    for row in rows:
        bookmakers_csv = row[12] or ""
        bookmakers = [
            item.strip()
            for item in str(bookmakers_csv).split(",")
            if item.strip()
        ]

        items.append(
            {
                "provider": row[0],
                "provider_event_id": row[1],
                "canonical_event_id": row[2],
                "core_fixture_id": int(row[3]) if row[3] is not None else None,
                "sport_key": row[4],
                "confidence": float(row[5]) if row[5] is not None else None,
                "match_reason": row[6],
                "active": bool(row[7]),
                "created_at_utc": row[8].isoformat() if row[8] else None,
                "updated_at_utc": row[9].isoformat() if row[9] else None,
                "snapshots_1x2": {
                    "count": int(row[10] or 0),
                    "last_captured_at_utc": row[11].isoformat() if row[11] else None,
                    "bookmakers": bookmakers,
                },
                "refresh": {
                    "log_count": int(row[13] or 0),
                    "last_refresh_log_at_utc": row[14].isoformat() if row[14] else None,
                    "summary": row[15],
                },
            }
        )

    return {
        "ok": True,
        "provider": PROVIDER_ODDSPAPI,
        "mode": "events_status",
        "request_count_consumed": 0,
        "count": len(items),
        "filters": {
            "core_fixture_id": int(core_fixture_id) if core_fixture_id else None,
            "canonical_event_id": safe_canonical_event_id or None,
            "limit": int(limit),
        },
        "usage": usage,
        "items": items,
        "policy": {
            "calls_oddspapi": False,
            "runs_inside_pipeline_run_all": False,
            "runs_in_realtime_product": False,
            "writes_snapshots": False,
            "writes_mapping": False,
        },
    }

def _select_mapped_events_for_oddspapi_batch(
    conn,
    *,
    window_hours: int,
    limit: int,
) -> List[Dict[str, Any]]:
    window_hours = max(1, min(int(window_hours or 72), 72))
    limit = max(1, min(int(limit or 20), 200))

    sql = """
      SELECT
        pem.provider,
        pem.provider_event_id,
        pem.canonical_event_id,
        pem.core_fixture_id,
        pem.sport_key,
        pem.confidence,
        pem.match_reason,
        pem.active,
        pem.created_at_utc,
        pem.updated_at_utc,

        f.kickoff_utc,
        f.status_short,
        f.status_long,
        f.is_finished,
        f.is_cancelled,
        EXTRACT(EPOCH FROM (f.kickoff_utc - now())) / 3600.0 AS hours_until,

        ht.name AS home_name,
        at.name AS away_name,
        l.name AS league_name,
        l.country_name AS country_name,

        COALESCE(snapshot_stats.snapshot_count, 0) AS oddspapi_snapshot_count,
        snapshot_stats.last_captured_at_utc

      FROM odds.provider_event_map pem
      JOIN core.fixtures f
        ON f.fixture_id = pem.core_fixture_id
      JOIN core.teams ht
        ON ht.team_id = f.home_team_id
      JOIN core.teams at
        ON at.team_id = f.away_team_id
      JOIN core.leagues l
        ON l.league_id = f.league_id

      LEFT JOIN LATERAL (
        SELECT
          COUNT(*) AS snapshot_count,
          MAX(os.captured_at_utc) AS last_captured_at_utc
        FROM odds.odds_snapshots_1x2 os
        WHERE os.event_id = pem.canonical_event_id
          AND os.bookmaker LIKE 'oddspapi:%%'
      ) snapshot_stats ON true

      WHERE pem.provider = %(provider)s
        AND pem.active = true
        AND f.kickoff_utc > now()
        AND f.kickoff_utc <= now() + (%(window_hours)s || ' hours')::interval
        AND COALESCE(f.is_finished, false) = false
        AND COALESCE(f.is_cancelled, false) = false
        AND COALESCE(f.status_short, 'NS') NOT IN (
          '1H', 'HT', '2H', 'ET', 'P', 'FT', 'AET', 'PEN', 'BT',
          'SUSP', 'INT', 'PST', 'CANC', 'ABD', 'AWD', 'WO'
        )
      ORDER BY f.kickoff_utc ASC, pem.updated_at_utc DESC
      LIMIT %(limit)s
    """

    with conn.cursor() as cur:
        cur.execute(
            sql,
            {
                "provider": PROVIDER_ODDSPAPI,
                "window_hours": int(window_hours),
                "limit": int(limit),
            },
        )
        rows = cur.fetchall() or []

    items: List[Dict[str, Any]] = []

    for row in rows:
        hours_until = float(row[15]) if row[15] is not None else None
        policy_bucket = _policy_bucket(hours_until)

        items.append(
            {
                "provider": row[0],
                "provider_event_id": row[1],
                "canonical_event_id": row[2],
                "core_fixture_id": int(row[3]) if row[3] is not None else None,
                "sport_key": row[4],
                "confidence": float(row[5]) if row[5] is not None else None,
                "match_reason": row[6],
                "active": bool(row[7]),
                "created_at_utc": row[8].isoformat() if row[8] else None,
                "updated_at_utc": row[9].isoformat() if row[9] else None,
                "kickoff_utc": row[10].isoformat() if row[10] else None,
                "status_short": row[11],
                "status_long": row[12],
                "is_finished": bool(row[13]),
                "is_cancelled": bool(row[14]),
                "hours_until": round(hours_until, 3) if hours_until is not None else None,
                "policy_bucket": policy_bucket,
                "home_name": row[16],
                "away_name": row[17],
                "league_name": row[18],
                "country_name": row[19],
                "existing_oddspapi_snapshots": {
                    "count": int(row[20] or 0),
                    "last_captured_at_utc": row[21].isoformat() if row[21] else None,
                },
            }
        )

    return items


def oddspapi_batch_write_1x2_mapped_events(
    *,
    window_hours: int = 72,
    max_events: int = 3,
    max_external_requests: int = 3,
    allowed_bookmakers: Optional[str] = None,
    max_bookmakers_per_event: int = 10,
    dry_run: bool = True,
    force: bool = False,
    verbosity: int = 2,
) -> Dict[str, Any]:
    """
    Batch manual de OddsPapi para eventos já mapeados.

    Atenção:
    - dry_run=True não chama OddsPapi.
    - dry_run=False pode consumir até max_external_requests.
    - Só processa eventos com provider_event_map ativo.
    - Não faz auto-matching.
    - Não entra no run_all.
    """

    window_hours = max(1, min(int(window_hours or 72), 72))
    max_events = max(1, min(int(max_events or 3), 50))
    max_external_requests = max(0, min(int(max_external_requests or 0), 20))
    max_bookmakers_per_event = max(1, min(int(max_bookmakers_per_event or 10), 40))
    verbosity = max(1, min(int(verbosity or 2), 5))

    settings = load_settings()

    if not settings.oddspapi_enrichment_enabled:
        return {
            "ok": False,
            "provider": PROVIDER_ODDSPAPI,
            "reason": "oddspapi_enrichment_disabled",
            "request_count_consumed": 0,
        }

    if not settings.oddspapi_api_key:
        return {
            "ok": False,
            "provider": PROVIDER_ODDSPAPI,
            "reason": "missing_oddspapi_api_key",
            "request_count_consumed": 0,
        }

    with pg_conn() as conn:
        candidates = _select_mapped_events_for_oddspapi_batch(
            conn,
            window_hours=window_hours,
            limit=max_events,
        )

        usage_before = get_provider_usage_status(
            conn,
            provider=PROVIDER_ODDSPAPI,
            endpoint_group=ENDPOINT_GROUP_REST,
            hard_cap=settings.oddspapi_monthly_hard_cap,
            reserve=settings.oddspapi_monthly_reserve,
        )

        planned_items: List[Dict[str, Any]] = []

        for item in candidates:
            core_fixture_id_value = int(item.get("core_fixture_id") or 0)
            policy_bucket = str(item.get("policy_bucket") or "unknown")

            skip_info = should_skip_provider_refresh(
                conn,
                provider=PROVIDER_ODDSPAPI,
                core_fixture_id=core_fixture_id_value,
                policy_bucket=policy_bucket,
            )

            would_call_provider = bool(not skip_info.get("skip"))

            planned_items.append(
                {
                    **item,
                    "refresh_decision": {
                        "would_call_provider": would_call_provider,
                        "skip": bool(skip_info.get("skip")),
                        "skip_reason": skip_info.get("reason"),
                        "existing_refresh_log": skip_info.get("existing"),
                    },
                }
            )

    request_budget_remaining = int(max_external_requests)
    request_count_consumed = 0

    results: List[Dict[str, Any]] = []
    counters = {
        "candidate_count": len(planned_items),
        "would_call_provider": 0,
        "skipped_by_refresh_log": 0,
        "skipped_by_request_budget": 0,
        "executed": 0,
        "failed": 0,
        "inserted_snapshots": 0,
    }

    for item in planned_items:
        refresh_decision = item.get("refresh_decision") or {}
        core_fixture_id_value = int(item.get("core_fixture_id") or 0)

        if refresh_decision.get("skip") and not force:
            counters["skipped_by_refresh_log"] += 1
            results.append(
                {
                    "core_fixture_id": core_fixture_id_value,
                    "canonical_event_id": item.get("canonical_event_id"),
                    "provider_event_id": item.get("provider_event_id"),
                    "policy_bucket": item.get("policy_bucket"),
                    "action": "skipped_by_refresh_log",
                    "request_count_consumed": 0,
                    "skip_reason": refresh_decision.get("skip_reason"),
                }
            )
            continue

        counters["would_call_provider"] += 1

        if dry_run:
            results.append(
                {
                    "core_fixture_id": core_fixture_id_value,
                    "canonical_event_id": item.get("canonical_event_id"),
                    "provider_event_id": item.get("provider_event_id"),
                    "policy_bucket": item.get("policy_bucket"),
                    "action": "would_call_provider",
                    "request_count_consumed": 0,
                    "dry_run": True,
                }
            )
            continue

        if request_budget_remaining <= 0:
            counters["skipped_by_request_budget"] += 1
            results.append(
                {
                    "core_fixture_id": core_fixture_id_value,
                    "canonical_event_id": item.get("canonical_event_id"),
                    "provider_event_id": item.get("provider_event_id"),
                    "policy_bucket": item.get("policy_bucket"),
                    "action": "skipped_by_request_budget",
                    "request_count_consumed": 0,
                }
            )
            continue

        write_result = oddspapi_write_1x2_snapshots(
            core_fixture_id=core_fixture_id_value,
            allowed_bookmakers=allowed_bookmakers,
            max_bookmakers=max_bookmakers_per_event,
            dry_run=False,
            force=force,
            verbosity=verbosity,
        )

        consumed = int(write_result.get("request_count_consumed") or 0)
        request_count_consumed += consumed
        request_budget_remaining -= consumed

        if write_result.get("ok") is True:
            counters["executed"] += 1
            counters["inserted_snapshots"] += int(
                ((write_result.get("write_result") or {}).get("inserted")) or 0
            )
        else:
            counters["failed"] += 1

        results.append(
            {
                "core_fixture_id": core_fixture_id_value,
                "canonical_event_id": item.get("canonical_event_id"),
                "provider_event_id": item.get("provider_event_id"),
                "policy_bucket": item.get("policy_bucket"),
                "action": "executed",
                "request_count_consumed": consumed,
                "result": write_result,
            }
        )

    with pg_conn() as conn:
        usage_after = get_provider_usage_status(
            conn,
            provider=PROVIDER_ODDSPAPI,
            endpoint_group=ENDPOINT_GROUP_REST,
            hard_cap=settings.oddspapi_monthly_hard_cap,
            reserve=settings.oddspapi_monthly_reserve,
        )

    return {
        "ok": True,
        "provider": PROVIDER_ODDSPAPI,
        "mode": "batch_write_1x2_mapped_events",
        "dry_run": bool(dry_run),
        "request_count_consumed": request_count_consumed,
        "params": {
            "window_hours": int(window_hours),
            "max_events": int(max_events),
            "max_external_requests": int(max_external_requests),
            "allowed_bookmakers": allowed_bookmakers,
            "max_bookmakers_per_event": int(max_bookmakers_per_event),
            "force": bool(force),
            "verbosity": int(verbosity),
        },
        "usage_before": usage_before,
        "usage_after": usage_after,
        "counters": counters,
        "items": results,
        "policy": {
            "calls_oddspapi": not bool(dry_run),
            "runs_inside_pipeline_run_all": False,
            "runs_in_realtime_product": False,
            "creates_events": False,
            "updates_event_metadata": False,
            "writes_snapshots": not bool(dry_run),
            "requires_existing_mapping": True,
            "does_auto_matching": False,
        },
    }