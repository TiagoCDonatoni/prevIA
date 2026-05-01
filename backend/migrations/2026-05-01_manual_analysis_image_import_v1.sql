BEGIN;

CREATE TABLE IF NOT EXISTS access.user_manual_analysis_image_requests (
    request_id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES app.users(user_id) ON DELETE CASCADE,
    plan_code TEXT NOT NULL,
    source_type TEXT NOT NULL DEFAULT 'manual_analysis_image',
    image_type TEXT NOT NULL DEFAULT 'unknown',
    status TEXT NOT NULL DEFAULT 'created',
    image_sha256 TEXT NULL,
    image_mime_type TEXT NULL,
    image_size_bytes INTEGER NULL,
    image_width INTEGER NULL,
    image_height INTEGER NULL,
    storage_object_path TEXT NULL,
    risk_score NUMERIC(6,4) NOT NULL DEFAULT 0,
    created_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at_utc TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS ix_manual_analysis_image_requests_user_created
ON access.user_manual_analysis_image_requests (user_id, created_at_utc DESC, request_id DESC);

CREATE INDEX IF NOT EXISTS ix_manual_analysis_image_requests_sha
ON access.user_manual_analysis_image_requests (user_id, image_sha256, created_at_utc DESC);

CREATE TABLE IF NOT EXISTS access.user_manual_analysis_image_rows (
    row_id BIGSERIAL PRIMARY KEY,
    request_id BIGINT NOT NULL REFERENCES access.user_manual_analysis_image_requests(request_id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES app.users(user_id) ON DELETE CASCADE,
    row_index INTEGER NOT NULL,
    status TEXT NOT NULL,
    raw_extraction_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    normalized_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    candidates_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    resolved_fixture_id BIGINT NULL,
    resolved_home_team_id BIGINT NULL,
    resolved_away_team_id BIGINT NULL,
    league_id BIGINT NULL,
    season INTEGER NULL,
    match_confidence NUMERIC(6,4) NULL,
    market_supported BOOLEAN NOT NULL DEFAULT false,
    user_confirmed BOOLEAN NOT NULL DEFAULT false,
    generated_analysis_id BIGINT NULL REFERENCES access.user_manual_analyses(analysis_id),
    created_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_manual_analysis_image_rows_request
ON access.user_manual_analysis_image_rows (request_id, row_index ASC, row_id ASC);

CREATE INDEX IF NOT EXISTS ix_manual_analysis_image_rows_user_status
ON access.user_manual_analysis_image_rows (user_id, status, created_at_utc DESC);

CREATE TABLE IF NOT EXISTS access.user_manual_analysis_image_actions (
    action_id BIGSERIAL PRIMARY KEY,
    row_id BIGINT NULL REFERENCES access.user_manual_analysis_image_rows(row_id) ON DELETE CASCADE,
    request_id BIGINT NULL REFERENCES access.user_manual_analysis_image_requests(request_id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES app.users(user_id) ON DELETE CASCADE,
    action_type TEXT NOT NULL,
    actor_type TEXT NOT NULL,
    payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_manual_analysis_image_actions_request
ON access.user_manual_analysis_image_actions (request_id, created_at_utc DESC, action_id DESC);

CREATE INDEX IF NOT EXISTS ix_manual_analysis_image_actions_row
ON access.user_manual_analysis_image_actions (row_id, created_at_utc DESC, action_id DESC);

CREATE TABLE IF NOT EXISTS access.user_manual_analysis_image_usage_daily (
    user_id BIGINT NOT NULL REFERENCES app.users(user_id) ON DELETE CASCADE,
    date_key DATE NOT NULL,
    upload_attempts INTEGER NOT NULL DEFAULT 0,
    accepted_uploads INTEGER NOT NULL DEFAULT 0,
    rejected_uploads INTEGER NOT NULL DEFAULT 0,
    generated_analyses INTEGER NOT NULL DEFAULT 0,
    duplicate_uploads INTEGER NOT NULL DEFAULT 0,
    risk_score NUMERIC(6,4) NOT NULL DEFAULT 0,
    blocked_until_utc TIMESTAMPTZ NULL,
    updated_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, date_key)
);

COMMIT;