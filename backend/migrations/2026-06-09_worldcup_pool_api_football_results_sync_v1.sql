BEGIN;

ALTER TABLE worldcup_pool.matches
  ADD COLUMN IF NOT EXISTS api_provider TEXT,
  ADD COLUMN IF NOT EXISTS api_fixture_id BIGINT,
  ADD COLUMN IF NOT EXISTS api_home_team_id BIGINT,
  ADD COLUMN IF NOT EXISTS api_away_team_id BIGINT,
  ADD COLUMN IF NOT EXISTS api_status_short TEXT,
  ADD COLUMN IF NOT EXISTS api_status_long TEXT,
  ADD COLUMN IF NOT EXISTS api_status_elapsed INTEGER,
  ADD COLUMN IF NOT EXISTS api_round TEXT,
  ADD COLUMN IF NOT EXISTS api_venue_name TEXT,
  ADD COLUMN IF NOT EXISTS api_venue_city TEXT,
  ADD COLUMN IF NOT EXISTS api_mapping_status TEXT,
  ADD COLUMN IF NOT EXISTS api_mapping_note TEXT,
  ADD COLUMN IF NOT EXISTS api_last_synced_at_utc TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS api_final_seen_at_utc TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS api_final_confirmed_at_utc TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS api_raw_snapshot JSONB;

CREATE UNIQUE INDEX IF NOT EXISTS ux_worldcup_matches_api_fixture
  ON worldcup_pool.matches(api_provider, api_fixture_id)
  WHERE api_provider IS NOT NULL
    AND api_fixture_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_worldcup_matches_api_sync_candidates
  ON worldcup_pool.matches(
    competition_key,
    api_provider,
    status,
    kickoff_utc,
    api_final_confirmed_at_utc
  )
  WHERE api_fixture_id IS NOT NULL;

INSERT INTO ops.ops_job_definitions (
  job_key,
  display_name,
  handler_name,
  description,
  enabled_by_default,
  allow_manual_run,
  allow_scheduler_run,
  default_timeout_sec,
  default_max_attempts,
  default_priority,
  default_payload_json,
  tags_json
)
VALUES (
  'worldcup_pool_results_sync',
  'World Cup Pool Results Sync',
  'src.ops.jobs.worldcup_pool_results_sync.worldcup_pool_results_sync',
  'Consulta a API-FOOTBALL após a janela esperada de fim de jogo e atualiza resultados do bolão.',
  TRUE,
  TRUE,
  TRUE,
  300,
  1,
  60,
  '{
    "competition_key": "fifa_world_cup_2026",
    "lookback_days": 14,
    "min_minutes_after_kickoff": 100,
    "confirmation_delay_minutes": 1,
    "limit": 60,
    "batch_size": 20,
    "dry_run": false
  }'::jsonb,
  '["worldcup","pool","results","api-football"]'::jsonb
)
ON CONFLICT (job_key) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  handler_name = EXCLUDED.handler_name,
  description = EXCLUDED.description,
  enabled_by_default = EXCLUDED.enabled_by_default,
  allow_manual_run = EXCLUDED.allow_manual_run,
  allow_scheduler_run = EXCLUDED.allow_scheduler_run,
  default_timeout_sec = EXCLUDED.default_timeout_sec,
  default_max_attempts = EXCLUDED.default_max_attempts,
  default_priority = EXCLUDED.default_priority,
  default_payload_json = EXCLUDED.default_payload_json,
  tags_json = EXCLUDED.tags_json,
  updated_at_utc = NOW();

COMMIT;