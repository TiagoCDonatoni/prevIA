BEGIN;

CREATE SCHEMA IF NOT EXISTS ops;

CREATE TABLE IF NOT EXISTS ops.job_runs (
  run_id           BIGSERIAL PRIMARY KEY,
  job_name         TEXT NOT NULL,                  -- ex: 'product_snapshot_rebuild_v1'
  scope_key        TEXT NOT NULL,                  -- ex: 'soccer_epl' (sport_key)
  model_version    TEXT NULL,                      -- ex: 'model_v0'
  calc_version     TEXT NULL,                      -- ex: 'snapshot_calc_v1'
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

COMMIT;