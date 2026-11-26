import { test } from "node:test";
import assert from "node:assert";
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

test("📱 glance: categories S = the biggest share; M = the top three by value; no valuation → empty", () => {
  // produced food (at production cost) outweighs resources on this farm
  assert.match(treasuryCategories.glance({ treasury: T }, ctx, {}, "s").html, /<div class="g-hero">🍲<\/div><div class="g-big">41<small> %<\/small><\/div><div class="g-cap">Produced · 2\.7k 🌸<\/div>/);
  const m = treasuryCategories.glance({ treasury: T }, ctx, {}, "m").html;
  assert.strictEqual((m.match(/class="g-row"/g) || []).length, 3);
  assert.match(m, /^<div class="g-rows"><div class="g-row"><span class="g-ic">🍲<\/span><div class="g-n">Produced<div>40\.9 % · 151 items<\/div><\/div><span class="g-v">2\.7k<\/span><\/div><div class="g-row"><span class="g-ic">⛏️<\/span><div class="g-n">Resources<div>26\.5 % · 50 items<\/div><\/div><span class="g-v">1\.8k<\/span>/);
  assert.strictEqual((treasuryCategories.glance({ treasury: T }, ctx, {}, "l").html.match(/class="g-row"/g) || []).length, 6);
  assert.match(treasuryCategories.glance({ treasury: null }, ctx, {}, "s").empty, /did not load/);
});

test("📱 glance: items S = the category's value; M = beside its top three; L = top six; empty category → empty", () => {
  assert.match(treasuryItems.glance({ treasury: T }, ctx, { cat: "resources" }, "s").html, /<div class="g-big">1\.8k<small> 🌸<\/small><\/div><div class="g-cap">50 items<\/div>/);
  const m = treasuryItems.glance({ treasury: T }, ctx, { cat: "resources" }, "m").html;
  assert.match(m, /^<div class="g-split">.*<span class="g-ic"><img data-i="Obsidian"><\/span><div class="g-n">Obsidian<div>×67 · 19\.20<\/div><\/div><span class="g-v">1\.3k<\/span>/);
  assert.strictEqual((m.match(/class="g-row"/g) || []).length, 3);
  assert.strictEqual((treasuryItems.glance({ treasury: T }, ctx, { cat: "resources" }, "l").html.match(/class="g-row"/g) || []).length, 6);
  assert.strictEqual(treasuryItems.glance({ treasury: T }, ctx, { cat: "pets" }, "s").empty, "No items found.");
  assert.match(treasuryItems.glance({ treasury: null }, ctx, {}, "s").empty, /did not load/);
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
