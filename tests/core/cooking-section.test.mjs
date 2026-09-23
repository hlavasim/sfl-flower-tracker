import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { buildCookingSection } from "../../core/sections/cooking.mjs";

const wrap = JSON.parse(readFileSync(new URL("../fixtures/farm-155498.json", import.meta.url)));
const farm = wrap.farm || wrap;

// P2P price snapshot + Betty rate — see tests/core/cooking-cost.test.mjs for provenance.
const p2p = JSON.parse(readFileSync(new URL("../fixtures/p2p-prices.json", import.meta.url)));
const COINS_PER_SFL = 1061.0079575596817;

/*
 * Per-building XP/day on the GAME's cooking rules (2026-09-22 revision). The old v4.74 pins
 * (Fire Pit 232,509.80 …) came from a page that modelled Double Nom as half the cook time and
 * ignored building oil and bonus food. Now: oiled buildings (oil > 0 in farm.buildings — Fire Pit,
 * Kitchen, Deli on the fixture) cook in (1 - BUILDING_OIL_BOOSTS) of the time with the fixture's
 * Swift Sizzle / Turbo Fry / Fry Frenzy (x0.6 / x0.5 / x0.4); a cook yields 1 + Double Nom 1 +
 * Cleaver 0.1 (+ Fiery Jackpot 0.2 on the Fire Pit) dishes. Fire Pit by hand:
 *   XP/dish 25000 x 1.05 MM x 1.05 Observatory x 1.1 Blossombeard x 1.1 VIP x 1.5 sim = 50,025.94
 *   time 72000 s x 0.9 Fast Feasts x 0.9 Desert Gnome x 0.75 Medallion x 0.85 Cleaver x 0.6 oil = 22,307.4 s
 *   50,025.94 x 2.3 dishes x 86400 / 22,307.4 = 445,643.79 XP/day
 */
test("defaults + Simulate x1.5: per-building XP/day on the game's rules (oil, bonus food)", () => {
  const p = buildCookingSection(farm, {}, { savedRecipes: {}, petSimulate: true });
  assert.equal(p.buildings["Fire Pit"].recipe, "Pizza Margherita");
  assert.ok(Math.abs(p.buildings["Fire Pit"].xpPerDay - 445643.79) < 1, `FirePit ${p.buildings["Fire Pit"].xpPerDay}`);
  assert.ok(Math.abs(p.buildings["Kitchen"].xpPerDay - 390616.47) < 1, `Kitchen ${p.buildings["Kitchen"].xpPerDay}`);
  assert.ok(Math.abs(p.buildings["Bakery"].xpPerDay - 234369.88) < 1, `Bakery ${p.buildings["Bakery"].xpPerDay}`);
  assert.ok(Math.abs(p.buildings["Deli"].xpPerDay - 694870.08) < 1, `Deli ${p.buildings["Deli"].xpPerDay}`);
  assert.ok(Math.abs(p.buildings["Smoothie Shack"].xpPerDay - 175777.41) < 1, `Smoothie Shack ${p.buildings["Smoothie Shack"].xpPerDay}`);
  assert.equal(p.buildings["Fire Pit"].dishesPerCook, 2.3, "1 + Double Nom + 20% Fiery Jackpot + 10% Cleaver");
  assert.equal(p.buildings["Bakery"].dishesPerCook, 2.1, "no Fiery Jackpot off the Fire Pit");
});

// ── Task 11d: Aging Shed was dropping 16% of cooking XP/day (COOKING_BUILDING_NAMES
// has 6 buildings; core only served 5). Values below are the to-the-cent acceptance
// gate from .superpowers/sdd/bumpkin-baseline-155498.md, captured from the LIVE
// pre-migration page — NOT derived from this code (see that file's warning on this).
test("Aging Shed is now served, with the level-clamped slot count (not placed-building count)", () => {
  const p = buildCookingSection(farm, {}, { savedRecipes: {}, petSimulate: true });
  assert.equal(Object.keys(p.buildings).length, 6, `expected exactly 6 buildings, got ${Object.keys(p.buildings).length}`);
  const shed = p.buildings["Aging Shed"];
  assert.ok(shed, "Aging Shed should be present");
  assert.equal(shed.recipe, "Aged Tuna");
  assert.equal(shed.buildingCount, 6, `count should be clamp(agingShed.level,1,6)=6, got ${shed.buildingCount}`);
  assert.ok(Math.abs(shed.xpPerCook - 1801.51) < 0.01, `xpPerCook was ${shed.xpPerCook}`);
  assert.equal(shed.cookMinutes, 76, `cookMinutes was ${shed.cookMinutes}`);
  assert.ok(Math.abs(shed.xpPerDay - 204803.25) < 1, `xpPerDay was ${shed.xpPerDay}`);
  // 38 = one per FISH_BASE_XP entry, the three sharks included (AGED_FISH covers all of FISH).
  assert.equal(shed.recipes.length, 38, `recipes.length was ${shed.recipes.length}`);
});

test("totalXpPerDay now includes Aging Shed (was under-reporting by 16%)", () => {
  const p = buildCookingSection(farm, {}, { savedRecipes: {}, petSimulate: true });
  // The five per-building pins above + the unchanged Aging Shed 204,803.25.
  assert.ok(Math.abs(p.totalXpPerDay - 2146080.88) < 1, `totalXpPerDay was ${p.totalXpPerDay}`);
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

// ── Task 11d: cost breakdown (items/hasUnpriced) on each recipes[] entry — the page's
// Cost/cook tooltip (flowers.html:10802 costTip) and "+self" badge (flowers.html:10854)
// cannot be reproduced from a bare `cost` total.
test("recipes[].items carries the per-ingredient cost breakdown (Pizza Margherita tooltip)", () => {
  const p = buildCookingSection(farm, p2p, { savedRecipes: {}, petSimulate: true, coinsPerSFL: COINS_PER_SFL });
  const r = p.buildings["Fire Pit"].recipes.find((x) => x.name === "Pizza Margherita");
  assert.ok(r, "Pizza Margherita should be in Fire Pit recipes");
  assert.equal(r.hasUnpriced, false);
  const byName = Object.fromEntries(r.items.map((i) => [i.name, i]));
  // "30x Tomato = 0.1500 SFL" — the exact tooltip line format from the live page.
  assert.equal(byName["Tomato"].qty, 30);
  assert.ok(Math.abs(byName["Tomato"].cost - 0.15) < 1e-9, `Tomato cost was ${byName["Tomato"].cost}`);
  assert.equal(byName["Tomato"].source, "P2P");
  assert.equal(byName["Cheese"].source, "recipe");
  assert.equal(byName["Wheat"].source, "P2P");
});

test("recipes[].hasUnpriced is true and items carries a selfProduced entry (Mushroom Soup / +self badge)", () => {
  const p = buildCookingSection(farm, p2p, { savedRecipes: {}, petSimulate: true, coinsPerSFL: COINS_PER_SFL });
  const r = p.buildings["Fire Pit"].recipes.find((x) => x.name === "Mushroom Soup");
  assert.equal(r.hasUnpriced, true);
  assert.ok(Array.isArray(r.items) && r.items.length > 0);
  const wm = r.items.find((i) => i.name === "Wild Mushroom");
  assert.ok(wm && wm.selfProduced, "Wild Mushroom should be flagged selfProduced (no P2P price)");
});

test("recipes[].items still resolves (all selfProduced) and hasUnpriced is true when the price map is empty (fetch-failure fallback)", () => {
  const p = buildCookingSection(farm, {}, { savedRecipes: {}, petSimulate: true });
  const r = p.buildings["Fire Pit"].recipes.find((x) => x.name === "Pizza Margherita");
  assert.ok(Array.isArray(r.items) && r.items.length > 0);
  assert.ok(r.items.every((i) => i.selfProduced), "every item should be selfProduced with no prices available");
  assert.equal(r.hasUnpriced, true);
});

test("recipes[].items/hasUnpriced are genuinely null/false only when prices is explicitly falsy (null)", () => {
  const p = buildCookingSection(farm, null, { savedRecipes: {}, petSimulate: true });
  const r = p.buildings["Fire Pit"].recipes.find((x) => x.name === "Pizza Margherita");
  assert.equal(r.items, null);
  assert.equal(r.hasUnpriced, false);
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
  // 50,025.94 XP/dish x 2.3 dishes / 22,307.4 s x 3600 (see the per-building derivation above).
  assert.ok(Math.abs(r.xpPerHour - 18568.49) < 0.01, `xpPerHour was ${r.xpPerHour}`);
});

test("boosts.timeBoosts carries full objects with exact multipliers and buildings", () => {
  const p = buildCookingSection(farm, {}, { savedRecipes: {}, petSimulate: true });
  const byName = Object.fromEntries(p.boosts.timeBoosts.map((b) => [b.name, b]));
  // Double Nom is +1 DISH per cook (collectRecipe.ts getCookingAmount), not half the time.
  assert.equal(byName["Double Nom"], undefined, "Double Nom is not a time boost");
  assert.deepEqual(p.boosts.amountBoosts.find((b) => b.name === "Double Nom"), { name: "Double Nom", extra: 1, excludeBuildings: ["Aging Shed"] });
  assert.equal(byName["Fast Feasts"].multiplier, 0.9);
  assert.deepEqual(byName["Fast Feasts"].buildings, ["Fire Pit", "Kitchen"]);
  // Frosted Cakes reaches cakes (COOKABLE_CAKES), not the whole Bakery — boosts.ts:279-283.
  assert.equal(byName["Frosted Cakes"].multiplier, 0.9);
  assert.equal(byName["Frosted Cakes"].buildings, undefined);
  assert.ok(byName["Frosted Cakes"].foods.includes("Lemon Cheesecake") && !byName["Frosted Cakes"].foods.includes("Apple Pie"));
  const oil = p.boosts.timeBoosts.filter((b) => b.name === "Building Oil").map((b) => [b.buildings[0], b.multiplier]);
  assert.deepEqual(oil, [["Fire Pit", 0.6], ["Kitchen", 0.5], ["Deli", 0.4]], "oiled buildings only, at the skill-raised boost");
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
  assert.equal(byName["Grain Grinder"].buildings, undefined, "cakes, not the Bakery");
  assert.ok(byName["Grain Grinder"].foods.includes("Pirate Cake") && !byName["Grain Grinder"].foods.includes("Cornbread"));
  // VIP via hasVipAccess (vip.expiresAt / trial / banner), not the banner alone.
  assert.equal(byName["VIP Access"].multiplier, 1.1);
  assert.equal(byName["Lifetime Farmer Banner"], undefined);
});

test("boosts.petStreakInfo exposes the full object (fixture + petSimulate:true)", () => {
  // Week of 2026-07-13: the multiplier reads LAST week's (2026-07-06) streak of 2, not this week's 3.
  const p = buildCookingSection(farm, {}, { savedRecipes: {}, petSimulate: true, now: Date.parse("2026-07-16T12:00:00Z") });
  assert.equal(p.boosts.petStreakInfo.streak, 2);
  assert.equal(p.boosts.petStreakInfo.currentStreak, 3);
  assert.equal(p.boosts.petStreakInfo.thisWeekActive, false);
  assert.equal(p.boosts.petStreakInfo.manualOverride, true);
});

test("back-compat: xpBoosts (string[]) and petStreak keep their exact previous shape/values", () => {
  const p = buildCookingSection(farm, {}, { savedRecipes: {}, petSimulate: true, now: Date.parse("2026-07-16T12:00:00Z") });
  assert.ok(Array.isArray(p.xpBoosts), "xpBoosts must stay a string[]");
  for (const name of p.xpBoosts) assert.equal(typeof name, "string");
  assert.ok(!p.xpBoosts.includes("Pet's Streak (simulate)"), "petStreak entries must stay filtered out of xpBoosts");
  assert.deepEqual(p.petStreak, { weeks: 2, activeThisWeek: false, mult: 1.5 });
});

test("bankedFood sums XP across ALL recipes owned in inventory, attributed to recipe.building", () => {
  const p = buildCookingSection(farm, {}, { savedRecipes: {}, petSimulate: true });
  // 81 static-recipe items + all 11 Aged Fish stacks + the 6 Prime Aged stacks the fixture holds.
  // "Aged Saw Shark" used to be the odd one out: Saw Shark was missing from FISH_BASE_XP, so
  // no recipe was generated for it and the stack banked nothing. consumables.ts derives
  // AGED_FISH from the whole FISH record, and the stack sitting in this fixture is the proof
  // that the shed takes it. PRIME_AGED_FISH is derived the same way (consumables.ts:1420-1433),
  // and its 36 fish were not counted at all.
  assert.equal(p.bankedFood.items.length, 98, `items.length was ${p.bankedFood.items.length}`);
  const mashedPotato = p.bankedFood.items.find((i) => i.name === "Mashed Potato");
  assert.ok(mashedPotato, "Mashed Potato should be in bankedFood.items");
  assert.equal(mashedPotato.qty, 90);
  assert.ok(Math.abs(mashedPotato.xpEach - 6.0031125) < 0.0001, `xpEach was ${mashedPotato.xpEach}`);

  /*
   * totalXp derived independently (NOT by calling computeFoodXP) from the previous pin, one
   * game rule at a time. G = 2.0010375 = Munching Mastery x Observatory x Blossombeard x VIP x
   * Pet's Streak simulate (the Mashed Potato multiplier above).
   *   old non-aged total 7,827,323.818978125 (pinned before this revision), then:
   *   (a) Grain Grinder only on cakes (boosts.ts:347-353): Cornbread 600x11, Apple Pie 720x11 and
   *       Kale & Mushroom Pie 720x10 lose their x1.2;
   *   (b) Skill Shrimpy + Fishy Feast reach every FISH consumable (x1.44), not only the shed: 11
   *       fish dishes (Fermented Fish also carries Drive-Through Deli x1.15);
   *   (c) Aged fish: maxXP x G x 1.44 — a banked Aged fish is known NOT to be prime, so no
   *       prime-chance uplift;
   *   (d) Prime Aged fish: floor(maxXP x 1.3) x G x 1.44.
   */
  const G = 1.05 * 1.05 * 1.1 * 1.1 * 1.5;
  const maxXP = (b) => (b <= 200 ? b * 3 : b <= 330 ? b * 4 : b * 5);
  const aged = [[310, 3], [250, 27], [210, 27], [200, 25], [220, 6], [320, 8], [250, 4], [200, 13], [200, 12], [240, 12], [1920, 1]];
  const prime = [[200, 11], [200, 5], [250, 5], [250, 1], [210, 13], [320, 1]];   // Tuna, Blue Marlin, Porgy, Muskellunge, Weakfish, Rock Blackfish
  const a = -(600 * 11 + 720 * 11 + 720 * 10) * G * 0.2;
  const fishDishXp = 600 * 5 + 1000 * 4 + 1300 + 1500 * 5 + 1500 * 4 + 2000 * 5 + 2000 * 4 + 2000 + 2200 + 18000 * 5 + 3000 * 11 + 3000 * 5 * 1.15;
  const b = fishDishXp * G * 0.44;
  const c = aged.reduce((s, [x, q]) => s + maxXP(x) * G * 1.44 * q, 0);
  const d = prime.reduce((s, [x, q]) => s + Math.floor(maxXP(x) * 1.3) * G * 1.44 * q, 0);
  const expectedTotalXp = 7827323.818978125 + a + b + c + d;
  assert.ok(
    Math.abs(p.bankedFood.totalXp - expectedTotalXp) < 1,
    `totalXp was ${p.bankedFood.totalXp}, expected ~${expectedTotalXp}`
  );
  const agedItems = p.bankedFood.items.filter((i) => i.name.startsWith("Aged "));
  assert.equal(agedItems.length, 11, `expected 11 Aged Fish line items, got ${agedItems.length}`);
  assert.equal(p.bankedFood.items.filter((i) => i.name.startsWith("Prime Aged ")).reduce((s, i) => s + i.qty, 0), 36,
    "all 36 Prime Aged fish in the inventory are banked XP");
});

// --- Aging Shed ownership -------------------------------------------------
// The fixture farm OWNS an Aging Shed, so it can never catch a bug in the
// "does this farm have one?" branch. These use a synthetic shed-less farm.
// Regression: `clamp(agingShed.level, 1, 6)` is ALWAYS >= 1, so an unguarded
// version served a phantom Aging Shed (Aged Tuna, count 1, +34,133.875 XP/day)
// to every farm without one. flowers.html:10588-10592 requires the building to
// be PLACED; the pre-migration power-summary did not. The page is the correct copy.

const shedless = (() => {
  const f = JSON.parse(JSON.stringify(farm));
  delete f.agingShed;
  if (f.buildings) delete f.buildings["Aging Shed"];
  return f;
})();

test("a farm with no Aging Shed gets no Aging Shed", () => {
  const p = buildCookingSection(shedless, p2p, { savedRecipes: {}, petSimulate: true, coinsPerSFL: COINS_PER_SFL });
  assert.equal(p.buildings["Aging Shed"], undefined, "phantom Aging Shed served to a farm that owns none");
  assert.equal(Object.keys(p.buildings).length, 5);
});

test("the phantom Aging Shed's XP is not in totalXpPerDay either", () => {
  const p = buildCookingSection(shedless, p2p, { savedRecipes: {}, petSimulate: true, coinsPerSFL: COINS_PER_SFL });
  // The five real buildings, summed from their own pinned per-building values.
  const expected = 445643.791 + 390616.471 + 234369.882 + 694870.081 + 175777.412;
  assert.ok(Math.abs(p.totalXpPerDay - expected) < 0.01, `total ${p.totalXpPerDay}, expected ~${expected}`);
});

test("agingShed state without the placed building is still no Aging Shed", () => {
  // Mirrors flowers.html:10588-10592: ownedBuildings is keyed off the PLACED count,
  // so leftover agingShed state alone must not conjure a card.
  const f = JSON.parse(JSON.stringify(farm));
  if (f.buildings) delete f.buildings["Aging Shed"];   // state kept, building removed
  const p = buildCookingSection(f, p2p, { savedRecipes: {}, petSimulate: true, coinsPerSFL: COINS_PER_SFL });
  assert.equal(p.buildings["Aging Shed"], undefined);
});

test("the placed Aging Shed is unaffected: still 6 slots and 204,803.25 XP/day", () => {
  const p = buildCookingSection(farm, p2p, { savedRecipes: {}, petSimulate: true, coinsPerSFL: COINS_PER_SFL });
  const a = p.buildings["Aging Shed"];
  assert.equal(a.buildingCount, 6, "slots come from agingShed.level, not the placed count");
  assert.ok(Math.abs(a.xpPerDay - 204803.25) < 1, `Aging Shed ${a.xpPerDay}`);
  assert.ok(Math.abs(p.totalXpPerDay - 2146080.88) < 1, `total ${p.totalXpPerDay}`);
});
