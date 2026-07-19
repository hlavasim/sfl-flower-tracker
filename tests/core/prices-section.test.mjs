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

test("the maps agree with the engine item by item", async () => {
  const { computePotionTicketCoinCost } = await import("../../core/engine/item-value.mjs");
  const p = buildPricesSection(farm, p2p, S);
  // C7: the section injects the farm-derived potion-ticket cost into the rates it hands
  // the resolver — the direct engine call must mirror that to compare like for like.
  const rates = { ...S, potionTicketCoinCost: computePotionTicketCoinCost(farm) };
  for (const [name, v] of Object.entries(p.marketValue)) {
    assert.equal(v, itemMarketValue(name, p2p, null, rates), `marketValue[${name}]`);
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

// task-TRACE3: settings.explain attaches marketTrace/productionTrace maps. The trace's top
// `value` is asserted equal to the corresponding map value for EVERY item in the maps — the
// property that makes the explanation trustworthy (spec §5). This is not tautological for
// the FORMULA text (a separate field the resolver could still get wrong) but IS expected to
// hold for `value` by construction, since buildPricesSection passes one sink into the exact
// call that produces the map entry rather than deriving the trace from a second call.
test("explain mode attaches traces whose values equal the map values", () => {
  const p = buildPricesSection(farm, p2p, { coinsPerSFL: 1061.0079575596817, explain: true });
  assert.ok(p.marketTrace && p.productionTrace, "traces present in explain mode");
  for (const [item, node] of Object.entries(p.marketTrace)) {
    assert.equal(node.value, p.marketValue[item], `marketTrace[${item}] value must equal the map`);
  }
  for (const [item, node] of Object.entries(p.productionTrace)) {
    assert.equal(node.value, p.productionCost[item], `productionTrace[${item}] value must equal the map`);
  }
});

test("no explain flag → no traces, map byte-identical to today", () => {
  const p = buildPricesSection(farm, p2p, { coinsPerSFL: 1061.0079575596817 });
  assert.equal(p.marketTrace, undefined);
  assert.equal(p.productionTrace, undefined);
  assert.equal(Object.keys(p.marketValue).length, 352);
});

// Bounding the explain payload: only DERIVED items (method !== "market price") get a trace
// entry — a bare P2P lookup needs no explanation. Milk is priced directly off the fixture's
// p2p map (a "market price" leaf), so it must be ABSENT from both trace maps even though it
// is present (and > 0) in both value maps. Cheese has no direct p2p entry in the fixture, so
// both resolvers must derive it and therefore trace it.
test("explain trace maps are bounded to derived items — bare market-price items are excluded", () => {
  const p = buildPricesSection(farm, p2p, { coinsPerSFL: 1061.0079575596817, explain: true });
  assert.ok(p.marketValue["Milk"] > 0, "sanity: Milk must be priced");
  assert.equal("Milk" in p.marketTrace, false, "Milk is a bare market-price lookup, must not be traced");
  assert.equal("Cheese" in p.marketTrace, true, "Cheese is derived (crafted recipe), must be traced");
  assert.equal("Cheese" in p.productionTrace, true, "Cheese is derived (cooking recipe), must be traced");
});

// Formula spot-check, hand-computed independently of the code under test (per spec §5 — a
// value-equals-map assertion alone cannot catch a wrong FORMULA string, only a wrong VALUE).
// core/data/crafting.mjs's CRAFTED_INGREDIENT_RECIPES pins "Cheese": { "Milk": 3 }; the
// fixture's p2p map prices Milk at 0.11007 (tests/fixtures/p2p-prices.json). item-value.mjs's
// crafted-recipe branch formats a single-ingredient formula as "<qty> × <ingredient> @
// <price.toFixed(5)>" with no join separator needed for one term, so the hand-computed
// expectation is "3 × Milk @ 0.11007" with value 3 × 0.11007 = 0.33021 — computed here from
// the raw fixture data, never by calling buildPricesSection/itemMarketValue.
test("Cheese's marketTrace formula matches the hand-computed crafted-recipe derivation", () => {
  const p = buildPricesSection(farm, p2p, { coinsPerSFL: 1061.0079575596817, explain: true });
  const milkPrice = p2p["Milk"];
  const wantValue = 3 * milkPrice;
  const wantFormula = `3 × Milk @ ${milkPrice.toFixed(5)}`;
  const node = p.marketTrace["Cheese"];
  assert.ok(node, "Cheese must have a marketTrace entry");
  assert.equal(node.method, "crafted recipe");
  assert.equal(node.formula, wantFormula);
  assert.equal(node.value, wantValue);
  assert.equal(node.value, p.marketValue["Cheese"]);
  // Recursive: the child step for Milk itself is a bare market-price leaf.
  assert.ok(Array.isArray(node.steps) && node.steps.length === 1);
  assert.equal(node.steps[0].item, "Milk");
  assert.equal(node.steps[0].method, "market price");
  assert.equal(node.steps[0].value, milkPrice);
});

// C7 (audit): exotic crops price via the farm's own Potion House history. Fixture farm
// 155498's histogram averages 80.526/100 → 320 / (50×0.80526) = 7.9477 c/ticket
// (vs the old hardcoded 15 — which overstated Black Magic by ~89%).
test("C7 — potion ticket cost derives from potionHouse.history; Black Magic repriced", async () => {
  const { computePotionTicketCoinCost } = await import("../../core/engine/item-value.mjs");
  const cost = computePotionTicketCoinCost(farm);
  assert.ok(Math.abs(cost - 320 / (50 * (1530 / 19 / 100))) < 1e-9, `cost ${cost}`);
  assert.ok(Math.abs(cost - 7.9477) < 0.001);
  // floor for farms with no history — and the floor is source-proven 6.4
  assert.equal(computePotionTicketCoinCost({}), 6.4);
  assert.equal(computePotionTicketCoinCost({ potionHouse: { history: { 0: 5 } } }), 6.4);
  // the map uses it: Black Magic = 8000 × cost / coinsPerSFL
  const p = buildPricesSection(farm, p2p, S);
  const expected = (8000 * cost) / S.coinsPerSFL;
  assert.ok(Math.abs(p.marketValue["Black Magic"] - expected) < 1e-9, `BM ${p.marketValue["Black Magic"]} vs ${expected}`);
});
