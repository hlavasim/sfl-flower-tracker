// SICKNESS RELIEF MUST BE VALUABLE BEFORE YOU OWN IT.
//
// calcSicknessCost matched item NAMES on owned items, so an unowned Sleepy Chicken or Medic
// Apron scored exactly 0 in every "what if I buy it" probe — same defect free_feed fixed for
// Gold Egg in calcAnimalFeedCost. Now an optional `effects` list is the single source for
// item-borne relief (owned + probed together), and the name checks only run when no list comes.
//
// And the startup counterfactual needs animals that actually EAT: yield, feed and sickness all
// iterate capacity.animalDetails, so swapping only the count gave 20 chickens that ate nothing —
// every feed/sickness item valued 0 and the "at max" net was overstated by the whole feed bill.
// The planner now synthesizes a level-15 herd ("počítej s chickens jen na 15 levelu").
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { calcSicknessCost } from "../../core/engine/power-costs.mjs";
import { buildPowerSection } from "../../core/sections/power.mjs";
import { buildRoadmapSection } from "../../core/sections/roadmap.mjs";

const p2p = { Lemon: "0.02", Honey: "0.16" };
const cap = { animalDetails: { chickens: Array.from({ length: 10 }, () => ({ level: 15 })) } };

test("sickness_prevention effect zeroes the cost for an UNOWNED item", () => {
  const base = calcSicknessCost("chickens", cap, p2p, [], {}, []);
  assert.ok(base.costPerDay > 0, "ten L15 chickens cost something in cures");
  const prevented = calcSicknessCost("chickens", cap, p2p, [], {}, [{ type: "sickness_prevention", value: 1, cat: "chickens" }]);
  assert.equal(prevented.costPerDay, 0);
  assert.equal(prevented.prevented, true);
});

test("sickness_reduction effect halves the cure cost; other-category effects are ignored", () => {
  const base = calcSicknessCost("chickens", cap, p2p, [], {}, []);
  const halved = calcSicknessCost("chickens", cap, p2p, [], {}, [{ type: "sickness_reduction", value: 0.5, cat: "chickens" }]);
  assert.ok(Math.abs(halved.costPerDay - base.costPerDay / 2) < 1e-12);
  const other = calcSicknessCost("chickens", cap, p2p, [], {}, [{ type: "sickness_reduction", value: 0.5, cat: "cows" }]);
  assert.equal(other.costPerDay, base.costPerDay);
});

test("with an effects list, owned item NAMES are not double-counted", () => {
  const owned = [{ name: "Medic Apron", has: true }];
  const base = calcSicknessCost("chickens", cap, p2p, owned, {}, []);
  const noList = calcSicknessCost("chickens", cap, p2p, owned, {});
  // effect mode ignores the name; name mode halves. Both are deliberate.
  assert.ok(Math.abs(noList.costPerDay - base.costPerDay / 2) < 1e-12);
});

test("startup counterfactual feeds a level-15 herd — feed items gain, baseline goes red", () => {
  const wrap = JSON.parse(readFileSync(new URL("../fixtures/farm-155498.json", import.meta.url)));
  const farm = wrap.farm || wrap;
  const fxP2p = JSON.parse(readFileSync(new URL("../fixtures/p2p-prices.json", import.meta.url)));
  const nfts = JSON.parse(readFileSync(new URL("../fixtures/nfts-sample.json", import.meta.url)));
  buildPowerSection(farm, fxP2p, nfts, null, {});
  const out = buildRoadmapSection([], { roadmapSettings: {}, farm, p2p: fxP2p });
  const ch = out.startup.find((p) => p.cat === "chickens");
  assert.ok(ch, "chickens plan exists");
  // 20 hungry L15 birds: the baseline must carry their feed bill, not the real 7 birds' one.
  // Real 7 birds net ≈ −0.87 at fixture prices; the synthetic herd of 20 runs ≈ ×20/7 deeper.
  // Reverting the herd synthesis puts nowNet back near −0.87 and this fails.
  assert.ok(ch.atMax > ch.count, `counterfactual over max (${ch.atMax}) not the real ${ch.count}`);
  assert.ok(ch.nowNet < -1.5, `baseline carries the full herd's feed bill (got ${ch.nowNet})`);
});
