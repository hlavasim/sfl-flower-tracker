import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { buildRoiSection } from "../../core/sections/roi.mjs";
import { WIDGETS } from "../../widgets/registry.mjs";
import { renderTable } from "../../ui/table.mjs";
import { ROI_WIDGETS, roiSellOrFarm, roiPassive, roiRows, roiFormatValue, roiQuery } from "../../widgets/roi.mjs";

// ROI as widgets on the real section=roi answer for farm 155498 (FLOWER at $0.5, BTC at $97k).
const wrap = JSON.parse(readFileSync(new URL("../fixtures/farm-155498.json", import.meta.url)));
const farm = wrap.farm || wrap;
const p2p = JSON.parse(readFileSync(new URL("../fixtures/p2p-prices.json", import.meta.url)));
const nfts = JSON.parse(readFileSync(new URL("../fixtures/nfts-sample.json", import.meta.url)));
const roi = JSON.parse(JSON.stringify({ ...buildRoiSection(farm, p2p, nfts, null, 97000, {}), sflUsd: 0.5 }));
const ctxWith = (sel = [], extra = {}) => ({ icon: (n) => `<i>${n}</i>`, sfl: () => "<F>",
  sellSelection: () => new Set(sel), multicat: () => ({}), ...extra });
const table = (w, out) => renderTable(w.columns, out.rows, w.defaults, { rowKey: w.rowKey });

test("registered on ROI; section=roi with the saved multi-category assignment", () => {
  for (const w of ROI_WIDGETS) {
    assert.strictEqual(WIDGETS[w.type], w);
    assert.strictEqual(w.page, "roi");
    assert.deepStrictEqual(w.needs("7"), { roi: roiQuery("7") });
  }
  assert.deepStrictEqual(roiQuery("7"), { res: "compute", farm: "7", section: "roi", q: { multicat: "{}" } });
});

test("money in FLOWER, USD or BTC — the old page's formatter", () => {
  assert.strictEqual(roiFormatValue(12.345, "flower", 0.5, 97000, "F"), "12.35 F");
  assert.strictEqual(roiFormatValue(150, "flower", 0.5, 97000, "F"), "150 F");
  assert.strictEqual(roiFormatValue(10, "usd", 0.5, 97000), "$5.00");
  assert.strictEqual(roiFormatValue(10, "btc", 0.5, 97000), "5155 sats");
  assert.strictEqual(roiFormatValue(10, "usd", 0, 97000), "—");
});

test("sell or farm: the categories at the copy's login frequency (2× by default), sell-first; its own currency", () => {
  const rows = roiRows(roi, 2);
  assert.ok(rows.length > 0);
  const out = roiSellOrFarm.build({ roi }, ctxWith(), roiSellOrFarm.defaults.opts);
  assert.deepStrictEqual(out.rows.map((r) => r.catId), rows.map((r) => r.catId));
  const r0 = out.rows.find((r) => r.saleSfl > 0) || out.rows[0];
  const html = table(roiSellOrFarm, out);
  if (r0.saleSfl > 0) assert.ok(html.includes(roiFormatValue(r0.saleSfl, "flower", 0.5, 97000, "<F>")));
  assert.match(html, /<details class="v-roi-row">/);
  assert.match(html, /Daily gross yield with the NFTs/);
  assert.match(html, /class="v-pill/);
  assert.match(html, /_roiToggleSell\('/);
  assert.match(out.summary, /<b>2×<\/b><span>logins a day \(12\.0h apart\)/);
  const four = roiSellOrFarm.build({ roi }, ctxWith(), { logins: "4", currency: "usd" });
  assert.match(four.summary, /<b>4×<\/b>/);
  assert.deepStrictEqual(four.rows.map((r) => r.catId), roiRows(roi, 4).map((r) => r.catId));
  assert.doesNotMatch(table(roiSellOrFarm, four), / <F><\/span>/, "USD, not FLOWER");
  assert.strictEqual(roiSellOrFarm.titleFor({ logins: "4" }), "💸 Sell or farm? – 4× a day");
});

test("selling the ticked categories: sale value, yield lost and combined payback above the table", () => {
  const rows = roiRows(roi, 2).filter((r) => r.sellableInCat.length);
  assert.ok(rows.length);
  const pick = rows.slice(0, 2).map((r) => r.catId);
  const out = roiSellOrFarm.build({ roi }, ctxWith(pick), {});
  const sale = rows.slice(0, 2).reduce((s, r) => s + r.saleSfl, 0);
  assert.ok(out.summary.includes(roiFormatValue(sale, "flower", 0.5, 97000, "<F>")));
  assert.match(out.summary, /combined payback/);
  assert.match(out.summary, /_roiClearSell/);
  assert.deepStrictEqual(out.rows.filter((r) => r.selected).map((r) => r.catId).sort(), pick.slice().sort());
  assert.match(roiSellOrFarm.build({ roi }, ctxWith(), {}).summary, /Tick “sell\?”/);
});

test("NFTs without a yield: owned sellable boosts with no quantifiable category, grouped, icons", () => {
  const out = roiPassive.build({ roi }, ctxWith(), {});
  const want = roi.boostItems.filter((b) => b.has && !b.isDisabled && b.isSellable && b.quantCats.length === 0);
  assert.strictEqual(out.rows.length, want.length);
  if (want.length) {
    assert.match(table(roiPassive, out), /<i>/);
    assert.ok(out.summary.includes("NFT"));
  }
  assert.ok(roiPassive.build({ roi }, ctxWith(), { group: "protection" }).rows.every((r) => r.group === "protection"));
});
