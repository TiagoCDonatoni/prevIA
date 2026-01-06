# backend/src/db/pg.py
from __future__ import annotations

from contextlib import contextmanager
from typing import Iterator, Optional

import psycopg

from src.core.settings import load_settings


def _require_database_url() -> str:
    s = load_settings()
    if not s.database_url:
        raise RuntimeError("DATABASE_URL is required for Postgres mode (ex: postgres://user:pass@host:5432/db)")
    return s.database_url


def connect_pg(url: Optional[str] = None) -> psycopg.Connection:
    dsn = url or _require_database_url()
    return psycopg.connect(dsn, connect_timeout=5)

@contextmanager
def pg_conn(url: Optional[str] = None) -> Iterator[psycopg.Connection]:
    conn = connect_pg(url)
    try:
        yield conn
    finally:
        conn.close()


@contextmanager
def pg_tx(conn: psycopg.Connection):
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
