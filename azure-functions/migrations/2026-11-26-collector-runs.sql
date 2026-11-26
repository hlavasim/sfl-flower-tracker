-- One row per collector: when it last ran, when a run last succeeded, and the last error.
-- farm-snapshot skips the insert when the farm did not change, so on a quiet night farm_snapshots
-- stops growing while the collector runs fine; the health check (?health=1) reads last_ok here
-- instead of trusting only the age of the last insert. Written by the collectors' own role.

CREATE TABLE IF NOT EXISTS collector_runs (
  name        TEXT        PRIMARY KEY,
  last_run    TIMESTAMPTZ NOT NULL,
  last_ok     TIMESTAMPTZ,
  last_error  TEXT
);

GRANT SELECT ON collector_runs TO sfl_reader;
