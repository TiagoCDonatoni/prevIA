BEGIN;

CREATE SCHEMA IF NOT EXISTS odds;

-- 1) Evento como o provider anunciou (fonte da verdade)
CREATE TABLE IF NOT EXISTS odds.odds_events (
  event_id TEXT PRIMARY KEY,
  sport_key TEXT NOT NULL,
  commence_time_utc TIMESTAMPTZ NULL,
  home_name TEXT NOT NULL,
  away_name TEXT NOT NULL,

  resolved_home_team_id INT NULL,
  resolved_away_team_id INT NULL,
  resolved_fixture_id INT NULL,

  match_confidence TEXT NULL, -- EXACT | ILIKE | NONE
  created_at_utc TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at_utc TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2) Snapshot 1x2 (h2h) por bookmaker / timestamp
CREATE TABLE IF NOT EXISTS odds.odds_snapshots_1x2 (
  snapshot_id BIGSERIAL PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES odds.odds_events(event_id) ON DELETE CASCADE,

  bookmaker TEXT NULL,
  market TEXT NOT NULL DEFAULT 'h2h',

  odds_home NUMERIC NULL,
  odds_draw NUMERIC NULL,
  odds_away NUMERIC NULL,

  captured_at_utc TIMESTAMPTZ NOT NULL,
  created_at_utc TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices mínimos para consulta/diagnóstico
CREATE INDEX IF NOT EXISTS ix_odds_events_sport_time
  ON odds.odds_events (sport_key, commence_time_utc);

CREATE INDEX IF NOT EXISTS ix_odds_snapshots_event_time
  ON odds.odds_snapshots_1x2 (event_id, captured_at_utc DESC);

COMMIT;
