ALTER TABLE odds.odds_events
ADD COLUMN IF NOT EXISTS latest_captured_at_utc timestamptz;

CREATE INDEX IF NOT EXISTS odds_events_latest_captured_idx
ON odds.odds_events (sport_key, latest_captured_at_utc DESC);
