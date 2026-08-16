BEGIN;

UPDATE ops.ops_job_definitions
SET
  enabled_by_default = FALSE,
  allow_scheduler_run = FALSE,
  updated_at_utc = NOW()
WHERE job_key = 'worldcup_pool_results_sync';

COMMIT;