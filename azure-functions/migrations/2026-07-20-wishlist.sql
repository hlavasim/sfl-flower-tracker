-- Server-side wishlist (moved off browser localStorage so it persists across
-- devices and can be edited server-side). One row per (farm, item).
-- item_key = "collection:Name" (collectibles/wearables), priority 1..3.
CREATE TABLE IF NOT EXISTS wishlist (
  farm_id BIGINT NOT NULL,
  item_key TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 2,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (farm_id, item_key)
);
CREATE INDEX IF NOT EXISTS idx_wishlist_farm ON wishlist(farm_id);
