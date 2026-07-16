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

test("no Aging Shed key (not one of the 5 main buildings; regression guard for Task 5b)", () => {
  const p = buildCookingSection(farm, {}, { savedRecipes: {}, petSimulate: true });
  assert.equal(p.buildings["Aging Shed"], undefined);
  assert.equal(Object.keys(p.buildings).length, 5, `expected exactly 5 buildings, got ${Object.keys(p.buildings).length}`);
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

// ── Task 11b: boosts detail, bankedFood, xpPerHour pin ──
// Acceptance gate from .superpowers/sdd/task-11b-brief.md.

test("xpPerHour is computed per-hour (×3600), pinned to the live Bumpkin page value", () => {
  const p = buildCookingSection(farm, p2p, { savedRecipes: {}, petSimulate: true, coinsPerSFL: COINS_PER_SFL });
  const r = p.buildings["Fire Pit"].recipes.find((x) => x.name === "Pizza Margherita");
  assert.ok(Math.abs(r.xpPerHour - 9687.91) < 0.01, `xpPerHour was ${r.xpPerHour}`);
});

test("boosts.timeBoosts carries full objects with exact multipliers and buildings", () => {
  const p = buildCookingSection(farm, {}, { savedRecipes: {}, petSimulate: true });
  const byName = Object.fromEntries(p.boosts.timeBoosts.map((b) => [b.name, b]));
  assert.equal(byName["Double Nom"].multiplier, 0.5);
  assert.equal(byName["Fast Feasts"].multiplier, 0.9);
  assert.deepEqual(byName["Fast Feasts"].buildings, ["Fire Pit", "Kitchen"]);
  assert.equal(byName["Frosted Cakes"].multiplier, 0.9);
  assert.deepEqual(byName["Frosted Cakes"].buildings, ["Bakery"]);
  assert.equal(byName["Desert Gnome"].multiplier, 0.9);
  assert.equal(byName["Nightshade Medallion"].multiplier, 0.75);
  assert.equal(byName["Master Chefs Cleaver"].multiplier, 0.85);
});

test("boosts.xpBoosts carries full objects (unfiltered) with exact multipliers", () => {
  const p = buildCookingSection(farm, {}, { savedRecipes: {}, petSimulate: true });
  const byName = Object.fromEntries(p.boosts.xpBoosts.map((b) => [b.name, b]));
  assert.equal(byName["Munching Mastery"].multiplier, 1.05);
  assert.equal(byName["Drive-Through Deli"].multiplier, 1.15);
  assert.deepEqual(byName["Drive-Through Deli"].buildings, ["Deli"]);
  assert.equal(byName["Buzzworthy Treats"].multiplier, 1.1);
  assert.equal(byName["Buzzworthy Treats"].honeyOnly, true);
  assert.equal(byName["Observatory"].multiplier, 1.05);
  assert.equal(byName["Blossombeard"].multiplier, 1.1);
  assert.equal(byName["Grain Grinder"].multiplier, 1.2);
  assert.deepEqual(byName["Grain Grinder"].buildings, ["Bakery"]);
  assert.equal(byName["Lifetime Farmer Banner"].multiplier, 1.1);
});

test("boosts.petStreakInfo exposes the full object (fixture + petSimulate:true)", () => {
  const p = buildCookingSection(farm, {}, { savedRecipes: {}, petSimulate: true });
  assert.equal(p.boosts.petStreakInfo.streak, 3);
  assert.equal(p.boosts.petStreakInfo.thisWeekActive, false);
  assert.equal(p.boosts.petStreakInfo.manualOverride, true);
});

test("back-compat: xpBoosts (string[]) and petStreak keep their exact previous shape/values", () => {
  const p = buildCookingSection(farm, {}, { savedRecipes: {}, petSimulate: true });
  assert.ok(Array.isArray(p.xpBoosts), "xpBoosts must stay a string[]");
  for (const name of p.xpBoosts) assert.equal(typeof name, "string");
  assert.ok(!p.xpBoosts.includes("Pet's Streak (simulate)"), "petStreak entries must stay filtered out of xpBoosts");
  assert.deepEqual(p.petStreak, { weeks: 3, activeThisWeek: false, mult: 1.5 });
});

test("bankedFood sums XP across ALL recipes owned in inventory, attributed to recipe.building", () => {
  const p = buildCookingSection(farm, {}, { savedRecipes: {}, petSimulate: true });
  // 81 static-recipe items + 10 Aged Fish stacks the fixture actually holds (Task 5b).
  // The fixture also holds 1 "Aged Saw Shark" — Saw Shark is not in FISH_BASE_XP (not an
  // Aging Shed fish), so it never gets a generated recipe and stays uncounted, same as
  // the live page: 11 distinct "Aged *" stacks - 1 unrecognized = +10 items.
  assert.equal(p.bankedFood.items.length, 91, `items.length was ${p.bankedFood.items.length}`);
  const mashedPotato = p.bankedFood.items.find((i) => i.name === "Mashed Potato");
  assert.ok(mashedPotato, "Mashed Potato should be in bankedFood.items");
  assert.equal(mashedPotato.qty, 90);
  assert.ok(Math.abs(mashedPotato.xpEach - 6.0031125) < 0.0001, `xpEach was ${mashedPotato.xpEach}`);

  // totalXp independently derived below (NOT by calling buildCookingSection/computeFoodXP) —
  // see .superpowers/sdd/task-5b-report.md for the full derivation. Sum of
  // maxXP(baseXP)*qty across the fixture's 10 recognized Aged-Fish stacks, times the
  // same per-farm boost multiplier already pinned by the Mashed Potato assertion above
  // (2.0010375 = Munching Mastery x Observatory x Blossombeard x Lifetime Farmer Banner x
  // Pet's Streak simulate) times the three Aging-Shed-only boosts this fixture qualifies
  // for (Prime Aged avg factor 1.042 @ Salt Sculpture L6/no Fish Smoking = 14% chance;
  // Skill Shrimpy +20%; Fishy Feast +20%).
  const agedFishBaseXpAndQty = [
    { baseXP: 310, qty: 3 },  // Cobia
    { baseXP: 250, qty: 27 }, // Porgy
    { baseXP: 210, qty: 27 }, // Weakfish
    { baseXP: 200, qty: 25 }, // Tuna
    { baseXP: 220, qty: 6 },  // Oarfish
    { baseXP: 320, qty: 8 },  // Rock Blackfish
    { baseXP: 250, qty: 4 },  // Muskellunge
    { baseXP: 200, qty: 13 }, // Blue Marlin
    { baseXP: 200, qty: 12 }, // Sunfish
    { baseXP: 240, qty: 12 }, // Sea Horse
  ];
  const maxXP = (b) => (b <= 200 ? b * 3 : b <= 330 ? b * 4 : b * 5);
  const generalMult = 1.05 * 1.05 * 1.1 * 1.1 * 1.5;
  const primeFactor = 1 + 0.14 * (1.3 - 1); // Salt Sculpture L6 (+4%), Fish Smoking absent
  const agingMult = generalMult * primeFactor * 1.2 * 1.2;
  const addedXP = agedFishBaseXpAndQty.reduce((sum, { baseXP, qty }) => sum + maxXP(baseXP) * agingMult * qty, 0);
  const expectedTotalXp = 7827323.818978125 + addedXP; // old (pre-fix) pinned total + the Aged Fish gap
  assert.ok(
    Math.abs(p.bankedFood.totalXp - expectedTotalXp) < 1,
    `totalXp was ${p.bankedFood.totalXp}, expected ~${expectedTotalXp}`
  );
  // Direction/size sanity check independent of the exact XP math above: items must
  // increase by exactly the 10 distinct recognized Aged Fish stacks.
  const agedItems = p.bankedFood.items.filter((i) => i.name.startsWith("Aged "));
  assert.equal(agedItems.length, 10, `expected 10 Aged Fish line items, got ${agedItems.length}`);
});
