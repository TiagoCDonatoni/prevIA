BEGIN;

CREATE SCHEMA IF NOT EXISTS odds;

CREATE TABLE IF NOT EXISTS odds.model_predictions_1x2 (
  pred_id BIGSERIAL PRIMARY KEY,

  fixture_id INT NOT NULL,
  league_id INT NOT NULL,
  season INT NOT NULL,
  kickoff_utc TIMESTAMPTZ NULL,

  home_team_id INT NOT NULL,
  away_team_id INT NOT NULL,

  artifact_filename TEXT NOT NULL,

  p_home DOUBLE PRECISION NOT NULL,
  p_draw DOUBLE PRECISION NOT NULL,
  p_away DOUBLE PRECISION NOT NULL,

  predicted_at_utc TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- resultado real (quando existir)
  is_finished BOOLEAN NOT NULL DEFAULT FALSE,
  goals_home INT NULL,
  goals_away INT NULL,
  result_1x2 CHAR(1) NULL, -- 'H' | 'D' | 'A'

  -- métricas (quando existir resultado)
  top1_correct BOOLEAN NULL,
  brier DOUBLE PRECISION NULL,
  logloss DOUBLE PRECISION NULL,

  created_at_utc TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at_utc TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- idempotência: 1 previsão por (fixture, artifact)
CREATE UNIQUE INDEX IF NOT EXISTS ux_model_predictions_1x2_fixture_artifact
  ON odds.model_predictions_1x2 (fixture_id, artifact_filename);

CREATE INDEX IF NOT EXISTS ix_model_predictions_1x2_league_season
  ON odds.model_predictions_1x2 (league_id, season, kickoff_utc);

COMMIT;
