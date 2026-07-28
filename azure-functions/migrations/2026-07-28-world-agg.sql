-- Precomputed World-page aggregations.
--
-- The page's charts each need a GROUP BY over farm_world. Measured against production:
--   mode=nodes&node=trees (scope all, 656k rows)  18.7 s
--   agg&group=total_level                         14.1 s
--   agg&group=island_type                         10.5 s
-- so a page load cost ~19 s and every change of the activity filter paid it again — for
-- data the daily CDN ingest only changes once per day.
--
-- One row per (generation, scope, dimension) holding that chart's finished response body.
-- Storing the whole payload rather than key/value rows keeps the reader trivial: it returns
-- what it found, with no reassembly, and a new chart needs no schema change.
--
-- `gen` is the ingest generation — cdn_ingest_state.dump_path, i.e. which daily dump the
-- numbers describe. Rows are only ever read for the CURRENT gen, so when tomorrow's dump
-- lands every cached payload is ignored and recomputed. Without that key a value written by
-- the lazy fallback would be served forever, quietly frozen on yesterday's farms.
CREATE TABLE IF NOT EXISTS world_agg (
  gen         TEXT        NOT NULL,
  scope       TEXT        NOT NULL,   -- 'all' | number of active days as text
  dim         TEXT        NOT NULL,   -- 'island_type' | 'total_level' | 'nodes:trees' | …
  payload     JSONB       NOT NULL,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (gen, scope, dim)
);

-- The reader always filters on gen; this also makes dropping superseded generations cheap.
CREATE INDEX IF NOT EXISTS idx_world_agg_gen ON world_agg(gen);

GRANT SELECT ON world_agg TO sfl_reader;
-- The API writes here: any chart it had to compute live is stored so the next request for
-- the same (gen, scope, dim) is served from this table instead of scanning farm_world.
GRANT INSERT, UPDATE, DELETE ON world_agg TO sfl_reader;
