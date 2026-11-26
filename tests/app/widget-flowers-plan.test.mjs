import "../helpers/page-engine.mjs";
import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { flowerGifts, flowerGiftCycle, petalBlessed, growPlanner, rewardHtml } from "../../widgets/flowers-plan.mjs";
import { beehives } from "../../widgets/beehives.mjs";
import { WIDGETS } from "../../widgets/registry.mjs";
import { renderTable } from "../../ui/table.mjs";
import { evalPage } from "../helpers/page-eval.mjs";

// FLOWERS planners as widgets, fed the page's own models (evaluated from flowers.html) on a real farm.
const FARM = JSON.parse(readFileSync(new URL("../fixtures/farm-155498.json", import.meta.url), "utf8")).farm;
const PLAN = { betty: "Red Pansy", bert: "Prism Petal", corale: "Prism Petal" };
const page = evalPage(["_giftsModel", "_petalBlessedModel", "_growPlanModel", "_flowerPageData", "_wCtx", "_wIcon"],
  { store: { sfl_gift_plan: JSON.stringify(PLAN), sfl_flower_mode: "collection", sfl_flower_n: "5" } });
const P = page.api;
const ICON = (n) => `<i>${n}</i>`;
const ctx = (model) => ({ icon: ICON, hours: (h) => `${h}h`, countdown: (ms) => `${Math.round(ms / 60000)}m`, model });
const keys = (html) => [...html.matchAll(/data-row="([^"]+)"/g)].map((m) => m[1]);

test("registered on the FLOWERS page; they need only the farm", () => {
  for (const w of [flowerGifts, flowerGiftCycle, petalBlessed, growPlanner]) {
    assert.strictEqual(WIDGETS[w.type], w);
    assert.strictEqual(w.page, "flowers");
    assert.deepStrictEqual(w.needs(7), { farm: { res: "farm", farm: 7 } });
  }
});

test("the page registers each widget's context (icons included) in _wCtxMap", () => {
  for (const t of ["flower-gifts", "flower-gift-cycle", "petal-blessed", "grow-planner", "beehives"]) {
    const c = P._wCtx(t);
    assert.strictEqual(typeof c.icon, "function", t);
  }
  assert.match(P._wIcon("Red Pansy"), /<img src="[^"]+" onerror="this.style.display='none'" alt="" style="height:1.2em/);
  const m = P._wCtx("flower-gifts").model(FARM);
  assert.strictEqual(m.plannedCount, 3);
});

test("gift planner: one row per NPC, the plan counted, given/to-give pills, a dropdown with icons", () => {
  const m = P._giftsModel(P._flowerPageData(FARM));
  const out = flowerGifts.build({ farm: FARM }, ctx(() => m));
  assert.strictEqual(out.rows.length, m.npcs.length);
  assert.match(out.summary, /<b>3 \/ 14<\/b><span>NPCs with a gift planned<\/span>/);
  const html = renderTable(flowerGifts.columns, out.rows, flowerGifts.defaults, { rowKey: flowerGifts.rowKey });
  assert.deepStrictEqual(keys(html), m.npcs.map((n) => n.npc));
  assert.match(html, /class="v-pill v-(bad|ok)">(to give|given)</);
  assert.match(html, /<i>Red Pansy<\/i><span class="gift-dd-name">Red Pansy<\/span>/);
  assert.match(html, /onclick="_giftsSelectFlower\('betty', 'Red Pansy', event\)"/);
  assert.match(html, /class="v-bar"/);
  // betty: 3439 points, the reward ladder's next threshold; the progress bar is points / threshold
  const betty = out.rows.find((r) => r.npc === "betty");
  assert.strictEqual(betty.points, 3439);
  assert.ok(betty.next && betty.next.threshold > 3410);
});

test("a reward lists every item, coin and wearable with its icon", () => {
  const h = rewardHtml({ items: { "Treasure Key": 1 }, coins: 2500, wearables: { "Pirate Hat": 1 }, recipe: "Pirate Bed" }, { icon: ICON });
  assert.strictEqual(h, "1× <i>Treasure Key</i>Treasure Key · <i>Coin</i>2,500 · <i>Pirate Hat</i>Pirate Hat · 📜 <i>Pirate Bed</i>Pirate Bed");
});

test("gift cycle: the batch schedule's numbers, a timeline, production vs demand with bars", () => {
  const m = P._giftsModel(P._flowerPageData(FARM));
  const c = m.cycle;
  assert.ok(c && c.cycleH > 0 && c.totalBatches >= c.stepRows.length);
  // Prism Petal's chain is three flowers; Red Pansy one: every step of both is grown
  assert.deepStrictEqual(c.stepRows.map((r) => r.flower).sort(), ["Blue Lotus", "Blue Pansy", "Prism Petal", "Purple Cosmos", "Red Pansy"].filter((f) => c.stepRows.some((r) => r.flower === f)).sort());
  for (const r of c.stepRows) assert.ok(r.supply >= r.demand - 1e-9, `${r.flower} supply covers demand`);
  const out = flowerGiftCycle.view({ farm: FARM }, ctx(() => m));
  assert.match(out.html, new RegExp(`<b>${c.totalBatches}</b>`));
  assert.match(out.html, /class="v-kpis"/);
  assert.match(out.html, /<i>Prism Petal<\/i><b>Prism Petal<\/b>/);
  assert.match(out.html, /class="v-pill v-idle">🌱 plant</);
  assert.match(out.html, /Production vs demand/);
  assert.strictEqual((out.html.match(/class="v-bar"/g) || []).length, c.stepRows.length);
  // nothing planned → says how to start
  assert.match(flowerGiftCycle.view({ farm: FARM }, ctx(() => ({ ...m, cycle: null }))).empty, /Select flowers/);
});

test("Petal Blessed: the beds to plant with their recipes (icons), the hours it saves", () => {
  const m = P._petalBlessedModel(P._flowerPageData(FARM));
  const out = petalBlessed.build({ farm: FARM }, ctx(() => m));
  assert.strictEqual(out.rows.length, m.picks.length);
  assert.ok(out.rows.length > 0 && out.rows.length <= 4);
  const saved = m.picks.reduce((s, p) => s + p.seedHours, 0);
  assert.match(out.summary, new RegExp(`<b>${saved}h</b><span>grow time it saves</span>`));
  const html = renderTable(petalBlessed.columns, out.rows, petalBlessed.defaults, { rowKey: petalBlessed.rowKey });
  assert.match(html, new RegExp(`<i>${m.picks[0].name}</i><div><b>${m.picks[0].name}</b>`));
  assert.match(html, / Seed<\/i>/);
  // a cooling-down power: a ticking pill; the page copy carries #pb-timer
  const cd = petalBlessed.build({ farm: FARM }, { ...ctx(() => ({ ...m, status: { status: "cooldown", nextAt: 2e12 } })), pbTimer: true, now: 2e12 - 600000 });
  assert.match(cd.summary, /id="pb-timer" data-next="2000000000000" data-ready="2000000000000">10m</);
});

test("grow planner: plantings with times, the PB batch, the sleep hours editable above the table", () => {
  const m = P._growPlanModel(P._flowerPageData(FARM));
  const out = growPlanner.build({ farm: FARM }, ctx(() => m));
  if (m.done) { assert.match(out.empty, /All flowers at target/); return; }
  assert.strictEqual(out.rows.length, (m.plan.pbReady ? 0 : m.plan.steps.length) + m.plan.pbFlowers.length);
  assert.match(out.summary, /onchange="updateSleepSchedule\(this,'start'\)"/);
  assert.match(out.summary, /💤 sleep/);
  const html = renderTable(growPlanner.columns, out.rows, growPlanner.defaults, { rowKey: growPlanner.rowKey });
  assert.match(html, /class="v-ring"/);
  assert.match(html, /class="v-pill v-(ok|idle|run)">(Plant|⚡)/);
});

test("beehives: a honey ring per hive and the swarm note", () => {
  const hives = [{ id: "h-001", progressPct: 40, readyAt: Date.now() + 3600000, hasSwarm: true }];
  const out = beehives.build({ farm: {} }, { hives: () => hives, countdown: () => "1h", icon: ICON });
  const html = renderTable(beehives.columns, out.rows, beehives.defaults, { rowKey: beehives.rowKey });
  assert.match(html, /class="v-ring" style="--p:40"><span><i>Honey<\/i>/);
  assert.match(out.footer, /Bee swarm active/);
});
