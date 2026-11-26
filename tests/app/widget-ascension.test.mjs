import "../helpers/page-engine.mjs";
import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { ascensionStatus, ascensionOutlook, ascensionIsland, ascensionSteps, ascensionQuery } from "../../widgets/ascension.mjs";
import { WIDGETS } from "../../widgets/registry.mjs";
import { renderTable } from "../../ui/table.mjs";
import { createStore } from "../../app/store.mjs";
import { buildAscensionSection } from "../../core/sections/ascension.mjs";
import { buildPowerSection } from "../../core/sections/power.mjs";
import { buildCookingSection } from "../../core/sections/cooking.mjs";
import { renderLook, looksFor } from "../../ui/glance-templates.mjs";

// ASCENSION as widgets over the engine's plan for the real fixture farm (volcano, not ascended yet).

const farm = JSON.parse(readFileSync(new URL("../fixtures/farm-155498.json", import.meta.url))).farm;
const p2p = JSON.parse(readFileSync(new URL("../fixtures/p2p-prices.json", import.meta.url)));
const nfts = JSON.parse(readFileSync(new URL("../fixtures/nfts-sample.json", import.meta.url)));
const powerData = buildPowerSection(farm, p2p, nfts, null, {});
const cooking = buildCookingSection(farm, p2p, { petSimulate: true });
const eff = { effByCat: { crimstone: { measured: true, ratio: 0.5 }, oil: { measured: true, ratio: 0.6 }, obsidian: { measured: true, ratio: 0.9 } }, meta: { days: 7 } };
// through JSON like the API answer (Infinity → null)
const d = JSON.parse(JSON.stringify(buildAscensionSection(farm, powerData, cooking.totalXpPerDay, eff, { max: 10 })));
const CTX = { icon: (n) => `<i>${n}</i>`, page: () => ({ mode: "eff" }) };
const table = (w, out) => renderTable(w.columns, out.rows, w.defaults, { rowKey: w.rowKey, rowClass: w.rowClass });

test("registered on ASCENSION; all four read the one plan query", () => {
  for (const w of [ascensionStatus, ascensionOutlook, ascensionIsland, ascensionSteps]) {
    assert.strictEqual(WIDGETS[w.type], w);
    assert.strictEqual(w.page, "ascension");
    assert.deepStrictEqual(w.needs(7), { asc: ascensionQuery(7) });
  }
  assert.deepStrictEqual(ascensionQuery(7), { res: "ascension", farm: 7, grinx: 0, recipes: "{}" });
});

test("the store's ascension resource POSTs the week's _h. snapshots with grinx and the recipe pick", async () => {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init });
    if (url.startsWith("/api/farm-history")) return { ok: true, json: async () => ({ snapshots: [{ captured_at: "t", diff: { "_h.wood": 1, other: 2 } }] }) };
    return { ok: true, json: async () => ({ data: { steps: [] } }) };
  };
  const r = await createStore({ fetch }).get({ res: "ascension", farm: "7", grinx: 1, recipes: '{"Deli":""}' });
  assert.deepStrictEqual(r.data, { steps: [] });
  const post = calls.find((c) => c.url.startsWith("/api/compute"));
  assert.match(post.url, /farm=7&section=ascension&grinx=1&max=10&recipes=%7B%22Deli%22%3A%22%22%7D/);
  assert.strictEqual(post.init.method, "POST");
  assert.deepStrictEqual(JSON.parse(post.init.body), { snapshots: [{ captured_at: "t", diff: { "_h.wood": 1 } }] });
});

test("status: island, land, ascension, XP/day as tiles; ready pill; stock with icons", () => {
  const html = ascensionStatus.view({ asc: d }, CTX).html;
  assert.match(html, /<b>volcano<\/b><span>island<\/span>/);
  assert.match(html, /<b>30<\/b><span>Basic Land<\/span>/);
  assert.match(html, /<b>A0<\/b><span>ascension<\/span>/);
  assert.match(html, new RegExp(`<b>${Math.round(d.rates.xpPerDay).toLocaleString()}</b><span>XP/day from cooking`));
  assert.match(html, /class="v-pill v-ok">READY TO ASCEND/);
  assert.match(html, /<i>Crimstone<\/i><b>\d+<\/b><span>Crimstone<\/span>/);
  assert.match(html, /<span class="v-asc-crys"><i>Ascension Crystal<\/i><\/span>/);
  assert.match(ascensionStatus.view({}, CTX).empty, /No ascension plan/);
});

test("outlook: reach bars per resource, the bottleneck, the continuous-expand verdict in the copy's mode", () => {
  const html = ascensionOutlook.view({ asc: d }, CTX, {}).html;
  assert.strictEqual((html.match(/class="v-asc-reach-row/g) || []).length, 4);
  for (const r of ["Crimstone", "Oil", "Obsidian", "Coins"]) assert.match(html, new RegExp(`<i>${r}</i>${r}</span><div class="v-bar">.*?covers <b>${d.reach[r]}</b> of ${d.steps.length} steps`));
  if (d.bottleneck) assert.match(html, /class="v-pill v-bad">bottleneck/);
  assert.match(html, /Continuous expand|continuous-expand pace/);
  assert.match(html, /📊 real/);
  assert.match(ascensionOutlook.view({ asc: d }, CTX, { mode: "theo" }).html, /🎯 theoretical/);
  assert.match(ascensionOutlook.titleFor({ mode: "theo" }), /theoretical/);
});

test("island completion: the pre-ascension steps, costs with icons, state pills and row tints", () => {
  // the fixture farm has finished its islands; a desert farm on 24 land has not
  assert.strictEqual(ascensionIsland.build({ asc: d }, CTX, {}).rows.length, 0);
  assert.match(ascensionIsland.build({ asc: d }, CTX, {}).empty, /Every island is complete/);
  const f = structuredClone(farm);
  f.island = { type: "desert" };
  f.inventory["Basic Land"] = "24";
  const dd = JSON.parse(JSON.stringify(buildAscensionSection(f, powerData, cooking.totalXpPerDay, eff, { max: 1 })));
  const out = ascensionIsland.build({ asc: dd }, CTX, {});
  const pre = dd.steps.filter((s) => s.asc === 0);
  assert.ok(pre.length > 2);
  assert.strictEqual(out.rows.length, pre.length);
  const html = table(ascensionIsland, out);
  assert.match(html, /<b>⬆ volcano<\/b>/, "the island upgrade step");
  assert.match(html, /<span class="v-asc-crys"><i>Ascension Crystal<\/i><\/span><span class="v-asc-shards">/, "the crystal and shards it grants");
  assert.match(html, /class="v-asc-costs"><span class="v-asc-(have|miss)"><i>[A-Z][a-z]+<\/i>\d+/);
  assert.match(html, /class="v-pill v-(ok|run|bad)">(have it|on pace|stuck)/);
  assert.match(out.footer, /misses its build slot/);
});

test("ascension steps: one ascension per copy, resources with header icons, slot and farm ETA", () => {
  const out = ascensionSteps.build({ asc: d }, CTX, { asc: "1" });
  const a1 = d.steps.filter((s) => s.asc === 1);
  assert.strictEqual(out.rows.length, a1.length);
  const html = table(ascensionSteps, out);
  assert.match(html, /<th[^>]*><i>Crimstone<\/i><span class="v-asc-hlbl">Crimstone<\/span>/);
  assert.match(html, /<b>⬆ A1<\/b>/);
  assert.match(html, /exp <b>\d+<\/b>/);
  // state = the cumulative stock + level check, same rule as before
  const first = out.rows[0];
  const allRes = Object.keys(first.s.cum || {}).every((r) => (first.s.cum[r] || 0) <= (d.current.stock[r] ?? 0));
  assert.strictEqual(first.state === "ok", allRes && first.s.levelMet);
  const ok = out.rows.filter((r) => r.state === "ok").length;
  assert.match(out.summary, new RegExp(`<b>${ok} / ${a1.length}</b><span>covered now`));
  assert.match(out.summary, /<b>150\+<\/b>/);
  assert.match(ascensionSteps.titleFor({ asc: "3" }), /Ascension 3/);
  // the farm column follows the mode
  const theo = ascensionSteps.build({ asc: d }, CTX, { asc: "2", mode: "theo" });
  assert.ok(theo.rows.every((r) => r.sim === (r.s.sim && r.s.sim.theo)));
});

test("📱 glance model, status: the band being filled (A? L?) with a ring; the stock as items with sprites; island and XP as tiles", () => {
  const m = ascensionStatus.glanceModel({ asc: d }, CTX);
  assert.strictEqual(ascensionStatus.look, "number");
  assert.match(String(m.head.value), /^A\d+$/);
  assert.match(m.head.unit, /^ L\d+$/);
  assert.ok(m.head.ring >= 0 && m.head.ring <= 100);
  assert.strictEqual(m.items.length, 6);
  assert.deepStrictEqual(m.items.map((i) => i.name), ["Shards", "Crystals", "Crimstone", "Oil", "Obsidian", "Coins"]);
  assert.match(m.items[3].icon, /<i>Oil<\/i>/);
  assert.deepStrictEqual(m.tiles.map((t) => t.label), ["land", "ascension", "XP/day"]);
  assert.match(renderLook(m, "number").html, /<div class="gx-num( g-ok)?">A\d+<small> L\d+<\/small><\/div>/);
  assert.ok(looksFor(m).length >= 3);
  assert.deepStrictEqual(ascensionStatus.glanceModel({}, CTX), { empty: "No ascension plan yet." });
  assert.strictEqual(ascensionStatus.glance, undefined);
});

test("📱 glance model, outlook: steps the stock covers (scarcest resource) with a ring and the jam; the four resources with their reach", () => {
  const n = d.steps.length, low = Math.min(...["Crimstone", "Oil", "Obsidian", "Coins"].map((r) => d.reach[r]));
  const m = ascensionOutlook.glanceModel({ asc: d }, CTX, {});
  assert.deepStrictEqual([m.head.value, m.head.unit], [low, `/${n}`]);
  assert.match(m.head.cap, /jams at A\d+·exp\d+|on pace to A\d+/);
  assert.strictEqual(m.items.length, 4);
  assert.strictEqual(m.items[0].value, `${low}/${n}`, "scarcest first");
  if (d.bottleneck) assert.strictEqual(m.items.find((i) => i.name === d.bottleneck).tone, "bad");
  assert.ok(m.items.every((i) => i.pct >= 0 && i.pct <= 100 && i.icon));
  assert.strictEqual((renderLook(m, "bars-t").html.match(/class="gx-bar"/g) || []).length, 4);
  assert.ok(looksFor(m).length >= 3);
  assert.deepStrictEqual(ascensionOutlook.glanceModel({}, CTX), { empty: "No ascension plan yet." });
  assert.strictEqual(ascensionOutlook.glance, undefined);
});

test("📱 glance model, steps: covered / total with a ring; the steps, pending first, each with its state chip", () => {
  const out = ascensionSteps.build({ asc: d }, CTX, { asc: "1" });
  const ok = out.rows.filter((r) => r.state === "ok").length, pending = out.rows.filter((r) => r.state !== "ok");
  const m = ascensionSteps.glanceModel({ asc: d }, CTX, { asc: "1" });
  assert.deepStrictEqual([m.head.value, m.head.unit], [ok, `/${out.rows.length}`]);
  assert.strictEqual(m.items.length, out.rows.length);
  if (pending.length) {
    assert.match(m.items[0].sub, /^farm [\d.∞?hd]+ · slot /);
    assert.ok(["on pace", "stuck"].includes(m.items[0].chip.text));
  }
  assert.match(m.items[0].name, /^A1·exp\d+|A1 upgrade$/);
  assert.strictEqual((renderLook(m, "list-4").html.match(/class="gx-row[" ]/g) || []).length, Math.min(8, out.rows.length));
  assert.ok(looksFor(m).length >= 3);
  // a finished set: islands say ✓, an ascension outside the plan says why
  assert.deepStrictEqual(ascensionIsland.glanceModel({ asc: d }, CTX, {}), { head: { value: "✓", tone: "ok", cap: "every island complete" } });
  assert.match(ascensionSteps.glanceModel({ asc: { ...d, steps: [] } }, CTX, { asc: "1" }).empty, /not in the plan/);
  // a desert farm still has island steps
  const f = structuredClone(farm);
  f.island = { type: "desert" };
  f.inventory["Basic Land"] = "24";
  const dd = JSON.parse(JSON.stringify(buildAscensionSection(f, powerData, cooking.totalXpPerDay, eff, { max: 1 })));
  assert.ok(ascensionIsland.glanceModel({ asc: dd }, CTX, {}).items.length > 0);
  assert.deepStrictEqual(ascensionIsland.glanceModel({}, CTX), { empty: "No ascension plan yet." });
  for (const w of [ascensionIsland, ascensionSteps]) { assert.strictEqual(w.glance, undefined); assert.strictEqual(w.look, "number"); }
});

