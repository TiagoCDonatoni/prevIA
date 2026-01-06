create table if not exists api_raw (
  id integer primary key autoincrement,
  provider text not null,
  endpoint text not null,
  params_json text not null,
  fetched_at_utc text not null,
  status_code integer not null,
  payload_json text not null,
  error_json text
);

create index if not exists idx_api_raw_endpoint on api_raw(endpoint);
create index if not exists idx_api_raw_fetched on api_raw(fetched_at_utc);

create table if not exists api_field_catalog (
  id integer primary key autoincrement,
  provider text not null,
  endpoint text not null,
  json_path text not null,
  field_name text not null,
  value_type text not null,
  example_value text,
  first_seen_utc text not null,
  last_seen_utc text not null,
  seen_count integer not null default 1,

  unique(provider, endpoint, json_path)
);

create index if not exists idx_field_catalog_endpoint on api_field_catalog(endpoint);
create index if not exists idx_field_catalog_name on api_field_catalog(field_name);
