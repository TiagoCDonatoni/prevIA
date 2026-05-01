from __future__ import annotations

from datetime import datetime, timedelta, timezone
import re
from typing import Any, Dict, List, Optional
import unicodedata
from zoneinfo import ZoneInfo

from src.odds.matchup_resolver import (
    _norm_name,
    _resolve_single_team_name,
    _upsert_team_alias_auto,
    _upsert_team_resolution_queue,
)

_COUNTRY_HINTS = [
    (("arabia saudita", "saudi arabia", "saudi-arabia", "ksa"), "Saudi-Arabia"),
    (("brasil", "brazil", "brasileirao", "brasileirão"), "Brazil"),
    (("inglaterra", "england", "premier league", "championship"), "England"),
    (("espanha", "spain", "la liga", "laliga"), "Spain"),
    (("italia", "itália", "italy", "serie a"), "Italy"),
    (("alemanha", "germany", "bundesliga"), "Germany"),
    (("franca", "frança", "france", "ligue 1"), "France"),
    (("portugal", "liga portugal"), "Portugal"),
    (("holanda", "netherlands", "eredivisie"), "Netherlands"),
    (("argentina", "liga profesional argentina"), "Argentina"),
    (("mexico", "méxico", "liga mx"), "Mexico"),
    (("estados unidos", "usa", "mls"), "USA"),
    (("turquia", "turkey", "super lig", "süper lig"), "Turkey"),
    (("belgica", "bélgica", "belgium"), "Belgium"),
]


def _fold_text(value: Any) -> str:
    raw = str(value or "").strip().lower()
    raw = unicodedata.normalize("NFKD", raw)
    raw = "".join(ch for ch in raw if not unicodedata.combining(ch))
    raw = re.sub(r"[^a-z0-9\s\-]", " ", raw)
    raw = re.sub(r"\s+", " ", raw)
    return raw.strip()


def _country_hint_from_raw_item(raw_item: Dict[str, Any]) -> Optional[str]:
    text = _fold_text(
        " ".join(
            [
                str(raw_item.get("league") or ""),
                str(raw_item.get("home") or ""),
                str(raw_item.get("away") or ""),
                str(raw_item.get("notes") or ""),
            ]
        )
    )

    if not text:
        return None

    for needles, country_name in _COUNTRY_HINTS:
        for needle in needles:
            if _fold_text(needle) in text:
                return country_name

    return None


def _learn_or_queue_image_team_alias(
    conn,
    *,
    sport_key: str,
    raw_name: str,
    result: Dict[str, Any],
    min_auto_alias_score: float = 0.90,
) -> None:
    normalized_name = _norm_name(raw_name)
    if not normalized_name:
        return

    resolved_team_id = result.get("resolved_team_id")
    match_score = float(result.get("match_score") or 0)

    if resolved_team_id is not None and match_score >= min_auto_alias_score:
        _upsert_team_alias_auto(
            conn,
            sport_key=sport_key,
            raw_name=raw_name,
            normalized_name=normalized_name,
            team_id=int(resolved_team_id),
            confidence=match_score,
            source="image_import_auto",
        )
        return

    if resolved_team_id is None:
        _upsert_team_resolution_queue(
            conn,
            sport_key=sport_key,
            raw_name=raw_name,
            normalized_name=normalized_name,
            payload=result.get("payload"),
        )


def _best_team_candidate_from_result(result: Dict[str, Any]) -> Dict[str, Any] | None:
    payload = result.get("payload") or {}
    candidates = payload.get("candidates") or []

    if not isinstance(candidates, list) or not candidates:
        return None

    clean = [candidate for candidate in candidates if isinstance(candidate, dict)]
    if not clean:
        return None

    clean.sort(key=lambda item: float(item.get("score") or 0), reverse=True)
    return clean[0]


def _promote_candidate_if_safe(
    conn,
    *,
    sport_key: str,
    raw_name: str,
    result: Dict[str, Any],
    country_hint: str | None,
) -> Dict[str, Any]:
    """
    Para image import, alguns nomes vêm transliterados:
    Al Akhdood -> Al Okhdood.

    Se houver country_hint e um candidato claramente acima dos demais,
    podemos promover para resolved_team_id e aprender alias.
    """
    if result.get("resolved_team_id") is not None:
        return result

    if not country_hint:
        return result

    payload = result.get("payload") or {}
    candidates = payload.get("candidates") or []

    if not isinstance(candidates, list) or not candidates:
        return result

    clean = [candidate for candidate in candidates if isinstance(candidate, dict)]
    if not clean:
        return result

    clean.sort(key=lambda item: float(item.get("score") or 0), reverse=True)

    top1 = clean[0]
    top2 = clean[1] if len(clean) > 1 else None

    top1_score = float(top1.get("score") or 0)
    top2_score = float(top2.get("score") or 0) if top2 else 0
    margin = top1_score - top2_score

    # Caso comum: score absoluto ainda não é altíssimo,
    # mas o país/liga restringiu bem o espaço e há um candidato plausível.
    safe_by_score = top1_score >= 0.84 and margin >= 0.08

    # Caso especial para transliteração árabe comum: diferença pequena de vogal/consoante.
    raw_norm = _fold_text(raw_name)
    candidate_norm = _fold_text(top1.get("name"))
    safe_by_token_overlap = (
        top1_score >= 0.80
        and raw_norm
        and candidate_norm
        and (
            raw_norm in candidate_norm
            or candidate_norm in raw_norm
            or len(set(raw_norm.split()) & set(candidate_norm.split())) >= 1
        )
    )

    if not safe_by_score and not safe_by_token_overlap:
        return result

    promoted = dict(result)
    promoted["resolved_team_id"] = int(top1["team_id"])
    promoted["match_score"] = max(top1_score, 0.90)
    promoted["source"] = "image_import_candidate_promoted"
    promoted["payload"] = {
        **payload,
        "promoted_candidate": top1,
        "promotion_reason": "country_hint_candidate_match",
    }

    _learn_or_queue_image_team_alias(
        conn,
        sport_key=sport_key,
        raw_name=raw_name,
        result=promoted,
        min_auto_alias_score=0.90,
    )

    return promoted


def _to_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _parse_kickoff_iso(raw: Any, *, timezone_name: str) -> Optional[datetime]:
    value = str(raw or "").strip()
    if not value:
        return None

    try:
        normalized = value.replace("Z", "+00:00")
        dt = datetime.fromisoformat(normalized)
    except Exception:
        return None

    if dt.tzinfo is None:
        try:
            dt = dt.replace(tzinfo=ZoneInfo(timezone_name))
        except Exception:
            dt = dt.replace(tzinfo=timezone.utc)

    return _to_utc(dt)


def _fetch_team_name_map(conn, team_ids: List[int]) -> Dict[int, str]:
    clean_ids = [int(team_id) for team_id in team_ids if team_id]
    if not clean_ids:
        return {}

    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT team_id, name
            FROM core.teams
            WHERE team_id = ANY(%(team_ids)s)
            """,
            {"team_ids": clean_ids},
        )
        rows = cur.fetchall()

    return {int(team_id): str(name) for team_id, name in rows}


def _score_fixture_row(
    *,
    row: Any,
    kickoff_utc: datetime,
    home_team_id: Optional[int],
    away_team_id: Optional[int],
) -> Dict[str, Any]:
    (
        fixture_id,
        league_id,
        season,
        fixture_kickoff_utc,
        fixture_home_team_id,
        fixture_home_name,
        fixture_away_team_id,
        fixture_away_name,
    ) = row

    fixture_kickoff = _to_utc(fixture_kickoff_utc)
    diff_hours = abs((fixture_kickoff - kickoff_utc).total_seconds()) / 3600.0
    time_score = max(0.0, 1.0 - (diff_hours / 12.0))

    orientation_score = 0.0
    orientation = "unknown"

    if home_team_id and away_team_id:
        if int(home_team_id) == int(fixture_home_team_id) and int(away_team_id) == int(fixture_away_team_id):
            orientation_score = 1.0
            orientation = "exact"
        elif int(home_team_id) == int(fixture_away_team_id) and int(away_team_id) == int(fixture_home_team_id):
            orientation_score = 0.82
            orientation = "reversed"
        elif int(home_team_id) in {int(fixture_home_team_id), int(fixture_away_team_id)} or int(away_team_id) in {
            int(fixture_home_team_id),
            int(fixture_away_team_id),
        }:
            orientation_score = 0.55
            orientation = "partial"

    total_score = (0.85 * orientation_score) + (0.15 * time_score)

    return {
        "fixture_id": int(fixture_id),
        "league_id": int(league_id) if league_id is not None else None,
        "season": int(season) if season is not None else None,
        "kickoff_utc": fixture_kickoff.isoformat().replace("+00:00", "Z"),
        "home_team_id": int(fixture_home_team_id),
        "away_team_id": int(fixture_away_team_id),
        "home_name": str(fixture_home_name),
        "away_name": str(fixture_away_name),
        "confidence": round(float(total_score), 4),
        "orientation": orientation,
        "scores": {
            "orientation": round(float(orientation_score), 4),
            "time": round(float(time_score), 4),
            "total": round(float(total_score), 4),
        },
    }


def _find_fixture_candidates(
    conn,
    *,
    kickoff_utc: Optional[datetime],
    home_team_id: Optional[int],
    away_team_id: Optional[int],
) -> List[Dict[str, Any]]:
    if kickoff_utc is None:
        return []

    start = kickoff_utc - timedelta(hours=12)
    end = kickoff_utc + timedelta(hours=12)

    params: Dict[str, Any] = {
        "start": start,
        "end": end,
        "home_team_id": int(home_team_id) if home_team_id is not None else None,
        "away_team_id": int(away_team_id) if away_team_id is not None else None,
    }

    team_filter = ""
    if home_team_id is not None or away_team_id is not None:
        team_filter = """
          AND (
            f.home_team_id IN (%(home_team_id)s, %(away_team_id)s)
            OR f.away_team_id IN (%(home_team_id)s, %(away_team_id)s)
          )
        """

    with conn.cursor() as cur:
        cur.execute(
            f"""
            SELECT
              f.fixture_id,
              f.league_id,
              f.season,
              f.kickoff_utc,
              f.home_team_id,
              ht.name AS home_name,
              f.away_team_id,
              at.name AS away_name
            FROM core.fixtures f
            JOIN core.teams ht ON ht.team_id = f.home_team_id
            JOIN core.teams at ON at.team_id = f.away_team_id
            WHERE f.kickoff_utc >= %(start)s
              AND f.kickoff_utc <= %(end)s
              {team_filter}
            ORDER BY f.kickoff_utc ASC
            LIMIT 40
            """,
            params,
        )
        rows = cur.fetchall()

    candidates = [
        _score_fixture_row(
            row=row,
            kickoff_utc=kickoff_utc,
            home_team_id=home_team_id,
            away_team_id=away_team_id,
        )
        for row in rows
    ]

    candidates.sort(key=lambda item: float(item["confidence"]), reverse=True)
    return candidates[:5]


def resolve_image_import_item(
    conn,
    *,
    raw_item: Dict[str, Any],
    normalized_result: Dict[str, Any],
    timezone_name: str,
    sport_key: str = "soccer",
) -> Dict[str, Any]:
    home_raw = str(raw_item.get("home") or "").strip()
    away_raw = str(raw_item.get("away") or "").strip()

    if not home_raw or not away_raw:
        return {
            "status": "UNREADABLE",
            "resolved": {},
            "candidates": [],
            "match_confidence": 0,
            "message": "home/away not readable",
        }

    country_hint = _country_hint_from_raw_item(raw_item)

    # Em importação por imagem, nomes vêm com tradução, abreviação,
    # sufixos e transliteração. Com pista de país/liga, podemos ser
    # um pouco menos conservadores sem virar chute aberto.
    image_score_threshold = 0.90 if country_hint else 0.92
    image_margin_threshold = 0.04 if country_hint else 0.06

    home_res = _resolve_single_team_name(
        conn,
        sport_key=sport_key,
        raw_name=home_raw,
        side="home",
        event_id=None,
        country_hint=country_hint,
        auto_resolve_score_threshold=image_score_threshold,
        auto_resolve_margin_threshold=image_margin_threshold,
    )
    away_res = _resolve_single_team_name(
        conn,
        sport_key=sport_key,
        raw_name=away_raw,
        side="away",
        event_id=None,
        country_hint=country_hint,
        auto_resolve_score_threshold=image_score_threshold,
        auto_resolve_margin_threshold=image_margin_threshold,
    )

    home_res = _promote_candidate_if_safe(
        conn,
        sport_key=sport_key,
        raw_name=home_raw,
        result=home_res,
        country_hint=country_hint,
    )
    away_res = _promote_candidate_if_safe(
        conn,
        sport_key=sport_key,
        raw_name=away_raw,
        result=away_res,
        country_hint=country_hint,
    )

    _learn_or_queue_image_team_alias(
        conn,
        sport_key=sport_key,
        raw_name=home_raw,
        result=home_res,
    )
    _learn_or_queue_image_team_alias(
        conn,
        sport_key=sport_key,
        raw_name=away_raw,
        result=away_res,
    )

    home_team_id = home_res.get("resolved_team_id")
    away_team_id = away_res.get("resolved_team_id")

    home_score = float(home_res.get("match_score") or 0)
    away_score = float(away_res.get("match_score") or 0)
    team_confidence = min(home_score, away_score)

    team_names = _fetch_team_name_map(
        conn,
        [
            int(home_team_id) if home_team_id is not None else 0,
            int(away_team_id) if away_team_id is not None else 0,
        ],
    )

    kickoff_utc = _parse_kickoff_iso(
        raw_item.get("kickoff_iso_local"),
        timezone_name=timezone_name,
    )

    fixture_candidates = _find_fixture_candidates(
        conn,
        kickoff_utc=kickoff_utc,
        home_team_id=int(home_team_id) if home_team_id is not None else None,
        away_team_id=int(away_team_id) if away_team_id is not None else None,
    )

    best_fixture = fixture_candidates[0] if fixture_candidates else None
    best_fixture_confidence = float(best_fixture.get("confidence") or 0) if best_fixture else 0.0

    resolved: Dict[str, Any] = {
        "fixture_id": None,
        "home_team_id": int(home_team_id) if home_team_id is not None else None,
        "away_team_id": int(away_team_id) if away_team_id is not None else None,
        "home_name": team_names.get(int(home_team_id)) if home_team_id is not None else None,
        "away_name": team_names.get(int(away_team_id)) if away_team_id is not None else None,
        "kickoff_utc": None,
        "confidence": round(float(team_confidence), 4),
        "league_id": None,
        "season": None,
        "country_hint": country_hint,
    }

    if best_fixture and best_fixture_confidence >= 0.90 and best_fixture.get("orientation") == "exact":
        resolved.update(
            {
                "fixture_id": int(best_fixture["fixture_id"]),
                "home_team_id": int(best_fixture["home_team_id"]),
                "away_team_id": int(best_fixture["away_team_id"]),
                "home_name": str(best_fixture["home_name"]),
                "away_name": str(best_fixture["away_name"]),
                "kickoff_utc": best_fixture["kickoff_utc"],
                "confidence": round(float(best_fixture_confidence), 4),
                "league_id": best_fixture.get("league_id"),
                "season": best_fixture.get("season"),
            }
        )

        return {
            "status": "READY",
            "resolved": resolved,
            "candidates": fixture_candidates,
            "match_confidence": float(resolved["confidence"]),
            "message": None,
        }

    # Para Montar aposta, fixture específico ajuda, mas não é obrigatório.
    # Se ambos os times foram resolvidos com boa confiança, já podemos gerar análise.
    # Em image import, country_hint/league_hint reduz bastante o risco de falso positivo.
    ready_threshold = 0.90 if country_hint else 0.92

    if home_team_id is not None and away_team_id is not None and team_confidence >= ready_threshold:
        return {
            "status": "READY",
            "resolved": resolved,
            "candidates": fixture_candidates,
            "match_confidence": round(float(team_confidence), 4),
            "message": "teams resolved without fixture",
        }

    if home_team_id is not None and away_team_id is not None and team_confidence >= 0.75:
        return {
            "status": "NEEDS_CONFIRMATION",
            "resolved": resolved,
            "candidates": fixture_candidates,
            "match_confidence": round(float(team_confidence), 4),
            "message": "team match needs confirmation",
        }

    candidates = []

    for side, result in [("home", home_res), ("away", away_res)]:
        payload = result.get("payload") or {}
        for candidate in payload.get("candidates") or []:
            candidates.append(
                {
                    "side": side,
                    "team_id": candidate.get("team_id"),
                    "name": candidate.get("name"),
                    "country_name": candidate.get("country_name"),
                    "confidence": candidate.get("score"),
                    "reason": "team_name_candidate",
                }
            )

    return {
        "status": "LOW_CONFIDENCE",
        "resolved": resolved,
        "candidates": candidates[:5],
        "match_confidence": round(float(team_confidence), 4),
        "message": "could not resolve teams with enough confidence",
    }

