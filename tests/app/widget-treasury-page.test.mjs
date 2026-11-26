import { test } from "node:test";
import assert from "node:assert";
import { looksFor, renderLook } from "../../ui/glance-templates.mjs";
import { readFileSync } from "node:fs";
import { buildTreasurySection } from "../../core/sections/treasury.mjs";
import { treasuryValue } from "../../widgets/treasury-value.mjs";
import { treasuryCategories, treasuryItems } from "../../widgets/treasury.mjs";
import { WIDGETS } from "../../widgets/registry.mjs";
import { renderTable, applyTableAction } from "../../ui/table.mjs";

// TREASURY page widgets over the real section=treasury valuation of farm 155498.
const wrap = JSON.parse(readFileSync(new URL("../fixtures/farm-155498.json", import.meta.url)));
const farm = wrap.farm || wrap;
const p2p = JSON.parse(readFileSync(new URL("../fixtures/p2p-prices.json", import.meta.url)));
const nfts = JSON.parse(readFileSync(new URL("../fixtures/nfts-sample.json", import.meta.url)));
const { value } = buildTreasurySection(farm, p2p, nfts, null, 97000, {});
const T = { value, pricesOk: true };
const COLORS = { resources: "#2ECC71", treasures: "#F1C40F", collectibles: "#E67E22", produced: "#D35400", wearables: "#9B59B6", pets: "#E91E63", listings: "#1ABC9C", liquid: "#3498DB" };
const ctx = { catColors: COLORS, icon: (n) => `<img data-i="${n}">` };
const keys = (html) => [...html.matchAll(/data-row="([^"]+)"/g)].map((m) => m[1]);
const table = (w, out, s = w.defaults) => renderTable(w.columns, out.rows, s, { rowKey: w.rowKey, rowClass: w.rowClass });

test("registered on the treasury page; all read the treasury resource", () => {
  for (const w of [treasuryValue, treasuryCategories, treasuryItems]) {
    assert.strictEqual(WIDGETS[w.type], w);
    assert.strictEqual(w.page, "treasury");
    assert.deepStrictEqual(w.needs(7), { treasury: { res: "treasury", farm: 7 } });
  }
});

test("farm value: the page's formats, the rate line and the page's warnings", () => {
  const { html } = treasuryValue.view({ treasury: T }, ctx);
  assert.match(html, /6644\.0 <img/);             // formatSFL(6643.98) like the old header
  assert.match(html, /\$0\.00 · 0\.00000000 BTC/);  // no SFL/USD rate in the fixture
  assert.match(html, /1 BTC = \$97,000\.00/);
  assert.match(html, /conic-gradient\(#2ECC71 0% 26\.47%/);
  const warned = treasuryValue.view({ treasury: { ...T, warnings: ["BTC/USD unavailable — no BTC figures"] } }, ctx).html;
  assert.match(warned, /Incomplete valuation: BTC\/USD unavailable/);
});

test("categories: page order, value, share bar in the category colour, top items with icons; liquid split", () => {
  const out = treasuryCategories.build({ treasury: T }, ctx);
  const html = table(treasuryCategories, out);
  // pets and listings are empty on this farm → no row, like the page's cards
  assert.deepStrictEqual(keys(html), ["resources", "treasures", "collectibles", "produced", "wearables", "liquid"]);
  const res = out.rows.find((r) => r.key === "resources");
  assert.strictEqual(res.total, value.totals.resources);
  assert.strictEqual(res.pct.toFixed(1), "26.5");
  assert.match(html, /background:#2ECC71/);
  assert.match(html, /<img data-i="Obsidian">Obsidian <span class="v-treasury-num">1286\.4<\/span>/);
  assert.match(html, /balance 510\.4 · .*coins 284,549 \(≈ 268\.2\)/);
  assert.match(html, /<b>1758\.7<\/b>/);
});

test("items: one category per copy, sorted by total, top 10 with the rest counted; share of the category", () => {
  const out = treasuryItems.build({ treasury: T }, ctx, { cat: "resources" });
  assert.strictEqual(out.rows.length, 50);
  const html = table(treasuryItems, out);
  assert.strictEqual(keys(html)[0], "Obsidian");
  assert.match(html, /… and 40 more/);
  assert.match(html, /×67/);
  assert.match(html, /19\.20/);
  assert.match(html, /<img data-i="Obsidian">/);
  const obs = out.rows.find((r) => r.name === "Obsidian");
  assert.strictEqual(obs.share.toFixed(1), (1286.4 / value.totals.resources * 100).toFixed(1));
  assert.match(out.summary, /<b>50<\/b><span>items<\/span>/);
  const all = applyTableAction(treasuryItems.columns, treasuryItems.defaults, "rows-mode", "all");
  assert.strictEqual(keys(table(treasuryItems, out, all)).length, 50);
});

test("items: treasures show the treasure boost; produced says it is not sellable; titles per category", () => {
  assert.match(treasuryItems.build({ treasury: T }, ctx, { cat: "treasures" }).summary, /×1\.5 boost/);
  assert.match(treasuryItems.build({ treasury: T }, ctx, { cat: "produced" }).summary, /not marketplace-sellable/);
  assert.strictEqual(treasuryItems.titleFor({ cat: "wearables" }), "👕 Wearables");
  assert.match(treasuryItems.build({ treasury: null }, ctx, {}).empty, /did not load/);
});

test("📱 glance model, categories: the biggest share; the categories by value with their share bar; no valuation → empty", () => {
  // produced food (at production cost) outweighs resources on this farm
  const m = treasuryCategories.glanceModel({ treasury: T }, ctx);
  assert.strictEqual(treasuryCategories.look, "list-2");
  assert.deepStrictEqual(m.head, { value: "41", unit: " %", cap: "Produced · 2.7k 🌸", hero: "🍲" });
  assert.strictEqual(m.items.length, 6);
  assert.deepStrictEqual({ ...m.items[1], pct: m.items[1].pct.toFixed(1) }, { icon: "⛏️", name: "Resources", sub: "26.5 % · 50 items", value: "1.8k", pct: "26.5" });
  assert.deepStrictEqual(m.tiles[0], { label: "🍲 41 %", value: "2.7k" });
  assert.match(renderLook(m, "list-2").html, /<span class="gx-ic">🍲<\/span><div class="gx-n">Produced<div class="gx-sub-tag">2\.7k<\/div><\/div>/);
  assert.ok(looksFor(m).length >= 3);
  assert.match(treasuryCategories.glanceModel({ treasury: null }, ctx).empty, /did not load/);
  assert.strictEqual(treasuryCategories.glance, undefined, "the hand-written face is gone");
});

test("📱 glance model, items: the category's value; its items by value (the bar against the biggest); empty category → empty", () => {
  const m = treasuryItems.glanceModel({ treasury: T }, ctx, { cat: "resources" });
  assert.strictEqual(treasuryItems.look, "number-list-2");
  assert.deepStrictEqual([m.head.value, m.head.unit, m.head.cap], ["1.8k", " 🌸", "50 items"]);
  assert.strictEqual(m.items.length, 50);
  assert.deepStrictEqual(m.items[0], { icon: '<img data-i="Obsidian">', name: "Obsidian", sub: "×67 · 19.20", value: "1.3k", pct: 100 });
  assert.deepStrictEqual(m.tiles.map((t) => t.label), ["items", "🌸", "of farm"]);
  assert.match(renderLook(m, "number").html, /<div class="gx-num(?: gx-num-long)?">1\.8k<small> 🌸<\/small><\/div><div class="gx-cap">50 items<\/div>/);
  assert.ok(looksFor(m).length >= 3);
  assert.ok(treasuryItems.glanceModel({ treasury: T }, ctx, { cat: "treasures" }).tiles.some((t) => t.label === "boost"));
  assert.deepStrictEqual(treasuryItems.glanceModel({ treasury: T }, ctx, { cat: "pets" }), { empty: "No items found." });
  assert.match(treasuryItems.glanceModel({ treasury: null }, ctx, {}).empty, /did not load/);
  assert.strictEqual(treasuryItems.glance, undefined);
});

test("page wiring: the TREASURY page renders its widgets through renderPage", () => {
  const SRC = readFileSync(new URL("../../flowers.html", import.meta.url), "utf8");
  assert.match(SRC, /__widgets\.renderPage\("treasury-value"/);
  assert.match(SRC, /__widgets\.renderPage\("treasury-categories"/);
  assert.match(SRC, /__widgets\.renderPage\("treasury-items", \{[^}]*variant: cat, force: \{ cat \}/);
  assert.match(SRC, /_wCtxMap\["treasury-items"\]/);
  assert.match(SRC, /_wPageHead\("Treasury"/);
  assert.doesNotMatch(SRC, /function renderCategoryCard\(/);
});
