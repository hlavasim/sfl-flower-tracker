import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { buildCookingSection } from "../../core/sections/cooking.mjs";

const wrap = JSON.parse(readFileSync(new URL("../fixtures/farm-155498.json", import.meta.url)));
const farm = wrap.farm;

test("defaults + Simulate x1.5 reproduce the v4.74-verified per-building XP/day", () => {
  const p = buildCookingSection(farm, {}, { savedRecipes: {}, petSimulate: true });
  assert.equal(p.buildings["Fire Pit"].recipe, "Pizza Margherita");
  assert.ok(Math.abs(p.buildings["Fire Pit"].xpPerDay - 232509.80) < 1, `FirePit ${p.buildings["Fire Pit"].xpPerDay}`);
  assert.ok(Math.abs(p.buildings["Kitchen"].xpPerDay - 186007.84) < 1, `Kitchen ${p.buildings["Kitchen"].xpPerDay}`);
  assert.ok(Math.abs(p.buildings["Bakery"].xpPerDay - 223209.41) < 1, `Bakery ${p.buildings["Bakery"].xpPerDay}`);
  assert.ok(Math.abs(p.buildings["Deli"].xpPerDay - 264712.41) < 1, `Deli ${p.buildings["Deli"].xpPerDay}`);
});

test("no Aging Shed key (deferred to Wave B)", () => {
  const p = buildCookingSection(farm, {}, { savedRecipes: {}, petSimulate: true });
  assert.equal(p.buildings["Aging Shed"], undefined);
});

test("total equals the sum of the emitted buildings", () => {
  const p = buildCookingSection(farm, {}, { savedRecipes: {}, petSimulate: true });
  const sum = Object.values(p.buildings).reduce((a, b) => a + (b.xpPerDay || 0), 0);
  assert.ok(Math.abs(p.totalXpPerDay - sum) < 1, `total ${p.totalXpPerDay} vs sum ${sum}`);
});

test("petSimulate off gives a lower total than on", () => {
  const on = buildCookingSection(farm, {}, { petSimulate: true }).totalXpPerDay;
  const off = buildCookingSection(farm, {}, { petSimulate: false }).totalXpPerDay;
  assert.ok(off < on, `off ${off} should be < on ${on}`);
});
