import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { getFlowerChainHours, detectFlowerBoosts, computeFlowerMultiplier } from "../../core/engine/gifts-deliveries.mjs";
import { FLOWER_RECIPES } from "../../core/data/recipes.mjs";

// The server never runs the page's applyFlowerBoosts, so SEED_DATA has no `seconds` there:
// getFlowerChainHours returned 0 and the roadmap's gift pick fell back to 24 h for every flower.
const lily = Object.keys(FLOWER_RECIPES).find((f) => FLOWER_RECIPES[f].seed === "Lily Seed" && !FLOWER_RECIPES[FLOWER_RECIPES[f].input]);

test("without boosts written into SEED_DATA, the base time is used — not 0", () => {
  assert.ok(lily, "a Lily flower exists");
  assert.equal(getFlowerChainHours(lily), 120);
});

test("an explicit multiplier scales the chain", () => {
  assert.equal(getFlowerChainHours(lily, undefined, 0.5), 60);
});

test("the farm's flower boosts give that multiplier", () => {
  const farm = { bumpkin: { equipped: { hat: "Flower Crown" }, skills: { "Flower Power": 1 } } };
  assert.deepEqual(detectFlowerBoosts(farm).map((b) => b.name), ["Flower Crown", "Flower Power"]);
  assert.equal(computeFlowerMultiplier(detectFlowerBoosts(farm)), 0.4);
});

test("the server roadmap passes the farm's multiplier to the gift pick", () => {
  const src = readFileSync(new URL("../../core/sections/roadmap.mjs", import.meta.url), "utf8");
  assert.match(src, /flowerMult = computeFlowerMultiplier\(detectFlowerBoosts\(farm\)\)/);
  assert.match(src, /getFlowerChainHours\(f, undefined, flowerMult\)/);
});

test("the shrine renew table asks for the owned effects by a function that exists", () => {
  // getOwnedEffects never existed: the try/catch swallowed the ReferenceError and every
  // shrine's renew value was blank.
  const page = readFileSync(new URL("../../flowers.html", import.meta.url), "utf8");
  assert.ok(!page.includes("getOwnedEffects("));
  assert.match(page, /_shrineMarginalSflPerDay\(sh, ps\.capacity, ps\.p2pPrices \|\| \{\}, roadmapOwnedEffects\(sh\.catId\), null\)/);
});
