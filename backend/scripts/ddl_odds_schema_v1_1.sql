BEGIN;

ALTER TABLE odds.odds_events
  ADD COLUMN IF NOT EXISTS match_status TEXT NULL;

ALTER TABLE odds.odds_events
  ADD COLUMN IF NOT EXISTS match_score NUMERIC NULL;

COMMIT;
