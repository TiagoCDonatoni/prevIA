from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional

from src.db.pg import pg_conn, pg_tx


@dataclass(frozen=True)
class MigrateResult:
    applied: List[str]


def _ensure_schema_migrations(cur) -> None:
    cur.execute("""
    CREATE TABLE IF NOT EXISTS core.schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    """)


def _read_migrations(migrations_dir: Path) -> List[Path]:
    if not migrations_dir.exists():
        raise FileNotFoundError(f"migrations dir not found: {migrations_dir}")
    return sorted([p for p in migrations_dir.glob("*.sql")])


def migrate(*, migrations_dir: Optional[str] = None) -> MigrateResult:
    base = Path(migrations_dir) if migrations_dir else Path("migrations")
    files = _read_migrations(base)

    applied: List[str] = []
    with pg_conn() as conn:
        with pg_tx(conn):
            cur = conn.cursor()

            # garante schema core e tabela de controle
            cur.execute("CREATE SCHEMA IF NOT EXISTS core;")
            _ensure_schema_migrations(cur)

            # carrega migrações já aplicadas
            cur.execute("SELECT version FROM core.schema_migrations;")
            done = {row[0] for row in cur.fetchall()}

            for f in files:
                version = f.name  # ex: 014_core_team_season_stats.sql
                if version in done:
                    continue

                sql = f.read_text(encoding="utf-8")
                cur.execute(sql)
                cur.execute(
                    "INSERT INTO core.schema_migrations(version) VALUES (%s);",
                    (version,),
                )
                applied.append(version)

    return MigrateResult(applied=applied)


if __name__ == "__main__":
    res = migrate()
    print({"applied": res.applied, "count": len(res.applied)})
