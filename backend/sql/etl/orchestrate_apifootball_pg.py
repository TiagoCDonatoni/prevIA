# backend/src/etl/orchestrate_apifootball_pg.py
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any, Dict, List, Tuple

from src.core.settings import load_settings, CONFIG_DIR
from src.provider.apifootball.client import ApiFootballClient

from src.etl.raw_ingest_pg import insert_raw_response
from src.etl.core_etl_pg import run_core_etl


def _read_json(path: Path) -> Dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _pick(obj: Any, path: str) -> Any:
    """
    Mini JSONPath do seu projeto antigo NÃO é necessário aqui.
    Para manter bloco pequeno, o callplan atual só precisa:
      - item["league"]["id"]
      - item["seasons"] (lista)
    """
    raise NotImplementedError("This orchestrator uses fixed picks for the current callplan.")


def _pick_season_year(seasons_list: Any, mode: str) -> int | None:
    """
    seasons_list: lista de objetos com {year, current} (como API-Football costuma retornar)
    mode:
      - 'latest' (default): maior year disponível
      - 'current': pega o que tiver current=true, senão cai no latest
    """
    if not isinstance(seasons_list, list) or not seasons_list:
        return None

    years = []
    current_year = None
    for s in seasons_list:
        if not isinstance(s, dict):
            continue
        y = s.get("year")
        if isinstance(y, int):
            years.append(y)
            if s.get("current") is True:
                current_year = y

    if not years:
        return None

    if mode == "current" and current_year is not None:
        return current_year

    return max(years)


def build_calls_from_callplan(leagues_payload: Dict[str, Any], callplan: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Constrói chamadas derivadas (teams, fixtures, etc.) a partir do payload de /leagues
    seguindo backend/config/callplan.apifootball.json
    """
    source = callplan["source"]
    rules = callplan.get("rules", {}) or {}
    derived = [d for d in callplan.get("derived_endpoints", []) if d.get("enabled")]

    items = leagues_payload.get("response")
    if not isinstance(items, list):
        raise ValueError("Payload de leagues não tem 'response' como lista")

    max_leagues = int(rules.get("max_leagues", 5))
    seasons_pick = str(rules.get("seasons_pick", "latest"))

    calls: List[Dict[str, Any]] = []

    for item in items[:max_leagues]:
        if not isinstance(item, dict):
            continue

        league = item.get("league") or {}
        league_id = league.get("id")
        seasons_list = item.get("seasons")

        season = _pick_season_year(seasons_list, mode=seasons_pick)

        if league_id is None or season is None:
            continue

        for d in derived:
            params_template: Dict[str, Any] = d.get("params", {}) or {}
            params: Dict[str, Any] = {}
            for k, v in params_template.items():
                if isinstance(v, str):
                    v = v.replace("{league_id}", str(league_id)).replace("{season}", str(season))
                params[k] = v

            calls.append(
                {
                    "id": d["id"],          # ex: teams|fixtures|standings
                    "path": d["path"],      # ex: /teams
                    "params": params,       # ex: {league: 39, season: 2023}
                    "meta": {"league_id": league_id, "season": season},
                }
            )

    return calls


def run_orchestrator(
    *,
    season_for_leagues: int | None,
    max_calls: int | None,
    dry_run: bool,
) -> Dict[str, Any]:
    settings = load_settings()

    # Config (sem hardcode)
    callplan = _read_json(CONFIG_DIR / "callplan.apifootball.json")
    provider = callplan.get("provider", "apifootball")

    client = ApiFootballClient(
        base_url=settings.apifootball_base_url,
        api_key=settings.apifootball_key,
        timeout_s=int(settings.app_defaults.get("http_timeout_s", 30)),
    )

    # 1) Fetch /leagues
    leagues_path = "/leagues"
    leagues_params: Dict[str, Any] = {}
    if season_for_leagues is not None:
        leagues_params["season"] = int(season_for_leagues)

    if dry_run:
        leagues_status, leagues_payload = 200, {"response": []}
    else:
        leagues_status, leagues_payload = client.get(leagues_path, leagues_params)

    inserted_leagues_raw, _ = insert_raw_response(
        provider=provider,
        endpoint="leagues",
        request_params={"path": leagues_path, "params": leagues_params},
        response_body=leagues_payload,
        http_status=leagues_status,
        ok=(200 <= leagues_status < 300),
        error_message=None if (200 <= leagues_status < 300) else str(leagues_payload.get("errors")),
    )

    # 2) Build derived calls (teams/fixtures/standings)
    calls = build_calls_from_callplan(leagues_payload if isinstance(leagues_payload, dict) else {}, callplan)
    if max_calls is not None:
        calls = calls[: int(max_calls)]

    # 3) Execute derived calls -> RAW
    raw_inserted = 0
    raw_dedup = 0

    for c in calls:
        ep_id = c["id"]
        path = c["path"]
        params = c["params"]

        if dry_run:
            status, payload = 200, {"response": []}
        else:
            try:
                status, payload = client.get(path, params)
            except Exception as ex:
                status, payload = 599, {"errors": {"exception": str(ex)}, "response": None}

        inserted, _ = insert_raw_response(
            provider=provider,
            endpoint=str(ep_id),  # 'teams', 'fixtures', 'standings', ...
            request_params={"path": path, "params": params, "meta": c.get("meta", {})},
            response_body=payload if isinstance(payload, dict) else {"response": None, "errors": {"non_dict_payload": True}},
            http_status=int(status),
            ok=(200 <= int(status) < 300),
            error_message=None if (200 <= int(status) < 300) else str((payload or {}).get("errors")),
        )

        if inserted:
            raw_inserted += 1
        else:
            raw_dedup += 1

    # 4) Run CORE ETL (ordem correta)
    etl_leagues = run_core_etl(provider=provider, endpoint="leagues", limit=2000)
    etl_teams = run_core_etl(provider=provider, endpoint="teams", limit=5000)
    etl_fixtures = run_core_etl(provider=provider, endpoint="fixtures", limit=10000)

    return {
        "provider": provider,
        "dry_run": dry_run,
        "raw": {
            "leagues_saved": bool(inserted_leagues_raw),
            "derived_calls": len(calls),
            "inserted": raw_inserted,
            "dedup": raw_dedup,
        },
        "core_etl": {
            "leagues": etl_leagues,
            "teams": etl_teams,
            "fixtures": etl_fixtures,
        },
    }


def main() -> None:
    ap = argparse.ArgumentParser(description="Orchestrate API-Football -> RAW(Postgres) -> CORE")
    ap.add_argument("--season", required=False, type=int, default=None, help="Season filter for /leagues (ex: 2024)")
    ap.add_argument("--max-calls", required=False, type=int, default=None, help="Limit derived calls (debug)")
    ap.add_argument("--dry-run", action="store_true", help="Do not call external API (debug)")
    args = ap.parse_args()

    result = run_orchestrator(
        season_for_leagues=args.season,
        max_calls=args.max_calls,
        dry_run=bool(args.dry_run),
    )
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
