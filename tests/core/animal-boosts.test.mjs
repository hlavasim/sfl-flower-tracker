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

  // Not a blanket "everything is positive now": speeding up a loss-maker makes the loss
  // bigger, and that still reports 0 rather than a negative number.
  assert.equal(bv["Speed Chicken"].synergy, 0, "a boost that deepens the loss stays at 0");
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
