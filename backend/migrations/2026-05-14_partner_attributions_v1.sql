CREATE SCHEMA IF NOT EXISTS partnership;

CREATE TABLE IF NOT EXISTS partnership.partner_attributions (
  id BIGSERIAL PRIMARY KEY,

  partner_id BIGINT NOT NULL REFERENCES partnership.partners(id) ON DELETE RESTRICT,
  contract_id BIGINT NOT NULL REFERENCES partnership.partner_contracts(id) ON DELETE RESTRICT,
  partner_campaign_link_id BIGINT NOT NULL REFERENCES partnership.partner_campaign_links(id) ON DELETE RESTRICT,
  campaign_id BIGINT NOT NULL REFERENCES access.campaigns(campaign_id) ON DELETE RESTRICT,
  user_id BIGINT NOT NULL REFERENCES app.users(user_id) ON DELETE CASCADE,

  attributed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  attribution_rule TEXT NOT NULL CHECK (
    attribution_rule IN (
      'new_user_campaign_redeem',
      'existing_user_campaign_redeem',
      'unknown_user_age_campaign_redeem'
    )
  ),

  attribution_source TEXT NOT NULL CHECK (
    attribution_source IN (
      'access_campaign_redeem',
      'admin_manual',
      'backfill'
    )
  ),

  status TEXT NOT NULL DEFAULT 'active' CHECK (
    status IN (
      'pending',
      'active',
      'non_commissionable',
      'cancelled',
      'superseded'
    )
  ),

  source_redemption_id BIGINT NULL REFERENCES access.campaign_redemptions(redemption_id) ON DELETE SET NULL,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_partner_attributions_user_once
  ON partnership.partner_attributions (user_id);

CREATE INDEX IF NOT EXISTS idx_partner_attributions_partner_status_attributed
  ON partnership.partner_attributions (partner_id, status, attributed_at DESC);

CREATE INDEX IF NOT EXISTS idx_partner_attributions_campaign
  ON partnership.partner_attributions (campaign_id, attributed_at DESC);

CREATE INDEX IF NOT EXISTS idx_partner_attributions_campaign_link
  ON partnership.partner_attributions (partner_campaign_link_id, attributed_at DESC);

CREATE INDEX IF NOT EXISTS idx_partner_attributions_contract
  ON partnership.partner_attributions (contract_id, attributed_at DESC);