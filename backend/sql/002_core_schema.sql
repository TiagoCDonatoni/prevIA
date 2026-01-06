-- backend/sql/002_core_schema.sql
create schema if not exists core;

-- LIGAS
create table if not exists core.leagues (
  league_id          int primary key,            -- id da API-Football
  name               text not null,
  type               text null,                  -- league/cup
  country_name       text null,
  country_code       text null,
  logo_url           text null,
  flag_url           text null,
  is_active          boolean not null default true,
  updated_at_utc     timestamptz not null default now()
);

create index if not exists ix_core_leagues_country
  on core.leagues (country_name);

-- TIMES
create table if not exists core.teams (
  team_id            int primary key,            -- id da API-Football
  name               text not null,
  code               text null,
  country_name       text null,
  founded_year       int null,
  is_national        boolean null,
  logo_url           text null,

  venue_id           int null,
  venue_name         text null,
  venue_city         text null,
  venue_capacity     int null,

  updated_at_utc     timestamptz not null default now()
);

create index if not exists ix_core_teams_country
  on core.teams (country_name);

-- FIXTURES
create table if not exists core.fixtures (
  fixture_id         int primary key,            -- id da API-Football

  league_id          int not null references core.leagues(league_id),
  season             int not null,
  round              text null,

  kickoff_utc        timestamptz not null,
  timezone           text null,
  venue_name         text null,
  venue_city         text null,

  home_team_id       int not null references core.teams(team_id),
  away_team_id       int not null references core.teams(team_id),

  status_long        text null,
  status_short       text null,
  elapsed_min        int null,

  goals_home         int null,
  goals_away         int null,

  is_finished        boolean not null default false,
  is_cancelled       boolean not null default false,

  updated_at_utc     timestamptz not null default now()
);

create index if not exists ix_core_fixtures_league_season_kickoff
  on core.fixtures (league_id, season, kickoff_utc);

create index if not exists ix_core_fixtures_kickoff
  on core.fixtures (kickoff_utc);

create index if not exists ix_core_fixtures_teams_kickoff
  on core.fixtures (home_team_id, away_team_id, kickoff_utc);
