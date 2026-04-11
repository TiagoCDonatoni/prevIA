BEGIN;

CREATE TABLE IF NOT EXISTS odds.audit_result (
  event_id TEXT PRIMARY KEY REFERENCES odds.odds_events(event_id) ON DELETE CASCADE,

  fixture_id INT NULL,
  league_id INT NULL,
  season INT NULL,
  kickoff_utc TIMESTAMPTZ NULL,

  result_1x2 CHAR(1) NOT NULL,
  home_goals INT NULL,
  away_goals INT NULL,

  finished_at_utc TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at_utc TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at_utc TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_odds_audit_result_fixture
  ON odds.audit_result (fixture_id);

CREATE INDEX IF NOT EXISTS ix_odds_audit_result_kickoff
  ON odds.audit_result (kickoff_utc DESC);

COMMIT;