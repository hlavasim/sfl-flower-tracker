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
  const fb = fertiliserValue("Fruitful Blend", farm, p2p, {});
  assert.equal(fb.units, 0.1);
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
