# backend/src/db/pg_apply_schema.py
from __future__ import annotations

from pathlib import Path
from typing import Iterable

from src.db.pg import pg_conn, pg_tx
from src.core.settings import BASE_DIR


SQL_DIR = BASE_DIR / "sql"
FILES = (
    "001_raw_schema.sql",
    "002_core_schema.sql",
    "003_validations.sql",
)


def _split_statements(sql: str) -> Iterable[str]:
    # Suficiente para nossos arquivos (sem functions/DO $$)
    parts = sql.split(";")
    for p in parts:
        stmt = p.strip()
        if stmt:
            yield stmt + ";"


def apply_sql_file(conn, path: Path) -> None:
    sql = path.read_text(encoding="utf-8")
    with conn.cursor() as cur:
        for stmt in _split_statements(sql):
            cur.execute(stmt)


def main() -> None:
    missing = [f for f in FILES if not (SQL_DIR / f).exists()]
    if missing:
        raise RuntimeError(f"Missing sql files in {SQL_DIR}: {missing}")

    with pg_conn() as conn:
        with pg_tx(conn):
            for fname in FILES:
                apply_sql_file(conn, SQL_DIR / fname)

    print("OK: applied raw/core schema + validations SQL on Postgres")


if __name__ == "__main__":
    main()
