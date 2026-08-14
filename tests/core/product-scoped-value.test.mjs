import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { buildPowerSection } from "../../core/sections/power.mjs";

/*
 * A crop/fruit/greenhouse boost is valued against the SELECTED product, not the best-paying mix.
 *
 * The mix optimizer filled the plots with whatever crop paid best, so a boost touching only one
 * crop still showed its whole value whatever was selected — Sickle read +3/day on every crop even
 * though it only lifts Wheat. Now a Wheat boost reads its Wheat value on Wheat and exactly zero on
 * a crop it does not touch.
 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const wrap = JSON.parse(readFileSync(path.join(ROOT, "tests/fixtures/farm-155498.json"), "utf8"));
const p2p = JSON.parse(readFileSync(path.join(ROOT, "tests/fixtures/p2p-prices.json"), "utf8"));
const farm = wrap.farm || wrap;

// A collectible that boosts exactly one crop, not owned, so its synergy is a clean marginal.
const nft = { wearables: [], collectibles: [{ name: "Wheat Idol", have_boost: 1, boost_text: "+1 Wheat", floor: 1, supply: 9 }] };
const valueFor = (crop) => {
  const out = buildPowerSection(farm, p2p, nft, null, { savedProducts: { crops: crop } });
  const e = (out.boostValues.crops || {})["Wheat Idol"];
  return e ? e.synergy : null;
};

test("a Wheat boost is worth something on Wheat", () => {
  const v = valueFor("Wheat");
  assert.ok(v > 0.1, `expected a real Wheat value, got ${v}`);
});

test("the same boost is worth exactly zero on a crop it does not touch", () => {
  assert.equal(valueFor("Kale"), 0, "a Wheat boost adds nothing when you have Kale selected");
  assert.equal(valueFor("Cauliflower"), 0, "nor Cauliflower");
});

test("the value tracks the selected product, it is not flat", () => {
  // The whole bug was that it did NOT move with the selector. If Wheat and Kale ever read the
  // same again, the mix optimizer has crept back into the per-item valuation.
  assert.notEqual(valueFor("Wheat"), valueFor("Kale"), "selecting a different crop must change the value");
});
