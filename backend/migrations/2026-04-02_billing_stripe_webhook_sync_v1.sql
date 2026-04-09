BEGIN;

ALTER TABLE billing.subscriptions
    ADD COLUMN IF NOT EXISTS provider_event_id TEXT NULL;

ALTER TABLE billing.subscriptions
    ADD COLUMN IF NOT EXISTS current_period_start TIMESTAMPTZ NULL;

ALTER TABLE billing.subscriptions
    ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMPTZ NULL;

ALTER TABLE billing.subscriptions
    ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE billing.subscriptions
    ADD COLUMN IF NOT EXISTS canceled_at_utc TIMESTAMPTZ NULL;

ALTER TABLE billing.subscriptions
    ADD COLUMN IF NOT EXISTS trial_start_utc TIMESTAMPTZ NULL;

ALTER TABLE billing.subscriptions
    ADD COLUMN IF NOT EXISTS trial_end_utc TIMESTAMPTZ NULL;

ALTER TABLE billing.subscriptions
    ADD COLUMN IF NOT EXISTS raw_payload_json JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS ix_billing_subscriptions_provider_subscription_id
ON billing.subscriptions (provider, provider_subscription_id);

CREATE INDEX IF NOT EXISTS ix_billing_subscriptions_user_id_updated
ON billing.subscriptions (user_id, updated_at_utc DESC);

COMMIT;