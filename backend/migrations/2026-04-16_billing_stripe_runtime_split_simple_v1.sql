BEGIN;

ALTER TABLE billing.plan_prices
    ADD COLUMN IF NOT EXISTS provider_product_id_live TEXT NULL;

ALTER TABLE billing.plan_prices
    ADD COLUMN IF NOT EXISTS provider_price_id_live TEXT NULL;

ALTER TABLE billing.subscriptions
    ADD COLUMN IF NOT EXISTS billing_runtime TEXT NOT NULL DEFAULT 'live';

ALTER TABLE billing.subscription_events
    ADD COLUMN IF NOT EXISTS billing_runtime TEXT NOT NULL DEFAULT 'live';

ALTER TABLE billing.webhook_events
    ADD COLUMN IF NOT EXISTS billing_runtime TEXT NOT NULL DEFAULT 'live';

UPDATE billing.subscriptions
SET billing_runtime = 'sandbox'
WHERE provider = 'stripe'
  AND COALESCE(NULLIF(billing_runtime, ''), 'live') = 'live';

UPDATE billing.subscription_events
SET billing_runtime = 'sandbox'
WHERE event_type LIKE 'stripe_%'
  AND COALESCE(NULLIF(billing_runtime, ''), 'live') = 'live';

UPDATE billing.webhook_events
SET billing_runtime = 'sandbox'
WHERE provider = 'stripe'
  AND COALESCE(NULLIF(billing_runtime, ''), 'live') = 'live';

CREATE INDEX IF NOT EXISTS ix_billing_subscriptions_user_runtime_updated
ON billing.subscriptions (user_id, billing_runtime, updated_at_utc DESC);

CREATE INDEX IF NOT EXISTS ix_billing_subscriptions_provider_runtime_subscription_id
ON billing.subscriptions (provider, billing_runtime, provider_subscription_id);

CREATE INDEX IF NOT EXISTS ix_billing_subscriptions_provider_runtime_customer_id
ON billing.subscriptions (provider, billing_runtime, provider_customer_id);

DROP INDEX IF EXISTS ux_billing_webhook_events_provider_event_id;

CREATE UNIQUE INDEX IF NOT EXISTS ux_billing_webhook_events_provider_runtime_event_id
ON billing.webhook_events (provider, billing_runtime, provider_event_id);

COMMIT;