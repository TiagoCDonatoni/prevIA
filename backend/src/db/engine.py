from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Optional


def connect_sqlite(db_path: str) -> sqlite3.Connection:
    """
    Conexão única com SQLite (WAL) + schema idempotente.
    """
    Path(db_path).parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(db_path)
    con.execute("pragma journal_mode=WAL;")
    con.execute("pragma foreign_keys=ON;")
    apply_schema(con)
    return con

def apply_schema(con: sqlite3.Connection) -> None:
    """
    Cria tabelas base (se não existirem) e aplica migrações de forma segura.
    Detecta colunas via PRAGMA antes de criar índices.
    """

    # 1) TABELAS BASE
    con.execute(
        """
        create table if not exists api_raw (
            id integer primary key autoincrement,
            provider text not null,
            endpoint text not null,
            fetched_at_utc text not null,
            status_code integer not null,
            params_json text not null,
            payload_json text null,
            error_json text null
        )
        """
    )

    con.execute(
        """
        create table if not exists api_field_catalog (
            id integer primary key autoincrement,
            provider text not null,
            endpoint text not null,
            json_path text not null,
            field_name text not null,
            value_type text not null,
            example_value text null,
            seen_count integer not null default 0,
            first_seen_utc text not null,
            last_seen_utc text not null
        )
        """
    )

    # 2) MIGRAÇÃO: instance_key (só se faltar)
    cols = {row[1] for row in con.execute("pragma table_info(api_raw)").fetchall()}
    if "instance_key" not in cols:
        try:
            con.execute("alter table api_raw add column instance_key text")
        except Exception:
            # Em caso raro de corrida/lock, não derruba o app
            pass

    # Recarrega colunas após migração
    cols = {row[1] for row in con.execute("pragma table_info(api_raw)").fetchall()}

    # 3) ÍNDICES (idempotente)
    con.execute("create index if not exists idx_api_raw_endpoint on api_raw(endpoint)")
    con.execute("create index if not exists idx_api_raw_fetched_at on api_raw(fetched_at_utc)")
    if "instance_key" in cols:
        con.execute("create index if not exists idx_api_raw_instance_key on api_raw(instance_key)")

    con.execute("create index if not exists idx_catalog_endpoint on api_field_catalog(endpoint)")
    con.execute("create unique index if not exists ux_catalog_field on api_field_catalog(provider, endpoint, json_path)")

    con.commit()

