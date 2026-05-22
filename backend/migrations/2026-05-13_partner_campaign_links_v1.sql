CREATE SCHEMA IF NOT EXISTS partnership;

CREATE TABLE IF NOT EXISTS partnership.partner_campaign_links (
  id BIGSERIAL PRIMARY KEY,

  partner_id BIGINT NOT NULL REFERENCES partnership.partners(id) ON DELETE CASCADE,
  contract_id BIGINT NOT NULL REFERENCES partnership.partner_contracts(id) ON DELETE CASCADE,
  campaign_id BIGINT NOT NULL REFERENCES access.campaigns(campaign_id) ON DELETE RESTRICT,

  status TEXT NOT NULL DEFAULT 'active' CHECK (
    status IN ('active', 'paused', 'ended', 'transferred', 'disabled')
  ),

  association_type TEXT NOT NULL DEFAULT 'primary' CHECK (
    association_type IN (
      'primary',
      'special',
      'seasonal',
      'youtube',
      'instagram',
      'tiktok',
      'newsletter',
      'community',
      'event',
      'manual'
    )
  ),

  label TEXT NULL,

  starts_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ends_at_utc TIMESTAMPTZ NULL,

  created_by_user_id BIGINT NULL REFERENCES app.users(user_id),
  created_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT partner_campaign_links_dates_ck CHECK (
    ends_at_utc IS NULL OR ends_at_utc > starts_at_utc
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_partner_campaign_links_current_campaign
  ON partnership.partner_campaign_links (campaign_id)
  WHERE status IN ('active', 'paused');

CREATE INDEX IF NOT EXISTS idx_partner_campaign_links_partner_status
  ON partnership.partner_campaign_links (partner_id, status, created_at_utc DESC);

CREATE INDEX IF NOT EXISTS idx_partner_campaign_links_contract
  ON partnership.partner_campaign_links (contract_id);

CREATE INDEX IF NOT EXISTS idx_partner_campaign_links_campaign
  ON partnership.partner_campaign_links (campaign_id);