import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import {
  computeRecipeCost,
  computeSaltYieldPerRake,
  computeSaltRakeCoinMult,
  computeFishYieldPerCast,
} from "../../core/engine/cooking-cost.mjs";
import { computeRodCostSFL, itemProductionCost, itemMarketValue, computeFishEffectiveCost, computeWaterTrapCostSFL } from "../../core/engine/item-value.mjs";

const wrap = JSON.parse(readFileSync(new URL("../fixtures/farm-155498.json", import.meta.url)));
const farm = wrap.farm || wrap;
const skills = farm.bumpkin?.skills || {};

// P2P price snapshot from sfl.world/api/v1/prices, taken at the same prices the
// Bumpkin baseline (.superpowers/sdd/bumpkin-baseline-155498.md) was captured at.
const p2p = JSON.parse(readFileSync(new URL("../fixtures/p2p-prices.json", import.meta.url)));

// Betty coin rate the page uses = max(sellCoins/p2p) over BETTY_SELL_PRICES,
// which for this snapshot is Celestine (200 coins / 0.1885 SFL). The baseline
// documents this exact rate, so it is pinned here rather than recomputed.
const COINS_PER_SFL = 1061.0079575596817;

test("salt yield per rake is a positive number", () => {
  assert.ok(computeSaltYieldPerRake(farm) >= 10);
});

test("recipe cost returns a total and item list", () => {
  const rc = computeRecipeCost("Pizza Margherita", {}, 0, skills, {});
  assert.ok(rc && Array.isArray(rc.items));
});

// ── Baseline gate: these five numbers came from the LIVE inline flowers.html
// Bumpkin page (farm 155498, Betty/Celestine rate). The extracted module must
// reproduce them or the extraction changed the economics.
test("default recipes reproduce the live Bumpkin page Cost/cook", () => {
  const expected = {
    "Pizza Margherita": 2.08,    // Fire Pit
    "Spaghetti al Limone": 1.27, // Kitchen
    "Lemon Cheesecake": 2.68,    // Bakery
    "Honey Cheddar": 1.49,       // Deli
    "Sour Shake": 0.1907,        // Smoothie Shack
  };
  for (const [recipe, want] of Object.entries(expected)) {
    const rc = computeRecipeCost(recipe, p2p, COINS_PER_SFL, skills, {});
    assert.ok(rc && !rc.hasUnpriced, `${recipe} should be fully priced`);
    assert.ok(
      Math.abs(rc.total - want) < 0.005,
      `${recipe} cost was ${rc.total}, expected ~${want} (live page)`
    );
  }
});

// Tight pin on the headline recipe — catches drift the 0.005 tolerance would hide.
test("Pizza Margherita cost is exact against the price fixture", () => {
  const rc = computeRecipeCost("Pizza Margherita", p2p, COINS_PER_SFL, skills, {});
  assert.ok(Math.abs(rc.total - 2.0828476) < 1e-6, `total was ${rc.total}`);
  // 30 Tomato @ P2P + 5 Cheese (no P2P → recursed to Milk x3) + 20 Wheat @ P2P
  const byName = Object.fromEntries(rc.items.map((i) => [i.name, i]));
  assert.equal(byName["Tomato"].source, "P2P");
  assert.equal(byName["Wheat"].source, "P2P");
  assert.equal(byName["Cheese"].source, "recipe");
  assert.ok(Math.abs(byName["Cheese"].price - p2p["Milk"] * 3) < 1e-9);
});

// The five default recipes never touch the fish/bait branches of the resolver,
// so exercise those explicitly — they are the bulk of the extracted closure.
test("fish ingredients resolve through the fishing cost model", () => {
  const rc = computeRecipeCost("Chowder", p2p, COINS_PER_SFL, skills, {});
  const anchovy = rc.items.find((i) => i.name === "Anchovy");
  assert.equal(anchovy.source, "fish", "Anchovy should price via FISH_DATA");
  assert.ok(anchovy.price > 0);
  assert.ok(anchovy.fc && anchovy.fc.fd.bait === "Earthworm", "cheapest Anchovy path uses Earthworm bait");
});

test("rod cost per cast = coins/rate + materials, Reel Deal halves the coin part", () => {
  const plain = computeRodCostSFL(p2p, COINS_PER_SFL, {});
  const reel = computeRodCostSFL(p2p, COINS_PER_SFL, { "Reel Deal": true });
  const mats = p2p["Wood"] * 3 + p2p["Stone"] * 1;
  assert.ok(Math.abs(plain - (20 / COINS_PER_SFL + mats)) < 1e-9, `rod was ${plain}`);
  assert.ok(Math.abs(reel - (10 / COINS_PER_SFL + mats)) < 1e-9, `rod w/ Reel Deal was ${reel}`);
});

test("Salt prices off the rake cost and honours yield/coin-mult extras", () => {
  const extras = { saltYieldPerRake: 12, saltRakeCoinMult: 0.8 };
  const rc = computeRecipeCost("Aged Tuna", p2p, COINS_PER_SFL, skills, extras);
  // Task 5b: Aged Fish recipes are now generated into COOKING_INGREDIENTS, so this
  // resolves (fixes Task 7 concern 1, which pinned this as null).
  assert.ok(rc, "Aged Tuna cost should resolve now that Aged recipes exist");
  assert.ok(!rc.hasUnpriced, "Aged Tuna should be fully priced (fish priced as caught, salt via rake cost)");
  const byName = Object.fromEntries(rc.items.map((i) => [i.name, i]));
  // Tuna is forceable with a Wild Mushroom chum for pennies, so the caught price is the fishing
  // route, not a Fish Stick — see the aging-shed block at the end of this file for the other half.
  assert.equal(byName["Tuna"].source, "fish", "Aging Shed fish is priced as it is actually caught");
  assert.equal(byName["Salt"].source, "salt");
  // Aged Tuna needs 12 Salt: baseXP=200 -> maxXP=600 -> saltCost=round(600/50)=12.
  assert.equal(byName["Salt"].qty, 12, `Salt qty was ${byName["Salt"].qty}`);
  // Salt Rake cost = 20 coins * 0.8 coinMult / COINS_PER_SFL + 3 Wood (P2P), divided by
  // the 12-salt yield-per-rake extra (core/data/cooking.mjs SALT_RAKE_COST = 20 coins + 3 Wood).
  const saltRakeCost = ((20 * 0.8) / COINS_PER_SFL + p2p["Wood"] * 3) / 12;
  assert.ok(Math.abs(byName["Salt"].price - saltRakeCost) < 1e-9, `Salt price was ${byName["Salt"].price}`);
  assert.ok(rc.total > 0);
});

test("salt/fish yield helpers respond to skills and collectibles", () => {
  assert.equal(computeSaltYieldPerRake({ bumpkin: { skills: { "Wide Rakes": true } } }), 12);
  assert.equal(computeSaltRakeCoinMult({ bumpkin: { skills: { "Cheap Rakes": true } } }), 0.8);
  assert.ok(
    Math.abs(computeSaltRakeCoinMult({
      bumpkin: { skills: { "Cheap Rakes": true } },
      sculptures: { "Salt Sculpture": { level: 4 } },
    }) - 0.72) < 1e-9
  );
  assert.equal(computeFishYieldPerCast({ bumpkin: { skills: {} } }, "basic"), 1);
  assert.ok(
    Math.abs(computeFishYieldPerCast({ bumpkin: { skills: { "Fishy Chance": true } } }, "basic") - 1.1) < 1e-9
  );
});


/*
 * ── The Aging Shed prices its fish as they are actually GOT ──────────────────────────────
 *
 * The old model was one rod, and the fish you wanted appears: every fish came out at a fraction
 * of a cast and the whole shed looked free. There are really two ways to hold a named fish, and
 * which is cheaper is not a matter of taste:
 *
 *   A  fish for it — (rod + worm + chum) / the odds. Cheap when a chum pair forces it, ruinous
 *      when it does not: a Parrotfish at p=0.003 is 333 casts.
 *   B  force it with the Fish Market bait that lists it — one cast, no luck, but the bait is
 *      crafted out of other fish first.
 *
 * Both are priced, the cheaper wins, and the result is divided by what a cast YIELDS.
 */
const RODS = computeRodCostSFL(p2p, COINS_PER_SFL, skills);

test("a fish only a bait can force is priced through that bait, at the season you are in", () => {
  /*
   * White Shark has no chum pair at all (it is not in FISH_DATA), so route A does not exist and
   * only Crab Stick lists it. Before this it fell through every resolver and came back UNPRICED,
   * which made Aged White Shark — the biggest XP item in the game — look like the cheapest recipe
   * on the board at 9,872 XP/SFL, because only its salt was being counted.
   */
  const autumn = computeRecipeCost("Aged White Shark", p2p, COINS_PER_SFL, skills,
    { season: "autumn", fishYieldByTier: { expert: 1.2 } });
  const ws = autumn.items.find((i) => i.name === "White Shark");
  assert.equal(ws.source, "fish-bait", `route was ${ws.source}`);
  assert.equal(ws.via, "Crab Stick", "the bait that lists it");
  assert.ok(!autumn.hasUnpriced, "and the recipe is fully priced now");

  // Independently: rod + the autumn Crab Stick, divided by the fish a cast yields.
  const crab = itemProductionCost("Crab Stick", p2p, COINS_PER_SFL, skills, undefined, { season: "autumn" });
  assert.ok(Math.abs(ws.price - (RODS + crab.price) / 1.2) < 1e-9,
    `${ws.price} vs (rod ${RODS} + Crab Stick ${crab.price}) / 1.2`);

  /*
   * And the season is the point: Crab Stick's recipe changes with it, so the same fish costs
   * differently in winter. The cheapest season is a price you cannot pay today.
   */
  const winter = computeRecipeCost("Aged White Shark", p2p, COINS_PER_SFL, skills,
    { season: "winter", fishYieldByTier: { expert: 1.2 } });
  const wsW = winter.items.find((i) => i.name === "White Shark");
  assert.equal(wsW.source, "fish-bait");
  assert.ok(wsW.price > ws.price * 1.5,
    `winter's Crab Stick is far dearer than autumn's: ${wsW.price} vs ${ws.price}`);
  /*
   * Winter is not re-derived from a standalone Crab Stick price the way autumn is, and the
   * difference is the interesting part: winter's recipe contains an Oyster, whose own chum is
   * Fish Stick — so the bait's ingredients are FISH, priced as caught and divided by the yield
   * in their turn. A standalone bait price (no yield extras) therefore differs by ~0.1 SFL. What
   * must hold is that the cast is what gets divided.
   */
  assert.ok(Math.abs(wsW.price - wsW.castPrice / 1.2) < 1e-12, "the cast price is what is divided");
  assert.ok(wsW.castPrice > RODS, "and a cast costs the rod plus the bait, not the rod alone");
});

test("the cheaper of the two routes wins, fish by fish", () => {
  const extras = { season: "autumn", fishYieldByTier: { basic: 1.1, advanced: 1.1, expert: 1.2 } };
  const routeOf = (fish) => {
    const rc = computeRecipeCost("Aged " + fish, p2p, COINS_PER_SFL, skills, extras);
    return rc.items.find((i) => i.name === fish);
  };
  // Tuna: a Wild Mushroom chum forces it for pennies — no bait can beat that.
  assert.equal(routeOf("Tuna").source, "fish");
  // Parrotfish: no chum pair, 0.3% a cast at random, and Crab Stick lists it.
  const parrot = routeOf("Parrotfish");
  assert.equal(parrot.source, "fish-bait", `Parrotfish went ${parrot.source}`);
  const random = computeFishEffectiveCost("Parrotfish", p2p, COINS_PER_SFL, skills);
  assert.ok(random && parrot.price * 1.2 < random.sfl,
    `the bait beats 333 casts: ${parrot.price * 1.2} vs ${random.sfl}`);
  // Ray and Barred Knifejaw are the same shape.
  assert.equal(routeOf("Ray").source, "fish-bait");
  assert.equal(routeOf("Barred Knifejaw").source, "fish-bait");
});

test("a cast that yields more than one fish divides the price, exactly", () => {
  /*
   * Walrus, the seasonal collectible, Alba and the Fishy skills all add fish to a cast, and the
   * shed only ever eats one — so the cost of the fish it eats is the cast divided by the yield.
   */
  const one = computeRecipeCost("Aged Tuna", p2p, COINS_PER_SFL, skills, { season: "autumn" });
  const two = computeRecipeCost("Aged Tuna", p2p, COINS_PER_SFL, skills,
    { season: "autumn", fishYieldByTier: { expert: 2 } });
  const a = one.items.find((i) => i.name === "Tuna"), b = two.items.find((i) => i.name === "Tuna");
  assert.ok(Math.abs(a.price / 2 - b.price) < 1e-12, `${a.price} / 2 != ${b.price}`);
  assert.equal(b.yieldPerCast, 2, "and the divisor is reported, not hidden");
  assert.ok(Math.abs(b.castPrice - a.price) < 1e-12, "alongside what one cast cost");
  // Salt is untouched by any of this.
  assert.equal(one.items.find((i) => i.name === "Salt").cost, two.items.find((i) => i.name === "Salt").cost);
});

test("a bait's own ingredients are fished for, which is also what stops the recursion", () => {
  /*
   * Fish Flake is 4 Anchovy + 2 others, and Fish Flake is also what would force an Anchovy. If
   * the bait route applied inside a bait, pricing one would never terminate. Nested fish take
   * route A only — correct in its own right, since a bait's ingredients are the common fish you
   * simply catch.
   */
  const rc = computeRecipeCost("Aged Anchovy", p2p, COINS_PER_SFL, skills, { season: "autumn" });
  const anchovy = rc.items.find((i) => i.name === "Anchovy");
  assert.equal(anchovy.source, "fish", "an Anchovy is caught, not crafted out of Anchovies");
  const flake = itemProductionCost("Fish Flake", p2p, COINS_PER_SFL, skills, undefined, { season: "autumn" });
  assert.ok(flake && flake.price > 0, "and the bait itself still prices");
});

test("a pot catch costs the pot, which is consumed on every placement", () => {
  /*
   * placeWaterTrap does `inventory[waterTrap].sub(1)` and stamps exactly ONE crustacean as
   * caught, so the trap is a per-catch cost the way a rod is per cast — 250 coins + 5 Feather +
   * 3 Wool for a Crab Pot, 500 + 10 + 10 Merino for a Mariner Pot.
   *
   * Charging the chum alone made every crustacean exactly one pot too cheap, and left the two
   * chum-LESS ones (Isopod, Barnacle) unpriceable altogether — which in turn made Crab Stick
   * unpriceable, and Crab Stick is the only route to White Shark, Whale Shark, Parrotfish and
   * Barred Knifejaw. itemMarketValue had counted the pot all along, so the two resolvers
   * disagreed by one pot on every crustacean.
   */
  const crabPot = 250 / COINS_PER_SFL + 5 * p2p["Feather"] + 3 * p2p["Wool"];
  const marinerPot = 500 / COINS_PER_SFL + 10 * p2p["Feather"] + 10 * p2p["Merino Wool"];
  assert.ok(Math.abs(computeWaterTrapCostSFL("Crab Pot", p2p, COINS_PER_SFL) - crabPot) < 1e-12);
  assert.ok(Math.abs(computeWaterTrapCostSFL("Mariner Pot", p2p, COINS_PER_SFL) - marinerPot) < 1e-12);

  // A chum-less catch IS the pot — not free, and not unpriceable.
  const isopod = itemProductionCost("Isopod", p2p, COINS_PER_SFL, skills, undefined, {});
  assert.ok(isopod && Math.abs(isopod.price - crabPot) < 1e-12, `Isopod was ${isopod && isopod.price}`);
  const barnacle = itemProductionCost("Barnacle", p2p, COINS_PER_SFL, skills, undefined, {});
  assert.ok(barnacle && Math.abs(barnacle.price - marinerPot) < 1e-12, `Barnacle was ${barnacle && barnacle.price}`);

  // A chum-fed one is the pot PLUS the cheaper of its chum and its alternate — the alt must not
  // replace the total, which is the shape the old code had.
  const lobster = itemProductionCost("Lobster", p2p, COINS_PER_SFL, skills, undefined, {});
  const wildGrass = itemProductionCost("Wild Grass", p2p, COINS_PER_SFL, skills, undefined, {});
  const frost = itemProductionCost("Frost Pebble", p2p, COINS_PER_SFL, skills, undefined, {});
  const chum = Math.min(...[wildGrass, frost].filter(Boolean).map((r) => r.price * 3));
  assert.ok(Math.abs(lobster.price - (crabPot + chum)) < 1e-12,
    `Lobster ${lobster.price} != pot ${crabPot} + chum ${chum}`);

  // And the two resolvers now agree, which they did not before.
  for (const n of ["Isopod", "Barnacle", "Lobster", "Shrimp", "Blue Crab", "Sea Slug"]) {
    const pc = itemProductionCost(n, p2p, COINS_PER_SFL, skills, undefined, {});
    const mv = itemMarketValue(n, p2p, undefined, { coinsPerSFL: COINS_PER_SFL });
    assert.ok(Math.abs(pc.price - mv) < 1e-9, `${n}: production ${pc.price} vs market ${mv}`);
  }

  // Every season of Crab Stick prices, which is what the fish that only it can force depend on.
  for (const s of ["winter", "spring", "summer", "autumn"]) {
    const cs = itemProductionCost("Crab Stick", p2p, COINS_PER_SFL, skills, undefined, { season: s });
    assert.ok(cs && cs.price > 0, `Crab Stick prices in ${s}`);
  }
});

test("a placed Royal Crab Pot is the one thing that makes the trap free", () => {
  /*
   * The same reducer skips the decrement entirely when a Royal Crab Pot is built, so the pot
   * genuinely costs nothing then — and a chum-less catch really is free. Zero has to survive as
   * an answer here: treating it as "no price" is what made Crab Stick unpriceable before.
   */
  const free = { freeWaterTraps: true };
  const isopod = itemProductionCost("Isopod", p2p, COINS_PER_SFL, skills, undefined, free);
  assert.ok(isopod, "still priced, not null");
  assert.equal(isopod.price, 0, "with the pot exempt and no chum, a catch is free");
  // A chum-fed catch still costs its chum, just not the pot.
  const paid = itemProductionCost("Lobster", p2p, COINS_PER_SFL, skills, undefined, {});
  const exempt = itemProductionCost("Lobster", p2p, COINS_PER_SFL, skills, undefined, free);
  const crabPot = 250 / COINS_PER_SFL + 5 * p2p["Feather"] + 3 * p2p["Wool"];
  assert.ok(Math.abs((paid.price - exempt.price) - crabPot) < 1e-12,
    `the difference between the two is exactly one Crab Pot`);
  // An unpriceable chum is still unpriceable — the exemption must not turn it into a free catch.
  const mussel = itemProductionCost("Mussel", p2p, COINS_PER_SFL, skills, undefined,
    Object.assign({}, free));
  if (mussel) assert.ok(mussel.price > 0, "Mussel prices only if its Moonfur does");
});
