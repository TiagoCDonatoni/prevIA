BEGIN;

WITH match_seed(
  official_match_no,
  phase,
  home_pt,
  home_en,
  home_es,
  away_pt,
  away_en,
  away_es
) AS (
  VALUES
    (73, 'round_of_32', 'Segundo do Grupo A', 'Group A runner-up', 'Segundo del Grupo A', 'Segundo do Grupo B', 'Group B runner-up', 'Segundo del Grupo B'),
    (74, 'round_of_32', 'Vencedor do Grupo E', 'Group E winner', 'Ganador del Grupo E', 'Melhor terceiro dos grupos A/B/C/D/F', 'Best 3rd place from groups A/B/C/D/F', 'Mejor tercero de los grupos A/B/C/D/F'),
    (75, 'round_of_32', 'Vencedor do Grupo F', 'Group F winner', 'Ganador del Grupo F', 'Segundo do Grupo C', 'Group C runner-up', 'Segundo del Grupo C'),
    (76, 'round_of_32', 'Vencedor do Grupo C', 'Group C winner', 'Ganador del Grupo C', 'Segundo do Grupo F', 'Group F runner-up', 'Segundo del Grupo F'),
    (77, 'round_of_32', 'Vencedor do Grupo I', 'Group I winner', 'Ganador del Grupo I', 'Melhor terceiro dos grupos C/D/F/G/H', 'Best 3rd place from groups C/D/F/G/H', 'Mejor tercero de los grupos C/D/F/G/H'),
    (78, 'round_of_32', 'Segundo do Grupo E', 'Group E runner-up', 'Segundo del Grupo E', 'Segundo do Grupo I', 'Group I runner-up', 'Segundo del Grupo I'),
    (79, 'round_of_32', 'Vencedor do Grupo A', 'Group A winner', 'Ganador del Grupo A', 'Melhor terceiro dos grupos C/E/F/H/I', 'Best 3rd place from groups C/E/F/H/I', 'Mejor tercero de los grupos C/E/F/H/I'),
    (80, 'round_of_32', 'Vencedor do Grupo L', 'Group L winner', 'Ganador del Grupo L', 'Melhor terceiro dos grupos E/H/I/J/K', 'Best 3rd place from groups E/H/I/J/K', 'Mejor tercero de los grupos E/H/I/J/K'),
    (81, 'round_of_32', 'Vencedor do Grupo D', 'Group D winner', 'Ganador del Grupo D', 'Melhor terceiro dos grupos B/E/F/I/J', 'Best 3rd place from groups B/E/F/I/J', 'Mejor tercero de los grupos B/E/F/I/J'),
    (82, 'round_of_32', 'Vencedor do Grupo G', 'Group G winner', 'Ganador del Grupo G', 'Melhor terceiro dos grupos A/E/H/I/J', 'Best 3rd place from groups A/E/H/I/J', 'Mejor tercero de los grupos A/E/H/I/J'),
    (83, 'round_of_32', 'Segundo do Grupo K', 'Group K runner-up', 'Segundo del Grupo K', 'Segundo do Grupo L', 'Group L runner-up', 'Segundo del Grupo L'),
    (84, 'round_of_32', 'Vencedor do Grupo H', 'Group H winner', 'Ganador del Grupo H', 'Segundo do Grupo J', 'Group J runner-up', 'Segundo del Grupo J'),
    (85, 'round_of_32', 'Vencedor do Grupo B', 'Group B winner', 'Ganador del Grupo B', 'Melhor terceiro dos grupos E/F/G/I/J', 'Best 3rd place from groups E/F/G/I/J', 'Mejor tercero de los grupos E/F/G/I/J'),
    (86, 'round_of_32', 'Vencedor do Grupo J', 'Group J winner', 'Ganador del Grupo J', 'Segundo do Grupo H', 'Group H runner-up', 'Segundo del Grupo H'),
    (87, 'round_of_32', 'Vencedor do Grupo K', 'Group K winner', 'Ganador del Grupo K', 'Melhor terceiro dos grupos D/E/I/J/L', 'Best 3rd place from groups D/E/I/J/L', 'Mejor tercero de los grupos D/E/I/J/L'),
    (88, 'round_of_32', 'Segundo do Grupo D', 'Group D runner-up', 'Segundo del Grupo D', 'Segundo do Grupo G', 'Group G runner-up', 'Segundo del Grupo G'),

    (89, 'round_of_16', 'Vencedor do Jogo 74', 'Winner of Match 74', 'Ganador del Partido 74', 'Vencedor do Jogo 77', 'Winner of Match 77', 'Ganador del Partido 77'),
    (90, 'round_of_16', 'Vencedor do Jogo 73', 'Winner of Match 73', 'Ganador del Partido 73', 'Vencedor do Jogo 75', 'Winner of Match 75', 'Ganador del Partido 75'),
    (91, 'round_of_16', 'Vencedor do Jogo 76', 'Winner of Match 76', 'Ganador del Partido 76', 'Vencedor do Jogo 78', 'Winner of Match 78', 'Ganador del Partido 78'),
    (92, 'round_of_16', 'Vencedor do Jogo 79', 'Winner of Match 79', 'Ganador del Partido 79', 'Vencedor do Jogo 80', 'Winner of Match 80', 'Ganador del Partido 80'),
    (93, 'round_of_16', 'Vencedor do Jogo 83', 'Winner of Match 83', 'Ganador del Partido 83', 'Vencedor do Jogo 84', 'Winner of Match 84', 'Ganador del Partido 84'),
    (94, 'round_of_16', 'Vencedor do Jogo 81', 'Winner of Match 81', 'Ganador del Partido 81', 'Vencedor do Jogo 82', 'Winner of Match 82', 'Ganador del Partido 82'),
    (95, 'round_of_16', 'Vencedor do Jogo 86', 'Winner of Match 86', 'Ganador del Partido 86', 'Vencedor do Jogo 88', 'Winner of Match 88', 'Ganador del Partido 88'),
    (96, 'round_of_16', 'Vencedor do Jogo 85', 'Winner of Match 85', 'Ganador del Partido 85', 'Vencedor do Jogo 87', 'Winner of Match 87', 'Ganador del Partido 87'),

    (97, 'quarter_final', 'Vencedor do Jogo 89', 'Winner of Match 89', 'Ganador del Partido 89', 'Vencedor do Jogo 90', 'Winner of Match 90', 'Ganador del Partido 90'),
    (98, 'quarter_final', 'Vencedor do Jogo 93', 'Winner of Match 93', 'Ganador del Partido 93', 'Vencedor do Jogo 94', 'Winner of Match 94', 'Ganador del Partido 94'),
    (99, 'quarter_final', 'Vencedor do Jogo 91', 'Winner of Match 91', 'Ganador del Partido 91', 'Vencedor do Jogo 92', 'Winner of Match 92', 'Ganador del Partido 92'),
    (100, 'quarter_final', 'Vencedor do Jogo 95', 'Winner of Match 95', 'Ganador del Partido 95', 'Vencedor do Jogo 96', 'Winner of Match 96', 'Ganador del Partido 96'),

    (101, 'semi_final', 'Vencedor do Jogo 97', 'Winner of Match 97', 'Ganador del Partido 97', 'Vencedor do Jogo 98', 'Winner of Match 98', 'Ganador del Partido 98'),
    (102, 'semi_final', 'Vencedor do Jogo 99', 'Winner of Match 99', 'Ganador del Partido 99', 'Vencedor do Jogo 100', 'Winner of Match 100', 'Ganador del Partido 100'),

    (103, 'third_place', 'Perdedor do Jogo 101', 'Loser of Match 101', 'Perdedor del Partido 101', 'Perdedor do Jogo 102', 'Loser of Match 102', 'Perdedor del Partido 102'),
    (104, 'final', 'Vencedor do Jogo 101', 'Winner of Match 101', 'Ganador del Partido 101', 'Vencedor do Jogo 102', 'Winner of Match 102', 'Ganador del Partido 102')
),
prepared_seed AS (
  SELECT
    'fifa_world_cup_2026'::text AS competition_key,
    format('fifa_world_cup_2026_knockout_match_%s', official_match_no)::text AS match_key,
    official_match_no::int,
    official_match_no::int AS display_order,
    phase::text,
    NULL::text AS group_code,
    format('Jogo %s', official_match_no)::text AS bracket_label,
    jsonb_build_object('pt', home_pt, 'en', home_en, 'es', home_es) AS home_label_i18n,
    jsonb_build_object('pt', away_pt, 'en', away_en, 'es', away_es) AS away_label_i18n
  FROM match_seed
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
FROM prepared_seed
ON CONFLICT (match_key)
DO UPDATE SET
  official_match_no = EXCLUDED.official_match_no,
  display_order = EXCLUDED.display_order,
  phase = EXCLUDED.phase,
  group_code = EXCLUDED.group_code,
  bracket_label = EXCLUDED.bracket_label,
  home_label_i18n = EXCLUDED.home_label_i18n,
  away_label_i18n = EXCLUDED.away_label_i18n,
  status = CASE
    WHEN m.status = 'placeholder' THEN EXCLUDED.status
    ELSE m.status
  END,
  updated_at_utc = NOW();

COMMIT;
