BEGIN;

WITH fixture_seed(
  official_match_no,
  kickoff_utc,
  home_i18n,
  away_i18n
) AS (
  VALUES
    (
      83,
      TIMESTAMPTZ '2026-07-02 19:00:00+00',
      '{"pt":"Espanha","en":"Spain","es":"España"}'::jsonb,
      '{"pt":"Áustria","en":"Austria","es":"Austria"}'::jsonb
    ),
    (
      85,
      TIMESTAMPTZ '2026-07-03 03:00:00+00',
      '{"pt":"Suíça","en":"Switzerland","es":"Suiza"}'::jsonb,
      '{"pt":"Argélia","en":"Algeria","es":"Argelia"}'::jsonb
    ),
    (
      86,
      TIMESTAMPTZ '2026-07-03 18:00:00+00',
      '{"pt":"Austrália","en":"Australia","es":"Australia"}'::jsonb,
      '{"pt":"Egito","en":"Egypt","es":"Egipto"}'::jsonb
    ),
    (
      87,
      TIMESTAMPTZ '2026-07-03 22:00:00+00',
      '{"pt":"Argentina","en":"Argentina","es":"Argentina"}'::jsonb,
      '{"pt":"Cabo Verde","en":"Cape Verde","es":"Cabo Verde"}'::jsonb
    ),
    (
      88,
      TIMESTAMPTZ '2026-07-04 01:30:00+00',
      '{"pt":"Colômbia","en":"Colombia","es":"Colombia"}'::jsonb,
      '{"pt":"Gana","en":"Ghana","es":"Ghana"}'::jsonb
    )
)
UPDATE worldcup_pool.matches AS m
SET
  phase = 'round_of_32',
  home_label_i18n = s.home_i18n,
  away_label_i18n = s.away_i18n,
  home_team_i18n = s.home_i18n,
  away_team_i18n = s.away_i18n,
  kickoff_utc = s.kickoff_utc,
  lock_at_utc = s.kickoff_utc - INTERVAL '1 hour',
  status = CASE
    WHEN m.status IN ('placeholder', 'scheduled') THEN 'scheduled'
    ELSE m.status
  END,
  api_provider = NULL,
  api_fixture_id = NULL,
  api_home_team_id = NULL,
  api_away_team_id = NULL,
  api_status_short = NULL,
  api_status_long = NULL,
  api_status_elapsed = NULL,
  api_round = NULL,
  api_venue_name = NULL,
  api_venue_city = NULL,
  api_mapping_status = NULL,
  api_mapping_note = NULL,
  api_raw_snapshot = NULL,
  api_last_synced_at_utc = NULL,
  updated_at_utc = NOW()
FROM fixture_seed AS s
WHERE m.competition_key = 'fifa_world_cup_2026'
  AND m.official_match_no = s.official_match_no;

COMMIT;