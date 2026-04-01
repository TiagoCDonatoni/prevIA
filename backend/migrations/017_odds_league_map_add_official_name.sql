BEGIN;

ALTER TABLE odds.odds_league_map
  ADD COLUMN IF NOT EXISTS official_name TEXT NULL;

-- Backfill inicial:
-- copia o nome atual do catálogo para não deixar nada vazio.
-- Depois, os casos "estranhos" você corrige uma vez no Admin.
UPDATE odds.odds_league_map m
SET
  official_name = c.sport_title,
  updated_at_utc = now()
FROM odds.odds_sport_catalog c
WHERE c.sport_key = m.sport_key
  AND (m.official_name IS NULL OR btrim(m.official_name) = '');

COMMIT;