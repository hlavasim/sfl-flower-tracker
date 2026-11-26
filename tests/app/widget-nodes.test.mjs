import "../helpers/page-engine.mjs";
import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { buildAscensionSection } from "../../core/sections/ascension.mjs";
import { buildPowerSection } from "../../core/sections/power.mjs";
import { buildCookingSection } from "../../core/sections/cooking.mjs";
import { WIDGETS } from "../../widgets/registry.mjs";
import { renderTable } from "../../ui/table.mjs";
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
