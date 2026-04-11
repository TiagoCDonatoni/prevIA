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
  tags_json
) VALUES
(
  'odds_refresh',
  'Odds Refresh',
  'src.ops.jobs.odds_refresh.odds_refresh',
  'Busca odds do provider e persiste eventos/snapshots.',
  TRUE, TRUE, TRUE, 900, 1, 100,
  '["odds","refresh"]'::jsonb
),
(
  'odds_resolve_batch',
  'Odds Resolve Batch',
  'src.ops.jobs.odds_resolve.odds_resolve_batch',
  'Resolve odds_events contra core.fixtures.',
  TRUE, TRUE, TRUE, 900, 1, 110,
  '["odds","resolve"]'::jsonb
),
(
  'snapshots_materialize',
  'Snapshots Materialize',
  'src.ops.jobs.snapshots_materialize.snapshots_materialize',
  'Materializa snapshots do produto.',
  TRUE, TRUE, TRUE, 1200, 1, 120,
  '["product","snapshots"]'::jsonb
),
(
  'update_pipeline_run',
  'Update Pipeline Run',
  'src.ops.jobs.update_pipeline.update_pipeline_run',
  'Pipeline completo por escopos aprovados.',
  TRUE, TRUE, TRUE, 1800, 1, 150,
  '["pipeline","update"]'::jsonb
),
(
  'pipeline_run_all',
  'Pipeline Run All',
  'src.ops.jobs.pipeline_run_all.pipeline_run_all',
  'Pipeline simplificado por sport_key.',
  TRUE, TRUE, TRUE, 1800, 1, 140,
  '["pipeline","all"]'::jsonb
),
(
  'odds_league_gap_scan',
  'Odds League Gap Scan',
  'src.ops.jobs.odds_league_gap_scan.odds_league_gap_scan',
  'Varre gaps do catálogo/mapeamento.',
  TRUE, TRUE, TRUE, 900, 1, 80,
  '["catalog","governance"]'::jsonb
),
(
  'odds_league_autoclassify',
  'Odds League Autoclassify',
  'src.ops.jobs.odds_league_autoclassify.odds_league_autoclassify',
  'Autoclassifica mapeamentos pendentes.',
  TRUE, TRUE, TRUE, 900, 1, 85,
  '["catalog","autoclassify"]'::jsonb
),
(
  'odds_catalog_sync',
  'Odds Catalog Sync',
  'src.ops.jobs.odds_catalog_sync.sync_odds_sport_catalog',
  'Sincroniza o catálogo de esportes/ligas da Odds API.',
  TRUE, TRUE, TRUE, 900, 1, 70,
  '["catalog","sync"]'::jsonb
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
  tags_json = EXCLUDED.tags_json,
  updated_at_utc = now();