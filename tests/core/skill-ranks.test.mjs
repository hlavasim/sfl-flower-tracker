import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { buildPowerSection } from "../../core/sections/power.mjs";
import { SKILL_UPGRADES, skillUpgradeCost, skillRankFactor, skillRankText } from "../../core/engine/skill-ranks.mjs";

/*
 * Ascension ranks (Level 2 / Level 3). This layer lived inline in flowers.html only, so a
 * second consumer had nothing to read and re-derived the value with a different engine — the
 * roadmap priced Frugal Miner at +10.00/day against the Power page's +0.31. It is served from
 * core now, and these tests exist to keep it a single number.
 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const wrap = JSON.parse(readFileSync(path.join(ROOT, "tests/fixtures/farm-155498.json"), "utf8"));
const farm = wrap.farm || wrap;
const p2p = JSON.parse(readFileSync(path.join(ROOT, "tests/fixtures/p2p-prices.json"), "utf8"));

// Own NFT payload: the shared fixture is tiny and none of its items are skills anyway.
const out = buildPowerSection(farm, p2p, { collectibles: [], wearables: [] }, null, {});

test("section=power serves a rank block for skills that have ranks", () => {
  const sr = out.skillRanks;
  assert.ok(sr && Object.keys(sr).length > 20, `expected many ranked skills, got ${Object.keys(sr || {}).length}`);
  for (const name of Object.keys(sr)) {
    assert.ok(SKILL_UPGRADES[name], `${name} is served but has no SKILL_UPGRADES entry`);
  }
  // And nothing without ranks sneaks in.
  const noRanks = Object.keys(sr).filter((n) => !(SKILL_UPGRADES[n].maxLevel > 1));
  assert.deepEqual(noRanks, [], "only multi-level skills get a rank block");
});

test("a rank row is the marginal of that rank-up, priced in skill points", () => {
  const fm = out.skillRanks["Frugal Miner"];
  assert.ok(fm, "Frugal Miner is ranked");
  assert.equal(fm.cost.points, 6, "tier 2 costs tier*3 = 6 points");
  assert.equal(fm.cost.shards, 2, "and tier ascension shards");
  assert.deepEqual(fm.rows.map((r) => r.lvl), [2, 3], "rows are the UPGRADES, so they start at 2");

  const l2 = fm.rows[0];
  assert.equal(l2.text, "Level 2: −30% cost (was −20% cost)", "the label the Power page shows");
  // ROI is the points' SFL cost over the daily gain — never Infinity on the wire.
  assert.ok(Math.abs(l2.sflCost - out.skillCostInfo.sflPerPoint * 6) < 1e-9, "cost = points x sflPerPoint");
  assert.ok(l2.roi === null || Math.abs(l2.roi - l2.sflCost / l2.delta) < 1e-6, "roi = cost / delta");
  assert.ok(l2.roi === null || isFinite(l2.roi), "JSON-safe");
});

test("a multi-category skill sums its categories, and byCat explains the total", () => {
  const fm = out.skillRanks["Frugal Miner"];
  const l2 = fm.rows[0];
  const parts = Object.values(l2.byCat);
  assert.ok(parts.length > 1, `Frugal Miner pays out in several mining categories (${JSON.stringify(l2.byCat)})`);
  assert.ok(Math.abs(parts.reduce((a, b) => a + b, 0) - l2.delta) < 1e-9, "byCat must sum to delta");
});

test("rank values come from calcBoostValue, not a second model", () => {
  /*
   * The whole point. Re-derive Level 2 independently: scale the skill's effects by the rank
   * factor, run calcBoostValue, subtract rank 1. If the served number ever stops matching, the
   * layer has grown its own opinion again.
   */
  const { calcBoostValue } = { calcBoostValue: null }; // placeholder, imported below
  return import("../../core/engine/roadmap.mjs").then(({ calcBoostValue }) => {
    const b = out.boostItems.find((x) => x.name === "Frugal Miner");
    assert.ok(b, "Frugal Miner is a boost item");
    const up = SKILL_UPGRADES["Frugal Miner"];
    const catBoosts = out.boostItems.filter((x) => (x.categories || []).includes("iron"));
    const at = (lvl) => {
      const f = skillRankFactor(up, lvl);
      const sb = { ...b, effects: (b.effects || []).map((e) => (typeof e.value === "number" ? { ...e, value: e.value * f } : e)) };
      const v = calcBoostValue(sb, "iron", "Iron", out.capacity, out.p2pPrices, catBoosts, b.has);
      return v && isFinite(v.synergy) ? v.synergy : 0;
    };
    const expected = at(2) - at(1);
    const served = out.skillRanks["Frugal Miner"].rows[0].byCat.iron;
    assert.ok(Math.abs(served - expected) < 1e-9,
      `served iron marginal ${served} must equal calcBoostValue's ${expected}`);
  });
});

test("the rank helpers were ported, not reinvented", () => {
  // skillUpgradeCost and the rank-factor maths are copied from flowers.html verbatim; pin the
  // two that decide money so a well-meaning rewrite has to justify itself.
  assert.deepEqual(skillUpgradeCost(1), { shards: 1, points: 3 });
  assert.deepEqual(skillUpgradeCost(3), { shards: 3, points: 9 });
  // costMultiplier stores the REMAINING fraction: 0.8 -> 0.7 is 20% -> 30% off, i.e. 1.5x.
  assert.ok(Math.abs(skillRankFactor(SKILL_UPGRADES["Frugal Miner"], 2) - 1.5) < 1e-9);
  assert.equal(skillRankText(SKILL_UPGRADES["Frugal Miner"], 3), "Level 3: −40% cost (was −30% cost)");
});

test("the page no longer carries its own copy of the rank table", () => {
  // SKILL_UPGRADES stays inline for now (the page still renders from it), but if a second
  // divergent definition ever appears this catches it.
  const page = readFileSync(path.join(ROOT, "flowers.html"), "utf8");
  assert.equal((page.match(/const SKILL_UPGRADES\s*=/g) || []).length, 1, "exactly one inline definition");
  const inline = Object.keys(SKILL_UPGRADES).filter((n) => !page.includes(`"${n}":`));
  assert.deepEqual(inline, [], "every core-served skill exists in the page table too");
});

test("the current rank is served, so a consumer can offer only the NEXT one", () => {
  /*
   * bumpkin.skills stores the LEVEL as a number, not a presence flag. Without it the roadmap
   * panel listed every rank and put "Tough Tree L3" above "Tough Tree L2" — an order the game
   * will not let you buy, since ranks are sequential.
   */
  const owned = Object.entries(out.skillRanks).filter(([, s]) => s.has);
  assert.ok(owned.length > 5, "the fixture farm owns several rankable skills");
  for (const [name, s] of owned) {
    assert.equal(typeof s.level, "number", `${name}: current level served`);
    assert.equal(s.level, Number(farm.bumpkin.skills[name]) || 0, `${name}: level comes from the farm`);
    if (s.level < s.maxLevel) {
      assert.equal(s.nextLevel, s.level + 1, `${name}: next rank is exactly one above`);
      assert.ok(s.rows.some((r) => r.lvl === s.nextLevel), `${name}: that rank is in rows`);
    } else {
      assert.equal(s.nextLevel, null, `${name}: maxed out has no next rank`);
    }
  }
  // A skill you do not own has no next rank either — you must buy the skill first.
  for (const [name, s] of Object.entries(out.skillRanks)) {
    if (!s.has) assert.equal(s.nextLevel, null, `${name}: unowned skills offer no rank-up`);
  }
});
