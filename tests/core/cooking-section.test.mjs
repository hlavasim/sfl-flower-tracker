import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { buildCookingSection } from "../../core/sections/cooking.mjs";

const wrap = JSON.parse(readFileSync(new URL("../fixtures/farm-155498.json", import.meta.url)));
const farm = wrap.farm || wrap;

// P2P price snapshot + Betty rate — see tests/core/cooking-cost.test.mjs for provenance.
const p2p = JSON.parse(readFileSync(new URL("../fixtures/p2p-prices.json", import.meta.url)));
const COINS_PER_SFL = 1061.0079575596817;

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

// ── Wired prices: per-building `recipes` + selected-recipe cost ──
// Acceptance gate from .superpowers/sdd/task-11a-brief.md §4 / bumpkin-baseline-155498.md.
test("selected recipe cost matches the live Bumpkin page baseline, to the fixture's tolerance", () => {
  const p = buildCookingSection(farm, p2p, { savedRecipes: {}, petSimulate: true, coinsPerSFL: COINS_PER_SFL });
  const expected = {
    "Fire Pit": 2.08,
    "Kitchen": 1.27,
    "Bakery": 2.68,
    "Deli": 1.49,
    "Smoothie Shack": 0.1906, // fixture; live page showed 0.1907 — known Lemon price drift (task-7-report)
  };
  for (const [bd, want] of Object.entries(expected)) {
    const b = p.buildings[bd];
    const selected = b.recipes.find((r) => r.name === b.recipe);
    assert.ok(selected, `${bd} selected recipe not found in recipes list`);
    assert.ok(Math.abs(selected.cost - want) < 0.005, `${bd} cost was ${selected.cost}, expected ~${want}`);
  }
});

test("recipes is non-empty per building and the selected recipe's cost equals its list entry", () => {
  const p = buildCookingSection(farm, p2p, { savedRecipes: {}, petSimulate: true, coinsPerSFL: COINS_PER_SFL });
  for (const bd of ["Fire Pit", "Kitchen", "Bakery", "Deli", "Smoothie Shack"]) {
    const b = p.buildings[bd];
    assert.ok(Array.isArray(b.recipes) && b.recipes.length > 0, `${bd} recipes should be non-empty`);
    const selected = b.recipes.find((r) => r.name === b.recipe);
    assert.ok(selected, `${bd} selected recipe should be present in recipes`);
  }
});

test("a known unpriced recipe (Mushroom Soup) has cost null and xpPerSfl 0", () => {
  const p = buildCookingSection(farm, p2p, { savedRecipes: {}, petSimulate: true, coinsPerSFL: COINS_PER_SFL });
  const r = p.buildings["Fire Pit"].recipes.find((x) => x.name === "Mushroom Soup");
  assert.ok(r, "Mushroom Soup should be in Fire Pit recipes");
  assert.equal(r.cost, null, `Mushroom Soup cost should be null, was ${r.cost}`);
  assert.equal(r.xpPerSfl, 0);
});

test("isInstant is true for a cookSec === 0 recipe (Furikake Sprinkle)", () => {
  const p = buildCookingSection(farm, p2p, { savedRecipes: {}, petSimulate: true, coinsPerSFL: COINS_PER_SFL });
  const r = p.buildings["Fire Pit"].recipes.find((x) => x.name === "Furikake Sprinkle");
  assert.ok(r, "Furikake Sprinkle should be in Fire Pit recipes");
  assert.equal(r.isInstant, true);
  assert.equal(r.time, 0);
});

test("missing/empty prices does not throw and yields null costs (fetch-failure fallback)", () => {
  const p = buildCookingSection(farm, {}, { savedRecipes: {}, petSimulate: true });
  const r = p.buildings["Fire Pit"].recipes.find((x) => x.name === "Pizza Margherita");
  assert.equal(r.cost, null);
  assert.equal(r.xpPerSfl, 0);
});
