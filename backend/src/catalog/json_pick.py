from __future__ import annotations

from datetime import datetime
from typing import Any, List, Optional


def pick(obj: Any, path: str) -> Any:
    """
    Suporta um subset mínimo de JSONPath no formato:
      $["key"]["key2"]
      $["arr"][0]["key"]
    Sem filtros, sem wildcards.
    """
    if not path.startswith("$"):
        raise ValueError(f"Invalid path: {path}")

    cur = obj
    i = 1
    while i < len(path):
        if path[i:].startswith('["'):
            j = path.find('"]', i)
            if j == -1:
                raise ValueError(f"Invalid path segment: {path[i:]}")
            key = path[i + 2 : j]
            cur = cur[key]
            i = j + 2
            continue

        if path[i] == "[":
            j = path.find("]", i)
            if j == -1:
                raise ValueError(f"Invalid index segment: {path[i:]}")
            idx = int(path[i + 1 : j])
            cur = cur[idx]
            i = j + 1
            continue

        if path[i] in ". ":
            i += 1
            continue

        raise ValueError(f"Unsupported path syntax at: {path[i:]}")
    return cur


def pick_season_year(seasons_list: Any, mode: str = "latest") -> Optional[int]:
    """
    seasons_list: lista de dicts com ['year'].
    mode: latest|earliest
    """
    if not isinstance(seasons_list, list) or not seasons_list:
        return None
    years: List[int] = []
    for s in seasons_list:
        if isinstance(s, dict) and isinstance(s.get("year"), int):
            years.append(s["year"])
    if not years:
        return None
    return max(years) if mode == "latest" else min(years)


def _parse_iso(dt: str) -> float:
    try:
        return datetime.fromisoformat(dt.replace("Z", "+00:00")).timestamp()
    except Exception:
        return 0.0


def pick_top_fixture_ids(
    items: Any,
    fixture_id_path: str,
    fixture_date_path: str,
    max_n: int,
    order: str = "latest",
) -> List[int]:
    """
    Ordena fixtures por fixture_date_path e retorna até max_n fixture_ids.
    """
    if not isinstance(items, list):
        return []

    scored: List[tuple[float, int]] = []
    for it in items:
        try:
            fid = pick(it, fixture_id_path)
            fdt = pick(it, fixture_date_path)
            if not isinstance(fid, int):
                continue
            score = _parse_iso(fdt) if isinstance(fdt, str) else 0.0
            scored.append((score, fid))
        except Exception:
            continue

    scored.sort(key=lambda x: x[0], reverse=(order == "latest"))

    out: List[int] = []
    seen = set()
    for _, fid in scored:
        if fid in seen:
            continue
        out.append(fid)
        seen.add(fid)
        if len(out) >= max_n:
            break
    return out
