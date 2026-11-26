import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { itemProductionCost, computeRodCostSFL, computeBaitCostSFL } from "../../core/engine/item-value.mjs";
import { buildCookingSection } from "../../core/sections/cooking.mjs";

// BUMPKIN "ryby jen za reely": a fish costs one cast (rod + the plain worm it bites on) divided by
// the fish a cast yields — no chum, no odds, no Fish Market bait. "What it costs if I just cook
// whatever I happen to catch", not the systematic hunt for one named fish.

const p2p = JSON.parse(readFileSync(new URL("../fixtures/p2p-prices.json", import.meta.url)));
const wrap = JSON.parse(readFileSync(new URL("../fixtures/farm-155498.json", import.meta.url)));
const farm = wrap.farm || wrap;
const CPS = 1061.0079575596817;
const skills = { "Reel Deal": 1 };
const yieldBy = { basic: 2, advanced: 1.5, expert: 1.25 };
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} vs ${b}`);

test("a basic fish: (rod + Earthworm) / basic yield; source names the mode", () => {
  const r = itemProductionCost("Anchovy", p2p, CPS, skills, undefined, { fishReelsOnly: true, fishYieldByTier: yieldBy });
  close(r.price, (computeRodCostSFL(p2p, CPS, skills) + computeBaitCostSFL("Earthworm", p2p)) / 2);
  assert.strictEqual(r.source, "fish-reel");
  assert.strictEqual(r.yieldPerCast, 2);
});

test("a rare expert fish is no longer priced by its odds: (rod + Grub) / expert yield", () => {
  const off = itemProductionCost("Barred Knifejaw", p2p, CPS, skills, undefined, { fishYieldByTier: yieldBy });
  const on = itemProductionCost("Barred Knifejaw", p2p, CPS, skills, undefined, { fishReelsOnly: true, fishYieldByTier: yieldBy });
  close(on.price, (computeRodCostSFL(p2p, CPS, skills) + computeBaitCostSFL("Grub", p2p)) / 1.25);
  assert.ok(off.price > on.price * 100, `odds-priced ${off.price} vs reel ${on.price}`);
});

test("the cooking section passes the switch through: the Aging Shed gets cheaper, not dearer", () => {
  const base = buildCookingSection(farm, p2p, { coinsPerSFL: CPS });
  const reel = buildCookingSection(farm, p2p, { coinsPerSFL: CPS, fishReelsOnly: true });
  const cost = (p) => Object.fromEntries(p.buildings["Aging Shed"].recipes.map((r) => [r.name, r.cost]));
  const a = cost(base), b = cost(reel);
  const fishy = Object.keys(a).filter((n) => a[n] != null && b[n] != null && a[n] !== b[n]);
  assert.ok(fishy.length > 0, "some aged dish changed price");
  for (const n of fishy) assert.ok(b[n] <= a[n] + 1e-9, `${n}: ${b[n]} > ${a[n]}`);
  assert.strictEqual(reel.fishReelsOnly, true);
});
