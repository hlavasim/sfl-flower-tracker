// STARTUP PLANS ARE PER PRODUCT WHERE THE CATEGORY IS A CROP CHOICE.
//
// "Greenhouse není správně, protože to by mělo být spíš Rice, Olive, Grape" — starting the
// greenhouse is not one decision. Rice, Olive and Grape each have their own economics and
// their own cheapest set of boosts, so roadmapStartupPlans emits one plan per product for
// plot categories, and the scenario toggle keys on the product name.
//
// The fixture greenhouse is profitable at fixture prices, so the test sinks it by making
// its crops near-worthless — the per-product path only runs for a DEAD category. (Oil
// cannot be made expensive instead: buildPowerSection overwrites p2p "Oil" with the farm's
// own extraction cost.) Prices stay > 0 so the plans read unflippable, not unpriced.
//
// Revert check: with one-plan-per-category, `product` is undefined on every row and the
// greenhouse yields a single "GREENHOUSE" row — both asserts below fail.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildPowerSection } from "../../core/sections/power.mjs";
import { buildRoadmapSection } from "../../core/sections/roadmap.mjs";

const wrap = JSON.parse(readFileSync(new URL("../fixtures/farm-155498.json", import.meta.url)));
const farm = wrap.farm || wrap;
const p2p = JSON.parse(readFileSync(new URL("../fixtures/p2p-prices.json", import.meta.url)));
const nfts = JSON.parse(readFileSync(new URL("../fixtures/nfts-sample.json", import.meta.url)));

test("a dead greenhouse plans per product (Rice / Olive / Grape), not as one category", () => {
  const cheapCrops = { ...p2p, Rice: "0.0001", Olive: "0.0001", Grape: "0.0001" };
  buildPowerSection(farm, cheapCrops, nfts, null, {});
  const out = buildRoadmapSection([], { roadmapSettings: {}, farm, p2p: cheapCrops });
  assert.equal(out.startupError, null);

  const gh = out.startup.filter((r) => r.cat === "greenhouse");
  assert.ok(gh.length >= 2, `one plan per greenhouse crop, got ${gh.length}`);
  const products = gh.map((r) => r.product).sort();
  assert.ok(products.every(Boolean), "every greenhouse plan names its product");
  assert.equal(new Set(products).size, gh.length, "no duplicate products");
  for (const r of gh) {
    assert.ok(["Rice", "Olive", "Grape"].includes(r.product), `greenhouse product: ${r.product}`);
    assert.equal(r.label, r.product.toUpperCase(), "the toggle label is the product, not GREENHOUSE");
  }

  // Categories without a crop choice keep a single plan with no product.
  for (const r of out.startup.filter((x) => ["chickens", "cows", "fishing"].includes(x.cat))) {
    assert.equal(r.product, null);
  }
});
