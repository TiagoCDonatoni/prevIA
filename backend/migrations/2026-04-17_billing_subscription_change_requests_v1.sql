BEGIN;

CREATE TABLE IF NOT EXISTS billing.subscription_change_requests (
    change_request_id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES app.users(user_id) ON DELETE CASCADE,
    subscription_id BIGINT NOT NULL REFERENCES billing.subscriptions(subscription_id) ON DELETE CASCADE,
    billing_runtime TEXT NOT NULL DEFAULT 'live',
    status TEXT NOT NULL,
    change_type TEXT NOT NULL,
    from_plan_code TEXT NOT NULL,
    from_billing_cycle TEXT NOT NULL,
    to_plan_code TEXT NOT NULL,
    to_billing_cycle TEXT NOT NULL,
    currency_code TEXT NOT NULL,
    effective_at_utc TIMESTAMPTZ NULL,
    provider_schedule_id TEXT NULL,
    preview_payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT subscription_change_requests_runtime_ck
        CHECK (billing_runtime IN ('sandbox', 'live')),
    CONSTRAINT subscription_change_requests_status_ck
        CHECK (status IN ('scheduled', 'applied', 'cancelled', 'failed')),
    CONSTRAINT subscription_change_requests_change_type_ck
        CHECK (change_type IN ('downgrade_period_end', 'cycle_downgrade_period_end'))
);

CREATE INDEX IF NOT EXISTS ix_subscription_change_requests_subscription_runtime_status
ON billing.subscription_change_requests (subscription_id, billing_runtime, status, updated_at_utc DESC);

CREATE UNIQUE INDEX IF NOT EXISTS ux_subscription_change_requests_scheduled_subscription_runtime
ON billing.subscription_change_requests (subscription_id, billing_runtime)
WHERE status = 'scheduled';

CREATE UNIQUE INDEX IF NOT EXISTS ux_subscription_change_requests_provider_schedule_id
ON billing.subscription_change_requests (provider_schedule_id)
WHERE provider_schedule_id IS NOT NULL;

COMMIT;