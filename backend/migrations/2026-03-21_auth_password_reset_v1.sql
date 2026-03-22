BEGIN;

CREATE TABLE IF NOT EXISTS auth.password_reset_tokens (
    reset_token_id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES app.users(user_id) ON DELETE CASCADE,
    identity_id BIGINT NULL REFERENCES app.user_identities(identity_id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL,
    requested_for_email TEXT NOT NULL,
    expires_at_utc TIMESTAMPTZ NOT NULL,
    used_at_utc TIMESTAMPTZ NULL,
    revoked_at_utc TIMESTAMPTZ NULL,
    created_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    request_ip_hash TEXT NULL,
    request_user_agent_hash TEXT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_auth_password_reset_tokens_token_hash
ON auth.password_reset_tokens (token_hash);

CREATE INDEX IF NOT EXISTS ix_auth_password_reset_tokens_user_id
ON auth.password_reset_tokens (user_id, created_at_utc DESC);

COMMIT;