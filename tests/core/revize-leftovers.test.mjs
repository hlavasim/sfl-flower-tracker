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
