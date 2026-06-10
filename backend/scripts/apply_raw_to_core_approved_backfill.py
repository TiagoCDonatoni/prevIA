from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from src.db.pg import pg_conn  # noqa: E402
from src.etl.core_etl_pg import run_core_etl  # noqa: E402


SUPPORTED_ENDPOINTS = {"teams", "fixtures", "leagues"}


def _parse_int_csv_or_range(value: str) -> List[int]:
    raw = str(value or "").strip()
    if not raw:
        return []

    out: List[int] = []
    for part in raw.split(","):
        item = part.strip()
        if not item:
            continue

        if "-" in item:
            start_txt, end_txt = item.split("-", 1)
            start = int(start_txt.strip())
            end = int(end_txt.strip())
            if end < start:
                raise ValueError(f"invalid range: {item}")
            out.extend(range(start, end + 1))
        else:
            out.append(int(item))

    return sorted(set(out))


def _parse_csv(value: str) -> List[str]:
    return [part.strip() for part in str(value or "").split(",") if part.strip()]


def _load_approved_league_ids(*, max_leagues: int) -> List[int]:
    sql = """
      SELECT DISTINCT league_id::int AS league_id
      FROM odds.odds_league_map
      WHERE league_id IS NOT NULL
        AND COALESCE(enabled, false) = true
        AND mapping_status = 'approved'
      ORDER BY league_id ASC
      LIMIT %(n)s
    """
    with pg_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, {"n": int(max_leagues)})
            rows = cur.fetchall() or []

    return [int(r[0]) for r in rows if r and r[0] is not None]


def _resolve_league_ids(*, league_ids_arg: str, max_leagues: int) -> List[int]:
    explicit = _parse_int_csv_or_range(league_ids_arg)
    if explicit:
        return explicit[: int(max_leagues)]

    return _load_approved_league_ids(max_leagues=int(max_leagues))


def _resolve_endpoints(value: str) -> List[str]:
    endpoints = _parse_csv(value)
    if not endpoints:
        raise ValueError("--endpoints is required")

    unsupported = [ep for ep in endpoints if ep not in SUPPORTED_ENDPOINTS]
    if unsupported:
        raise ValueError(f"unsupported endpoints: {unsupported}")

    return endpoints


def apply_raw_to_core_approved_backfill(
    *,
    provider: str,
    league_ids: List[int],
    seasons: List[int],
    endpoints: List[str],
    limit: int,
    dry_run: bool,
    chunk_by_league_season: bool = False,
) -> Dict[str, Any]:
    results: Dict[str, Any] = {}
    total_raw_rows = 0
    total_items = 0
    total_upserts = 0

    if not chunk_by_league_season:
        for endpoint in endpoints:
            result = run_core_etl(
                provider=provider,
                endpoint=endpoint,
                limit=int(limit),
                league_ids=league_ids,
                seasons=seasons,
                dry_run=bool(dry_run),
            )

            results[endpoint] = result
            total_raw_rows += int(result.get("raw_rows") or 0)
            total_items += int(result.get("items") or 0)
            total_upserts += int(result.get("upserts") or 0)

    else:
        total_units = len(endpoints) * len(league_ids) * len(seasons)
        done_units = 0

        for endpoint in endpoints:
            endpoint_results: List[Dict[str, Any]] = []

            for league_id in league_ids:
                for season in seasons:
                    done_units += 1
                    print(
                        f"[{done_units}/{total_units}] endpoint={endpoint} league_id={league_id} season={season}",
                        file=sys.stderr,
                        flush=True,
                    )

                    result = run_core_etl(
                        provider=provider,
                        endpoint=endpoint,
                        limit=int(limit),
                        league_ids=[int(league_id)],
                        seasons=[int(season)],
                        dry_run=bool(dry_run),
                    )

                    item = {
                        "endpoint": endpoint,
                        "league_id": int(league_id),
                        "season": int(season),
                        **result,
                    }
                    endpoint_results.append(item)

                    total_raw_rows += int(result.get("raw_rows") or 0)
                    total_items += int(result.get("items") or 0)
                    total_upserts += int(result.get("upserts") or 0)

            results[endpoint] = {
                "chunks": endpoint_results,
                "raw_rows": sum(int(x.get("raw_rows") or 0) for x in endpoint_results),
                "items": sum(int(x.get("items") or 0) for x in endpoint_results),
                "upserts": sum(int(x.get("upserts") or 0) for x in endpoint_results),
            }

    return {
        "ok": True,
        "provider": provider,
        "dry_run": bool(dry_run),
        "calls_external_api": False,
        "mutates_database": not bool(dry_run),
        "purpose": "apply_historical_raw_api_responses_to_core",
        "chunk_by_league_season": bool(chunk_by_league_season),
        "league_count": len(league_ids),
        "season_count": len(seasons),
        "endpoint_ids": endpoints,
        "league_ids": league_ids,
        "seasons": seasons,
        "limit": int(limit),
        "summary": {
            "raw_rows": total_raw_rows,
            "items": total_items,
            "upserts": total_upserts,
        },
        "results": results,
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Aplica RAW histórico já baixado da API-Football em core.teams/core.fixtures."
    )
    parser.add_argument("--provider", default="apifootball")
    parser.add_argument(
        "--league-id",
        default="",
        help="Opcional. IDs explícitos, CSV/range. Ex: 71,98 ou 71-80. Se vazio, usa ligas approved.",
    )
    parser.add_argument(
        "--max-leagues",
        type=int,
        default=500,
        help="Limite de ligas quando usando approved. Default: 500.",
    )
    parser.add_argument(
        "--seasons",
        required=True,
        help='Temporadas. Ex: "2021-2026" ou "2021,2022,2023".',
    )
    parser.add_argument(
        "--endpoints",
        default="teams,fixtures",
        help='Endpoints CSV. Default: "teams,fixtures".',
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=100000,
        help="Limite de linhas RAW por endpoint. Default: 100000.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Calcula o que seria aplicado, mas não grava no CORE.",
    )
    parser.add_argument(
        "--chunk-by-league-season",
        action="store_true",
        help="Aplica em lotes pequenos: endpoint × liga × temporada, com progresso no stderr.",
    )
    args = parser.parse_args()

    league_ids = _resolve_league_ids(
        league_ids_arg=str(args.league_id or ""),
        max_leagues=int(args.max_leagues),
    )
    seasons = _parse_int_csv_or_range(str(args.seasons))
    endpoints = _resolve_endpoints(str(args.endpoints))

    if not league_ids:
        raise SystemExit("Nenhuma liga resolvida.")
    if not seasons:
        raise SystemExit("Nenhuma temporada resolvida.")

    payload = apply_raw_to_core_approved_backfill(
        provider=str(args.provider),
        league_ids=league_ids,
        seasons=seasons,
        endpoints=endpoints,
        limit=int(args.limit),
        dry_run=bool(args.dry_run),
        chunk_by_league_season=bool(args.chunk_by_league_season),
    )

    print(json.dumps(payload, ensure_ascii=False, indent=2, default=str))


if __name__ == "__main__":
    main()