-- Orderbook historization for BOOSTED NFTs (MIGRATION.md §4.1: cockpit's
-- sfl_orderbook.py model as an hourly Azure Function).
-- Run once against the live DB:
--   psql "$DATABASE_URL" -f 2026-07-20-orderbook.sql
-- schema.sql carries the same definitions for fresh installs.

-- Historized per-hour metrics (time series for the price-movement charts §4.3),
-- including the full price ladders (boosted-only keeps this small: a few
-- hundred rows per hour).
CREATE TABLE IF NOT EXISTS ob_snap (
  id BIGSERIAL PRIMARY KEY,
  collection TEXT NOT NULL,
  item_id INTEGER NOT NULL,
  ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  best_offer DOUBLE PRECISION,
  best_listing DOUBLE PRECISION,
  spread DOUBLE PRECISION,
  spread_pct DOUBLE PRECISION,
  offer_count INTEGER NOT NULL DEFAULT 0,
  listing_count INTEGER NOT NULL DEFAULT 0,
  offer_pressure INTEGER NOT NULL DEFAULT 0,
  listing_pressure INTEGER NOT NULL DEFAULT 0,
  avg_trade10 DOUBLE PRECISION,
  n_trades10 INTEGER NOT NULL DEFAULT 0,
  offer_ladder JSONB,
  listing_ladder JSONB
);
CREATE INDEX IF NOT EXISTS idx_obs_item_ts ON ob_snap(collection, item_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_obs_ts ON ob_snap(ts DESC);

-- Latest state per item (§4.1 ob_last): metrics + full ladders + feed context.
CREATE TABLE IF NOT EXISTS ob_last (
  collection TEXT NOT NULL,
  item_id INTEGER NOT NULL,
  ts TIMESTAMPTZ NOT NULL,
  name TEXT,
  boost_text TEXT,
  floor DOUBLE PRECISION,
  last_sale DOUBLE PRECISION,
  supply INTEGER,
  best_offer DOUBLE PRECISION,
  best_listing DOUBLE PRECISION,
  spread DOUBLE PRECISION,
  spread_pct DOUBLE PRECISION,
  offer_count INTEGER NOT NULL DEFAULT 0,
  listing_count INTEGER NOT NULL DEFAULT 0,
  offer_pressure INTEGER NOT NULL DEFAULT 0,
  listing_pressure INTEGER NOT NULL DEFAULT 0,
  avg_trade10 DOUBLE PRECISION,
  n_trades10 INTEGER NOT NULL DEFAULT 0,
  balance DOUBLE PRECISION,
  offer_ladder JSONB,
  listing_ladder JSONB,
  PRIMARY KEY (collection, item_id)
);

-- Trades gain the my-trade flags (§3.1 via §4.1): is_mine + which side I was on.
ALTER TABLE marketplace_trades ADD COLUMN IF NOT EXISTS is_mine BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE marketplace_trades ADD COLUMN IF NOT EXISTS my_side TEXT;
