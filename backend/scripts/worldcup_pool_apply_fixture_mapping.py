from __future__ import annotations

import argparse
import csv
import json
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from src.db.pg import pg_conn

DEFAULT_COMPETITION_KEY = "fifa_world_cup_2026"
API_PROVIDER = "api_football"


def _clean(value: Any) -> str:
    return str(value or "").strip()


def _optional_int(value: Any) -> Optional[int]:
    raw = _clean(value)
    if not raw:
        return None
    return int(raw)


def _read_mapping(path: Path) -> List[Dict[str, Any]]:
    with path.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        rows = []
        for index, row in enumerate(reader, start=2):
            status = _clean(
                row.get("status_mapeamento")
                or row.get("api_mapping_status")
                or row.get("mapping_status")
                or "manual_matched"
            )
            internal_match_id = _optional_int(row.get("internal_match_id") or row.get("match_id"))
            api_fixture_id = _optional_int(row.get("api_fixture_id"))

            if not internal_match_id and not api_fixture_id:
                continue

            if not internal_match_id or not api_fixture_id:
                raise ValueError(f"Linha {index}: internal_match_id e api_fixture_id são obrigatórios.")

            if status not in {"manual_matched", "manual_corrected", "matched"}:
                continue

            rows.append(
                {
                    "line": index,
                    "internal_match_id": internal_match_id,
                    "api_fixture_id": api_fixture_id,
                    "api_home_team_id": _optional_int(row.get("api_home_team_id")),
                    "api_away_team_id": _optional_int(row.get("api_away_team_id")),
                    "api_mapping_status": "manual_matched" if status in {"matched", "manual_matched"} else status,
                    "api_mapping_note": _clean(row.get("api_mapping_note") or row.get("observacao") or row.get("observação"))
                    or "Mapped manually by kickoff, teams and official match order.",
                }
            )
    return rows


def _validate_rows(rows: List[Dict[str, Any]]) -> None:
    seen_match_ids: Dict[int, int] = {}
    seen_fixture_ids: Dict[int, int] = {}

    for row in rows:
        match_id = int(row["internal_match_id"])
        fixture_id = int(row["api_fixture_id"])
        line = int(row["line"])

        if match_id in seen_match_ids:
            raise ValueError(
                f"internal_match_id {match_id} duplicado nas linhas {seen_match_ids[match_id]} e {line}."
            )
        seen_match_ids[match_id] = line

        if fixture_id in seen_fixture_ids:
            raise ValueError(
                f"api_fixture_id {fixture_id} duplicado nas linhas {seen_fixture_ids[fixture_id]} e {line}."
            )
        seen_fixture_ids[fixture_id] = line


def _count_predictions(conn) -> int:
    with conn.cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM worldcup_pool.predictions")
        row = cur.fetchone()
    return int(row[0] or 0)


def _load_existing_conflicts(conn, *, rows: List[Dict[str, Any]], competition_key: str) -> List[Dict[str, Any]]:
    if not rows:
        return []

    match_ids = [int(r["internal_match_id"]) for r in rows]
    fixture_ids = [int(r["api_fixture_id"]) for r in rows]

    sql = """
      SELECT
        id,
        api_fixture_id,
        api_mapping_status,
        match_key
      FROM worldcup_pool.matches
      WHERE competition_key = %(competition_key)s
        AND (
          id = ANY(%(match_ids)s)
          OR api_fixture_id = ANY(%(fixture_ids)s)
        )
    """
    with conn.cursor() as cur:
        cur.execute(
            sql,
            {
                "competition_key": competition_key,
                "match_ids": match_ids,
                "fixture_ids": fixture_ids,
            },
        )
        db_rows = cur.fetchall() or []

    wanted_by_match = {int(r["internal_match_id"]): int(r["api_fixture_id"]) for r in rows}
    wanted_by_fixture = {int(r["api_fixture_id"]): int(r["internal_match_id"]) for r in rows}
    conflicts: List[Dict[str, Any]] = []

    existing_match_ids = set()
    for db_row in db_rows:
        match_id = int(db_row[0])
        existing_match_ids.add(match_id)
        existing_fixture_id = db_row[1]

        if match_id in wanted_by_match and existing_fixture_id is not None and int(existing_fixture_id) != wanted_by_match[match_id]:
            conflicts.append(
                {
                    "type": "match_already_mapped_to_different_fixture",
                    "internal_match_id": match_id,
                    "existing_api_fixture_id": int(existing_fixture_id),
                    "requested_api_fixture_id": wanted_by_match[match_id],
                }
            )

        if existing_fixture_id is not None:
            existing_fixture_id_int = int(existing_fixture_id)
            requested_match_id = wanted_by_fixture.get(existing_fixture_id_int)
            if requested_match_id is not None and requested_match_id != match_id:
                conflicts.append(
                    {
                        "type": "fixture_already_used_by_different_match",
                        "api_fixture_id": existing_fixture_id_int,
                        "existing_internal_match_id": match_id,
                        "requested_internal_match_id": requested_match_id,
                    }
                )

    missing_match_ids = sorted(set(wanted_by_match.keys()) - existing_match_ids)
    for match_id in missing_match_ids:
        conflicts.append({"type": "internal_match_not_found", "internal_match_id": match_id})

    return conflicts


def _apply_rows(
    conn,
    *,
    rows: List[Dict[str, Any]],
    competition_key: str,
    allow_overwrite: bool,
) -> int:
    if allow_overwrite:
        extra_where = ""
    else:
        extra_where = "AND api_fixture_id IS NULL"

    sql = f"""
      UPDATE worldcup_pool.matches
      SET
        api_provider = %(api_provider)s,
        api_fixture_id = %(api_fixture_id)s,
        api_home_team_id = %(api_home_team_id)s,
        api_away_team_id = %(api_away_team_id)s,
        api_mapping_status = %(api_mapping_status)s,
        api_mapping_note = %(api_mapping_note)s,
        api_last_synced_at_utc = NOW(),
        updated_at_utc = NOW()
      WHERE id = %(internal_match_id)s
        AND competition_key = %(competition_key)s
        {extra_where}
    """

    updated = 0
    with conn.cursor() as cur:
        for row in rows:
            cur.execute(
                sql,
                {
                    "api_provider": API_PROVIDER,
                    "competition_key": competition_key,
                    "internal_match_id": int(row["internal_match_id"]),
                    "api_fixture_id": int(row["api_fixture_id"]),
                    "api_home_team_id": row.get("api_home_team_id"),
                    "api_away_team_id": row.get("api_away_team_id"),
                    "api_mapping_status": row.get("api_mapping_status") or "manual_matched",
                    "api_mapping_note": row.get("api_mapping_note") or "Mapped manually.",
                },
            )
            updated += int(cur.rowcount or 0)
    return updated


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Aplica de/para manual entre jogos internos do bolão e fixtures da API-FOOTBALL.",
    )
    parser.add_argument("--csv", required=True, help="CSV com internal_match_id e api_fixture_id.")
    parser.add_argument("--competition-key", default=DEFAULT_COMPETITION_KEY)
    parser.add_argument("--apply", action="store_true", help="Sem esta flag, roda apenas dry-run.")
    parser.add_argument("--allow-overwrite", action="store_true", help="Permite corrigir api_fixture_id já preenchido.")
    args = parser.parse_args()

    rows = _read_mapping(Path(args.csv))
    _validate_rows(rows)

    with pg_conn() as conn:
        before_predictions = _count_predictions(conn)
        conflicts = _load_existing_conflicts(
            conn,
            rows=rows,
            competition_key=str(args.competition_key),
        )

        blocking_conflicts = conflicts if not bool(args.allow_overwrite) else [
            c for c in conflicts if c.get("type") == "internal_match_not_found"
        ]

        if blocking_conflicts:
            print(
                json.dumps(
                    {
                        "ok": False,
                        "dry_run": not bool(args.apply),
                        "rows": len(rows),
                        "blocking_conflicts": blocking_conflicts,
                    },
                    ensure_ascii=False,
                    indent=2,
                )
            )
            raise SystemExit(1)

        updated = 0
        if bool(args.apply):
            updated = _apply_rows(
                conn,
                rows=rows,
                competition_key=str(args.competition_key),
                allow_overwrite=bool(args.allow_overwrite),
            )
            after_predictions = _count_predictions(conn)
            if after_predictions != before_predictions:
                conn.rollback()
                print(
                    json.dumps(
                        {
                            "ok": False,
                            "error": "predictions_count_changed_rollback",
                            "before_predictions": before_predictions,
                            "after_predictions": after_predictions,
                        },
                        ensure_ascii=False,
                        indent=2,
                    )
                )
                raise SystemExit(1)
            conn.commit()
        else:
            after_predictions = before_predictions
            conn.rollback()

    print(
        json.dumps(
            {
                "ok": True,
                "dry_run": not bool(args.apply),
                "input_rows": len(rows),
                "updated_rows": updated,
                "before_predictions": before_predictions,
                "after_predictions": after_predictions,
                "non_blocking_conflicts": [] if not bool(args.allow_overwrite) else conflicts,
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()