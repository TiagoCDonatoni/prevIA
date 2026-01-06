-- backend/sql/001_raw_schema.sql
-- RAW: armazena respostas da API para reprocessar ETL sem custo

create schema if not exists raw;

create table if not exists raw.api_responses (
  id              bigserial primary key,
  provider        text not null,                 -- ex: 'api-football'
  endpoint        text not null,                 -- ex: 'leagues', 'teams', 'fixtures'
  request_params  jsonb not null default '{}'::jsonb,
  response_body   jsonb not null,
  response_hash   text not null,                 -- hash do body p/ idempotência
  fetched_at_utc  timestamptz not null default now(),
  http_status     int not null,
  ok              boolean not null,
  error_message   text null
);

create index if not exists ix_raw_api_responses_endpoint_fetched
  on raw.api_responses (endpoint, fetched_at_utc desc);

create index if not exists ix_raw_api_responses_hash
  on raw.api_responses (response_hash);

create table if not exists raw.etl_runs (
  id              bigserial primary key,
  etl_name        text not null,                 -- ex: 'core_leagues', 'core_teams', 'core_fixtures'
  started_at_utc  timestamptz not null default now(),
  finished_at_utc timestamptz null,
  status          text not null,                 -- 'running'|'ok'|'failed'
  meta            jsonb not null default '{}'::jsonb,
  error_message   text null
);

create index if not exists ix_raw_etl_runs_name_started
  on raw.etl_runs (etl_name, started_at_utc desc);
