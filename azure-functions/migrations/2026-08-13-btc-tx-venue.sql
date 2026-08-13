-- Where the money actually went.
--
-- The tracker logged BTC in and out of "the farm" as a single pot, which stopped being true the
-- moment a deposit went to Yakkamon pre-registration instead of into Sunflower Land. Those are
-- different bets with different lock-ups and different exits, and a combined figure answers
-- neither "how much is in the farm" nor "how much is in Yakkamon".
--
-- Free text rather than an enum: a third venue will turn up long before anyone wants to run a
-- migration for it, and the UI offers the known ones as choices.

ALTER TABLE btc_transactions
  ADD COLUMN IF NOT EXISTS venue TEXT NOT NULL DEFAULT 'sfl';

-- Existing rows keep 'sfl' by the default above: every transaction logged before this column
-- existed predates the Yakkamon deposit programme, which only opened 2026-08-10. Retagging is a
-- UI action, not a guess made here.
CREATE INDEX IF NOT EXISTS btc_transactions_farm_venue_idx ON btc_transactions (farm_id, venue);

-- The API already had SELECT/INSERT/DELETE. Retagging a row needs UPDATE, and only of this one
-- column — amounts and dates stay append-only, so a mistyped entry is deleted and re-added
-- rather than quietly edited.
GRANT UPDATE (venue) ON btc_transactions TO sfl_reader;
