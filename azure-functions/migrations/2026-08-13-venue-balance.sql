-- What a venue is currently HOLDING, as opposed to what was sent to it.
--
-- The tracker only knew about BTC flowing in and out. Money sent to Yakkamon pre-registration
-- therefore looked spent, when it is parked: the deposit is refundable and the FLOWER is still
-- there. Without this the venue reads as a pure loss for the whole lock-up.
--
-- `source` is the point of the design. Right now the figure is typed in by hand, because
-- Yakkamon exposes no per-account balance. When the game ships one, the same row gets written
-- with source='game' and nothing else in the app has to change — the UI simply stops showing
-- the "typed in by hand" caveat. A manual figure must never be mistaken for a read one.
--
-- `unit` because a venue holds what it holds: FLOWER here, but a future one might hold anything.

CREATE TABLE IF NOT EXISTS venue_balance (
  farm_id   BIGINT           NOT NULL,
  venue     TEXT             NOT NULL,
  amount    DOUBLE PRECISION NOT NULL,
  unit      TEXT             NOT NULL DEFAULT 'FLOWER',
  source    TEXT             NOT NULL DEFAULT 'manual',   -- 'manual' | 'game'
  noted_at  TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
  PRIMARY KEY (farm_id, venue)
);

-- One row per farm+venue, overwritten in place: this is a current balance, not a ledger. The
-- ledger is btc_transactions and stays append-only.
GRANT SELECT, INSERT, UPDATE, DELETE ON venue_balance TO sfl_reader;
