CREATE SCHEMA IF NOT EXISTS worldcup_pool;

CREATE TABLE IF NOT EXISTS worldcup_pool.pools (
  id BIGSERIAL PRIMARY KEY,

  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NULL,

  lang TEXT NOT NULL DEFAULT 'pt'
    CHECK (lang IN ('pt', 'en', 'es')),

  organizer_name TEXT NOT NULL,
  organizer_email TEXT NOT NULL,
  organizer_pin_hash TEXT NOT NULL,

  invite_token TEXT NOT NULL UNIQUE,
  invite_code_hash TEXT NULL,

  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'archived', 'disabled')),

  marketing_opt_in BOOLEAN NOT NULL DEFAULT false,
  terms_accepted_at_utc TIMESTAMPTZ NULL,

  created_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_worldcup_pools_status
  ON worldcup_pool.pools(status);

CREATE INDEX IF NOT EXISTS idx_worldcup_pools_lang
  ON worldcup_pool.pools(lang);

CREATE UNIQUE INDEX IF NOT EXISTS ux_worldcup_pools_organizer_email_active
  ON worldcup_pool.pools(lower(organizer_email), slug)
  WHERE status = 'active';


CREATE TABLE IF NOT EXISTS worldcup_pool.participants (
  id BIGSERIAL PRIMARY KEY,

  pool_id BIGINT NOT NULL
    REFERENCES worldcup_pool.pools(id)
    ON DELETE CASCADE,

  display_name TEXT NOT NULL,
  email TEXT NOT NULL,
  pin_hash TEXT NOT NULL,

  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'removed')),

  marketing_opt_in BOOLEAN NOT NULL DEFAULT false,
  public_rank_opt_in BOOLEAN NOT NULL DEFAULT false,
  terms_accepted_at_utc TIMESTAMPTZ NULL,

  joined_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at_utc TIMESTAMPTZ NULL,

  removed_at_utc TIMESTAMPTZ NULL,
  removed_by_pool_id BIGINT NULL
    REFERENCES worldcup_pool.pools(id)
    ON DELETE SET NULL,
  removed_reason TEXT NULL
);

CREATE INDEX IF NOT EXISTS idx_worldcup_participants_pool
  ON worldcup_pool.participants(pool_id);

CREATE INDEX IF NOT EXISTS idx_worldcup_participants_status
  ON worldcup_pool.participants(status);

CREATE UNIQUE INDEX IF NOT EXISTS ux_worldcup_participants_pool_email_active
  ON worldcup_pool.participants(pool_id, lower(email))
  WHERE status = 'active';


CREATE TABLE IF NOT EXISTS worldcup_pool.sessions (
  id BIGSERIAL PRIMARY KEY,

  pool_id BIGINT NOT NULL
    REFERENCES worldcup_pool.pools(id)
    ON DELETE CASCADE,

  participant_id BIGINT NULL
    REFERENCES worldcup_pool.participants(id)
    ON DELETE CASCADE,

  owner_type TEXT NOT NULL
    CHECK (owner_type IN ('organizer', 'participant')),

  session_token_hash TEXT NOT NULL UNIQUE,

  user_agent TEXT NULL,
  ip_hash TEXT NULL,

  created_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at_utc TIMESTAMPTZ NULL,
  expires_at_utc TIMESTAMPTZ NOT NULL,
  revoked_at_utc TIMESTAMPTZ NULL,

  CHECK (
    (owner_type = 'organizer' AND participant_id IS NULL)
    OR
    (owner_type = 'participant' AND participant_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_worldcup_sessions_pool
  ON worldcup_pool.sessions(pool_id);

CREATE INDEX IF NOT EXISTS idx_worldcup_sessions_participant
  ON worldcup_pool.sessions(participant_id);

CREATE INDEX IF NOT EXISTS idx_worldcup_sessions_expires
  ON worldcup_pool.sessions(expires_at_utc);


CREATE TABLE IF NOT EXISTS worldcup_pool.matches (
  id BIGSERIAL PRIMARY KEY,

  competition_key TEXT NOT NULL DEFAULT 'fifa_world_cup_2026',
  match_key TEXT NOT NULL UNIQUE,

  official_match_no INTEGER NULL,
  display_order INTEGER NOT NULL DEFAULT 0,

  phase TEXT NOT NULL
    CHECK (
      phase IN (
        'group',
        'round_of_32',
        'round_of_16',
        'quarter_final',
        'semi_final',
        'third_place',
        'final'
      )
    ),

  group_code TEXT NULL,
  bracket_label TEXT NULL,

  home_label_i18n JSONB NOT NULL DEFAULT '{}'::jsonb,
  away_label_i18n JSONB NOT NULL DEFAULT '{}'::jsonb,

  home_team_i18n JSONB NULL,
  away_team_i18n JSONB NULL,

  kickoff_utc TIMESTAMPTZ NULL,
  lock_at_utc TIMESTAMPTZ NULL,

  status TEXT NOT NULL DEFAULT 'placeholder'
    CHECK (
      status IN (
        'placeholder',
        'scheduled',
        'live',
        'finished',
        'cancelled',
        'postponed'
      )
    ),

  home_score INTEGER NULL CHECK (home_score IS NULL OR home_score >= 0),
  away_score INTEGER NULL CHECK (away_score IS NULL OR away_score >= 0),

  result_source TEXT NULL,
  result_confirmed_at_utc TIMESTAMPTZ NULL,

  created_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_worldcup_matches_competition_phase
  ON worldcup_pool.matches(competition_key, phase);

CREATE INDEX IF NOT EXISTS idx_worldcup_matches_kickoff
  ON worldcup_pool.matches(kickoff_utc);

CREATE INDEX IF NOT EXISTS idx_worldcup_matches_status
  ON worldcup_pool.matches(status);


CREATE TABLE IF NOT EXISTS worldcup_pool.predictions (
  id BIGSERIAL PRIMARY KEY,

  pool_id BIGINT NOT NULL
    REFERENCES worldcup_pool.pools(id)
    ON DELETE CASCADE,

  participant_id BIGINT NOT NULL
    REFERENCES worldcup_pool.participants(id)
    ON DELETE CASCADE,

  match_id BIGINT NOT NULL
    REFERENCES worldcup_pool.matches(id)
    ON DELETE CASCADE,

  predicted_home_score INTEGER NOT NULL CHECK (predicted_home_score >= 0),
  predicted_away_score INTEGER NOT NULL CHECK (predicted_away_score >= 0),

  points INTEGER NOT NULL DEFAULT 0 CHECK (points >= 0),
  scoring_detail JSONB NOT NULL DEFAULT '{}'::jsonb,

  locked_at_utc TIMESTAMPTZ NULL,
  scored_at_utc TIMESTAMPTZ NULL,

  created_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (pool_id, participant_id, match_id)
);

CREATE INDEX IF NOT EXISTS idx_worldcup_predictions_pool
  ON worldcup_pool.predictions(pool_id);

CREATE INDEX IF NOT EXISTS idx_worldcup_predictions_participant
  ON worldcup_pool.predictions(participant_id);

CREATE INDEX IF NOT EXISTS idx_worldcup_predictions_match
  ON worldcup_pool.predictions(match_id);


CREATE TABLE IF NOT EXISTS worldcup_pool.events (
  id BIGSERIAL PRIMARY KEY,

  pool_id BIGINT NULL
    REFERENCES worldcup_pool.pools(id)
    ON DELETE CASCADE,

  participant_id BIGINT NULL
    REFERENCES worldcup_pool.participants(id)
    ON DELETE SET NULL,

  actor_type TEXT NOT NULL DEFAULT 'system'
    CHECK (actor_type IN ('system', 'organizer', 'participant', 'admin')),

  actor_id BIGINT NULL,

  event_name TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_worldcup_events_pool_created
  ON worldcup_pool.events(pool_id, created_at_utc DESC);

CREATE INDEX IF NOT EXISTS idx_worldcup_events_name
  ON worldcup_pool.events(event_name);