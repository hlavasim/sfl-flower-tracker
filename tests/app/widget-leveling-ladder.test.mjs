import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { levelingLadderWidget as W } from "../../widgets/leveling-ladder.mjs";
import * as LV from "../../core/sections/leveling.mjs";
import { renderTable } from "../../ui/table.mjs";
import { WIDGETS } from "../../widgets/registry.mjs";
import { renderLook, looksFor } from "../../ui/glance-templates.mjs";

const farm = JSON.parse(readFileSync(new URL("../fixtures/farm-155498.json", import.meta.url))).farm;
const prices = JSON.parse(readFileSync(new URL("../fixtures/p2p-prices.json", import.meta.url)));
const inputs = { prices, coinsPerSFL: 1192, floors: { Walrus: 1399 }, bids: {}, budFloors: {}, freePoints: 3, now: Date.UTC(2026, 10, 24) };
const leveling = { inputs };

test("registered; needs farm, leveling and the (optional) book", () => {
  assert.strictEqual(WIDGETS["leveling-ladder"], W);
  assert.deepStrictEqual(W.needs(5), { farm: { res: "farm", farm: 5 }, leveling: { res: "leveling", farm: 5 }, book: { res: "book" } });
  assert.deepStrictEqual(W.optional, ["book"]);
});

test("on the board: the same ladder the LEVELING page computes from the saved config", () => {
  const saved = { target: { ascension: 6, level: 50 } };
  const out = W.build({ farm, leveling, book: null }, { savedLeveling: saved });
  const lin = LV.levelingInputsWithBook(inputs, null);
  const cfg = LV.levelingInit(farm, lin, saved).cfg;
  const want = LV.levelingLadder(farm, LV.levelingPlan(farm, lin, cfg), 10, 3);
  assert.deepStrictEqual(out.rows.map((r) => [r.ascension, r.days, r.cumFlower, r.points]), want.map((r) => [r.ascension, r.days, r.cumFlower, r.points]));
  assert.deepStrictEqual(out.rows.filter((r) => r.target).map((r) => r.ascension), [cfg.target.ascension]);
});

test("the book's bids reach the plan (a ticked item resells)", () => {
  const saved = { ticked: ["Walrus"], resell: true };
  const a = W.build({ farm, leveling, book: null }, { savedLeveling: saved }).rows;
  const b = W.build({ farm, leveling, book: { items: { Walrus: { f: 1399, b: 1300 } } } }, { savedLeveling: saved }).rows;
  assert.notDeepStrictEqual(a.map((r) => r.cumFlower), b.map((r) => r.cumFlower));
});

test("on the LEVELING page: the page's own plan and config are used as given", () => {
  const cfg = LV.defaultLevelingConfig(farm, inputs);
  const plan = LV.levelingPlan(farm, inputs, cfg);
  const out = W.build({ farm }, { plan, cfg, free: 3 });
  assert.deepStrictEqual(out.rows.map((r) => r.cumDays), LV.levelingLadder(farm, plan, 10, 3).map((r) => r.cumDays));
});

test("the target row is highlighted, rows are clickable only where the page wires it, FLOWER has its icon, body a tooltip", () => {
  const out = W.build({ farm, leveling, book: null }, { savedLeveling: { target: { ascension: 5, level: 50 } } });
  const opts = { rowKey: W.rowKey, rowClass: W.rowClass };
  assert.match(renderTable(W.columns, out.rows, W.defaults, opts), /data-row="A5" class="w-row-hl"/);
  assert.doesNotMatch(renderTable(W.columns, out.rows, W.defaults, opts), /w-row-click/);
  const page = W.build({ farm, leveling, book: null }, { savedLeveling: { target: { ascension: 5, level: 50 } }, rowClick: true });
  assert.match(renderTable(W.columns, page.rows, W.defaults, opts), /data-row="A6" class="w-row-click"/);
  const html = renderTable(W.columns, out.rows, W.defaults, opts);
  assert.match(html, /<th[^>]*><img[^>]*><\/th>/);
  assert.match(html, /<th[^>]*title="Free skill points[^"]*"[^>]*>points/);
});

test("the plan is computed once for the same farm, inputs and saved config (board repaints)", () => {
  const ctx = { savedLeveling: { target: { ascension: 6, level: 50 } } };
  const t0 = performance.now();
  W.build({ farm, leveling, book: null }, ctx);
  const first = performance.now() - t0;
  const t1 = performance.now();
  for (let i = 0; i < 5; i++) W.build({ farm, leveling, book: null }, { savedLeveling: { target: { ascension: 6, level: 50 } } });
  const five = performance.now() - t1;
  assert.ok(five < first, `5 repaints ${five.toFixed(1)} ms should be cheaper than the first ${first.toFixed(1)} ms`);
});

test("no farm / no leveling inputs: an explanation, not a throw", () => {
  assert.match(W.build({ farm: null }).empty, /No farm data/);
  assert.match(W.build({ farm, leveling: null }).empty, /did not load/);
});

test("📱 glance model: total days to the target ascension; every ascension counting down to its end, the target marked", () => {
  const ctx = { savedLeveling: { target: { ascension: 5, level: 50 } } };
  const rows = W.build({ farm, leveling, book: null }, ctx).rows;
  const t = rows.find((r) => r.target);
  const m = W.glanceModel({ farm, leveling, book: null }, ctx);
  assert.strictEqual(W.look, "number");
  assert.deepStrictEqual([m.head.value, m.head.unit], [Math.round(t.cumDays).toLocaleString("en-US"), " days"]);
  assert.match(m.head.cap, /^to the end of A5/);
  assert.strictEqual(m.items.length, rows.length);
  const it5 = m.items.find((i) => i.name === "A5 · target");
  assert.match(it5.sub, /^[\d.]+[kM]? FLOWER$/);
  assert.ok(Math.abs(it5.at - (t.now + t.cumDays * 86400000)) < 1, "a live countdown to the day A5 is done");
  assert.deepStrictEqual(m.tiles.slice(0, 3).map((x) => x.label), ["days", "FLOWER", "target"]);
  assert.strictEqual((renderLook(m, "list-4").html.match(/class="gx-row[" ]/g) || []).length, Math.min(8, rows.length));
  assert.match(renderLook(m, "list-4").html, /<span class="g-at" data-at="\d+">\d+d \d+h<\/span>/);
  assert.ok(looksFor(m).length >= 3);
  assert.deepStrictEqual(W.glanceModel({ farm: null }, {}), { empty: "No farm data." });
  assert.match(W.glanceModel({ farm, leveling: null }, {}).empty, /did not load/);
  assert.strictEqual(W.glance, undefined);
});

test("renders: target row marked, a partly done band says where it starts", () => {
  const out = W.build({ farm, leveling, book: null }, { savedLeveling: { target: { ascension: 5, level: 50 } } });
  const html = renderTable(W.columns, out.rows, W.defaults, { rowKey: W.rowKey });
  assert.match(html, /data-row="A5"[^>]*><td>[^<]*<span[^>]*>▶ /);
  assert.match(html, /finish A\d+ \(L\d+→50\)/);
});
