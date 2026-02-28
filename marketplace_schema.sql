-- Marketplace Data Collector - New Tables
-- Run this against Azure PostgreSQL sfl_collector database

-- Daily per-item trading data (from marketplaceActivity API)
CREATE TABLE IF NOT EXISTS marketplace_daily (
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
CREATE INDEX IF NOT EXISTS idx_md_coll_item ON marketplace_daily(collection, item_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_md_date ON marketplace_daily(date DESC);

-- Daily market-wide totals + flower price
CREATE TABLE IF NOT EXISTS marketplace_totals (
  id BIGSERIAL PRIMARY KEY,
  date DATE NOT NULL UNIQUE,
  total_volume DOUBLE PRECISION,
  total_trades BIGINT,
  flower_price DOUBLE PRECISION,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Individual trades (from /collection endpoint history.sales)
CREATE TABLE IF NOT EXISTS marketplace_trades (
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
CREATE INDEX IF NOT EXISTS idx_mt_coll_item ON marketplace_trades(collection, item_id, fulfilled_at DESC);
CREATE INDEX IF NOT EXISTS idx_mt_time ON marketplace_trades(fulfilled_at DESC);

-- Current listings/offers snapshot (latest state per item)
CREATE TABLE IF NOT EXISTS marketplace_orderbook (
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
CREATE INDEX IF NOT EXISTS idx_mo_coll_item ON marketplace_orderbook(collection, item_id, side);

-- Grant SELECT on new tables to sfl_reader
GRANT SELECT ON marketplace_daily TO sfl_reader;
GRANT SELECT ON marketplace_totals TO sfl_reader;
GRANT SELECT ON marketplace_trades TO sfl_reader;
GRANT SELECT ON marketplace_orderbook TO sfl_reader;
