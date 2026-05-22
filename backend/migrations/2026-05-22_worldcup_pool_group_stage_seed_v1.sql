WITH group_seed(group_code, group_order) AS (
  VALUES
    ('A', 1),
    ('B', 2),
    ('C', 3),
    ('D', 4),
    ('E', 5),
    ('F', 6),
    ('G', 7),
    ('H', 8),
    ('I', 9),
    ('J', 10),
    ('K', 11),
    ('L', 12)
),
pairing_seed(pair_order, home_slot, away_slot) AS (
  VALUES
    (1, 1, 2),
    (2, 3, 4),
    (3, 1, 3),
    (4, 2, 4),
    (5, 4, 1),
    (6, 2, 3)
),
match_seed AS (
  SELECT
    'fifa_world_cup_2026'::text AS competition_key,
    format(
      'fifa_world_cup_2026_group_%s_match_%s',
      lower(g.group_code),
      p.pair_order
    ) AS match_key,
    ((g.group_order - 1) * 6 + p.pair_order)::int AS official_match_no,
    ((g.group_order - 1) * 6 + p.pair_order)::int AS display_order,
    'group'::text AS phase,
    g.group_code,
    NULL::text AS bracket_label,
    jsonb_build_object(
      'pt', format('Grupo %s - Time %s%s', g.group_code, g.group_code, p.home_slot),
      'en', format('Group %s - Team %s%s', g.group_code, g.group_code, p.home_slot),
      'es', format('Grupo %s - Equipo %s%s', g.group_code, g.group_code, p.home_slot)
    ) AS home_label_i18n,
    jsonb_build_object(
      'pt', format('Grupo %s - Time %s%s', g.group_code, g.group_code, p.away_slot),
      'en', format('Group %s - Team %s%s', g.group_code, g.group_code, p.away_slot),
      'es', format('Grupo %s - Equipo %s%s', g.group_code, g.group_code, p.away_slot)
    ) AS away_label_i18n
  FROM group_seed g
  CROSS JOIN pairing_seed p
)
INSERT INTO worldcup_pool.matches AS m (
  competition_key,
  match_key,
  official_match_no,
  display_order,
  phase,
  group_code,
  bracket_label,
  home_label_i18n,
  away_label_i18n,
  home_team_i18n,
  away_team_i18n,
  kickoff_utc,
  lock_at_utc,
  status,
  updated_at_utc
)
SELECT
  competition_key,
  match_key,
  official_match_no,
  display_order,
  phase,
  group_code,
  bracket_label,
  home_label_i18n,
  away_label_i18n,
  NULL,
  NULL,
  NULL,
  NULL,
  'placeholder',
  NOW()
FROM match_seed
ON CONFLICT (match_key)
DO UPDATE SET
  official_match_no = COALESCE(m.official_match_no, EXCLUDED.official_match_no),
  display_order = EXCLUDED.display_order,
  phase = EXCLUDED.phase,
  group_code = EXCLUDED.group_code,
  bracket_label = EXCLUDED.bracket_label,
  home_label_i18n = CASE
    WHEN m.status = 'placeholder' AND m.home_team_i18n IS NULL
      THEN EXCLUDED.home_label_i18n
    ELSE m.home_label_i18n
  END,
  away_label_i18n = CASE
    WHEN m.status = 'placeholder' AND m.away_team_i18n IS NULL
      THEN EXCLUDED.away_label_i18n
    ELSE m.away_label_i18n
  END,
  updated_at_utc = NOW();