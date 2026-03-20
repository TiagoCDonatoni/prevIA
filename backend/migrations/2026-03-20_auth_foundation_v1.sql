BEGIN;

CREATE SCHEMA IF NOT EXISTS app;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS billing;
CREATE SCHEMA IF NOT EXISTS access;

CREATE TABLE IF NOT EXISTS app.users (
    user_id BIGSERIAL PRIMARY KEY,
    email TEXT NOT NULL,
    email_normalized TEXT NOT NULL,
    full_name TEXT NULL,
    avatar_url TEXT NULL,
    preferred_lang TEXT NOT NULL DEFAULT 'pt-BR',
    country_code TEXT NULL,
    timezone TEXT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    email_verified BOOLEAN NOT NULL DEFAULT FALSE,
    marketing_opt_in BOOLEAN NOT NULL DEFAULT FALSE,
    created_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login_at_utc TIMESTAMPTZ NULL,
    CONSTRAINT users_status_ck CHECK (status IN ('active', 'pending_verification', 'blocked', 'deleted'))
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_users_email_normalized
ON app.users (email_normalized);

CREATE TABLE IF NOT EXISTS app.user_identities (
    identity_id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES app.users(user_id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    provider_user_id TEXT NULL,
    provider_email TEXT NULL,
    password_hash TEXT NULL,
    provider_payload_json JSONB NULL,
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    created_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login_at_utc TIMESTAMPTZ NULL,
    CONSTRAINT user_identities_provider_ck CHECK (provider IN ('password', 'google', 'dev'))
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_user_identities_provider_user
ON app.user_identities (provider, provider_user_id)
WHERE provider_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_user_identities_user_id
ON app.user_identities (user_id);

CREATE TABLE IF NOT EXISTS auth.sessions (
    session_id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES app.users(user_id) ON DELETE CASCADE,
    session_token_hash TEXT NOT NULL,
    expires_at_utc TIMESTAMPTZ NOT NULL,
    revoked_at_utc TIMESTAMPTZ NULL,
    created_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ip_hash TEXT NULL,
    user_agent_hash TEXT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_auth_sessions_token_hash
ON auth.sessions (session_token_hash);

CREATE INDEX IF NOT EXISTS ix_auth_sessions_user_id
ON auth.sessions (user_id);

CREATE TABLE IF NOT EXISTS billing.plans (
    plan_code TEXT PRIMARY KEY,
    billing_interval TEXT NOT NULL DEFAULT 'month',
    price_brl_cents INTEGER NOT NULL DEFAULT 0,
    price_usd_cents INTEGER NOT NULL DEFAULT 0,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    config_json JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS billing.subscriptions (
    subscription_id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES app.users(user_id) ON DELETE CASCADE,
    plan_code TEXT NOT NULL REFERENCES billing.plans(plan_code),
    provider TEXT NOT NULL DEFAULT 'manual',
    provider_customer_id TEXT NULL,
    provider_subscription_id TEXT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    starts_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    current_period_start_utc TIMESTAMPTZ NULL,
    current_period_end_utc TIMESTAMPTZ NULL,
    cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
    cancelled_at_utc TIMESTAMPTZ NULL,
    created_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT subscriptions_status_ck CHECK (status IN ('active', 'trialing', 'past_due', 'cancelled', 'expired'))
);

CREATE INDEX IF NOT EXISTS ix_subscriptions_user_id
ON billing.subscriptions (user_id);

CREATE INDEX IF NOT EXISTS ix_subscriptions_user_status
ON billing.subscriptions (user_id, status, updated_at_utc DESC);

CREATE TABLE IF NOT EXISTS billing.subscription_events (
    subscription_event_id BIGSERIAL PRIMARY KEY,
    subscription_id BIGINT NULL REFERENCES billing.subscriptions(subscription_id) ON DELETE SET NULL,
    user_id BIGINT NOT NULL REFERENCES app.users(user_id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_subscription_events_user_id
ON billing.subscription_events (user_id, created_at_utc DESC);

CREATE TABLE IF NOT EXISTS access.user_entitlements_snapshot (
    user_id BIGINT PRIMARY KEY REFERENCES app.users(user_id) ON DELETE CASCADE,
    plan_code TEXT NOT NULL REFERENCES billing.plans(plan_code),
    entitlements_json JSONB NOT NULL,
    computed_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    version TEXT NOT NULL DEFAULT 'v1'
);

INSERT INTO billing.plans (
    plan_code,
    billing_interval,
    price_brl_cents,
    price_usd_cents,
    active,
    sort_order,
    config_json
) VALUES
    ('FREE',  'month',    0,    0, TRUE, 10, '{"daily_limit":5,"chat":false,"max_future_days":0}'::jsonb),
    ('BASIC', 'month', 1490,  900, TRUE, 20, '{"daily_limit":10,"chat":false,"max_future_days":3}'::jsonb),
    ('LIGHT', 'month', 3990, 1900, TRUE, 30, '{"daily_limit":50,"chat":false,"max_future_days":14}'::jsonb),
    ('PRO',   'month', 6990, 3900, TRUE, 40, '{"daily_limit":200,"chat":true,"max_future_days":3650}'::jsonb)
ON CONFLICT (plan_code) DO UPDATE SET
    billing_interval = EXCLUDED.billing_interval,
    price_brl_cents = EXCLUDED.price_brl_cents,
    price_usd_cents = EXCLUDED.price_usd_cents,
    active = EXCLUDED.active,
    sort_order = EXCLUDED.sort_order,
    config_json = EXCLUDED.config_json;

COMMIT;