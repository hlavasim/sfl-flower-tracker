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
  assert.match(page, /_lvlShowAll\(this\.checked\)/);
});
