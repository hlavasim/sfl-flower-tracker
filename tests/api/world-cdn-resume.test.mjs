import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";

// world-cdn: a new day's dump must start from record 0. The state upsert kept the previous dump's
// records_done, so after one failed first run of a new dump the next run "resumed" past that many
// records of a file it had never read. A failing stream must leave its error in the state row.
const SRC = readFileSync(new URL("../../azure-functions/world-cdn/index.js", import.meta.url), "utf8");

test("a new dump resets the progress counters in the state upsert", () => {
  for (const col of ["records_done", "changed", "unchanged", "bad"]) {
    const same = String.raw`CASE WHEN cdn_ingest_state\.dump_path = EXCLUDED\.dump_path\s+THEN cdn_ingest_state\.` + col;
    assert.match(SRC, new RegExp(col + " = " + same + String.raw` ELSE (\$3|0) END`), col);
  }
});

test("a stream failure is recorded in last_error and rethrown", () => {
  assert.match(SRC, /catch \(e\) \{[\s\S]{0,200}UPDATE cdn_ingest_state SET last_error = \$1[\s\S]{0,120}throw e;/);
});
