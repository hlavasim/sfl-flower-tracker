import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { shrineStatuses, _shrineActiveNow } from "../../core/engine/power-costs.mjs";
import { roadmapAnimalCapacity, _setPowerContext, _getPowerContext } from "../../core/engine/roadmap.mjs";

/*
 * Revision 2026-09-22, the leftovers the per-area fix passes could not reach (their files were
 * outside scope). Each test failed on the code before its fix.
 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const wrap = JSON.parse(readFileSync(path.join(ROOT, "tests/fixtures/farm-155498.json"), "utf8"));
const farm = wrap.farm || wrap;
const clone = (o) => JSON.parse(JSON.stringify(o));

/** The fixture farm with one collectible moved from the land into the house's ground floor. */
function movedIndoors(name) {
  const f = clone(farm);
  const inst = f.collectibles[name];
  assert.ok(inst && inst.length, `the fixture has ${name} placed on the land`);
  delete f.collectibles[name];
  f.interior = f.interior || {};
  f.interior.ground = f.interior.ground || {};
  f.interior.ground.collectibles = { ...(f.interior.ground.collectibles || {}), [name]: inst };
  return f;
}

// ── 1. "Is it placed" reads all four maps (findCollectible), not just land + legacy home ──

test("a shrine placed in the house interior keeps its status (not 'never')", () => {
  const before = shrineStatuses(farm).find((s) => s.name === "Mole Shrine");
  assert.notEqual(before.kind, "never", "the fixture's Mole Shrine is placed on the land");
  const indoors = shrineStatuses(movedIndoors("Mole Shrine")).find((s) => s.name === "Mole Shrine");
  assert.equal(indoors.kind, before.kind, "moving it indoors must not make it vanish");
});

test("_shrineActiveNow sees a shrine on the interior's upper floor", () => {
  const f = clone(farm);
  const now = Date.now();
  f.interior = { level_one: { collectibles: { "Badger Shrine": [{ id: "x", createdAt: now - 3600000, coordinates: { x: 0, y: 0 } }] } } };
  delete f.collectibles["Badger Shrine"];
  assert.equal(_shrineActiveNow(f, "Badger Shrine"), true, "a 1-hour-old shrine upstairs is active");
});

test("a Chicken Coop placed indoors still raises the hen house capacity on the roadmap", () => {
  const f = clone(farm);
  f.henHouse = { level: 2, animals: {} };
  for (const k of ["collectibles"]) delete f[k]["Chicken Coop"];
  if (f.home && f.home.collectibles) delete f.home.collectibles["Chicken Coop"];
  const prev = _getPowerContext();
  try {
    _setPowerContext({ farm: f });
    const without = roadmapAnimalCapacity("chickens").total;
    f.interior = { ground: { collectibles: { "Chicken Coop": [{ id: "c", createdAt: 1, coordinates: { x: 1, y: 1 } }] } } };
    const withCoop = roadmapAnimalCapacity("chickens").total;
    assert.equal(withCoop - without, 10, "Chicken Coop adds 5 per hen house level (level 2 → +10)");
  } finally { _setPowerContext(prev); }
});

// ── 2. D12: the crop machine applies crop YIELD boosts per seed (harvestCropMachine.ts) ──
import { buildPowerSection } from "../../core/sections/power.mjs";
import { buildRoadmapSection } from "../../core/sections/roadmap.mjs";
import { calcCropMachineDaily } from "../../core/engine/crop-machine.mjs";
import { cmGetSeedRestockCount } from "../../core/engine/roadmap.mjs";
import { CROP_GROW_DATA } from "../../core/engine/power-boosts.mjs";

const p2pFix = JSON.parse(readFileSync(path.join(ROOT, "tests/fixtures/p2p-prices.json"), "utf8"));
const nftsFix = JSON.parse(readFileSync(path.join(ROOT, "tests/fixtures/nfts-sample.json"), "utf8"));

test("calcCropMachineDaily counts crops per seed; seeds (not crops) are what cost coins", () => {
  const er = { coinsPerSFL: 100 };
  const one = calcCropMachineDaily(farm, "Sunflower", { Sunflower: 0.01 }, er, false);
  const boosted = calcCropMachineDaily(farm, "Sunflower", { Sunflower: 0.01 }, er, false, 1.5);
  assert.ok(Math.abs(boosted.revenue - one.revenue * 1.5) < 1e-9, "revenue scales with crops per seed");
  assert.ok(Math.abs(boosted.cropsPerDay - one.cropsPerDay * 1.5) < 1e-9, "crops per day scales too");
  assert.equal(boosted.seedsPerDay, one.seedsPerDay, "the machine still plants the same seeds");
  assert.ok(Math.abs(boosted.seedCostPerDay - one.seedCostPerDay) < 1e-12, "seed cost follows seeds, not crops");
});

test("the roadmap's CROP MACHINE rows use the Power panel's crops per seed", () => {
  const pw = buildPowerSection(farm, p2pFix, nftsFix, null, {});
  const cm = pw.cropMachine;
  assert.ok(cm && cm.rows.some((r) => r.yieldPerSeed !== 1), "the fixture has a crop yield boost on the machine");
  const out = buildRoadmapSection([], { roadmapSettings: {}, farm, p2p: p2pFix });
  const rows = out.profitability.groups.find((g) => g.id === "cropMachine").rows;
  assert.ok(rows.length > 0, "the roadmap lists crop machine crops");
  const rpd = 2;   // roadmap default restocks per day
  for (const row of rows) {
    const pr = cm.rows.find((r) => r.crop === row.label);
    const seedsPerDay = 86400 * cm.plots / (CROP_GROW_DATA[row.label] * cm.speedMult);
    const seeds = Math.min(seedsPerDay, rpd * cmGetSeedRestockCount(farm, row.label));
    const want = seeds * pr.yieldPerSeed * pr.price;
    assert.ok(Math.abs(row.gross - want) <= Math.max(1e-6, want * 2e-3),
      `${row.label}: roadmap gross ${row.gross.toFixed(4)} ≠ seeds × ${pr.yieldPerSeed} × price = ${want.toFixed(4)}`);
  }
});

test("every Crop Machine queue on the page is priced with the server's crops per seed", () => {
  const src = readFileSync(path.join(ROOT, "flowers.html"), "utf8");
  const calls = [...src.matchAll(/cmSimulateQueue\(([^;\n]*)\);/g)].map((m) => m[1]);
  assert.ok(calls.length >= 3, `found the queue call sites (${calls.length})`);
  for (const args of calls) {
    const n = args.split(",").length;
    assert.equal(n, 6, `cmSimulateQueue(${args}) must pass the yield map as its 6th argument`);
  }
});

// ── 3. "<Crop> Plot Growth Time" is a grow-TIME boost (plant.ts), not a yield cut ──
import { parseBoostEffects } from "../../core/engine/power-boosts.mjs";

test("Cabbage Girl and the other '<Crop> Plot Growth Time' items parse as grow-time boosts", () => {
  // Texts as sfl.world ships them; plant.ts multiplies the crop's grow seconds for each.
  const cases = [
    ["Cabbage Girl", "-50% Cabbage Plot Growth Time", "Cabbage", -50],
    ["Giant Zucchini", "-50% Zucchini Plot Growth Time", "Zucchini", -50],
    ["Broccoli Hat", "-50% Broccoli Plot Growth Time", "Broccoli", -50],
    ["Carrot Amulet", "-20% Carrot Plot Growth time", "Carrot", -20],
  ];
  for (const [name, text, product, value] of cases) {
    const eff = parseBoostEffects(text, name);
    assert.deepEqual(eff.map((e) => [e.type, e.cat, e.product, e.value]), [["speed_pct", "crops", product, value]],
      `${name}: ${JSON.stringify(eff)}`);
  }
});

test("the page's boost parser strips 'Plot' the same way", () => {
  const fix = String.raw`const prod = m[2].trim().replace(/\s+Plot$/i, "");`;
  assert.ok(readFileSync(path.join(ROOT, "flowers.html"), "utf8").includes(fix), "flowers.html");
  assert.ok(readFileSync(path.join(ROOT, "core/engine/power-boosts.mjs"), "utf8").includes(fix), "core");
});
