import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { buildPowerSection } from "../../core/sections/power.mjs";
import { computeBettyRate } from "../../core/engine/prices.mjs";

// section=power against the real farm fixture (155498) + a minimal NFT fixture.
// Pins are hand-derived from the fixture JSON, not from the code under test.

const wrap = JSON.parse(readFileSync(new URL("../fixtures/farm-155498.json", import.meta.url)));
const farm = wrap.farm || wrap;
const p2p = JSON.parse(readFileSync(new URL("../fixtures/p2p-prices.json", import.meta.url)));
const nfts = JSON.parse(readFileSync(new URL("../fixtures/nfts-sample.json", import.meta.url)));

const out = buildPowerSection(farm, p2p, nfts, null, {});

test("capacity — merged nodes count by multiplier, plain nodes by key count", () => {
  // Hand-counted from the fixture: 6 tree nodes whose multipliers sum to 30, etc.
  assert.equal(out.capacity.crops, 68);
  assert.equal(out.capacity.trees, 30);
  assert.equal(out.capacity.stones, 24);
  assert.equal(out.capacity.iron, 16);
  assert.equal(out.capacity.gold, 11);
  assert.equal(out.capacity.crimstones, 7);
  assert.equal(out.capacity.oilReserves, 4);
  assert.equal(out.capacity.fruitPatches, 18);
  assert.equal(out.capacity.greenhouse, 4);
  assert.equal(out.capacity.flowers, 4);
  assert.equal(out.capacity.bees, 4);
  assert.equal(out.capacity.lavaPits, 4);
  assert.equal(out.capacity.chickens, 7); // henHouse.animals key count
  assert.equal(out.capacity.cows + out.capacity.sheep, 35); // barn.animals key count
});

test("boostItems — owned collectible detected via home.collectibles, unowned not", () => {
  const pear = out.boostItems.find((b) => b.name === "Immortal Pear");
  assert.ok(pear, "Immortal Pear present");
  assert.equal(pear.type, "Collectible");
  assert.equal(pear.has, true); // fixture farm has it on the HOME island
  assert.equal(pear.floor, 5);
  const beaver = out.boostItems.find((b) => b.name === "Foreman Beaver");
  assert.equal(beaver.has, true); // in inventory AND placed on the home island
  const unowned = out.boostItems.find((b) => b.name === "Test Unowned Statue");
  assert.equal(unowned.has, false);
  // have_boost:false NFTs are excluded from boostItems entirely…
  assert.equal(out.boostItems.find((b) => b.name === "Rocket Statue"), undefined);
});

test("nftData — slim copy carries EVERY nft with the 4 consumer-read fields", () => {
  // roadmapBuildMissing iterates these lists and nftFloor scans floors, so non-boost
  // NFTs (Rocket Statue) must survive the slimming even though boostItems drops them.
  const byName = Object.fromEntries(out.nftData.collectibles.map((it) => [it.name, it]));
  assert.equal(byName["Foreman Beaver"].floor, "1200");
  assert.equal(byName["Rocket Statue"].floor, "3");
  assert.deepEqual(Object.keys(byName["Foreman Beaver"]).sort(), ["boost_text", "floor", "name", "supply"]);
  assert.equal(out.nftData.wearables[0].name, "Fruit Picker Apron");
});

test("skills — every SKILL_TREE_DATA entry becomes a boostItem, ownership from farm", () => {
  const moreAxes = out.boostItems.find((b) => b.name === "More Axes");
  assert.equal(moreAxes.type, "Skill");
  assert.equal(moreAxes.has, true);
  const greenThumb = out.boostItems.find((b) => b.name === "Green Thumb");
  assert.equal(greenThumb.has, true); // fixture farm has it
  assert.deepEqual(greenThumb.categories, ["crops"]);
  const youngFarmer = out.boostItems.find((b) => b.name === "Young Farmer");
  assert.equal(youngFarmer.has, false); // …but not this one
});

test("skillCostInfo — level from BUMPKIN_XP_TABLE (xp 179,145,036 → level 186 (t[185] <= xp < t[186]))", () => {
  assert.equal(out.skillCostInfo.level, 186);
});

test("stockMods — flags derived from fixture skills/buildings", () => {
  assert.equal(out.stockMods.moreAxes, true);
  assert.equal(out.stockMods.morePicks, true);
  assert.equal(out.stockMods.fellersDiscount, true);
  assert.equal(out.stockMods.frugalMiner, true);
  assert.equal(out.stockMods.hasForeman, true); // Foreman Beaver in inventory
});

test("exchangeRates — Betty rate wins for coinsPerSFL; no exchange resp → gems 0", () => {
  const betty = computeBettyRate(Object.fromEntries(Object.entries(p2p).map(([k, v]) => [k, parseFloat(v) || 0])));
  assert.ok(betty.rate > 0, "fixture p2p must yield a Betty rate");
  assert.equal(out.exchangeRates.coinsPerSFL, betty.rate);
  assert.equal(out.exchangeRates.gemsPerSFL, 0);
});

test("game-only boosts — Scary Mike (owned) injected as an API-missing effect", () => {
  const game = out.boostItems.find((b) => b.type === "Game");
  assert.ok(game, "Game boosts item present");
  assert.ok(game.effects.some((e) => e.raw.includes("Scary Mike") || e.raw.includes("Horror Mike")));
  assert.ok(game.effects.some((e) => e.raw.includes("Laurie")));
});

test("oil price derived from drill cost / yield (fixture has 4 oil reserves)", () => {
  assert.ok(out.p2pPrices["Oil"] > 0, `Oil should be derived, got ${out.p2pPrices["Oil"]}`);
});

test("season + serializability", () => {
  assert.equal(out.season, "autumn");
  JSON.stringify(out); // must be a pure-data payload
});
