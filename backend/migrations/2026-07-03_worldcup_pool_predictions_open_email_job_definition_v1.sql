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
  'worldcup_pool_predictions_open_email',
  'World Cup Pool Predictions Open Email',
  'src.ops.jobs.worldcup_pool_predictions_open_email.worldcup_pool_predictions_open_email',
  'Envia manualmente email aos participantes avisando que uma nova fase do bolão está aberta para palpites.',
  TRUE,
  TRUE,
  FALSE,
  300,
  1,
  70,
  '{
    "competition_key": "fifa_world_cup_2026",
    "phase": "round_of_16",
    "notification_key": "fifa_world_cup_2026:round_of_16:predictions_open:v1",
    "dry_run": true,
    "force": false,
    "limit": 1000,
    "stage_label_pt": "as oitavas de final",
    "stage_label_en": "the round of 16",
    "stage_label_es": "los octavos de final"
  }'::jsonb,
  '["worldcup","pool","email","predictions","manual"]'::jsonb
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