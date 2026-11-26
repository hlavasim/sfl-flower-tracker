import "../helpers/page-engine.mjs";
import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { flowerGifts, flowerGiftCycle, petalBlessed, growPlanner, rewardHtml } from "../../widgets/flowers-plan.mjs";
import { beehives } from "../../widgets/beehives.mjs";
import { WIDGETS } from "../../widgets/registry.mjs";
import { renderTable } from "../../ui/table.mjs";
import { evalPage } from "../helpers/page-eval.mjs";
import { renderLook, looksFor, TEMPLATE_IDS } from "../../ui/glance-templates.mjs";

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

// The gift plan the page reads (localStorage) swapped for one call.
const withPlan = (plan, fn) => {
  const was = page.store.sfl_gift_plan;
  page.store.sfl_gift_plan = JSON.stringify(plan);
  try { return fn(); } finally { page.store.sfl_gift_plan = was; }
};
// a plan the four beds can grow: one Prism Petal (its 4-flower chain) and one Red Pansy a day
const FEASIBLE = { betty: "Red Pansy", bert: "Prism Petal" };

test("gift cycle: the batch schedule's numbers, a timeline, production vs demand with bars", () => {
  const m = withPlan(FEASIBLE, () => P._giftsModel(P._flowerPageData(FARM)));
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
  assert.match(out.html, /<b>4\.0d \(96\.0h\)<\/b><span>one cycle<\/span>/);
  // nothing planned → says how to start
  assert.match(flowerGiftCycle.view({ farm: FARM }, ctx(() => ({ ...m, cycle: null }))).empty, /Select flowers/);
});

test("gift cycle: a plan the beds cannot grow says so instead of a runaway cycle (was '1003.0d (24073.0h) — one cycle')", () => {
  // two Prism Petals and a Red Pansy a day: ~64 h of growing a day in 4 beds; the page's scheduler
  // never settles and stops after 8 rounds at a cycle of ~24,000 h
  const m = P._giftsModel(P._flowerPageData(FARM));
  assert.ok(m.cycle.cycleH > 10000, "the page model still runs away");
  const { html } = flowerGiftCycle.view({ farm: FARM }, ctx(() => m));
  assert.doesNotMatch(html, /one cycle/);
  assert.doesNotMatch(html, /\d{3,}\.\d+d/);
  assert.match(html, /needs about <b>64h<\/b> of growing a day in all 4 beds/);
  assert.match(html, /cannot keep up/);
  assert.match(html, /Daily demand/);
  const g = flowerGiftCycle.glanceModel({ farm: FARM }, ctx(() => m), {});
  assert.deepStrictEqual([g.head.value, g.head.tone, g.head.cap], ["Too much", "bad", "the plan needs ~64h of growing a day"]);
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

test("grow planner: plantings with times, the PB batch; target and sleep hours are the copy's ⚙ options", () => {
  const opts = { mode: "collection", n: 5, sleepStart: 22, sleepEnd: 6 };
  const m = P._growPlanModel(P._flowerPageData(FARM), opts);
  assert.deepStrictEqual(m.sleep, { start: 22, end: 6 });
  const out = growPlanner.build({ farm: FARM }, ctx((f, o) => P._growPlanModel(P._flowerPageData(f), o)), opts);
  assert.deepStrictEqual(growPlanner.options.map((o) => o.key), ["mode", "n", "sleepStart", "sleepEnd"]);
  assert.strictEqual(growPlanner.titleFor({ mode: "gifts", n: 3 }), "📋 Grow planner · 🎁 3");
  if (m.done) { assert.match(out.empty, /All flowers at target/); return; }
  assert.strictEqual(out.rows.length, (m.plan.pbReady ? 0 : m.plan.steps.length) + m.plan.pbFlowers.length);
  assert.match(out.summary, /<b>22–06<\/b>/);
  assert.doesNotMatch(out.summary, /updateSleepSchedule/);
  const html = renderTable(growPlanner.columns, out.rows, growPlanner.defaults, { rowKey: growPlanner.rowKey });
  assert.match(html, /class="v-ring"/);
  assert.match(html, /class="v-pill v-(ok|idle|run)">(Plant|⚡)/);
});

test("Petal Blessed and the grow planner plan for their own copy's target, not the page's", () => {
  const data = P._flowerPageData(FARM);
  const a = P._petalBlessedModel(data, { mode: "collection", n: 1 }).picks.length;
  const b = P._petalBlessedModel(data, { mode: "collection", n: 60 }).picks.length;
  assert.ok(b >= a, `a higher N wants at least as many beds (${a} → ${b})`);
  const coll = P._growPlanModel(data, { mode: "collection", n: 60 });
  assert.strictEqual(coll.done, false, "60 of every flower is not done");
});

test("beehives: a honey ring per hive and the swarm note", () => {
  const hives = [{ id: "h-001", progressPct: 40, readyAt: Date.now() + 3600000, hasSwarm: true }];
  const out = beehives.build({ farm: {} }, { hives: () => hives, countdown: () => "1h", icon: ICON });
  const html = renderTable(beehives.columns, out.rows, beehives.defaults, { rowKey: beehives.rowKey });
  assert.match(html, /class="v-ring" style="--p:40"><span><i>Honey<\/i>/);
  assert.match(out.footer, /Bee swarm active/);
});

test("📱 glance models: the four planners have a model and a natural look, no hand-written face", () => {
  for (const w of [flowerGifts, flowerGiftCycle, petalBlessed, growPlanner]) {
    assert.strictEqual(typeof w.glanceModel, "function", w.type);
    assert.ok(TEMPLATE_IDS.includes(w.look), w.type);
    assert.strictEqual(w.glance, undefined, w.type);
  }
});

test("📱 glance models: gift planner = planned gifts given today with a ring, the planned NPCs (to give first); nothing planned is empty", () => {
  const m = P._giftsModel(P._flowerPageData(FARM));
  const given = m.npcs.filter((n) => n.planned && n.givenToday).length;
  const g = flowerGifts.glanceModel({ farm: FARM }, ctx(() => m), {});
  assert.deepStrictEqual([g.head.value, g.head.unit, g.head.cap, g.head.ring], [given, "/3", "planned gifts given today", (given / 3) * 100]);
  assert.strictEqual(g.items.length, 3);
  const betty = g.items.find((i) => i.name === "Betty");
  assert.strictEqual(betty.icon, "<i>Red Pansy</i>");
  assert.match(betty.sub, /^Red Pansy · /);
  assert.ok(["to give", "given"].includes(betty.chip.text));
  assert.match(renderLook(g, "list-4").html, /<span class="gx-ic"><i>Red Pansy<\/i><\/span><div class="gx-n">Betty<div>Red Pansy · /);
  assert.ok(looksFor(g).length >= 3);
  const none = { ...m, npcs: m.npcs.map((n) => ({ ...n, planned: "" })) };
  assert.match(flowerGifts.glanceModel({ farm: FARM }, ctx(() => none), {}).empty, /No gifts planned/);
  assert.strictEqual(flowerGifts.glanceModel({}, ctx(() => m), {}).empty, "No farm data.");
});

test("📱 glance models: gift cycle = one cycle's length, the daily demand per flower, batches / PB / yield tiles; no plan is empty", () => {
  const m = withPlan(FEASIBLE, () => P._giftsModel(P._flowerPageData(FARM)));
  const g = flowerGiftCycle.glanceModel({ farm: FARM }, ctx(() => m), {});
  assert.deepStrictEqual([g.head.value, g.head.cap], ["4.0d", "one cycle · 5 batches"]);
  assert.strictEqual(g.items.length, m.cycle.needList.length);
  assert.match(g.items[0].value, /^\d+\/day$/);
  assert.match(renderLook(g, "tiles-1").html, /<div class="gx-numlist"><div><span>batches<\/span><b>5<\/b><\/div><div><span>⚡ PB uses<\/span><b>1<\/b><\/div><div><span>yield<\/span><b>×1\.60<\/b>/);
  assert.match(flowerGiftCycle.glanceModel({ farm: FARM }, ctx(() => ({ ...m, cycle: null })), {}).empty, /No gifts planned/);
});

test("📱 glance models: Petal Blessed = its state and what it saves, the beds to plant; no farm is empty", () => {
  const m = P._petalBlessedModel(P._flowerPageData(FARM));
  const saved = m.picks.reduce((s, p) => s + p.seedHours, 0);
  const g = petalBlessed.glanceModel({ farm: FARM }, ctx(() => m), {});
  assert.deepStrictEqual([g.head.value, g.head.tone, g.head.cap], ["Ready", "ok", `${m.picks.length} to plant · saves ${saved}h`]);
  assert.strictEqual(renderLook(g, "number").html, `<div class="gx gx-1x1" style="--gw:1"><div class="gx-head"><div class="gx-num g-ok">Ready</div><div class="gx-cap">${m.picks.length} to plant · saves ${saved}h</div></div></div>`);
  const cd = petalBlessed.glanceModel({ farm: FARM }, { ...ctx(() => ({ ...m, status: { status: "cooldown", nextAt: 2e12 } })), now: 2e12 - 600000 }, {});
  assert.deepStrictEqual([cd.head.value, cd.head.tone], ["10m", "info"]);
  assert.strictEqual(g.items.length, m.picks.length);
  assert.deepStrictEqual([g.items[0].icon, g.items[0].name, g.items[0].sub], [`<i>${m.picks[0].name}</i>`, m.picks[0].name, `${m.picks[0].seedLabel} Seed + ${m.picks[0].input}`]);
  assert.strictEqual(petalBlessed.glanceModel({}, ctx(() => m), {}).empty, "No farm data.");
});

test("📱 glance models: grow planner = the next thing to do, the plantings in order, each counting down to its time; nothing to plan is empty", () => {
  const opts = { mode: "collection", n: 5 };
  const model = (f, o) => P._growPlanModel(P._flowerPageData(f), o);
  const out = growPlanner.build({ farm: FARM }, ctx(model), opts);
  assert.ok(out.rows.length > 0);
  const list = out.rows.slice().sort((a, b) => a.at - b.at), first = list[0];
  const g = growPlanner.glanceModel({ farm: FARM }, ctx(model), opts);
  assert.strictEqual(growPlanner.look, "next");
  assert.strictEqual(g.head.hero, `<i>${first.flower}</i>`);
  if (first.now) assert.deepStrictEqual([g.head.value, g.head.tone], ["Now", "ok"]);
  assert.match(g.head.cap, new RegExp(`${first.pb ? "⚡ Petal Blessed" : "plant"} ${first.flower}`));
  assert.strictEqual(g.items.length, out.rows.length);
  // the plan is computed from the clock twice (build, then the model): the same times within a moment
  g.items.forEach((it, k) => assert.ok(Math.abs(it.at - list[k].at) < 1000, "a live countdown to each planting"));
  assert.ok(g.items.every((i) => i.chip === undefined));
  assert.match(renderLook(g, "next").html, new RegExp(`<div class="gx-next-name">${first.flower}</div>.*<span class="g-at" data-at="${g.items[0].at}">`));
  assert.ok(looksFor(g).length >= 3);
  const done = growPlanner.glanceModel({ farm: FARM }, ctx(() => ({ done: true, plan: {}, sleep: {} })), opts);
  assert.match(done.empty, /All flowers at target/);
});

test("gift cycle: Petal Blessed is never used again before its cooldown — also across one cycle into the next", () => {
  for (const plan of [FEASIBLE, { betty: "Red Pansy" }]) {
    const c = withPlan(plan, () => P._giftsModel(P._flowerPageData(FARM))).cycle;
    assert.ok(c.pbCooldownH > 0);
    const uses = c.events.filter((e) => e.kind === "pb_harvest").map((e) => e.time);
    for (let k = 1; k < uses.length; k++) assert.ok(uses[k] - uses[k - 1] >= c.pbCooldownH - 1e-6, "within a cycle");
    // on average PB cannot be used more often than its cooldown allows
    assert.ok(c.pbUsesInCycle <= c.cycleH / c.pbCooldownH + 0.02, `${c.pbUsesInCycle} uses in a ${c.cycleH}h cycle, cooldown ${c.pbCooldownH}h`);
    assert.ok(c.cycleH >= 1, `a real cycle, not ${c.cycleH}h`);
  }
});
