import { test } from "node:test";
import assert from "node:assert";
import { FERTILISER_EFFECTS, COMPOSTER_CYCLE, COMPOST_RECIPES } from "../../core/data/crafting.mjs";

/*
 * The app priced fertilisers but modelled no effect, so "is a composter worth its yield bonus"
 * had no bonus side to weigh, and the whole Compost skill tree valued at 0 (Sprout Surge
 * included). These pin the numbers against the game source they were read from, because the
 * temptation with a table like this is to round it or infer the missing entry.
 */
test("fertiliser effects match the game source", () => {
  // harvest.ts: amount += 0.2 for Sprout Mix / Sproutroot Surprise.
  assert.equal(FERTILISER_EFFECTS["Sprout Mix"].value, 0.2);
  assert.equal(FERTILISER_EFFECTS["Sprout Mix"].kind, "yield_flat");
  assert.equal(FERTILISER_EFFECTS["Sprout Mix"].cat, "crops");
  // Same module: a second `amount += 0.2` when Knowledge Crab is built — it DOUBLES the mix,
  // a synergy the app knew nothing about.
  assert.equal(FERTILISER_EFFECTS["Sprout Mix"].doubledBy, "Knowledge Crab");
  assert.deepEqual(FERTILISER_EFFECTS["Sproutroot Surprise"], FERTILISER_EFFECTS["Sprout Mix"],
    "the source treats the two identically");

  // types/fertilisers.ts: base fruit-patch yield 0.1, before the Fruitful Bounty multiplier.
  assert.equal(FERTILISER_EFFECTS["Fruitful Blend"].value, 0.1);
  assert.equal(FERTILISER_EFFECTS["Fruitful Blend"].cat, "fruits");
  assert.equal(FERTILISER_EFFECTS["Fruitful Blend"].skillMultiplier, "Fruitful Bounty");

  // plant.ts: seconds = seconds * 0.5 — a growth multiplier, NOT a yield add. Getting this
  // wrong would double-count it as extra output instead of a faster cycle.
  assert.equal(FERTILISER_EFFECTS["Rapid Root"].kind, "growth_mult");
  assert.equal(FERTILISER_EFFECTS["Rapid Root"].value, 0.5);
  assert.equal(FERTILISER_EFFECTS["Rapid Root"].legacyOnly, true,
    "flagged: under SPEED_BOOSTS it is a windowed 2x, not a flat halving, so this overstates it");
});

test("every fertiliser a composter produces has a known effect, and vice versa", () => {
  /*
   * The gap this closes: a composter output with no effect entry is a silent zero — exactly how
   * the model looked before. Baits (Earthworm, Grub, Red Wiggler) are fishing items, not
   * fertilisers, so they are excluded rather than left to look like an omission.
   */
  const BAITS = new Set(["Earthworm", "Grub", "Red Wiggler"]);
  const produced = new Set();
  for (const d of Object.values(COMPOST_RECIPES)) {
    for (const out of Object.keys(d.outputs)) if (!BAITS.has(out)) produced.add(out);
  }
  assert.ok(produced.size >= 3, `expected the three fertilisers, got ${[...produced].join(", ")}`);
  for (const f of produced) {
    assert.ok(FERTILISER_EFFECTS[f], `${f} is produced but has no modelled effect`);
  }
  // Sproutroot Surprise is not composted (it is a reward item), so the reverse check allows it.
  for (const f of Object.keys(FERTILISER_EFFECTS)) {
    assert.ok(produced.has(f) || f === "Sproutroot Surprise", `${f} has an effect but nothing makes it`);
  }
});

test("composter cycles are present for every composter, in hours", () => {
  for (const name of Object.keys(COMPOST_RECIPES)) {
    const c = COMPOSTER_CYCLE[name];
    assert.ok(c && c.hours > 0, `${name} has no cycle time`);
  }
  // composterDetails: 6h / 8h / 12h. The batch SIZE stays in COMPOST_RECIPES.outputs, so the
  // two tables must not disagree about which composters exist.
  assert.equal(COMPOSTER_CYCLE["Compost Bin"].hours, 6);
  assert.equal(COMPOSTER_CYCLE["Turbo Composter"].hours, 8);
  assert.equal(COMPOSTER_CYCLE["Premium Composter"].hours, 12);
  assert.deepEqual(Object.keys(COMPOSTER_CYCLE).sort(), Object.keys(COMPOST_RECIPES).sort());
});
