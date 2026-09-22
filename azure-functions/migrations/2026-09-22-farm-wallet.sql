-- The owner's wallet addresses, read on-chain by the Investment Tracker (farm-history?type=venue-holdings).
--
-- Just addresses: an EVM address is the same on every chain, so each one is read on Base, Ronin,
-- Polygon and Ethereum and whatever lies where is summed. What an address holds decides the venue
-- (fungible tokens -> WALLET, Genesis eggs -> YAKKAMON), not a column here.

CREATE TABLE IF NOT EXISTS farm_wallet (
  farm_id   BIGINT      NOT NULL,
  address   TEXT        NOT NULL,           -- lower-case 0x…, 40 hex digits
  label     TEXT,
  added_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (farm_id, address)
);

GRANT SELECT, INSERT, DELETE ON farm_wallet TO sfl_reader;
