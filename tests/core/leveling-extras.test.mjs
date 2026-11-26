import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import * as LV from "../../core/sections/leveling.mjs";
import { COOKING_RECIPES_DATA } from "../../core/data/cooking.mjs";
import { computeWaterTrapCostSFL } from "../../core/engine/item-value.mjs";

// LEVELING extras: every recipe a kitchen can cook is on the page. The ones bounded by something
// other than time — instant dishes, fish, Fish Market baits, mushrooms — are add-ons with a daily cap.
const farm = JSON.parse(readFileSync(new URL("../fixtures/farm-155498.json", import.meta.url))).farm;
const prices = JSON.parse(readFileSync(new URL("../fixtures/p2p-prices.json", import.meta.url)));
const inputs = { prices, coinsPerSFL: 1192, floors: {}, bids: {}, budFloors: {}, freePoints: 3, now: Date.UTC(2026, 10, 24) };
const base = () => LV.defaultLevelingConfig(farm, inputs);
const withExtras = (cfg, building, extras, over = {}) => ({ ...cfg, ...over, buildings: { ...cfg.buildings, [building]: { ...cfg.buildings[building], on: true, extras } } });
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));

test("every recipe of every kitchen is either a main recipe or an extra", () => {
  const c = base();
  const main = LV.levelingRecipeOptions(farm, inputs, c.restarts);
  const extra = LV.levelingExtraOptions(farm, inputs, c);
  for (const b of Object.keys(c.buildings)) {
    const all = Object.entries(COOKING_RECIPES_DATA).filter(([, r]) => r.building === b).map(([n]) => n).sort();
    const got = [...(main[b] || []).map((o) => o.name), ...(extra[b] || []).map((o) => o.name)].sort();
    assert.deepEqual(got, all, b);
  }
  const k = (extra.Kitchen || []).map((o) => o.name);
  for (const n of ["Crimstone Infused Fish Oil", "Creamy Truffle Risotto", "Chowder", "Surimi Rice Bowl"]) assert.ok(k.includes(n), n);
});

test("Crimstone Infused Fish Oil: capped by the Fish Market (16 h a Fish Oil), its XP added, the queue shared with baits", () => {
  const c = base();
  const a = LV.levelingPlan(farm, inputs, c);
  const b = LV.levelingPlan(farm, inputs, withExtras(c, "Kitchen", ["Crimstone Infused Fish Oil"], { restarts: 48 }));
  const a48 = LV.levelingPlan(farm, inputs, { ...c, restarts: 48 });
  const k = b.buildings.find((x) => x.name === "Kitchen");
  const e = k.extras.find((x) => x.name === "Crimstone Infused Fish Oil");
  assert.ok(e && e.cooksPerDay > 0, JSON.stringify(k));
  assert.ok(e.cooksPerDay <= (24 / 16) * 1.2 + 1e-9, String(e.cooksPerDay));
  assert.ok(b.xpPerDay.kitchens > a48.xpPerDay.kitchens);
  assert.ok(b.fish.marketHours <= 24 + 1e-6);
  assert.ok(b.fish.marketDishes.some((d) => d.product === "Fish Oil" && d.recipe === "Crimstone Infused Fish Oil"));
  // an instant dish takes no kitchen time: the main recipe cooks as often as before
  assert.ok(near(k.cooksPerDay, a48.buildings.find((x) => x.name === "Kitchen").cooksPerDay));
  assert.ok(a.xpPerDay.total > 0);
});

test("a timed fish dish takes kitchen time from the main recipe and fish from the fish route", () => {
  const c = { ...base(), restarts: 48 };
  const a = LV.levelingPlan(farm, inputs, c);
  const b = LV.levelingPlan(farm, inputs, withExtras(c, "Kitchen", ["Chowder"]));
  const ka = a.buildings.find((x) => x.name === "Kitchen"), kb = b.buildings.find((x) => x.name === "Kitchen");
  const ch = kb.extras.find((x) => x.name === "Chowder");
  assert.ok(ch.cooksPerDay > 0);
  assert.ok(kb.cooksPerDay < ka.cooksPerDay, `${kb.cooksPerDay} vs ${ka.cooksPerDay}`);
  assert.ok(b.fish.eatenN + b.fish.aged < a.fish.eatenN + a.fish.aged, "the Anchovies went into the chowder");
});

test("Crab Stick is made, not rationed: its crustaceans need pots (priced) and trap time, and the Fish Market makes it", () => {
  const c = withExtras({ ...base(), restarts: 48 }, "Kitchen", ["Creamy Crab Bite"]);
  const p = LV.levelingPlan(farm, inputs, c);
  const e = p.buildings.find((x) => x.name === "Kitchen").extras[0];
  assert.ok(e.cooksPerDay > 0, "no ration needed");
  const sticks = e.cooksPerDay * 2;                         // Double Nom: 2 Crab Sticks a cook
  // every Crab Stick is 3 crustaceans = 3 pots (2 Crab Pot + 1 Mariner Pot in every season)
  const pots = 2 * computeWaterTrapCostSFL("Crab Pot", prices, 1192) + computeWaterTrapCostSFL("Mariner Pot", prices, 1192);
  assert.ok(pots > 0.1, String(pots));
  assert.ok(e.costPerDay >= sticks * pots - 1e-9, `${e.costPerDay} for ${sticks} sticks, pots ${pots}`);
  // 4 trap spots: 16 spot-hours a stick (two 4 h Crab Pots + one 8 h Mariner Pot) → at most 6 a day
  assert.ok(sticks <= 4 * 24 / 16 + 1e-9, String(sticks));
  assert.ok(["traps", "market", "fish"].includes(e.limit), e.limit);  // winter's Oyster wants 2 Fish Stick: fish too
  assert.ok(e.costPerDay / sticks > 2, `a Crab Stick costs ${e.costPerDay / sticks} FLOWER`);
  assert.ok(p.fish.marketHours <= 24 + 1e-6);
});

test("mushrooms: no supply set → no cooks; a supply a day caps it", () => {
  const c = withExtras(base(), "Fire Pit", ["Mushroom Soup"]);
  const a = LV.levelingPlan(farm, inputs, c).buildings.find((x) => x.name === "Fire Pit").extras[0];
  assert.equal(a.cooksPerDay, 0);
  const b = LV.levelingPlan(farm, inputs, { ...c, supply: { "Wild Mushroom": 10 } }).buildings.find((x) => x.name === "Fire Pit").extras[0];
  const per = COOKING_RECIPES_DATA["Mushroom Soup"] && 5; // 5 Wild Mushroom a soup
  assert.ok(b.cooksPerDay > 0 && b.cooksPerDay <= 10 / per + 1e-9, String(b.cooksPerDay));
});

test("sanitize keeps a building's extras that belong to it, and the supply numbers", () => {
  const d = base();
  const s = LV.sanitizeLevelingConfig({ buildings: { Kitchen: { on: true, extras: ["Crimstone Infused Fish Oil", "Mushroom Soup", "Nope"] } }, supply: { "Wild Mushroom": 12, "Crab Stick": 5, x: "a" } }, d, null);
  assert.deepEqual(s.buildings.Kitchen.extras, ["Crimstone Infused Fish Oil"]);
  assert.deepEqual(s.supply, { "Wild Mushroom": 12 });
});

test("steps can propose adding an extra, and it replans to that saving", () => {
  const c = { ...base(), restarts: 48 };
  const steps = LV.levelingSteps(farm, inputs, c, [], 30);
  const add = steps.filter((s) => s.kind === "extra");
  for (const s of add) assert.ok(near(LV.levelingPlan(farm, inputs, s.config).totalFlower - LV.levelingPlan(farm, inputs, c).totalFlower, s.dFlower));
  assert.ok(add.length > 0, steps.map((s) => s.label).join(" | "));
});

test("an extra runs in a building whose main recipe is off: no main cooks, the extra's XP only", () => {
  const d = { ...base(), restarts: 48 };
  const off = { ...d, buildings: { ...d.buildings, Kitchen: { ...d.buildings.Kitchen, on: false, extras: ["Crimstone Infused Fish Oil"] } } };
  const k = LV.levelingPlan(farm, inputs, off).buildings.find((x) => x.name === "Kitchen");
  assert.ok(k, "the building is in the plan");
  assert.equal(k.recipe, null);
  assert.equal(k.cooksPerDay, 0);
  assert.ok(k.extras[0].cooksPerDay > 0 && near(k.xpPerDay, k.extras[0].xpPerDay));
  // and the steps offer it although the building is off
  const steps = LV.levelingSteps(farm, inputs, { ...d, buildings: { ...d.buildings, Kitchen: { ...d.buildings.Kitchen, on: false } } }, [], 30);
  assert.ok(steps.some((s) => s.label === "Kitchen: add Crimstone Infused Fish Oil"), steps.map((s) => s.label).join(" | "));
});
