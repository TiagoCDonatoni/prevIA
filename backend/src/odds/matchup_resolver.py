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


def resolve_odds_event(
    conn,
    *,
    event_id: str,
    assume_league_id: int,
    assume_season: int,
    tol_hours: int = 6,
    max_candidates: int = 5,
    persist_resolution: bool = True,
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

    _, _, commence_time_utc, home_name, away_name, rh, ra, rf, match_status, match_score = row

    if commence_time_utc is None:
        return ResolveResult(
            status="NOT_FOUND",
            confidence=0.0,
            resolved_fixture_id=None,
            resolved_home_team_id=None,
            resolved_away_team_id=None,
            candidates=[],
            reason="event_missing_commence_time_utc",
        )

    kickoff = _to_utc(commence_time_utc)
    start = kickoff - timedelta(hours=tol_hours)
    end = kickoff + timedelta(hours=tol_hours)

    # 2) buscar fixtures candidatos (liga/season + janela)
    sql_cand = """
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
      WHERE f.league_id = %(league_id)s
        AND f.season = %(season)s
        AND f.kickoff_utc >= %(start)s
        AND f.kickoff_utc <= %(end)s
      ORDER BY f.kickoff_utc ASC
      LIMIT 200
    """
    with conn.cursor() as cur:
        cur.execute(
            sql_cand,
            {
                "league_id": int(assume_league_id),
                "season": int(assume_season),
                "start": start,
                "end": end,
            },
        )
        rows = cur.fetchall()

    candidates: List[Candidate] = []
    for fixture_id, kickoff_utc_db, home_team_id, home_team_name, away_team_id, away_team_name in rows:
        kdb = _to_utc(kickoff_utc_db)
        diff_h = abs((kdb - kickoff).total_seconds()) / 3600.0
        score_time = max(0.0, 1.0 - (diff_h / float(max(1, tol_hours))))  # 0..1

        s_home = _name_similarity(home_name, home_team_name)
        s_away = _name_similarity(away_name, away_team_name)

        # Peso: nomes dominam, tempo só desempata
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

    resolved_fixture_id = best.fixture_id if status in {"EXACT", "PROBABLE"} and best else None
    resolved_home_team_id = best.home_team_id if status in {"EXACT", "PROBABLE"} and best else None
    resolved_away_team_id = best.away_team_id if status in {"EXACT", "PROBABLE"} and best else None

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
