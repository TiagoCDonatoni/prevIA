BEGIN;

ALTER TABLE odds.odds_league_map
  ADD COLUMN IF NOT EXISTS artifact_filename TEXT NULL;

-- opcional (mas útil): quando definir artifact, saber de onde veio
ALTER TABLE odds.odds_league_map
  ADD COLUMN IF NOT EXISTS model_version TEXT NULL;

COMMIT;