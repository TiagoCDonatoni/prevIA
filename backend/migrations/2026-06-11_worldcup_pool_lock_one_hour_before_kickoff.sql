BEGIN;

UPDATE worldcup_pool.matches
SET
  lock_at_utc = kickoff_utc - INTERVAL '1 hour',
  updated_at_utc = NOW()
WHERE competition_key = 'fifa_world_cup_2026'
  AND kickoff_utc IS NOT NULL
  AND status NOT IN ('finished', 'cancelled')
  AND (
    lock_at_utc IS NULL
    OR lock_at_utc = kickoff_utc
    OR lock_at_utc > kickoff_utc - INTERVAL '1 hour'
  );

COMMIT;