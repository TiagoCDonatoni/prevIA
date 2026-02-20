BEGIN;

-- remover indexes se existirem (opcional, mas recomendado)
DROP INDEX IF EXISTS product.ux_matchup_snapshot_fixture_model;
DROP INDEX IF EXISTS product.ux_matchup_snapshot_event_model;

-- criar constraints únicas reais
ALTER TABLE product.matchup_snapshot_v1
  ADD CONSTRAINT ux_matchup_snapshot_fixture_model
  UNIQUE (fixture_id, model_version);

ALTER TABLE product.matchup_snapshot_v1
  ADD CONSTRAINT ux_matchup_snapshot_event_model
  UNIQUE (event_id, model_version);

COMMIT;