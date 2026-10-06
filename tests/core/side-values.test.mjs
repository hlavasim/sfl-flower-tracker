import { test } from "node:test";
import assert from "node:assert";
import { sideValue, sideRankDelta, sideSaltNow, SIDE_MODELS } from "../../core/engine/side-values.mjs";
import { parseBoostEffects } from "../../core/engine/power-boosts.mjs";

/*
 * Side models: the game's rule for salt, the aging shed and racks, animal extras (types/salt.ts,
 * agingFormulas.ts, lib/animals.ts…). Pinned with hand-computed numbers so a wrong rank table or a
 * dropped term shows up as a number, not a vibe.
 */
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: ${a} vs ${b}`);
const salt = { Salt: 0.004, Wood: 0.012 };
const ctx = (over = {}) => Object.assign({
  farm: { saltFarm: { nodes: { 0: {}, 1: {} } }, bumpkin: { skills: {} } },
  prices: salt, coinsPerSFL: 1500, coinsFree: false, activity: null, isActive: () => false,
}, over);
const rake = 20 / 1500 + 3 * 0.012;
const theo = 2 * 24 / 7;     // two nodes, a charge every 7 h

test("salt: base farm nets yield × price − rake per harvest, every charge raked", () => {
  const r = sideSaltNow(ctx());
  near(r.harvests, theo, "harvests");
  near(r.net, theo * (10 * 0.004 - rake), "net");
});

test("salt: Wide Rakes is +2/+3/+4 by rank — the rank ladder is +1 salt a harvest each", () => {
  near(sideValue("Wide Rakes", ctx(), 1).perDay, theo * 2 * 0.004, "rank 1");
  near(sideRankDelta("Wide Rakes", ctx(), 2), theo * 1 * 0.004, "rank 2 over 1");
  near(sideRankDelta("Wide Rakes", ctx(), 3), theo * 1 * 0.004, "rank 3 over 2");
});

test("salt: Ascended Idol saves every rake; Sea Blessed adds charges to 4 nodes per proc", () => {
  near(sideValue("Ascended Idol", ctx(), null).perDay, theo * rake, "idol");
  // 8 % × min(4, 2 nodes) = 0.16 extra charges a harvest → harvests ×1/(1−0.16)
  const sb = sideValue("Sea Blessed", ctx(), 3).perDay;
  near(sb, theo * (1 / (1 - 0.16) - 1) * (10 * 0.004 - rake), "sea blessed L3");
});

test("salt: measured harvests set the pace, a speed boost scales from there", () => {
  const c = ctx({ activity: { saltHarvests: 10 } });
  near(sideSaltNow(c).harvests, 10, "measured pace");
  // Salty Seas L1: charge ×0.9 → harvests ×1/0.9 at the same pace
  near(sideValue("Salty Seas", c, 1).perDay, 10 * (1 / 0.9 - 1) * (10 * 0.004 - rake), "salty seas");
});

test("animals: Vibraphone halves the Salt Licks — a spice job is 5 of them, priced through the recipe", () => {
  const c = ctx({ activity: { racks: { "Salt Lick": 2 } } });
  // Salt Lick has no market price: 5 Refined Salt → 5 Salt Lick, a Refined Salt is 10 Salt
  near(sideValue("Vibraphone", c, null).perDay, 2 * 5 * 0.5 * (10 * 0.004), "vibraphone");
});

test("aging/racks: Salt Bottle Onesie is +1 output per spice job; Refiner a chance of +1 Refined Salt", () => {
  const c = ctx({ activity: { racks: { "Refined Salt": 6 } } });
  near(sideValue("Salt Bottle Onesie", c, null).perDay, 6 * 1 * (10 * 0.004), "onesie");
  near(sideValue("Refiner", c, 2).perDay, 6 * 0.25 * (10 * 0.004), "refiner L2");
});

test("xp: boosts multiply — a missing ×1.25 Pan adds 25 % of the unboosted XP, an owned Observatory 1 − 1/1.05", () => {
  const xpDay = 40000, perXp = 0.00002;
  const c = ctx({ activity: { xpPerDay: xpDay }, sflPerXP: perXp, isActive: (n) => n === "Observatory" });
  const unboosted = xpDay / 1.05;
  near(sideValue("Pan", c, null).perDay, unboosted * 1.05 * 0.25 * perXp, "pan (missing)");
  near(sideValue("Observatory", c, null).perDay, unboosted * 0.05 * perXp, "observatory (owned)");
  near(sideRankDelta("Munching Mastery", c, 2), unboosted * 1.05 * (1.075 - 1.05) * perXp, "munching L2 over L1");
});

test("weekly records: bumpkin experience gives the XP a day", async () => {
  const { measuredActivity } = await import("../../core/sections/tickets.mjs");
  const wk = (ts, xp) => ({ ts, wk: String(ts), farm: { farmActivity: { "Salt Harvested": 0 }, bumpkin: { experience: xp } } });
  const DAY = 86400000;
  near(measuredActivity([wk(0, 1000), wk(10 * DAY, 51000)]).xpPerDay, 5000, "xp/day");
  assert.equal(measuredActivity([wk(0, 0), wk(10 * DAY, 0)]).xpPerDay, null, "no experience → null, not 0");
});

test("parser: a side item lands in its side category instead of 'other'", () => {
  const e = parseBoostEffects("-30% Salt Node recovery time\n+2 Salt per harvest", "Salt Worker Gnome");
  assert.deepStrictEqual(e.map((x) => [x.type, x.cat]), [["side", "salt"]]);
  for (const [n, m] of Object.entries(SIDE_MODELS)) assert.ok(m.cat && typeof m.net === "function", n);
});
