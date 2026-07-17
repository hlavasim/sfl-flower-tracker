import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { buildPricesSection } from "../../core/sections/prices.mjs";
import { itemMarketValue } from "../../core/engine/item-value.mjs";
import * as pets from "../../core/data/pets.mjs";

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

// item-value.mjs prices Mark/Love Charm/Acorn/Barn Delight through hardcoded
// `itemName === "X"` branches with no data-table backing — buildItemUniverse used to
// have no way to discover these names, so they were silently ABSENT from the served
// map even though they're priceable (task-F2-1d-fix-report.md). Expected values below
// are derived independently of buildPricesSection/itemMarketValue, straight from the
// resolver's documented formulas + fixture data, not by running the code under test:
//   Mark: fixed 0.01 SFL (item-value.mjs:157)
//   Love Charm: fixed 1/50 SFL (item-value.mjs:101)
//   Barn Delight: 5*Lemon + 3*Honey (item-value.mjs:46-49)
//   Acorn: max over PET_FETCH_DATA of (p2p[res]/energy) * 100, excluding Acorn itself
//     (item-value.mjs:159-170) — independently walked here, not called through the resolver.
test("Mark/Love Charm/Acorn/Barn Delight are present in the served map with the resolver's values", () => {
  const p = buildPricesSection(farm, p2p, S);

  assert.equal(p.marketValue["Mark"], 0.01);
  assert.equal(p.marketValue["Love Charm"], 1 / 50);

  const wantBarnDelight = 5 * p2p["Lemon"] + 3 * p2p["Honey"];
  assert.equal(p.marketValue["Barn Delight"], wantBarnDelight);

  let bestRatio = 0;
  for (const entries of Object.values(pets.PET_FETCH_DATA)) {
    for (const e of entries) {
      if (e.res === "Acorn") continue;
      const price = p2p[e.res] || 0;
      if (price > 0) bestRatio = Math.max(bestRatio, price / e.energy);
    }
  }
  const wantAcorn = bestRatio * 100;
  assert.equal(p.marketValue["Acorn"], wantAcorn);
  assert.ok(wantAcorn > 0, "sanity: the independent Acorn derivation must be nonzero given this fixture");
});

// Omnifeed is also a hardcoded branch (item-value.mjs:133) but this fixture's settings
// (S, above) carry no gemsPerSFL rate, so the resolver legitimately cannot price it.
// It must be considered — not silently defaulted to 0 — and end up ABSENT either way.
// This is the "absence ≠ zero" contract applied to a hardcoded-branch item specifically.
test("Omnifeed (a hardcoded-branch item) is still absent, not 0, when unpriceable", () => {
  const p = buildPricesSection(farm, p2p, S);
  assert.equal("Omnifeed" in p.marketValue, false);
  assert.equal(p.marketValue["Omnifeed"], undefined);
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

// The whole reason `rates` exists as a parameter: marks/deliveries pass none, dashboard
// passes dashRates, roadmap exchangeRates, ROI all five — and the resulting SFL values
// genuinely differ across those profiles (task-F2-2a brief, measured 2026-07-17). Pin
// that buildPricesSection's third argument really is forwarded as the full rates object,
// not just coinsPerSFL, using expectations derived from the treasure table and the boost
// factor directly — never by running buildPricesSection/itemMarketValue itself.
test("treasureBoost changes treasure prices — the rates parameter is load-bearing", () => {
  const bare = buildPricesSection(farm, p2p, { coinsPerSFL: 1061.0079575596817 });
  const boosted = buildPricesSection(farm, p2p, { coinsPerSFL: 1061.0079575596817, treasureBoost: 1.2 });
  // Pirate Bounty: confirmed present in TREASURE_SELL_PRICES (core/data/crafting.mjs) and
  // priced by the `TREASURE_SELL_PRICES[itemName] * (rates.treasureBoost || 1)` branch
  // (core/engine/item-value.mjs) — not derived by running either resolver.
  const t = "Pirate Bounty";
  assert.ok(bare.marketValue[t] > 0, `${t} must be priced at all`);
  assert.ok(Math.abs(boosted.marketValue[t] - bare.marketValue[t] * 1.2) < 1e-9,
    `boosted ${boosted.marketValue[t]} != bare ${bare.marketValue[t]} * 1.2`);
});

test("sflPerXP makes fish priceable that otherwise are not", () => {
  const bare = buildPricesSection(farm, p2p, { coinsPerSFL: 1061.0079575596817 });
  const withXp = buildPricesSection(farm, p2p, { coinsPerSFL: 1061.0079575596817, sflPerXP: 0.0001 });
  const fishOnlyInXp = Object.keys(withXp.marketValue).filter((k) => !(k in bare.marketValue));
  assert.ok(fishOnlyInXp.length > 0, "sflPerXP must unlock items that are otherwise unpriceable");
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
