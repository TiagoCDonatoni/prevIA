ALTER TABLE worldcup_pool.pools
  ADD COLUMN IF NOT EXISTS scoring_mode TEXT NOT NULL DEFAULT 'classic';

UPDATE worldcup_pool.pools
SET scoring_mode = 'classic'
WHERE scoring_mode IS NULL
   OR scoring_mode NOT IN ('classic', 'weighted_by_stage');

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'worldcup_pools_scoring_mode_check'
      AND conrelid = 'worldcup_pool.pools'::regclass
  ) THEN
    ALTER TABLE worldcup_pool.pools
      ADD CONSTRAINT worldcup_pools_scoring_mode_check
      CHECK (scoring_mode IN ('classic', 'weighted_by_stage'));
  END IF;
END $$;


CREATE OR REPLACE FUNCTION worldcup_pool.calculate_prediction_score(
  p_pool_id BIGINT,
  p_match_id BIGINT,
  p_predicted_home_score INTEGER,
  p_predicted_away_score INTEGER
)
RETURNS TABLE (
  score_points INTEGER,
  score_detail JSONB
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_scoring_mode TEXT;
  v_phase TEXT;
  v_status TEXT;
  v_actual_home_score INTEGER;
  v_actual_away_score INTEGER;

  v_exact_score_points INTEGER := 5;
  v_outcome_points INTEGER := 3;
  v_exact_team_score_bonus INTEGER := 1;
  v_max_points_per_match INTEGER := 5;

  v_predicted_outcome TEXT;
  v_actual_outcome TEXT;

  v_exact_score_hit BOOLEAN := false;
  v_outcome_hit BOOLEAN := false;
  v_exact_team_score_hits INTEGER := 0;

  v_points INTEGER := 0;
BEGIN
  IF p_predicted_home_score IS NULL OR p_predicted_away_score IS NULL THEN
    score_points := 0;
    score_detail := jsonb_build_object(
      'scored', false,
      'reason', 'missing_prediction_score'
    );
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT
    COALESCE(p.scoring_mode, 'classic'),
    m.phase,
    m.status,
    m.home_score,
    m.away_score
  INTO
    v_scoring_mode,
    v_phase,
    v_status,
    v_actual_home_score,
    v_actual_away_score
  FROM worldcup_pool.pools p
  JOIN worldcup_pool.matches m
    ON m.id = p_match_id
  WHERE p.id = p_pool_id
  LIMIT 1;

  IF NOT FOUND THEN
    score_points := 0;
    score_detail := jsonb_build_object(
      'scored', false,
      'reason', 'pool_or_match_not_found'
    );
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_status <> 'finished'
     OR v_actual_home_score IS NULL
     OR v_actual_away_score IS NULL THEN
    score_points := 0;
    score_detail := jsonb_build_object(
      'scored', false,
      'reason', 'match_not_finished_or_missing_score',
      'scoring_mode', v_scoring_mode,
      'phase', v_phase
    );
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_scoring_mode = 'weighted_by_stage' THEN
    CASE v_phase
      WHEN 'group' THEN
        v_exact_score_points := 5;
        v_outcome_points := 3;
        v_exact_team_score_bonus := 1;
        v_max_points_per_match := 5;

      WHEN 'round_of_32' THEN
        v_exact_score_points := 6;
        v_outcome_points := 4;
        v_exact_team_score_bonus := 1;
        v_max_points_per_match := 6;

      WHEN 'round_of_16' THEN
        v_exact_score_points := 8;
        v_outcome_points := 5;
        v_exact_team_score_bonus := 2;
        v_max_points_per_match := 8;

      WHEN 'quarter_final' THEN
        v_exact_score_points := 10;
        v_outcome_points := 6;
        v_exact_team_score_bonus := 2;
        v_max_points_per_match := 10;

      WHEN 'semi_final' THEN
        v_exact_score_points := 13;
        v_outcome_points := 8;
        v_exact_team_score_bonus := 3;
        v_max_points_per_match := 13;

      WHEN 'third_place' THEN
        v_exact_score_points := 13;
        v_outcome_points := 8;
        v_exact_team_score_bonus := 3;
        v_max_points_per_match := 13;

      WHEN 'final' THEN
        v_exact_score_points := 15;
        v_outcome_points := 9;
        v_exact_team_score_bonus := 3;
        v_max_points_per_match := 15;

      ELSE
        v_exact_score_points := 5;
        v_outcome_points := 3;
        v_exact_team_score_bonus := 1;
        v_max_points_per_match := 5;
    END CASE;
  END IF;

  v_predicted_outcome :=
    CASE
      WHEN p_predicted_home_score > p_predicted_away_score THEN 'H'
      WHEN p_predicted_home_score < p_predicted_away_score THEN 'A'
      ELSE 'D'
    END;

  v_actual_outcome :=
    CASE
      WHEN v_actual_home_score > v_actual_away_score THEN 'H'
      WHEN v_actual_home_score < v_actual_away_score THEN 'A'
      ELSE 'D'
    END;

  v_exact_score_hit :=
    p_predicted_home_score = v_actual_home_score
    AND p_predicted_away_score = v_actual_away_score;

  v_outcome_hit := v_predicted_outcome = v_actual_outcome;

  IF p_predicted_home_score = v_actual_home_score THEN
    v_exact_team_score_hits := v_exact_team_score_hits + 1;
  END IF;

  IF p_predicted_away_score = v_actual_away_score THEN
    v_exact_team_score_hits := v_exact_team_score_hits + 1;
  END IF;

  IF v_exact_score_hit THEN
    v_points := v_exact_score_points;
  ELSE
    v_points := 0;

    IF v_outcome_hit THEN
      v_points := v_points + v_outcome_points;
    END IF;

    v_points := v_points + (v_exact_team_score_hits * v_exact_team_score_bonus);
    v_points := LEAST(v_points, v_max_points_per_match);
  END IF;

  v_points := GREATEST(v_points, 0);

  score_points := v_points;
  score_detail := jsonb_build_object(
    'scored', true,
    'scoring_mode', v_scoring_mode,
    'phase', v_phase,
    'actual_home_score', v_actual_home_score,
    'actual_away_score', v_actual_away_score,
    'predicted_home_score', p_predicted_home_score,
    'predicted_away_score', p_predicted_away_score,
    'actual_outcome', v_actual_outcome,
    'predicted_outcome', v_predicted_outcome,
    'exact_score', v_exact_score_hit,
    'outcome_hit', v_outcome_hit,
    'exact_team_score_hits', v_exact_team_score_hits,
    'config', jsonb_build_object(
      'exact_score_points', v_exact_score_points,
      'outcome_points', v_outcome_points,
      'exact_team_score_bonus', v_exact_team_score_bonus,
      'max_points_per_match', v_max_points_per_match
    )
  );

  RETURN NEXT;
END;
$$;


CREATE OR REPLACE FUNCTION worldcup_pool.apply_prediction_score()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_score RECORD;
BEGIN
  SELECT
    score_points,
    score_detail
  INTO v_score
  FROM worldcup_pool.calculate_prediction_score(
    NEW.pool_id,
    NEW.match_id,
    NEW.predicted_home_score,
    NEW.predicted_away_score
  );

  NEW.points := COALESCE(v_score.score_points, 0);
  NEW.scoring_detail := COALESCE(v_score.score_detail, '{}'::jsonb);

  NEW.scored_at_utc :=
    CASE
      WHEN COALESCE((v_score.score_detail ->> 'scored')::boolean, false)
        THEN NOW()
      ELSE NULL
    END;

  NEW.updated_at_utc := NOW();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_worldcup_predictions_apply_score
ON worldcup_pool.predictions;

CREATE TRIGGER trg_worldcup_predictions_apply_score
BEFORE INSERT OR UPDATE OF
  pool_id,
  match_id,
  predicted_home_score,
  predicted_away_score
ON worldcup_pool.predictions
FOR EACH ROW
EXECUTE FUNCTION worldcup_pool.apply_prediction_score();


CREATE OR REPLACE FUNCTION worldcup_pool.recalculate_predictions_for_match_result()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  WITH scored AS (
    SELECT
      pr.id AS prediction_id,
      s.score_points,
      s.score_detail
    FROM worldcup_pool.predictions pr
    CROSS JOIN LATERAL worldcup_pool.calculate_prediction_score(
      pr.pool_id,
      pr.match_id,
      pr.predicted_home_score,
      pr.predicted_away_score
    ) s
    WHERE pr.match_id = NEW.id
  )
  UPDATE worldcup_pool.predictions pr
  SET
    points = COALESCE(scored.score_points, 0),
    scoring_detail = COALESCE(scored.score_detail, '{}'::jsonb),
    scored_at_utc =
      CASE
        WHEN COALESCE((scored.score_detail ->> 'scored')::boolean, false)
          THEN NOW()
        ELSE NULL
      END,
    updated_at_utc = NOW()
  FROM scored
  WHERE pr.id = scored.prediction_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_worldcup_matches_recalculate_predictions
ON worldcup_pool.matches;

CREATE TRIGGER trg_worldcup_matches_recalculate_predictions
AFTER UPDATE OF
  phase,
  status,
  home_score,
  away_score
ON worldcup_pool.matches
FOR EACH ROW
WHEN (
  OLD.phase IS DISTINCT FROM NEW.phase
  OR OLD.status IS DISTINCT FROM NEW.status
  OR OLD.home_score IS DISTINCT FROM NEW.home_score
  OR OLD.away_score IS DISTINCT FROM NEW.away_score
)
EXECUTE FUNCTION worldcup_pool.recalculate_predictions_for_match_result();


CREATE OR REPLACE FUNCTION worldcup_pool.recalculate_predictions_for_pool_scoring_mode()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  WITH scored AS (
    SELECT
      pr.id AS prediction_id,
      s.score_points,
      s.score_detail
    FROM worldcup_pool.predictions pr
    CROSS JOIN LATERAL worldcup_pool.calculate_prediction_score(
      pr.pool_id,
      pr.match_id,
      pr.predicted_home_score,
      pr.predicted_away_score
    ) s
    WHERE pr.pool_id = NEW.id
  )
  UPDATE worldcup_pool.predictions pr
  SET
    points = COALESCE(scored.score_points, 0),
    scoring_detail = COALESCE(scored.score_detail, '{}'::jsonb),
    scored_at_utc =
      CASE
        WHEN COALESCE((scored.score_detail ->> 'scored')::boolean, false)
          THEN NOW()
        ELSE NULL
      END,
    updated_at_utc = NOW()
  FROM scored
  WHERE pr.id = scored.prediction_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_worldcup_pools_recalculate_predictions
ON worldcup_pool.pools;

CREATE TRIGGER trg_worldcup_pools_recalculate_predictions
AFTER UPDATE OF scoring_mode
ON worldcup_pool.pools
FOR EACH ROW
WHEN (OLD.scoring_mode IS DISTINCT FROM NEW.scoring_mode)
EXECUTE FUNCTION worldcup_pool.recalculate_predictions_for_pool_scoring_mode();


WITH scored AS (
  SELECT
    pr.id AS prediction_id,
    s.score_points,
    s.score_detail
  FROM worldcup_pool.predictions pr
  CROSS JOIN LATERAL worldcup_pool.calculate_prediction_score(
    pr.pool_id,
    pr.match_id,
    pr.predicted_home_score,
    pr.predicted_away_score
  ) s
)
UPDATE worldcup_pool.predictions pr
SET
  points = COALESCE(scored.score_points, 0),
  scoring_detail = COALESCE(scored.score_detail, '{}'::jsonb),
  scored_at_utc =
    CASE
      WHEN COALESCE((scored.score_detail ->> 'scored')::boolean, false)
        THEN NOW()
      ELSE NULL
    END,
  updated_at_utc = NOW()
FROM scored
WHERE pr.id = scored.prediction_id;