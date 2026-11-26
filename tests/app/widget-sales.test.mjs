import { test } from "node:test";
import assert from "node:assert";
import { looksFor, renderLook } from "../../ui/glance-templates.mjs";
import { readFileSync } from "node:fs";
import { buildTreasurySection } from "../../core/sections/treasury.mjs";
import { salesSummary, salesListings, salesSellable, salesOffers, salesSold, salesWeekly, salesData, liveLine } from "../../widgets/sales.mjs";
import { WIDGETS } from "../../widgets/registry.mjs";
import { renderTable } from "../../ui/table.mjs";

// SALES widgets over farm 155498 (with listings and offers added) and its real section=treasury td.
const wrap = JSON.parse(readFileSync(new URL("../fixtures/farm-155498.json", import.meta.url)));
const base = wrap.farm || wrap;
const p2p = JSON.parse(readFileSync(new URL("../fixtures/p2p-prices.json", import.meta.url)));
const nfts = JSON.parse(readFileSync(new URL("../fixtures/nfts-sample.json", import.meta.url)));
const { td } = buildTreasurySection(base, p2p, nfts, null, 97000, {});
const NOW = Date.UTC(2026, 10, 26, 12);
const DAY = 86400000;
const farm = { ...base, trades: { ...base.trades,
  listings: {
    L1: { items: { Obsidian: 10 }, sfl: 250, createdAt: NOW - 8 * DAY, collection: "resources" },
    L2: { items: { "Foreman Beaver": 1 }, sfl: 1000, createdAt: (NOW - 2 * DAY) / 1000, collection: "collectibles" },
    L3: { items: { Wood: 100 }, sfl: 1.5, createdAt: NOW - 3 * DAY, fulfilledAt: NOW - DAY, collection: "resources" },
  },
  offers: {
    O1: { items: { "Fruit Picker Apron": 1 }, sfl: 2, createdAt: NOW - DAY, collection: "wearables" },
    O2: { items: { Wood: 5 }, sfl: 1, createdAt: NOW - DAY, fulfilledAt: NOW },
  } } };
const LIVE = { L1: { total: 3, rank: 2, isFirst: false, cheapest: 24, bestBid: 24.5, gap: 2, nBids: 1, goodOffer: true } };
const ctx = { now: NOW, icon: (n) => `<img data-i="${n}">`, nftIdOf: (n, c) => (n === "Obsidian" ? 999 : null),
  live: (id) => LIVE[id] || null, liveDone: () => true, liveProgress: () => ({ loaded: 1, total: 1 }) };
const DATA = { farm, prices: { td } };
const keys = (html) => [...html.matchAll(/data-row="([^"]+)"/g)].map((m) => m[1]);
const table = (w, out, s = w.defaults) => renderTable(w.columns, out.rows, s, { rowKey: w.rowKey, rowClass: w.rowClass });

test("registered on the sales page; farm + treasury prices through the store", () => {
  for (const w of [salesSummary, salesListings, salesSellable, salesOffers, salesSold, salesWeekly]) {
    assert.strictEqual(WIDGETS[w.type], w);
    assert.strictEqual(w.page, "sales");
  }
  assert.deepStrictEqual(salesListings.needs(5), { farm: { res: "farm", farm: 5 }, prices: { res: "compute", farm: 5, section: "treasury" } });
});

test("the page's split: active / sold / offers, market price and delta per unit", () => {
  const d = salesData(farm, td, ctx);
  assert.deepStrictEqual(d.active.map((l) => l.id), ["L1", "L2"]);   // most overpriced first
  assert.strictEqual(d.active[0].delta.toFixed(1), "30.2");           // 25 vs p2p 19.2
  assert.strictEqual(d.active[0].nftId, 999);
  assert.strictEqual(d.active[1].priceSource, "Floor");
  assert.strictEqual(d.active[1].createdAt, NOW - 2 * DAY);           // seconds → ms
  assert.deepStrictEqual(d.sold.map((l) => l.id), ["L3"]);
  assert.deepStrictEqual(d.offers.map((o) => o.id), ["O1"]);
  assert.strictEqual(d.offers[0].delta, -20);                         // 2 vs the 2.5 floor
  assert.strictEqual(d.readyToClaim, 2);
});

test("overview tiles: ready to claim, listed totals, overpriced and stale counts, trade points", () => {
  const { html } = salesSummary.view(DATA, ctx);
  assert.match(html, /<b>2<\/b> ready to claim/);
  assert.match(html, /<b>2<\/b><span>active listings<\/span>/);
  assert.match(html, /<b>1250\.0 SFL<\/b><span>total listed<\/span>/);
  assert.match(html, /<b>1<\/b><span>overpriced \(&gt; \+20 %\)<\/span>/);
  assert.match(html, /<b>1<\/b><span>stale \(&gt; 7 days\)<\/span>/);
  assert.match(html, /<b>164592<\/b><span>trade points<\/span>/);
});

test("active listings: grouped by the live order book, badges, icons, marketplace link, live line", () => {
  const out = salesListings.build(DATA, ctx);
  const html = table(salesListings, out);
  assert.deepStrictEqual(keys(html), ["L1", "L2"]);
  assert.match(html, /data-row="L1" class="w-st-ready"/);
  assert.match(html, /<img data-i="Obsidian"><div><b>Obsidian<\/b> ×10/);
  assert.match(html, /v-pill v-bad">\+30%/);
  assert.match(html, /STALE/);
  assert.match(html, /marketplace\/collectibles\/999/);
  assert.match(html, /#2\/3<\/b>/);
  assert.match(html, /best offer <b>24\.50<\/b>/);
  assert.match(html, /25\.00\/ea vs 19\.20<\/span> <b class="flip-bad">\+30%/);
  assert.match(out.footer, /live market — sorted/);
  // live not done yet: by delta, no groups
  const early = salesListings.build(DATA, { ...ctx, liveDone: () => false });
  assert.deepStrictEqual(early.rows.map((r) => r.group), [null, null]);
});

test("live line: first, behind, pet and 'offer ≥ ask'", () => {
  const l = { unitPrice: 10 };
  assert.match(liveLine(l, { total: 1, isFirst: true, bestBid: 0 }), /only listing.*no offers/);
  assert.match(liveLine(l, { total: 4, isFirst: true, bestBid: 12, gap: -20, nBids: 2 }), /1ST.*of 4.*best offer 12\.00 ≥ your ask/);
  assert.match(liveLine(l, { isPet: true, type: "Dragon", total: 3, rank: 2, cheapest: 8, bestBid: 0 }), /#2\/3 Dragon.*cheapest 8\.00.*\(-2\.00\)/);
});

test("what can I sell: unlisted items with value, by type and min value per copy", () => {
  const out = salesSellable.build(DATA, ctx, { type: "both", min: "10" });
  const names = out.rows.map((r) => r.name);
  assert.ok(!names.includes("Obsidian") && !names.includes("Foreman Beaver"), "listed items left out");
  assert.strictEqual(names[0], "Milk");
  assert.ok(out.rows.every((r) => r.total >= 10));
  const html = table(salesSellable, out);
  assert.match(html, /<img data-i="Milk"><div><b>Milk<\/b> ×1563/);
  assert.match(html, /class="v-bar"/);
  const nft = salesSellable.build(DATA, ctx, { type: "nft", min: "0" });
  assert.deepStrictEqual(nft.rows.map((r) => r.name).sort(), ["Fruit Picker Apron", "Immortal Pear"]);
  assert.strictEqual(nft.rows.find((r) => r.name === "Fruit Picker Apron").total, 5);   // 2 in the wardrobe × the 2.5 floor
  assert.match(salesSellable.build(DATA, ctx, { type: "nft", min: "5000" }).empty, /≥ 5000/);
});

test("offers and sold: their own rows; no live column", () => {
  const offers = table(salesOffers, salesOffers.build(DATA, ctx));
  assert.deepStrictEqual(keys(offers), ["O1"]);
  assert.match(offers, /<img data-i="Fruit Picker Apron">/);
  assert.doesNotMatch(offers, /data-sort="group"/);
  const sold = table(salesSold, salesSold.build(DATA, ctx));
  assert.deepStrictEqual(keys(sold), ["L3"]);
  assert.match(sold, /SOLD/);
});

test("weekly history: newest week first, every item with its icon", () => {
  const out = salesWeekly.build({ farm }, ctx);
  assert.deepStrictEqual(out.rows.map((r) => r.week), ["2026-07-06", "2025-09-29"]);
  const html = table(salesWeekly, out);
  assert.match(html, /06\/07\/2026/);
  assert.match(html, /1× <img data-i="Obsidian">Obsidian/);
  assert.match(html, /1× <img data-i="White Carrot">White Carrot/);
});

test("no prices → an explanation", () => {
  assert.match(salesListings.build({ farm }, ctx).empty, /did not load/);
  assert.match(salesSummary.view({ farm }, ctx).empty, /did not load/);
});

test("page wiring: SALES renders its widgets; wishlist and price trackers stay page cards", () => {
  const SRC = readFileSync(new URL("../../flowers.html", import.meta.url), "utf8");
  assert.match(SRC, /const salesWidgets = \["sales-summary", "sales-listings", "sales-sellable", "sales-offers", "sales-sold", "sales-weekly"\];/);
  assert.match(SRC, /salesWidgets\.map\(\(t\) => __widgets\.renderPage\(t, /);
  // the live order book patches the listings frame as it comes in
  assert.match(SRC, /_mktPatch\("sales-listings", __widgets\.renderPage\("sales-listings"/);
  assert.match(SRC, /_wCtxMap\["sales-listings"\]/);
  assert.match(SRC, /<div id="wishlist-panel"><\/div>/);
  assert.doesNotMatch(SRC, /Wishlist je prázdný/);
});

test("📱 glance model, overview: active listings with a ring (share at market), the totals as a list; nothing → empty", () => {
  const m = salesSummary.glanceModel(DATA, ctx);
  assert.strictEqual(salesSummary.look, "number");
  assert.deepStrictEqual(m.head, { value: 2, unit: " listed", cap: "✅ 2 ready to claim", ring: 50, ringTone: "warn" });
  assert.deepStrictEqual(m.items.map((i) => i.name), ["To claim", "Listed", "At market", "Overpriced", "Stale", "Offers"]);
  assert.deepStrictEqual(m.items[3], { icon: "⚠️", name: "Overpriced", sub: "> +20 %", value: 1, tone: "bad", pct: 50 });
  assert.deepStrictEqual(m.tiles.map((t) => t.label), ["listed", "offers", "to claim", "points"]);
  assert.match(renderLook(m, "number").html, /<div class="gx-num(?: gx-num-long)?">2<small> listed<\/small><\/div><div class="gx-cap">✅ 2 ready to claim<\/div>/);
  assert.ok(looksFor(m).length >= 3);
  const bare = { farm: { ...base, trades: {} }, prices: { td } };
  assert.match(salesSummary.glanceModel(bare, ctx).empty, /No listings/);
  assert.match(salesSummary.glanceModel({ farm }, ctx).empty, /did not load/);
  assert.strictEqual(salesSummary.glance, undefined, "the hand-written face is gone");
});

test("📱 glance model, listings / offers / sold: count and total; every row with its live status or delta chip and its price bar", () => {
  const m = salesListings.glanceModel(DATA, ctx);
  assert.deepStrictEqual(m.head, { value: 2, unit: " listed", cap: "1.3k SFL in total", ring: 50, ringTone: "warn" });
  assert.strictEqual(m.items.length, 2);
  assert.deepStrictEqual(m.items[0], { icon: '<img data-i="Obsidian">', name: "Obsidian ×10", sub: "250.0 SFL · 1w ago", value: "250", pct: 25, chip: { text: "OFFER", tone: "ok" } });
  assert.match(renderLook(m, "list-4").html, /<span class="gx-ic"><img data-i="Obsidian"><\/span><div class="gx-n">Obsidian ×10<div>250\.0 SFL · 1w ago<\/div><\/div><span class="gx-chip g-ok">OFFER<\/span>.*Foreman Beaver.*gx-chip g-info">1ST/);
  assert.ok(looksFor(m).length >= 3);
  // live order book not in yet: the delta against the market
  assert.deepStrictEqual(salesListings.glanceModel(DATA, { ...ctx, liveDone: () => false }).items[0].chip, { text: "+30%", tone: "bad" });
  assert.deepStrictEqual(salesOffers.glanceModel(DATA, ctx).items[0].chip, { text: "-20%", tone: "info" });
  assert.deepStrictEqual([salesSold.glanceModel(DATA, ctx).items[0].name, salesSold.glanceModel(DATA, ctx).items[0].chip], ["Wood ×100", { text: "CLAIM", tone: "ok" }]);
  for (const w of [salesListings, salesOffers, salesSold]) { assert.strictEqual(w.look, "number"); assert.strictEqual(w.glance, undefined, w.type); }
  const bare = { farm: { ...base, trades: {} }, prices: { td } };
  assert.deepStrictEqual(salesListings.glanceModel(bare, ctx), { empty: "No active listings." });
  assert.deepStrictEqual(salesSold.glanceModel(bare, ctx), { empty: "Nothing sold and unclaimed." });
});

test("📱 glance model, what can I sell: the total, the items by value; weekly: the latest week and sold per week as a series", () => {
  const opts = { type: "both", min: "10" };
  const all = salesSellable.build(DATA, ctx, opts).rows;
  const m = salesSellable.glanceModel(DATA, ctx, opts);
  assert.strictEqual(salesSellable.look, "number-list-2");
  assert.deepStrictEqual([m.head.unit, m.head.cap], [" SFL", `${all.length} unlisted items`]);
  assert.strictEqual(m.items.length, all.length);
  assert.deepStrictEqual([m.items[0].icon, m.items[0].name, m.items[0].pct], ['<img data-i="Milk">', "Milk", 100]);
  assert.match(m.items[0].sub, /^×1563 · /);
  assert.match(renderLook(m, "number-list-2").html, /^<div class="gx gx-2x1" style="--gw:2"><div class="gx-split">.*<span class="gx-ic"><img data-i="Milk"><\/span><div class="gx-n">Milk/);
  assert.ok(looksFor(m).length >= 3);
  assert.match(salesSellable.glanceModel(DATA, ctx, { type: "nft", min: "5000" }).empty, /≥ 5000/);
  const w = salesWeekly.glanceModel({ farm }, ctx);
  assert.deepStrictEqual([w.head.value, w.head.cap], [1, "week of 06/07/2026 · 0 bought"]);
  assert.deepStrictEqual(w.items.map((i) => i.name), ["06/07/2026", "29/09/2025"]);
  assert.deepStrictEqual(w.series, [0, 1], "oldest first");
  assert.ok(looksFor(w).includes("chart-2"));
  assert.deepStrictEqual(salesWeekly.glanceModel({ farm: { ...base, trades: {} } }, ctx), { empty: "No weekly activity yet." });
  assert.strictEqual(salesSellable.glance, undefined);
  assert.strictEqual(salesWeekly.glance, undefined);
});
