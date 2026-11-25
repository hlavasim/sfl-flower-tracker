import { test } from "node:test";
import assert from "node:assert";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { localRoutes, parseEnvFile, devDbEnv } from "../../dev-server.mjs";

// Local development runs every api/* handler on localhost against the production database,
// read-only and with one connection, so nothing local can write production or exhaust its slots.

test("every public api/* handler is served locally; helpers (_*.js) are not routes", () => {
  const r = localRoutes();
  for (const p of ["/api/compute", "/api/farm-history", "/api/marketplace-orderbook", "/api/proxy",
    "/api/price-history", "/api/nft-history", "/api/marks-history", "/api/track",
    "/api/marketplace-trades", "/api/marketplace-history", "/api/farm-diff-agg"]) {
    assert.ok(r[p], `missing ${p}`);
  }
  assert.ok(!Object.keys(r).some((p) => p.includes("/_")), Object.keys(r).join(","));
});

test("vercel.json rewrites with a query are honoured (/api/stats → track?type=read)", () => {
  const r = localRoutes();
  assert.deepStrictEqual(r["/api/stats"], { file: "./api/track.js", query: { type: "read" } });
});

test(".env.local parser: KEY=VALUE lines, comments and blanks skipped, quotes stripped", () => {
  const dir = mkdtempSync(join(tmpdir(), "devenv-"));
  const f = join(dir, ".env.local");
  writeFileSync(f, "# c\n\nPGHOST=h.example\nPGUSER=\"u\"\nX='y=z'\n");
  assert.deepStrictEqual(parseEnvFile(f), { PGHOST: "h.example", PGUSER: "u", X: "y=z" });
  assert.deepStrictEqual(parseEnvFile(join(dir, "missing")), {});
});

test("the local DB session is read-only with one connection, whatever .env.local says", () => {
  const env = devDbEnv({ PGOPTIONS: "-c foo=bar", PG_POOL_MAX: "5" });
  assert.match(env.PGOPTIONS, /default_transaction_read_only=on/);
  assert.strictEqual(env.PG_POOL_MAX, "1");
  // One connection means a page's parallel reads queue for it; they wait, not fail at 5 s.
  assert.strictEqual(env.PG_CONNECT_TIMEOUT_MS, "60000");
});

test("the pool takes its slot-wait timeout from PG_CONNECT_TIMEOUT_MS (default 5 s)", () => {
  const src = readFileSync(new URL("../../api/_db.js", import.meta.url), "utf8");
  assert.match(src, /connectionTimeoutMillis: Number\(process\.env\.PG_CONNECT_TIMEOUT_MS\) \|\| 5000/);
});

test("the pool honours PG_POOL_MAX (capped at 2) for local runs", () => {
  const src = readFileSync(new URL("../../api/_db.js", import.meta.url), "utf8");
  assert.match(src, /max: Math\.min\(2, Number\(process\.env\.PG_POOL_MAX\) \|\| 2\)/);
});

test("review #1: compute's game-API calls go to the LOCAL proxy, and no KV credentials reach a local run", async () => {
  const env = devDbEnv({ KV_REST_API_URL: "https://kv", KV_REST_API_TOKEN: "t", PROXY_ORIGIN: "https://sunflower.sajmonium.quest" }, 3000);
  assert.strictEqual(env.PROXY_ORIGIN, "http://127.0.0.1:3000");
  assert.ok(!("KV_REST_API_URL" in env) && !("KV_REST_API_TOKEN" in env));
});

test("review #5: dot paths (.env.local, .git, .vercel) are never served; only a local Host is answered", async () => {
  const { servablePath, localHost } = await import("../../dev-server.mjs");
  for (const p of ["/.env.local", "/.git/config", "/api/../.env", "/x/.vercel/project.json", "/%2Eenv.local"]) assert.strictEqual(servablePath(p), false, p);
  for (const p of ["/", "/flowers.html", "/app/store.mjs", "/core/browser-engine.mjs"]) assert.strictEqual(servablePath(p), true, p);
  for (const h of ["localhost:3000", "127.0.0.1:3000", "[::1]:3000", "localhost"]) assert.strictEqual(localHost(h), true, h);
  for (const h of ["evil.example:3000", "", undefined, "localhost.evil.example"]) assert.strictEqual(localHost(h), false, String(h));
});
