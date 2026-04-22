BEGIN;

CREATE TABLE IF NOT EXISTS access.user_bonus_credit_balances (
    user_id BIGINT PRIMARY KEY REFERENCES app.users(user_id) ON DELETE CASCADE,
    balance_credits INTEGER NOT NULL DEFAULT 0 CHECK (balance_credits >= 0),
    created_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS access.user_bonus_credit_events (
    bonus_credit_event_id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES app.users(user_id) ON DELETE CASCADE,
    event_type TEXT NOT NULL CHECK (event_type IN ('grant', 'consume', 'adjust')),
    credits_delta INTEGER NOT NULL CHECK (credits_delta <> 0),
    balance_after INTEGER NOT NULL CHECK (balance_after >= 0),
    reason TEXT NULL,
    actor_user_id BIGINT NULL REFERENCES app.users(user_id) ON DELETE SET NULL,
    created_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_user_bonus_credit_events_user_created
ON access.user_bonus_credit_events (user_id, created_at_utc DESC);

COMMIT;