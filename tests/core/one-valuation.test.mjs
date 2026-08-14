import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { buildPowerSection } from "../../core/sections/power.mjs";
import { calcBoostValue, roadmapItemValue, roadmapBuildClones, getRoadmapSettings } from "../../core/engine/roadmap.mjs";
import { getDefaultProduct } from "../../core/engine/power-helpers.mjs";

/*
 * The buy path and the Power page must answer "what is this boost worth" with ONE function.
 *
 * They used to hand-roll separate marginals. Measured across the live catalogue before the fix,
 * 73 of the 79 items carried by both (92%) disagreed — ratios from 0.00 to 4.92, median 0.80,
 * Crimstone Spikes Hair at 3.93/day in the buy path against 12.89 on Power. A plan ordered by
 * numbers the user cannot see anywhere is not a plan.
 *
 * Pinned at the theoretical basis so this measures the VALUATION only: the measured-throughput
 * scaling is a separate multiplier and has its own test.
 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const wrap = JSON.parse(readFileSync(path.join(ROOT, "tests/fixtures/farm-155498.json"), "utf8"));
const p2p = JSON.parse(readFileSync(path.join(ROOT, "tests/fixtures/p2p-prices.json"), "utf8"));

test("roadmapItemValue equals the sum of calcBoostValue over the item's categories", () => {
  const out = buildPowerSection(wrap.farm || wrap, p2p, { collectibles: [], wearables: [] }, null, {});
  const { catBoostsW } = roadmapBuildClones();
  // effMode theoretical => roadmapEffFactor is 1, so any gap is the valuation itself.
  const s = Object.assign(getRoadmapSettings({}), { effMode: "theoretical", effOverrides: {} });

  let compared = 0;
  const seen = new Set();
  for (const cat of Object.keys(catBoostsW)) {
    for (const clone of catBoostsW[cat]) {
      if (seen.has(clone.name)) continue;
      seen.add(clone.name);
      if (clone.fixedMarginal !== undefined) continue;

      let expected = 0;
      for (const c of clone.categories || []) {
        const list = catBoostsW[c];
        if (!list || !clone.effects.some((e) => e.cat === c)) continue;
        try {
          // The exact product roadmapItemValue passes, so the equality holds now that crop
          // boosts are valued per-product: savedProducts[cat] || getDefaultProduct(cat).
          const product = (out.savedProducts && out.savedProducts[c]) || getDefaultProduct(c);
          const v = calcBoostValue(clone, c, product, out.capacity, out.p2pPrices, list, clone.has);
          if (v && isFinite(v.synergy) && v.synergy > 0) expected += v.synergy;
        } catch { /* same swallow the engine does */ }
      }
      const got = roadmapItemValue(clone, catBoostsW, s);
      if (expected === 0 && got === 0) continue;
      compared++;
      assert.ok(Math.abs(got - expected) < 1e-9,
        `${clone.name}: buy path ${got} vs calcBoostValue ${expected} — the two valuations drifted apart again`);
    }
  }
  assert.ok(compared > 20, `expected to compare a real catalogue, only got ${compared} items`);
});

test("the buy path no longer runs its own mining-chain delta", () => {
  /*
   * The duplicate path was a whole-chain delta for the mining tiers. If it comes back,
   * roadmapItemValue starts disagreeing with Power again on exactly the free-tool and
   * multi-tier items, which is the hardest class to notice by eye.
   */
  for (const name of ["core/engine/roadmap.mjs", "flowers.html"]) {
    const src = readFileSync(path.join(ROOT, name), "utf8");
    const i = src.indexOf("function roadmapItemValue");
    assert.ok(i > 0, `${name}: roadmapItemValue present`);
    const body = src.slice(i, i + 2000);
    assert.ok(!/roadmapMiningChain/.test(body), `${name}: must not re-derive a mining chain of its own`);
    assert.match(body, /calcBoostValue\(/, `${name}: must delegate to calcBoostValue`);
  }
});
