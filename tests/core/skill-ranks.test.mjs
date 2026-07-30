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

// ── skills and ascension ranks in the BUY PATH ──

test("skills reach the buy path: free points cost nothing, unheld points cost their XP", async () => {
  /*
   * They were excluded on the grounds that they cost skill POINTS, not FLOWER. Half right, and the
   * wrong half matters: a point is BOUGHT with the FLOWER of the food you cook for the XP, and
   * skillCostInfo already derives that rate. So there are two kinds of action and collapsing them
   * is what made this look impossible — a point you already hold makes the skill FREE and
   * therefore first, while one you don't costs points × sflPerPoint and competes with an NFT.
   */
  const { buildPowerSection } = await import("../../core/sections/power.mjs");
  const rm = await import("../../core/engine/roadmap.mjs");
  const { POWER_CATEGORIES } = await import("../../core/engine/power-helpers.mjs");
  const nfts = JSON.parse(readFileSync(new URL("../fixtures/nfts-sample.json", import.meta.url)));
  const pd = buildPowerSection(farm, p2p, nfts, null, {});

  const clones = pd.boostItems.map((b) => ({ ...b }));
  const byName = {}; for (const c of clones) byName[c.name] = c;
  const catBoostsW = {};
  for (const cat of Object.keys(POWER_CATEGORIES)) catBoostsW[cat] = clones.filter((c) => c.categories.includes(cat));

  const cands = rm.roadmapSkillCandidates(rm.getRoadmapSettings({}), byName, catBoostsW);
  assert.ok(cands.length > 10, `skills are offered at all, got ${cands.length}`);

  const sflPerPoint = pd.skillCostInfo.sflPerPoint;
  assert.ok(sflPerPoint > 0, "the fixture derives an XP price");

  const free = cands.filter((c) => c.skillFree);
  const paid = cands.filter((c) => !c.skillFree && !c.skillRank);
  const ranks = cands.filter((c) => c.skillRank);
  assert.ok(paid.length > 0 && ranks.length > 0, "both kinds are produced");

  // 1. A free one costs literally nothing, so the queue must put it first.
  for (const c of free) assert.equal(c.floor, 0, `${c.name}: a point you hold is not a cost`);
  // 2. Cost is only the points you must still BUY — free ones can cover a skill PARTIALLY.
  for (const c of cands) {
    if (c.skillRank) continue; // ranks add shards, checked in the next test
    const pay = c.skillPoints - (c.skillPointsFree || 0);
    assert.ok(Math.abs(c.floor - pay * sflPerPoint) < 1e-9, `${c.name}: ${c.floor} vs ${pay} x ${sflPerPoint}`);
  }
  /*
   * 3. Free points go to the best return per POINT, and they cover a skill PARTIALLY. The first
   *    version asked "does this skill fit ENTIRELY in the free points?", so a single spare point
   *    could not touch the best per-point skill (Hectare Farm, 3pt, +1.60/pt) and was spent on the
   *    best 1pt skill it happened to fit (Young Farmer, +0.03/pt) — 50x worse advice. A point is
   *    not indivisible across a cost: holding one makes Hectare Farm cost TWO points, not three.
   */
  const covered = cands.filter((c) => (c.skillPointsFree || 0) > 0);
  const uncovered = cands.filter((c) => !(c.skillPointsFree > 0) && !c.skillRank);
  if (covered.length && uncovered.length) {
    const worstCovered = Math.min(...covered.map((c) => c.clone.fixedMarginal / c.skillPoints));
    const bestUncovered = Math.max(...uncovered.map((c) => c.clone.fixedMarginal / c.skillPoints));
    assert.ok(worstCovered >= bestUncovered - 1e-9,
      `free points went to the best per point (worst covered ${worstCovered}, best uncovered ${bestUncovered})`);
  }
  // A partially covered skill is cheaper than full price but not free — the distinction is the fix.
  for (const c of covered) {
    if (c.skillPointsFree < c.skillPoints) {
      assert.ok(c.floor > 0 && c.floor < c.skillPoints * sflPerPoint, `${c.name}: discounted, not free`);
    }
  }
  // 4. Only positive-value skills are a BUY action. A harmful skill is a reset, not a purchase.
  for (const c of cands) assert.ok(c.clone.fixedMarginal > 0, `${c.name}: no zero/harmful rows in a buy order`);
});

test("ascension ranks are sequential and their shard price is a labelled derivation", async () => {
  const { buildPowerSection } = await import("../../core/sections/power.mjs");
  const rm = await import("../../core/engine/roadmap.mjs");
  const { POWER_CATEGORIES } = await import("../../core/engine/power-helpers.mjs");
  const nfts = JSON.parse(readFileSync(new URL("../fixtures/nfts-sample.json", import.meta.url)));
  const pd = buildPowerSection(farm, p2p, nfts, null, {});
  const clones = pd.boostItems.map((b) => ({ ...b }));
  const byName = {}; for (const c of clones) byName[c.name] = c;
  const catBoostsW = {};
  for (const cat of Object.keys(POWER_CATEGORIES)) catBoostsW[cat] = clones.filter((c) => c.categories.includes(cat));
  const ranks = rm.roadmapSkillCandidates(rm.getRoadmapSettings({}), byName, catBoostsW).filter((c) => c.skillRank);
  assert.ok(ranks.length > 0);

  const sflPerPoint = pd.skillCostInfo.sflPerPoint;
  for (const c of ranks) {
    // Only the NEXT rank may be offered. Listing Level 3 before Level 2 is an order you cannot follow.
    const base = c.name.replace(/ \u2192 Level \d+$/, "");
    const sr = pd.skillRanks[base];
    assert.ok(sr, `${base}: served rank data`);
    assert.equal(c.skillRank, sr.nextLevel, `${base}: only level ${sr.nextLevel} is buyable next`);

    // Cost = the points' XP + the shards. Shards have no market, so the price is a DERIVATION and
    // must travel with the row that uses it — a number without its assumption is a quote.
    assert.ok(c.shards > 0, `${c.name}: a rank costs shards`);
    assert.ok(Math.abs(c.floor - (c.skillPoints * sflPerPoint + c.shards * c.shardSfl)) < 1e-9,
      `${c.name}: floor is points + shards`);
    assert.ok(/odvozen/.test(c.shardNote || ""), `${c.name}: says it is a derivation, not a market price`);
    assert.ok(c.shardSfl > 0, "and the shard has a price at all");
  }
  // The derivation itself: a Gold Pickaxe's MATERIALS (3 Wood + 3 Gold), not its coins — coins are
  // free on this farm by the roadmap's own rule, so charging them would contradict the page.
  const expect = 3 * p2p["Wood"] + 3 * p2p["Gold"];
  assert.ok(Math.abs(ranks[0].shardSfl - expect) < 1e-9, `shard = Gold Pickaxe materials (${expect})`);
});

test("and they reach sim.ranked — the table, not just a candidate list", async () => {
  /*
   * The point of the exercise: "ascention a skill do tý tabulky". Producing candidates is not
   * enough — roadmapSimulate has to fold them into the ranked order the Table view renders, and
   * the free-point rows must NOT be dropped by the `floor > 0` guard the node actions use, since a
   * zero cost is exactly what puts free income at the front.
   */
  const { buildPowerSection } = await import("../../core/sections/power.mjs");
  const rm = await import("../../core/engine/roadmap.mjs");
  const nfts = JSON.parse(readFileSync(new URL("../fixtures/nfts-sample.json", import.meta.url)));
  buildPowerSection(farm, p2p, nfts, null, {});   // publishes the power context roadmapSimulate reads

  const sim = rm.roadmapSimulate(rm.getRoadmapSettings({ incCollectibles: true, incWearables: true }), 0);
  const rows = (sim.ranked || []).map((x) => x.m || x);
  const skillRows = rows.filter((m) => m.type === "Skill");
  assert.ok(skillRows.length > 20, `skills are in the ranked order, got ${skillRows.length}`);

  // Both kinds made it: a plain skill and an ascension rank.
  assert.ok(skillRows.some((m) => !/ Level \d+$/.test(m.name)), "plain skills");
  assert.ok(skillRows.some((m) => / Level \d+$/.test(m.name)), "ascension ranks");

  // The order is by payback like everything else, so the best skill must not sit below a worse one.
  const paybacks = skillRows.map((m) => m.floor / (m.value || Infinity));
  for (let i = 1; i < paybacks.length; i++) {
    assert.ok(paybacks[i] >= paybacks[i - 1] - 1e-6,
      `ranked by payback: ${skillRows[i - 1].name} (${paybacks[i - 1].toFixed(1)}d) before ${skillRows[i].name} (${paybacks[i].toFixed(1)}d)`);
  }
  // And a partially-free skill really is cheaper here than it would be at full price — the
  // free point has to survive all the way into the table, not just the candidate builder.
  const hectare = skillRows.find((m) => m.name === "Hectare Farm");
  if (hectare) assert.ok(hectare.floor < 3 * 59, `Hectare Farm carries its free point (${hectare.floor})`);
});
