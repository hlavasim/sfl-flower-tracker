import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { decSummary, decColours, decGrow } from "../../widgets/decorations.mjs";
import { WIDGETS } from "../../widgets/registry.mjs";
import { renderLook, looksFor, TEMPLATE_IDS } from "../../ui/glance-templates.mjs";

// DECORATIONS: the plan is computed by the page (_decCompute, the game's expansion geometry and the
// chosen layout); the widgets lay out its numbers. A small hand-made plan result stands in for it.
const FARM = JSON.parse(readFileSync(new URL("../fixtures/farm-155498.json", import.meta.url), "utf8"));
const farm = FARM.farm || FARM;
const PLAN = {
  expansions: 34, ascLevel: 1, ascFrom: 30, built: 4, toCome: 8,
  ascTiles: 432, plantable: 432, plantableNote: "12 need clearing first", planSize: 430, kinds: 50,
  totalNeed: 30, totalDone: 12, totalMissing: 7, flowersDone: 1,
  byColour: { Red: 6, Yellow: 6, Purple: 6, Blue: 6, White: 6 },
  rows: [
    { name: "Red Pansy", n: 10, have: 3, done: 2, left: 8, missing: 5,
      guide: { steps: [{ n: 1, move: "start", done: true }, { n: 2, move: "→3 ↑2", done: false }],
        mini: { cols: 2, cells: [{ col: 1, row: 1, step: 1, done: true, title: "1,1 · step 1" }, { col: 2, row: 1, step: 2, done: false, title: "2,1 · step 2" }] } } },
    { name: "Blue Daffodil", n: 10, have: 0, done: 10, left: 0, missing: 0, guide: { steps: [], mini: { cols: 1, cells: [] } } },
    { name: "White Lotus", n: 10, have: 9, done: 0, left: 10, missing: 1, guide: { steps: [], mini: { cols: 1, cells: [] } } },
  ],
};
const icon = (n) => `<img data-i="${n}">`;
const ctx = { plan: () => PLAN, icon, open: () => new Set(["Red Pansy"]) };

test("decorations: registered on the DECORATIONS page; they need the farm", () => {
  for (const w of [decSummary, decColours, decGrow]) {
    assert.strictEqual(WIDGETS[w.type], w);
    assert.strictEqual(w.page, "decorations");
    assert.deepStrictEqual(w.needs(7), { farm: { res: "farm", farm: 7 } });
  }
});

test("summary: the five tiles of the old page and a bar of what is planted", () => {
  const { html } = decSummary.view({ farm }, ctx);
  assert.match(html, /class="v-kpis v-dec-kpis"/);
  assert.match(html, /<b>12 expansions<\/b><span>ascension band<\/span><small>4 built, 8 to come<\/small>/);
  assert.match(html, /<b>432<\/b><span>tiles there<\/span><small>12 × 36<\/small>/);
  assert.match(html, /<b>432<\/b><span>plantable<\/span><small>12 need clearing first<\/small>/);
  assert.match(html, /<b>430<\/b><span>plan uses<\/span><small>50 kinds<\/small>/);
  assert.match(html, /<b>7<\/b><span>still to grow<\/span><small>not in inventory<\/small>/);
  assert.match(html, /class="v-big"><i style="width:40%/);   // 12 of 30 planted
  assert.match(decSummary.view({}, ctx).empty, /farm/i);
});

test("colours: a swatch, the count and a bar per colour; even → a green pill", () => {
  const { html } = decColours.view({ farm }, ctx);
  for (const c of ["Red", "Yellow", "Purple", "Blue", "White"]) assert.match(html, new RegExp(`${c}</b>`));
  assert.strictEqual((html.match(/class="v-bar"/g) || []).length, 5);
  assert.match(html, /v-pill v-ok">perfectly even/);
  const uneven = decColours.view({ farm }, { ...ctx, plan: () => ({ ...PLAN, byColour: { ...PLAN.byColour, Red: 5 } }) }).html;
  assert.match(uneven, /v-pill v-bad">not even/);
});

test("what to grow: icon per flower, progress, missing in red, done rows green, guide rows", () => {
  const { html } = decGrow.view({ farm }, ctx);
  assert.match(html, /<img data-i="Red Pansy">/);
  assert.match(html, /<img data-i="Blue Daffodil">/);
  assert.match(html, /plan needs 30 · <b class="v-done">12 already planted<\/b> \(1 of 3 flowers finished\) · 7 still to grow/);
  // Red Pansy: 2 of 10 planted → 20 % bar, 5 to grow
  assert.match(html, /data-flower="Red Pansy"[\s\S]*?width:20%[\s\S]*?<span class="v-miss">5<\/span>/);
  assert.match(html, /data-flower="Blue Daffodil" class="v-dec-fin"[\s\S]*?v-pill v-ok">done/);
  // White Lotus has 9 of the 10 in the bag: 1 to grow
  assert.match(html, /data-flower="White Lotus"[\s\S]*?<span class="v-miss">1<\/span>/);
  // the open guide (remembered by the page) is shown, with its numbered steps and mini map
  assert.match(html, /<tr class="v-dec-guide" style="display:table-row">/);
  assert.match(html, /v-dec-step v-dec-done"><b>1\.<\/b> start ✓/);
  assert.match(html, /v-dec-step v-dec-todo"><b>2\.<\/b> →3 ↑2</);
  assert.match(html, /onclick="_decToggleRow\(this\)"/);
});

test("page wiring: the page renders the three widgets and registers their context", () => {
  const src = readFileSync(new URL("../../flowers.html", import.meta.url), "utf8");
  assert.match(src, /for \(const t of \["dec-summary", "dec-colours", "dec-grow"\]\) \{\s*_wCtxMap\[t\] = \(\) => \(\{ plan: _decCompute, open: \(\) => _decOpen,/);
  assert.match(src, /__widgets\.renderPage\(type, \{ data: \{ farm \}, ctx: _wCtx\(type\), fresh \}\)/);
  for (const t of ["dec-summary", "dec-colours", "dec-grow"]) assert.match(src, new RegExp(`h \\+= W_\\("${t}"\\)`));
  assert.match(src, /function _decCompute\(farm\)/);
  assert.match(src, /_wPageHead\("🌸 Decorations"/);
});

test("📱 glance models: each has a natural look and no hand-written face", () => {
  assert.deepStrictEqual([decSummary.look, decColours.look, decGrow.look], ["number", "number", "number-list-2"]);
  for (const w of [decSummary, decColours, decGrow]) {
    assert.ok(TEMPLATE_IDS.includes(w.look), w.type);
    assert.strictEqual(w.glance, undefined, w.type);
    assert.strictEqual(w.sizes, undefined, w.type);
  }
});

test("📱 glance models: summary = still to grow with a ring, the flowers, the plan's tiles; colours = even or not, the five colours", () => {
  const s = decSummary.glanceModel({ farm }, ctx, {});
  assert.deepStrictEqual([s.head.value, s.head.cap, s.head.ring, s.head.ringTone], ["7", "still to grow · 12 of 30 planted", 40, "accent"]);
  assert.match(renderLook(s, "number").html, /<div class="gx-corner"><svg class="gx-ring g-accent".*<div class="gx-num">7<\/div><div class="gx-cap">still to grow · 12 of 30 planted<\/div>/);
  assert.deepStrictEqual(s.items.map((i) => i.name), ["Red Pansy", "White Lotus", "Blue Daffodil"]);
  assert.match(renderLook(s, "tiles-t").html, /<div class="gx-numlist"><div><span>planted<\/span><b>12\/30<\/b><\/div><div><span>to grow<\/span><b>7<\/b>/);
  assert.ok(looksFor(s).length >= 3);
  const all = decSummary.glanceModel({ farm }, { ...ctx, plan: () => ({ ...PLAN, totalMissing: 0 }) }, {});
  assert.deepStrictEqual([all.head.value, all.head.tone], ["✓", "ok"]);
  assert.match(all.head.cap, /^all in hand/);
  assert.match(decSummary.glanceModel({}, ctx, {}).empty, /farm/i);
  const c = decColours.glanceModel({ farm }, ctx, {});
  assert.deepStrictEqual([c.head.value, c.head.tone, c.head.cap], ["Even", "ok", "30 flowers, five colours"]);
  assert.deepStrictEqual(c.items.map((i) => [i.name, i.value, i.pct]), [["Red", "6", 100], ["Yellow", "6", 100], ["Purple", "6", 100], ["Blue", "6", 100], ["White", "6", 100]]);
  assert.ok(looksFor(c).length >= 3);
  assert.strictEqual(decColours.glanceModel({ farm }, { ...ctx, plan: () => ({ ...PLAN, byColour: { ...PLAN.byColour, Red: 5 } }) }, {}).head.value, "Uneven");
  assert.match(decColours.glanceModel({ farm }, { icon }, {}).empty, /computed by the DECORATIONS page/);
});

test("📱 glance models: what to grow = the flower most to grow, the unfinished flowers most missing first, then the done; none in scope is empty", () => {
  const g = decGrow.glanceModel({ farm }, ctx, {});
  assert.deepStrictEqual(g.head, { value: "5", tone: "bad", hero: `<img data-i="Red Pansy">`, cap: "Red Pansy to grow · 2 flowers left" });
  assert.deepStrictEqual(g.items.map((i) => i.name), ["Red Pansy", "White Lotus", "Blue Daffodil"]);
  assert.deepStrictEqual(g.items[0], { icon: `<img data-i="Red Pansy">`, name: "Red Pansy", sub: "2 of 10 planted", pct: 20, value: "−5", tone: "bad" });
  assert.deepStrictEqual(g.items[2].chip, { text: "done", tone: "ok" });
  assert.match(renderLook(g, "number-list-2").html, /<div class="gx-n">Red Pansy<div class="gx-sub-tag g-bad">−5<\/div><\/div>/);
  assert.ok(looksFor(g).length >= 3);
  const bag = { ...PLAN, rows: [{ ...PLAN.rows[2], missing: 0 }] };
  assert.deepStrictEqual(decGrow.glanceModel({ farm }, { ...ctx, plan: () => bag }, {}).items[0].chip, { text: "in bag", tone: "info" });
  assert.match(decGrow.glanceModel({ farm }, { ...ctx, plan: () => ({ ...PLAN, rows: [PLAN.rows[1]] }) }, {}).head.cap, /all 1 flower planted/);
  assert.match(decGrow.glanceModel({ farm }, { ...ctx, plan: () => ({ ...PLAN, rows: [] }) }, {}).empty, /no flowers in scope/);
});
