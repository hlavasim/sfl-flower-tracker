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
  // Costs verified against the SHIPPED game (getSkillUpgradeCost + UPGRADE_POINTS_BY_TIER):
  // a rank-up costs 1/3/6 points by tier — the pre-release tier*3 (3/6/9) overcharged everything.
  assert.equal(fm.cost.points, 3, "tier 2 costs 3 points (UPGRADE_POINTS_BY_TIER)");
  assert.equal(fm.cost.shards, 2, "and tier ascension shards");
  assert.deepEqual(fm.rows.map((r) => r.lvl), [2, 3], "rows are the UPGRADES, so they start at 2");

  const l2 = fm.rows[0];
  assert.equal(l2.text, "Level 2: −30% cost (was −20% cost)", "the label the Power page shows");
  // ROI is the points' SFL cost over the daily gain — never Infinity on the wire.
  assert.ok(Math.abs(l2.sflCost - out.skillCostInfo.sflPerPoint * 3) < 1e-9, "cost = points x sflPerPoint");
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

test("the rank helpers match the SHIPPED game, not the pre-release build", () => {
  // Verified against bumpkinSkills.ts (main, 2026-08-03). Points per rank-up are 1/3/6 by
  // tier (UPGRADE_POINTS_BY_TIER) — "Je to 1-3-6" — and shards equal the tier. The old
  // tier*3 (3/6/9) came from a pre-release build and overcharged every rank on the page.
  assert.deepEqual(skillUpgradeCost(1), { shards: 1, points: 1 });
  assert.deepEqual(skillUpgradeCost(2), { shards: 2, points: 3 });
  assert.deepEqual(skillUpgradeCost(3), { shards: 3, points: 6 });
  // costMultiplier stores the REMAINING fraction: 0.8 -> 0.7 is 20% -> 30% off, i.e. 1.5x.
  assert.ok(Math.abs(skillRankFactor(SKILL_UPGRADES["Frugal Miner"], 2) - 1.5) < 1e-9);
  assert.equal(skillRankText(SKILL_UPGRADES["Frugal Miner"], 3), "Level 3: −40% cost (was −30% cost)");
});

test("the rank table is the shipped game's, complete and with the release-day edits", () => {
  // The pre-release table had 66 skills and four of them shipped with different magnitudes.
  // Regenerated from BUMPKIN_REVAMP_SKILL_TREE: 143 upgradeable skills.
  assert.equal(Object.keys(SKILL_UPGRADES).length, 143);
  assert.deepEqual(SKILL_UPGRADES["Fruity Woody"].ranks, [1, 1.25, 1.5]);
  assert.deepEqual(SKILL_UPGRADES["Greenhouse Gamble"].ranks, [30, 40, 50]);
  assert.deepEqual(SKILL_UPGRADES["No Axe No Worries"].ranks, [1, 0.9, 0.8]);
  assert.deepEqual(SKILL_UPGRADES["Tree Turnaround"].ranks, [15, 25, 35]);
  // Bespoke effect shapes (aoe, buff/debuff pairs) are present for their cost ladders but are
  // NOT priceable — no invented value may ship for them.
  assert.equal(SKILL_UPGRADES["Chonky Scarecrow"].kind, "aoe");
  assert.equal(SKILL_UPGRADES["Clucky Grazing"].kind, "costWithDebuff");
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

test("skills reach the buy path, priced by the XP their points cost — never free", async () => {
  /*
   * They were excluded on the grounds that they cost skill POINTS, not FLOWER. Half right, and the
   * wrong half matters: a point is BOUGHT with the FLOWER of the food you cook for the XP, and
   * skillCostInfo already derives that rate — so a skill has a real FLOWER price and competes with
   * an NFT on equal terms.
   *
   * What it does NOT get is a discount for points you already hold. See below.
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

  const plain = cands.filter((c) => !c.skillRank);
  const ranks = cands.filter((c) => c.skillRank);
  assert.ok(plain.length > 0 && ranks.length > 0, "both kinds are produced");

  /*
   * A point you already HOLD does not make the skill free, and this is the assertion that matters.
   *
   * Two earlier versions discounted it — first "does it fit entirely in the free points?", then
   * partial coverage — and both were the same error in different clothes: it is like calling an NFT
   * free because you happen to hold enough FLOWER. The buy path prices an NFT at its floor whatever
   * your balance is; a skill point cost XP to earn and that XP has a FLOWER price.
   *
   * Zeroing it also broke the ordering it was supposed to help. Cost 0 makes payback 0, so on the
   * reference farm eight +0.03/day skills sorted above every real purchase.
   */
  for (const c of plain) {
    assert.ok(c.floor > 0, `${c.name}: a skill is never free`);
    assert.ok(Math.abs(c.floor - c.skillPoints * sflPerPoint) < 1e-9,
      `${c.name}: ${c.floor} must be ${c.skillPoints} x ${sflPerPoint}`);
    assert.equal(c.skillFree, false, `${c.name}: nothing is flagged free any more`);
  }

  /*
   * Holding the points is still reported — it is what the reader wants to know — as a FLAG that
   * cannot touch the cost or the ordering.
   *
   * The flag answers "can I take this RIGHT NOW?", which is a question of FIT, not of value per
   * point: on the reference farm one spare point cannot take Hectare Farm (3pt) however good it is,
   * so the flag lands on a 1pt skill instead. That is correct — it is a fact about what you can
   * click today, and precisely because it no longer moves the price it cannot distort the order.
   */
  const takeNow = cands.filter((c) => c.skillTakeNow);
  const later = plain.filter((c) => !c.skillTakeNow);
  const freePts = Math.max(0, (pd.skillCostInfo.level - 1) - pd.boostItems.filter((b) => b.type === "Skill" && b.has).reduce((s, b) => s + (b.skillPoints || 1), 0));
  for (const c of takeNow) {
    assert.ok(c.skillPoints <= freePts, `${c.name}: ${c.skillPoints}pt must fit in the ${freePts} you hold`);
  }
  // Two skills with the same point cost must cost the same, flagged or not. That is the whole fix.
  for (const a of takeNow) for (const b of later) {
    if (a.skillPoints === b.skillPoints) assert.equal(a.floor, b.floor, "the flag does not change the price");
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
    /*
     * Every remaining rank is offered now, not just the next one \u2014 hiding the ladder was the wrong
     * answer to sequencing, the same mistake the ascension list made. What must hold is that a rank
     * is never one you already own, and that L2/L3 form a chain the planner and the display keep in
     * order (checked at the end of this test).
     */
    const base = c.name.replace(/ \u2192 Level \d+$/, "");
    const sr = pd.skillRanks[base];
    assert.ok(sr, `${base}: served rank data`);
    assert.ok(c.skillRank >= sr.nextLevel, `${base}: L${c.skillRank} is not already owned (next is ${sr.nextLevel})`);
    assert.equal(c.chainId, `rank:${base}`, `${base}: sits in its own chain`);

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

  // A skill offering both ranks numbers them 0,1 in ladder order, so nothing can place L3 first.
  const byBase = {};
  for (const c of ranks) {
    const b = c.name.replace(/ → Level \d+$/, "");
    (byBase[b] = byBase[b] || []).push(c);
  }
  const multi = Object.entries(byBase).filter(([, cs]) => cs.length > 1);
  assert.ok(multi.length > 0, "some skill offers more than one remaining rank");
  for (const [b, cs] of multi) {
    const sorted = cs.slice().sort((x, y) => x.chainSeq - y.chainSeq);
    for (let i = 0; i < sorted.length; i++) {
      assert.equal(sorted[i].chainSeq, i, `${b}: chain positions are 0..n`);
      if (i) assert.ok(sorted[i].skillRank > sorted[i - 1].skillRank, `${b}: chainSeq follows the rank`);
    }
  }
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
  /*
   * Ordering, stated exactly, because the naive version of this assertion is wrong.
   *
   * The list is payback-sorted, and then each CHAIN is put back into ladder order within the slots
   * the payback sort gave it. That second step necessarily moves a chain member into a slot its
   * sibling earned, so a chain row can sit next to a row with a better payback — including a row
   * from a DIFFERENT chain (measured: Fireside Alchemist L2 at 381 d landing above Speed Miner L2 at
   * 217 d). That is the price of keeping "L3 after L2" true, and it is the right trade.
   *
   * So: rows that are in no chain are payback-ordered against each other, and a chain is internally
   * in ladder order. Nothing stronger is claimed.
   */
  for (let i = 1; i < skillRows.length; i++) {
    const a = skillRows[i - 1], b = skillRows[i];
    if (a.chainId && a.chainId === b.chainId) {
      assert.ok(b.chainSeq > a.chainSeq, `${a.name} then ${b.name}: a chain stays in ladder order`);
      continue;
    }
    if (a.chainId || b.chainId) continue;   // a chain member occupies its sibling's slot; see above
    const pa = a.floor / (a.value || Infinity), pb = b.floor / (b.value || Infinity);
    assert.ok(pb >= pa - 1e-6, `ranked by payback: ${a.name} (${pa.toFixed(1)}d) before ${b.name} (${pb.toFixed(1)}d)`);
  }
  // And every chain in the table really is in ladder order, not merely adjacent-consistent.
  const seen = {};
  for (const m of skillRows) {
    if (!m.chainId) continue;
    if (seen[m.chainId] != null) assert.ok(m.chainSeq > seen[m.chainId], `${m.name}: after its earlier rank`);
    seen[m.chainId] = m.chainSeq;
  }
  /*
   * And NO row is free. A zero cost makes payback zero, so on the reference farm eight +0.03/day
   * skills sorted above every real purchase — the same error as calling an NFT free because you
   * happen to hold the FLOWER.
   */
  for (const m of skillRows) assert.ok(m.floor > 0, `${m.name}: priced, not free (${m.floor})`);
  // Holding the points survives into the table as a flag, so the reader still learns it.
  assert.ok(skillRows.some((m) => m.skillTakeNow), "some row says the points are already yours");
});
