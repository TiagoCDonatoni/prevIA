BEGIN;

-- Tabela de auditoria: snapshot do que o modelo previu quando a odd apareceu
CREATE TABLE IF NOT EXISTS odds.audit_event_predictions (
  audit_id BIGSERIAL PRIMARY KEY,

  -- Identidade do evento de odds (fonte: odds.odds_events)
  event_id TEXT NOT NULL REFERENCES odds.odds_events(event_id) ON DELETE CASCADE,

  -- Contexto do modelo
  artifact_filename TEXT NOT NULL,
  league_id INT NULL,
  season INT NULL,

  -- Identidade resolvida (para casar com fixtures)
  home_team_id INT NULL,
  away_team_id INT NULL,
  kickoff_utc TIMESTAMPTZ NULL,

  -- Odds (último snapshot usado no momento do cálculo)
  bookmaker TEXT NULL,
  market TEXT NULL,
  odds_home NUMERIC NULL,
  odds_draw NUMERIC NULL,
  odds_away NUMERIC NULL,
  captured_at_utc TIMESTAMPTZ NULL,

  -- Probabilidades do modelo (snapshot)
  p_model_h DOUBLE PRECISION NULL,
  p_model_d DOUBLE PRECISION NULL,
  p_model_a DOUBLE PRECISION NULL,

  -- Ligação posterior com o jogo real (quando existir)
  fixture_id INT NULL,
  goals_home INT NULL,
  goals_away INT NULL,
  outcome TEXT NULL, -- 'H' | 'D' | 'A'

  -- Métricas
  brier DOUBLE PRECISION NULL,
  logloss DOUBLE PRECISION NULL,
  top1_acc DOUBLE PRECISION NULL,

  created_at_utc TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at_utc TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Evita duplicar snapshots do mesmo evento+modelo
  UNIQUE(event_id, artifact_filename)
);

CREATE INDEX IF NOT EXISTS ix_audit_event_preds_kickoff
  ON odds.audit_event_predictions (kickoff_utc);

CREATE INDEX IF NOT EXISTS ix_audit_event_preds_fixture
  ON odds.audit_event_predictions (fixture_id);

CREATE INDEX IF NOT EXISTS ix_audit_event_preds_model_ctx
  ON odds.audit_event_predictions (artifact_filename, league_id, season);

COMMIT;
