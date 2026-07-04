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
      89,
      'Oitavas 1',
      TIMESTAMPTZ '2026-07-04 21:00:00+00',
      'Philadelphia Stadium',
      'Filadélfia',
      '{"pt":"Paraguai","en":"Paraguay","es":"Paraguay"}'::jsonb,
      '{"pt":"França","en":"France","es":"Francia"}'::jsonb
    ),
    (
      90,
      'Oitavas 2',
      TIMESTAMPTZ '2026-07-04 17:00:00+00',
      'Houston Stadium',
      'Houston',
      '{"pt":"Canadá","en":"Canada","es":"Canadá"}'::jsonb,
      '{"pt":"Marrocos","en":"Morocco","es":"Marruecos"}'::jsonb
    ),
    (
      91,
      'Oitavas 5',
      TIMESTAMPTZ '2026-07-05 20:00:00+00',
      'New York New Jersey Stadium',
      'Nova Jersey',
      '{"pt":"Brasil","en":"Brazil","es":"Brasil"}'::jsonb,
      '{"pt":"Noruega","en":"Norway","es":"Noruega"}'::jsonb
    ),
    (
      92,
      'Oitavas 6',
      TIMESTAMPTZ '2026-07-06 00:00:00+00',
      'Mexico City Stadium',
      'Cidade do México',
      '{"pt":"México","en":"Mexico","es":"México"}'::jsonb,
      '{"pt":"Inglaterra","en":"England","es":"Inglaterra"}'::jsonb
    ),
    (
      93,
      'Oitavas 3',
      TIMESTAMPTZ '2026-07-06 19:00:00+00',
      'Dallas Stadium',
      'Dallas',
      '{"pt":"Portugal","en":"Portugal","es":"Portugal"}'::jsonb,
      '{"pt":"Espanha","en":"Spain","es":"España"}'::jsonb
    ),
    (
      94,
      'Oitavas 4',
      TIMESTAMPTZ '2026-07-07 00:00:00+00',
      'Seattle Stadium',
      'Seattle',
      '{"pt":"Estados Unidos","en":"United States","es":"Estados Unidos"}'::jsonb,
      '{"pt":"Bélgica","en":"Belgium","es":"Bélgica"}'::jsonb
    )
)
UPDATE worldcup_pool.matches AS m
SET
  phase = 'round_of_16',
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
  api_mapping_note = 'Round of 16 fixture confirmed manually before API sync.',
  api_raw_snapshot = NULL,
  api_last_synced_at_utc = NULL,
  updated_at_utc = NOW()
FROM fixture_seed AS s
WHERE m.competition_key = 'fifa_world_cup_2026'
  AND m.official_match_no = s.official_match_no;

COMMIT;