BEGIN;

CREATE TABLE IF NOT EXISTS access.user_manual_analyses (
    analysis_id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES app.users(user_id) ON DELETE CASCADE,
    sport_key TEXT NOT NULL,
    event_id TEXT NOT NULL,
    fixture_id BIGINT NULL,
    home_name TEXT NOT NULL,
    away_name TEXT NOT NULL,
    market_key TEXT NOT NULL,
    selection_line NUMERIC(10, 2) NULL,
    bookmaker_name TEXT NULL,
    plan_code TEXT NOT NULL,
    source_type TEXT NOT NULL DEFAULT 'manual',
    credits_cost INTEGER NOT NULL DEFAULT 1,
    input_payload JSONB NOT NULL,
    result_payload JSONB NOT NULL,
    created_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_user_manual_analyses_user_created
ON access.user_manual_analyses (user_id, created_at_utc DESC, analysis_id DESC);

CREATE INDEX IF NOT EXISTS ix_user_manual_analyses_event
ON access.user_manual_analyses (event_id, created_at_utc DESC);

COMMIT;