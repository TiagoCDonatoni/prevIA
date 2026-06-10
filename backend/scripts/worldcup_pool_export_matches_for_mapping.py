from __future__ import annotations

import argparse
import csv
import json
import sys
from pathlib import Path
from typing import Any, Dict, Iterable, List

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from src.db.pg import pg_conn

DEFAULT_COMPETITION_KEY = "fifa_world_cup_2026"
DEFAULT_OUT = "worldcup-pool-internal-matches-for-api-mapping.csv"


def _text_i18n(value: Any, lang: str = "pt") -> str:
    if value is None:
        return ""

    if isinstance(value, dict):
        return str(value.get(lang) or value.get("pt-BR") or value.get("en") or value.get("es") or "").strip()

    if isinstance(value, str):
        raw = value.strip()
        if not raw:
            return ""
        try:
            loaded = json.loads(raw)
            if isinstance(loaded, dict):
                return _text_i18n(loaded, lang=lang)
        except Exception:
            return raw

    return str(value).strip()


def _iso(value: Any) -> str:
    return value.isoformat() if hasattr(value, "isoformat") else (str(value) if value is not None else "")


def _load_rows(*, competition_key: str, only_unmapped: bool) -> List[Dict[str, Any]]:
    where_unmapped = "AND m.api_fixture_id IS NULL" if only_unmapped else ""
    sql = f"""
      SELECT
        m.id,
        m.match_key,
        m.official_match_no,
        m.display_order,
        m.phase,
        m.group_code,
        m.bracket_label,
        m.home_label_i18n,
        m.away_label_i18n,
        m.home_team_i18n,
        m.away_team_i18n,
        m.kickoff_utc,
        m.lock_at_utc,
        m.status,
        m.home_score,
        m.away_score,
        m.result_source,
        m.api_fixture_id,
        m.api_home_team_id,
        m.api_away_team_id,
        m.api_mapping_status,
        m.api_mapping_note,
        COUNT(p.id)::int AS predictions_count
      FROM worldcup_pool.matches m
      LEFT JOIN worldcup_pool.predictions p
        ON p.match_id = m.id
      WHERE m.competition_key = %(competition_key)s
        {where_unmapped}
      GROUP BY m.id
      ORDER BY
        m.display_order ASC,
        m.kickoff_utc NULLS LAST,
        m.id ASC
    """

    with pg_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, {"competition_key": competition_key})
            rows = cur.fetchall() or []

    out: List[Dict[str, Any]] = []
    for row in rows:
        home_team = _text_i18n(row[9]) or _text_i18n(row[7])
        away_team = _text_i18n(row[10]) or _text_i18n(row[8])
        out.append(
            {
                "internal_match_id": row[0],
                "match_key": row[1],
                "official_match_no": row[2] or "",
                "display_order": row[3],
                "phase": row[4],
                "group_code": row[5] or "",
                "bracket_label": row[6] or "",
                "internal_home_label": home_team,
                "internal_away_label": away_team,
                "internal_match_label": f"{home_team} x {away_team}",
                "kickoff_utc": _iso(row[11]),
                "lock_at_utc": _iso(row[12]),
                "status": row[13],
                "home_score": row[14] if row[14] is not None else "",
                "away_score": row[15] if row[15] is not None else "",
                "result_source": row[16] or "",
                "api_fixture_id": row[17] or "",
                "api_home_team_id": row[18] or "",
                "api_away_team_id": row[19] or "",
                "api_mapping_status": row[20] or "",
                "api_mapping_note": row[21] or "",
                "predictions_count": row[22] or 0,
            }
        )

    return out


def _write_csv(path: Path, rows: Iterable[Dict[str, Any]]) -> int:
    rows = list(rows)
    fieldnames = [
        "internal_match_id",
        "match_key",
        "official_match_no",
        "display_order",
        "phase",
        "group_code",
        "bracket_label",
        "internal_home_label",
        "internal_away_label",
        "internal_match_label",
        "kickoff_utc",
        "lock_at_utc",
        "status",
        "home_score",
        "away_score",
        "result_source",
        "api_fixture_id",
        "api_home_team_id",
        "api_away_team_id",
        "api_mapping_status",
        "api_mapping_note",
        "predictions_count",
    ]
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)
    return len(rows)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Exporta jogos internos do bolão para fazer de/para manual com fixtures da API-FOOTBALL.",
    )
    parser.add_argument("--competition-key", default=DEFAULT_COMPETITION_KEY)
    parser.add_argument("--out", default=DEFAULT_OUT)
    parser.add_argument("--only-unmapped", action="store_true")
    args = parser.parse_args()

    rows = _load_rows(
        competition_key=str(args.competition_key),
        only_unmapped=bool(args.only_unmapped),
    )
    count = _write_csv(Path(args.out), rows)
    print(json.dumps({"ok": True, "rows": count, "out": str(args.out)}, ensure_ascii=False))


if __name__ == "__main__":
    main()