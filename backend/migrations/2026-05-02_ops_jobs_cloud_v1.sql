BEGIN;

CREATE SCHEMA IF NOT EXISTS ops;

-- ---------------------------------------------------------------------
-- Compatibilidade com o legado ainda usado por partes do Admin antigo.
-- A camada nova usa ops.ops_job_runs, mas admin_odds_router ainda usa
-- ops.job_runs em alguns fluxos.
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- Definições de jobs: catálogo source-of-truth dos jobs executáveis.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ops.ops_job_definitions (
  job_key                 TEXT PRIMARY KEY,
  display_name            TEXT NOT NULL,
  handler_name            TEXT NOT NULL,
  description             TEXT NULL,

  enabled_by_default      BOOLEAN NOT NULL DEFAULT TRUE,
  allow_manual_run        BOOLEAN NOT NULL DEFAULT TRUE,
  allow_scheduler_run     BOOLEAN NOT NULL DEFAULT FALSE,

  default_timeout_sec     INT NOT NULL DEFAULT 900 CHECK (default_timeout_sec > 0),
  default_max_attempts    INT NOT NULL DEFAULT 1 CHECK (default_max_attempts >= 1),
  default_priority        INT NOT NULL DEFAULT 100,

  default_payload_json    JSONB NOT NULL DEFAULT '{}'::jsonb,
  tags_json               JSONB NOT NULL DEFAULT '[]'::jsonb,

  created_at_utc          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at_utc          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_ops_job_definitions_enabled_priority
  ON ops.ops_job_definitions (enabled_by_default, default_priority, job_key);

-- ---------------------------------------------------------------------
-- Overrides por escopo.
-- Precedência efetiva hoje no código:
--   job_sport_key > sport_key > global
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ops.ops_job_scope_overrides (
  override_id             BIGSERIAL PRIMARY KEY,

  job_key                 TEXT NOT NULL REFERENCES ops.ops_job_definitions(job_key) ON DELETE CASCADE,
  scope_type              TEXT NOT NULL CHECK (
    scope_type IN ('global', 'job', 'sport_key', 'job_sport_key')
  ),
  scope_key               TEXT NOT NULL,
  sport_key               TEXT NULL,

  enabled_override        BOOLEAN NULL,
  priority_override       INT NULL,
  timeout_sec_override    INT NULL CHECK (timeout_sec_override IS NULL OR timeout_sec_override > 0),
  max_attempts_override   INT NULL CHECK (max_attempts_override IS NULL OR max_attempts_override >= 1),

  scheduler_cron          TEXT NULL,
  scheduler_timezone      TEXT NOT NULL DEFAULT 'UTC',

  payload_patch_json      JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes                   TEXT NULL,

  created_at_utc          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at_utc          TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT ck_ops_job_scope_overrides_scope_consistency CHECK (
    (
      scope_type = 'global'
      AND scope_key = 'global'
      AND sport_key IS NULL
    )
    OR (
      scope_type = 'job'
      AND scope_key = job_key
      AND sport_key IS NULL
    )
    OR (
      scope_type = 'sport_key'
      AND sport_key IS NOT NULL
      AND scope_key = sport_key
    )
    OR (
      scope_type = 'job_sport_key'
      AND sport_key IS NOT NULL
      AND scope_key = sport_key
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_ops_job_scope_overrides_job_scope
  ON ops.ops_job_scope_overrides (job_key, scope_type, scope_key);

CREATE INDEX IF NOT EXISTS ix_ops_job_scope_overrides_sport
  ON ops.ops_job_scope_overrides (sport_key, job_key);

-- ---------------------------------------------------------------------
-- Feature flags temporárias.
-- Sem flag ativa = segue enabled_by_default/override.
--
-- Precedência no código:
--   job_sport_key > job > sport_key > global
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ops.ops_feature_flags (
  flag_id                 BIGSERIAL PRIMARY KEY,

  flag_name               TEXT NOT NULL DEFAULT 'enabled' CHECK (flag_name IN ('enabled')),
  scope_type              TEXT NOT NULL CHECK (
    scope_type IN ('global', 'job', 'sport_key', 'job_sport_key')
  ),

  job_key                 TEXT NULL REFERENCES ops.ops_job_definitions(job_key) ON DELETE CASCADE,
  sport_key               TEXT NULL,

  enabled                 BOOLEAN NOT NULL,
  reason                  TEXT NULL,

  starts_at_utc           TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at_utc          TIMESTAMPTZ NULL,

  created_by              TEXT NULL,
  created_at_utc          TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata_json           JSONB NOT NULL DEFAULT '{}'::jsonb,

  CONSTRAINT ck_ops_feature_flags_scope_consistency CHECK (
    (
      scope_type = 'global'
      AND job_key IS NULL
      AND sport_key IS NULL
    )
    OR (
      scope_type = 'job'
      AND job_key IS NOT NULL
      AND sport_key IS NULL
    )
    OR (
      scope_type = 'sport_key'
      AND job_key IS NULL
      AND sport_key IS NOT NULL
    )
    OR (
      scope_type = 'job_sport_key'
      AND job_key IS NOT NULL
      AND sport_key IS NOT NULL
    )
  ),

  CONSTRAINT ck_ops_feature_flags_expiry CHECK (
    expires_at_utc IS NULL OR expires_at_utc > starts_at_utc
  )
);

CREATE INDEX IF NOT EXISTS ix_ops_feature_flags_lookup
  ON ops.ops_feature_flags (
    flag_name,
    scope_type,
    job_key,
    sport_key,
    starts_at_utc DESC,
    expires_at_utc
  );

CREATE INDEX IF NOT EXISTS ix_ops_feature_flags_active_window
  ON ops.ops_feature_flags (flag_name, starts_at_utc DESC, expires_at_utc);

-- ---------------------------------------------------------------------
-- Runs: uma execução lógica de um job.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ops.ops_job_runs (
  run_id                  BIGSERIAL PRIMARY KEY,

  job_key                 TEXT NOT NULL REFERENCES ops.ops_job_definitions(job_key) ON DELETE RESTRICT,
  trigger_source          TEXT NOT NULL DEFAULT 'manual',
  requested_by            TEXT NULL,

  scope_type              TEXT NOT NULL DEFAULT 'global',
  scope_key               TEXT NOT NULL DEFAULT 'global',
  sport_key               TEXT NULL,

  status                  TEXT NOT NULL DEFAULT 'queued' CHECK (
    status IN ('queued', 'running', 'succeeded', 'failed', 'blocked', 'cancelled')
  ),
  block_reason            TEXT NULL,

  requested_payload_json  JSONB NOT NULL DEFAULT '{}'::jsonb,
  effective_payload_json  JSONB NOT NULL DEFAULT '{}'::jsonb,

  result_json             JSONB NULL,
  counters_json           JSONB NULL,
  error_json              JSONB NULL,

  parent_run_id           BIGINT NULL REFERENCES ops.ops_job_runs(run_id) ON DELETE SET NULL,
  correlation_id          TEXT NULL,
  idempotency_key         TEXT NULL,

  started_at_utc          TIMESTAMPTZ NULL,
  finished_at_utc         TIMESTAMPTZ NULL,
  duration_ms             INT NULL CHECK (duration_ms IS NULL OR duration_ms >= 0),

  created_at_utc          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at_utc          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_ops_job_runs_job_created
  ON ops.ops_job_runs (job_key, created_at_utc DESC);

CREATE INDEX IF NOT EXISTS ix_ops_job_runs_status_updated
  ON ops.ops_job_runs (status, updated_at_utc DESC);

CREATE INDEX IF NOT EXISTS ix_ops_job_runs_scope_created
  ON ops.ops_job_runs (scope_type, scope_key, created_at_utc DESC);

CREATE INDEX IF NOT EXISTS ix_ops_job_runs_sport_created
  ON ops.ops_job_runs (sport_key, created_at_utc DESC);

CREATE INDEX IF NOT EXISTS ix_ops_job_runs_correlation
  ON ops.ops_job_runs (correlation_id)
  WHERE correlation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_ops_job_runs_idempotency
  ON ops.ops_job_runs (job_key, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- ---------------------------------------------------------------------
-- Attempts: tentativa concreta de execução.
-- Nesta fase o executor é inline/backend, mas a tabela já suporta worker.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ops.ops_job_attempts (
  attempt_id              BIGSERIAL PRIMARY KEY,
  run_id                  BIGINT NOT NULL REFERENCES ops.ops_job_runs(run_id) ON DELETE CASCADE,

  attempt_no              INT NOT NULL CHECK (attempt_no >= 1),

  executor_type           TEXT NOT NULL DEFAULT 'inline',
  executor_ref            TEXT NULL,

  status                  TEXT NOT NULL DEFAULT 'running' CHECK (
    status IN ('running', 'succeeded', 'failed', 'cancelled')
  ),

  started_at_utc          TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at_utc         TIMESTAMPTZ NULL,
  duration_ms             INT NULL CHECK (duration_ms IS NULL OR duration_ms >= 0),

  result_json             JSONB NULL,
  counters_json           JSONB NULL,
  error_json              JSONB NULL,

  created_at_utc          TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT ux_ops_job_attempts_run_attempt UNIQUE (run_id, attempt_no)
);

CREATE INDEX IF NOT EXISTS ix_ops_job_attempts_run
  ON ops.ops_job_attempts (run_id, attempt_no);

CREATE INDEX IF NOT EXISTS ix_ops_job_attempts_status_started
  ON ops.ops_job_attempts (status, started_at_utc DESC);

-- ---------------------------------------------------------------------
-- Events: trilha auditável da execução.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ops.ops_job_events (
  event_id                BIGSERIAL PRIMARY KEY,

  run_id                  BIGINT NOT NULL REFERENCES ops.ops_job_runs(run_id) ON DELETE CASCADE,
  attempt_id              BIGINT NULL REFERENCES ops.ops_job_attempts(attempt_id) ON DELETE SET NULL,

  event_type              TEXT NOT NULL,
  event_level             TEXT NOT NULL DEFAULT 'info' CHECK (
    event_level IN ('debug', 'info', 'warn', 'error')
  ),

  message                 TEXT NULL,
  payload_json            JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at_utc          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_ops_job_events_run_created
  ON ops.ops_job_events (run_id, created_at_utc ASC);

CREATE INDEX IF NOT EXISTS ix_ops_job_events_type_created
  ON ops.ops_job_events (event_type, created_at_utc DESC);

-- ---------------------------------------------------------------------
-- Seed das definições conhecidas no backend atual.
-- ---------------------------------------------------------------------
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
) VALUES
(
  'odds_catalog_sync',
  'Odds Catalog Sync',
  'src.ops.jobs.odds_catalog_sync.sync_odds_sport_catalog',
  'Sincroniza o catálogo de esportes/ligas da Odds API.',
  TRUE, TRUE, TRUE, 900, 1, 70,
  '{"all_sports": true}'::jsonb,
  '["catalog","sync"]'::jsonb
),
(
  'odds_league_gap_scan',
  'Odds League Gap Scan',
  'src.ops.jobs.odds_league_gap_scan.odds_league_gap_scan',
  'Varre gaps entre catálogo da Odds API e mapa interno de ligas.',
  TRUE, TRUE, TRUE, 900, 1, 80,
  '{"default_enabled": false}'::jsonb,
  '["catalog","governance"]'::jsonb
),
(
  'odds_league_autoclassify',
  'Odds League Autoclassify',
  'src.ops.jobs.odds_league_autoclassify.odds_league_autoclassify',
  'Autoclassifica mapeamentos pendentes quando houver confiança suficiente.',
  TRUE, TRUE, TRUE, 900, 1, 85,
  '{}'::jsonb,
  '["catalog","autoclassify"]'::jsonb
),
(
  'odds_refresh',
  'Odds Refresh',
  'src.ops.jobs.odds_refresh.odds_refresh',
  'Busca odds do provider e persiste eventos/snapshots de odds.',
  TRUE, TRUE, TRUE, 900, 1, 100,
  '{"regions": "eu"}'::jsonb,
  '["odds","refresh"]'::jsonb
),
(
  'odds_resolve_batch',
  'Odds Resolve Batch',
  'src.ops.jobs.odds_resolve.odds_resolve_batch',
  'Resolve odds_events contra core.fixtures.',
  TRUE, TRUE, TRUE, 900, 1, 110,
  '{"season_policy": "current", "tol_hours": 6, "hours_ahead": 720, "limit": 500}'::jsonb,
  '["odds","resolve"]'::jsonb
),
(
  'snapshots_materialize',
  'Snapshots Materialize',
  'src.ops.jobs.snapshots_materialize.snapshots_materialize',
  'Materializa product.matchup_snapshot_v1 para o app.',
  TRUE, TRUE, TRUE, 1200, 1, 120,
  '{"mode": "window", "hours_ahead": 720, "limit": 500}'::jsonb,
  '["product","snapshots"]'::jsonb
),
(
  'pipeline_run_all',
  'Pipeline Run All',
  'src.ops.jobs.pipeline_run_all.pipeline_run_all',
  'Pipeline leve por ligas approved/enabled: odds refresh, resolve, modelos e snapshots.',
  TRUE, TRUE, TRUE, 1800, 1, 140,
  '{}'::jsonb,
  '["pipeline","odds","snapshots"]'::jsonb
),
(
  'update_pipeline_run',
  'Update Pipeline Run',
  'src.ops.jobs.update_pipeline.update_pipeline_run',
  'Pipeline pesado: fixtures/core, stats, odds, resolve, modelos, snapshots e audit sync.',
  TRUE, TRUE, TRUE, 3600, 1, 150,
  '{}'::jsonb,
  '["pipeline","core","update"]'::jsonb
),
(
  'models_ensure_1x2_v1',
  'Ensure 1x2 Models',
  'src.ops.jobs.models_ensure_1x2_v1.ensure_models_1x2_v1',
  'Garante artifacts 1x2 válidos para ligas approved/enabled.',
  TRUE, TRUE, TRUE, 1800, 1, 160,
  '{"max_seasons": 3, "min_fixtures": 120, "C": 1.0}'::jsonb,
  '["models","1x2"]'::jsonb
),
(
  'audit_sync_from_product_snapshots',
  'Audit Sync From Product Snapshots',
  'src.ops.jobs.audit_sync.audit_sync_from_product_snapshots',
  'Sincroniza predições/resultados de auditoria a partir dos snapshots do produto.',
  TRUE, TRUE, TRUE, 1200, 1, 170,
  '{"lookback_days": 60, "finished_before_hours": 1, "max_prediction_rows": 10000, "max_result_rows": 10000}'::jsonb,
  '["audit","predictions","results"]'::jsonb
),
(
  'oddspapi_run_controlled_enrichment',
  'Oddspapi Controlled Enrichment',
  'src.ops.jobs.oddspapi_enrichment.oddspapi_run_controlled_enrichment',
  'Enriquecimento controlado Oddspapi com orçamento/caps. Mantido desligado inicialmente.',
  FALSE, TRUE, FALSE, 1800, 1, 200,
  '{"window_hours": 72, "max_events": 20, "max_external_requests": 5, "dry_run": true}'::jsonb,
  '["oddspapi","enrichment","paid-provider"]'::jsonb
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

-- ---------------------------------------------------------------------
-- Overrides globais e metadados de cron pretendido.
-- O Cloud Scheduler ainda será criado fora do banco; este campo serve
-- para Admin/observabilidade/contrato.
-- ---------------------------------------------------------------------
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
VALUES
(
  'odds_catalog_sync',
  'global',
  'global',
  NULL,
  NULL,
  70,
  900,
  1,
  '5 3 * * 1',
  'America/Sao_Paulo',
  '{}'::jsonb,
  'semanal; atualiza catálogo de sports/leagues'
),
(
  'odds_league_gap_scan',
  'global',
  'global',
  NULL,
  NULL,
  80,
  900,
  1,
  '15 3 * * 1',
  'America/Sao_Paulo',
  '{}'::jsonb,
  'semanal após catálogo'
),
(
  'odds_league_autoclassify',
  'global',
  'global',
  NULL,
  NULL,
  85,
  900,
  1,
  '30 3 * * 1',
  'America/Sao_Paulo',
  '{}'::jsonb,
  'semanal após gap_scan'
),
(
  'odds_refresh',
  'global',
  'global',
  NULL,
  NULL,
  100,
  900,
  1,
  NULL,
  'America/Sao_Paulo',
  '{}'::jsonb,
  'job unitário; preferir pipeline_run_all no scheduler para refletir snapshots'
),
(
  'odds_resolve_batch',
  'global',
  'global',
  NULL,
  NULL,
  110,
  900,
  1,
  NULL,
  'America/Sao_Paulo',
  '{}'::jsonb,
  'job unitário; normalmente chamado pelo pipeline'
),
(
  'snapshots_materialize',
  'global',
  'global',
  NULL,
  NULL,
  120,
  1200,
  1,
  NULL,
  'America/Sao_Paulo',
  '{}'::jsonb,
  'job unitário; normalmente chamado pelo pipeline'
),
(
  'pipeline_run_all',
  'global',
  'global',
  NULL,
  NULL,
  140,
  1800,
  1,
  '25 */6 * * *',
  'America/Sao_Paulo',
  '{}'::jsonb,
  'a cada 6h; odds novas + resolve + snapshots para ligas approved/enabled'
),
(
  'update_pipeline_run',
  'global',
  'global',
  NULL,
  NULL,
  150,
  3600,
  1,
  '10 4 */2 * *',
  'America/Sao_Paulo',
  '{}'::jsonb,
  'a cada 2 dias; pipeline pesado de core/stats/modelos/snapshots/audit'
),
(
  'models_ensure_1x2_v1',
  'global',
  'global',
  NULL,
  NULL,
  160,
  1800,
  1,
  NULL,
  'America/Sao_Paulo',
  '{}'::jsonb,
  'standalone manual/semanal; update_pipeline já chama internamente'
),
(
  'audit_sync_from_product_snapshots',
  'global',
  'global',
  NULL,
  NULL,
  170,
  1200,
  1,
  '45 5 * * *',
  'America/Sao_Paulo',
  '{}'::jsonb,
  'diário; mantém auditoria atualizada mesmo sem pipeline pesado'
),
(
  'oddspapi_run_controlled_enrichment',
  'global',
  'global',
  NULL,
  FALSE,
  200,
  1800,
  1,
  NULL,
  'America/Sao_Paulo',
  '{}'::jsonb,
  'desligado por padrão; envolve provedor pago/cap mensal'
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