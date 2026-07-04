BEGIN;

ALTER TABLE billing.subscriptions
    ADD COLUMN IF NOT EXISTS billing_status TEXT NULL;

CREATE INDEX IF NOT EXISTS ix_billing_subscriptions_user_billing_status_updated
ON billing.subscriptions (user_id, billing_status, updated_at_utc DESC);

COMMIT;