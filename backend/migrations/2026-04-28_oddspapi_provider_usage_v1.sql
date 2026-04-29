BEGIN;

CREATE SCHEMA IF NOT EXISTS odds;

CREATE TABLE IF NOT EXISTS odds.provider_request_usage (
  provider TEXT NOT NULL,
  endpoint_group TEXT NOT NULL DEFAULT 'rest',
  month_start_utc TIMESTAMPTZ NOT NULL,

  request_count INT NOT NULL DEFAULT 0,
  hard_cap INT NOT NULL DEFAULT 250,
  reserve INT NOT NULL DEFAULT 20,

  last_endpoint TEXT NULL,
  last_request_at_utc TIMESTAMPTZ NULL,
  last_status TEXT NULL,
  last_error TEXT NULL,

  created_at_utc TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at_utc TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (provider, endpoint_group, month_start_utc),

  CONSTRAINT ck_provider_request_usage_non_negative
    CHECK (
      request_count >= 0
      AND hard_cap >= 0
      AND reserve >= 0
      AND reserve <= hard_cap
    )
);

CREATE INDEX IF NOT EXISTS ix_provider_request_usage_provider_month
  ON odds.provider_request_usage (provider, month_start_utc DESC);

COMMIT;