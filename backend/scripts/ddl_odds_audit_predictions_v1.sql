BEGIN;

-- 3) Auditoria: o que tínhamos (odds + prob do modelo) no momento do snapshot
CREATE TABLE IF NOT EXISTS odds.audit_predictions (
  audit_id BIGSERIAL PRIMARY KEY,

  event_id TEXT NOT NULL REFERENCES odds.odds_events(event_id) ON DELETE CASCADE,

  -- metadados do provider + tempo
  sport_key TEXT NOT NULL,
  kickoff_utc TIMESTAMPTZ NULL,        -- normalmente odds_events.commence_time_utc
  captured_at_utc TIMESTAMPTZ NULL,    -- snapshot que originou o cálculo
  bookmaker TEXT NULL,
  market TEXT NULL,

  -- identidade (para linkar com core depois)
  league_id INT NULL,
  season INT NULL,
  fixture_id INT NULL,
  home_team_id INT NULL,
  away_team_id INT NULL,
  match_confidence TEXT NULL,          -- EXACT | ILIKE | NONE

  -- qual modelo gerou isso
  artifact_filename TEXT NOT NULL,

  -- odds
  odds_h NUMERIC NULL,
  odds_d NUMERIC NULL,
  odds_a NUMERIC NULL,

  -- probabilidades (mercado no-vig)
  p_mkt_h NUMERIC NULL,
  p_mkt_d NUMERIC NULL,
  p_mkt_a NUMERIC NULL,

  -- probabilidades do modelo
  p_model_h NUMERIC NULL,
  p_model_d NUMERIC NULL,
  p_model_a NUMERIC NULL,

  -- diagnóstico (qual foi a “melhor”)
  best_side TEXT NULL,                 -- H | D | A
  best_ev NUMERIC NULL,                -- EV decimal

  status TEXT NOT NULL DEFAULT 'ok',   -- ok | incomplete
  reason TEXT NULL,

  created_at_utc TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at_utc TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- idempotência: 1 linha por (event_id, artifact) = o "estado mais atual"
  CONSTRAINT uq_odds_audit_event_artifact UNIQUE (event_id, artifact_filename)
);

CREATE INDEX IF NOT EXISTS ix_odds_audit_kickoff
  ON odds.audit_predictions (kickoff_utc);

CREATE INDEX IF NOT EXISTS ix_odds_audit_fixture
  ON odds.audit_predictions (fixture_id);

CREATE INDEX IF NOT EXISTS ix_odds_audit_created
  ON odds.audit_predictions (created_at_utc DESC);

COMMIT;
