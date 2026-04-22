WITH participants AS (
  -- source of truth estrutural:
  -- todo time que aparece em fixtures da liga/season deve ter linha em team_season_stats
  SELECT DISTINCT
    f.league_id,
    f.season,
    f.home_team_id AS team_id
  FROM core.fixtures f
  WHERE COALESCE(f.is_cancelled, false) = false

  UNION

  SELECT DISTINCT
    f.league_id,
    f.season,
    f.away_team_id AS team_id
  FROM core.fixtures f
  WHERE COALESCE(f.is_cancelled, false) = false
),
finished AS (
  SELECT
    f.league_id,
    f.season,
    f.home_team_id,
    f.away_team_id,
    f.goals_home AS home_goals,
    f.goals_away AS away_goals
  FROM core.fixtures f
  WHERE
    f.is_finished = true
    AND COALESCE(f.is_cancelled, false) = false
    AND f.goals_home IS NOT NULL
    AND f.goals_away IS NOT NULL
),
team_rows AS (
  -- perspectiva do mandante
  SELECT
    league_id,
    season,
    home_team_id AS team_id,
    1 AS played,
    CASE WHEN home_goals > away_goals THEN 1 ELSE 0 END AS wins,
    CASE WHEN home_goals = away_goals THEN 1 ELSE 0 END AS draws,
    CASE WHEN home_goals < away_goals THEN 1 ELSE 0 END AS losses,
    home_goals AS goals_for,
    away_goals AS goals_against,
    1 AS is_home
  FROM finished

  UNION ALL

  -- perspectiva do visitante
  SELECT
    league_id,
    season,
    away_team_id AS team_id,
    1 AS played,
    CASE WHEN away_goals > home_goals THEN 1 ELSE 0 END AS wins,
    CASE WHEN away_goals = home_goals THEN 1 ELSE 0 END AS draws,
    CASE WHEN away_goals < home_goals THEN 1 ELSE 0 END AS losses,
    away_goals AS goals_for,
    home_goals AS goals_against,
    0 AS is_home
  FROM finished
),
agg_finished AS (
  SELECT
    league_id,
    season,
    team_id,

    SUM(played)::INT AS played,
    SUM(wins)::INT AS wins,
    SUM(draws)::INT AS draws,
    SUM(losses)::INT AS losses,

    SUM(goals_for)::INT AS goals_for,
    SUM(goals_against)::INT AS goals_against,
    (SUM(goals_for) - SUM(goals_against))::INT AS goal_diff,

    (SUM(wins) * 3 + SUM(draws))::INT AS points,
    CASE
      WHEN SUM(played) > 0
        THEN ((SUM(wins) * 3 + SUM(draws))::NUMERIC / SUM(played)::NUMERIC)
      ELSE 0::NUMERIC
    END AS points_per_game,

    SUM(CASE WHEN is_home = 1 THEN played ELSE 0 END)::INT AS home_played,
    SUM(CASE WHEN is_home = 1 THEN wins ELSE 0 END)::INT AS home_wins,
    SUM(CASE WHEN is_home = 1 THEN draws ELSE 0 END)::INT AS home_draws,
    SUM(CASE WHEN is_home = 1 THEN losses ELSE 0 END)::INT AS home_losses,
    SUM(CASE WHEN is_home = 1 THEN goals_for ELSE 0 END)::INT AS home_goals_for,
    SUM(CASE WHEN is_home = 1 THEN goals_against ELSE 0 END)::INT AS home_goals_against,
    (
      SUM(CASE WHEN is_home = 1 THEN wins ELSE 0 END) * 3
      + SUM(CASE WHEN is_home = 1 THEN draws ELSE 0 END)
    )::INT AS home_points,

    SUM(CASE WHEN is_home = 0 THEN played ELSE 0 END)::INT AS away_played,
    SUM(CASE WHEN is_home = 0 THEN wins ELSE 0 END)::INT AS away_wins,
    SUM(CASE WHEN is_home = 0 THEN draws ELSE 0 END)::INT AS away_draws,
    SUM(CASE WHEN is_home = 0 THEN losses ELSE 0 END)::INT AS away_losses,
    SUM(CASE WHEN is_home = 0 THEN goals_for ELSE 0 END)::INT AS away_goals_for,
    SUM(CASE WHEN is_home = 0 THEN goals_against ELSE 0 END)::INT AS away_goals_against,
    (
      SUM(CASE WHEN is_home = 0 THEN wins ELSE 0 END) * 3
      + SUM(CASE WHEN is_home = 0 THEN draws ELSE 0 END)
    )::INT AS away_points

  FROM team_rows
  GROUP BY league_id, season, team_id
)
SELECT
  p.league_id,
  p.season,
  p.team_id,

  COALESCE(a.played, 0)::INT AS played,
  COALESCE(a.wins, 0)::INT AS wins,
  COALESCE(a.draws, 0)::INT AS draws,
  COALESCE(a.losses, 0)::INT AS losses,

  COALESCE(a.goals_for, 0)::INT AS goals_for,
  COALESCE(a.goals_against, 0)::INT AS goals_against,
  COALESCE(a.goal_diff, 0)::INT AS goal_diff,

  COALESCE(a.points, 0)::INT AS points,
  COALESCE(a.points_per_game, 0::NUMERIC) AS points_per_game,

  COALESCE(a.home_played, 0)::INT AS home_played,
  COALESCE(a.home_wins, 0)::INT AS home_wins,
  COALESCE(a.home_draws, 0)::INT AS home_draws,
  COALESCE(a.home_losses, 0)::INT AS home_losses,
  COALESCE(a.home_goals_for, 0)::INT AS home_goals_for,
  COALESCE(a.home_goals_against, 0)::INT AS home_goals_against,
  COALESCE(a.home_points, 0)::INT AS home_points,

  COALESCE(a.away_played, 0)::INT AS away_played,
  COALESCE(a.away_wins, 0)::INT AS away_wins,
  COALESCE(a.away_draws, 0)::INT AS away_draws,
  COALESCE(a.away_losses, 0)::INT AS away_losses,
  COALESCE(a.away_goals_for, 0)::INT AS away_goals_for,
  COALESCE(a.away_goals_against, 0)::INT AS away_goals_against,
  COALESCE(a.away_points, 0)::INT AS away_points,

  'team_season_stats_v2'::TEXT AS metric_version,
  now() AS computed_at
FROM participants p
LEFT JOIN agg_finished a
  ON a.league_id = p.league_id
 AND a.season = p.season
 AND a.team_id = p.team_id
ORDER BY p.league_id, p.season, p.team_id