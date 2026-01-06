-- backend/sql/004_backfill_checkpoint.sql
create table if not exists raw.backfill_checkpoint (
  id              bigserial primary key,
  provider        text not null,
  endpoint        text not null,          -- 'teams' | 'fixtures' | etc
  league_id       int not null,
  season          int not null,

  last_page_done  int not null default 0, -- última página concluída
  total_pages     int null,               -- total visto na API (se houver)
  status          text not null default 'running', -- running|done|failed
  updated_at_utc  timestamptz not null default now(),
  meta            jsonb not null default '{}'::jsonb,

  unique (provider, endpoint, league_id, season)
);

create index if not exists ix_raw_backfill_checkpoint_status
  on raw.backfill_checkpoint (status, updated_at_utc desc);
