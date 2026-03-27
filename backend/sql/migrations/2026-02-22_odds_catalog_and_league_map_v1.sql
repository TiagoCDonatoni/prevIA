-- 2026-02-22_odds_catalog_and_league_map_v1.sql
-- Sprint 1: odds_sport_catalog + odds_league_map (+ suggestions) v1
-- Base para descoberta automática, mapeamento governável e pipeline sem hardcode.

begin;

create schema if not exists odds;
create schema if not exists ops;

-- 1) Catálogo: tudo que a Odds API expõe (descoberta automática)
create table if not exists odds.odds_sport_catalog (
  sport_key               text primary key,
  sport_group             text,
  sport_title             text,
  active                  boolean not null default true,
  regions_supported       text[],

  first_seen_at_utc       timestamptz not null default now(),
  last_seen_at_utc        timestamptz not null default now(),

  meta_json               jsonb not null default '{}'::jsonb,
  created_at_utc          timestamptz not null default now(),
  updated_at_utc          timestamptz not null default now()
);

create index if not exists idx_odds_sport_catalog_active
  on odds.odds_sport_catalog(active);

create index if not exists idx_odds_sport_catalog_last_seen
  on odds.odds_sport_catalog(last_seen_at_utc);

-- 2) Mapeamento canônico: sport_key (odds) -> league_id/season_policy (core)
create table if not exists odds.odds_league_map (
  sport_key               text primary key references odds.odds_sport_catalog(sport_key) on delete cascade,

  -- Alvo no core (API de esportes)
  league_id               integer not null,
  season_policy           text not null default 'current' check (season_policy in ('current', 'fixed', 'by_kickoff_year')),
  fixed_season            integer null, -- usado quando season_policy='fixed'

  -- Defaults de resolução/materialização (podem ser ajustados por liga)
  tol_hours               integer not null default 6,
  hours_ahead             integer not null default 720,
  regions                 text not null default 'eu',

  enabled                 boolean not null default false,

  -- governança
  mapping_status          text not null default 'pending' check (mapping_status in ('pending','approved','disabled')),
  mapping_source          text not null default 'manual' check (mapping_source in ('manual','auto_high_conf','auto_low_conf')),
  confidence              numeric(5,4) not null default 0.0000,

  notes                   text,
  created_at_utc          timestamptz not null default now(),
  updated_at_utc          timestamptz not null default now()
);

create index if not exists idx_odds_league_map_enabled
  on odds.odds_league_map(enabled);

create index if not exists idx_odds_league_map_status
  on odds.odds_league_map(mapping_status);

-- 3) Sugestões (opcional, mas já deixa preparado p/ auto-map)
create table if not exists odds.odds_league_map_suggestions (
  suggestion_id           bigserial primary key,
  sport_key               text not null references odds.odds_sport_catalog(sport_key) on delete cascade,

  league_id_candidate     integer not null,
  season_policy_candidate text not null default 'current',
  fixed_season_candidate  integer null,

  confidence              numeric(5,4) not null default 0.0000,
  reasons_json            jsonb not null default '{}'::jsonb,

  status                  text not null default 'open' check (status in ('open','reviewed','applied','rejected')),
  created_at_utc          timestamptz not null default now(),
  reviewed_at_utc         timestamptz null
);

create index if not exists idx_odds_map_suggestions_open
  on odds.odds_league_map_suggestions(status);

create index if not exists idx_odds_map_suggestions_sport
  on odds.odds_league_map_suggestions(sport_key);

commit;