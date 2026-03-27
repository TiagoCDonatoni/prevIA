BEGIN;

-- Tabela genérica para snapshots de mercados (h2h, totals, btts, etc.)
CREATE TABLE IF NOT EXISTS odds.odds_snapshots_market (
  snapshot_id        BIGSERIAL PRIMARY KEY,
  event_id           TEXT NOT NULL REFERENCES odds.odds_events(event_id) ON DELETE CASCADE,

  bookmaker          TEXT NULL,

  -- Ex.: h2h | totals | btts
  market_key         TEXT NOT NULL,

  -- Ex.: H | D | A  (h2h)
  --      over | under (totals)
  --      yes | no (btts)
  selection_key      TEXT NOT NULL,

  -- Linha do mercado quando aplicável (totals, spreads). NULL para h2h/btts.
  point              NUMERIC NULL,

  -- Odds (decimal)
  price              NUMERIC NULL,

  captured_at_utc    TIMESTAMPTZ NOT NULL,
  created_at_utc     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Idempotência: impede duplicar a mesma "medida" do mesmo bookmaker no mesmo timestamp
-- Observação: usamos COALESCE(point, -9999) para tratar NULL como chave.
CREATE UNIQUE INDEX IF NOT EXISTS ux_odds_snapshots_market_dedupe
  ON odds.odds_snapshots_market (
    event_id, bookmaker, market_key, selection_key, (COALESCE(point, -9999)), captured_at_utc
  );

CREATE INDEX IF NOT EXISTS ix_odds_snapshots_market_event_time
  ON odds.odds_snapshots_market (event_id, market_key, captured_at_utc DESC);

COMMIT;
