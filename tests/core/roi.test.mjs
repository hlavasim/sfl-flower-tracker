import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { buildRoiSection } from "../../core/sections/roi.mjs";

// section=roi against the real farm fixture (155498) + the shared minimal NFT fixture.

const wrap = JSON.parse(readFileSync(new URL("../fixtures/farm-155498.json", import.meta.url)));
const farm = wrap.farm || wrap;
const p2p = JSON.parse(readFileSync(new URL("../fixtures/p2p-prices.json", import.meta.url)));
const nfts = JSON.parse(readFileSync(new URL("../fixtures/nfts-sample.json", import.meta.url)));

const out = buildRoiSection(farm, p2p, nfts, null, 97000, {});

test("shape — everything renderRoiContent destructures is present", () => {
  for (const k of ["boostItems", "capacity", "p2pPrices", "sflUsd", "btcUsd", "exchangeRates", "stockMods", "season", "pets"]) {
    assert.ok(k in out, `missing ${k}`);
  }
  assert.equal(out.btcUsd, 97000);
  assert.equal(out.sflUsd, 0); // no exchange resp passed
});

test("roi boostItems — ROI flags (quantCats/isSellable) present; skills not sellable", () => {
  const pear = out.boostItems.find((b) => b.name === "Immortal Pear");
  assert.equal(pear.has, true);
  assert.equal(pear.isSellable, true); // Collectible with floor > 0
  // fixture's "+0.1 Wood" parses to a yield boost in trees → a quantifiable category
  const statue = out.boostItems.find((b) => b.name === "Test Unowned Statue");
  assert.deepEqual(statue.quantCats, ["trees"]);
  assert.equal(statue.isSellable, true);
  const moreAxes = out.boostItems.find((b) => b.name === "More Axes");
  assert.equal(moreAxes.type, "Skill");
  assert.equal(moreAxes.isSellable, false);
});

test("pets parsed from farm.pets with levels", () => {
  assert.ok(Array.isArray(out.pets));
  for (const p of out.pets) {
    assert.ok(p.level >= 1);
    assert.equal(typeof p.isNft, "boolean");
  }
});

test("capacity/stockMods identical to section=power's (same helpers)", () => {
  assert.equal(out.capacity.trees, 30);
  assert.equal(out.stockMods.moreAxes, true);
});

test("rowsByLogins — precomputed for all four login frequencies, JSON-safe roiYears", () => {
  const rb = out.rowsByLogins;
  assert.deepEqual(Object.keys(rb).sort(), ["1", "2", "3", "4"]);
  for (const L of [1, 2, 3, 4]) {
    assert.ok(rb[L].length > 0);
    for (const r of rb[L]) {
      assert.ok(r.roiYears === null || isFinite(r.roiYears), `roiYears JSON-safe (${r.catId})`);
      assert.ok(typeof r.verdict === "string");
    }
  }
  // login frequency actually changes the numbers for cycle-capped categories
  const t1 = rb[1].find((r) => r.catId === "stone");
  const t4 = rb[4].find((r) => r.catId === "stone");
  assert.ok(t1 && t4);
  assert.ok(t1.netKeepSfl !== t4.netKeepSfl, "stone net must differ between 1x and 4x logins");
});
