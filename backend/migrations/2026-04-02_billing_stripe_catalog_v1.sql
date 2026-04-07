BEGIN;

CREATE TABLE IF NOT EXISTS billing.plan_prices (
    plan_price_id BIGSERIAL PRIMARY KEY,
    price_code TEXT NOT NULL UNIQUE,
    plan_code TEXT NOT NULL REFERENCES billing.plans(plan_code),
    billing_cycle TEXT NOT NULL,
    currency_code TEXT NOT NULL DEFAULT 'BRL',
    unit_amount_cents INTEGER NOT NULL,
    price_version TEXT NOT NULL DEFAULT 'v1',
    provider TEXT NOT NULL DEFAULT 'stripe',
    provider_product_id TEXT NULL,
    provider_price_id TEXT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT plan_prices_billing_cycle_ck CHECK (billing_cycle IN ('monthly', 'quarterly', 'annual')),
    CONSTRAINT plan_prices_currency_code_ck CHECK (currency_code IN ('BRL', 'USD', 'EUR'))
);

CREATE INDEX IF NOT EXISTS ix_plan_prices_plan_code
ON billing.plan_prices (plan_code, billing_cycle, active, sort_order);

ALTER TABLE billing.subscriptions
    ADD COLUMN IF NOT EXISTS plan_price_id BIGINT NULL REFERENCES billing.plan_prices(plan_price_id);

ALTER TABLE billing.subscriptions
    ADD COLUMN IF NOT EXISTS billing_cycle TEXT NULL;

ALTER TABLE billing.subscriptions
    ADD COLUMN IF NOT EXISTS currency_code TEXT NULL;

ALTER TABLE billing.subscriptions
    ADD COLUMN IF NOT EXISTS provider_checkout_session_id TEXT NULL;

ALTER TABLE billing.subscriptions
    ADD COLUMN IF NOT EXISTS provider_price_id TEXT NULL;

INSERT INTO billing.plan_prices (
    price_code,
    plan_code,
    billing_cycle,
    currency_code,
    unit_amount_cents,
    price_version,
    provider,
    provider_product_id,
    provider_price_id,
    active,
    sort_order,
    metadata_json
) VALUES
    ('basic_v1_monthly',   'BASIC', 'monthly',   'BRL', 1490, 'v1', 'stripe', NULL, NULL, TRUE,  10, '{"label":"Basic mensal"}'::jsonb),
    ('basic_v1_quarterly', 'BASIC', 'quarterly', 'BRL', 4470, 'v1', 'stripe', NULL, NULL, TRUE,  20, '{"label":"Basic trimestral"}'::jsonb),
    ('basic_v1_annual',    'BASIC', 'annual',    'BRL', 17880,'v1', 'stripe', NULL, NULL, TRUE,  30, '{"label":"Basic anual"}'::jsonb),

    ('light_v1_monthly',   'LIGHT', 'monthly',   'BRL', 3990, 'v1', 'stripe', NULL, NULL, TRUE, 110, '{"label":"Light mensal"}'::jsonb),
    ('light_v1_quarterly', 'LIGHT', 'quarterly', 'BRL', 11970,'v1', 'stripe', NULL, NULL, TRUE, 120, '{"label":"Light trimestral"}'::jsonb),
    ('light_v1_annual',    'LIGHT', 'annual',    'BRL', 47880,'v1', 'stripe', NULL, NULL, TRUE, 130, '{"label":"Light anual"}'::jsonb),

    ('pro_v1_monthly',     'PRO',   'monthly',   'BRL', 6990, 'v1', 'stripe', NULL, NULL, TRUE, 210, '{"label":"Pro mensal"}'::jsonb),
    ('pro_v1_quarterly',   'PRO',   'quarterly', 'BRL', 20970,'v1', 'stripe', NULL, NULL, TRUE, 220, '{"label":"Pro trimestral"}'::jsonb),
    ('pro_v1_annual',      'PRO',   'annual',    'BRL', 83880,'v1', 'stripe', NULL, NULL, TRUE, 230, '{"label":"Pro anual"}'::jsonb)
ON CONFLICT (price_code) DO UPDATE SET
    unit_amount_cents = EXCLUDED.unit_amount_cents,
    active = EXCLUDED.active,
    sort_order = EXCLUDED.sort_order,
    metadata_json = EXCLUDED.metadata_json,
    updated_at_utc = NOW();

COMMIT;