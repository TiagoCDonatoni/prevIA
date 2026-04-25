from __future__ import annotations

from datetime import datetime, timezone
from typing import Iterable, List, Optional


def _coerce_now_utc(now_utc: Optional[datetime] = None) -> datetime:
    if now_utc is None:
        return datetime.now(timezone.utc)
    if now_utc.tzinfo is None:
        return now_utc.replace(tzinfo=timezone.utc)
    return now_utc.astimezone(timezone.utc)


def current_year_utc(now_utc: Optional[datetime] = None) -> int:
    return int(_coerce_now_utc(now_utc).year)


def current_operational_window(now_utc: Optional[datetime] = None) -> List[int]:
    """
    Ordem importa:
    1) ano atual
    2) ano atual - 1
    """
    year = current_year_utc(now_utc)
    return [int(year), int(year - 1)]


def min_allowed_current_season(now_utc: Optional[datetime] = None) -> int:
    return int(current_year_utc(now_utc) - 1)


def resolve_candidate_seasons(
    *,
    season_policy: str,
    fixed_season: Optional[int],
    now_utc: Optional[datetime] = None,
) -> List[int]:
    policy = str(season_policy or "current").strip().lower()

    if policy == "fixed":
        if fixed_season is None:
            raise ValueError("season_policy='fixed' requires fixed_season")
        return [int(fixed_season)]

    # current / by_kickoff_year / qualquer policy futura ainda não especializada
    return current_operational_window(now_utc)


def choose_current_operational_season(
    available_seasons: Iterable[int],
    *,
    now_utc: Optional[datetime] = None,
) -> Optional[int]:
    available = {int(v) for v in available_seasons if v is not None}

    for season in current_operational_window(now_utc):
        if season in available:
            return int(season)

    return None


def fixed_season_recency_gap(
    *,
    fixed_season: Optional[int],
    now_utc: Optional[datetime] = None,
) -> Optional[int]:
    if fixed_season is None:
        return None
    return int(current_year_utc(now_utc) - int(fixed_season))


def fixed_season_should_reduce_confidence(
    *,
    fixed_season: Optional[int],
    now_utc: Optional[datetime] = None,
) -> bool:
    gap = fixed_season_recency_gap(fixed_season=fixed_season, now_utc=now_utc)
    if gap is None:
        return False

    # sem penalidade para ano atual e ano atual - 1
    # penalidade a partir de ano atual - 2
    return int(gap) >= 2