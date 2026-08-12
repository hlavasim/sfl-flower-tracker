-- Yakkamon top-100 tier thresholds, over time.
--
-- The API serves ONE snapshot and no history: /leaderboard is rebuilt every 4 hours on the UTC
-- clock (01/05/09/13/17/21, at :00:57 — measured from consecutive builds exactly 4.00 h apart).
-- What a placing costs is only knowable if somebody keeps the snapshots, so we do.
--
-- Keyed on the BUILD's own timestamp, not on when we fetched it: re-reading the same build is
-- then an idempotent no-op, which is what lets a collector fire on a schedule, a page visit and
-- a manual retry without ever double-counting.
--
-- Only the four rank thresholds are kept, not the whole board. The full top-100 is ~5 KB a
-- build (11 MB/year); the thresholds are what every question on the page is actually asked
-- against, and the entries JSONB is there for the rare case that changes.

CREATE TABLE IF NOT EXISTS yk_leaderboard (
  generated_at  TIMESTAMPTZ PRIMARY KEY,        -- the build's own timestamp, from the API
  player_count  INTEGER     NOT NULL,
  p3            INTEGER     NOT NULL,           -- points at rank 3   (last Legendary A + B)
  p10           INTEGER     NOT NULL,           -- rank 10            (last Legendary A + C)
  p50           INTEGER     NOT NULL,           -- rank 50            (last Legendary A)
  p100          INTEGER     NOT NULL,           -- rank 100           (inside Legendary B)
  entries       JSONB,                          -- full top-100, when the collector sends it
  -- TRUE means the CONTENT was read off a real board but the TIMESTAMP was reconstructed from
  -- an "updated N min ago" label and pinned to the nearest 4-hour slot. A reconstruction must
  -- never be indistinguishable from an observation.
  derived       BOOLEAN     NOT NULL DEFAULT FALSE,
  captured_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS yk_leaderboard_gen_idx ON yk_leaderboard (generated_at DESC);

-- Backfill: everything gathered before the collector existed. ON CONFLICT DO NOTHING so this
-- migration is safe to re-run and never overwrites a later, better row.
INSERT INTO yk_leaderboard (generated_at, player_count, p3, p10, p50, p100, derived) VALUES
  ('2026-08-11T09:00:57Z', 41305, 380213,  79075, 18229, 17176, TRUE),
  ('2026-08-11T17:00:57Z', 43330, 380213, 129117, 19016, 17213, TRUE),
  ('2026-08-12T05:00:57Z', 44811, 380213, 129126, 19812, 17226, FALSE),
  ('2026-08-12T09:00:57Z', 45291, 380252, 129126, 20592, 17251, FALSE)
ON CONFLICT (generated_at) DO NOTHING;

-- The API role reads it and appends to it; it never edits or deletes a recorded build.
GRANT SELECT, INSERT ON yk_leaderboard TO sfl_reader;
