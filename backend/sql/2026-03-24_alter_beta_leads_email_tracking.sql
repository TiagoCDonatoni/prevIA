ALTER TABLE public_site.beta_leads
  ADD COLUMN IF NOT EXISTS email_notification_sent BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS email_notification_attempted_at_utc TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS email_notification_error TEXT NULL;