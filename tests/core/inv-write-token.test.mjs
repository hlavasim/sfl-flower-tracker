import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import vm from "node:vm";

/*
 * Page side of the write-token change, run on the page's OWN functions lifted out of flowers.html
 * (same technique as wishlist-escaping.test.mjs):
 *   - renderInvTxTable must not let a ledger string become markup or code. `venue` went raw into
 *     onclick="_invCycleVenue(id,'<venue>')" and into the chip label — a stored XSS.
 *   - writeFetch adds x-write-token, asks once on a 401 and retries once; background reads
 *     (quiet) and a 503 never pop the dialog.
 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const page = readFileSync(path.join(ROOT, "flowers.html"), "utf8");

function lift(name) {
  const i = page.indexOf(`function ${name}(`);
  assert.ok(i > 0, `${name} not found in flowers.html`);
  let depth = 0;
  for (let k = page.indexOf("{", i); k < page.length; k++) {
    if (page[k] === "{") depth++;
    else if (page[k] === "}") { depth--; if (depth === 0) return page.slice(i, k + 1); }
  }
  throw new Error(`could not slice ${name}`);
}
const decodeAttr = (s) => s.replace(/&quot;/g, '"').replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/&amp;/g, "&");

test("a hostile ledger row renders as text: no tag, no attribute break-out, venue handed over verbatim", () => {
  const ctx = vm.createContext({});
  vm.runInContext(lift("escHTML") + "\n" + lift("renderInvTxTable") +
    `\nconst invVenues = { sfl: { label: "SFL", color: "x" } };`, ctx);
  const venue = `x');alert(1)//"><img src=x onerror=alert(2)>`;
  const html = vm.runInContext("renderInvTxTable", ctx)([{
    id: 7, direction: "deposit", btc_amount: "0.01", usd_amount: null, flower_amount: null,
    tx_date: "2026-09-01<script>", notes: `"><svg onload=alert(3)>`, venue,
  }]);
  assert.ok(!/<img|<svg|<script/i.test(html), "no injected tag survives");
  assert.ok(!html.includes("alert(1)//'"), "venue is not spliced into a JS string");
  // The chip passes the venue through data-*, and the browser decodes the attribute back to it.
  const m = html.match(/data-venue="([^"]*)"/);
  assert.ok(m, "venue rides on a data attribute");
  assert.equal(decodeAttr(m[1]), venue.toLowerCase());
  assert.match(html, /onclick="_invCycleVenue\(this\.dataset\.id, this\.dataset\.venue\)"/);
});

function harness({ stored = null, answers = [], promptReply = null }) {
  const store = stored == null ? {} : { sfl_write_token: stored };
  const calls = [], prompts = [];
  const ctx = vm.createContext({
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
    prompt: (msg) => { prompts.push(msg); return promptReply; },
    fetch: async (url, init) => { calls.push({ url, headers: init.headers, method: init.method }); return { status: answers.shift() ?? 200 }; },
  });
  // lift() starts at `function`, so the `async` in front of writeFetch is put back by hand.
  vm.runInContext(lift("writeHeaders") + "\n" + lift("askWriteToken") + "\nasync " + lift("writeFetch"), ctx);
  return { writeFetch: vm.runInContext("writeFetch", ctx), calls, prompts, store };
}

test("writeFetch sends the stored token and keeps the caller's headers", async () => {
  const h = harness({ stored: "abc" });
  const r = await h.writeFetch("/api/x", { method: "POST", headers: { "Content-Type": "application/json" } });
  assert.equal(r.status, 200);
  assert.deepEqual(h.calls[0].headers, { "Content-Type": "application/json", "x-write-token": "abc" });
  assert.equal(h.calls[0].method, "POST");
  assert.equal(h.prompts.length, 0);
});

test("a 401 asks once, stores the key and retries once with it", async () => {
  const h = harness({ answers: [401, 200], promptReply: "  new-key " });
  const r = await h.writeFetch("/api/x", { method: "DELETE" });
  assert.equal(r.status, 200);
  assert.equal(h.prompts.length, 1);
  assert.match(h.prompts[0], /zápisový klíč \(write token\)/);
  assert.equal(h.store.sfl_write_token, "new-key");
  assert.equal(h.calls.length, 2);
  assert.equal(h.calls[0].headers["x-write-token"], undefined);
  assert.equal(h.calls[1].headers["x-write-token"], "new-key");
});

test("cancelled prompt, quiet reads and a 503 return the refusal without a retry", async () => {
  let h = harness({ answers: [401], promptReply: null });
  assert.equal((await h.writeFetch("/api/x", {})).status, 401);
  assert.equal(h.calls.length, 1);
  h = harness({ answers: [401] });
  assert.equal((await h.writeFetch("/api/x", undefined, true)).status, 401);
  assert.equal(h.prompts.length, 0, "quiet never prompts");
  h = harness({ answers: [503] });
  assert.equal((await h.writeFetch("/api/x", {})).status, 503);
  assert.equal(h.prompts.length, 0, "no key typed here can fix a server without WRITE_TOKEN");
});

test("every owner-only call on the page goes through writeFetch", () => {
  const mustUse = [
    /writeFetch\(`\$\{INV_API_BASE\}\?farm=\$\{encodeURIComponent\(farmId\)\}&type=btc-tx`, undefined, true\)/,   // ledger read
    /writeFetch\(`\$\{INV_API_BASE\}\?type=btc-tx`/,                                                               // add
    /writeFetch\(`\$\{INV_API_BASE\}\?farm=\$\{encodeURIComponent\(farmId\)\}&type=venue-holdings`/,
    /writeFetch\(`\$\{INV_API_BASE\}\?farm=\$\{encodeURIComponent\(FARM_ID\)\}&type=farm-wallet`/,
    /writeFetch\(`\$\{INV_API_BASE\}\?farm=\$\{encodeURIComponent\(FARM_ID\)\}&type=repay-plan`, \{ method: "PUT"/,
    /writeFetch\(`\$\{INV_API_BASE\}\?farm=\$\{encodeURIComponent\(FARM_ID\)\}&type=venue-balance`/,
    /writeFetch\(_specApi\("trades", extra\)/,
    /writeFetch\(`\/api\/marketplace-orderbook\?wishlist=1`/,
    /writeFetch\("\/api\/game-token"/,
    /writeFetch\("\/api\/marks-history\?mode=force-refresh"\)/,
  ];
  for (const re of mustUse) assert.match(page, re);
  // …and no plain fetch() is left on a guarded mode.
  // (writeFetch has a capital F, so \bfetch\( only ever matches a plain call.)
  const plain = page.match(/\bfetch\([^\n]*?(type=btc-tx|type=farm-wallet|type=venue-holdings|mode=force-refresh|\/api\/game-token"|wishlist=1`, \{ method)/g) || [];
  assert.deepEqual(plain, []);
});
