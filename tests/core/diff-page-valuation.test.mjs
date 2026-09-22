import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

/*
 * The Diff page's valuation panels — Investment Tracker, Insights — run for real here, the whole
 * page script against stubbed upstreams (the same approach as diff-window.test.mjs). Each test
 * pins one finding of the 2026-09-22 review and fails on the page as it was before its fix.
 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SRC = readFileSync(path.join(ROOT, "flowers.html"), "utf8");
const SCRIPT = SRC.slice(SRC.indexOf("<script>") + 8, SRC.lastIndexOf("</script>"));

function extract(name) {
  const start = SRC.indexOf(`function ${name}(`);
  assert.ok(start > 0, `${name} present in flowers.html`);
  let depth = 0, i = SRC.indexOf("{", start);
  for (; i < SRC.length; i++) {
    if (SRC[i] === "{") depth++;
    else if (SRC[i] === "}") { depth--; if (depth === 0) break; }
  }
  return new Function(`${SRC.slice(start, i + 1)}; return ${name};`)();
}

const DAY = 86400000;
const NOW = Date.now();
const iso = (ms) => new Date(ms).toISOString();
const TD = {
  p2pPrices: { Wood: 0.01 }, sflUsd: 0.02, btcUsd: 100000, coinsPerSFL_betty: 1000, coinsPerSFL_api: 100,
  gemsPerSFL: 100, nftCollectibles: {}, nftWearables: {}, productionCost: {},
};
const farmAt = (coins) => ({ inventory: { Wood: "100" }, wardrobe: {}, balance: "50", coins, bumpkin: {} });

function page(opts = {}) {
  const urls = [];
  const elements = {};
  const stubEl = (id) => ({
    id: id || "", innerHTML: "", textContent: "", className: "", style: { cssText: "" },
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    appendChild() {}, insertBefore() {}, addEventListener() {}, setAttribute() {},
    removeAttribute() {}, focus() {}, scrollIntoView() {}, querySelector: () => null, querySelectorAll: () => [],
    children: [], dataset: {}, value: "",
  });
  const el = (id) => (elements[id] || (elements[id] = stubEl(id)));
  const doc = {
    getElementById: (id) => el(id),
    querySelector: () => null, querySelectorAll: () => [], createElement: () => stubEl(),
    addEventListener() {}, removeEventListener() {},
    body: stubEl(), documentElement: stubEl(), head: stubEl(),
    readyState: "complete", cookie: "", activeElement: null,
  };
  const store = opts.store || {};
  const json = (o, status = 200) => ({ ok: status < 400, status, statusText: "x", json: async () => o });
  const fetchStub = async (url, init) => {
    const u = decodeURIComponent(String(url));
    urls.push(u);
    if (u.includes("section=treasury")) return json({ pricesOk: true, data: { coinMode: "betty", td: structuredClone(TD), value: null, status: {} } });
    if (u.includes("section=diff")) {
      const posted = JSON.parse((init && init.body) || '{"snapshots":[]}').snapshots || [];
      return json({ data: { snapshots: posted.map(() => ({ netSfl: 0, items: [] })) } });
    }
    if (u.includes("section=prices")) return json({ pricesOk: true, data: { marketValue: {}, productionCost: {}, marketTrace: {}, productionTrace: {} } });
    if (u.includes("type=btc-tx")) return opts.ledgerFails ? json({ error: "boom" }, 500) : json({ transactions: opts.transactions || [] });
    if (u.includes("type=venue-balance")) return json({ balances: [] });
    if (u.includes("type=repay-plan")) return json({ plan: null });
    if (u.includes("type=venue-holdings")) return json({ wallets: [], venues: null, errors: [] });
    if (u.includes("include=game_data")) return json({ snapshots: opts.insightSnaps || [] });
    if (u.includes("farm-history")) return json({ snapshots: [{ id: 1, captured_at: iso(NOW - 3600000), diff: { coins: 1 } }], total: 1 });
    if (u.includes("coingecko")) return json({ prices: [] });
    if (u.includes("currency-api")) return json({ usd: { czk: 23 } });
    return json({});
  };
  const win = {
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
    },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    location: { href: "https://x.test/?page=diff", search: "?page=diff", hash: "", pathname: "/", origin: "https://x.test" },
    addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {} }),
    requestAnimationFrame: () => 0, setTimeout: (f) => { if (typeof f === "function") f(); return 0; },
    setInterval: () => 0, clearTimeout() {}, clearInterval() {},
    history: { replaceState() {}, pushState() {} },
    navigator: { userAgent: "node", clipboard: { writeText: async () => {} } },
    fetch: fetchStub, console: { log() {}, warn() {}, error() {} },
  };
  win.window = win; win.document = doc;
  const run = new Function(
    "window", "document", "localStorage", "sessionStorage", "fetch", "requestAnimationFrame",
    "setTimeout", "setInterval", "clearTimeout", "clearInterval", "location", "history",
    "navigator", "matchMedia", "console",
    `${SCRIPT}
     FARM_ID = "155498";
     // spyMain: a loaded farm, and main() counted instead of run — main() is what re-ran renderDiff.
     ${opts.spyMain ? "cachedFarmData = { farm: {} }; main = function () { window.__mainCalls = (window.__mainCalls || 0) + 1; };" : ""}
     // The page-lifetime caches REFRESH is meant to drop: fill them, read them back.
     const fillCaches = () => { _satsCache["1d"] = [{ time: 1, value: 200 }]; _dashTdPromise = Promise.resolve({}); _ykLive = { flowerUsd: 0.15, btcUsd: 86000 }; };
     const readCaches = () => ({ sats: Object.keys(_satsCache).length, dashTd: _dashTdPromise, ykLive: _ykLive,
       diffTd: typeof _diffTd === "undefined" ? "n/a" : _diffTd });
     return { renderDiff, refresh, fillCaches, readCaches, api: window };`
  );
  const api = run(win, doc, win.localStorage, win.sessionStorage, win.fetch, win.requestAnimationFrame,
    win.setTimeout, win.setInterval, win.clearTimeout, win.clearInterval, win.location, win.history,
    win.navigator, win.matchMedia, win.console);
  const settle = async () => { for (let i = 0; i < 30; i++) await new Promise((r) => setImmediate(r)); };
  return { ...api, urls, el, settle };
}

// F — before: renderDiff, the tracker and Insights each fetched section=treasury (3 per load), and
// the price-trace arrival called main(), re-running the whole renderDiff and all its fetches.
test("F: one section=treasury per Diff load, and the trace arrival repaints without refetching", async () => {
  const p = page({ store: { sfl_diff_insights_open: "1" }, spyMain: true });
  await p.renderDiff({ farm: farmAt(0) });
  await p.settle();
  const treasury = p.urls.filter((u) => u.includes("section=treasury")).length;
  assert.equal(treasury, 1, `section=treasury fetched ${treasury}× on one load`);
  assert.ok(p.urls.some((u) => u.includes("section=prices") && u.includes("explain=1")), "traces were fetched");
  assert.equal(p.api.__mainCalls || 0, 0, "the trace arrival must not call main() (a full renderDiff)");
  assert.ok(/Pricing methods|No priced items|diff-/.test(p.el("diff-content").innerHTML), "the content panel was repainted");
});

// F — before: REFRESH cleared the farm and the price maps but kept the dashboard's treasury
// rates, the SATS/FLOWER series and the Yakkamon FLOWER/BTC prices for the page's lifetime.
test("F: REFRESH drops every rate / price cache", async () => {
  const p = page({ spyMain: true });
  await p.renderDiff({ farm: farmAt(0) });
  await p.settle();
  p.fillCaches();
  p.refresh();
  const c = p.readCaches();
  assert.equal(c.sats, 0, "SATS/FLOWER series cleared");
  assert.equal(c.dashTd, null, "dashboard treasury rates cleared");
  assert.equal(c.ykLive, null, "Yakkamon prices cleared");
  assert.equal(c.diffTd, null, "the Diff page's treasury data cleared");
  assert.equal(p.api.__mainCalls, 1, "and the page re-renders once");
});

// E4 — before: the BILANCE farm row was the whole treasury × 0.9 — here 1,000 FLOWER of coins
// (1,000,000 coins at Betty's 1,000) sold on a marketplace that does not trade coins.
test("E4: the BILANCE farm row counts only what the marketplace buys, plus the FLOWER balance", async () => {
  const p = page({ transactions: [{ id: 1, tx_date: "2026-09-01", direction: "deposit", btc_amount: "0.01", venue: "sfl", created_at: "2026-09-01T10:00:00Z" }] });
  await p.renderDiff({ farm: farmAt(1000000) });
  await p.settle();
  const html = p.el("investment-tracker").innerHTML;
  const farmRow = html.slice(html.indexOf("SFL farma"), html.indexOf("SFL farma") + 1400);
  // 100 Wood × 0.01 = 1 FLOWER, less 10 % = 0.9, + 50 FLOWER balance = 50.9 FLOWER × 0.02 USD / 100,000 USD/₿.
  assert.ok(farmRow.includes((50.9 * 0.02 / 100000).toFixed(6) + " ₿"), `farm row: ${farmRow.replace(/<[^>]+>/g, " ").slice(0, 300)}`);
  assert.ok(/NEPOČÍTÁ SE[^"]*coins/.test(farmRow), "and it says coins are left out");
});

// E14 — before: a failed ledger read rendered as an empty ledger: COST 0.000000 ₿ and a green
// BILANCE, indistinguishable from "nothing invested".
test("E14: a failed ledger read renders as '—' with a warning, never as COST 0", async () => {
  const p = page({ ledgerFails: true });
  await p.renderDiff({ farm: farmAt(0) });
  await p.settle();
  const html = p.el("investment-tracker").innerHTML;
  assert.ok(html.includes("BILANCE"), "the balance sheet rendered");
  assert.ok(!/COST[\s\S]{0,400}?0\.000000 ₿/.test(html), "COST is not shown as 0");
  assert.ok(/nekompletní[^<]*transactions: /.test(html), "and the failure is named");
});

// E10 + E11 — before: Insights valued the farm in hard-coded "betty" mode whatever the Treasury
// page was set to, the Income Breakdown skipped pets / listings / produced, and it netted a
// WALLET deposit against the farm at today's USD rate (+250,000 FLOWER "deposited" here).
test("E10/E11: Insights use the Treasury coin mode, and only farm cashflow nets against the farm", async () => {
  const snaps = [
    { id: 11, captured_at: iso(NOW - 20 * DAY), game_data: farmAt(0) },
    { id: 12, captured_at: iso(NOW - 2 * DAY), game_data: farmAt(10000) },
  ];
  const transactions = [
    { id: 1, tx_date: iso(NOW - 10 * DAY), direction: "deposit", btc_amount: "0.05", usd_amount: "5000", flower_amount: null, venue: "wallet", created_at: iso(NOW - 10 * DAY) },
  ];
  const p = page({ store: { sfl_diff_insights_open: "1", sfl_coin_mode: "api" }, insightSnaps: snaps, transactions });
  await p.renderDiff({ farm: farmAt(10000) });
  await p.settle();
  const html = p.el("ins-body").innerHTML.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  assert.ok(/INCOME BREAKDOWN/.test(html), "the breakdown rendered");
  // 10,000 coins at the api rate (100/FLOWER) = +100 FLOWER; betty (1000/FLOWER) would be +10.
  assert.ok(/Liquid \(SFL\/coins\/gems\) \+100\.0/.test(html), `liquid Δ at the api rate: ${html.slice(0, 400)}`);
  assert.ok(/Pets/.test(html) && /Listings/.test(html) && /Produced/.test(html), "every category has a row");
  assert.ok(!/You deposited/.test(html), "a WALLET deposit is not farm cashflow");
});

// E8 — before: the Treasury page rendered whatever came back — with the p2p feed down it showed
// a total ~51 % short with no hint; a stale farm looked live.
test("E8: the pages name every failed input behind a valuation", () => {
  const warn = extract("treasuryStatusWarnings");
  assert.deepEqual(warn({ status: { pricesOk: true, exchangeOk: true, btcOk: true } }), []);
  const w = warn({ coinsPerSFL_betty: 0, status: { pricesOk: false, exchangeOk: false, btcOk: false, nftsStale: true, stale: true, farmAgeSec: 2400 } });
  assert.equal(w.length, 5);
  assert.ok(/market prices unavailable/.test(w[0]));
  assert.ok(/coins unpriced/.test(w[1]), "no Betty and no exchange: coins are unpriced, said so");
  assert.ok(/40 min old/.test(w[4]), `the stale farm's age is shown: ${w[4]}`);
});

// E16 — before: same-day rows were ordered by entry time, so a deposit typed before a same-day
// withdrawal spiked the running net and inflated the peak (0.25 here instead of 0.2).
test("E16: same-day withdrawals are taken before deposits, so entry order cannot inflate the peak", () => {
  const invAggregate = extract("invAggregate");
  const ledger = [
    { tx_date: "2026-09-01", direction: "deposit", btc_amount: "0.2", created_at: "2026-09-01T10:00:00Z" },
    { tx_date: "2026-09-05", direction: "deposit", btc_amount: "0.05", created_at: "2026-09-05T08:00:00Z" },
    { tx_date: "2026-09-05", direction: "withdrawal", btc_amount: "0.05", created_at: "2026-09-05T09:00:00Z" },
  ];
  const a = invAggregate(ledger);
  assert.ok(Math.abs(a.peakBtc - 0.2) < 1e-12, `peak ${a.peakBtc}`);
  const b = invAggregate(ledger.slice().reverse());
  assert.equal(b.peakBtc, a.peakBtc, "and it does not depend on the order the rows arrive in");
});

// F — before: BILANCE priced the on-chain FLOWER at CoinGecko's flower-2 and converted to BTC at
// the holdings endpoint's BTC/USD, next to farm rows priced at the treasury's sfl.world / BTC pair.
test("F: on-chain holdings are re-priced with the page's one FLOWER/USD and BTC/USD", () => {
  const reprice = extract("_invRepriceVenue");
  const venue = { usd: 5000 * 0.16 + 1000 + 0.004, btc: 0.02, items: [
    { symbol: "FLOWER", amount: 5000, usd: 800, unitUsd: 0.16 },
    { symbol: "USDC", amount: 1000, usd: 1000, unitUsd: 1 },
  ] };
  const r = reprice(venue, 0.15, 80000);
  assert.equal(r.items[0].usd, 750, "FLOWER at the page's 0.15, not CoinGecko's 0.16");
  assert.ok(Math.abs(r.usd - (750 + 1000 + 0.004)) < 1e-9, "dust kept in the total");
  assert.ok(Math.abs(r.btc - r.usd / 80000) < 1e-15, "and BTC at the page's BTC/USD");
  assert.equal(reprice(null, 0.15, 80000), null);
  assert.ok(Number.isNaN(reprice(venue, 0.15, 0).btc), "no BTC/USD is unknown, not 0");
});
