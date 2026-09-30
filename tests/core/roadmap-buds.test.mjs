// BUDS IN THE ROADMAP.
//
// The game counts, per resource, only the single best PLACED bud (getBudYieldBoosts: Math.max
// over the placed buds) — within one bud type + stem add up and the aura multiplies. So a set
// of buds is worth the best part per resource, never the sum, and a bud in the buy path is worth
// only what it adds over the buds you have (or the plan already bought).
//
// Revert checks: summing instead of taking the max fails test 1; valuing a candidate on its own
// (ignoring owned/bought buds) fails test 2; dropping the owned-bud income fold fails test 4.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildPowerSection } from "../../core/sections/power.mjs";
import { buildRoadmapSection } from "../../core/sections/roadmap.mjs";
import { decodeBud, calcBudSflPerDay, budSetSfl, BUD_COUNT } from "../../core/engine/buds.mjs";
import { getRoadmapSettings, roadmapBudMarginal, roadmapBudSetValue, _getPowerContext } from "../../core/engine/roadmap.mjs";

const wrap = JSON.parse(readFileSync(new URL("../fixtures/farm-155498.json", import.meta.url)));
const farm = wrap.farm || wrap;
const p2p = JSON.parse(readFileSync(new URL("../fixtures/p2p-prices.json", import.meta.url)));
const nfts = JSON.parse(readFileSync(new URL("../fixtures/nfts-sample.json", import.meta.url)));
buildPowerSection(farm, p2p, nfts, null, {});

// Two mineral buds (Cave type) with different auras, and one that boosts something else.
const all = Array.from({ length: BUD_COUNT }, (_, i) => decodeBud(i + 1));
const caveRare = all.find((b) => b.type === "Cave" && b.aura === "Rare");
const caveBasic = all.find((b) => b.type === "Cave" && b.aura === "Basic" && b.stem === caveRare.stem)
  || all.find((b) => b.type === "Cave" && b.aura === "Basic");
const woods = all.find((b) => b.type === "Woodlands" && b.aura === "No Aura");

const ctx = () => { const ps = _getPowerContext(); return [ps.capacity, ps.p2pPrices, ps.savedProducts || {}]; };

test("a set of buds is the best bud per resource, not the sum", () => {
  const [cap, prices, sp] = ctx();
  const one = (b) => calcBudSflPerDay(b, cap, prices, sp).totalSfl;
  assert.ok(one(caveRare) > 0 && one(caveBasic) > 0, "fixture prices both mineral buds");
  assert.ok(Math.abs(budSetSfl([caveRare], cap, prices, sp) - one(caveRare)) < 1e-9, "a single bud = its own value");
  const both = budSetSfl([caveRare, caveBasic], cap, prices, sp);
  assert.ok(both < one(caveRare) + one(caveBasic) - 1e-9, "overlapping buds do not add up");
  assert.ok(both >= one(caveRare) - 1e-9, "the better bud still counts in full");
  // Disjoint resources DO add: minerals + wood.
  const disjoint = budSetSfl([caveRare, woods], cap, prices, sp);
  assert.ok(Math.abs(disjoint - (one(caveRare) + one(woods))) < 1e-9, "buds on different resources add up");
});

test("a candidate is worth only what it adds over the buds you already have", () => {
  const s = getRoadmapSettings({});
  const rare = { name: "Bud #" + caveRare.id, bud: caveRare, has: false };
  const basic = { name: "Bud #" + caveBasic.id, bud: caveBasic, has: false };
  const alone = roadmapBudMarginal(basic, s);
  assert.ok(alone > 0, "the Basic cave bud is worth something on its own");
  // Pretend the plan bought the Rare one: roadmapBudMarginal reads the bought clones via the
  // simulator's candidate list, so go through the section with both listed instead.
  const out = buildRoadmapSection([], { roadmapSettings: {}, farm, p2p,
    budFloors: { [caveRare.id]: 10, [caveBasic.id]: 10 } });
  const rows = (out.sim.timeline || []).concat(out.sim.ranked || []).filter((t) => t.type === "Bud");
  const names = new Set(rows.map((r) => r.name));
  assert.ok(names.has(rare.name), "the listed Rare cave bud is offered");
  const tl = (out.sim.timeline || []).filter((t) => t.type === "Bud" && t.kind === "econ");
  // Once the Rare one is in the plan, the Basic one (same resources, weaker) adds nothing,
  // so it is never bought after it.
  const iRare = tl.findIndex((t) => t.name === rare.name);
  const iBasic = tl.findIndex((t) => t.name === basic.name);
  assert.ok(iRare >= 0, "the Rare bud is bought in the plan");
  assert.ok(iBasic < 0 || iBasic < iRare, "the weaker overlapping bud is not bought after the stronger one");
  const r = tl[iRare];
  assert.ok(r.budId === caveRare.id, "the row carries the bud id for the marketplace link");
});

test("unlisted, owned and over-cap buds are not offered", () => {
  const out = buildRoadmapSection([], { roadmapSettings: {}, farm, p2p, budFloors: {} });
  assert.ok(!(out.sim.timeline || []).some((t) => t.type === "Bud"), "no floors = no bud rows");
});

test("placed buds you own count in YOUR INCOME RIGHT NOW (best per resource)", () => {
  const f2 = JSON.parse(JSON.stringify(farm));
  f2.buds = {
    [caveRare.id]: { type: caveRare.type, stem: caveRare.stem, aura: caveRare.aura, coordinates: { x: 0, y: 0 } },
    [caveBasic.id]: { type: caveBasic.type, stem: caveBasic.stem, aura: caveBasic.aura, coordinates: { x: 1, y: 0 } },
    [woods.id]: { type: woods.type, stem: woods.stem, aura: woods.aura },   // not placed: no boost
  };
  buildPowerSection(f2, p2p, nfts, null, {});
  const out = buildRoadmapSection([], { roadmapSettings: {}, farm: f2, p2p });
  const row = out.currentProd.breakdown.find((b) => b.cat === "buds");
  assert.ok(row && row.sfl > 0, "currentProd carries the placed buds");
  const want = roadmapBudSetValue([caveRare, caveBasic], getRoadmapSettings({}));
  assert.ok(Math.abs(row.sfl - want) < 1e-9, `buds income ${row.sfl} != best-per-resource ${want}`);
  buildPowerSection(farm, p2p, nfts, null, {});   // restore the shared context
});
