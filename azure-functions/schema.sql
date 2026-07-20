-- SFL Data Collector - Database Schema
-- Run this against your Azure PostgreSQL sfl_collector database

-- Farm snapshots: full JSON + computed diff
CREATE TABLE farm_snapshots (
  id BIGSERIAL PRIMARY KEY,
  farm_id BIGINT NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  game_data JSONB NOT NULL,
  diff JSONB,
  is_retained BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX idx_fs_farm_time ON farm_snapshots(farm_id, captured_at DESC);

-- P2P price changes: one row per item per change
CREATE TABLE price_changes (
  id BIGSERIAL PRIMARY KEY,
  item_name TEXT NOT NULL,
  price DOUBLE PRECISION NOT NULL,
  previous_price DOUBLE PRECISION,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_pc_item_time ON price_changes(item_name, captured_at DESC);
CREATE INDEX idx_pc_time ON price_changes(captured_at DESC);

-- NFT field changes: one row per (nft_id, field) per change
CREATE TABLE nft_changes (
  id BIGSERIAL PRIMARY KEY,
  nft_id INTEGER NOT NULL,
  nft_name TEXT,
  collection TEXT NOT NULL,
  field TEXT NOT NULL,
  value DOUBLE PRECISION NOT NULL,
  previous_value DOUBLE PRECISION,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_nc_nft_field_time ON nft_changes(nft_id, field, captured_at DESC);
CREATE INDEX idx_nc_time ON nft_changes(captured_at DESC);

-- Last known state (for quick diff)
CREATE TABLE last_known_prices (
  item_name TEXT PRIMARY KEY,
  price DOUBLE PRECISION NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE last_known_nft_values (
  nft_id INTEGER NOT NULL,
  field TEXT NOT NULL,
  value DOUBLE PRECISION NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (nft_id, field)
);



-- ============================================================
-- Marketplace Data Collector Tables
-- ============================================================

-- Daily per-item trading data (from marketplaceActivity API)
CREATE TABLE marketplace_daily (
  id BIGSERIAL PRIMARY KEY,
  date DATE NOT NULL,
  collection TEXT NOT NULL,
  item_id INTEGER NOT NULL,
  low DOUBLE PRECISION,
  high DOUBLE PRECISION,
  volume DOUBLE PRECISION,
  trades INTEGER,
  quantity DOUBLE PRECISION,
  latest_sale DOUBLE PRECISION,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (date, collection, item_id)
);
CREATE INDEX idx_md_coll_item ON marketplace_daily(collection, item_id, date DESC);
CREATE INDEX idx_md_date ON marketplace_daily(date DESC);

-- Daily market-wide totals + flower price
CREATE TABLE marketplace_totals (
  id BIGSERIAL PRIMARY KEY,
  date DATE NOT NULL UNIQUE,
  total_volume DOUBLE PRECISION,
  total_trades BIGINT,
  flower_price DOUBLE PRECISION,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Individual trades (from /collection endpoint history.sales)
CREATE TABLE marketplace_trades (
  id BIGSERIAL PRIMARY KEY,
  trade_id TEXT NOT NULL UNIQUE,
  collection TEXT NOT NULL,
  item_id INTEGER NOT NULL,
  sfl DOUBLE PRECISION NOT NULL,
  source TEXT,
  quantity INTEGER DEFAULT 1,
  fulfilled_at TIMESTAMPTZ NOT NULL,
  initiated_by_id BIGINT,
  initiated_by_name TEXT,
  fulfilled_by_id BIGINT,
  fulfilled_by_name TEXT,
  is_mine BOOLEAN NOT NULL DEFAULT FALSE,
  my_side TEXT,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_mt_coll_item ON marketplace_trades(collection, item_id, fulfilled_at DESC);
CREATE INDEX idx_mt_time ON marketplace_trades(fulfilled_at DESC);

-- Current listings/offers snapshot (latest state per item)
CREATE TABLE marketplace_orderbook (
  id BIGSERIAL PRIMARY KEY,
  collection TEXT NOT NULL,
  item_id INTEGER NOT NULL,
  side TEXT NOT NULL,
  order_id TEXT NOT NULL,
  sfl DOUBLE PRECISION NOT NULL,
  quantity INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL,
  created_by_id BIGINT,
  created_by_name TEXT,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (collection, item_id, side, order_id)
);
CREATE INDEX idx_mo_coll_item ON marketplace_orderbook(collection, item_id, side);

-- Orderbook historization for BOOSTED NFTs (orderbook-snapshot fn, hourly).
-- Historized metrics + price ladders per item per run (append-only).
CREATE TABLE ob_snap (
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
CREATE INDEX idx_obs_item_ts ON ob_snap(collection, item_id, ts DESC);
CREATE INDEX idx_obs_ts ON ob_snap(ts DESC);

-- Latest orderbook state per boosted item (upsert every run).
CREATE TABLE ob_last (
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

-- Optional: read-only user for Vercel
-- CREATE USER sfl_reader WITH PASSWORD 'your_password';
-- GRANT CONNECT ON DATABASE sfl_collector TO sfl_reader;
-- GRANT USAGE ON SCHEMA public TO sfl_reader;
-- GRANT SELECT ON ALL TABLES IN SCHEMA public TO sfl_reader;
-- ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO sfl_reader;

-- ============================================================
-- Investment Tracker — user-entered BTC deposit/withdrawal log
-- ============================================================
CREATE TABLE IF NOT EXISTS btc_transactions (
  id BIGSERIAL PRIMARY KEY,
  farm_id BIGINT NOT NULL,
  tx_date DATE NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('deposit','withdrawal')),
  btc_amount NUMERIC(20, 8) NOT NULL CHECK (btc_amount > 0),
  usd_amount NUMERIC(14, 2),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_btc_tx_farm ON btc_transactions(farm_id, tx_date DESC);
GRANT SELECT, INSERT, DELETE ON btc_transactions TO sfl_reader;
GRANT USAGE, SELECT ON SEQUENCE btc_transactions_id_seq TO sfl_reader;

-- Server-side wishlist (per farm; replaces browser localStorage).
CREATE TABLE wishlist (
  farm_id BIGINT NOT NULL,
  item_key TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 2,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (farm_id, item_key)
);
CREATE INDEX idx_wishlist_farm ON wishlist(farm_id);
