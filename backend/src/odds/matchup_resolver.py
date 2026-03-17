# portable/backend/src/odds/matchup_resolver.py
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import re
import unicodedata
from typing import Any, Dict, List, Optional, Tuple

from src.db.pg import pg_tx


_STOPWORDS = {
    "fc", "cf", "sc", "ac", "afc", "cfc", "the", "club", "de", "da", "do", "and", "&"
}


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _to_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _norm_name(s: str) -> str:
    s = (s or "").strip().lower()
    s = unicodedata.normalize("NFKD", s)
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    s = re.sub(r"[^a-z0-9\s]", " ", s)
    parts = [p for p in s.split() if p and p not in _STOPWORDS]
    return " ".join(parts).strip()


def _token_set(s: str) -> set[str]:
    n = _norm_name(s)
    return set([t for t in n.split() if t])


def _jaccard(a: set[str], b: set[str]) -> float:
    if not a or not b:
        return 0.0
    inter = len(a.intersection(b))
    union = len(a.union(b))
    return float(inter) / float(union) if union else 0.0


def _name_similarity(raw_a: str, raw_b: str) -> float:
    """
    Similaridade robusta e barata (MVP):
    - 1.0: normalized igual
    - 0.93: substring (contém)
    - senão: jaccard tokens (capado)
    """
    a = _norm_name(raw_a)
    b = _norm_name(raw_b)
    if not a or not b:
        return 0.0
    if a == b:
        return 1.0
    if a in b or b in a:
        return 0.93

    ja = _jaccard(set(a.split()), set(b.split()))
    # cap para não explodir com ruído
    return max(0.0, min(0.90, ja))


@dataclass(frozen=True)
class Candidate:
    fixture_id: int
    kickoff_utc: str
    home_team_id: int
    away_team_id: int
    home_team_name: str
    away_team_name: str
    score_home: float
    score_away: float
    score_time: float
    score_total: float


@dataclass(frozen=True)
class ResolveResult:
    status: str  # EXACT | PROBABLE | AMBIGUOUS | NOT_FOUND
    confidence: float  # 0..1
    resolved_fixture_id: Optional[int]
    resolved_home_team_id: Optional[int]
    resolved_away_team_id: Optional[int]
    candidates: List[Dict[str, Any]]
    reason: Optional[str]


def _status_from_scores(best: Optional[Candidate], second: Optional[Candidate]) -> Tuple[str, float, Optional[str]]:
    if not best:
        return "NOT_FOUND", 0.0, "no_candidates_in_time_window"

    top = float(best.score_total)
    gap = float(top - (second.score_total if second else 0.0))

    # Regras do contrato
    if top >= 0.95 and gap >= 0.10:
        return "EXACT", min(1.0, top), None
    if top >= 0.90 and gap >= 0.05:
        return "PROBABLE", min(1.0, top), "low_gap_or_fuzzy_name_match"
    if top >= 0.90 and gap < 0.05:
        return "AMBIGUOUS", min(1.0, top), "multiple_close_candidates"
    return "NOT_FOUND", min(1.0, top), "low_similarity"


def _match_confidence_legacy(status: str) -> str:
    # Compat: manter o Admin funcionando sem refatorar
    if status == "EXACT":
        return "EXACT"
    if status == "PROBABLE":
        return "ILIKE"
    return "NONE"

AUTO_RESOLVE_SCORE_THRESHOLD = 0.95
AUTO_RESOLVE_MARGIN_THRESHOLD = 0.08


def _sport_key_country_hint(sport_key: str) -> Optional[str]:
    sk = (sport_key or "").strip().lower()
    if "soccer_epl" in sk:
        return "England"
    if "soccer_brazil" in sk:
        return "Brazil"
    return None


def _load_team_alias_index(conn, *, sport_key: str) -> Dict[str, int]:
    sql = """
      SELECT normalized_name, team_id
      FROM odds.team_name_aliases
      WHERE active = true
        AND (sport_key = %(sport_key)s OR sport_key IS NULL)
      ORDER BY
        CASE WHEN sport_key = %(sport_key)s THEN 0 ELSE 1 END,
        alias_id ASC
    """
    idx: Dict[str, int] = {}
    with conn.cursor() as cur:
        cur.execute(sql, {"sport_key": str(sport_key)})
        for normalized_name, team_id in cur.fetchall():
            key = _norm_name(str(normalized_name))
            if key and key not in idx:
                idx[key] = int(team_id)
    return idx


def _load_team_candidates(conn, *, sport_key: str) -> List[Dict[str, Any]]:
    country_hint = _sport_key_country_hint(sport_key)

    sql = """
      SELECT team_id, name, country_name
      FROM core.teams
      WHERE name IS NOT NULL
    """
    params: Dict[str, Any] = {}

    if country_hint is not None:
        sql += " AND country_name = %(country)s"
        params["country"] = str(country_hint)

    sql += " ORDER BY name ASC"

    with conn.cursor() as cur:
        cur.execute(sql, params)
        rows = cur.fetchall()

    out: List[Dict[str, Any]] = []
    for team_id, name, country_name in rows:
        out.append(
            {
                "team_id": int(team_id),
                "name": str(name),
                "country_name": (str(country_name) if country_name is not None else None),
                "norm_name": _norm_name(str(name)),
                "tokens": _token_set(str(name)),
            }
        )
    return out
    
def _score_team_name_against_candidate(raw_name: str, cand: Dict[str, Any]) -> float:
    raw_norm = _norm_name(raw_name)
    cand_norm = cand["norm_name"]

    if not raw_norm or not cand_norm:
        return 0.0

    if raw_norm == cand_norm:
        return 1.0

    sim = _name_similarity(raw_name, cand["name"])

    raw_tokens = set(raw_norm.split())
    cand_tokens = cand["tokens"]

    overlap = _jaccard(raw_tokens, cand_tokens)

    # bônus leve se todos os tokens do candidato aparecem no nome bruto
    if cand_tokens and cand_tokens.issubset(raw_tokens):
        sim = max(sim, 0.94)

    # score final conservador
    score = max(sim, min(0.92, overlap))
    return float(max(0.0, min(1.0, score)))


def _resolve_single_team_name(
    conn,
    *,
    sport_key: str,
    raw_name: str,
    side: str,
    event_id: Optional[str] = None,
) -> Dict[str, Any]:
    normalized_name = _norm_name(raw_name)

    if not normalized_name:
        return {
            "resolved_team_id": None,
            "match_status": "unresolved",
            "match_method": "empty_name",
            "match_score": 0.0,
            "second_best_score": None,
            "decision_reason": "empty_normalized_name",
            "payload": None,
        }

    alias_idx = _load_team_alias_index(conn, sport_key=sport_key)
    alias_team_id = alias_idx.get(normalized_name)
    if alias_team_id is not None:
        return {
            "resolved_team_id": int(alias_team_id),
            "match_status": "auto_resolved",
            "match_method": "alias",
            "match_score": 0.99,
            "second_best_score": None,
            "decision_reason": "matched_existing_alias",
            "payload": {"alias_hit": True},
        }

    candidates = _load_team_candidates(conn, sport_key=sport_key)
    ranked: List[Dict[str, Any]] = []

    for cand in candidates:
        score = _score_team_name_against_candidate(raw_name, cand)
        if score <= 0:
            continue
        ranked.append(
            {
                "team_id": cand["team_id"],
                "name": cand["name"],
                "country_name": cand["country_name"],
                "score": score,
            }
        )

    ranked.sort(key=lambda x: (-x["score"], x["name"]))

    top1 = ranked[0] if ranked else None
    top2 = ranked[1] if len(ranked) > 1 else None

    if not top1:
        return {
            "resolved_team_id": None,
            "match_status": "pending_review",
            "match_method": "no_candidate",
            "match_score": 0.0,
            "second_best_score": None,
            "decision_reason": "no_candidate_found",
            "payload": {"candidates": []},
        }

    top1_score = float(top1["score"])
    top2_score = float(top2["score"]) if top2 else None
    margin = top1_score - (top2_score or 0.0)

    payload = {
        "candidates": ranked[:5],
        "margin": margin,
        "side": side,
    }

    if top1_score >= AUTO_RESOLVE_SCORE_THRESHOLD and margin >= AUTO_RESOLVE_MARGIN_THRESHOLD:
        return {
            "resolved_team_id": int(top1["team_id"]),
            "match_status": "auto_resolved",
            "match_method": "score",
            "match_score": top1_score,
            "second_best_score": top2_score,
            "decision_reason": "high_score_with_margin",
            "payload": payload,
        }

    return {
        "resolved_team_id": None,
        "match_status": "pending_review",
        "match_method": "score_ambiguous",
        "match_score": top1_score,
        "second_best_score": top2_score,
        "decision_reason": "ambiguous_or_low_margin",
        "payload": payload,
    }

def _resolve_event_team_ids_inline(
    conn,
    *,
    event_id: str,
    sport_key: str,
    home_name: Optional[str],
    away_name: Optional[str],
) -> Dict[str, Any]:
    """
    Resolve team ids para um único odds_event usando a lógica nova:
    - alias aprovado
    - auto-approve por score
    - queue para revisão humana quando ambíguo
    - log estruturado
    """
    home_raw = str(home_name or "")
    away_raw = str(away_name or "")

    home_norm = _norm_name(home_raw)
    away_norm = _norm_name(away_raw)

    home_res = _resolve_single_team_name(
        conn,
        raw_name=home_raw,
        sport_key=sport_key,
        side="home",
        event_id=event_id,
    )
    away_res = _resolve_single_team_name(
        conn,
        raw_name=away_raw,
        sport_key=sport_key,
        side="away",
        event_id=event_id,
    )

    home_team_id = home_res.get("resolved_team_id")
    away_team_id = away_res.get("resolved_team_id")

    # auto-alias quando houver match forte
    if home_team_id is not None:
        _upsert_team_alias_auto(
            conn,
            sport_key=sport_key,
            raw_name=home_raw,
            normalized_name=home_norm,
            team_id=int(home_team_id),
            confidence=float(home_res.get("match_score") or 0.0),
        )

    if away_team_id is not None:
        _upsert_team_alias_auto(
            conn,
            sport_key=sport_key,
            raw_name=away_raw,
            normalized_name=away_norm,
            team_id=int(away_team_id),
            confidence=float(away_res.get("match_score") or 0.0),
        )

    # queue humana quando necessário
    if home_team_id is None:
        _upsert_team_resolution_queue(
            conn,
            sport_key=sport_key,
            raw_name=home_raw,
            normalized_name=home_norm,
            payload=home_res.get("payload"),
        )

    if away_team_id is None:
        _upsert_team_resolution_queue(
            conn,
            sport_key=sport_key,
            raw_name=away_raw,
            normalized_name=away_norm,
            payload=away_res.get("payload"),
        )

    # log
    _insert_team_resolution_log(
        conn,
        event_id=event_id,
        sport_key=sport_key,
        side="home",
        raw_name=home_raw,
        normalized_name=home_norm,
        resolved_team_id=(int(home_team_id) if home_team_id is not None else None),
        match_status=str(home_res.get("match_status") or "unresolved"),
        match_method=home_res.get("match_method"),
        match_score=home_res.get("match_score"),
        second_best_score=home_res.get("second_best_score"),
        decision_reason=home_res.get("decision_reason"),
        payload=home_res.get("payload"),
    )

    _insert_team_resolution_log(
        conn,
        event_id=event_id,
        sport_key=sport_key,
        side="away",
        raw_name=away_raw,
        normalized_name=away_norm,
        resolved_team_id=(int(away_team_id) if away_team_id is not None else None),
        match_status=str(away_res.get("match_status") or "unresolved"),
        match_method=away_res.get("match_method"),
        match_score=away_res.get("match_score"),
        second_best_score=away_res.get("second_best_score"),
        decision_reason=away_res.get("decision_reason"),
        payload=away_res.get("payload"),
    )

    return {
        "home_team_id": (int(home_team_id) if home_team_id is not None else None),
        "away_team_id": (int(away_team_id) if away_team_id is not None else None),
        "home_status": home_res.get("match_status"),
        "away_status": away_res.get("match_status"),
    }

def _upsert_team_resolution_queue(
    conn,
    *,
    sport_key: str,
    raw_name: str,
    normalized_name: str,
    payload: Optional[Dict[str, Any]],
) -> None:
    candidates = (payload or {}).get("candidates") or []
    c1 = candidates[0] if len(candidates) > 0 else {}
    c2 = candidates[1] if len(candidates) > 1 else {}

    sql = """
      INSERT INTO odds.team_name_resolution_queue (
        sport_key,
        raw_name,
        normalized_name,
        candidate_1_team_id,
        candidate_1_score,
        candidate_2_team_id,
        candidate_2_score,
        candidate_json,
        status,
        created_at_utc,
        updated_at_utc
      )
      VALUES (
        %(sport_key)s,
        %(raw_name)s,
        %(normalized_name)s,
        %(candidate_1_team_id)s,
        %(candidate_1_score)s,
        %(candidate_2_team_id)s,
        %(candidate_2_score)s,
        %(candidate_json)s::jsonb,
        'pending',
        NOW(),
        NOW()
      )
      ON CONFLICT (sport_key, normalized_name, status)
      DO UPDATE SET
        candidate_1_team_id = EXCLUDED.candidate_1_team_id,
        candidate_1_score = EXCLUDED.candidate_1_score,
        candidate_2_team_id = EXCLUDED.candidate_2_team_id,
        candidate_2_score = EXCLUDED.candidate_2_score,
        candidate_json = EXCLUDED.candidate_json,
        updated_at_utc = NOW()
    """
    import json

    with conn.cursor() as cur:
        cur.execute(
            sql,
            {
                "sport_key": str(sport_key),
                "raw_name": str(raw_name),
                "normalized_name": str(normalized_name),
                "candidate_1_team_id": int(c1["team_id"]) if c1.get("team_id") is not None else None,
                "candidate_1_score": float(c1["score"]) if c1.get("score") is not None else None,
                "candidate_2_team_id": int(c2["team_id"]) if c2.get("team_id") is not None else None,
                "candidate_2_score": float(c2["score"]) if c2.get("score") is not None else None,
                "candidate_json": json.dumps(payload or {}),
            },
        )


def _insert_team_resolution_log(
    conn,
    *,
    event_id: Optional[str],
    sport_key: str,
    side: str,
    raw_name: str,
    normalized_name: str,
    resolved_team_id: Optional[int],
    match_status: str,
    match_method: Optional[str],
    match_score: Optional[float],
    second_best_score: Optional[float],
    decision_reason: Optional[str],
    payload: Optional[Dict[str, Any]],
) -> None:
    import json

    sql = """
      INSERT INTO odds.team_name_resolution_log (
        event_id,
        sport_key,
        side,
        raw_name,
        normalized_name,
        resolved_team_id,
        match_status,
        match_method,
        match_score,
        second_best_score,
        decision_reason,
        payload,
        created_at_utc
      )
      VALUES (
        %(event_id)s,
        %(sport_key)s,
        %(side)s,
        %(raw_name)s,
        %(normalized_name)s,
        %(resolved_team_id)s,
        %(match_status)s,
        %(match_method)s,
        %(match_score)s,
        %(second_best_score)s,
        %(decision_reason)s,
        %(payload)s::jsonb,
        NOW()
      )
    """
    with conn.cursor() as cur:
        cur.execute(
            sql,
            {
                "event_id": (str(event_id) if event_id is not None else None),
                "sport_key": str(sport_key),
                "side": str(side),
                "raw_name": str(raw_name),
                "normalized_name": str(normalized_name),
                "resolved_team_id": int(resolved_team_id) if resolved_team_id is not None else None,
                "match_status": str(match_status),
                "match_method": (str(match_method) if match_method is not None else None),
                "match_score": float(match_score) if match_score is not None else None,
                "second_best_score": float(second_best_score) if second_best_score is not None else None,
                "decision_reason": (str(decision_reason) if decision_reason is not None else None),
                "payload": json.dumps(payload or {}),
            },
        )

def _upsert_team_alias_auto(
    conn,
    *,
    sport_key: str,
    raw_name: str,
    normalized_name: str,
    team_id: int,
    confidence: float,
) -> None:
    sql_exists = """
      SELECT 1
      FROM odds.team_name_aliases
      WHERE active = true
        AND normalized_name = %(normalized_name)s
        AND (sport_key = %(sport_key)s OR sport_key IS NULL)
      LIMIT 1
    """
    sql_ins = """
      INSERT INTO odds.team_name_aliases (
        sport_key,
        raw_name,
        normalized_name,
        team_id,
        source,
        confidence,
        active,
        created_at_utc,
        updated_at_utc
      )
      VALUES (
        %(sport_key)s,
        %(raw_name)s,
        %(normalized_name)s,
        %(team_id)s,
        'auto_approved',
        %(confidence)s,
        true,
        NOW(),
        NOW()
      )
    """
    with conn.cursor() as cur:
        cur.execute(
            sql_exists,
            {
                "sport_key": str(sport_key),
                "normalized_name": str(normalized_name),
            },
        )
        row = cur.fetchone()
        if row:
            return

        cur.execute(
            sql_ins,
            {
                "sport_key": str(sport_key),
                "raw_name": str(raw_name),
                "normalized_name": str(normalized_name),
                "team_id": int(team_id),
                "confidence": float(confidence),
            },
        )
        
def resolve_odds_event_team_ids(conn, *, sport_key: str, limit: int = 500) -> Dict[str, int]:
    sql_sel = """
      SELECT event_id, home_name, away_name
      FROM odds.odds_events
      WHERE sport_key = %(sport_key)s
        AND (
          resolved_home_team_id IS NULL
          OR resolved_away_team_id IS NULL
        )
      ORDER BY commence_time_utc ASC NULLS LAST
      LIMIT %(limit)s
    """

    sql_upd = """
      UPDATE odds.odds_events
      SET
        resolved_home_team_id = COALESCE(%(home_team_id)s, resolved_home_team_id),
        resolved_away_team_id = COALESCE(%(away_team_id)s, resolved_away_team_id)
      WHERE event_id = %(event_id)s
    """

    counters: Dict[str, int] = {
        "events_scanned": 0,
        "home_resolved": 0,
        "away_resolved": 0,
        "fully_resolved": 0,
        "queued_for_review": 0,
    }

    with conn.cursor() as cur:
        cur.execute(sql_sel, {"sport_key": str(sport_key), "limit": int(limit)})
        rows = cur.fetchall()

    counters["events_scanned"] = len(rows)

    for event_id, home_name, away_name in rows:
        home_res = _resolve_single_team_name(
            conn,
            sport_key=sport_key,
            raw_name=str(home_name or ""),
            side="home",
            event_id=str(event_id),
        )
        away_res = _resolve_single_team_name(
            conn,
            sport_key=sport_key,
            raw_name=str(away_name or ""),
            side="away",
            event_id=str(event_id),
        )

        home_team_id = home_res["resolved_team_id"]
        away_team_id = away_res["resolved_team_id"]

        if home_team_id is not None:
            counters["home_resolved"] += 1
            _upsert_team_alias_auto(
                conn,
                sport_key=sport_key,
                raw_name=str(home_name or ""),
                normalized_name=_norm_name(str(home_name or "")),
                team_id=int(home_team_id),
                confidence=float(home_res["match_score"] or 0.0),
            )
        else:
            _upsert_team_resolution_queue(
                conn,
                sport_key=sport_key,
                raw_name=str(home_name or ""),
                normalized_name=_norm_name(str(home_name or "")),
                payload=home_res.get("payload"),
            )
            counters["queued_for_review"] += 1

        if away_team_id is not None:
            counters["away_resolved"] += 1
            _upsert_team_alias_auto(
                conn,
                sport_key=sport_key,
                raw_name=str(away_name or ""),
                normalized_name=_norm_name(str(away_name or "")),
                team_id=int(away_team_id),
                confidence=float(away_res["match_score"] or 0.0),
            )
        else:
            _upsert_team_resolution_queue(
                conn,
                sport_key=sport_key,
                raw_name=str(away_name or ""),
                normalized_name=_norm_name(str(away_name or "")),
                payload=away_res.get("payload"),
            )
            counters["queued_for_review"] += 1

        _insert_team_resolution_log(
            conn,
            event_id=str(event_id),
            sport_key=sport_key,
            side="home",
            raw_name=str(home_name or ""),
            normalized_name=_norm_name(str(home_name or "")),
            resolved_team_id=home_team_id,
            match_status=str(home_res["match_status"]),
            match_method=home_res.get("match_method"),
            match_score=home_res.get("match_score"),
            second_best_score=home_res.get("second_best_score"),
            decision_reason=home_res.get("decision_reason"),
            payload=home_res.get("payload"),
        )
        _insert_team_resolution_log(
            conn,
            event_id=str(event_id),
            sport_key=sport_key,
            side="away",
            raw_name=str(away_name or ""),
            normalized_name=_norm_name(str(away_name or "")),
            resolved_team_id=away_team_id,
            match_status=str(away_res["match_status"]),
            match_method=away_res.get("match_method"),
            match_score=away_res.get("match_score"),
            second_best_score=away_res.get("second_best_score"),
            decision_reason=away_res.get("decision_reason"),
            payload=away_res.get("payload"),
        )

        with conn.cursor() as cur:
            cur.execute(
                sql_upd,
                {
                    "event_id": str(event_id),
                    "home_team_id": int(home_team_id) if home_team_id is not None else None,
                    "away_team_id": int(away_team_id) if away_team_id is not None else None,
                },
            )

        if home_team_id is not None and away_team_id is not None:
            counters["fully_resolved"] += 1

    return counters

def resolve_odds_event(
    conn,
    *,
    event_id: str,
    assume_league_id: int,
    assume_season: int,
    tol_hours: int = 6,
    max_candidates: int = 5,
    persist_resolution: bool = True,
    kickoff_utc_iso: Optional[str] = None,  # compat
    home_name: Optional[str] = None,        # compat (ignorado; DB é fonte de verdade)
    away_name: Optional[str] = None,        # compat
    **_ignored: Any,                        # compat: evita quebrar com kwargs novos
) -> ResolveResult:
    """
    Resolve odds.odds_events(event_id) -> core.fixtures candidate.
    DB-only: lê odds.* e core.*; não chama provider.

    Requisitos:
      - odds.odds_events: event_id, commence_time_utc, home_name, away_name
      - core.fixtures: fixture_id, league_id, season, kickoff_utc, home_team_id, away_team_id
      - core.teams: team_id, name
    """
    if not event_id:
        raise ValueError("event_id is required")

    # 1) carregar evento
    sql_event = """
      SELECT event_id, sport_key, commence_time_utc, home_name, away_name,
             resolved_home_team_id, resolved_away_team_id, resolved_fixture_id,
             match_status, match_score
      FROM odds.odds_events
      WHERE event_id = %(event_id)s
      LIMIT 1
    """
    with conn.cursor() as cur:
        cur.execute(sql_event, {"event_id": event_id})
        row = cur.fetchone()

    if not row:
        return ResolveResult(
            status="NOT_FOUND",
            confidence=0.0,
            resolved_fixture_id=None,
            resolved_home_team_id=None,
            resolved_away_team_id=None,
            candidates=[],
            reason="odds_event_not_found",
        )

    # NOTE: precisamos do sport_key para fallback/diagnóstico
    _, sport_key, commence_time_utc, home_name, away_name, rh, ra, rf, match_status, match_score = row

    # Se team ids ainda não foram resolvidos, tenta resolver inline
    # usando a lógica nova (alias aprovado / auto / queue humana).
    if rh is None or ra is None:
        inline_ids = _resolve_event_team_ids_inline(
            conn,
            event_id=str(event_id),
            sport_key=str(sport_key),
            home_name=home_name,
            away_name=away_name,
        )

        if rh is None and inline_ids.get("home_team_id") is not None:
            rh = int(inline_ids["home_team_id"])

        if ra is None and inline_ids.get("away_team_id") is not None:
            ra = int(inline_ids["away_team_id"])

    if rh is not None or ra is not None:
        with conn.cursor() as cur:
            cur.execute(
                """
                update odds.odds_events
                   set resolved_home_team_id = coalesce(%(rh)s, resolved_home_team_id),
                       resolved_away_team_id = coalesce(%(ra)s, resolved_away_team_id),
                       updated_at_utc = now()
                 where event_id = %(event_id)s
                """,
                {
                    "event_id": str(event_id),
                    "rh": int(rh) if rh is not None else None,
                    "ra": int(ra) if ra is not None else None,
                },
            )

    if commence_time_utc is None:
        return ResolveResult(
            status="NOT_FOUND",
            confidence=0.0,
            resolved_fixture_id=None,
            resolved_home_team_id=(int(rh) if rh is not None else None),
            resolved_away_team_id=(int(ra) if ra is not None else None),
            candidates=[],
            reason="event_missing_commence_time_utc",
        )

    kickoff = _to_utc(commence_time_utc)
    start = kickoff - timedelta(hours=tol_hours)
    end = kickoff + timedelta(hours=tol_hours)

    # 2) buscar fixtures candidatos (liga/season + janela) com fallbacks
    sql_cand_base = """
      SELECT
        f.fixture_id,
        f.kickoff_utc,
        f.home_team_id,
        ht.name as home_team_name,
        f.away_team_id,
        at.name as away_team_name
      FROM core.fixtures f
      JOIN core.teams ht ON ht.team_id = f.home_team_id
      JOIN core.teams at ON at.team_id = f.away_team_id
      WHERE {filters}
      ORDER BY f.kickoff_utc ASC
      LIMIT {limit}
    """

    def _fetch_rows(*, league_id: Optional[int], season: Optional[int], limit: int) -> List[Any]:
        filters = [
            "f.kickoff_utc >= %(start)s",
            "f.kickoff_utc <= %(end)s",
        ]
        params: Dict[str, Any] = {"start": start, "end": end}

        if league_id is not None:
            filters.append("f.league_id = %(league_id)s")
            params["league_id"] = int(league_id)

        if season is not None:
            filters.append("f.season = %(season)s")
            params["season"] = int(season)

        sql = sql_cand_base.format(filters=" AND ".join(filters), limit=int(limit))
        with conn.cursor() as cur:
            cur.execute(sql, params)
            return cur.fetchall()

    league_id = int(assume_league_id) if assume_league_id is not None else 0
    season = int(assume_season) if assume_season is not None else 0

    rows: List[Any] = []

    # tentativa 1: league + season (strict)
    if league_id > 0 and season > 0:
        rows = _fetch_rows(league_id=league_id, season=season, limit=200)

    # tentativa 2: league + season +/- 1 (muito comum quando season no core diverge do assume)
    if not rows and league_id > 0 and season > 0:
        rows = _fetch_rows(league_id=league_id, season=season + 1, limit=300) or _fetch_rows(
            league_id=league_id, season=season - 1, limit=300
        )

    # tentativa 3: league-only (sem season)
    if not rows and league_id > 0:
        rows = _fetch_rows(league_id=league_id, season=None, limit=500)

    # tentativa 4 (último recurso): janela-only (sem league e sem season)
    if not rows:
        rows = _fetch_rows(league_id=None, season=None, limit=800)

    candidates: List[Candidate] = []
    for fixture_id, kickoff_utc_db, home_team_id, home_team_name, away_team_id, away_team_name in rows:
        kdb = _to_utc(kickoff_utc_db)
        diff_h = abs((kdb - kickoff).total_seconds()) / 3600.0
        score_time = max(0.0, 1.0 - (diff_h / float(max(1, tol_hours))))

        s_home_name = _name_similarity(home_name, home_team_name)
        s_away_name = _name_similarity(away_name, away_team_name)

        # fallback forte quando já existe team_id resolvido no odds_event
        s_home_id = 1.0 if (rh is not None and int(rh) == int(home_team_id)) else 0.0
        s_away_id = 1.0 if (ra is not None and int(ra) == int(away_team_id)) else 0.0

        # usa o melhor sinal por lado:
        # - nome continua valendo
        # - team_id resolvido vira evidência forte
        s_home = max(float(s_home_name), float(s_home_id))
        s_away = max(float(s_away_name), float(s_away_id))

        # peso:
        # nomes/ids dominam; tempo só desempata
        score_total = (0.475 * s_home) + (0.475 * s_away) + (0.05 * score_time)

        candidates.append(
            Candidate(
                fixture_id=int(fixture_id),
                kickoff_utc=kdb.isoformat().replace("+00:00", "Z"),
                home_team_id=int(home_team_id),
                away_team_id=int(away_team_id),
                home_team_name=str(home_team_name),
                away_team_name=str(away_team_name),
                score_home=float(s_home),
                score_away=float(s_away),
                score_time=float(score_time),
                score_total=float(score_total),
            )
        )

    # 3) ordenar e decidir
    candidates.sort(key=lambda c: (c.score_total, c.score_time), reverse=True)
    best = candidates[0] if candidates else None
    second = candidates[1] if len(candidates) > 1 else None

    status, confidence, reason = _status_from_scores(best, second)

    # Regra correta:
    # - fixture_id só existe quando o matching do evento encontrou um candidato confiável
    # - team_ids já resolvidos por alias/nome NÃO devem ser apagados quando fixture falha

    resolved_fixture_id = best.fixture_id if (best and status in {"EXACT", "PROBABLE"}) else None

    if best and status in {"EXACT", "PROBABLE"}:
        resolved_home_team_id = int(best.home_team_id) if best.home_team_id is not None else rh
        resolved_away_team_id = int(best.away_team_id) if best.away_team_id is not None else ra
    else:
        # preserva team_ids já resolvidos inline/alias
        resolved_home_team_id = int(rh) if rh is not None else None
        resolved_away_team_id = int(ra) if ra is not None else None

    # 4) persistir (idempotente)
    if persist_resolution:
        sql_upd = """
          UPDATE odds.odds_events
          SET
            resolved_home_team_id = %(rh)s,
            resolved_away_team_id = %(ra)s,
            resolved_fixture_id = %(rf)s,
            match_status = %(ms)s,
            match_score = %(sc)s,
            match_confidence = %(mc)s,
            updated_at_utc = now()
          WHERE event_id = %(event_id)s
        """
        with pg_tx(conn):
            with conn.cursor() as cur:
                cur.execute(
                    sql_upd,
                    {
                        "event_id": event_id,
                        "rh": resolved_home_team_id,
                        "ra": resolved_away_team_id,
                        "rf": resolved_fixture_id,
                        "ms": status,
                        "sc": float(confidence),
                        "mc": _match_confidence_legacy(status),
                    },
                )

    # 5) formatar candidates
    cand_out: List[Dict[str, Any]] = []
    for c in candidates[:max_candidates]:
        cand_out.append(
            {
                "fixture_id": c.fixture_id,
                "kickoff_utc": c.kickoff_utc,
                "home_team_id": c.home_team_id,
                "away_team_id": c.away_team_id,
                "home_team_name": c.home_team_name,
                "away_team_name": c.away_team_name,
                "scores": {
                    "home": round(c.score_home, 4),
                    "away": round(c.score_away, 4),
                    "time": round(c.score_time, 4),
                    "total": round(c.score_total, 4),
                },
            }
        )

    return ResolveResult(
        status=status,
        confidence=float(confidence),
        resolved_fixture_id=resolved_fixture_id,
        resolved_home_team_id=resolved_home_team_id,
        resolved_away_team_id=resolved_away_team_id,
        candidates=cand_out,
        reason=reason,
    )

