BEGIN;

WITH fixture_seed(
  official_match_no,
  kickoff_utc,
  home_i18n,
  away_i18n
) AS (
  VALUES
    (
      73,
      TIMESTAMPTZ '2026-06-28 19:00:00+00',
      '{"pt":"\u00c1frica do Sul","en":"South Africa","es":"Sud\u00e1frica"}'::jsonb,
      '{"pt":"Canad\u00e1","en":"Canada","es":"Canad\u00e1"}'::jsonb
    ),
    (
      74,
      TIMESTAMPTZ '2026-06-29 17:00:00+00',
      '{"pt":"Brasil","en":"Brazil","es":"Brasil"}'::jsonb,
      '{"pt":"Jap\u00e3o","en":"Japan","es":"Jap\u00f3n"}'::jsonb
    ),
    (
      75,
      TIMESTAMPTZ '2026-06-29 20:30:00+00',
      '{"pt":"Alemanha","en":"Germany","es":"Alemania"}'::jsonb,
      '{"pt":"Paraguai","en":"Paraguay","es":"Paraguay"}'::jsonb
    ),
    (
      76,
      TIMESTAMPTZ '2026-06-30 01:00:00+00',
      '{"pt":"Holanda","en":"Netherlands","es":"Pa\u00edses Bajos"}'::jsonb,
      '{"pt":"Marrocos","en":"Morocco","es":"Marruecos"}'::jsonb
    ),
    (
      77,
      TIMESTAMPTZ '2026-06-30 17:00:00+00',
      '{"pt":"Costa do Marfim","en":"C\u00f4te d\u0027Ivoire","es":"Costa de Marfil"}'::jsonb,
      '{"pt":"Noruega","en":"Norway","es":"Noruega"}'::jsonb
    ),
    (
      78,
      TIMESTAMPTZ '2026-06-30 21:00:00+00',
      '{"pt":"Fran\u00e7a","en":"France","es":"Francia"}'::jsonb,
      '{"pt":"Su\u00e9cia","en":"Sweden","es":"Suecia"}'::jsonb
    ),
    (
      79,
      TIMESTAMPTZ '2026-07-01 01:00:00+00',
      '{"pt":"M\u00e9xico","en":"Mexico","es":"M\u00e9xico"}'::jsonb,
      '{"pt":"Equador","en":"Ecuador","es":"Ecuador"}'::jsonb
    ),
    (
      80,
      TIMESTAMPTZ '2026-07-01 16:00:00+00',
      '{"pt":"Inglaterra","en":"England","es":"Inglaterra"}'::jsonb,
      '{"pt":"Rep\u00fablica Democr\u00e1tica do Congo","en":"Democratic Republic of the Congo","es":"Rep\u00fablica Democr\u00e1tica del Congo"}'::jsonb
    ),
    (
      81,
      TIMESTAMPTZ '2026-07-01 20:00:00+00',
      '{"pt":"B\u00e9lgica","en":"Belgium","es":"B\u00e9lgica"}'::jsonb,
      '{"pt":"Senegal","en":"Senegal","es":"Senegal"}'::jsonb
    ),
    (
      82,
      TIMESTAMPTZ '2026-07-02 00:00:00+00',
      '{"pt":"Estados Unidos","en":"United States","es":"Estados Unidos"}'::jsonb,
      '{"pt":"B\u00f3snia e Herzegovina","en":"Bosnia and Herzegovina","es":"Bosnia y Herzegovina"}'::jsonb
    ),
    (
      83,
      TIMESTAMPTZ '2026-07-02 19:00:00+00',
      '{"pt":"Espanha","en":"Spain","es":"Espa\u00f1a"}'::jsonb,
      '{"pt":"2\u00ba colocado do Grupo J","en":"Group J runner-up","es":"2\u00ba del Grupo J"}'::jsonb
    ),
    (
      84,
      TIMESTAMPTZ '2026-07-02 23:00:00+00',
      '{"pt":"Portugal","en":"Portugal","es":"Portugal"}'::jsonb,
      '{"pt":"Cro\u00e1cia","en":"Croatia","es":"Croacia"}'::jsonb
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
  updated_at_utc = NOW()
FROM fixture_seed AS s
WHERE m.competition_key = 'fifa_world_cup_2026'
  AND m.official_match_no = s.official_match_no;

COMMIT;