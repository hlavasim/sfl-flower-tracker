import { test } from "node:test";
import assert from "node:assert";
import { getPool } from "../../api/_db.js";

// The serverless pool: few connections, released fast, and nothing waits forever (the connection
// exhaustion came from 3 per warm instance held 30 s with no timeouts). An idle client's error
// must not crash the function.
test("pool: max 2, short idle, connect and statement timeouts, an error listener", () => {
  const p = getPool();
  assert.ok(p.options.max <= 2, String(p.options.max));
  assert.ok(p.options.idleTimeoutMillis <= 10000);
  assert.ok(p.options.connectionTimeoutMillis > 0 && p.options.connectionTimeoutMillis <= 10000);
  assert.ok(p.options.statement_timeout > 0 && p.options.statement_timeout <= 20000);
  assert.ok(p.listenerCount("error") > 0);
});

test("TLS: the source verifies the server certificate unless PGSSL_VERIFY=false", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../../api/_db.js", import.meta.url), "utf8");
  assert.match(src, /rejectUnauthorized: process\.env\.PGSSL_VERIFY !== "false"/);
  assert.doesNotMatch(src, /rejectUnauthorized: false/);
});
