BEGIN;

CREATE TABLE IF NOT EXISTS billing.webhook_events (
    webhook_event_id BIGSERIAL PRIMARY KEY,
    provider TEXT NOT NULL DEFAULT 'stripe',
    provider_event_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    status TEXT NOT NULL,
    user_id BIGINT NULL REFERENCES app.users(user_id) ON DELETE SET NULL,
    subscription_id BIGINT NULL REFERENCES billing.subscriptions(subscription_id) ON DELETE SET NULL,
    plan_price_id BIGINT NULL REFERENCES billing.plan_prices(plan_price_id) ON DELETE SET NULL,
    provider_customer_id TEXT NULL,
    provider_checkout_session_id TEXT NULL,
    provider_subscription_id TEXT NULL,
    provider_price_id TEXT NULL,
    error_code TEXT NULL,
    error_message TEXT NULL,
    payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT billing_webhook_events_status_ck
        CHECK (status IN ('received', 'processed', 'failed', 'ignored'))
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_billing_webhook_events_provider_event_id
ON billing.webhook_events (provider, provider_event_id);

CREATE INDEX IF NOT EXISTS ix_billing_webhook_events_status_created
ON billing.webhook_events (status, created_at_utc DESC);

CREATE INDEX IF NOT EXISTS ix_billing_webhook_events_checkout_session
ON billing.webhook_events (provider_checkout_session_id);

CREATE INDEX IF NOT EXISTS ix_billing_webhook_events_subscription
ON billing.webhook_events (provider_subscription_id);

COMMIT;