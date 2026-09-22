// Which of a table's expected columns actually exist in the connected database.
//
// The collectors in this repo can be deployed ahead of the migration that adds the columns
// they write. Writing a missing column does not fail loudly — the statement errors, the
// surrounding transaction rolls back, and the collector logs one line an hour that nobody
// reads (marketplace-activity did exactly that against a DB without 2026-09-11). So a
// collector asks here once per process, writes only the columns that exist, and logs an
// error naming the migration to apply.
//
// Cached per process: the answer changes only when a migration runs, and a host restart
// (every deploy) clears it.
const _cache = new Map();

/**
 * @returns {Promise<Set<string>>} the subset of `cols` present on `table`
 */
async function presentColumns(pool, table, cols) {
  const key = `${table}:${cols.join(",")}`;
  if (_cache.has(key)) return _cache.get(key);
  const r = await pool.query(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = $1 AND column_name = ANY($2)`,
    [table, cols]
  );
  const have = new Set(r.rows.map((x) => x.column_name));
  _cache.set(key, have);
  return have;
}

/** Test hook: forget what earlier calls saw. */
function _resetSchemaCache() { _cache.clear(); }

module.exports = { presentColumns, _resetSchemaCache };
