import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { applyWhatIf, ownedLevelingItems } from "../../core/engine/leveling-whatif.mjs";
import { LEVELING_ITEMS } from "../../core/data/leveling-items.mjs";
import { computeFishYieldPerCast } from "../../core/engine/cooking-cost.mjs";
import { detectCookingBoosts } from "../../core/engine/cooking.mjs";
import { findCollectible, isWearableEquipped } from "../../core/derive/items.mjs";

const farm = JSON.parse(readFileSync(new URL("../fixtures/farm-155498.json", import.meta.url))).farm;

test("applyWhatIf places Walrus: fish per cast +1", () => {
  const w = applyWhatIf(farm, ["Walrus"]);
  assert.equal(computeFishYieldPerCast(w, "basic") - computeFishYieldPerCast(farm, "basic"), 1);
});

test("applyWhatIf wears a wearable (Surfer Hair) on a what-if farm hand", () => {
  assert.equal(isWearableEquipped(farm, "Surfer Hair"), false);
  assert.equal(isWearableEquipped(applyWhatIf(farm, ["Surfer Hair"]), "Surfer Hair"), true);
});

test("applyWhatIf Port bud: cooking boosts gain Port Bud ×1.1", () => {
  const b = detectCookingBoosts(applyWhatIf(farm, ["Port bud"]), {});
  const port = b.xpBoosts.find((x) => x.name === "Port Bud (Fish XP)");
  assert.ok(port && Math.abs(port.multiplier - 1.1) < 1e-9);
});

test("a skill rank row raises the skill to that rank, never lowers it", () => {
  const w = applyWhatIf({ ...farm, bumpkin: { ...farm.bumpkin, skills: { ...farm.bumpkin.skills, "Salty Seas": 1 } } }, ["Salty Seas 2"]);
  assert.equal(w.bumpkin.skills["Salty Seas"], 2);
  const w3 = applyWhatIf({ ...farm, bumpkin: { ...farm.bumpkin, skills: { ...farm.bumpkin.skills, "Salty Seas": 3 } } }, ["Salty Seas 2"]);
  assert.equal(w3.bumpkin.skills["Salty Seas"], 3);
});

test("unknown names are ignored", () => {
  assert.doesNotThrow(() => applyWhatIf(farm, ["No Such Thing", "Walrus 7"]));
});

test("an item the farm already has is not added twice", () => {
  const w = applyWhatIf(farm, ["Skill Shrimpy"]);
  assert.equal(findCollectible(w, "Skill Shrimpy").length, findCollectible(farm, "Skill Shrimpy").length);
});

test("applyWhatIf does not mutate the farm", () => {
  const before = JSON.stringify(farm);
  applyWhatIf(farm, ["Walrus", "Surfer Hair", "Port bud", "Ager 2"]);
  assert.equal(JSON.stringify(farm), before);
});

test("ownedLevelingItems: the fixture has Skill Shrimpy and Wide Rakes, not Walrus", () => {
  const owned = ownedLevelingItems(farm);
  assert.ok(owned.has("Skill Shrimpy"));
  assert.ok(owned.has("Wide Rakes"));
  assert.ok(!owned.has("Walrus"));
  assert.ok(!owned.has("Wide Rakes 3"));
});

test("catalogue names are unique", () => {
  assert.equal(new Set(LEVELING_ITEMS.map((i) => i.name)).size, LEVELING_ITEMS.length);
});

// ── the plan model (core/sections/leveling.mjs) ──
import { levelingPlan, defaultLevelingConfig, itemImpacts } from "../../core/sections/leveling.mjs";
import { ascensionXpFor } from "../../core/engine/ascension.mjs";
const prices = JSON.parse(readFileSync(new URL("../fixtures/p2p-prices.json", import.meta.url)));
const NOW = Date.UTC(2026, 10, 24);
const inputs = { prices, coinsPerSFL: 1192, floors: { Walrus: 1399, "Surfer Hair": 3279, "Salt Worker Gnome": 2799 }, bids: { Walrus: 1155 }, budFloors: { Port: 1700, Sea: 1650 }, freePoints: 3, now: NOW };
const cfg = (over = {}) => ({ ...defaultLevelingConfig(farm, inputs), ...over });
const plan = (c) => levelingPlan(farm, inputs, c);

test("default config: target end of A5, Smoothie Shack off, every other building on, 6 restarts", () => {
  const c = defaultLevelingConfig(farm, inputs);
  assert.deepEqual(c.target, { ascension: 5, level: 50 });
  assert.equal(c.restarts, 6);
  assert.equal(c.buildings["Smoothie Shack"].on, false);
  for (const b of ["Fire Pit", "Kitchen", "Bakery", "Deli"]) assert.equal(c.buildings[b].on, true, b);
  assert.ok(c.fish.reels >= 20);
});

test("need XP = target − experience − banked food XP", () => {
  const p = plan(cfg());
  const expect = ascensionXpFor(5, 50) - farm.bumpkin.experience - p.bankedXp;
  assert.ok(Math.abs(p.needXp - expect) < 1, `${p.needXp} vs ${expect}`);
  assert.ok(p.bankedXp > 0);
});

test("kitchens: turning Deli off lowers kitchen XP a day", () => {
  const c = cfg();
  const off = { ...c, buildings: { ...c.buildings, Deli: { ...c.buildings.Deli, on: false } } };
  assert.ok(plan(off).xpPerDay.kitchens < plan(c).xpPerDay.kitchens);
});

test("aging is salt-limited: Surfer Hair raises aging XP, salt used never exceeds salt made", () => {
  const c = cfg({ restarts: 24 });
  const a = plan(c), b = plan({ ...c, ticked: ["Surfer Hair"] });
  assert.ok(a.fish.saltUsed <= a.fish.saltPerDay + 1e-6);
  assert.ok(b.xpPerDay.aging > a.xpPerDay.aging);
});

test("slots: 1 restart a day ages fewer fish than 12", () => {
  assert.ok(plan(cfg({ restarts: 1 })).fish.aged < plan(cfg({ restarts: 12 })).fish.aged);
});

test("Walrus adds fish without adding running cost (casts are paid per cast, not per fish)", () => {
  // Raw eating only: with aging on, more fish may rightly mean more salt raked.
  const c0 = cfg(), c = { ...c0, fish: { ...c0.fish, age: false } }, a = plan(c), b = plan({ ...c, ticked: ["Walrus"] });
  assert.ok(b.fish.perDay > a.fish.perDay + c.fish.reels * 0.99);
  assert.ok(Math.abs(b.costPerDay - a.costPerDay) < 1e-9);
  assert.ok(Math.abs(b.resaleLoss - (1399 - 1155)) < 1e-9);
});

test("target already reached: 0 days, 0 FLOWER", () => {
  const p = plan(cfg({ target: { ascension: 1, level: 1 } }));
  assert.equal(p.days, 0);
  assert.equal(p.totalFlower, 0);
});

test("everything off: never", () => {
  const c = cfg();
  const off = { ...c, buildings: Object.fromEntries(Object.entries(c.buildings).map(([k, v]) => [k, { ...v, on: false }])), fish: { ...c.fish, age: false, eatRaw: false } };
  const p = plan(off);
  assert.equal(p.xpPerDay.total, 0);
  assert.equal(p.days, Infinity);
});

test("a farm with no Aging Shed and no salt nodes ages nothing and stays finite", () => {
  const bare = JSON.parse(JSON.stringify(farm));
  delete bare.buildings["Aging Shed"]; bare.saltFarm = { nodes: {} };
  const p = levelingPlan(bare, inputs, defaultLevelingConfig(bare, inputs));
  assert.equal(p.xpPerDay.aging, 0);
  assert.ok(Number.isFinite(p.xpPerDay.total) && Number.isFinite(p.costPerDay));
});

test("itemImpacts: owned items hidden, Walrus positive XP, skills carry point cost", () => {
  const rows = itemImpacts(farm, inputs, cfg());
  const names = new Set(rows.map((r) => r.name));
  assert.ok(!names.has("Skill Shrimpy"));
  const w = rows.find((r) => r.name === "Walrus");
  assert.ok(w && w.dXpPerDay > 0 && w.loss === 1399 - 1155);
  const sk = rows.find((r) => r.kind === "skill");
  assert.ok(sk && sk.pointCost > 0);
});

test("baits: fish turned into baits are not also eaten — every caught fish is counted once", () => {
  const p = plan(cfg({ restarts: 1, fish: { ...cfg().fish, baits: true } }));
  assert.ok(p.fish.baitsPerDay > 0, "slot-bound at 1 restart, so a bait should be worth it");
  const f = p.fish;
  assert.ok(Math.abs(f.eatenN + f.agedCaughtN + f.baitInputN - f.perDay) < 1e-6, JSON.stringify(f));
});

test("a reel item adds its reels on top of the configured reels", () => {
  const c = cfg(), a = plan(c), b = plan({ ...c, ticked: ["Nautilus"] });
  assert.ok(Math.abs((b.fish.perDay - a.fish.perDay) - 5 * a.fish.fishPerCast) < 1e-6);
});

test("a bait is not starved by aging its own input fish (2 restarts, slot-bound)", () => {
  const p = plan(cfg({ restarts: 2, fish: { ...cfg().fish, baits: true } }));
  assert.ok(p.fish.baitsPerDay > 0, JSON.stringify(p.fish));
});

test("Master Chef's Cleaver is recognised as owned under the game's spelling", () => {
  assert.ok(ownedLevelingItems(farm).has("Master Chef's Cleaver"));
});

test("budTypeFloors: the cheapest listed bud of each type from the marketplace book", async () => {
  const { budTypeFloors } = await import("../../core/sections/leveling.mjs");
  const { decodeBud } = await import("../../core/engine/buds.mjs");
  const ids = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const items = Object.fromEntries(ids.map((id, i) => [`Bud #${id}`, { f: 1000 + i * 10 }]));
  items.Walrus = { f: 1399 };
  const out = budTypeFloors(items);
  for (const id of ids) {
    const t = decodeBud(id).type;
    assert.ok(out[t] <= 1000 + ids.indexOf(id) * 10, t);
  }
  assert.equal(Object.keys(out).every((t) => typeof out[t] === "number"), true);
});

test("levelingRecipeOptions: each placed kitchen's plannable recipes, best XP/day first", async () => {
  const { levelingRecipeOptions } = await import("../../core/sections/leveling.mjs");
  const o = levelingRecipeOptions(farm, inputs, 6);
  assert.ok(o["Fire Pit"].length > 3);
  for (const list of Object.values(o)) for (let i = 1; i < list.length; i++) assert.ok(list[i - 1].xpPerDay >= list[i].xpPerDay);
  assert.equal(o["Fire Pit"][0].name, defaultLevelingConfig(farm, inputs).buildings["Fire Pit"].recipe);
});

test("sanitizeLevelingConfig drops stale names and clamps numbers", async () => {
  const { sanitizeLevelingConfig, levelingRecipeOptions } = await import("../../core/sections/leveling.mjs");
  const def = defaultLevelingConfig(farm, inputs), opts = levelingRecipeOptions(farm, inputs, 6);
  const saved = { target: { ascension: 99, level: 0 }, restarts: 500, ticked: ["Walrus", "Gone Item"],
    buildings: { "Fire Pit": { on: false, recipe: "Old Recipe" }, Moonbase: { on: true, recipe: "x" } },
    fish: { age: false, eatRaw: true, reels: -3, baits: true } };
  const c = sanitizeLevelingConfig(saved, def, opts);
  assert.deepEqual(c.ticked, ["Walrus"]);
  assert.equal(c.restarts, 48);
  assert.deepEqual(c.target, { ascension: 10, level: 1 });
  assert.equal(c.buildings["Fire Pit"].on, false);
  assert.equal(c.buildings["Fire Pit"].recipe, def.buildings["Fire Pit"].recipe);
  assert.ok(!("Moonbase" in c.buildings));
  assert.equal(c.fish.reels, 0);
  assert.equal(c.fish.baits, true);
  const kitchen = opts.Kitchen[1].name;
  assert.equal(sanitizeLevelingConfig({ buildings: { Kitchen: { on: true, recipe: kitchen } } }, def, opts).buildings.Kitchen.recipe, kitchen);
  assert.deepEqual(sanitizeLevelingConfig(null, def, opts), def);
  assert.deepEqual(sanitizeLevelingConfig("garbage", def, opts), def);
});

test("rakes are charged only for the salt aging uses: a salt boost never costs FLOWER a day when slots are the limit", () => {
  const c = cfg({ restarts: 6 });
  const a = plan(c);
  assert.equal(a.bottleneck, "slots");
  const b = plan({ ...c, ticked: ["Salt Worker Gnome"] });
  assert.ok(b.costPerDay <= a.costPerDay + 1e-9, `${b.costPerDay} > ${a.costPerDay}`);
});

test("tickedSkillPoints counts each skill once, at its highest ticked rank", async () => {
  const { tickedSkillPoints } = await import("../../core/sections/leveling.mjs");
  const one = tickedSkillPoints(farm, ["Ager 3"]);
  assert.ok(one > 0);
  assert.equal(tickedSkillPoints(farm, ["Ager 2", "Ager 3"]), one);
  assert.equal(tickedSkillPoints(farm, ["Walrus"]), 0);
});
