import "../helpers/page-engine.mjs";
import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { buildAscensionSection } from "../../core/sections/ascension.mjs";
import { buildPowerSection } from "../../core/sections/power.mjs";
import { buildCookingSection } from "../../core/sections/cooking.mjs";
import { WIDGETS } from "../../widgets/registry.mjs";
import { renderTable } from "../../ui/table.mjs";
import { compact } from "../../ui/glance.mjs";
import { renderLook, looksFor, TEMPLATE_IDS } from "../../ui/glance-templates.mjs";
import { NODES_WIDGETS, nodesSummary, nodesPlan, nodesOptions, nodesRoad, nodesCurrent, nodesAcq, nodeOptions, nodePlan, nodeRoad, nodesQuery, PLAN_STEP_CAP } from "../../widgets/nodes.mjs";

// NODES as widgets, on the real section=ascension answer (nodeAcq) for farm 155498.
const wrap = JSON.parse(readFileSync(new URL("../fixtures/farm-155498.json", import.meta.url)));
const farm = wrap.farm || wrap;
const p2p = JSON.parse(readFileSync(new URL("../fixtures/p2p-prices.json", import.meta.url)));
const nfts = JSON.parse(readFileSync(new URL("../fixtures/nfts-sample.json", import.meta.url)));
const powerData = buildPowerSection(farm, p2p, nfts, null, {});
const cooking = buildCookingSection(farm, p2p, { petSimulate: true });
const eff = { effByCat: { crimstone: { measured: true, ratio: 0.5 }, oil: { measured: true, ratio: 0.6 }, obsidian: { measured: true, ratio: 0.9 } }, meta: { days: 7 } };
const asc = JSON.parse(JSON.stringify(buildAscensionSection(farm, powerData, cooking.totalXpPerDay, eff, { max: 10 })));
const acq = asc.nodeAcq;
const CTX = { icon: (n) => `<i>${n}</i>`, nodeIcon: (n) => `<n>${n}</n>`, sfl: () => "<F>" };
const table = (w, out, settings = w.defaults) => renderTable(w.columns, out.rows, settings, { rowKey: w.rowKey });

test("registered on NODES; they load the farm and section=ascension with the history POSTed", () => {
  for (const w of NODES_WIDGETS) {
    assert.strictEqual(WIDGETS[w.type], w);
    assert.strictEqual(w.page, "nodes");
    const n = w.needs("7");
    assert.deepStrictEqual(n.farm, { res: "farm", farm: "7" });
    assert.deepStrictEqual(n.asc, nodesQuery("7"));
    assert.strictEqual(n.asc.res, "computeHist");
    assert.strictEqual(n.asc.section, "ascension");
    assert.strictEqual(n.asc.q.max, 10);
  }
});

test("summary: sunstone price from obsidian's production cost, holdings with icons", () => {
  const out = nodesSummary.view({ farm, asc }, CTX);
  const sun = acq.prodCost.Obsidian * (acq.obsidianPerSunstone || 3);
  assert.ok(out.html.includes(`${sun.toFixed(4)} <F>`));
  assert.ok(out.html.includes(`${Math.floor(parseFloat(farm.inventory.Obsidian) || 0)} <i>Obsidian</i>`));
  assert.match(out.html, /obsidian per sunstone, obsidian at its production cost/);
  assert.deepStrictEqual(Object.keys(nodesSummary.view({ farm }, CTX)), ["empty"]);
});

test("options: buy the next node or merge, by ROI = cost / real income (no second efficiency step)", () => {
  const opts = nodeOptions(acq, farm);
  assert.ok(opts.length > 3);
  for (let i = 1; i < opts.length; i++) assert.ok(opts[i - 1].roiDays <= opts[i].roiDays || !isFinite(opts[i].roiDays));
  const buy = opts.find((o) => !o.isMerge && o.real > 0);
  const d = acq.perType[buy.node];
  assert.strictEqual(buy.real, d.profitPerDay);
  assert.strictEqual(buy.roiDays, d.buy[0].matSfl / d.profitPerDay);
  const out = nodesOptions.build({ farm, asc }, CTX, { which: "profitable" });
  assert.ok(out.rows.every((r) => r.real > 0));
  const html = table(nodesOptions, out);
  assert.ok(html.includes(`+${out.rows[0].real.toFixed(4)}`));
  assert.match(html, /<n>[A-Z]/);
  const bad = nodesOptions.build({ farm, asc }, CTX, { which: "unprofitable" });
  assert.ok(bad.rows.every((r) => !(r.real > 0)));
  assert.match(bad.footer, /Nothing is clamped to zero/);
});

test("plan: the greedy ROI order under the cap, escalating prices, cumulative columns; a per-copy cap", () => {
  const r = nodePlan(acq, farm, Infinity);
  assert.ok(r.plan.length > 0);
  const two = nodePlan(acq, farm, 730).plan;
  assert.ok(two.every((p) => p.roi <= 730));
  assert.deepStrictEqual(two.map((p) => p.label), r.plan.filter((p) => p.roi <= 730).slice(0, two.length).map((p) => p.label));
  for (let i = 1; i < r.plan.length; i++) assert.ok(r.plan[i - 1].roi <= r.plan[i].roi);
  const last = r.plan[r.plan.length - 1];
  assert.ok(Math.abs(last.cumCost - r.plan.reduce((a, p) => a + p.costSfl, 0)) < 1e-9);
  // the next purchase of the same node costs more
  const buys = r.plan.filter((p) => !p.isMerge);
  const twice = buys.find((p) => buys.filter((q) => q.node === p.node).length > 1);
  if (twice) { const same = buys.filter((q) => q.node === twice.node); assert.ok(same[1].sunstoneCost > same[0].sunstoneCost); }
  const out = nodesPlan.build({ farm, asc }, CTX, { cap: "all" });
  assert.strictEqual(out.rows.length, r.plan.length);
  assert.ok(out.summary.includes(`${r.cost.toFixed(1)} <F>`));
  assert.strictEqual(nodesPlan.build({ farm, asc }, CTX, nodesPlan.defaults.opts).rows.length, two.length, "2 years by default");
  assert.strictEqual(nodesPlan.titleFor({ cap: "1y" }), "📋 Node plan – ROI ≤ 1 year");
  assert.ok(nodesPlan.build({ farm, asc }, CTX, { cap: "1y" }).rows.every((x) => x.roi <= 365));
  assert.match(table(nodesPlan, out), /<i>Sunstone<\/i>|<i>Obsidian<\/i>/);
  assert.strictEqual(PLAN_STEP_CAP, 50);
});

test("road to 2× T3: what to buy and merge per type, totals; done types marked", () => {
  const { rows, tot } = nodeRoad(acq);
  assert.ok(rows.length > 0);
  assert.ok(Math.abs(tot.sfl - rows.reduce((a, r) => a + r.totalSfl, 0)) < 1e-9);
  for (const r of rows) assert.strictEqual(r.t2ToCreate, Math.max(0, 4 * r.t3ToMake - r.current.t2));
  const out = nodesRoad.build({ asc }, CTX);
  assert.ok(out.summary.includes(`${tot.sfl.toFixed(1)} <F>`));
  assert.match(table(nodesRoad, out), /class="v-bar"/);
});

test("current nodes: net, per node and real; unsellable / unpriced as units, never 0.00", () => {
  const out = nodesCurrent.build({ asc }, CTX);
  assert.strictEqual(out.rows.length, Object.keys(acq.perType).length);
  const priced = out.rows.find((r) => !r.units && r.effective > 0);
  const d = acq.perType[priced.node];
  assert.strictEqual(priced.realTotal, d.profitPerDay * d.tiers.effective);
  const html = table(nodesCurrent, out);
  assert.ok(html.includes(priced.realTotal.toFixed(2)));
  const units = out.rows.find((r) => r.units);
  if (units) assert.match(units.units.real, /\/d$/);
});

test("expand vs buy: the served verdict, obsidian the gate, English", () => {
  const out = nodesAcq.build({ asc }, CTX);
  assert.strictEqual(out.rows.length, Object.keys(acq.perType).length);
  const html = table(nodesAcq, out);
  assert.match(html, /EXPAND|BUY|buy only/);
  assert.match(out.footer, /Obsidian is the gate/);
  assert.doesNotMatch(html + out.footer, /[ěščřžůň]/);
});

test("📱 glance models: every nodes widget has a model and a natural look, no hand-written face; no ascension answer → empty", () => {
  for (const w of NODES_WIDGETS) {
    assert.strictEqual(w.glance, undefined, `${w.type}: the hand-written face is gone`);
    assert.strictEqual(w.sizes, undefined, w.type);
    assert.ok(TEMPLATE_IDS.includes(w.look), `${w.type} ${w.look}`);
    assert.deepStrictEqual(Object.keys(w.glanceModel({}, CTX, {})), ["empty"], w.type);
  }
});

const D = { farm, asc };
const rowsIn = (h) => (h.match(/class="gx-row[" ]/g) || []).length;

test("📱 glance summary: obsidian in hand with how far it goes to the cheapest node; the stock, the sunstone price", () => {
  const m = nodesSummary.glanceModel(D, CTX, {});
  const obs = Math.floor(parseFloat(farm.inventory.Obsidian));
  assert.deepStrictEqual([m.head.value, m.head.unit, m.head.hero], [obs, " obs", "<i>Obsidian</i>"]);
  assert.strictEqual(m.items.length, 5);
  assert.deepStrictEqual([m.items[0].name, m.items[0].value, m.items[0].icon], ["Obsidian", obs, "<i>Obsidian</i>"]);
  assert.deepStrictEqual(m.tiles.map((t) => t.label), ["obsidian", "sunstones", "a sunstone", "coins"]);
  assert.match(renderLook(m, "number").html, new RegExp(`<div class="gx-num(?: gx-num-long)?">${obs}<small> obs</small></div>`));
  assert.ok(looksFor(m).length >= 3);
});

test("📱 glance plan: the first buy's payback; every step with what it adds; the income as a series", () => {
  const plan = nodesPlan.build(D, CTX, { cap: "all" }).rows;
  const m = nodesPlan.glanceModel(D, CTX, { cap: "all" });
  assert.deepStrictEqual([m.head.hero, m.head.cap], [`<n>${plan[0].node}</n>`, `next: ${plan[0].label}`]);
  assert.strictEqual(m.items.length, plan.length);
  assert.strictEqual(m.series.length, plan.length + 1);
  assert.deepStrictEqual([m.items[0].name, m.items[0].icon], [plan[0].label, `<n>${plan[0].node}</n>`]);
  assert.ok(looksFor(m).length >= 3);
  assert.deepStrictEqual(nodesPlan.glanceModel({ farm, asc: { nodeAcq: { ...acq, perType: {}, merge: [] } } }, CTX, {}), { empty: "Nothing pays back within this ROI cap." });
});

test("📱 glance options: the best option by payback; every option, the unaffordable ones say what is missing", () => {
  const opts = nodesOptions.build(D, CTX, { which: "profitable" }).rows;
  const m = nodesOptions.glanceModel(D, CTX, { which: "profitable" });
  assert.strictEqual(m.items.length, opts.length);
  assert.strictEqual(m.items[0].name, opts[0].action);
  const poor = opts.findIndex((o) => !o.canAfford);
  if (poor >= 0) assert.strictEqual(m.items[poor].sub, opts[poor].need);
  assert.strictEqual(rowsIn(renderLook(m, "list-4").html), Math.min(8, opts.length));
  assert.ok(looksFor(m).length >= 3);
});

test("📱 glance road: FLOWER to 2× T3 with the T3 share as a ring; one item per mergeable type", () => {
  const { rows: road, tot } = nodeRoad(acq);
  const m = nodesRoad.glanceModel(D, CTX, {});
  assert.ok(tot.sfl > 0);
  assert.deepStrictEqual([m.head.value, m.head.ringTone], [compact(tot.sfl), "accent"]);
  assert.match(m.head.cap, /to 2× T3/);
  assert.strictEqual(m.items.length, road.length);
  assert.ok(m.items.every((i) => i.pct >= 0 && i.pct <= 100));
  assert.match(renderLook(m, "number").html, /class="gx-corner"><svg class="gx-ring g-accent"/);
  assert.ok(looksFor(m).length >= 3);
});

test("📱 glance current: the real FLOWER/day of every priced node type, biggest earners first", () => {
  const cur = nodesCurrent.build(D, CTX).rows.filter((r) => !r.units);
  const real = cur.reduce((a, r) => a + r.realTotal, 0);
  const m = nodesCurrent.glanceModel(D, CTX, {});
  assert.deepStrictEqual([m.head.value, m.head.unit], [Math.abs(real) >= 10 ? compact(real) : real.toFixed(2), "/d"]);
  assert.match(m.head.cap, /^FLOWER, real · \d+ nodes$/);
  const best = cur.slice().sort((a, b) => b.realTotal - a.realTotal)[0];
  assert.deepStrictEqual([m.items[0].name, m.items[0].pct], [best.node, 100]);
  assert.match(renderLook(m, "overview-4").html, /class="gx-tiles"/);
  assert.ok(looksFor(m).length >= 3);
});

test("📱 glance expand vs buy: how many types expanding wins (a ring); the served verdict per type as a chip", () => {
  const m = nodesAcq.glanceModel(D, CTX, {});
  assert.strictEqual(m.head.unit, `/${Object.keys(acq.perType).length}`);
  assert.strictEqual(m.items.length, Object.keys(acq.perType).length);
  assert.ok(["EXPAND", "BUY", "BUY ONLY"].includes(m.items[0].chip.text));
  assert.match(renderLook(m, "list-4").html, /class="gx-chip g-ok">EXPAND<|class="gx-chip g-info">BUY<|class="gx-chip">BUY ONLY</);
  assert.ok(looksFor(m).length >= 3);
});
