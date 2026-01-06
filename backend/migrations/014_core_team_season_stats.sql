BEGIN;

CREATE TABLE IF NOT EXISTS core.team_season_stats (
  league_id        INT NOT NULL,
  season           INT NOT NULL,
  team_id          INT NOT NULL,

  played           INT NOT NULL,
  wins             INT NOT NULL,
  draws            INT NOT NULL,
  losses           INT NOT NULL,

  goals_for        INT NOT NULL,
  goals_against    INT NOT NULL,
  goal_diff        INT NOT NULL,

  points           INT NOT NULL,
  points_per_game  NUMERIC(8,4) NOT NULL,

  home_played        INT NOT NULL,
  home_wins          INT NOT NULL,
  home_draws         INT NOT NULL,
  home_losses        INT NOT NULL,
  home_goals_for     INT NOT NULL,
  home_goals_against INT NOT NULL,
  home_points        INT NOT NULL,

  away_played        INT NOT NULL,
  away_wins          INT NOT NULL,
  away_draws         INT NOT NULL,
  away_losses        INT NOT NULL,
  away_goals_for     INT NOT NULL,
  away_goals_against INT NOT NULL,
  away_points        INT NOT NULL,

  metric_version   TEXT NOT NULL DEFAULT 'team_season_stats_v1',
  computed_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT team_season_stats_pk PRIMARY KEY (league_id, season, team_id),

  CONSTRAINT team_season_stats_played_ck CHECK (played = wins + draws + losses),
  CONSTRAINT team_season_stats_goal_diff_ck CHECK (goal_diff = goals_for - goals_against),
  CONSTRAINT team_season_stats_points_ck CHECK (points = wins * 3 + draws),

  CONSTRAINT team_season_stats_home_played_ck CHECK (home_played = home_wins + home_draws + home_losses),
  CONSTRAINT team_season_stats_away_played_ck CHECK (away_played = away_wins + away_draws + away_losses),
  CONSTRAINT team_season_stats_home_points_ck CHECK (home_points = home_wins * 3 + home_draws),
  CONSTRAINT team_season_stats_away_points_ck CHECK (away_points = away_wins * 3 + away_draws)
);

CREATE INDEX IF NOT EXISTS team_season_stats_team_idx
  ON core.team_season_stats (team_id, season);

CREATE INDEX IF NOT EXISTS team_season_stats_league_season_idx
  ON core.team_season_stats (league_id, season);

COMMIT;
