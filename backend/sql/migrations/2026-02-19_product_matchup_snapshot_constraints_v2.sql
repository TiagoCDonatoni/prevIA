BEGIN;

-- 0) Garantir schema
CREATE SCHEMA IF NOT EXISTS product;

-- 1) Se existir INDEX com o nome que queremos usar como CONSTRAINT, renomeia
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'product'
      AND c.relname = 'ux_matchup_snapshot_fixture_model'
      AND c.relkind = 'i'
  ) THEN
    EXECUTE 'ALTER INDEX product.ux_matchup_snapshot_fixture_model RENAME TO ix_matchup_snapshot_fixture_model';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'product'
      AND c.relname = 'ux_matchup_snapshot_event_model'
      AND c.relkind = 'i'
  ) THEN
    EXECUTE 'ALTER INDEX product.ux_matchup_snapshot_event_model RENAME TO ix_matchup_snapshot_event_model';
  END IF;
END $$;

-- 2) Criar UNIQUE CONSTRAINTs reais (necessário para ON CONFLICT ON CONSTRAINT)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ux_matchup_snapshot_fixture_model'
      AND conrelid = 'product.matchup_snapshot_v1'::regclass
  ) THEN
    EXECUTE 'ALTER TABLE product.matchup_snapshot_v1
             ADD CONSTRAINT ux_matchup_snapshot_fixture_model
             UNIQUE (fixture_id, model_version)';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ux_matchup_snapshot_event_model'
      AND conrelid = 'product.matchup_snapshot_v1'::regclass
  ) THEN
    EXECUTE 'ALTER TABLE product.matchup_snapshot_v1
             ADD CONSTRAINT ux_matchup_snapshot_event_model
             UNIQUE (event_id, model_version)';
  END IF;
END $$;

COMMIT;