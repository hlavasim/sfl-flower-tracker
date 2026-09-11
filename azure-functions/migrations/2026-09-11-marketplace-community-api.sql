-- The game walled /collection/{coll}/{id} and /marketplace behind its request-token layer on
-- 2026-09-01 (RT-001), which stopped the orderbook and trade collectors dead. The documented
-- community API replaces both, and carries MORE than the old per-item route did: one call to
-- marketplaceActivity now returns the whole catalogue with a market snapshot per item — floor,
-- bestOffer, listingCount, offerCount — live for ~1,600 items against the ~200 boosted ones the
-- old sweep could afford to visit.
--
-- Two schema gaps that snapshot opens up:

-- 1. marketplace_daily recorded only the trade stats, because the /data feed it was collected
--    from carries only those. The /community feed adds the book, so the daily row can hold the
--    top of it too: a per-item floor and liquidity series, hourly, for the whole catalogue.
--    Nullable throughout — rows written before today have no snapshot, and the API omits floor
--    or best_offer per item whenever that side of the book is empty.
ALTER TABLE marketplace_daily ADD COLUMN IF NOT EXISTS floor DOUBLE PRECISION;
ALTER TABLE marketplace_daily ADD COLUMN IF NOT EXISTS best_offer DOUBLE PRECISION;
ALTER TABLE marketplace_daily ADD COLUMN IF NOT EXISTS listing_count INTEGER;
ALTER TABLE marketplace_daily ADD COLUMN IF NOT EXISTS offer_count INTEGER;

-- 2. ob_last is now written by two passes at different rates: a shallow hourly one covering
--    every item from that single request, and a paced deep sweep (the endpoint throttles to
--    roughly one request per 5 seconds) that fills in the ladders, the pressure counts and
--    supply for the boosted items. deep_ts records when that second pass last reached an item,
--    so successive runs rotate oldest-first instead of re-reading the same head every hour.
--    NULL means "never swept deeply" and therefore sorts first.
ALTER TABLE ob_last ADD COLUMN IF NOT EXISTS deep_ts TIMESTAMPTZ;
