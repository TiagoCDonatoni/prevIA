BEGIN;

ALTER TABLE odds.odds_league_map
  ADD COLUMN IF NOT EXISTS official_country_name TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_odds_league_map_official_country_name
  ON odds.odds_league_map (official_country_name);

COMMIT;