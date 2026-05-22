CREATE INDEX IF NOT EXISTS idx_worldcup_matches_competition_display
  ON worldcup_pool.matches(competition_key, display_order, id);

CREATE INDEX IF NOT EXISTS idx_worldcup_matches_competition_status_display
  ON worldcup_pool.matches(competition_key, status, display_order, id);

CREATE INDEX IF NOT EXISTS idx_worldcup_predictions_pool_participant_match
  ON worldcup_pool.predictions(pool_id, participant_id, match_id);

CREATE INDEX IF NOT EXISTS idx_worldcup_predictions_pool_match
  ON worldcup_pool.predictions(pool_id, match_id);