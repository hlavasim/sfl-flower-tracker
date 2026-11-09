-- FLOWER/USDC full-range LP leaderboard snapshots, pushed daily from the owner's PC
-- (farm-history?type=spec&what=lp). data = { price, owners: [{ usd, flower, usdc, mine }] }, no addresses.

CREATE TABLE IF NOT EXISTS lp_leaderboard (
  ts    TIMESTAMPTZ NOT NULL PRIMARY KEY DEFAULT NOW(),
  data  JSONB       NOT NULL
);

GRANT SELECT, INSERT ON lp_leaderboard TO sfl_reader;
