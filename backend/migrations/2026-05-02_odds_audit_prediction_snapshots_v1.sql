BEGIN;

ALTER TABLE odds.audit_predictions
  DROP CONSTRAINT IF EXISTS uq_odds_audit_event_artifact;

DROP INDEX IF EXISTS odds.uq_odds_audit_event_artifact;
DROP INDEX IF EXISTS odds.uq_odds_audit_event_artifact_captured;

CREATE UNIQUE INDEX IF NOT EXISTS uq_odds_audit_event_artifact_captured
  ON odds.audit_predictions (event_id, artifact_filename, captured_at_utc);

CREATE INDEX IF NOT EXISTS ix_odds_audit_event_artifact_kickoff_captured
  ON odds.audit_predictions (event_id, artifact_filename, kickoff_utc DESC, captured_at_utc DESC);

COMMIT;