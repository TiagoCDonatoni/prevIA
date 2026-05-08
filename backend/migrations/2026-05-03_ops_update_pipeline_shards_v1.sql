BEGIN;

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
  'update_pipeline_run_shard',
  'Update Pipeline Run Shard',
  'src.ops.jobs.update_pipeline.update_pipeline_run_shard',
  'Executa o update_pipeline_run pesado em shard seguro para Cloud Scheduler HTTP.',
  TRUE,
  TRUE,
  TRUE,
  1800,
  1,
  155,
  '{"shard_count": 10}'::jsonb,
  '["pipeline","core","update","sharded"]'::jsonb
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
  updated_at_utc = now();

-- Segurança: o monolítico segue manual. O Scheduler deve usar update_pipeline_run_shard.
UPDATE ops.ops_job_definitions
SET
  allow_scheduler_run = FALSE,
  updated_at_utc = now()
WHERE job_key = 'update_pipeline_run';

INSERT INTO ops.ops_job_scope_overrides (
  job_key,
  scope_type,
  scope_key,
  sport_key,
  enabled_override,
  priority_override,
  timeout_sec_override,
  max_attempts_override,
  scheduler_cron,
  scheduler_timezone,
  payload_patch_json,
  notes
)
VALUES (
  'update_pipeline_run_shard',
  'global',
  'global',
  NULL,
  NULL,
  155,
  1800,
  1,
  '5-20/15 1-3 * * 2,4,6',
  'America/Sao_Paulo',
  '{"shard_count": 10}'::jsonb,
  'terça/quinta/sábado em 10 shards entre 01:05 e 03:20; scheduler cria jobs individuais'
)
ON CONFLICT (job_key, scope_type, scope_key) DO UPDATE SET
  enabled_override = EXCLUDED.enabled_override,
  priority_override = EXCLUDED.priority_override,
  timeout_sec_override = EXCLUDED.timeout_sec_override,
  max_attempts_override = EXCLUDED.max_attempts_override,
  scheduler_cron = EXCLUDED.scheduler_cron,
  scheduler_timezone = EXCLUDED.scheduler_timezone,
  payload_patch_json = EXCLUDED.payload_patch_json,
  notes = EXCLUDED.notes,
  updated_at_utc = now();

COMMIT;