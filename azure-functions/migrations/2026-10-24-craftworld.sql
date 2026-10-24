-- CRAFT WORLD page: snapshots of the owner's Craft World base, read from his screenshots.
--
-- Craft World has no public API (the game server only answers a signed-in session), so the state
-- of the base — buildings and their levels, power, inventory, player level — is transcribed from
-- screenshots into one row per reading. Rows are never edited: the history is the progress.
-- The page reads them through farm-history?type=cw (sfl_reader: SELECT only); rows are written
-- with the admin role when a new screenshot comes in.

CREATE TABLE IF NOT EXISTS cw_snapshot (
  id        BIGSERIAL   PRIMARY KEY,
  farm_id   BIGINT      NOT NULL,              -- the SFL farm the tracker is keyed by (owner)
  taken_at  TIMESTAMPTZ NOT NULL,              -- when the screenshot was taken
  data      JSONB       NOT NULL,              -- { playerLevel, xp, xpNext, townHall, power, coin, buildings[], inventory{}, notes }
  source    TEXT,                              -- what it was read from ("screenshot", "chat")
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cw_snapshot_farm ON cw_snapshot (farm_id, taken_at DESC);
GRANT SELECT ON cw_snapshot TO sfl_reader;

-- First reading (2026-10-24, from chat): factories up to Copper, Steel being unlocked, 20,000 COIN
-- deposited. Levels unknown until the first screenshots.
INSERT INTO cw_snapshot (farm_id, taken_at, data, source)
SELECT 155498, '2026-10-24T10:00:00Z', '{
  "coin": 20000,
  "buildings": [
    {"slug": "earth-mine", "level": null}, {"slug": "mud", "level": null}, {"slug": "clay", "level": null},
    {"slug": "sand", "level": null}, {"slug": "copper", "level": null}, {"slug": "steel", "level": 1, "note": "odemyká se"}
  ],
  "notes": "Z chatu: továrny po Copper, Steel se odemyká, vloženo 20 000 COIN. Levely doplním ze screenshotů."
}'::jsonb, 'chat'
WHERE NOT EXISTS (SELECT 1 FROM cw_snapshot WHERE farm_id = 155498);

-- The entry investment, in the BTC ledger (Investment Tracker), venue `craftworld`:
--   99 Kč of new money (CZK 0.04601 USD on 2026-10-23, BTC 80,126 USD)      -> deposit
--   30 FLOWER moved from the farm (FLOWER 0.148 USD)                          -> sfl withdrawal + craftworld deposit
INSERT INTO btc_transactions (farm_id, tx_date, direction, btc_amount, usd_amount, flower_amount, notes, venue)
SELECT * FROM (VALUES
  (155498::bigint, DATE '2026-10-23', 'deposit',    0.00005685::numeric, 4.55::numeric, NULL::numeric, 'Craft World: 99 Kč (nové peníze) na COIN', 'craftworld'),
  (155498::bigint, DATE '2026-10-23', 'withdrawal', 0.00005544::numeric, 4.44::numeric, 30::numeric,   'Craft World: 30 FLOWER z farmy (přesun SFL → CRAFT)', 'sfl'),
  (155498::bigint, DATE '2026-10-23', 'deposit',    0.00005544::numeric, 4.44::numeric, 30::numeric,   'Craft World: 30 FLOWER z farmy (přesun SFL → CRAFT)', 'craftworld')
) AS v(farm_id, tx_date, direction, btc_amount, usd_amount, flower_amount, notes, venue)
WHERE NOT EXISTS (SELECT 1 FROM btc_transactions WHERE farm_id = 155498 AND venue = 'craftworld');
