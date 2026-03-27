import os
import sys

# garante que "backend/" esteja no sys.path (para importar src.*)
HERE = os.path.dirname(os.path.abspath(__file__))
BACKEND_ROOT = os.path.abspath(os.path.join(HERE, ".."))
if BACKEND_ROOT not in sys.path:
    sys.path.insert(0, BACKEND_ROOT)

from src.db.pg import pg_conn

sql = """
CREATE SCHEMA IF NOT EXISTS ops;

CREATE TABLE IF NOT EXISTS ops.job_runs (
  run_id           BIGSERIAL PRIMARY KEY,
  job_name         TEXT NOT NULL,
  scope_key        TEXT NOT NULL,
  model_version    TEXT NULL,
  calc_version     TEXT NULL,
  started_at_utc   TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at_utc  TIMESTAMPTZ NULL,
  ok               BOOLEAN NULL,
  duration_ms      INT NULL,
  counters_json    JSONB NULL,
  error_text       TEXT NULL
);

CREATE INDEX IF NOT EXISTS ix_job_runs_job_scope_started
  ON ops.job_runs (job_name, scope_key, started_at_utc DESC);

CREATE INDEX IF NOT EXISTS ix_job_runs_ok_finished
  ON ops.job_runs (ok, finished_at_utc DESC);
"""

with pg_conn() as conn:
    conn.autocommit = True
    with conn.cursor() as cur:
        cur.execute(sql)

print("✅ ops.job_runs criado com sucesso.")