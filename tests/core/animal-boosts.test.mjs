import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { buildPowerSection } from "../../core/sections/power.mjs";

// Its own file, not part of power.test.mjs: buildPowerSection installs a MODULE-LEVEL power
// context that the roadmap engine reads, so a second farm/NFT payload in the same process
// would silently retarget the pins in that file. node --test isolates per file.

const wrap = JSON.parse(readFileSync(new URL("../fixtures/farm-155498.json", import.meta.url)));
const farm = wrap.farm || wrap;
const p2p = JSON.parse(readFileSync(new URL("../fixtures/p2p-prices.json", import.meta.url)));

/*
 * Boosts on a LOSS-MAKING category.
 *
 * The fixture farm keeps 7 chickens that lose money: 1.05 FLOWER/day of eggs and feathers
 * against 1.92 of feed and sickness, so the category nets -0.87. calcBoostValue used to clamp
 * each side of its before/after difference at zero, which flattened both to 0 and reported
 * every chicken boost as worthless — including plain extra yield. The clamp now applies to the
 * difference, so a boost is worth what it ADDS even where the activity itself is underwater.
 *
 * Its own NFT payload rather than the shared fixture: these items exist to exercise this one
 * path, and the shared fixture is deliberately minimal (and pinned by tests above).
 */
const chickenNfts = {
  collectibles: [
    // Real boost_text strings from sfl.world /api/v1/nfts.
    { id: 9001, name: "Rich Chicken", have_boost: 1, boost_text: "+0.1 Egg", floor: "37", supply: 100 },
    { id: 9002, name: "Fat Chicken", have_boost: 1, boost_text: "-10% Feed to Chicken", floor: "37", supply: 100 },
    { id: 9003, name: "Speed Chicken", have_boost: 1, boost_text: "-10% Chicken Sleep Time", floor: "21.45", supply: 100 },
    { id: 9004, name: "Gold Egg", have_boost: 1, boost_text: "Feed Chickens for free", floor: "12480", supply: 100 },
  ],
  wearables: [],
};
const chickenOut = buildPowerSection(farm, p2p, chickenNfts, null, {});

test("boostValues — a boost on a loss-making category is worth what it adds, not zero", async () => {
  const { roadmapCatBreakdown, roadmapOwnedEffects, getRoadmapSettings } =
    await import("../../core/engine/roadmap.mjs");
  const s = Object.assign({}, getRoadmapSettings({}), { effMode: "theoretical", effOverrides: {} });
  // The premise: without this the test would pass for the wrong reason on a profitable farm.
  const bare = roadmapCatBreakdown("chickens", roadmapOwnedEffects("chickens"), s);
  assert.ok(bare.net < 0, `chickens must be loss-making for this test to mean anything (net ${bare.net})`);

  const bv = chickenOut.boostValues.chickens;
  // Extra eggs: small but real, and it was being reported as exactly 0.
  assert.ok(bv["Rich Chicken"].synergy > 0,
    `+0.1 Egg must carry value on a loss-making category (got ${bv["Rich Chicken"].synergy})`);
  // Saved feed is worth an order of magnitude more than the extra eggs on this farm.
  assert.ok(bv["Fat Chicken"].synergy > bv["Rich Chicken"].synergy,
    "-10% feed outvalues +0.1 Egg here");
  // A ROI follows from a non-zero value, which is the whole point of the wishlist column.
  assert.ok(isFinite(bv["Fat Chicken"].roi) && bv["Fat Chicken"].roi > 0, "and it yields a finite ROI");

  /*
   * Not a blanket "everything is positive now": speeding up a loss-maker makes the loss
   * BIGGER, and since the unclamp pass that is reported as a negative rather than hidden at 0.
   * Faster chicken cycles on a farm where feed already outruns the eggs costs real money, and
   * a 0.00 read as "merely uninteresting" when it should read "do not buy this".
   */
  assert.ok(bv["Speed Chicken"].synergy < 0,
    `a boost that deepens the loss must show the negative, got ${bv["Speed Chicken"].synergy}`);
});

test("boostValues — free_feed is priced, not silently ignored", () => {
  // Gold Egg's entire boost is "Feed Chickens for free". calcAnimalFeedCost only consulted
  // capacity.goldenAnimals, a flag set from what the farm ALREADY owns, so for the unowned
  // item the effect was inert and a 12,480-FLOWER collectible valued at exactly 0.
  const gold = chickenOut.boostValues.chickens["Gold Egg"];
  assert.ok(gold, "Gold Egg valued in chickens");
  assert.ok(gold.synergy > 0, `free feeding must be worth something (got ${gold.synergy})`);

  // It is worth the feed bill it removes, so it must beat a 10% cut of that same bill.
  const fat = chickenOut.boostValues.chickens["Fat Chicken"];
  assert.ok(gold.synergy > fat.synergy,
    `free feed (${gold.synergy}) must beat -10% feed (${fat.synergy})`);

  // The farm does not own a Gold Egg, so this is the "what if I buy it" path — the one the
  // wishlist and the Power page both use.
  assert.equal(chickenOut.boostItems.find((b) => b.name === "Gold Egg").has, false);
});

test("a per-harvest coin drop is priced, not left at zero", () => {
  /*
   * Money Tree: "1% chance +200 Coins chopping trees". It used to parse as a yield of a product
   * literally named "Coins chopping trees" in category "other" — not quantifiable, so
   * calcBoostValue was never called and the skill valued at exactly 0, while the roadmap's own
   * skills view priced it at 0.756/day through a separate raw-text pass. That divergence is
   * what the coin_chance effect type removes.
   */
  const coinNfts = { collectibles: [], wearables: [] };
  const co = buildPowerSection(farm, p2p, coinNfts, null, {});
  const mt = co.boostItems.find((b) => b.name === "Money Tree");
  assert.ok(mt, "Money Tree is a skill boost item");
  assert.deepEqual(mt.categories, ["trees"], "it must land in a QUANTIFIABLE category, not 'other'");
  const eff = mt.effects.find((e) => e.type === "coin_chance");
  assert.ok(eff, `parsed as coin_chance, got ${JSON.stringify(mt.effects)}`);
  assert.equal(eff.pct, 1);
  assert.equal(eff.coins, 200);

  const v = co.boostValues.trees["Money Tree"];
  assert.ok(v && v.synergy > 0, `and it is now worth something (${v && v.synergy})`);

  // Priced through coinsPerSFL, so it is FLOWER-comparable rather than a raw coin figure —
  // 1% of 200 coins per chop, over the day's chops, divided by the coin rate.
  assert.ok(co.exchangeRates.coinsPerSFL > 0, "there is a coin rate to convert through");
  assert.ok(v.synergy < 200 / co.exchangeRates.coinsPerSFL * 1000,
    "sane magnitude — a 1% chance cannot be worth the full drop every chop");
});
