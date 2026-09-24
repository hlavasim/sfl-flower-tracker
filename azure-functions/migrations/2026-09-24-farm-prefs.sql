-- Page choices shared between devices: what the owner ticks and picks on the tracker (roadmap
-- picks and filters, POWER products, plans, budgets…). They lived in each browser's localStorage,
-- so the phone and the PC had to be set up twice. One row per farm and localStorage key; the value
-- is the exact string the page stores. Device-only state (zoom, width, open sections, tokens,
-- caches) is never sent here — the page decides which keys sync.

CREATE TABLE IF NOT EXISTS farm_prefs (
  farm_id     BIGINT      NOT NULL,
  key         TEXT        NOT NULL,
  value       TEXT        NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (farm_id, key),
  CONSTRAINT farm_prefs_key_chk CHECK (key ~ '^sfl_[a-z0-9_]{1,40}$'),
  CONSTRAINT farm_prefs_len_chk CHECK (length(value) <= 20000)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON farm_prefs TO sfl_reader;
