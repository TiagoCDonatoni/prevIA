BEGIN;

CREATE SCHEMA IF NOT EXISTS access;
CREATE SCHEMA IF NOT EXISTS billing;

CREATE TABLE IF NOT EXISTS access.campaigns (
    campaign_id BIGSERIAL PRIMARY KEY,
    slug TEXT NOT NULL,
    label TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'beta_open',
    status TEXT NOT NULL DEFAULT 'draft',
    trial_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    trial_plan_code TEXT NULL REFERENCES billing.plans(plan_code),
    trial_duration_days INTEGER NULL,
    trial_grant_category TEXT NOT NULL DEFAULT 'trial',
    allow_existing_users BOOLEAN NOT NULL DEFAULT TRUE,
    allow_previous_trial_users BOOLEAN NOT NULL DEFAULT FALSE,
    allow_paid_upgrade_trial BOOLEAN NOT NULL DEFAULT TRUE,
    requires_approval BOOLEAN NOT NULL DEFAULT FALSE,
    starts_at_utc TIMESTAMPTZ NULL,
    expires_at_utc TIMESTAMPTZ NULL,
    max_redemptions INTEGER NULL,
    redeemed_count INTEGER NOT NULL DEFAULT 0,
    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE access.campaigns ADD COLUMN IF NOT EXISTS slug TEXT;
ALTER TABLE access.campaigns ADD COLUMN IF NOT EXISTS label TEXT;
ALTER TABLE access.campaigns ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'beta_open';
ALTER TABLE access.campaigns ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'draft';
ALTER TABLE access.campaigns ADD COLUMN IF NOT EXISTS trial_enabled BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE access.campaigns ADD COLUMN IF NOT EXISTS trial_plan_code TEXT NULL;
ALTER TABLE access.campaigns ADD COLUMN IF NOT EXISTS trial_duration_days INTEGER NULL;
ALTER TABLE access.campaigns ADD COLUMN IF NOT EXISTS trial_grant_category TEXT NOT NULL DEFAULT 'trial';
ALTER TABLE access.campaigns ADD COLUMN IF NOT EXISTS allow_existing_users BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE access.campaigns ADD COLUMN IF NOT EXISTS allow_previous_trial_users BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE access.campaigns ADD COLUMN IF NOT EXISTS allow_paid_upgrade_trial BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE access.campaigns ADD COLUMN IF NOT EXISTS requires_approval BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE access.campaigns ADD COLUMN IF NOT EXISTS starts_at_utc TIMESTAMPTZ NULL;
ALTER TABLE access.campaigns ADD COLUMN IF NOT EXISTS expires_at_utc TIMESTAMPTZ NULL;
ALTER TABLE access.campaigns ADD COLUMN IF NOT EXISTS max_redemptions INTEGER NULL;
ALTER TABLE access.campaigns ADD COLUMN IF NOT EXISTS redeemed_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE access.campaigns ADD COLUMN IF NOT EXISTS metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE access.campaigns ADD COLUMN IF NOT EXISTS created_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE access.campaigns ADD COLUMN IF NOT EXISTS updated_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS ux_access_campaigns_slug
ON access.campaigns (slug);

CREATE INDEX IF NOT EXISTS ix_access_campaigns_status_expires
ON access.campaigns (status, expires_at_utc);

CREATE TABLE IF NOT EXISTS access.user_plan_grants (
    grant_id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES app.users(user_id) ON DELETE CASCADE,
    source_type TEXT NOT NULL DEFAULT 'campaign',
    campaign_id BIGINT NULL REFERENCES access.campaigns(campaign_id) ON DELETE SET NULL,
    grant_category TEXT NOT NULL DEFAULT 'trial',
    plan_code TEXT NOT NULL REFERENCES billing.plans(plan_code),
    starts_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ends_at_utc TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE access.user_plan_grants ADD COLUMN IF NOT EXISTS user_id BIGINT;
ALTER TABLE access.user_plan_grants ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'campaign';
ALTER TABLE access.user_plan_grants ADD COLUMN IF NOT EXISTS campaign_id BIGINT NULL;
ALTER TABLE access.user_plan_grants ADD COLUMN IF NOT EXISTS grant_category TEXT NOT NULL DEFAULT 'trial';
ALTER TABLE access.user_plan_grants ADD COLUMN IF NOT EXISTS plan_code TEXT;
ALTER TABLE access.user_plan_grants ADD COLUMN IF NOT EXISTS starts_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE access.user_plan_grants ADD COLUMN IF NOT EXISTS ends_at_utc TIMESTAMPTZ;
ALTER TABLE access.user_plan_grants ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE access.user_plan_grants ADD COLUMN IF NOT EXISTS metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE access.user_plan_grants ADD COLUMN IF NOT EXISTS created_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE access.user_plan_grants ADD COLUMN IF NOT EXISTS updated_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS ix_access_user_plan_grants_user_active
ON access.user_plan_grants (user_id, status, ends_at_utc DESC);

CREATE INDEX IF NOT EXISTS ix_access_user_plan_grants_campaign
ON access.user_plan_grants (campaign_id, status);

CREATE TABLE IF NOT EXISTS access.campaign_redemptions (
    redemption_id BIGSERIAL PRIMARY KEY,
    campaign_id BIGINT NOT NULL REFERENCES access.campaigns(campaign_id) ON DELETE CASCADE,
    user_id BIGINT NULL REFERENCES app.users(user_id) ON DELETE SET NULL,
    email_normalized TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL,
    failure_reason TEXT NULL,
    grant_id BIGINT NULL REFERENCES access.user_plan_grants(grant_id) ON DELETE SET NULL,
    redeemed_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE access.campaign_redemptions ADD COLUMN IF NOT EXISTS campaign_id BIGINT;
ALTER TABLE access.campaign_redemptions ADD COLUMN IF NOT EXISTS user_id BIGINT NULL;
ALTER TABLE access.campaign_redemptions ADD COLUMN IF NOT EXISTS email_normalized TEXT NOT NULL DEFAULT '';
ALTER TABLE access.campaign_redemptions ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'redeemed';
ALTER TABLE access.campaign_redemptions ADD COLUMN IF NOT EXISTS failure_reason TEXT NULL;
ALTER TABLE access.campaign_redemptions ADD COLUMN IF NOT EXISTS grant_id BIGINT NULL;
ALTER TABLE access.campaign_redemptions ADD COLUMN IF NOT EXISTS redeemed_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE access.campaign_redemptions ADD COLUMN IF NOT EXISTS metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE access.campaign_redemptions ADD COLUMN IF NOT EXISTS created_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE access.campaign_redemptions ADD COLUMN IF NOT EXISTS updated_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS ix_access_campaign_redemptions_campaign_status
ON access.campaign_redemptions (campaign_id, status, redeemed_at_utc DESC);

CREATE INDEX IF NOT EXISTS ix_access_campaign_redemptions_user_campaign
ON access.campaign_redemptions (user_id, campaign_id, status);

CREATE INDEX IF NOT EXISTS ix_access_campaign_redemptions_email_campaign
ON access.campaign_redemptions (email_normalized, campaign_id, status);

CREATE TABLE IF NOT EXISTS access.campaign_offers (
    offer_id BIGSERIAL PRIMARY KEY,
    campaign_id BIGINT NOT NULL REFERENCES access.campaigns(campaign_id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'active',
    discount_type TEXT NOT NULL DEFAULT 'percent',
    discount_percent NUMERIC(5,2) NULL,
    discount_amount_cents INTEGER NULL,
    currency TEXT NULL,
    discount_duration TEXT NOT NULL DEFAULT 'repeating',
    discount_duration_months INTEGER NULL,
    eligible_plan_codes JSONB NOT NULL DEFAULT '[]'::jsonb,
    eligible_billing_cycles JSONB NOT NULL DEFAULT '[]'::jsonb,
    offer_valid_until_utc TIMESTAMPTZ NULL,
    offer_valid_days_after_grant_end INTEGER NULL DEFAULT 7,
    stripe_coupon_id TEXT NULL,
    stripe_promotion_code_id TEXT NULL,
    max_redemptions INTEGER NULL,
    redeemed_count INTEGER NOT NULL DEFAULT 0,
    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE access.campaign_offers ADD COLUMN IF NOT EXISTS campaign_id BIGINT;
ALTER TABLE access.campaign_offers ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE access.campaign_offers ADD COLUMN IF NOT EXISTS discount_type TEXT NOT NULL DEFAULT 'percent';
ALTER TABLE access.campaign_offers ADD COLUMN IF NOT EXISTS discount_percent NUMERIC(5,2) NULL;
ALTER TABLE access.campaign_offers ADD COLUMN IF NOT EXISTS discount_amount_cents INTEGER NULL;
ALTER TABLE access.campaign_offers ADD COLUMN IF NOT EXISTS currency TEXT NULL;
ALTER TABLE access.campaign_offers ADD COLUMN IF NOT EXISTS discount_duration TEXT NOT NULL DEFAULT 'repeating';
ALTER TABLE access.campaign_offers ADD COLUMN IF NOT EXISTS discount_duration_months INTEGER NULL;
ALTER TABLE access.campaign_offers ADD COLUMN IF NOT EXISTS eligible_plan_codes JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE access.campaign_offers ADD COLUMN IF NOT EXISTS eligible_billing_cycles JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE access.campaign_offers ADD COLUMN IF NOT EXISTS offer_valid_until_utc TIMESTAMPTZ NULL;
ALTER TABLE access.campaign_offers ADD COLUMN IF NOT EXISTS offer_valid_days_after_grant_end INTEGER NULL DEFAULT 7;
ALTER TABLE access.campaign_offers ADD COLUMN IF NOT EXISTS stripe_coupon_id TEXT NULL;
ALTER TABLE access.campaign_offers ADD COLUMN IF NOT EXISTS stripe_promotion_code_id TEXT NULL;
ALTER TABLE access.campaign_offers ADD COLUMN IF NOT EXISTS max_redemptions INTEGER NULL;
ALTER TABLE access.campaign_offers ADD COLUMN IF NOT EXISTS redeemed_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE access.campaign_offers ADD COLUMN IF NOT EXISTS metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE access.campaign_offers ADD COLUMN IF NOT EXISTS created_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE access.campaign_offers ADD COLUMN IF NOT EXISTS updated_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS ix_access_campaign_offers_campaign_status
ON access.campaign_offers (campaign_id, status, offer_id DESC);

CREATE TABLE IF NOT EXISTS billing.user_discount_eligibilities (
    eligibility_id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES app.users(user_id) ON DELETE CASCADE,
    campaign_id BIGINT NULL REFERENCES access.campaigns(campaign_id) ON DELETE SET NULL,
    offer_id BIGINT NULL REFERENCES access.campaign_offers(offer_id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'active',
    eligible_plan_codes JSONB NOT NULL DEFAULT '[]'::jsonb,
    eligible_billing_cycles JSONB NOT NULL DEFAULT '[]'::jsonb,
    starts_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ends_at_utc TIMESTAMPTZ NULL,
    stripe_coupon_id TEXT NULL,
    stripe_promotion_code_id TEXT NULL,
    used_at_utc TIMESTAMPTZ NULL,
    used_provider_checkout_session_id TEXT NULL,
    used_provider_subscription_id TEXT NULL,
    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE billing.user_discount_eligibilities ADD COLUMN IF NOT EXISTS user_id BIGINT;
ALTER TABLE billing.user_discount_eligibilities ADD COLUMN IF NOT EXISTS campaign_id BIGINT NULL;
ALTER TABLE billing.user_discount_eligibilities ADD COLUMN IF NOT EXISTS offer_id BIGINT NULL;
ALTER TABLE billing.user_discount_eligibilities ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE billing.user_discount_eligibilities ADD COLUMN IF NOT EXISTS eligible_plan_codes JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE billing.user_discount_eligibilities ADD COLUMN IF NOT EXISTS eligible_billing_cycles JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE billing.user_discount_eligibilities ADD COLUMN IF NOT EXISTS starts_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE billing.user_discount_eligibilities ADD COLUMN IF NOT EXISTS ends_at_utc TIMESTAMPTZ NULL;
ALTER TABLE billing.user_discount_eligibilities ADD COLUMN IF NOT EXISTS stripe_coupon_id TEXT NULL;
ALTER TABLE billing.user_discount_eligibilities ADD COLUMN IF NOT EXISTS stripe_promotion_code_id TEXT NULL;
ALTER TABLE billing.user_discount_eligibilities ADD COLUMN IF NOT EXISTS used_at_utc TIMESTAMPTZ NULL;
ALTER TABLE billing.user_discount_eligibilities ADD COLUMN IF NOT EXISTS used_provider_checkout_session_id TEXT NULL;
ALTER TABLE billing.user_discount_eligibilities ADD COLUMN IF NOT EXISTS used_provider_subscription_id TEXT NULL;
ALTER TABLE billing.user_discount_eligibilities ADD COLUMN IF NOT EXISTS metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE billing.user_discount_eligibilities ADD COLUMN IF NOT EXISTS created_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE billing.user_discount_eligibilities ADD COLUMN IF NOT EXISTS updated_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS ix_billing_discount_eligibilities_user_active
ON billing.user_discount_eligibilities (user_id, status, ends_at_utc ASC NULLS LAST, eligibility_id DESC);

CREATE INDEX IF NOT EXISTS ix_billing_discount_eligibilities_campaign_offer
ON billing.user_discount_eligibilities (campaign_id, offer_id, status);

COMMIT;