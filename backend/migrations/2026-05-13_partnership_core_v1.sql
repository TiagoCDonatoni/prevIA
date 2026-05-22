CREATE SCHEMA IF NOT EXISTS partnership;

CREATE TABLE IF NOT EXISTS partnership.partners (
  id BIGSERIAL PRIMARY KEY,
  owner_user_id BIGINT NOT NULL REFERENCES app.users(user_id),
  display_name TEXT NOT NULL,
  legal_name TEXT NULL,
  document_number TEXT NULL,
  email TEXT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (
    status IN ('pending', 'active', 'paused', 'suspended', 'terminated')
  ),
  tier TEXT NOT NULL DEFAULT 'founding' CHECK (
    tier IN ('founding', 'premium', 'standard', 'watchlist')
  ),
  created_from_application_id BIGINT NULL REFERENCES partnership.partner_applications(id),
  created_by_user_id BIGINT NULL REFERENCES app.users(user_id),
  created_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (owner_user_id)
);

CREATE INDEX IF NOT EXISTS idx_partners_status_created_at
  ON partnership.partners (status, created_at_utc DESC);

CREATE INDEX IF NOT EXISTS idx_partners_application
  ON partnership.partners (created_from_application_id);

CREATE TABLE IF NOT EXISTS partnership.partner_contracts (
  id BIGSERIAL PRIMARY KEY,
  partner_id BIGINT NOT NULL REFERENCES partnership.partners(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (
    status IN ('draft', 'active', 'expired', 'terminated', 'superseded')
  ),
  starts_at DATE NOT NULL,
  ends_at DATE NOT NULL,
  auto_renewal_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  commission_rate NUMERIC(6,4) NOT NULL DEFAULT 0.5000,
  commission_invoice_limit INTEGER NOT NULL DEFAULT 3,
  commission_base TEXT NOT NULL DEFAULT 'net_revenue' CHECK (
    commission_base IN ('net_revenue')
  ),
  validation_days INTEGER NOT NULL DEFAULT 35,
  payout_minimum_amount NUMERIC(12,2) NOT NULL DEFAULT 100.00,
  terms_version TEXT NOT NULL DEFAULT 'partner_terms_v1',
  created_by_user_id BIGINT NULL REFERENCES app.users(user_id),
  created_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT partner_contracts_dates_ck CHECK (ends_at > starts_at),
  CONSTRAINT partner_contracts_rate_ck CHECK (commission_rate >= 0 AND commission_rate <= 1),
  CONSTRAINT partner_contracts_invoice_limit_ck CHECK (commission_invoice_limit >= 0),
  CONSTRAINT partner_contracts_validation_days_ck CHECK (validation_days >= 0),
  CONSTRAINT partner_contracts_payout_minimum_ck CHECK (payout_minimum_amount >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_partner_contracts_one_active
  ON partnership.partner_contracts (partner_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_partner_contracts_partner_status
  ON partnership.partner_contracts (partner_id, status);

CREATE TABLE IF NOT EXISTS partnership.partner_audit_events (
  id BIGSERIAL PRIMARY KEY,
  partner_id BIGINT NULL REFERENCES partnership.partners(id) ON DELETE SET NULL,
  actor_user_id BIGINT NULL REFERENCES app.users(user_id),
  event_type TEXT NOT NULL,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_partner_audit_events_partner_created_at
  ON partnership.partner_audit_events (partner_id, created_at_utc DESC);

CREATE INDEX IF NOT EXISTS idx_partner_audit_events_type_created_at
  ON partnership.partner_audit_events (event_type, created_at_utc DESC);