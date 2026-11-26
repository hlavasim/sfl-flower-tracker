import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { flowerPlan, SEED_ORDER } from "../../core/engine/flower-plan.mjs";
import { FLOWER_RECIPES } from "../../core/data/recipes.mjs";

// The FLOWERS page's maths, out of the page: what each flower still needs (its own target plus what
// the flowers grown from it still miss), the beds, and the summary — from the farm alone.

const NOW = Date.UTC(2026, 10, 26, 12);
const all = (n) => Object.fromEntries(Object.keys(FLOWER_RECIPES).map((k) => [k, String(n)]));
const byName = (rows) => Object.fromEntries(rows.map((r) => [r.name, r]));

test("collection: N of each, plus what the flowers grown from one still miss", () => {
  const inventory = { ...all(2), "Yellow Pansy": "0", "Yellow Cosmos": "1" };
  const p = flowerPlan({ inventory }, { mode: "collection", n: 2, now: NOW });
  const r = byName(p.rows);
  assert.deepStrictEqual([r["Yellow Cosmos"].need, r["Yellow Cosmos"].missing, r["Yellow Cosmos"].done], [2, 1, false]);
  assert.deepStrictEqual([r["Yellow Pansy"].own, r["Yellow Pansy"].dep, r["Yellow Pansy"].need, r["Yellow Pansy"].missing], [2, 1, 3, 3]);
  assert.ok(r["Yellow Pansy"].usedIn.some((u) => u.name === "Yellow Cosmos" && u.need === 2));
  assert.deepStrictEqual([r["Yellow Cosmos"].input, r["Yellow Cosmos"].inputIsFlower, r["Yellow Cosmos"].inputAvail], ["Yellow Pansy", true, 0]);
  assert.strictEqual(p.summary.total, Object.keys(FLOWER_RECIPES).length);
  assert.strictEqual(p.summary.complete, p.summary.total - 2);
  assert.strictEqual(p.summary.remaining, 4);
  // default order: seed by seed, unfinished first, most missing first
  const pansy = p.rows.findIndex((x) => x.name === "Yellow Pansy"), cosmos = p.rows.findIndex((x) => x.name === "Yellow Cosmos");
  assert.ok(SEED_ORDER.indexOf(p.rows[0].seed) === 0);
  assert.ok(r["Yellow Pansy"].order < r["Yellow Cosmos"].order || r["Yellow Pansy"].seed !== r["Yellow Cosmos"].seed, `${pansy} ${cosmos}`);
});

test("gifts: the own target is the gifts per day of that flower × N days", () => {
  const p = flowerPlan({ inventory: {} }, { mode: "gifts", n: 3, giftPlan: { a: "Red Pansy", b: "Red Pansy", c: null }, now: NOW });
  const r = byName(p.rows);
  assert.strictEqual(r["Red Pansy"].own, 6);
  assert.strictEqual(r["Yellow Cosmos"].own, 0);
});

test("beds: what grows (with its extra yield) counts as on the way; empty beds listed last; beds count the summary", () => {
  const plantedAt = NOW - 3_600_000;
  const farm = { inventory: {}, flowers: { flowerBeds: {
    b2: {}, b1: { flower: { name: "Yellow Pansy", plantedAt, criticalHit: { x: 1 } } } } } };
  const p = flowerPlan(farm, { mode: "collection", n: 2, now: NOW });
  assert.strictEqual(byName(p.rows)["Yellow Pansy"].pend, 2);
  assert.deepStrictEqual(p.beds.map((b) => [b.name, !!b.empty]), [["Yellow Pansy", false], [null, true]]);
  assert.strictEqual(p.beds[0].totalYield, 2);
  assert.strictEqual(p.beds[0].readyAt, plantedAt + 86400 * 1000);
  assert.strictEqual(p.summary.beds, 2);
});

test("growth boosts shorten the time per grow; they are listed", () => {
  const farm = { inventory: {}, bumpkin: { skills: { "Flower Power": 1 } } };
  const p = flowerPlan(farm, { mode: "collection", n: 1, now: NOW });
  assert.strictEqual(p.summary.multiplier, 0.8);
  assert.deepStrictEqual(p.summary.boosts.map((b) => b.name), ["Flower Power"]);
  const sun = p.rows.find((r) => r.seed === "Sunpetal Seed");
  assert.ok(Math.abs(sun.hoursPerGrow - 19.2) < 1e-9);
  assert.ok(Math.abs(sun.hoursLeft - sun.missing * 19.2) < 1e-9);
});

test("the real farm: every flower has a row, nothing negative", () => {
  const farm = JSON.parse(readFileSync(new URL("../fixtures/farm-155498.json", import.meta.url))).farm;
  const p = flowerPlan(farm, { mode: "collection", n: 5, now: NOW });
  assert.strictEqual(p.rows.length, Object.keys(FLOWER_RECIPES).length);
  assert.ok(p.rows.every((r) => r.missing >= 0 && r.need >= 5));
});
