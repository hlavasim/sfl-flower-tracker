import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { buildPowerSection } from "../../core/sections/power.mjs";
import { powerCooldownEffects } from "../../core/engine/skill-ranks.mjs";
import { applyBoosts } from "../../core/engine/power-helpers.mjs";

/*
 * Luna's Crescent halves every power-skill cooldown (skillUsed.ts getSkillCooldown). sfl.world's
 * NFT feed lists it with an id but no name, so POWER and the roadmap never saw it. It is now a
 * market item priced from that id's row, worth the extra uses of the power skills the farm has:
 * each use is one extra cycle of the skill's category.
 */
const wrap = JSON.parse(readFileSync(new URL("../fixtures/farm-155498.json", import.meta.url)));
const farm = wrap.farm || wrap;
const p2p = JSON.parse(readFileSync(new URL("../fixtures/p2p-prices.json", import.meta.url)));

test("half the cooldown = one extra use per cooldown, per category of each power skill the farm has", () => {
  const eff = powerCooldownEffects({ "Instant Growth": 1, "Barnyard Rouse": 1, "Tree Blitz": 3, "Green Thumb": 1 }, 0.5);
  const by = (cat) => eff.find((e) => e.cat === cat);
  assert.ok(Math.abs(by("crops").value - 1 / 3) < 1e-9, "Instant Growth r1: 72 h → +1/3 a day");
  for (const c of ["chickens", "cows", "sheep"]) assert.ok(Math.abs(by(c).value - 1 / 5) < 1e-9, "Barnyard Rouse r1: 120 h");
  assert.ok(Math.abs(by("trees").value - 2) < 1e-9, "Tree Blitz r3: 12 h → +2 a day");
  assert.equal(eff.every((e) => e.type === "extra_cycles"), true);
  assert.deepEqual(powerCooldownEffects({}, 0.5), [], "no power skills, no value");
});

test("extra cycles raise output in proportion", () => {
  const cap = { plots: 10, crops: 10 };
  const base = applyBoosts("crops", "Sunflower", cap, []);
  const more = applyBoosts("crops", "Sunflower", cap, [{ type: "extra_cycles", value: 1, cat: "crops" }]);
  const perDay = 86400 / base.effectiveCycle;
  assert.ok(Math.abs(more.unitsPerDay / base.unitsPerDay - (perDay + 1) / perDay) < 1e-9);
});

test("POWER lists Luna's Crescent at its market floor, with effects from the farm's power skills", () => {
  const nfts = { collectibles: [], wearables: [{ id: 499, floor: "9199", lastSalePrice: "6500", supply: 150 }] };
  const f = JSON.parse(JSON.stringify(farm));
  f.bumpkin.skills = { ...(f.bumpkin.skills || {}), "Instant Growth": 1 };
  const out = buildPowerSection(f, p2p, nfts, null, {});
  const luna = out.boostItems.find((b) => b.name === "Luna's Crescent");
  assert.ok(luna, "listed");
  assert.equal(luna.floor, 9199);
  assert.equal(luna.priceUnknown, false);
  assert.ok(luna.effects.some((e) => e.cat === "crops" && e.type === "extra_cycles"));
  // It becomes a roadmap candidate like any NFT.
  assert.ok(out.nftData.wearables.some((w) => w.name === "Luna's Crescent" && w.floor === 9199));
  // A joke floor falls back to the last sale.
  const joke = buildPowerSection(f, p2p, { collectibles: [], wearables: [{ id: 499, floor: "99999999999999", lastSalePrice: "6500" }] }, null, {});
  assert.equal(joke.boostItems.find((b) => b.name === "Luna's Crescent").floor, 6500);
});
