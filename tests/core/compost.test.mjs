import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { fertiliserValue, composterVerdict, composterVerdicts } from "../../core/engine/compost.mjs";
import { FERTILISER_EFFECTS, COMPOST_RECIPES } from "../../core/data/crafting.mjs";

const wrap = JSON.parse(readFileSync(new URL("../fixtures/farm-155498.json", import.meta.url)));
const farm = wrap.farm || wrap;
const raw = JSON.parse(readFileSync(new URL("../fixtures/p2p-prices.json", import.meta.url)));
const p2p = {}; for (const [k, v] of Object.entries(raw)) p2p[k] = parseFloat(v) || 0;
const season = (farm.season || {}).season;

test("a fertiliser is valued per plot per harvest, not per day", () => {
  // That is how the game consumes it. A per-day figure would be wrong twice: it is used once,
  // and the plot it goes on would have produced anyway.
  const sm = fertiliserValue("Sprout Mix", farm, p2p, {});
  assert.equal(sm.units, 0.2, "harvest.ts: amount += 0.2");
  assert.ok(Math.abs(sm.value - 0.2 * p2p[sm.product]) < 1e-12, "value = units x the product's price");
  /*
   * Fruitful Blend is 0.1 at BASE — and the fixture farm holds Fruitful Bounty, which doubles it.
   * This test used to pin 0.1 against a farm that should read 0.2, because fertiliserValue never
   * looked at the `skillMultiplier` field the data has always carried. Both cases are pinned now,
   * so the multiplier cannot silently come or go.
   */
  assert.equal(FERTILISER_EFFECTS["Fruitful Blend"].skillMultiplier, "Fruitful Bounty");
  assert.equal(farm.bumpkin.skills["Fruitful Bounty"], 1, "the fixture farm has the skill");
  const fb = fertiliserValue("Fruitful Blend", farm, p2p, {});
  assert.equal(fb.units, 0.2, "0.1 base, doubled by Fruitful Bounty");
  assert.equal(fb.skillDoubled, true);
  const noSkill = { ...farm, bumpkin: { ...farm.bumpkin, skills: {} } };
  const fbBase = fertiliserValue("Fruitful Blend", noSkill, p2p, {});
  assert.equal(fbBase.units, 0.1, "and 0.1 without it");
  assert.equal(fbBase.skillDoubled, false);
  assert.equal(FERTILISER_EFFECTS["Fruitful Blend"].cat, "fruits");
  assert.notEqual(fb.product, sm.product, "and each is valued in ITS own category's product");
});

test("Knowledge Crab doubles Sprout Mix, and only when it is actually built", () => {
  // harvest.ts adds the +0.2 a SECOND time with the crab — a synergy the app did not know.
  const without = fertiliserValue("Sprout Mix", farm, p2p, {});
  assert.equal(without.doubled, false, "the fixture farm has no Knowledge Crab");

  const withCrab = { ...farm, home: { ...(farm.home || {}), collectibles: { ...((farm.home || {}).collectibles || {}), "Knowledge Crab": [{ coordinates: { x: 0, y: 0 } }] } } };
  const w = fertiliserValue("Sprout Mix", withCrab, p2p, {});
  assert.equal(w.doubled, true);
  assert.ok(Math.abs(w.value - without.value * 2) < 1e-12, "it doubles, not adds a different amount");
});

test("Rapid Root is a growth boost and is flagged approximate", () => {
  // plant.ts halves the growth time; treating it as extra yield would double-count it.
  const rr = fertiliserValue("Rapid Root", farm, p2p, {});
  assert.equal(rr.approximate, true, "the freed time's worth depends on the player, so say so");
  assert.equal(rr.units, undefined, "it is not a yield add");
  assert.ok(rr.value > 0);
});

test("a composter verdict is a per-day net, priced on THIS season's inputs", () => {
  const v = composterVerdict("Compost Bin", farm, p2p, season, {});
  assert.ok(v, "Compost Bin has a verdict");
  assert.equal(v.batchesPerDay, 24 / 6, "composterDetails: 6h a batch");
  assert.equal(v.season, season);
  assert.ok(Math.abs(v.netPerDay - (v.grossPerDay - v.costPerDay)) < 1e-12);

  // Inputs are seasonal, so a different season must be able to cost differently.
  const seasons = Object.keys(COMPOST_RECIPES["Compost Bin"].inputs);
  const costs = seasons.map((s) => composterVerdict("Compost Bin", farm, p2p, s, {}).costPerDay);
  assert.ok(Math.max(...costs) - Math.min(...costs) > 1e-9, `seasonal inputs must move the cost (${costs.join(", ")})`);

  // Baits are not fertilisers and must be reported as ignored, never counted as value.
  assert.ok(v.ignored.some((i) => i.item === "Earthworm"), "Earthworm is bait, not fertiliser");
  assert.ok(v.outputs.every((o) => FERTILISER_EFFECTS[o.item]), "only real fertilisers are valued");
});

test("the verdict is honest about what it cannot price", () => {
  // A missing price makes the net a FLOOR, not an answer — so it has to be flagged.
  const v = composterVerdict("Compost Bin", farm, {}, season, {});   // no prices at all
  assert.equal(v.unpriced, true);
  assert.equal(v.grossPerDay, 0);
  const all = composterVerdicts(farm, p2p, season, {});
  assert.equal(all.length, Object.keys(COMPOST_RECIPES).length, "every composter gets a verdict");
  for (let i = 1; i < all.length; i++) {
    assert.ok(all[i - 1].netPerDay >= all[i].netPerDay, "sorted best net first");
  }
});

// ── periodic-section inputs: shrines and weather protection ──
import { shrineStatuses, weatherProtection } from "../../core/engine/power-costs.mjs";

test("shrine statuses distinguish never / active / expired", () => {
  /*
   * _shrineActiveNow only ever answered a yes/no for the valuation path, so nothing could tell
   * the player a shrine had LAPSED. One expired mid-session and the only symptom was every
   * mining marginal dropping 25% — which then contaminated a measurement.
   */
  const all = shrineStatuses(farm);
  assert.ok(all.length > 10, `every shrine gets a status, got ${all.length}`);
  for (const s of all) {
    assert.ok(["never", "active", "expired"].includes(s.kind), `${s.name}: ${s.kind}`);
    assert.ok(s.durationDays > 0, `${s.name}: carries its duration`);
    assert.ok(typeof s.effect === "string" && s.effect.length > 0, `${s.name}: says what it does`);
    if (s.kind === "active") assert.ok(s.hoursLeft > 0, `${s.name}: active means time left`);
    else assert.equal(s.hoursLeft, null, `${s.name}: only active shrines carry hoursLeft`);
  }
  // The fixture has lapsed ones, which is the case worth surfacing.
  assert.ok(all.some((s) => s.kind === "expired"), "the fixture farm has expired shrines");
  // Badger and Mole are the pair that quietly cost 25% on the best-paying categories.
  for (const n of ["Badger Shrine", "Mole Shrine"]) {
    assert.ok(all.find((s) => s.name === n), `${n} is tracked`);
  }
});

test("weather protection is spent by an event, not by a timer", () => {
  /*
   * The assumption worth checking, and it was wrong: these are not timed. The game stamps the
   * instance `used: true` when its event fires (renewWeatherCollectible.ts renews only
   * `if (collectibleToRenew.used)`), so a spent item looks identical to a working one on the
   * farm and the next tornado costs you the crops it would have saved.
   */
  const before = weatherProtection(farm);
  assert.equal(before.length, 4, "four protections tracked");
  const pin = before.find((w) => w.name === "Tornado Pinwheel");
  assert.equal(pin.prevents, "tornado");
  assert.equal(pin.kind, "ready", "the fixture farm's pinwheel is unspent");
  assert.equal(pin.spent, 0);

  // Flip one instance's `used` and the status must follow — that flag is the whole mechanic.
  const spent = JSON.parse(JSON.stringify(farm));
  const inst = (spent.collectibles || {})["Tornado Pinwheel"] || ((spent.home || {}).collectibles || {})["Tornado Pinwheel"];
  assert.ok(inst && inst[0], "the fixture has a placed pinwheel to mark");
  inst[0].used = true;
  const after = weatherProtection(spent).find((w) => w.name === "Tornado Pinwheel");
  assert.equal(after.kind, "spent");
  assert.equal(after.spent, 1);
  assert.equal(after.owned, pin.owned, "owning it is unchanged — only its usefulness is gone");
});

test("weather protection is found in the house interior, where the game actually keeps it now", () => {
  /*
   * THE reported bug. The game places collectibles in four separate maps and
   * getCollectiblesAcrossLocations reads all of them; this read only the farm and the legacy
   * `home.collectibles`. On a current save home.collectibles is EMPTY — the house layout change
   * moved everything to interior.ground.collectibles — so a farm with all four items placed
   * reported all four MISSING, which is exactly what the owner saw.
   */
  const bare = { island: { type: "volcano" }, inventory: { "Tornado Pinwheel": "1" }, home: { collectibles: {} } };

  // The live shape: nothing on the farm, nothing in home, everything in the interior ground floor.
  const interior = { ...bare, interior: { ground: { collectibles: { "Tornado Pinwheel": [{ id: "a", coordinates: { x: -7, y: 5 } }] } } } };
  const pin = weatherProtection(interior).find((w) => w.name === "Tornado Pinwheel");
  assert.equal(pin.kind, "ready", "an item placed in the interior protects you");
  assert.equal(pin.placed, 1);
  assert.equal(pin.active, 1);

  // The upper floor is a separate map again, and also counts.
  const upstairs = { ...bare, interior: { level_one: { collectibles: { "Tornado Pinwheel": [{ id: "b", coordinates: { x: 0, y: 0 } }] } } } };
  assert.equal(weatherProtection(upstairs).find((w) => w.name === "Tornado Pinwheel").active, 1, "level_one counts too");

  // And with nothing placed anywhere, holding one in the chest is NOT protection — but it is a
  // different answer from owning none, because the fix is "place it" rather than "buy one".
  const chest = weatherProtection(bare).find((w) => w.name === "Tornado Pinwheel");
  assert.equal(chest.kind, "none");
  assert.equal(chest.placed, 0);
  assert.equal(chest.held, 1, "held reports the chest copy");
});

test("placed means it has coordinates, and ready means readyAt has passed", () => {
  // markWeatherCollectibleUsed protects `if (placed.coordinates && isReady && !placed.used)` —
  // an instance with no coordinates was removed from the map (placeCollectible.test.ts says so
  // explicitly) and one still building protects nothing. Counting either was wrong.
  const at = (insts) => ({ island: { type: "basic" }, inventory: {}, interior: { ground: { collectibles: { Mangrove: insts } } } });

  const noCoords = weatherProtection(at([{ id: "a" }])).find((w) => w.name === "Mangrove");
  assert.equal(noCoords.placed, 0, "no coordinates = in the chest, not placed");
  assert.equal(noCoords.kind, "none");

  const now = 1_800_000_000_000;
  const building = weatherProtection(at([{ id: "a", coordinates: { x: 0, y: 0 }, readyAt: now + 3600_000 }]), now).find((w) => w.name === "Mangrove");
  assert.equal(building.pending, 1, "still building");
  assert.equal(building.active, 0, "and therefore not protecting");
  assert.equal(building.kind, "spent", "no active cover — the row has to say so");

  const done = weatherProtection(at([{ id: "a", coordinates: { x: 0, y: 0 }, readyAt: now - 1 }]), now).find((w) => w.name === "Mangrove");
  assert.equal(done.active, 1);
  assert.equal(done.kind, "ready");
});

test("renewal cost is the shop price scaled by island, so the row can say what it costs", () => {
  /*
   * Previously reported as unknown ("that table is not in this repo"). It is
   * WEATHER_SHOP_ITEM_COSTS × getMultiplier(islandType), and renewWeatherCollectible.ts charges
   * exactly that — craft-time discounts deliberately not applied.
   */
  const mk = (island) => ({ island: { type: island }, inventory: {}, interior: { ground: { collectibles: {} } } });
  const base = weatherProtection(mk("spring")).find((w) => w.name === "Tornado Pinwheel");
  assert.equal(base.renew.coins, 100);
  assert.deepEqual(base.renew.ingredients, { Wood: 30, Leather: 5 });

  const volcano = weatherProtection(mk("volcano")).find((w) => w.name === "Tornado Pinwheel");
  assert.equal(volcano.renew.islandMult, 2.5);
  assert.equal(volcano.renew.coins, 250);
  assert.deepEqual(volcano.renew.ingredients, { Wood: 75, Leather: 12.5 });

  const desert = weatherProtection(mk("desert")).find((w) => w.name === "Thermal Stone");
  assert.deepEqual(desert.renew.ingredients, { Stone: 10, Wool: 10 });
  assert.equal(desert.renew.coins, 200);
});

test("partial cover is distinct from none: one spent instance out of two still protects once", () => {
  const two = {
    island: { type: "volcano" }, inventory: {},
    interior: { ground: { collectibles: { "Thermal Stone": [
      { id: "a", coordinates: { x: 0, y: 0 }, used: true },
      { id: "b", coordinates: { x: 1, y: 0 } },
    ] } } },
  };
  const w = weatherProtection(two).find((x) => x.name === "Thermal Stone");
  assert.equal(w.kind, "partial");
  assert.equal(w.spent, 1);
  assert.equal(w.active, 1);
  assert.equal(w.owned, 2, "owned is the placed count, which the coverage note divides by");
});

test("the Compost tree is no longer worth exactly zero, and the reasons are kept apart", async () => {
  /*
   * The whole tree valued at 0 for two unrelated causes, and only one was a missing model:
   *   - most of it changes a composter's OUTPUT, which had no effect model at all;
   *   - three are POWER skills that change how a fertiliser is APPLIED, which has no per-DAY rate
   *     without a model of how often you press it.
   * Conflating them is what made "0" look like a single answer.
   */
  const { compostSkillValues } = await import("../../core/engine/compost.mjs");
  const { buildPowerSection } = await import("../../core/sections/power.mjs");
  const nfts = JSON.parse(readFileSync(new URL("../fixtures/nfts-sample.json", import.meta.url)));
  const pd = buildPowerSection(farm, p2p, nfts, null, {});
  const rows = compostSkillValues(farm, pd.p2pPrices, pd.season, { capacity: pd.capacity });
  const by = {};
  for (const r of rows) by[r.skill] = r;

  // 1. Output skills now carry a real per-day figure, priced off the composter that makes the item.
  assert.equal(by["Efficient Bin"].composter, "Compost Bin", "+5 Sprout Mix lands in the Compost Bin's batch");
  assert.ok(by["Efficient Bin"].value > 0, `Efficient Bin: ${by["Efficient Bin"].value}`);
  // 5 extra mix per batch x 4 batches a day x what one mix is worth — no magic in the arithmetic.
  const oneMix = fertiliserValue("Sprout Mix", farm, pd.p2pPrices, {}).value;
  assert.ok(Math.abs(by["Efficient Bin"].value - 5 * oneMix * 4) < 1e-9, "5 x 4 batches x one mix");
  assert.ok(by["Efficient Bin"].conditional, "and it says it only counts if the composter runs");

  // 2. A speed skill on a LOSS-MAKING composter is harmful, and says so rather than clamping to 0.
  //    All three composters net negative on this farm, so faster batches lose money faster.
  assert.ok(by["Swift Decomposer"].value < 0, `Swift Decomposer: ${by["Swift Decomposer"].value}`);
  assert.equal(by["Swift Decomposer"].harmful, true);

  // 3. Bait is not a fertiliser. Unpriced, NOT zero — zero reads as "worthless".
  assert.equal(by["Wormy Treat"].value, null);
  assert.equal(by["Wormy Treat"].unpriced, true);

  // 4. The power skills report a per-ACTIVATION gain and no per-day value at all.
  for (const s of ["Sprout Surge", "Blend-tastic", "Root Rocket"]) {
    assert.equal(by[s].value, null, `${s}: no invented daily rate`);
    assert.ok(by[s].perActivation > 0, `${s}: but a real per-activation figure`);
    assert.ok(by[s].plots > 1, `${s}: which is the extra plots one application now covers`);
  }
  // Sprout Surge covers every crop plot but the one you would have fertilised anyway.
  assert.ok(Math.abs(by["Sprout Surge"].perActivation - oneMix * (by["Sprout Surge"].plots - 1)) < 1e-9);

  // 5. And the per-day ones reach the UI, which reads boostValues — that is where the 0 was shown.
  assert.ok(pd.boostValues.crops["Efficient Bin"], "Efficient Bin is in boostValues");
  assert.equal(pd.boostValues.crops["Efficient Bin"].synergy, by["Efficient Bin"].value);
  assert.ok(pd.boostValues.crops["Swift Decomposer"].synergy < 0, "including the harmful one");
  // The per-activation ones must NOT be in that column: a guessed daily rate beside measured ones
  // would corrupt it.
  assert.equal(pd.boostValues.crops["Sprout Surge"], undefined, "power skills stay out of boostValues");
  assert.ok(pd.compostSkills.some((r) => r.skill === "Sprout Surge" && r.perActivation > 0), "they travel separately");
});
