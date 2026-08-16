BEGIN;

WITH fixture_seed(
  official_match_no,
  bracket_label,
  kickoff_utc,
  venue_name,
  venue_city,
  home_i18n,
  away_i18n
) AS (
  VALUES
    (
      97,
      'Quartas 1',
      TIMESTAMPTZ '2026-07-09 20:00:00+00',
      'Boston Stadium',
      'Boston',
      '{"pt":"França","en":"France","es":"Francia"}'::jsonb,
      '{"pt":"Marrocos","en":"Morocco","es":"Marruecos"}'::jsonb
    ),
    (
      98,
      'Quartas 2',
      TIMESTAMPTZ '2026-07-10 19:00:00+00',
      'Los Angeles Stadium',
      'Los Angeles',
      '{"pt":"Espanha","en":"Spain","es":"España"}'::jsonb,
      '{"pt":"Bélgica","en":"Belgium","es":"Bélgica"}'::jsonb
    ),
    (
      99,
      'Quartas 3',
      TIMESTAMPTZ '2026-07-11 21:00:00+00',
      'Miami Stadium',
      'Miami',
      '{"pt":"Noruega","en":"Norway","es":"Noruega"}'::jsonb,
      '{"pt":"Inglaterra","en":"England","es":"Inglaterra"}'::jsonb
    ),
    (
      100,
      'Quartas 4',
      TIMESTAMPTZ '2026-07-12 01:00:00+00',
      'Kansas City Stadium',
      'Kansas City',
      '{"pt":"Argentina","en":"Argentina","es":"Argentina"}'::jsonb,
      '{"pt":"Suíça","en":"Switzerland","es":"Suiza"}'::jsonb
    )
)
UPDATE worldcup_pool.matches AS m
SET
  phase = 'quarter_final',
  display_order = s.official_match_no,
  bracket_label = s.bracket_label,
  home_label_i18n = s.home_i18n,
  away_label_i18n = s.away_i18n,
  home_team_i18n = s.home_i18n,
  away_team_i18n = s.away_i18n,
  kickoff_utc = s.kickoff_utc,
  lock_at_utc = s.kickoff_utc - INTERVAL '1 hour',
  status = CASE
    WHEN m.status IN ('placeholder', 'scheduled', 'postponed') THEN 'scheduled'
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
  api_venue_name = s.venue_name,
  api_venue_city = s.venue_city,
  api_mapping_status = 'manual_placeholder',
  api_mapping_note = 'Quarter-final fixture confirmed manually before API sync.',
  api_raw_snapshot = NULL,
  api_last_synced_at_utc = NULL,
  updated_at_utc = NOW()
FROM fixture_seed AS s
WHERE m.competition_key = 'fifa_world_cup_2026'
  AND m.official_match_no = s.official_match_no;

COMMIT;