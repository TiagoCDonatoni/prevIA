CREATE TABLE IF NOT EXISTS worldcup_pool.pin_attempts (
  id BIGSERIAL PRIMARY KEY,

  pool_id BIGINT NOT NULL
    REFERENCES worldcup_pool.pools(id)
    ON DELETE CASCADE,

  owner_type TEXT NOT NULL
    CHECK (owner_type IN ('organizer', 'participant')),

  email_hash TEXT NOT NULL,
  ip_hash TEXT NULL,

  success BOOLEAN NOT NULL DEFAULT false,
  failure_code TEXT NULL,

  created_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_worldcup_pin_attempts_scope
  ON worldcup_pool.pin_attempts(pool_id, owner_type, email_hash, created_at_utc DESC);

CREATE INDEX IF NOT EXISTS idx_worldcup_pin_attempts_created
  ON worldcup_pool.pin_attempts(created_at_utc DESC);