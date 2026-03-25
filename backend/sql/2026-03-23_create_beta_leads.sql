CREATE SCHEMA IF NOT EXISTS public_site;

CREATE TABLE IF NOT EXISTS public_site.beta_leads (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  lang VARCHAR(2) NOT NULL CHECK (lang IN ('pt', 'en', 'es')),
  country TEXT NULL,
  bettor_profile TEXT NULL,
  experience_level TEXT NULL,
  uses_tipsters BOOLEAN NULL,
  interest_note TEXT NULL,
  source TEXT NOT NULL DEFAULT 'landing_beta_form',
  status TEXT NOT NULL DEFAULT 'new',
  created_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_beta_leads_created_at
  ON public_site.beta_leads (created_at_utc DESC);

CREATE INDEX IF NOT EXISTS idx_beta_leads_email
  ON public_site.beta_leads (lower(email));