INSERT INTO ops.ops_job_scope_overrides (
  job_key,
  scope_type,
  scope_key,
  sport_key,
  enabled_override,
  priority_override,
  timeout_sec_override,
  max_attempts_override,
  notes
)
VALUES
('odds_refresh', 'global', 'global', NULL, NULL, 100, 900, 1, 'default global override'),
('odds_resolve_batch', 'global', 'global', NULL, NULL, 110, 900, 1, 'default global override'),
('snapshots_materialize', 'global', 'global', NULL, NULL, 120, 1200, 1, 'default global override'),
('update_pipeline_run', 'global', 'global', NULL, NULL, 150, 1800, 1, 'default global override'),
('pipeline_run_all', 'global', 'global', NULL, NULL, 140, 1800, 1, 'default global override'),
('odds_league_gap_scan', 'global', 'global', NULL, NULL, 80, 900, 1, 'default global override'),
('odds_league_autoclassify', 'global', 'global', NULL, NULL, 85, 900, 1, 'default global override')
ON CONFLICT (job_key, scope_type, scope_key) DO UPDATE SET
  priority_override = EXCLUDED.priority_override,
  timeout_sec_override = EXCLUDED.timeout_sec_override,
  max_attempts_override = EXCLUDED.max_attempts_override,
  updated_at_utc = now();