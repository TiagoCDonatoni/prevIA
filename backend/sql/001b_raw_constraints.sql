-- backend/sql/001b_raw_constraints.sql

-- garante dedup idempotente por payload (hash) por provider/endpoint
create unique index if not exists ux_raw_api_responses_provider_endpoint_hash
  on raw.api_responses (provider, endpoint, response_hash);
