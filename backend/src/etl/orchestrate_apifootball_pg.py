from __future__ import annotations

import argparse
import json
from typing import Any, Dict, List, Tuple

from src.core.settings import load_settings
from src.provider.apifootball.client import ApiFootballClient

from src.etl.raw_ingest_pg import insert_raw_response
from src.etl.core_etl_pg import run_core_etl


def _call(client: ApiFootballClient, path: str, params: Dict[str, Any]) -> Tuple[int, Dict[str, Any]]:
    status, payload = client.get(path, params)
    if not isinstance(payload, dict):
        payload = {"errors": {"non_dict_payload": True}, "response": None}
    return int(status), payload


def _parse_int_list(csv: str) -> List[int]:
    out: List[int] = []
    for part in (csv or "").split(","):
        p = part.strip()
        if p.isdigit():
            out.append(int(p))
    return out


def _parse_seasons(seasons_arg: str) -> List[int]:
    """
    formatos:
      "2024"           -> [2024]
      "2021-2024"      -> [2021,2022,2023,2024]
      "2021,2022,2024" -> [2021,2022,2024]
    """
    s = (seasons_arg or "").strip()
    if not s:
        raise ValueError("--seasons is required")

    if "-" in s and "," not in s:
        a, b = s.split("-", 1)
        a = int(a.strip())
        b = int(b.strip())
        if b < a:
            raise ValueError("season range invalid")
        return list(range(a, b + 1))

    items = _parse_int_list(s)
    if not items:
        raise ValueError("invalid seasons format")
    return items


def main() -> None:
    ap = argparse.ArgumentParser(description="Few leagues + multi-season (API-Football -> RAW -> CORE)")
    ap.add_argument("--provider", default="apifootball")
    ap.add_argument("--league-ids", default="39", help="CSV league ids (ex: 39,140)")
    ap.add_argument("--seasons", required=True, help='ex: "2021-2024" or "2022,2023,2024"')
    ap.add_argument("--max-calls", type=int, default=30, help="hard cap of API calls for safety")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    league_ids = _parse_int_list(args.league_ids)
    seasons = _parse_seasons(args.seasons)

    s = load_settings()
    client = ApiFootballClient(
        base_url=s.apifootball_base_url,
        api_key=s.apifootball_key,
        timeout_s=int(s.app_defaults.get("http_timeout_s", 30)),
    )

    calls_left = int(args.max_calls)

    report = {
        "plan": {"league_ids": league_ids, "seasons": seasons, "max_calls": calls_left},
        "raw": {"leagues": 0, "teams": 0, "fixtures": 0, "dedup": 0},
        "core": {},
        "calls": {"ok": 0, "fail": 0},
    }

    def ingest(endpoint: str, path: str, params: Dict[str, Any]) -> bool:
        nonlocal calls_left
        if calls_left <= 0:
            return False

        if args.dry_run:
            status, payload = 200, {"response": [], "paging": {"current": 1, "total": 1}}
        else:
            status, payload = _call(client, path, params)

        ok = 200 <= status < 300
        inserted, _ = insert_raw_response(
            provider=args.provider,
            endpoint=endpoint,
            request_params={"path": path, "params": params},
            response_body=payload,
            http_status=status,
            ok=ok,
            error_message=None if ok else str(payload.get("errors")),
        )

        calls_left -= 1
        if ok:
            report["calls"]["ok"] += 1
        else:
            report["calls"]["fail"] += 1

        if inserted:
            report["raw"][endpoint] += 1
        else:
            report["raw"]["dedup"] += 1

        return ok

    # Estratégia:
    # - leagues por season (1 chamada por season) -> útil para manter a dimensão atualizada
    # - teams e fixtures por (league, season)
    for season in seasons:
        if not ingest("leagues", "/leagues", {"season": season}):
            break

        for league_id in league_ids:
            if calls_left <= 0:
                break

            if not ingest("teams", "/teams", {"league": league_id, "season": season}):
                continue

            if calls_left <= 0:
                break

            ingest("fixtures", "/fixtures", {"league": league_id, "season": season})

    # CORE ETL (limite alto, mas controlado por quantos RAWs você ingeriu)
    report["core"]["leagues"] = run_core_etl(provider=args.provider, endpoint="leagues", limit=5000, league_ids=league_ids)
    report["core"]["teams"] = run_core_etl(provider=args.provider, endpoint="teams", limit=5000)
    report["core"]["fixtures"] = run_core_etl(provider=args.provider, endpoint="fixtures", limit=20000)

    report["plan"]["calls_left"] = calls_left

    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
