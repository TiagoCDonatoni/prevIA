BEGIN;

CREATE SCHEMA IF NOT EXISTS tools;
CREATE SCHEMA IF NOT EXISTS billing;

CREATE TABLE IF NOT EXISTS tools.catalog (
    tool_code TEXT PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    name_i18n_key TEXT NOT NULL UNIQUE,
    active BOOLEAN NOT NULL DEFAULT FALSE,
    free_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    limits_config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT tools_catalog_tool_code_ck CHECK (tool_code = UPPER(tool_code)),
    CONSTRAINT tools_catalog_slug_ck CHECK (slug = LOWER(slug)),
    CONSTRAINT tools_catalog_limits_object_ck CHECK (jsonb_typeof(limits_config_json) = 'object'),
    CONSTRAINT tools_catalog_metadata_object_ck CHECK (jsonb_typeof(metadata_json) = 'object')
);

CREATE INDEX IF NOT EXISTS ix_tools_catalog_active
ON tools.catalog (active, tool_code);

CREATE TABLE IF NOT EXISTS tools.prices (
    tool_price_id BIGSERIAL PRIMARY KEY,
    tool_code TEXT NOT NULL REFERENCES tools.catalog(tool_code) ON DELETE RESTRICT,
    price_code TEXT NOT NULL UNIQUE,
    currency_code TEXT NOT NULL,
    unit_amount_cents INTEGER NOT NULL,
    provider TEXT NOT NULL DEFAULT 'stripe',
    provider_product_id TEXT NULL,
    provider_price_id TEXT NULL,
    provider_product_id_live TEXT NULL,
    provider_price_id_live TEXT NULL,
    active BOOLEAN NOT NULL DEFAULT FALSE,
    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT tools_prices_currency_code_ck CHECK (
        currency_code = UPPER(currency_code) AND LENGTH(currency_code) = 3
    ),
    CONSTRAINT tools_prices_amount_ck CHECK (unit_amount_cents >= 0),
    CONSTRAINT tools_prices_metadata_object_ck CHECK (jsonb_typeof(metadata_json) = 'object')
);

CREATE INDEX IF NOT EXISTS ix_tools_prices_tool_active
ON tools.prices (tool_code, active, currency_code);

CREATE UNIQUE INDEX IF NOT EXISTS ux_tools_prices_provider_price
ON tools.prices (provider, provider_price_id)
WHERE provider_price_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_tools_prices_provider_price_live
ON tools.prices (provider, provider_price_id_live)
WHERE provider_price_id_live IS NOT NULL;

CREATE TABLE IF NOT EXISTS billing.one_time_purchases (
    purchase_id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES app.users(user_id) ON DELETE RESTRICT,
    product_namespace TEXT NOT NULL,
    product_code TEXT NOT NULL,
    price_code TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    currency_code TEXT NOT NULL,
    provider TEXT NOT NULL,
    provider_runtime TEXT NOT NULL DEFAULT 'live',
    provider_checkout_session_id TEXT NULL,
    provider_payment_id TEXT NULL,
    provider_payment_intent_id TEXT NULL,
    provider_charge_id TEXT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    paid_at_utc TIMESTAMPTZ NULL,
    refunded_at_utc TIMESTAMPTZ NULL,
    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT one_time_purchases_purchase_user_uk UNIQUE (purchase_id, user_id),
    CONSTRAINT one_time_purchases_namespace_ck CHECK (product_namespace = LOWER(product_namespace)),
    CONSTRAINT one_time_purchases_amount_ck CHECK (amount_cents >= 0),
    CONSTRAINT one_time_purchases_currency_code_ck CHECK (
        currency_code = UPPER(currency_code) AND LENGTH(currency_code) = 3
    ),
    CONSTRAINT one_time_purchases_runtime_ck CHECK (provider_runtime IN ('sandbox', 'live')),
    CONSTRAINT one_time_purchases_status_ck CHECK (
        status IN ('pending', 'checkout_created', 'paid', 'failed', 'cancelled', 'refunded')
    ),
    CONSTRAINT one_time_purchases_paid_at_ck CHECK (status <> 'paid' OR paid_at_utc IS NOT NULL),
    CONSTRAINT one_time_purchases_metadata_object_ck CHECK (jsonb_typeof(metadata_json) = 'object')
);

CREATE INDEX IF NOT EXISTS ix_one_time_purchases_user_created
ON billing.one_time_purchases (user_id, created_at_utc DESC);

CREATE INDEX IF NOT EXISTS ix_one_time_purchases_product
ON billing.one_time_purchases (product_namespace, product_code, status);

CREATE UNIQUE INDEX IF NOT EXISTS ux_one_time_purchases_checkout_session
ON billing.one_time_purchases (provider, provider_runtime, provider_checkout_session_id)
WHERE provider_checkout_session_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_one_time_purchases_payment_intent
ON billing.one_time_purchases (provider, provider_runtime, provider_payment_intent_id)
WHERE provider_payment_intent_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_one_time_purchases_payment
ON billing.one_time_purchases (provider, provider_runtime, provider_payment_id)
WHERE provider_payment_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_one_time_purchases_charge
ON billing.one_time_purchases (provider, provider_runtime, provider_charge_id)
WHERE provider_charge_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS tools.user_entitlements (
    entitlement_id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES app.users(user_id) ON DELETE CASCADE,
    tool_code TEXT NOT NULL REFERENCES tools.catalog(tool_code) ON DELETE RESTRICT,
    entitlement_type TEXT NOT NULL,
    origin TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    source_purchase_id BIGINT NULL,
    starts_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ends_at_utc TIMESTAMPTZ NULL,
    revoked_at_utc TIMESTAMPTZ NULL,
    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT tools_user_entitlements_purchase_user_fk
        FOREIGN KEY (source_purchase_id, user_id)
        REFERENCES billing.one_time_purchases(purchase_id, user_id)
        ON DELETE RESTRICT,
    CONSTRAINT tools_user_entitlements_type_ck CHECK (entitlement_type IN ('lifetime')),
    CONSTRAINT tools_user_entitlements_origin_ck CHECK (origin IN ('purchase', 'bundle', 'admin', 'promotion')),
    CONSTRAINT tools_user_entitlements_status_ck CHECK (status IN ('active', 'revoked')),
    CONSTRAINT tools_user_entitlements_lifetime_ck CHECK (
        entitlement_type <> 'lifetime' OR ends_at_utc IS NULL
    ),
    CONSTRAINT tools_user_entitlements_revoked_ck CHECK (
        status <> 'revoked' OR revoked_at_utc IS NOT NULL
    ),
    CONSTRAINT tools_user_entitlements_metadata_object_ck CHECK (jsonb_typeof(metadata_json) = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_tools_user_entitlements_active_tool
ON tools.user_entitlements (user_id, tool_code)
WHERE status = 'active';

CREATE INDEX IF NOT EXISTS ix_tools_user_entitlements_tool_status
ON tools.user_entitlements (tool_code, status, user_id);

INSERT INTO tools.catalog (
    tool_code,
    slug,
    name_i18n_key,
    active,
    free_enabled,
    limits_config_json,
    metadata_json
) VALUES (
    'BANKROLL_MANAGER',
    'bankroll-manager',
    'tools.bankroll_manager.name',
    TRUE,
    TRUE,
    '{"free":{"max_entries":5},"paid":{"max_entries":null}}'::jsonb,
    '{"brand":"prevIA Tools"}'::jsonb
)
ON CONFLICT (tool_code) DO UPDATE SET
    slug = EXCLUDED.slug,
    name_i18n_key = EXCLUDED.name_i18n_key,
    active = EXCLUDED.active,
    free_enabled = EXCLUDED.free_enabled,
    limits_config_json = EXCLUDED.limits_config_json,
    metadata_json = EXCLUDED.metadata_json,
    updated_at_utc = NOW();

COMMIT;
