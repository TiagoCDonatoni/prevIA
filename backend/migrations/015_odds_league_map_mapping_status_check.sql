BEGIN;

ALTER TABLE odds.odds_league_map
  DROP CONSTRAINT IF EXISTS odds_league_map_mapping_status_check;

ALTER TABLE odds.odds_league_map
  ADD CONSTRAINT odds_league_map_mapping_status_check
  CHECK (mapping_status IN ('pending','approved','ignored','rejected'));

COMMIT;
