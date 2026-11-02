import { test } from "node:test";
import assert from "node:assert";
import { sideValue, sideState, pigDay, truffleValue, caveBatch, caveDay, farmPigs, farmBins, sideCavePigsNow } from "../../core/engine/side-values.mjs";

/*
 * Cave Dwellers (game source 2026-11-02): pigs give Truffles for Slop, the cave's Myco Bins dig a
 * 25-tile patch every 12 h. Nothing new trades yet, so the outputs are valued by what they replace
 * on the farm; these pin the game's numbers and those valuation rules.
 */
const prices = { Potato: 0.0002, Sunflower: 0.0002, Carrot: 0.002, Wheat: 0.0135, Egg: 0.0245, Honey: 0.097, Rice: 0.21,
  Wood: 0.0107, Stone: 0.0202, Eggplant: 0.02, Grape: 0.3, Beetroot: 0.004 };
const pig = (xp) => ({ type: "Pig", experience: xp });
const farm = (extra = {}) => ({
  bumpkin: { skills: {} },
  pigpen: { level: 1, animals: { 0: pig(200), 1: pig(200), 2: pig(1500) } },
  cave: { tier: 1, machines: { 1: {} } },
  ...extra,
});
const ctx = (f, o = {}) => ({ farm: f, prices, coinsPerSFL: 320, sflPerXP: 0.0001, isActive: () => false, ...o });

test("pig levels follow the Cow thresholds; bins are one per cave tier", () => {
  assert.deepEqual(farmPigs(farm()), [1, 1, 5]);
  assert.equal(farmBins(farm()), 1);
  assert.equal(farmBins({}), 0);
});

test("a pig's day: Truffles by level, fed the cheapest Slop per XP back to ready", () => {
  const c = ctx(farm()), st = sideState(c);
  const l1 = pigDay(c, st, 1);
  assert.equal(l1.truffles, 1);
  // 180 XP to L2; Basic Slop is the favourite (60 XP) = 3 Slops of 150 Potato.
  assert.ok(Math.abs(l1.feed - 3 * 150 * 0.0002) < 1e-12);
  assert.equal(pigDay(c, st, 5).truffles, 2);
  assert.equal(pigDay(c, st, 15).truffles, 4);
});

test("a Truffle is worth its best recipe's XP over the other ingredients until it trades", () => {
  const c = ctx(farm());
  // Risotto 32,000 XP for 8 Truffles + 3 Rice + 5 Wild Mushroom (= a Rich Slop: 6 Wheat beats 6 Eggplant).
  const risotto = (32000 * 0.0001 - 3 * 0.21 - 5 * 6 * 0.0135) / 8;
  const cake = (30000 * 0.0001 - 30 * 0.0135 - 30 * 0.0245 - 5 * 0.097) / 15;
  assert.ok(Math.abs(truffleValue(c) - Math.max(risotto, cake, 1000 * 0.0001 - 30 * 0.0002)) < 1e-12);
  assert.equal(truffleValue(ctx(farm(), { prices: { ...prices, Truffle: 0.5 } })), 0.5, "a p2p price wins");
});

test("Truffle Yield multiplies the Truffles; Swill Savvy pays its debuff on the other animals", () => {
  const c = ctx(farm());
  const ty = sideValue("Truffle Yield", c, 1);
  assert.equal(ty.cat, "pigs");
  assert.ok(Math.abs(ty.perDay - (0.1 * 1 + 0.1 * 1 + 0.1 * 2) * truffleValue(c)) < 1e-12);
  const calls = [];
  const withDebuff = ctx(farm(), { catGain: (cat, eff) => { calls.push([cat, eff[0].value]); return -1; } });
  const ss = sideValue("Swill Savvy", withDebuff, 1);
  assert.deepEqual(calls.map((x) => x[0]).sort(), ["chickens", "cows", "sheep"]);
  assert.ok(Math.abs(calls[0][1] - 0.5) < 1e-12, "+50% feed for every other animal at rank 1");
  assert.ok(ss.perDay < sideValue("Swill Savvy", c, 1).perDay, "the debuff lowers its value");
});

test("a Myco Bin batch: the recipe's tiles, Mud ×2 on the Mud recipe, skills move tiles from Mud", () => {
  const c = ctx(farm()), st = sideState(c);
  const mud = caveBatch(c, st, "Mud", 0);
  assert.equal(mud.mud, 40);
  assert.equal(mud.mushrooms, 3);
  assert.equal(mud.beetles, 2);
  const bloom = caveBatch(c, { ...st, overrides: { "Mushroom Bloom": 2 } }, "Mud", 0);
  assert.equal(bloom.mushrooms, 5);
  assert.equal(bloom.mud, 36, "two Mud tiles became Mushroom tiles");
  // Beetle Nest only on the Beetle recipe (28f8d3411).
  assert.equal(caveBatch(c, { ...st, overrides: { "Beetle Nest": 3 } }, "Mushroom", 0).beetles, 2);
  assert.equal(caveBatch(c, { ...st, overrides: { "Beetle Nest": 3 } }, "Beetle", 0).beetles, 8);
  // 25 tiles dug with Sand Shovels: 20 coins + 2 Wood + 1 Stone each. The drill needs Oil,
  // Crimstone and Leather, unpriced here, so it is not taken as the cheap route.
  assert.ok(Math.abs(mud.dig - 25 * (20 / 320 + 2 * 0.0107 + 0.0202)) < 1e-12);
});

test("Mud is worth a coat's feed saving, but only as much Mud as the pigs can use", () => {
  const c = ctx(farm()), st = sideState(c);
  const one = caveDay(c, st, 1), many = caveDay(c, st, 6);
  const used = many.bins.reduce((t, b) => t + b.mudUsed, 0);
  assert.ok(used <= 3 * 25 + 1e-9, "three pigs, one 25-Mud coat a claim each");
  // With no pigs, Mud is worth nothing.
  const noPigs = caveDay(ctx(farm({ pigpen: undefined })), st, 1);
  assert.equal(noPigs.bins[0].mudUsed, 0);
  assert.ok(one.batchesPerDay === 2);
});

test("the farm's pigs and cave as they stand", () => {
  const now = sideCavePigsNow(ctx(farm()));
  assert.equal(now.pigs.length, 3);
  assert.equal(now.cave.bins.length, 1);
  assert.ok(isFinite(now.pigsNet) && isFinite(now.cave.net));
});
