BEGIN;

CREATE SCHEMA IF NOT EXISTS telemetry;

CREATE TABLE IF NOT EXISTS telemetry.anonymous_identities (
  anonymous_id        TEXT PRIMARY KEY,
  first_seen_at_utc   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at_utc    TIMESTAMPTZ NOT NULL DEFAULT now(),
  linked_user_id      BIGINT NULL REFERENCES app.users(user_id) ON DELETE SET NULL,
  promoted_at_utc     TIMESTAMPTZ NULL,
  first_source        TEXT NULL,
  first_lang          TEXT NULL,
  first_utm_json      JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_session_id     TEXT NULL,
  events_count        BIGINT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS ix_telemetry_anonymous_linked_user
  ON telemetry.anonymous_identities (linked_user_id)
  WHERE linked_user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS telemetry.events (
  telemetry_event_id  BIGSERIAL PRIMARY KEY,
  client_event_id     TEXT NULL,

  event_name          TEXT NOT NULL,
  surface             TEXT NOT NULL DEFAULT 'unknown',
  actor_type          TEXT NOT NULL DEFAULT 'anonymous' CHECK (
    actor_type IN ('anonymous', 'user', 'admin', 'system')
  ),

  anonymous_id        TEXT NULL REFERENCES telemetry.anonymous_identities(anonymous_id) ON DELETE SET NULL,
  user_id             BIGINT NULL REFERENCES app.users(user_id) ON DELETE SET NULL,
  session_id          TEXT NULL,

  plan_code           TEXT NULL,
  auth_mode           TEXT NULL,
  route               TEXT NULL,
  lang                TEXT NULL,
  source              TEXT NULL,

  utm_json            JSONB NOT NULL DEFAULT '{}'::jsonb,
  payload_json        JSONB NOT NULL DEFAULT '{}'::jsonb,

  occurred_at_utc     TIMESTAMPTZ NOT NULL DEFAULT now(),
  received_at_utc     TIMESTAMPTZ NOT NULL DEFAULT now(),

  request_ip_hash     TEXT NULL,
  user_agent_hash     TEXT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_telemetry_events_client_event
  ON telemetry.events (client_event_id)
  WHERE client_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_telemetry_events_received
  ON telemetry.events (received_at_utc DESC, telemetry_event_id DESC);

CREATE INDEX IF NOT EXISTS ix_telemetry_events_name_received
  ON telemetry.events (event_name, received_at_utc DESC);

CREATE INDEX IF NOT EXISTS ix_telemetry_events_actor_received
  ON telemetry.events (actor_type, received_at_utc DESC);

CREATE INDEX IF NOT EXISTS ix_telemetry_events_anonymous_received
  ON telemetry.events (anonymous_id, received_at_utc DESC)
  WHERE anonymous_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_telemetry_events_user_received
  ON telemetry.events (user_id, received_at_utc DESC)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_telemetry_events_payload_sport
  ON telemetry.events ((payload_json->>'sport_key'), received_at_utc DESC)
  WHERE payload_json ? 'sport_key';

COMMIT;