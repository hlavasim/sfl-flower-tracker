-- The Investment Tracker's REPAY PLAN: "take X % of peak exposure back out into BTC every
-- day / month / year, counting from start_date".
--
-- One row per farm, overwritten in place — it is a setting, not a ledger. The withdrawals it is
-- measured against stay in btc_transactions; the target itself is recomputed on read from
-- (peak exposure × rate ÷ period) so nothing derived is stored.

CREATE TABLE IF NOT EXISTS repay_plan (
  farm_id     BIGINT           NOT NULL PRIMARY KEY,
  start_date  DATE             NOT NULL,
  rate        DOUBLE PRECISION NOT NULL,          -- percent of peak exposure per period
  period      TEXT             NOT NULL DEFAULT 'year',  -- 'day' | 'month' | 'year'
  created_at  TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
  CONSTRAINT repay_plan_period_chk CHECK (period IN ('day', 'month', 'year')),
  CONSTRAINT repay_plan_rate_chk   CHECK (rate > 0)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON repay_plan TO sfl_reader;
