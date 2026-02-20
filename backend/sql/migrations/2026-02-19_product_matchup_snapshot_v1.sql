BEGIN;

CREATE SCHEMA IF NOT EXISTS product;

CREATE TABLE IF NOT EXISTS product.matchup_snapshot_v1 (
  snapshot_id           BIGSERIAL PRIMARY KEY,

  -- chave “canônica” quando houver resolução
  fixture_id            INT NULL,

  -- fallback enquanto não resolvido
  event_id              TEXT NULL,

  sport_key             TEXT NOT NULL,
  kickoff_utc           TIMESTAMPTZ NULL,

  home_name             TEXT NULL,
  away_name             TEXT NULL,

  source_captured_at_utc TIMESTAMPTZ NULL,   -- timestamp do snapshot de odds usado como fonte
  model_version         TEXT NOT NULL DEFAULT 'model_v0',
  payload               JSONB NOT NULL,

  generated_at_utc      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at_utc        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 1) unique por fixture quando existir
CREATE UNIQUE INDEX IF NOT EXISTS ux_matchup_snapshot_fixture_model
  ON product.matchup_snapshot_v1 (fixture_id, model_version)
  WHERE fixture_id IS NOT NULL;

-- 2) unique por event quando fixture ainda não existir
CREATE UNIQUE INDEX IF NOT EXISTS ux_matchup_snapshot_event_model
  ON product.matchup_snapshot_v1 (event_id, model_version)
  WHERE fixture_id IS NULL AND event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_matchup_snapshot_sport_kickoff
  ON product.matchup_snapshot_v1 (sport_key, kickoff_utc);

COMMIT;