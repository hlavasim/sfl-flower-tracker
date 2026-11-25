import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { levelingLadderWidget as W } from "../../widgets/leveling-ladder.mjs";
import * as LV from "../../core/sections/leveling.mjs";
import { renderTable } from "../../ui/table.mjs";
import { WIDGETS } from "../../widgets/registry.mjs";

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

test("no farm / no leveling inputs: an explanation, not a throw", () => {
  assert.match(W.build({ farm: null }).empty, /Chybí data farmy/);
  assert.match(W.build({ farm, leveling: null }).empty, /nenačetl/);
});

test("renders: target row marked, a partly done band says where it starts", () => {
  const out = W.build({ farm, leveling, book: null }, { savedLeveling: { target: { ascension: 5, level: 50 } } });
  const html = renderTable(W.columns, out.rows, W.defaults, { rowKey: W.rowKey });
  assert.match(html, /data-row="A5"><td>[^<]*<span[^>]*>▶ /);
  assert.match(html, /dodělat A\d+ \(L\d+→50\)/);
});
