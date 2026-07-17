import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { buildPricesSection } from "../../core/sections/prices.mjs";
import { itemMarketValue } from "../../core/engine/item-value.mjs";

const wrap = JSON.parse(readFileSync(new URL("../fixtures/farm-155498.json", import.meta.url)));
const farm = wrap.farm || wrap;
const p2p = JSON.parse(readFileSync(new URL("../fixtures/p2p-prices.json", import.meta.url)));
const S = { coinsPerSFL: 1061.0079575596817 };

test("both maps are populated over the item universe", () => {
  const p = buildPricesSection(farm, p2p, S);
  assert.ok(Object.keys(p.marketValue).length > 250, `marketValue ${Object.keys(p.marketValue).length}`);
  assert.ok(Object.keys(p.productionCost).length > 50, `productionCost ${Object.keys(p.productionCost).length}`);
});

test("an unpriceable item is ABSENT, never 0 — callers must tell unknown from free", () => {
  const p = buildPricesSection(farm, p2p, S);
  assert.equal("Definitely Not An Item" in p.marketValue, false);
  // Mushroom is unpriced by BOTH resolvers today (spec §1) — it must not appear as 0.
  assert.equal(p.marketValue["Mushroom"], undefined);
});

test("the maps agree with the engine item by item", () => {
  const p = buildPricesSection(farm, p2p, S);
  for (const [name, v] of Object.entries(p.marketValue)) {
    assert.equal(v, itemMarketValue(name, p2p, null, S), `marketValue[${name}]`);
  }
});

// Why this does NOT assert which of the two Salt numbers is larger:
// the direction is FARM-DEPENDENT. Farm 155498 has Wide Rakes + the Deep Sea Salt Cave
// Background (yield 10 -> 17) and Cheap Rakes + Salt Sculpture L6 (coin mult 1 -> 0.72),
// so raking is CHEAPER than the market here (0.003216 < 0.004161); an unboosted farm is
// the other way round (0.005995 > 0.004161). A player flips the inequality by acquiring
// skills. An earlier draft of this test asserted `productionCost > marketValue`, which was
// an artifact of measuring `_resolveItemSfl` WITHOUT `extras` — i.e. pricing a farm that
// does not exist. Pin the semantic instead: plant an absurd market price and see who moves.
test("productionCost ignores the market; marketValue follows it — the two questions stay two", () => {
  const p = buildPricesSection(farm, p2p, S);
  const absurd = buildPricesSection(farm, { ...p2p, Salt: 999 }, S);

  // marketValue tracks the market — that IS market-first.
  assert.equal(p.marketValue["Salt"], p2p["Salt"]);
  assert.equal(absurd.marketValue["Salt"], 999);

  // ...productionCost does not budge: you rake your own Salt, so the price is irrelevant.
  // Collapse the two questions into one and this fails.
  assert.equal(absurd.productionCost["Salt"], p.productionCost["Salt"]);

  // And they genuinely differ — whichever happens to be larger on this farm.
  assert.notEqual(p.productionCost["Salt"], p.marketValue["Salt"]);
});

// productionCost is PER-FARM. The bug that produced the wrong number above was exactly a
// silent failure to pass `extras`, which fell back to SALT_BASE_YIELD/mult 1 and priced a
// farm that does not exist — with no test noticing. So pin that the farm's rake boosts
// really reach the Salt branch. Expected values are derived from the SALT_RAKE_COST data
// table (20 coins + 3 Wood) and the documented boost rules, NOT by running the composer.
test("productionCost['Salt'] really uses the farm's rake extras, not the unboosted defaults", () => {
  const boosted = buildPricesSection(farm, p2p, S);
  // Strip every Salt-relevant boost: Wide Rakes (+2 yield), the Deep Sea Salt Cave
  // Background wearable (+5 yield), Cheap Rakes (x0.80 coins), Salt Sculpture L4+ (x0.90).
  const unboostedFarm = JSON.parse(JSON.stringify(farm));
  unboostedFarm.bumpkin.skills = {};
  unboostedFarm.bumpkin.equipped = {};
  delete unboostedFarm.sculptures;
  const unboosted = buildPricesSection(unboostedFarm, p2p, S);

  // Unboosted: yield = SALT_BASE_YIELD (10), coin mult = 1.
  const wantUnboosted = ((20 * 1) / S.coinsPerSFL + p2p["Wood"] * 3) / 10;
  assert.ok(Math.abs(unboosted.productionCost["Salt"] - wantUnboosted) < 1e-9,
    `unboosted Salt was ${unboosted.productionCost["Salt"]}, expected ${wantUnboosted}`);

  // Farm 155498: yield = 10 + 2 (Wide Rakes) + 5 (Deep Sea Salt Cave Background) = 17;
  // coin mult = 0.80 (Cheap Rakes) * 0.90 (Salt Sculpture L6) = 0.72.
  const wantBoosted = ((20 * 0.72) / S.coinsPerSFL + p2p["Wood"] * 3) / 17;
  assert.ok(Math.abs(boosted.productionCost["Salt"] - wantBoosted) < 1e-9,
    `boosted Salt was ${boosted.productionCost["Salt"]}, expected ${wantBoosted}`);

  // The two must actually differ, or neither assertion above proves the extras arrived.
  assert.notEqual(boosted.productionCost["Salt"], unboosted.productionCost["Salt"]);
});
