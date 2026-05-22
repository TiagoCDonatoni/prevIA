CREATE SCHEMA IF NOT EXISTS partnership;

CREATE TABLE IF NOT EXISTS partnership.partner_applications (
  id BIGSERIAL PRIMARY KEY,
  full_name TEXT NOT NULL,
  public_name TEXT NOT NULL,
  email TEXT NOT NULL,
  whatsapp TEXT NOT NULL,
  lang VARCHAR(2) NOT NULL CHECK (lang IN ('pt', 'en', 'es')),
  main_social_platform TEXT NOT NULL,
  main_social_url TEXT NOT NULL,
  audience_size_range TEXT NOT NULL CHECK (
    audience_size_range IN ('up_to_5k', '5k_20k', '20k_50k', '50k_100k', '100k_plus')
  ),
  content_type TEXT NOT NULL CHECK (
    content_type IN (
      'football_analysis',
      'responsible_sports_betting',
      'sports_data_stats',
      'fantasy_trading',
      'sports_community',
      'other'
    )
  ),
  promotion_plan TEXT NOT NULL,
  other_social_urls TEXT NULL,
  city_state TEXT NULL,
  media_kit_url TEXT NULL,
  notes TEXT NULL,

  accepted_responsible_disclosure BOOLEAN NOT NULL DEFAULT FALSE,
  accepted_no_profit_promises BOOLEAN NOT NULL DEFAULT FALSE,
  accepted_not_guaranteed_approval BOOLEAN NOT NULL DEFAULT FALSE,
  accepted_contact BOOLEAN NOT NULL DEFAULT FALSE,

  status TEXT NOT NULL DEFAULT 'new' CHECK (
    status IN ('new', 'under_review', 'contacted', 'approved', 'rejected', 'converted', 'archived')
  ),

  admin_notes TEXT NULL,
  reviewed_by_user_id BIGINT NULL,
  reviewed_at_utc TIMESTAMPTZ NULL,
  converted_partner_id BIGINT NULL,

  source TEXT NOT NULL DEFAULT 'public_partner_application_form',
  ip_hash TEXT NULL,
  user_agent_hash TEXT NULL,

  email_notification_sent BOOLEAN NOT NULL DEFAULT FALSE,
  email_notification_attempted_at_utc TIMESTAMPTZ NULL,
  email_notification_error TEXT NULL,

  created_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_partner_applications_created_at
  ON partnership.partner_applications (created_at_utc DESC);

CREATE INDEX IF NOT EXISTS idx_partner_applications_status_created_at
  ON partnership.partner_applications (status, created_at_utc DESC);

CREATE INDEX IF NOT EXISTS idx_partner_applications_email
  ON partnership.partner_applications (lower(email));