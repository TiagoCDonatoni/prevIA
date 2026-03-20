BEGIN;

CREATE TABLE IF NOT EXISTS access.user_daily_usage (
    user_id BIGINT NOT NULL REFERENCES app.users(user_id) ON DELETE CASCADE,
    date_key DATE NOT NULL,
    credits_used INTEGER NOT NULL DEFAULT 0,
    revealed_count INTEGER NOT NULL DEFAULT 0,
    created_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, date_key)
);

CREATE TABLE IF NOT EXISTS access.user_revealed_events (
    user_id BIGINT NOT NULL REFERENCES app.users(user_id) ON DELETE CASCADE,
    date_key DATE NOT NULL,
    fixture_key TEXT NOT NULL,
    revealed_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, date_key, fixture_key)
);

CREATE INDEX IF NOT EXISTS ix_user_revealed_events_user_date
ON access.user_revealed_events (user_id, date_key);

COMMIT;