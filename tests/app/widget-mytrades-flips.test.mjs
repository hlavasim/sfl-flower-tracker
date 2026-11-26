import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { myTradesSummary, myTradesItems, myTradesRecent } from "../../widgets/my-trades.mjs";
import { flipTable, flipSummary } from "../../widgets/flip-table.mjs";
import { WIDGETS } from "../../widgets/registry.mjs";
import { renderTable, applyTableAction } from "../../ui/table.mjs";
import { createStore } from "../../app/store.mjs";

const keys = (html) => [...html.matchAll(/data-row="([^"]+)"/g)].map((m) => m[1]);
const table = (w, out, s = w.defaults) => renderTable(w.columns, out.rows, s, { rowKey: w.rowKey, rowClass: w.rowClass });
const ctx = { icon: (n) => `<img data-i="${n}">`, now: Date.UTC(2026, 10, 26) };

// ── MY TRADES (the shape of /api/marketplace-trades?mytrades=1) ──
const MT = {
  totals: { boughtSfl: 1500, soldSfl: 1800.5, cashNet: 300.5, buyCount: 3, sellCount: 2, tradeCount: 5 },
  items: [
    { collection: "collectibles", itemId: 7, name: "Gnome", boughtQty: 2, boughtSfl: 1000, soldQty: 1, soldSfl: 800, avgBuy: 500, avgSell: 800, realized: 300, cashNet: -200 },
    { collection: "wearables", itemId: 9, name: "Bad <Hat>", boughtQty: 0, soldQty: 1, soldSfl: 1000.5, avgBuy: null, avgSell: 1000.5, realized: null, cashNet: 1000.5 },
  ],
  trades: [
    { date: "2026-08-30T10:00:00Z", name: "Gnome", itemId: 7, side: "sell", sfl: 800, qty: 1, unitPrice: 800, counterparty: "alice" },
    { date: "2026-08-20T10:00:00Z", name: "Gnome", itemId: 7, side: "buy", sfl: 1000, qty: 2, unitPrice: 500, counterparty: null },
  ],
};

test("my trades: registered on the mytrades page; the ledger through the store", async () => {
  for (const w of [myTradesSummary, myTradesItems, myTradesRecent]) { assert.strictEqual(WIDGETS[w.type], w); assert.strictEqual(w.page, "mytrades"); }
  assert.deepStrictEqual(myTradesItems.needs(4), { trades: { res: "myTrades", farm: 4 } });
  const calls = [];
  const f = async (url) => { calls.push(url); return { ok: true, status: 200, json: async () => MT }; };
  const r = await createStore({ fetch: f }).get({ res: "myTrades", farm: 4 });
  assert.strictEqual(r.data.totals.tradeCount, 5);
  assert.strictEqual(calls[0], "/api/marketplace-trades?mytrades=1&farm=4");
});

test("my trades: totals as tiles, the frozen ledger said, a bought-vs-sold bar", () => {
  const { html } = myTradesSummary.view({ trades: MT }, ctx);
  assert.match(html, /<b>1\.5k SFL<\/b><span>💸 bought \(3×\)<\/span>/);
  assert.match(html, /<b>1\.8k SFL<\/b><span>💰 sold \(2×\)<\/span>/);
  assert.match(html, /<b>\+301 SFL<\/b><span>📊 cash net<\/span>/);
  assert.match(html, /Marketplace API restricted by the game/);
  assert.match(html, /class="v-bar"><i class="v-ok" style="width:55%"/);
  assert.match(myTradesSummary.view({ trades: null }, ctx).empty, /unavailable/);
});

test("my trades: per item with icons, averages, realized and cash net in colour, sold-through bar", () => {
  const html = table(myTradesItems, myTradesItems.build({ trades: MT }, ctx));
  assert.deepStrictEqual(keys(html), ["collectibles:7:Gnome", "wearables:9:Bad <Hat>".replace("<", "&lt;").replace(">", "&gt;")]);
  assert.match(html, /<img data-i="Gnome"><div><b>Gnome<\/b>/);
  assert.match(html, /Bad &lt;Hat&gt;/);
  assert.match(html, /flip-good">\+300</);
  assert.match(html, /flip-bad">-200</);
  assert.match(html, /<i class="v-mid" style="width:50%"/);
});

test("my trades: recent trades with side pills and a side filter", () => {
  const out = myTradesRecent.build({ trades: MT }, ctx);
  const html = table(myTradesRecent, out);
  assert.match(html, /30\/08\/2026/);
  assert.match(html, /v-pill v-ok">sold/);
  assert.match(html, /flip-bad">−1\.0k/);
  assert.match(html, /<img data-i="Gnome">/);
  const s = applyTableAction(myTradesRecent.columns, myTradesRecent.defaults, "filter", "side|buy");
  assert.deepStrictEqual(keys(table(myTradesRecent, out, s)), ["0"]);
});

// ── FLIPS ──
const NOW = Date.now();
const FLIPS = { count: 2, items: [
  { name: "Gnome", collection: "collectibles", itemId: 1, bestOffer: 100, bestListing: 140, spreadPct: 40, net: 26, margin: 26, score: 52, liq: 1, floor: 140, updatedAt: new Date(NOW).toISOString() },
  { name: "Hat", collection: "wearables", itemId: 2, bestOffer: 10, bestListing: 10.5, spreadPct: 5, net: -0.55, margin: -5, score: 0, liq: 0, floor: 10.5, updatedAt: new Date(NOW).toISOString() },
] };

test("flips: sorted by score like the page's default chip; margin bar; the sort chips are columns", () => {
  const out = flipTable.build({ flips: FLIPS }, ctx);
  const html = table(flipTable, out);
  assert.deepStrictEqual(keys(html), ["collectibles:1", "wearables:2"]);
  assert.match(html, /🔥 52/);
  assert.match(html, /<img data-i="Gnome">/);
  for (const k of ["score", "margin", "net", "spreadPct", "liq", "pressure", "floor"]) assert.ok(flipTable.columns.some((c) => c.key === k), k);
  const byFloor = applyTableAction(flipTable.columns, flipTable.defaults, "sort", "floor");
  assert.strictEqual(keys(table(flipTable, out, byFloor))[0], "collectibles:1");
});

test("flips overview: counts, the best margin with its icon, the colour legend", () => {
  assert.strictEqual(WIDGETS["flip-summary"], flipSummary);
  const { html } = flipSummary.view({ flips: FLIPS }, ctx);
  assert.match(html, /<b>2<\/b><span>boosted NFTs with bid and ask<\/span>/);
  assert.match(html, /<b>1<\/b><span>margin ≥ 15 %<\/span>/);
  assert.match(html, /<b>1<\/b><span>net ≤ 0<\/span>/);
  assert.match(html, /Best margin: <span class="v-mkt-item"><img data-i="Gnome">Gnome<\/span>/);
  assert.doesNotMatch(html, /restricted by the game/);   // fresh data
  const old = { ...FLIPS, items: FLIPS.items.map((i) => ({ ...i, updatedAt: "2026-09-01T00:00:00Z" })) };
  assert.match(flipSummary.view({ flips: old }, ctx).html, /restricted by the game/);
});

test("page wiring: FLIPS and MY TRADES render widgets, no Czech left", () => {
  const SRC = readFileSync(new URL("../../flowers.html", import.meta.url), "utf8");
  for (const t of ["flip-summary", "flip-table"]) assert.match(SRC, new RegExp(`__widgets\\.renderPage\\("${t}"`), t);
  assert.match(SRC, /\["my-trades-summary", "my-trades-items", "my-trades-recent"\]\s*\.map\(\(t\) => __widgets\.renderPage\(t, /);
  assert.doesNotMatch(SRC, /POSLEDNÍ OBCHODY|boostovaných NFT|Marketplace API omezeno/);
});
