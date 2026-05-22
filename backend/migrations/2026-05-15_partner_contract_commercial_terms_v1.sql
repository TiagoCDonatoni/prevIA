ALTER TABLE partnership.partner_contracts
  ADD COLUMN IF NOT EXISTS commission_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS commission_only_for_new_users BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS commission_requires_paid_invoice BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS commission_excludes_refunded_payments BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS commission_excludes_disputed_payments BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS commission_requires_active_subscription BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS payout_frequency TEXT NOT NULL DEFAULT 'monthly',
  ADD COLUMN IF NOT EXISTS payout_currency TEXT NOT NULL DEFAULT 'BRL',
  ADD COLUMN IF NOT EXISTS payout_method TEXT NOT NULL DEFAULT 'manual_pix',
  ADD COLUMN IF NOT EXISTS contract_file_url TEXT NULL,
  ADD COLUMN IF NOT EXISTS signed_at_utc TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS commercial_notes TEXT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'partner_contracts_payout_frequency_ck'
  ) THEN
    ALTER TABLE partnership.partner_contracts
      ADD CONSTRAINT partner_contracts_payout_frequency_ck
      CHECK (payout_frequency IN ('manual', 'monthly', 'quarterly'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'partner_contracts_payout_currency_ck'
  ) THEN
    ALTER TABLE partnership.partner_contracts
      ADD CONSTRAINT partner_contracts_payout_currency_ck
      CHECK (payout_currency ~ '^[A-Z]{3}$');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'partner_contracts_payout_method_ck'
  ) THEN
    ALTER TABLE partnership.partner_contracts
      ADD CONSTRAINT partner_contracts_payout_method_ck
      CHECK (
        payout_method IN (
          'manual_pix',
          'manual_bank_transfer',
          'manual_other',
          'platform_later'
        )
      );
  END IF;
END $$;