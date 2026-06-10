from __future__ import annotations

import argparse
import csv
import json
import sys
from pathlib import Path
from typing import Any, Dict, Iterable, Optional

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from src.core.settings import load_settings
from src.provider.apifootball.client import ApiFootballClient

DEFAULT_OUT = "api-football-worldcup-2026-fixtures-for-mapping.csv"
DEFAULT_RAW_OUT = "api-football-worldcup-2026-fixtures-raw.json"


def _nested(item: Dict[str, Any], *keys: str) -> Any:
    current: Any = item
    for key in keys:
        if not isinstance(current, dict):
            return None
        current = current.get(key)
    return current


def _safe_int(value: Any) -> Optional[int]:
    if value is None or value == "":
        return None
    try:
        return int(value)
    except Exception:
        return None


def _row(item: Dict[str, Any]) -> Dict[str, Any]:
    home_id = _safe_int(_nested(item, "teams", "home", "id"))
    away_id = _safe_int(_nested(item, "teams", "away", "id"))
    home_name = str(_nested(item, "teams", "home", "name") or "").strip()
    away_name = str(_nested(item, "teams", "away", "name") or "").strip()

    return {
        "api_fixture_id": _safe_int(_nested(item, "fixture", "id")) or "",
        "api_kickoff_utc": str(_nested(item, "fixture", "date") or ""),
        "api_round": str(_nested(item, "league", "round") or ""),
        "api_status_short": str(_nested(item, "fixture", "status", "short") or ""),
        "api_status_long": str(_nested(item, "fixture", "status", "long") or ""),
        "api_elapsed": _nested(item, "fixture", "status", "elapsed") or "",
        "api_home_team_id": home_id or "",
        "api_home_team_name": home_name,
        "api_away_team_id": away_id or "",
        "api_away_team_name": away_name,
        "api_match_label": f"{home_name} x {away_name}",
        "api_home_goals": _nested(item, "goals", "home") if _nested(item, "goals", "home") is not None else "",
        "api_away_goals": _nested(item, "goals", "away") if _nested(item, "goals", "away") is not None else "",
        "api_venue_name": str(_nested(item, "fixture", "venue", "name") or ""),
        "api_venue_city": str(_nested(item, "fixture", "venue", "city") or ""),
    }


def _write_csv(path: Path, rows: Iterable[Dict[str, Any]]) -> int:
    rows = list(rows)
    fieldnames = [
        "api_fixture_id",
        "api_kickoff_utc",
        "api_round",
        "api_status_short",
        "api_status_long",
        "api_elapsed",
        "api_home_team_id",
        "api_home_team_name",
        "api_away_team_id",
        "api_away_team_name",
        "api_match_label",
        "api_home_goals",
        "api_away_goals",
        "api_venue_name",
        "api_venue_city",
    ]
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)
    return len(rows)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Baixa fixtures da Copa na API-FOOTBALL e exporta CSV para de/para manual.",
    )
    parser.add_argument("--league-id", type=int, default=1)
    parser.add_argument("--season", type=int, default=2026)
    parser.add_argument("--out", default=DEFAULT_OUT)
    parser.add_argument("--raw-out", default=DEFAULT_RAW_OUT)
    args = parser.parse_args()

    settings = load_settings()
    client = ApiFootballClient(
        base_url=settings.apifootball_base_url,
        api_key=settings.apifootball_key,
        timeout_s=30,
    )
    status_code, payload = client.get(
        "/fixtures",
        {"league": int(args.league_id), "season": int(args.season)},
    )

    if status_code >= 400:
        print(
            json.dumps(
                {
                    "ok": False,
                    "status_code": status_code,
                    "errors": (payload or {}).get("errors"),
                },
                ensure_ascii=False,
            )
        )
        raise SystemExit(1)

    if (payload or {}).get("errors"):
        print(
            json.dumps(
                {
                    "ok": False,
                    "status_code": status_code,
                    "errors": (payload or {}).get("errors"),
                },
                ensure_ascii=False,
            )
        )
        raise SystemExit(1)

    response = (payload or {}).get("response") or []
    if not isinstance(response, list):
        response = []

    raw_path = Path(args.raw_out)
    raw_path.parent.mkdir(parents=True, exist_ok=True)
    raw_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    rows = [_row(item) for item in response if isinstance(item, dict)]
    rows.sort(key=lambda r: (str(r.get("api_kickoff_utc") or ""), int(r.get("api_fixture_id") or 0)))
    count = _write_csv(Path(args.out), rows)

    print(
        json.dumps(
            {
                "ok": True,
                "status_code": status_code,
                "fixtures": count,
                "out": str(args.out),
                "raw_out": str(args.raw_out),
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()