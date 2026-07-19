import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import {
  bandXp, ascensionBaseline, ascensionStanding, getAscensionUpgradeCost,
  getAscensionExpansionRequirements, getExpansionCrystalCount, getAscensionExpansionDelta,
  V150_XP,
} from "../../core/engine/ascension.mjs";
import { buildAscensionSection } from "../../core/sections/ascension.mjs";
import { buildPowerSection } from "../../core/sections/power.mjs";
import { buildCookingSection } from "../../core/sections/cooking.mjs";

const wrap = JSON.parse(readFileSync(new URL("../fixtures/farm-155498.json", import.meta.url)));
const farm = wrap.farm || wrap;
const p2p = JSON.parse(readFileSync(new URL("../fixtures/p2p-prices.json", import.meta.url)));
const nfts = JSON.parse(readFileSync(new URL("../fixtures/nfts-sample.json", import.meta.url)));

// ── engine pins: every number checked against the game source formulas ──

test("band XP model matches level.ts (50M × 1.45^(a-1), rounded to 5M)", () => {
  assert.equal(V150_XP, 94_333_905);
  assert.equal(bandXp(1), 50_000_000);
  assert.equal(bandXp(2), 75_000_000);
  assert.equal(bandXp(3), 105_000_000); // 105.125M → rounds to 105M
  assert.equal(ascensionBaseline(1), V150_XP);
  assert.equal(ascensionBaseline(3), V150_XP + 50_000_000 + 75_000_000);
});

test("standings on the fixture XP match the documented example (A1 L50 · A2 L28 · A3 L0)", () => {
  const xp = 179145036.4736665;
  assert.equal(ascensionStanding(xp, 1), 50);
  assert.equal(ascensionStanding(xp, 2), 28);
  assert.equal(ascensionStanding(xp, 3), 0);
});

test("upgrade cost: floor(base × 1.4^(a-1)) per upgradeFarm.ts", () => {
  assert.deepEqual(getAscensionUpgradeCost(1), { items: { Crimstone: 30, Oil: 50, Obsidian: 3 }, coins: 5000 });
  const a3 = getAscensionUpgradeCost(3);
  assert.deepEqual(a3.items, { Crimstone: Math.floor(30 * 1.96), Oil: Math.floor(50 * 1.96), Obsidian: Math.floor(3 * 1.96) });
});

test("expansion requirements: curve ends exact, coins ceil to 10, time e×7h", () => {
  const e31 = getAscensionExpansionRequirements(1, 31);
  assert.deepEqual(e31.resources, { Crimstone: 10, Oil: 50, Obsidian: 2 }); // curve start
  assert.equal(e31.coins, 5000);
  assert.equal(e31.seconds, 7 * 3600);
  assert.equal(e31.levelRequired, 1);
  const e42 = getAscensionExpansionRequirements(1, 42);
  assert.deepEqual(e42.resources, { Crimstone: 50, Oil: 400, Obsidian: 20 }); // curve end
  assert.equal(e42.coins, 75000);
  assert.equal(e42.seconds, 12 * 7 * 3600);
  assert.equal(e42.levelRequired, 45);
  // per-ascension growth ×1.3^(a-1), half-up rounding
  const a2e31 = getAscensionExpansionRequirements(2, 31);
  assert.equal(a2e31.resources.Crimstone, Math.round(10 * 1.3));
});

test("crystals: 1 at upgrade-band expansions e ≤ min(a+2,12); Beehive+Flower Bed pair in schedule", () => {
  assert.equal(getExpansionCrystalCount(1, 31), 1);
  assert.equal(getExpansionCrystalCount(1, 33), 1);  // e=3 = min(1+2,12)
  assert.equal(getExpansionCrystalCount(1, 34), 0);  // e=4 > 3
  assert.equal(getExpansionCrystalCount(10, 42), 1); // e=12 ≤ min(12,12)
  // schedule sanity: all 12 slots of A1 together deal the band totals
  let bee = 0, flower = 0;
  for (let e = 31; e <= 42; e++) {
    const d = getAscensionExpansionDelta(1, e);
    bee += d["Beehive"] || 0; flower += d["Flower Bed"] || 0;
  }
  assert.equal(bee, flower, "Beehive and Flower Bed always unlock together");
});

// ── section pins on the fixture farm (volcano, level 150, pre-swamp) ──

const powerData = buildPowerSection(farm, p2p, nfts, null, {});
const cooking = buildCookingSection(farm, p2p, { petSimulate: true });
const eff = { effByCat: { crimstone: { measured: true, ratio: 0.5 }, oil: { measured: true, ratio: 0.6 }, obsidian: { measured: true, ratio: 0.9 } }, meta: { days: 7 } };
const out = buildAscensionSection(farm, powerData, cooking.totalXpPerDay, eff, { max: 10 });

test("current state: pre-swamp farm is ready to ascend, standings served", () => {
  assert.equal(out.current.island, "volcano");
  assert.equal(out.current.ascensionLevel, 0);
  assert.equal(out.current.basicLand, 30);
  assert.equal(out.current.readyToAscend, true);
  assert.equal(out.current.bandStandings[1], 50);
  assert.equal(out.current.bandStandings[2], 28);
});

test("rates: theoretical from power categories, effective = theo × measured ratio", () => {
  assert.ok(out.rates.Crimstone.theo > 0);
  assert.ok(Math.abs(out.rates.Crimstone.eff - out.rates.Crimstone.theo * 0.5) < 1e-9);
  assert.equal(out.rates.xpPerDay, cooking.totalXpPerDay);
});

test("frontier + bottleneck: stock covers steps up to the first shortage", () => {
  assert.ok(out.frontier, "some steps must be affordable from stock");
  assert.ok(out.bottleneck, "the fixture stock cannot cover all 10 ascensions");
  // frontier step's cumulative cost is within stock; the NEXT one is not
  const idx = out.steps.findIndex((s) => s.asc === out.frontier.asc && s.expansion === out.frontier.expansion && s.kind === out.frontier.kind);
  const next = out.steps[idx + 1];
  assert.ok(next.cum[out.bottleneck] > out.current.stock[out.bottleneck]);
});

test("node-aware sim: adding nodes speeds later steps up (eff mode, days units)", () => {
  const simmed = out.steps.filter((s) => s.sim && s.sim.eff && !s.sim.eff.blocked);
  assert.ok(simmed.length > 10);
  // monotonic cumulative time; all in plausible day magnitudes (not seconds)
  let prev = 0;
  for (const s of simmed) {
    assert.ok(s.sim.eff.all >= prev - 1e-9);
    prev = s.sim.eff.all;
  }
  assert.ok(prev > 30 && prev < 10000, `total farm days ${prev}`);
});

test("continuous-expand: build slots increase by each step's build time; stuck flagged", () => {
  const withSlots = out.steps.filter((s) => typeof s.buildSlotDays === "number");
  assert.equal(withSlots.length, out.steps.length);
  const firstStuck = out.steps.find((s) => s.stuck);
  assert.ok(firstStuck, "the fixture farm cannot keep continuous-expand pace forever");
  assert.ok(firstStuck.sim.eff.farmEtaDays == null || firstStuck.sim.eff.farmEtaDays > firstStuck.buildSlotDays);
});

test("grinx halves the three resource costs but not coins", () => {
  const g = buildAscensionSection(farm, powerData, cooking.totalXpPerDay, eff, { max: 2, grinx: true });
  const s0 = g.steps.find((s) => s.kind === "exp" && s.asc === 1 && s.expansion === 31);
  const n0 = out.steps.find((s) => s.kind === "exp" && s.asc === 1 && s.expansion === 31);
  assert.equal(s0.cost.Crimstone, n0.cost.Crimstone / 2);
  assert.equal(s0.cost.Coins, n0.cost.Coins);
});
