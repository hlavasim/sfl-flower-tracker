-- SPECULATION page (?page=speculation, farm 155498 only).
--
-- spec_trades: the owner's own position log — what was bought, how many, at what unit price, and
-- (once closed) what it sold for. One row per position; selling fills sell_price/sell_date in
-- place. `currency` because the same log holds crops (FLOWER) and Genesis eggs (RON).
CREATE TABLE IF NOT EXISTS spec_trades (
  id          BIGSERIAL PRIMARY KEY,
  farm_id     BIGINT           NOT NULL,
  item        TEXT             NOT NULL,
  currency    TEXT             NOT NULL DEFAULT 'FLOWER',
  qty         DOUBLE PRECISION NOT NULL CHECK (qty > 0),
  buy_price   DOUBLE PRECISION NOT NULL CHECK (buy_price >= 0),
  buy_date    DATE             NOT NULL,
  sell_price  DOUBLE PRECISION CHECK (sell_price >= 0),
  sell_date   DATE,
  notes       TEXT,
  created_at  TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_spec_trades_farm ON spec_trades(farm_id, buy_date DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON spec_trades TO sfl_reader;
GRANT USAGE, SELECT ON SEQUENCE spec_trades_id_seq TO sfl_reader;

-- egg_market: hourly snapshots of the Yakkamon Genesis egg market, pushed by the local collector
-- (C:\Users\hlava\yakkamon-egg-watch). Keyed on the snapshot's own timestamp so a re-sent
-- snapshot changes nothing. The payload is the collector's summary row plus the ask ladder.
CREATE TABLE IF NOT EXISTS egg_market (
  ts    TIMESTAMPTZ PRIMARY KEY,
  data  JSONB       NOT NULL
);
GRANT SELECT, INSERT ON egg_market TO sfl_reader;
