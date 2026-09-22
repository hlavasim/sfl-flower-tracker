-- Reconcile sfl_reader's privileges with what the Vercel API (api/*.js) actually does today.
--
-- The grants had drifted out of the repo: some were only ever applied by hand in production
-- (btc_transactions PATCH columns, wishlist writes), so a database rebuilt from schema.sql +
-- migrations/ would break transaction editing, the wishlist and more with "permission denied".
-- This file restates the full set the API needs, per table, derived from its SQL:
--
--   api/farm-history.js        btc-tx (GET/POST/PATCH/DELETE), venue-balance, farm-wallet,
--                              repay-plan, spec (calendar/trades/eggs), yk-board, fishing,
--                              snapshots, world (via api/_world.js → world_agg writes)
--   api/marketplace-orderbook.js  wishlist GET/POST, flips, health, per-item orderbook
--   api/marks-history.js       marks reads + force-refresh (UPDATE marks_crawl_state)
--   api/*-history.js, marketplace-trades.js, farm-diff-agg.js   reads only
--
-- Idempotent: GRANT of a privilege already held is a no-op, so this can be re-run at any time.
-- A table that does not exist is skipped with a NOTICE instead of aborting the whole file (the
-- marks_* tables, for one, are created outside this repo's migrations).
--
-- Prerequisites: role sfl_reader exists; 2026-08-13-btc-tx-venue.sql and
-- 2026-09-01-btc-flower-amount.sql are applied (the column-level UPDATE names venue and
-- flower_amount). Run as the table owner (the collector's admin user).
--
-- NOT applied automatically. Apply with:  psql "$ADMIN_URL" -f 2026-09-22-grants-reconcile.sql

DO $$
DECLARE
  g RECORD;
BEGIN
  FOR g IN SELECT * FROM (VALUES
    -- ── read-only tables ────────────────────────────────────────────────────────────
    ('farm_snapshots',        'GRANT SELECT ON farm_snapshots TO sfl_reader'),
    ('price_changes',         'GRANT SELECT ON price_changes TO sfl_reader'),
    ('nft_changes',           'GRANT SELECT ON nft_changes TO sfl_reader'),
    ('last_known_prices',     'GRANT SELECT ON last_known_prices TO sfl_reader'),
    ('last_known_nft_values', 'GRANT SELECT ON last_known_nft_values TO sfl_reader'),
    ('marketplace_daily',     'GRANT SELECT ON marketplace_daily TO sfl_reader'),
    ('marketplace_totals',    'GRANT SELECT ON marketplace_totals TO sfl_reader'),
    ('marketplace_trades',    'GRANT SELECT ON marketplace_trades TO sfl_reader'),
    ('marketplace_orderbook', 'GRANT SELECT ON marketplace_orderbook TO sfl_reader'),
    ('ob_last',               'GRANT SELECT ON ob_last TO sfl_reader'),
    ('farm_world',            'GRANT SELECT ON farm_world TO sfl_reader'),
    ('cdn_ingest_state',      'GRANT SELECT ON cdn_ingest_state TO sfl_reader'),
    ('marks_snapshots',       'GRANT SELECT ON marks_snapshots TO sfl_reader'),
    ('marks_weeks',           'GRANT SELECT ON marks_weeks TO sfl_reader'),

    -- ── btc_transactions: the Investment Tracker ledger ─────────────────────────────
    -- PATCH may set any of these seven columns (never id / farm_id / created_at);
    -- 2026-08-13-btc-tx-venue.sql granted only `venue`, so every other edit was refused.
    ('btc_transactions',      'GRANT SELECT, INSERT, DELETE ON btc_transactions TO sfl_reader'),
    ('btc_transactions',      'GRANT UPDATE (tx_date, direction, btc_amount, usd_amount, flower_amount, notes, venue) ON btc_transactions TO sfl_reader'),
    ('btc_transactions_id_seq', 'GRANT USAGE, SELECT ON SEQUENCE btc_transactions_id_seq TO sfl_reader'),

    -- ── wishlist: GET + POST upsert/remove/replace (ON CONFLICT DO UPDATE needs UPDATE) ──
    ('wishlist',              'GRANT SELECT, INSERT, DELETE ON wishlist TO sfl_reader'),
    ('wishlist',              'GRANT UPDATE (priority, updated_at) ON wishlist TO sfl_reader'),

    -- ── Investment Tracker settings ─────────────────────────────────────────────────
    ('repay_plan',            'GRANT SELECT, INSERT, UPDATE, DELETE ON repay_plan TO sfl_reader'),
    ('farm_wallet',           'GRANT SELECT, INSERT, DELETE ON farm_wallet TO sfl_reader'),
    ('venue_balance',         'GRANT SELECT, INSERT, UPDATE, DELETE ON venue_balance TO sfl_reader'),

    -- ── SPECULATION page ───────────────────────────────────────────────────────────
    ('spec_trades',           'GRANT SELECT, INSERT, UPDATE, DELETE ON spec_trades TO sfl_reader'),
    ('spec_trades_id_seq',    'GRANT USAGE, SELECT ON SEQUENCE spec_trades_id_seq TO sfl_reader'),
    ('egg_market',            'GRANT SELECT, INSERT ON egg_market TO sfl_reader'),

    -- ── Yakkamon tier history (collect=1 inserts) ──────────────────────────────────
    ('yk_leaderboard',        'GRANT SELECT, INSERT ON yk_leaderboard TO sfl_reader'),

    -- ── World charts cache (api/_world.js computes on a miss and stores the result) ──
    ('world_agg',             'GRANT SELECT, INSERT, UPDATE, DELETE ON world_agg TO sfl_reader'),

    -- ── Marks crawler reset (marks-history?mode=force-refresh) ─────────────────────
    ('marks_crawl_state',     'GRANT SELECT ON marks_crawl_state TO sfl_reader'),
    ('marks_crawl_state',     'GRANT UPDATE (phase, roster, discover_cursor, crawl_cursor, updated_at) ON marks_crawl_state TO sfl_reader')
  ) AS t(obj, stmt)
  LOOP
    IF to_regclass('public.' || g.obj) IS NULL THEN
      RAISE NOTICE 'skipped, % does not exist: %', g.obj, g.stmt;
    ELSE
      EXECUTE g.stmt;
    END IF;
  END LOOP;
END $$;
