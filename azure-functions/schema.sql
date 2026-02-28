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

-- Optional: read-only user for Vercel
-- CREATE USER sfl_reader WITH PASSWORD 'your_password';
-- GRANT CONNECT ON DATABASE sfl_collector TO sfl_reader;
-- GRANT USAGE ON SCHEMA public TO sfl_reader;
-- GRANT SELECT ON ALL TABLES IN SCHEMA public TO sfl_reader;
-- ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO sfl_reader;
