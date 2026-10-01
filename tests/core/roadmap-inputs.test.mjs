// OIL AND LAVA PITS ARE SELF-USE INPUTS, NOT INCOME.
//
// Neither can be sold (unitToSfl prices both at 0); the owner makes them for expansions and new
// nodes. So while checked in WHAT I FARM:
//   - YOUR INCOME RIGHT NOW is net of their running cost (it used to drop out as max(0, loss),
//     showing 127/day when the farm really nets ~100);
//   - an item touching them is worth the cost it saves for the same output.
//
// Revert checks: clamping the inputs back to 0 fails test 1; valuing a yield boost on its sale
// value (0) instead of the saving fails test 2.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildPowerSection } from "../../core/sections/power.mjs";
import { buildRoadmapSection } from "../../core/sections/roadmap.mjs";
import {
  getRoadmapSettings, roadmapInputCost, roadmapInputRun, roadmapInputSaving, roadmapOwnedEffects, _getPowerContext,
} from "../../core/engine/roadmap.mjs";

const wrap = JSON.parse(readFileSync(new URL("../fixtures/farm-155498.json", import.meta.url)));
const farm = wrap.farm || wrap;
const p2p = JSON.parse(readFileSync(new URL("../fixtures/p2p-prices.json", import.meta.url)));
const nfts = JSON.parse(readFileSync(new URL("../fixtures/nfts-sample.json", import.meta.url)));
buildPowerSection(farm, p2p, nfts, null, {});

test("income is net of the oil drills and the lava pits' fuel", () => {
  const out = buildRoadmapSection([], { roadmapSettings: {}, farm, p2p });
  const cp = out.currentProd;
  const s = getRoadmapSettings({});
  const oil = roadmapInputCost("oil", s), lava = roadmapInputCost("obsidian", s);
  assert.ok(oil > 0 && lava > 0, "fixture runs both");
  const byCat = Object.fromEntries((cp.inputs || []).map((x) => [x.cat, x.sfl]));
  assert.ok(Math.abs(byCat.oil + oil) < 1e-9 && Math.abs(byCat.obsidian + lava) < 1e-9, "inputs carry their cost as negatives");
  assert.ok(Math.abs(cp.total - (cp.gross - oil - lava)) < 1e-9, `total ${cp.total} = gross ${cp.gross} - ${oil} - ${lava}`);
  assert.ok(!cp.breakdown.some((b) => b.cat === "oil" || b.cat === "obsidian"), "never counted as sale income");

  // Unchecked = not run = no cost.
  const off = buildRoadmapSection([], { roadmapSettings: { excludeCats: ["oil", "obsidian"] }, farm, p2p });
  assert.ok(!(off.currentProd.inputs || []).length);
  assert.ok(Math.abs(off.currentProd.total - off.currentProd.gross) < 1e-9);
});

test("an item touching an input is worth the cost it saves for the same output", () => {
  const s = Object.assign(getRoadmapSettings({}), { effMode: "theoretical", effOverrides: {} });
  // Halving the lava fuel saves half the fuel bill.
  const lavaOwned = roadmapOwnedEffects("obsidian");
  const lava0 = roadmapInputRun("obsidian", lavaOwned, s).cost;
  const cut = roadmapInputSaving("obsidian", lavaOwned, [{ type: "lava_cost_reduction", cat: "obsidian", value: 0.5 }], s);
  assert.ok(Math.abs(cut - lava0 * 0.5) < 1e-9, `fuel -50% saves ${cut}, half of ${lava0}`);
  // More oil per drill: the same oil from fewer drills.
  const oilOwned = roadmapOwnedEffects("oil");
  const a = roadmapInputRun("oil", oilOwned, s);
  const more = [{ type: "yield_flat", cat: "oil", value: 1 }];
  const b = roadmapInputRun("oil", oilOwned.concat(more), s);
  assert.ok(b.units > a.units, "the boost yields more oil");
  const saving = roadmapInputSaving("oil", oilOwned, more, s);
  assert.ok(saving > 0, "a yield boost on oil is worth something although oil is never sold");
  assert.ok(Math.abs(saving - (a.cost - b.cost * a.units / b.units)) < 1e-9);
});

test("WHAT TO FARM shows them as red costs, not as sales", () => {
  const out = buildRoadmapSection([], { roadmapSettings: {}, farm, p2p });
  const s = getRoadmapSettings({});
  const oilRow = out.profitability.groups.find((g) => g.id === "mine").rows.find((r) => r.cat === "oil");
  assert.equal(oilRow.verdict, "input");
  assert.ok(Math.abs(oilRow.net + roadmapInputCost("oil", s)) < 1e-9);
  const lava = out.profitability.groups.find((g) => g.id === "other").rows.find((r) => r.label === "Lava pit");
  assert.ok(lava && Math.abs(lava.net + roadmapInputCost("obsidian", s)) < 1e-9);
});

test("the lava pits' oil is not paid twice when the farm drills its own oil", () => {
  const base = Object.assign(getRoadmapSettings({}), { effMode: "theoretical", effOverrides: {} });
  // Summer's fuel is 70 Oil + crops + Crimstone (the fixture is in autumn, whose fuel has no oil).
  const ps = _getPowerContext(), season0 = ps.season;
  ps.season = "summer";
  let own, bought;
  try {
    own = roadmapInputRun("obsidian", roadmapOwnedEffects("obsidian"), base);
    bought = roadmapInputRun("obsidian", roadmapOwnedEffects("obsidian"), Object.assign({}, base, { excludeCats: ["oil"] }));
  } finally { ps.season = season0; }
  // Oil unchecked: the fuel's oil is bought at market. Checked: it comes from the drills, which
  // the Oil input already costs, so only a shortfall beyond what they make may be added.
  assert.ok(bought.cost > own.cost, `own oil ${own.cost} must cost less than bought oil ${bought.cost}`);
  const s = getRoadmapSettings({});
  const out = buildRoadmapSection([], { roadmapSettings: {}, farm, p2p });
  assert.ok(Math.abs(out.currentProd.total - (out.currentProd.gross - roadmapInputCost("oil", s) - roadmapInputCost("obsidian", s))) < 1e-9);
});
