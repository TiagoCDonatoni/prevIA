from __future__ import annotations

import json
import re
import unicodedata
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Sequence, Set, Tuple

from src.core.settings import load_settings
from src.db.pg import pg_conn
from src.provider.apifootball.client import ApiFootballClient
from src.ops.jobs.worldcup_pool_results_sync import (
    API_PROVIDER,
    COMPETITION_KEY,
    _api_round,
    _api_team_id,
    _api_venue_city,
    _api_venue_name,
    _fixture_id,
    _jsonb,
    _normalize_api_round_phase,
    _status_elapsed,
    _status_long,
    _status_short,
)

TEAM_ALIAS_GROUPS = [
    {"africa do sul", "south africa", "sudafrica"},
    {"canada"},
    {"brasil", "brazil"},
    {"japao", "japan", "japon"},
    {"alemanha", "germany", "alemania"},
    {"paraguai", "paraguay"},
    {"holanda", "netherlands", "paises baixos", "países bajos"},
    {"marrocos", "morocco", "marruecos"},
    {"costa do marfim", "cote d ivoire", "cote divoire", "ivory coast", "costa de marfil"},
    {"noruega", "norway"},
    {"franca", "france", "francia"},
    {"suecia", "sweden"},
    {"mexico", "méxico"},
    {"equador", "ecuador"},
    {"inglaterra", "england"},
    {
        "republica democratica do congo",
        "democratic republic of the congo",
        "republica democratica del congo",
        "dr congo",
        "congo dr",
        "congo",
    },
    {"belgica", "belgium"},
    {"senegal"},
    {"estados unidos", "united states", "usa", "us"},
    {
        "bosnia",
        "bosnia herzegovina",
        "bosnia e herzegovina",
        "bosnia and herzegovina",
        "bosnia y herzegovina",
    },
    {"espanha", "spain", "espana"},
    {"portugal"},
    {"croacia", "croatia"},
    {"austria"},
    {"suica", "switzerland", "suiza"},
    {"argelia", "algeria"},
    {"australia"},
    {"egito", "egypt", "egipto"},
    {"argentina"},
    {"cabo verde", "cape verde", "cape verde islands"},
    {"colombia", "colombia"},
    {"gana", "ghana"},
]


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _normalize_text(value: Any) -> str:
    raw = str(value or "").strip().lower()
    if not raw:
        return ""

    raw = unicodedata.normalize("NFKD", raw)
    raw = "".join(ch for ch in raw if not unicodedata.combining(ch))
    raw = re.sub(r"[^a-z0-9]+", " ", raw)
    return " ".join(raw.split())


def _expanded_names(values: Sequence[Any]) -> Set[str]:
    names: Set[str] = set()

    for value in values:
        normalized = _normalize_text(value)
        if normalized:
            names.add(normalized)

    changed = True
    while changed:
        changed = False
        for group in TEAM_ALIAS_GROUPS:
            normalized_group = {_normalize_text(item) for item in group if _normalize_text(item)}
            if names.intersection(normalized_group):
                before = len(names)
                names.update(normalized_group)
                changed = changed or len(names) > before

    return names


def _i18n_values(value: Any) -> List[str]:
    if isinstance(value, dict):
        return [str(item).strip() for item in value.values() if str(item or "").strip()]

    return []


def _match_side_names(match: Dict[str, Any], side: str) -> Set[str]:
    team_key = f"{side}_team_i18n"
    label_key = f"{side}_label_i18n"

    values: List[str] = []
    values.extend(_i18n_values(match.get(team_key)))
    values.extend(_i18n_values(match.get(label_key)))

    return _expanded_names(values)


def _api_team_name(item: Dict[str, Any], side: str) -> str:
    teams = item.get("teams") or {}
    team = teams.get(side) or {}
    return str(team.get("name") or "").strip()


def _api_side_names(item: Dict[str, Any], side: str) -> Set[str]:
    return _expanded_names([_api_team_name(item, side)])


def _is_placeholder_names(names: Set[str]) -> bool:
    joined = " ".join(sorted(names))
    placeholder_tokens = [
        "segundo do grupo",
        "segundo del grupo",
        "runner up",
        "2 colocado",
        "2 del grupo",
        "melhor terceiro",
        "mejor tercero",
        "best 3rd",
        "vencedor do jogo",
        "winner of match",
        "ganador del partido",
        "perdedor do jogo",
        "loser of match",
        "perdedor del partido",
    ]
    return any(token in joined for token in placeholder_tokens)


def _parse_api_kickoff(item: Dict[str, Any]) -> Optional[datetime]:
    value = ((item.get("fixture") or {}).get("date"))
    if not value:
        return None

    raw = str(value).strip().replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(raw)
    except Exception:
        return None

    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)

    return parsed.astimezone(timezone.utc)


def _minutes_delta(a: Optional[datetime], b: Optional[datetime]) -> Optional[int]:
    if not a or not b:
        return None

    if a.tzinfo is None:
        a = a.replace(tzinfo=timezone.utc)
    if b.tzinfo is None:
        b = b.replace(tzinfo=timezone.utc)

    return int(abs((a.astimezone(timezone.utc) - b.astimezone(timezone.utc)).total_seconds()) // 60)


def _load_unmapped_matches(
    *,
    competition_key: str,
    phase: Optional[str],
    min_official_match_no: int,
    max_official_match_no: int,
    limit: int,
) -> List[Dict[str, Any]]:
    sql = """
      SELECT
        id,
        official_match_no,
        phase,
        kickoff_utc,
        status,
        home_label_i18n,
        away_label_i18n,
        home_team_i18n,
        away_team_i18n
      FROM worldcup_pool.matches
      WHERE competition_key = %(competition_key)s
        AND api_fixture_id IS NULL
        AND kickoff_utc IS NOT NULL
        AND status NOT IN ('cancelled', 'finished')
        AND official_match_no BETWEEN %(min_official_match_no)s AND %(max_official_match_no)s
        AND (
          CAST(%(phase)s AS text) IS NULL
          OR phase = CAST(%(phase)s AS text)
        )
      ORDER BY official_match_no ASC
      LIMIT %(limit)s
    """

    with pg_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                sql,
                {
                    "competition_key": competition_key,
                    "phase": phase,
                    "min_official_match_no": int(min_official_match_no),
                    "max_official_match_no": int(max_official_match_no),
                    "limit": max(1, int(limit or 100)),
                },
            )
            rows = cur.fetchall()

    return [
        {
            "id": int(row[0]),
            "official_match_no": int(row[1]),
            "phase": str(row[2] or "").strip(),
            "kickoff_utc": row[3],
            "status": str(row[4] or "").strip(),
            "home_label_i18n": row[5] or {},
            "away_label_i18n": row[6] or {},
            "home_team_i18n": row[7] or {},
            "away_team_i18n": row[8] or {},
        }
        for row in rows
    ]


def _load_existing_api_fixture_ids(*, competition_key: str) -> Set[int]:
    sql = """
      SELECT api_fixture_id
      FROM worldcup_pool.matches
      WHERE competition_key = %(competition_key)s
        AND api_provider = %(api_provider)s
        AND api_fixture_id IS NOT NULL
    """

    with pg_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                sql,
                {
                    "competition_key": competition_key,
                    "api_provider": API_PROVIDER,
                },
            )
            rows = cur.fetchall()

    return {int(row[0]) for row in rows if row and row[0] is not None}


def _fetch_api_fixtures(
    *,
    league_id: int,
    season: int,
) -> Tuple[int, Dict[str, Any]]:
    settings = load_settings()
    client = ApiFootballClient(
        base_url=settings.apifootball_base_url,
        api_key=settings.apifootball_key,
        timeout_s=30,
    )
    return client.get(
        "/fixtures",
        {
            "league": int(league_id),
            "season": int(season),
        },
    )


def _score_mapping_candidate(
    *,
    match: Dict[str, Any],
    item: Dict[str, Any],
    kickoff_tolerance_minutes: int,
    auto_map_score_threshold: int,
    allow_placeholder_side_auto: bool,
) -> Optional[Dict[str, Any]]:
    api_fixture_id = _fixture_id(item)
    if not api_fixture_id:
        return None

    internal_phase = str(match.get("phase") or "").strip()
    api_round = _api_round(item)
    api_phase = _normalize_api_round_phase(api_round)

    if api_phase and internal_phase and api_phase != internal_phase:
        return None

    internal_kickoff = match.get("kickoff_utc")
    api_kickoff = _parse_api_kickoff(item)
    delta_minutes = _minutes_delta(internal_kickoff, api_kickoff)

    if delta_minutes is None or delta_minutes > int(kickoff_tolerance_minutes):
        return None

    home_names = _match_side_names(match, "home")
    away_names = _match_side_names(match, "away")
    api_home_names = _api_side_names(item, "home")
    api_away_names = _api_side_names(item, "away")

    home_match = bool(home_names.intersection(api_home_names))
    away_match = bool(away_names.intersection(api_away_names))
    swapped_home_match = bool(home_names.intersection(api_away_names))
    swapped_away_match = bool(away_names.intersection(api_home_names))

    home_placeholder = _is_placeholder_names(home_names)
    away_placeholder = _is_placeholder_names(away_names)

    score = 0
    reasons: List[str] = []

    if delta_minutes <= 5:
        score += 45
        reasons.append("kickoff_exact")
    elif delta_minutes <= 30:
        score += 38
        reasons.append("kickoff_close_30m")
    else:
        score += 28
        reasons.append("kickoff_close_tolerance")

    if api_phase and api_phase == internal_phase:
        score += 25
        reasons.append("phase_match")

    if home_match:
        score += 20
        reasons.append("home_team_match")

    if away_match:
        score += 20
        reasons.append("away_team_match")

    if home_placeholder and away_match:
        score += 8
        reasons.append("home_placeholder_away_match")

    if away_placeholder and home_match:
        score += 8
        reasons.append("away_placeholder_home_match")

    if swapped_home_match and swapped_away_match:
        score -= 35
        reasons.append("teams_look_swapped")

    both_teams_match = home_match and away_match
    one_known_side_with_placeholder = (
        (home_placeholder and away_match)
        or (away_placeholder and home_match)
    )

    auto_safe = score >= int(auto_map_score_threshold) and (
        both_teams_match
        or (
            bool(allow_placeholder_side_auto)
            and one_known_side_with_placeholder
            and delta_minutes <= 5
        )
    )

    return {
        "api_fixture_id": int(api_fixture_id),
        "score": int(score),
        "auto_safe": bool(auto_safe),
        "reasons": reasons,
        "delta_minutes": int(delta_minutes),
        "api_phase": api_phase,
        "api_round": api_round,
        "api_kickoff_utc": api_kickoff.isoformat() if api_kickoff else None,
        "api_home": _api_team_name(item, "home"),
        "api_away": _api_team_name(item, "away"),
        "api_item": item,
    }


def _set_mapping_needs_review(
    *,
    match_id: int,
    candidate: Dict[str, Any],
) -> None:
    item = candidate["api_item"]
    note = (
        f"Mapping candidate found with score {candidate['score']} "
        f"for API fixture {candidate['api_fixture_id']}: "
        f"{candidate['api_home']} x {candidate['api_away']} "
        f"at {candidate.get('api_kickoff_utc')}. Reasons: "
        f"{', '.join(candidate.get('reasons') or [])}."
    )

    sql = """
      UPDATE worldcup_pool.matches
      SET
        api_mapping_status = 'mapping_needs_review',
        api_mapping_note = %(api_mapping_note)s,
        api_raw_snapshot = %(api_raw_snapshot)s::jsonb,
        api_last_synced_at_utc = NOW(),
        updated_at_utc = NOW()
      WHERE id = %(match_id)s
        AND api_fixture_id IS NULL
    """

    with pg_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                sql,
                {
                    "match_id": int(match_id),
                    "api_mapping_note": note,
                    "api_raw_snapshot": _jsonb(item),
                },
            )
        conn.commit()


def _apply_auto_mapping(
    *,
    match_id: int,
    candidate: Dict[str, Any],
) -> bool:
    item = candidate["api_item"]
    api_fixture_id = int(candidate["api_fixture_id"])

    note = (
        f"Auto-mapped to API fixture {api_fixture_id} "
        f"with score {candidate['score']}: "
        f"{candidate['api_home']} x {candidate['api_away']} "
        f"at {candidate.get('api_kickoff_utc')}. Reasons: "
        f"{', '.join(candidate.get('reasons') or [])}."
    )

    sql = """
      UPDATE worldcup_pool.matches AS m
      SET
        api_provider = %(api_provider)s,
        api_fixture_id = %(api_fixture_id)s,
        api_home_team_id = %(api_home_team_id)s,
        api_away_team_id = %(api_away_team_id)s,
        api_status_short = %(api_status_short)s,
        api_status_long = %(api_status_long)s,
        api_status_elapsed = %(api_status_elapsed)s,
        api_round = %(api_round)s,
        api_venue_name = %(api_venue_name)s,
        api_venue_city = %(api_venue_city)s,
        api_mapping_status = 'mapped_auto',
        api_mapping_note = %(api_mapping_note)s,
        api_raw_snapshot = %(api_raw_snapshot)s::jsonb,
        api_last_synced_at_utc = NOW(),
        updated_at_utc = NOW()
      WHERE m.id = %(match_id)s
        AND m.api_fixture_id IS NULL
        AND NOT EXISTS (
          SELECT 1
          FROM worldcup_pool.matches AS other_match
          WHERE other_match.competition_key = m.competition_key
            AND other_match.api_provider = %(api_provider)s
            AND other_match.api_fixture_id = %(api_fixture_id)s
            AND other_match.id <> m.id
        )
    """

    with pg_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                sql,
                {
                    "match_id": int(match_id),
                    "api_provider": API_PROVIDER,
                    "api_fixture_id": api_fixture_id,
                    "api_home_team_id": _api_team_id(item, "home"),
                    "api_away_team_id": _api_team_id(item, "away"),
                    "api_status_short": _status_short(item) or None,
                    "api_status_long": _status_long(item),
                    "api_status_elapsed": _status_elapsed(item),
                    "api_round": _api_round(item),
                    "api_venue_name": _api_venue_name(item),
                    "api_venue_city": _api_venue_city(item),
                    "api_mapping_note": note,
                    "api_raw_snapshot": _jsonb(item),
                },
            )
            updated = int(cur.rowcount or 0) > 0
        conn.commit()

    return updated


def worldcup_pool_fixture_mapping_sync(
    *,
    competition_key: str = COMPETITION_KEY,
    league_id: int = 1,
    season: int = 2026,
    phase: Optional[str] = "round_of_32",
    min_official_match_no: int = 73,
    max_official_match_no: int = 104,
    limit: int = 80,
    kickoff_tolerance_minutes: int = 90,
    auto_map_score_threshold: int = 90,
    allow_placeholder_side_auto: bool = True,
    dry_run: bool = True,
    max_diagnostics: int = 30,
) -> Dict[str, Any]:
    """
    Casa jogos canônicos do bolão com fixture_id da API-FOOTBALL.

    Seguro por padrão:
    - dry_run=True não altera banco;
    - só auto-mapeia quando fase/horário/times batem com score alto;
    - casos ambíguos ficam como diagnóstico ou mapping_needs_review.
    """
    matches = _load_unmapped_matches(
        competition_key=competition_key,
        phase=phase,
        min_official_match_no=min_official_match_no,
        max_official_match_no=max_official_match_no,
        limit=limit,
    )

    counters: Dict[str, Any] = {
        "candidate_internal_matches": len(matches),
        "api_fixtures_seen": 0,
        "mapping_candidates": 0,
        "mapped_auto": 0,
        "needs_review": 0,
        "no_candidate": 0,
        "dry_run": bool(dry_run),
    }

    if not matches:
        return {"ok": True, "counters": counters, "diagnostics": []}

    status_code, payload = _fetch_api_fixtures(
        league_id=league_id,
        season=season,
    )

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

    api_items = [item for item in response if isinstance(item, dict) and _fixture_id(item)]
    counters["api_fixtures_seen"] = len(api_items)

    used_api_fixture_ids = _load_existing_api_fixture_ids(competition_key=competition_key)
    diagnostics: List[Dict[str, Any]] = []

    for match in matches:
        best_candidate: Optional[Dict[str, Any]] = None

        for item in api_items:
            api_fixture_id = _fixture_id(item)
            if not api_fixture_id or int(api_fixture_id) in used_api_fixture_ids:
                continue

            candidate = _score_mapping_candidate(
                match=match,
                item=item,
                kickoff_tolerance_minutes=kickoff_tolerance_minutes,
                auto_map_score_threshold=auto_map_score_threshold,
                allow_placeholder_side_auto=allow_placeholder_side_auto,
            )

            if not candidate:
                continue

            if not best_candidate or int(candidate["score"]) > int(best_candidate["score"]):
                best_candidate = candidate

        if not best_candidate:
            counters["no_candidate"] += 1
            if len(diagnostics) < int(max_diagnostics):
                diagnostics.append(
                    {
                        "official_match_no": match["official_match_no"],
                        "match_id": match["id"],
                        "status": "no_candidate",
                    }
                )
            continue

        counters["mapping_candidates"] += 1

        diagnostic = {
            "official_match_no": match["official_match_no"],
            "match_id": match["id"],
            "internal_phase": match["phase"],
            "internal_kickoff_utc": (
                match["kickoff_utc"].isoformat()
                if isinstance(match.get("kickoff_utc"), datetime)
                else str(match.get("kickoff_utc"))
            ),
            "api_fixture_id": best_candidate["api_fixture_id"],
            "api_round": best_candidate.get("api_round"),
            "api_phase": best_candidate.get("api_phase"),
            "api_kickoff_utc": best_candidate.get("api_kickoff_utc"),
            "api_home": best_candidate.get("api_home"),
            "api_away": best_candidate.get("api_away"),
            "score": best_candidate["score"],
            "auto_safe": best_candidate["auto_safe"],
            "reasons": best_candidate["reasons"],
        }

        if best_candidate["auto_safe"]:
            if dry_run:
                counters["mapped_auto"] += 1
                diagnostic["status"] = "would_map_auto"
            else:
                updated = _apply_auto_mapping(
                    match_id=int(match["id"]),
                    candidate=best_candidate,
                )
                if updated:
                    used_api_fixture_ids.add(int(best_candidate["api_fixture_id"]))
                    counters["mapped_auto"] += 1
                    diagnostic["status"] = "mapped_auto"
                else:
                    counters["needs_review"] += 1
                    diagnostic["status"] = "mapping_conflict_or_already_mapped"
        else:
            counters["needs_review"] += 1
            diagnostic["status"] = "needs_review"
            if not dry_run:
                _set_mapping_needs_review(
                    match_id=int(match["id"]),
                    candidate=best_candidate,
                )

        if len(diagnostics) < int(max_diagnostics):
            diagnostics.append(diagnostic)

    return {
        "ok": True,
        "counters": counters,
        "diagnostics": diagnostics,
    }