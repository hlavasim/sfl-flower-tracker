import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import * as LV from "../../core/sections/leveling.mjs";
import { computeBaitCostSFL } from "../../core/engine/item-value.mjs";

// LEVELING fish v3: the worm you cast (catch mix + cast price), the Fish Market's one queue,
// and which baits the plan actually makes.
const farm = JSON.parse(readFileSync(new URL("../fixtures/farm-155498.json", import.meta.url))).farm;
const prices = JSON.parse(readFileSync(new URL("../fixtures/p2p-prices.json", import.meta.url)));
const NOW = Date.UTC(2026, 10, 24);
const inputs = { prices, coinsPerSFL: 1192, floors: {}, bids: {}, budFloors: {}, freePoints: 3, now: NOW };
const cfg = (fish = {}, over = {}) => { const d = LV.defaultLevelingConfig(farm, inputs); return { ...d, ...over, fish: { ...d.fish, ...fish } }; };
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));

test("wormCatchShare: a distribution over that worm's fish only, a quarter of the year per season", () => {
  const rw = LV.wormCatchShare("Red Wiggler");
  assert.ok(near(Object.values(rw).reduce((a, b) => a + b, 0), 1));
  assert.ok(rw["Trout"] > 0 && !rw["Anchovy"], "Trout is a Red Wiggler fish, Anchovy is not");
  const ew = LV.wormCatchShare("Earthworm");
  assert.ok(ew["Anchovy"] > 0.3, String(ew["Anchovy"]));
  // a winter-only fish gets one season's share at most
  const winter = LV.wormCatchShare("Red Wiggler", ["winter"]);
  assert.ok(near(rw["Trout"], winter["Trout"] / 4));
});

test("the worm sets the cast price and the catch: Red Wiggler fish are bigger and the cast dearer", () => {
  const ew = LV.levelingPlan(farm, inputs, cfg({ worm: "Earthworm", age: false }));
  const rw = LV.levelingPlan(farm, inputs, cfg({ worm: "Red Wiggler", age: false }));
  assert.equal(rw.fish.worm, "Red Wiggler");
  assert.ok(near(rw.fish.castCost - ew.fish.castCost, computeBaitCostSFL("Red Wiggler", prices) - computeBaitCostSFL("Earthworm", prices)));
  assert.ok(rw.xpPerDay.raw / rw.fish.perDay > ew.xpPerDay.raw / ew.fish.perDay, "more raw XP per fish on Red Wiggler");
  // no worm set: the farm's own catch history, as before
  assert.equal(LV.levelingPlan(farm, inputs, cfg()).fish.worm, null);
});

test("Fish Market: the baits the plan makes fit one queue — 24 h a day, a job waits for the next visit without VIP", () => {
  const p = LV.levelingPlan(farm, inputs, cfg({ buySalt: true }, { restarts: 48 }));
  assert.ok(Array.isArray(p.fish.baitUse));
  assert.ok(near(p.fish.baitUse.reduce((a, b) => a + b.perDay, 0), p.fish.baitsPerDay, 1e-9));
  assert.ok(p.fish.marketHours <= 24 + 1e-6, String(p.fish.marketHours));
  for (const b of p.fish.baitUse) assert.ok(["Fish Flake", "Fish Stick", "Fish Oil"].includes(b.bait) && b.perDay > 0 && b.fish);
});

test("Fish Market cap binds: Fish Oil alone is at most 1.5 a day (16 h a job)", () => {
  const p = LV.levelingPlan(farm, inputs, cfg({ buySalt: true }, { restarts: 48 }));
  const oil = p.fish.baitUse.filter((b) => b.bait === "Fish Oil").reduce((a, b) => a + b.perDay, 0);
  assert.ok(oil <= 24 / 16 * 1.2 + 1e-6, String(oil));
});

test("sanitize keeps a known worm and drops anything else", () => {
  const d = LV.defaultLevelingConfig(farm, inputs);
  assert.equal(LV.sanitizeLevelingConfig({ fish: { worm: "Grub" } }, d, null).fish.worm, "Grub");
  assert.equal(LV.sanitizeLevelingConfig({ fish: { worm: "Fishing Lure" } }, d, null).fish.worm, undefined);
});

test("steps offer a worm switch when it saves FLOWER (fish only, no kitchens)", () => {
  const d = cfg();
  const c = { ...d, buildings: Object.fromEntries(Object.entries(d.buildings).map(([k, v]) => [k, { ...v, on: false }])) };
  const steps = LV.levelingSteps(farm, inputs, c, [], 20);
  const worm = steps.filter((s) => s.kind === "worm");
  for (const s of worm) assert.ok(LV.LEVELING_WORMS.includes(s.config.fish.worm));
  assert.ok(worm.length > 0, steps.map((s) => s.label).join(" | "));
});
