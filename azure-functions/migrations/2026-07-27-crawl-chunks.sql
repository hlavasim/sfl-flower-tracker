-- Work-queue crawl: replace the single global cursor with a tiled set of id ranges.
--
-- Why: a single cursor cannot say WHICH parts of the id space have been covered, so
-- "nothing was skipped" was an article of faith. Chunks tile [0, infinity) with no
-- gaps and no overlaps, each is marked done only after paging actually reached its
-- upper bound, and a sweep is complete only when zero chunks are left — so coverage
-- is an invariant that can be QUERIED (see the tiling check at the bottom).
--
-- Why chunk sizes are not uniform: the id space is not uniformly dense. Legacy ids
-- run 1..~194k with a real farm every ~1-3 ids, while web2 account ids are huge and
-- sparse — one measured page of 20 farms spanned ids 9,109,857,421 to
-- 252,221,646,406 (2026-07-27). Slicing that tail by a fixed id width would produce
-- millions of empty chunks, so it stays ONE unbounded chunk crawled by following
-- next_cursor. Only the dense legacy head is sliced.
--
-- Ordering: the web2 tail holds most of the population (~500k of 656k farms) and
-- crawls ~180x faster (80 farms/page vs a forced window of 1 in the legacy range,
-- where ~36% of ids are unservable), so it goes FIRST — bulk data in ~30h instead of
-- ~50 days. The legacy head then follows newest-id-first.

CREATE TABLE IF NOT EXISTS crawl_chunks (
  from_id     BIGINT PRIMARY KEY,   -- inclusive
  to_id       BIGINT,               -- exclusive; NULL = unbounded (the web2 tail)
  priority    INTEGER NOT NULL DEFAULT 100,
  status      TEXT NOT NULL DEFAULT 'pending',  -- pending | running | done | blocked
  cursor      TEXT,                 -- resume point inside this chunk
  farms       INTEGER NOT NULL DEFAULT 0,
  fail_streak INTEGER NOT NULL DEFAULT 0,
  started_at  TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  note        TEXT
);
CREATE INDEX IF NOT EXISTS idx_chunk_next ON crawl_chunks(priority, from_id) WHERE status <> 'done';

-- The boundary between the dense legacy head and the sparse web2 tail. Above the
-- highest known legacy id (193,755 seen in the live leaderboard) and far below the
-- start of the web2 block (9,109,857,421), so the split lands in empty space and
-- every farm falls in exactly one chunk.
-- Legacy head: 100 chunks of 10,000 ids, priority 100 (id 0) .. 1 (id 990,000) so
-- the newest legacy ids are crawled first.
INSERT INTO crawl_chunks (from_id, to_id, priority)
SELECT g, g + 10000, 100 - (g / 10000)
  FROM generate_series(0, 990000, 10000) AS g
ON CONFLICT (from_id) DO NOTHING;

-- Web2 tail: unbounded, crawled first.
INSERT INTO crawl_chunks (from_id, to_id, priority)
VALUES (1000000, NULL, 0)
ON CONFLICT (from_id) DO NOTHING;

GRANT SELECT ON crawl_chunks TO sfl_reader;

-- ── Coverage invariant ───────────────────────────────────────────────────────
-- Must return ZERO rows. Each chunk's upper bound has to equal the next chunk's
-- lower bound (no gap, no overlap), the first chunk must start at 0, and exactly
-- the last chunk may be unbounded.
--
-- SELECT * FROM (
--   SELECT from_id, to_id,
--          LEAD(from_id) OVER (ORDER BY from_id) AS next_from
--     FROM crawl_chunks
-- ) t
-- WHERE (next_from IS NOT NULL AND to_id IS DISTINCT FROM next_from)   -- gap/overlap
--    OR (next_from IS NULL AND to_id IS NOT NULL)                     -- tail bounded
--    OR (next_from IS NOT NULL AND to_id IS NULL);                    -- unbounded in middle
