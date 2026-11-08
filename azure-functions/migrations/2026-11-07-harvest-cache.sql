-- WIDGET harvest cache: the game-code replay of each node kind's next harvests (core/engine/harvest-sim.mjs),
-- kept per farm and kind so section=widget replays only the kinds that changed. A row is served while
-- its key_hash (sha1 of everything that kind's yields depend on, harvestCacheInputs) still matches the
-- farm and valid_until (the kind's first node ready, or a few minutes for one ready already) is ahead.
-- Prices are not in here: the rows are amounts, valued per request.

CREATE TABLE IF NOT EXISTS harvest_cache (
  farm_id      BIGINT      NOT NULL,
  kind         TEXT        NOT NULL,
  key_hash     TEXT        NOT NULL,
  rows         JSONB       NOT NULL,
  valid_until  TIMESTAMPTZ NOT NULL,
  computed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (farm_id, kind),
  CONSTRAINT harvest_cache_kind_chk CHECK (kind ~ '^[a-z]{2,20}$')
);

GRANT SELECT, INSERT, UPDATE ON harvest_cache TO sfl_reader;
