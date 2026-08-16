BEGIN;

WITH fixture_seed(
  official_match_no,
  bracket_label,
  phase,
  kickoff_utc,
  venue_name,
  venue_city,
  home_i18n,
  away_i18n
) AS (
  VALUES
    (
      103,
      'Disputa de 3º lugar',
      'third_place',
      TIMESTAMPTZ '2026-07-18 21:00:00+00',
      'Miami Stadium',
      'Miami',
      '{"pt":"França","en":"France","es":"Francia"}'::jsonb,
      '{"pt":"Inglaterra","en":"England","es":"Inglaterra"}'::jsonb
    ),
    (
      104,
      'Final',
      'final',
      TIMESTAMPTZ '2026-07-19 19:00:00+00',
      'New York New Jersey Stadium',
      'New Jersey',
      '{"pt":"Espanha","en":"Spain","es":"España"}'::jsonb,
      '{"pt":"Argentina","en":"Argentina","es":"Argentina"}'::jsonb
    )
)
UPDATE worldcup_pool.matches AS m
SET
  phase = s.phase,
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
  api_mapping_note = 'Final-stage fixture confirmed manually before API sync.',
  api_raw_snapshot = NULL,
  api_last_synced_at_utc = NULL,
  updated_at_utc = NOW()
FROM fixture_seed AS s
WHERE m.competition_key = 'fifa_world_cup_2026'
  AND m.official_match_no = s.official_match_no;

COMMIT;