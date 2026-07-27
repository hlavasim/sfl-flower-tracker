-- World crawl: every farm in the game, swept continuously via the batch
-- /community/farms endpoint (cursor = base64(lastId), verified 2026-07-27).
--
-- Storage note: farm_world stores BOTH a narrow set of scalar columns AND the
-- full per-farm JSON (game_data). The scalars exist so hot queries (group by
-- island, filter by ban status, sort by level) don't need a jsonb path
-- extraction on every one of 656k+ rows; game_data exists so a stat nobody
-- thought of yet doesn't need a code change + redeploy + a full new sweep to
-- become available — it's already sitting there. This is affordable: measured
-- on this exact data, Postgres's lz4 TOAST compression runs ~2.3-2.4x, and farm
-- size across the live id range averages ~17-26 KB raw (2026-07-27 sample) —
-- 656k farms compressed lands around 6-11 GB, comfortably inside the 32 GB
-- instance (~750 MB used before this feature). This is upserted CURRENT STATE,
-- one row per farm, not a snapshot log — it does not grow with every sweep.
-- Nothing here writes to farm_snapshots (that table is the separate, full-
-- history log for the small whitelist of farms tracked individually).

-- ── Current state, one row per farm (upsert on every visit) ──
CREATE TABLE IF NOT EXISTS farm_world (
  farm_id            BIGINT PRIMARY KEY,
  nft_id             BIGINT,
  username           TEXT,
  created_at         TIMESTAMPTZ,
  island_type        TEXT,          -- basic | spring | desert | volcano | swamp
  island_biome       TEXT,
  ascension_level    INTEGER,       -- island.ascensionLevel (0 = not ascended)
  expansions         INTEGER,       -- inventory["Basic Land"]
  island_upgraded_at TIMESTAMPTZ,
  xp                 DOUBLE PRECISION,
  total_level        INTEGER,       -- xp+ascension_level -> level, uncapped past 200
                                     -- (see azure-functions/shared/world-extract.js)
  balance            DOUBLE PRECISION,  -- SFL
  coins              DOUBLE PRECISION,
  gems               DOUBLE PRECISION,
  ban_status         TEXT,          -- ok | investigating | permanent
  verified           BOOLEAN,
  vip_until          TIMESTAMPTZ,
  inventory          JSONB,         -- item map alone, kept separate from game_data
                                     -- so the item-holders query (api/_world.js
                                     -- mode=item) reads a small column, not the
                                     -- whole farm, on every row it scans
  first_seen_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_changed_at    TIMESTAMPTZ,
  sweep              INTEGER
);
CREATE INDEX IF NOT EXISTS idx_fw_island   ON farm_world(island_type);
CREATE INDEX IF NOT EXISTS idx_fw_ban      ON farm_world(ban_status);
CREATE INDEX IF NOT EXISTS idx_fw_asc      ON farm_world(ascension_level);
CREATE INDEX IF NOT EXISTS idx_fw_exp      ON farm_world(expansions);
ALTER TABLE farm_world ADD COLUMN IF NOT EXISTS total_level INTEGER;
CREATE INDEX IF NOT EXISTS idx_fw_level    ON farm_world(total_level);
-- Full per-farm state (minus previousInventory/previousWardrobe/previousBalance —
-- pure shadow copies of fields already kept, see shared/world-extract.js) so a
-- future stat is a query, not a redeploy + a full new sweep.
ALTER TABLE farm_world ADD COLUMN IF NOT EXISTS game_data JSONB;
CREATE INDEX IF NOT EXISTS idx_fw_seen     ON farm_world(last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_fw_changed  ON farm_world(last_changed_at DESC);

-- ── Append-only change log of the scalar fields (never pruned) ──
CREATE TABLE IF NOT EXISTS farm_world_changes (
  id      BIGSERIAL PRIMARY KEY,
  farm_id BIGINT NOT NULL,
  ts      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sweep   INTEGER,
  diff    JSONB NOT NULL   -- { field: [old, new] }
);
CREATE INDEX IF NOT EXISTS idx_fwc_farm ON farm_world_changes(farm_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_fwc_ts   ON farm_world_changes(ts DESC);

-- ── Crawler position + counters (single row) ──
CREATE TABLE IF NOT EXISTS crawl_state (
  id               INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  cursor           TEXT,                        -- NULL = start of a fresh sweep
  last_id          BIGINT,                      -- decoded cursor, for skip arithmetic
  window_size      INTEGER NOT NULL DEFAULT 40, -- adaptive page size
  sweep            INTEGER NOT NULL DEFAULT 1,
  sweep_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  farms_this_sweep INTEGER NOT NULL DEFAULT 0,
  req_ok           BIGINT NOT NULL DEFAULT 0,
  req_429          BIGINT NOT NULL DEFAULT 0,
  req_5xx          BIGINT NOT NULL DEFAULT 0,
  skipped          BIGINT NOT NULL DEFAULT 0,
  stuck_count      INTEGER NOT NULL DEFAULT 0, -- consecutive 5xx at window_size = 1
  last_error       TEXT,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE crawl_state ADD COLUMN IF NOT EXISTS stuck_count INTEGER NOT NULL DEFAULT 0;
-- EWMA of bytes per farm, used to size the next page against the response cap.
ALTER TABLE crawl_state ADD COLUMN IF NOT EXISTS avg_farm_bytes DOUBLE PRECISION;
INSERT INTO crawl_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ── One row per completed sweep ──
CREATE TABLE IF NOT EXISTS crawl_sweeps (
  sweep        INTEGER PRIMARY KEY,
  started_at   TIMESTAMPTZ,
  finished_at  TIMESTAMPTZ,
  farms        INTEGER,
  req_ok       BIGINT,
  req_429      BIGINT,
  req_5xx      BIGINT,
  skipped      BIGINT
);

-- ── Id ranges stepped over because the upstream cannot serve them (HTTP 500 even
-- at limit=1, and even from /community/farms/{id} — e.g. farm 54). Pages arrive in
-- ascending farm_id order and cursor = base64(lastId), so cursor = base64(lastId+n)
-- resumes n ids further on; these rows record what that jump may have skipped, so it
-- can be re-probed individually later.
CREATE TABLE IF NOT EXISTS crawl_skips (
  id       BIGSERIAL PRIMARY KEY,
  sweep    INTEGER,
  cursor   TEXT,              -- cursor we were stuck on
  from_id  BIGINT NOT NULL,   -- last id successfully seen
  to_id    BIGINT NOT NULL,   -- id the cursor was moved to
  attempts INTEGER,
  ts       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cskip_ts ON crawl_skips(ts DESC);

-- ── Registry of individual ids the upstream cannot serve (HTTP 500 even from
-- /community/farms/{id}). Once known, the crawler stops its window just before such
-- an id and steps over it with no HTTP request at all, so a bad record costs one
-- bisection on the first sweep and nothing on every sweep after that.
CREATE TABLE IF NOT EXISTS crawl_bad_ids (
  farm_id      BIGINT PRIMARY KEY,
  first_seen   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_checked TIMESTAMPTZ,
  attempts     INTEGER NOT NULL DEFAULT 1,
  recovered_at TIMESTAMPTZ            -- set if a later re-probe succeeds
);
CREATE INDEX IF NOT EXISTS idx_bad_active ON crawl_bad_ids(farm_id) WHERE recovered_at IS NULL;

-- Vercel reads through sfl_reader (read-only by default, granted per table).
GRANT SELECT ON farm_world, farm_world_changes, crawl_state, crawl_sweeps, crawl_skips, crawl_bad_ids TO sfl_reader;

-- Furthest expansion a farm could reach right now with what it has banked, encoded as
-- an integer slot (phase*1000 + expansions) so it sorts numerically — a text label
-- would put "A1-10" before "A1-2". See azure-functions/shared/expansion-reach.js.
ALTER TABLE farm_world ADD COLUMN IF NOT EXISTS reach_slot INTEGER;
CREATE INDEX IF NOT EXISTS idx_fw_reach ON farm_world(reach_slot);

-- Level a farm would be at after eating the food it already has cooked, valued with
-- that farm's own cooking boosts and a simulated x1.5 pet streak (the boosts come
-- from core/engine/cooking.mjs via shared/cooking-xp.js). total_level is the plain,
-- un-fed level; this is the fed one.
ALTER TABLE farm_world ADD COLUMN IF NOT EXISTS effective_level INTEGER;
CREATE INDEX IF NOT EXISTS idx_fw_efflevel ON farm_world(effective_level);

-- world-crawl and world-refresh share one API key and therefore one rate limit, so
-- they must not run at once — concurrently they would just trade 429s and burn the
-- budget on backoff sleeps. world-refresh claims this window; world-crawl skips its
-- tick while it is held, giving a predictable split instead of contention.
ALTER TABLE crawl_state ADD COLUMN IF NOT EXISTS refresh_until TIMESTAMPTZ;

-- Activity filter for the refresh loop.
--
-- No extra index: EXPLAIN ANALYZE on the real query shows the planner walking
-- idx_fw_seen (the ORDER BY last_seen_at path) and applying the COALESCE as a filter,
-- stopping at LIMIT 100 — 0.3 ms. An index on the COALESCE expression went unused, so
-- it would only add write cost on every one of 656k rows.
--
-- There is no usable game-side "last played" field in the batch payloads: the wrapper
-- `updatedAt` (which IS last-played) is only returned by the single-farm endpoint, and
-- `bumpkin.updatedAt` means "bumpkin last modified" — it reads 2023-06-06 on farm
-- 155498, which is played daily, so filtering on it would drop active farms. So
-- activity is taken from our OWN observations instead: last_changed_at is set whenever
-- a farm's tracked scalars move, and first_seen_at bounds farms we have never yet seen
-- change. COALESCE(last_changed_at, first_seen_at) is therefore "the last time we had
-- any evidence this farm was alive".

-- Fingerprint of the inventory, tracked as a scalar so item movement counts as activity.
-- Without it a farm that only plants seeds (inventory down, xp/coins unmoved) reads as
-- unchanged, which would let the refresh window drop farms that are actually being
-- played. Must be backfilled when added: comparing NULL against a fresh hash would mark
-- every farm changed on its next visit and reset everyone's activity window at once.
ALTER TABLE farm_world ADD COLUMN IF NOT EXISTS inventory_hash TEXT;

-- Two fields the community CDN dump carries on the wrapper that no public API endpoint
-- exposes. last_activity is the real "last played" time — it replaces the
-- COALESCE(last_changed_at, first_seen_at) heuristic the refresh loop had to invent
-- because neither batch endpoint returned it.
ALTER TABLE farm_world ADD COLUMN IF NOT EXISTS last_activity TIMESTAMPTZ;
ALTER TABLE farm_world ADD COLUMN IF NOT EXISTS is_blacklisted BOOLEAN;
CREATE INDEX IF NOT EXISTS idx_fw_last_activity ON farm_world(last_activity DESC);

-- Progress of the daily community-CDN ingest (world-cdn). records_done lets a run cut
-- short by the host's 10-minute timeout resume at the next record instead of restarting;
-- it is reset whenever a new day's dump appears.
CREATE TABLE IF NOT EXISTS cdn_ingest_state (
  id               INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  dump_path        TEXT,
  dump_modified_at TIMESTAMPTZ,
  started_at       TIMESTAMPTZ,
  finished_at      TIMESTAMPTZ,
  records_done     BIGINT NOT NULL DEFAULT 0,
  changed          BIGINT NOT NULL DEFAULT 0,
  bad              BIGINT NOT NULL DEFAULT 0,
  complete         BOOLEAN NOT NULL DEFAULT FALSE,
  last_error       TEXT,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO cdn_ingest_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
GRANT SELECT ON cdn_ingest_state TO sfl_reader;
