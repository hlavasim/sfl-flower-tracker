import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { levelingSummary, levelingStepsWidget, levelingFrontierWidget, levelingMatrix, levelingState, frontierSvg, lvFmt, lvK } from "../../widgets/leveling.mjs";
import * as LV from "../../core/sections/leveling.mjs";
import { renderTable } from "../../ui/table.mjs";
import { WIDGETS } from "../../widgets/registry.mjs";

// LEVELING's plan, steps, routes and matrix as widgets, on the fixture farm and the saved config.
const farm = JSON.parse(readFileSync(new URL("../fixtures/farm-155498.json", import.meta.url))).farm;
const prices = JSON.parse(readFileSync(new URL("../fixtures/p2p-prices.json", import.meta.url)));
const inputs = { prices, coinsPerSFL: 1192, floors: { Walrus: 1399 }, bids: {}, budFloors: {}, freePoints: 3, now: Date.UTC(2026, 10, 24) };
const leveling = { inputs };
const saved = { target: { ascension: 6, level: 50 } };
const ICON = (n) => `<i>${n}</i>`;
const lin = LV.levelingInputsWithBook(inputs, {});
const cfg = LV.levelingInit(farm, lin, saved).cfg;
const plan = LV.levelingPlan(farm, lin, cfg);

test("registered on the LEVELING page; need the farm, the leveling inputs and (optionally) the book", () => {
  for (const w of [levelingSummary, levelingStepsWidget, levelingFrontierWidget, levelingMatrix]) {
    assert.strictEqual(WIDGETS[w.type], w);
    assert.strictEqual(w.page, "leveling");
    assert.deepStrictEqual(w.needs(5), { farm: { res: "farm", farm: 5 }, leveling: { res: "leveling", farm: 5 }, book: { res: "book" } });
    assert.deepStrictEqual(w.optional, ["book"]);
  }
  assert.match(levelingSummary.view({ farm }, {}).empty, /did not load/);
  assert.match(levelingSummary.view({}, {}).empty, /No farm data/);
});

test("on a board the state is the core plan on the saved config (the page's numbers)", () => {
  const st = levelingState(farm, leveling, null, saved);
  assert.strictEqual(st.plan.totalFlower, plan.totalFlower);
  assert.strictEqual(st.plan.days, plan.days);
  assert.deepStrictEqual(st.steps.map((s) => s.dFlower), LV.levelingSteps(farm, lin, cfg, LV.itemImpacts(farm, lin, cfg), 3).map((s) => s.dFlower));
});

test("summary: days, FLOWER, XP a day and FLOWER per 1 M XP as tiles", () => {
  const { html } = levelingSummary.view({ farm, leveling }, { savedLeveling: saved, icon: ICON });
  assert.match(html, /class="v-kpis"/);
  assert.match(html, new RegExp(`<b>${lvFmt(plan.totalFlower)} FLOWER</b>`));
  assert.match(html, new RegExp(`<b>${lvFmt(plan.xpPerDay.total)}</b><span>XP a day</span>`));
  assert.match(html, /to the end of A6/);
});

test("steps: each with its FLOWER saving; the use buttons only on the page", () => {
  const st = levelingState(farm, leveling, null, saved);
  const board = levelingStepsWidget.build({ farm, leveling }, { savedLeveling: saved, icon: ICON });
  assert.strictEqual(board.rows.length, st.steps.length);
  const html = renderTable(levelingStepsWidget.columns, board.rows, levelingStepsWidget.defaults, { rowKey: levelingStepsWidget.rowKey });
  if (st.steps.length) {
    assert.match(html, new RegExp(`<b class="v-good">${lvK(st.steps[0].dFlower).replace("+", "\\+")}</b>`));
    assert.doesNotMatch(html, /_lvlUseStep/);
    const page = levelingStepsWidget.build({ farm }, { state: st, interactive: true });
    assert.match(renderTable(levelingStepsWidget.columns, page.rows, {}, { rowKey: levelingStepsWidget.rowKey }), /onclick="_lvlUseStep\(0\)"/);
  }
});

test("routes: the compute button on the page; a computed frontier draws the scatter and its table", () => {
  const st = levelingState(farm, leveling, null, saved);
  assert.match(levelingFrontierWidget.view({ farm }, { state: st, interactive: true }).html, /onclick="_lvlFindFront\(\)">Find the cheapest routes/);
  assert.doesNotMatch(levelingFrontierWidget.view({ farm, leveling }, { savedLeveling: saved }).html, /_lvlFindFront/);
  const points = [{ days: 100, flower: 500, kitchens: ["Kitchen"], fish: { age: true }, ticked: ["Walrus"], extras: [] },
    { days: 200, flower: 300, kitchens: [], fish: { eatRaw: true }, ticked: [], extras: [] }];
  const key = JSON.stringify([st.cfg.target, st.cfg.restarts, st.cfg.costScale, st.cfg.resell]);
  const out = levelingFrontierWidget.view({ farm }, { state: { ...st, front: { key, points } }, interactive: true, icon: ICON }).html;
  assert.match(out, /<svg/);
  assert.strictEqual((out.match(/<circle/g) || []).length, 2);
  assert.match(out, /<i>Kitchen<\/i>Kitchen/);
  assert.match(out, /<i>Walrus<\/i>Walrus/);
  assert.doesNotMatch(out, /another target/);
  assert.match(frontierSvg(points, { days: 150, flower: 400 }, false), /stroke="var\(--c-red\)"/);
});

test("matrix: Σ ticked, a column per ascension left, item rows with icons; ticking only on the page", () => {
  const st = levelingState(farm, leveling, null, saved);
  const board = levelingMatrix.view({ farm, leveling }, { savedLeveling: saved, icon: ICON }).html;
  assert.match(board, /Σ ticked \(\d+\)/);
  for (const r of st.ladder) assert.match(board, new RegExp(`>A${r.ascension}</th>`));
  assert.match(board, / disabled>/);
  assert.doesNotMatch(board, /_lvlTick/);
  const shown = st.impacts.filter((r) => r.ticked || Math.abs(r.dXpPerDay) >= 1 || !(Math.abs(r.dRunning) < 0.5));
  if (shown.length) assert.match(board, new RegExp(`<i>${shown[0].name}</i>`));
  const page = levelingMatrix.view({ farm }, { state: st, interactive: true, icon: ICON }).html;
  assert.match(page, /onchange="_lvlTick\(this\.dataset\.n,this\.checked\)"/);
  // "show items with no effect" is the copy's ⚙ option: more rows with it on
  assert.deepStrictEqual(levelingMatrix.options.map((o) => o.key), ["showAll"]);
  const rowsOf = (h) => (h.match(/<tr/g) || []).length;
  assert.ok(rowsOf(levelingMatrix.view({ farm }, { state: st }, { showAll: true }).html) >= rowsOf(levelingMatrix.view({ farm }, { state: st }, {}).html));
});

test("📱 glance, plan: S = days to the target and its FLOWER; M = XP a day, FLOWER per 1 M XP, the bottleneck beside it; L = the XP split", () => {
  assert.deepStrictEqual(levelingSummary.sizes, ["s", "m", "l"]);
  const ctx = { savedLeveling: saved, icon: ICON };
  const s = levelingSummary.glance({ farm, leveling }, ctx, {}, "s").html;
  assert.match(s, new RegExp(`^<div class="g-big">${lvFmt(plan.days)}<small> days</small></div><div class="g-cap">to A6 · [\\d.]+k? FLOWER</div>$`));
  const m = levelingSummary.glance({ farm, leveling }, ctx, {}, "m").html;
  assert.match(m, /^<div class="g-split">/);
  assert.strictEqual((m.match(/class="g-row"/g) || []).length, 3);
  assert.match(m, /<div class="g-n">aging held back by<\/div><span class="g-v">(salt|slots \(restarts\)|fish|—)<\/span>/);
  const l = levelingSummary.glance({ farm, leveling }, ctx, {}, "l").html;
  assert.match(l, /<div class="g-n">kitchens<div>XP a day<\/div>/);
  assert.ok((l.match(/class="g-row"/g) || []).length <= 7);
  // the actual pace gets a meter
  assert.match(levelingSummary.glance({ farm, leveling: { inputs: { ...inputs, actualXpPerDay: 1000 } } }, ctx, {}, "l").html, /class="g-meter"[\s\S]*actually 1k XP a day · \d+ % of the plan/);
  assert.match(levelingSummary.glance({ farm }, {}, {}, "s").empty, /did not load/);
  assert.match(levelingSummary.glance({}, {}, {}, "m").empty, /No farm data/);
});

test("📱 glance, steps: S = the cheapest single change and its saving; M = the first three", () => {
  assert.deepStrictEqual(levelingStepsWidget.sizes, ["s", "m"]);
  const st = levelingState(farm, leveling, null, saved);
  const ctx = { savedLeveling: saved, icon: ICON };
  if (st.steps.length) {
    const s = levelingStepsWidget.glance({ farm, leveling }, ctx, {}, "s").html;
    assert.ok(s.includes(`${lvK(st.steps[0].dFlower)}<small> FLOWER</small></div><div class="g-cap">${st.steps[0].label}</div>`));
    const m = levelingStepsWidget.glance({ farm, leveling }, ctx, {}, "m").html;
    assert.strictEqual((m.match(/class="g-row"/g) || []).length, Math.min(3, st.steps.length));
    assert.ok(m.includes(`<span class="g-v g-ok">${lvK(st.steps[0].dFlower)}</span>`));
    assert.doesNotMatch(m, /_lvlUseStep/);
  }
  assert.match(levelingStepsWidget.glance({ farm }, { state: { ...st, steps: [] } }, {}, "s").empty, /No single change/);
  assert.match(levelingStepsWidget.glance({}, {}, {}, "m").empty, /No farm data/);
});
