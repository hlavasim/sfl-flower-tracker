-- Craft World removed from the tracker (v6.37). Applied 2026-11-09; rows backed up off-repo first.
DELETE FROM btc_transactions WHERE farm_id = 155498 AND (venue = 'craftworld' OR notes ILIKE 'Craft World:%');
DELETE FROM venue_balance WHERE venue = 'craftworld';
-- cw_snapshot (the page's base snapshots) is kept but no longer read by anything.
