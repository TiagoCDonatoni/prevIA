BEGIN;

CREATE TABLE IF NOT EXISTS odds.team_name_aliases (
    alias_id BIGSERIAL PRIMARY KEY,
    sport_key TEXT NULL,
    raw_name TEXT NOT NULL,
    normalized_name TEXT NOT NULL,
    team_id INTEGER NOT NULL,
    source TEXT NOT NULL DEFAULT 'manual',
    confidence NUMERIC(6,4) NULL,
    notes TEXT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_team_name_aliases_scope_name
ON odds.team_name_aliases (
    COALESCE(sport_key, ''),
    normalized_name
);

CREATE INDEX IF NOT EXISTS ix_team_name_aliases_team_id
ON odds.team_name_aliases (team_id);

CREATE TABLE IF NOT EXISTS odds.team_name_resolution_queue (
    queue_id BIGSERIAL PRIMARY KEY,
    sport_key TEXT NOT NULL,
    raw_name TEXT NOT NULL,
    normalized_name TEXT NOT NULL,
    candidate_1_team_id INTEGER NULL,
    candidate_1_score NUMERIC(6,4) NULL,
    candidate_2_team_id INTEGER NULL,
    candidate_2_score NUMERIC(6,4) NULL,
    candidate_json JSONB NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    resolution_notes TEXT NULL,
    reviewed_by TEXT NULL,
    reviewed_at_utc TIMESTAMPTZ NULL,
    created_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_team_name_resolution_queue_status
ON odds.team_name_resolution_queue (status);

CREATE INDEX IF NOT EXISTS ix_team_name_resolution_queue_sport_key
ON odds.team_name_resolution_queue (sport_key);

CREATE UNIQUE INDEX IF NOT EXISTS ux_team_name_resolution_queue_open
ON odds.team_name_resolution_queue (
    sport_key,
    normalized_name,
    status
);

CREATE TABLE IF NOT EXISTS odds.team_name_resolution_log (
    log_id BIGSERIAL PRIMARY KEY,
    event_id TEXT NULL,
    sport_key TEXT NOT NULL,
    side TEXT NULL,
    raw_name TEXT NOT NULL,
    normalized_name TEXT NOT NULL,
    resolved_team_id INTEGER NULL,
    match_status TEXT NOT NULL,
    match_method TEXT NULL,
    match_score NUMERIC(6,4) NULL,
    second_best_score NUMERIC(6,4) NULL,
    decision_reason TEXT NULL,
    payload JSONB NULL,
    created_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_team_name_resolution_log_event_id
ON odds.team_name_resolution_log (event_id);

CREATE INDEX IF NOT EXISTS ix_team_name_resolution_log_sport_key
ON odds.team_name_resolution_log (sport_key);

COMMIT;