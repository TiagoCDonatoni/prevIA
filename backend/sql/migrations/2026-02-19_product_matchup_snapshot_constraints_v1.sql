BEGIN;

-- 1) Garantir schema/tabela existe (caso rode fora de ordem)
CREATE SCHEMA IF NOT EXISTS product;

-- 2) Criar constraints únicas reais (o ON CONFLICT ON CONSTRAINT exige isso)
--    Observação: UNIQUE permite múltiplos NULLs em Postgres (ok para fixture_id/event_id).
ALTER TABLE product.matchup_snapshot_v1
  ADD CONSTRAINT ux_matchup_snapshot_fixture_model
  UNIQUE (fixture_id, model_version);

ALTER TABLE product.matchup_snapshot_v1
  ADD CONSTRAINT ux_matchup_snapshot_event_model
  UNIQUE (event_id, model_version);

COMMIT;