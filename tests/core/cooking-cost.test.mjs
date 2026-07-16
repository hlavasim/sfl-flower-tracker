import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import {
  computeRecipeCost,
  computeSaltYieldPerRake,
  computeSaltRakeCoinMult,
  computeFishYieldPerCast,
  computeRodCostSFL,
} from "../../core/engine/cooking-cost.mjs";

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
  assert.ok(!rc.hasUnpriced, "Aged Tuna should be fully priced (fish priced via rod cost, salt via rake cost)");
  const byName = Object.fromEntries(rc.items.map((i) => [i.name, i]));
  assert.equal(byName["Tuna"].source, "fish-rod", "Aging Shed fish is priced as rod cost / yield-per-cast");
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
