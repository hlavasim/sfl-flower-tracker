import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import {
  bandXp, ascensionBaseline, ascensionStanding, getAscensionUpgradeCost,
  getAscensionExpansionRequirements, getExpansionCrystalCount, getAscensionExpansionDelta,
  V150_XP,
} from "../../core/engine/ascension.mjs";
import { buildAscensionSection, ASCENSION_UNLOCK_MS } from "../../core/sections/ascension.mjs";
import { buildPowerSection } from "../../core/sections/power.mjs";
import { buildCookingSection } from "../../core/sections/cooking.mjs";

const wrap = JSON.parse(readFileSync(new URL("../fixtures/farm-155498.json", import.meta.url)));
const farm = wrap.farm || wrap;
const p2p = JSON.parse(readFileSync(new URL("../fixtures/p2p-prices.json", import.meta.url)));
const nfts = JSON.parse(readFileSync(new URL("../fixtures/nfts-sample.json", import.meta.url)));

// ── engine pins: every number checked against the game source formulas ──

test("band XP model matches level.ts (50M × 1.45^(a-1), rounded to 5M)", () => {
  assert.equal(V150_XP, 94_333_905);
  assert.equal(bandXp(1), 50_000_000);
  assert.equal(bandXp(2), 75_000_000);
  assert.equal(bandXp(3), 105_000_000); // 105.125M → rounds to 105M
  assert.equal(ascensionBaseline(1), V150_XP);
  assert.equal(ascensionBaseline(3), V150_XP + 50_000_000 + 75_000_000);
});

test("standings on the fixture XP match the documented example (A1 L50 · A2 L28 · A3 L0)", () => {
  const xp = 179145036.4736665;
  assert.equal(ascensionStanding(xp, 1), 50);
  assert.equal(ascensionStanding(xp, 2), 28);
  assert.equal(ascensionStanding(xp, 3), 0);
});

test("upgrade cost: floor(base × 1.4^(a-1)) per upgradeFarm.ts", () => {
  assert.deepEqual(getAscensionUpgradeCost(1), { items: { Crimstone: 30, Oil: 50, Obsidian: 3 }, coins: 5000 });
  const a3 = getAscensionUpgradeCost(3);
  assert.deepEqual(a3.items, { Crimstone: Math.floor(30 * 1.96), Oil: Math.floor(50 * 1.96), Obsidian: Math.floor(3 * 1.96) });
});

test("expansion requirements: curve ends exact, coins ceil to 10, time e×7h", () => {
  const e31 = getAscensionExpansionRequirements(1, 31);
  assert.deepEqual(e31.resources, { Crimstone: 10, Oil: 50, Obsidian: 2 }); // curve start
  assert.equal(e31.coins, 5000);
  assert.equal(e31.seconds, 7 * 3600);
  assert.equal(e31.levelRequired, 1);
  const e42 = getAscensionExpansionRequirements(1, 42);
  assert.deepEqual(e42.resources, { Crimstone: 50, Oil: 400, Obsidian: 20 }); // curve end
  assert.equal(e42.coins, 75000);
  assert.equal(e42.seconds, 12 * 7 * 3600);
  assert.equal(e42.levelRequired, 45);
  // per-ascension growth ×1.3^(a-1), half-up rounding
  const a2e31 = getAscensionExpansionRequirements(2, 31);
  assert.equal(a2e31.resources.Crimstone, Math.round(10 * 1.3));
});

test("crystals: 1 at upgrade-band expansions e ≤ min(a+2,12); Beehive+Flower Bed pair in schedule", () => {
  assert.equal(getExpansionCrystalCount(1, 31), 1);
  assert.equal(getExpansionCrystalCount(1, 33), 1);  // e=3 = min(1+2,12)
  assert.equal(getExpansionCrystalCount(1, 34), 0);  // e=4 > 3
  assert.equal(getExpansionCrystalCount(10, 42), 1); // e=12 ≤ min(12,12)
  // schedule sanity: all 12 slots of A1 together deal the band totals
  let bee = 0, flower = 0;
  for (let e = 31; e <= 42; e++) {
    const d = getAscensionExpansionDelta(1, e);
    bee += d["Beehive"] || 0; flower += d["Flower Bed"] || 0;
  }
  assert.equal(bee, flower, "Beehive and Flower Bed always unlock together");
});

// ── section pins on the fixture farm (volcano, level 150, pre-swamp) ──

const powerData = buildPowerSection(farm, p2p, nfts, null, {});
const cooking = buildCookingSection(farm, p2p, { petSimulate: true });
const eff = { effByCat: { crimstone: { measured: true, ratio: 0.5 }, oil: { measured: true, ratio: 0.6 }, obsidian: { measured: true, ratio: 0.9 } }, meta: { days: 7 } };
const out = buildAscensionSection(farm, powerData, cooking.totalXpPerDay, eff, { max: 10 });

test("current state: pre-swamp farm is ready to ascend, standings served", () => {
  assert.equal(out.current.island, "volcano");
  assert.equal(out.current.ascensionLevel, 0);
  assert.equal(out.current.basicLand, 30);
  assert.equal(out.current.readyToAscend, true);
  assert.equal(out.current.bandStandings[1], 50);
  // raw XP alone gives A2 L28 (pinned above); the cooked food sitting in the
  // fixture inventory banks ~8.17M more XP (valued WITH the ×1.5 pet-streak
  // boost, since that's how it will be eaten) and lifts the standing to L33.
  assert.equal(out.current.bandStandings[2], 33);
});

test("banked food XP: cooked inventory counts toward levels, valued with pet boost", () => {
  assert.equal(Math.round(out.current.bankedFoodXp), 8170932);
  // the pin would fail if the pet ×1.5 were dropped: without it the bank is ~⅔ of this
  assert.ok(out.current.bankedFoodXp > 0);
});

test("rates: theoretical from power categories, effective = theo × measured ratio", () => {
  assert.ok(out.rates.Crimstone.theo > 0);
  assert.ok(Math.abs(out.rates.Crimstone.eff - out.rates.Crimstone.theo * 0.5) < 1e-9);
  assert.equal(out.rates.xpPerDay, cooking.totalXpPerDay);
});

test("frontier + bottleneck: stock covers steps up to the first shortage", () => {
  assert.ok(out.frontier, "some steps must be affordable from stock");
  assert.ok(out.bottleneck, "the fixture stock cannot cover all 10 ascensions");
  // frontier step's cumulative cost is within stock; the NEXT one is not
  const idx = out.steps.findIndex((s) => s.asc === out.frontier.asc && s.expansion === out.frontier.expansion && s.kind === out.frontier.kind);
  const next = out.steps[idx + 1];
  assert.ok(next.cum[out.bottleneck] > out.current.stock[out.bottleneck]);
});

test("node-aware sim: adding nodes speeds later steps up (eff mode, days units)", () => {
  const simmed = out.steps.filter((s) => s.sim && s.sim.eff && !s.sim.eff.blocked);
  assert.ok(simmed.length > 10);
  // monotonic cumulative time; all in plausible day magnitudes (not seconds)
  let prev = 0;
  for (const s of simmed) {
    assert.ok(s.sim.eff.all >= prev - 1e-9);
    prev = s.sim.eff.all;
  }
  assert.ok(prev > 30 && prev < 10000, `total farm days ${prev}`);
});

test("per-resource ETAs are monotonic (node-growth aware) and never below a flat-rate bound", () => {
  for (const r of ["Crimstone", "Oil", "Obsidian", "Wood"]) {
    let prev = -1;
    for (const s of out.steps) {
      const sim = s.sim && s.sim.eff;
      if (!sim || sim.blocked) continue;
      const eta = sim.res[r];
      if (eta == null || eta === 0) continue;
      // monotonic: a later step's cumulative cost is higher, so its time can't drop
      assert.ok(eta >= prev - 1e-6, `${r} non-monotonic: ${prev} -> ${eta} at A${s.asc} e${s.expansion}`);
      prev = eta;
      // node growth only speeds farming up, so eta <= farming the whole need at today's rate
      const flat = (s.cum[r] - out.current.stock[r]) / out.rates[r].eff;
      assert.ok(eta <= flat + 1e-6, `${r} eta ${eta} exceeds flat-rate bound ${flat}`);
    }
  }
});

test("farm ETA never precedes the level ETA (need the resources AND the level)", () => {
  for (const s of out.steps) {
    const sim = s.sim && s.sim.eff;
    if (!sim || sim.blocked || sim.levelEtaDays == null) continue;
    assert.ok(sim.farmEtaDays >= sim.levelEtaDays - 1e-6,
      `A${s.asc} e${s.expansion}: farm ${sim.farmEtaDays} < level ${sim.levelEtaDays}`);
    assert.ok(sim.farmEtaDays >= sim.all - 1e-6); // and >= max resource time
  }
});

test("stuck is per-mode: verdict always matches that mode's own farm ETA vs slot", () => {
  for (const s of out.steps) {
    for (const mode of ["eff", "theo"]) {
      const sim = s.sim && s.sim[mode];
      if (!sim) continue;
      const expect = sim.farmEtaDays == null ? true : sim.farmEtaDays > s.buildSlotDays + 1e-9;
      assert.equal(sim.stuck, expect, `${mode} A${s.asc} e${s.expansion}`);
    }
  }
  // theo production ≥ eff → the theo jam can never come before the eff jam
  const firstEff = out.steps.findIndex((s) => s.sim?.eff?.stuck);
  const firstTheo = out.steps.findIndex((s) => s.sim?.theo?.stuck);
  if (firstEff !== -1 && firstTheo !== -1) assert.ok(firstTheo >= firstEff);
});

test("continuous-expand: build slots increase by each step's build time; stuck flagged", () => {
  const withSlots = out.steps.filter((s) => typeof s.buildSlotDays === "number");
  assert.equal(withSlots.length, out.steps.length);
  const firstStuck = out.steps.find((s) => s.stuck);
  assert.ok(firstStuck, "the fixture farm cannot keep continuous-expand pace forever");
  assert.ok(firstStuck.sim.eff.farmEtaDays == null || firstStuck.sim.eff.farmEtaDays > firstStuck.buildSlotDays);
});

test("grinx halves the three resource costs but not coins", () => {
  const g = buildAscensionSection(farm, powerData, cooking.totalXpPerDay, eff, { max: 2, grinx: true });
  const s0 = g.steps.find((s) => s.kind === "exp" && s.asc === 1 && s.expansion === 31);
  const n0 = out.steps.find((s) => s.kind === "exp" && s.asc === 1 && s.expansion === 31);
  assert.equal(s0.cost.Crimstone, n0.cost.Crimstone / 2);
  assert.equal(s0.cost.Coins, n0.cost.Coins);
});

test("node acquisition: expand (rolling dead-cost, equal split) vs buy (sunstones)", () => {
  const na = out.nodeAcq;
  assert.ok(na && na.perType, "nodeAcq present");
  /*
   * The seven sellable profit nodes plus the two that earn no FLOWER but are still real
   * purchases: Lava Pit (obsidian is the currency this whole comparison is denominated in)
   * and Oil Reserve.
   *
   * Oil Reserve used to be excluded here on purpose, and that was wrong: the game sells it
   * like any other node (RESOURCE_NODE_PRICES, 40 / +20, desert-gated) and its output feeds
   * the greenhouse and crop machine, so leaving it out meant the expand-vs-buy table and
   * every per-node section below it simply had no oil row — which is what a user noticed.
   * It reports units/day rather than FLOWER, exactly like the pit.
   *
   * Beehive / Flower Bed / Sunstone stay out.
   */
  assert.deepEqual(Object.keys(na.perType).sort(),
    ["Crimstone Rock", "Crop Plot", "Flower Bed", "Fruit Patch", "Gold Rock", "Iron Rock", "Lava Pit", "Oil Reserve", "Stone Rock", "Tree"]);
  assert.equal(na.perType["Oil Reserve"].sellable, false, "oil cannot be sold either");
  assert.ok(na.perType["Oil Reserve"].unitsPerNode > 0, "so a reserve's return is oil/day");
  assert.equal(na.perType["Oil Reserve"].profitPerDay, 0, "and its FLOWER income is zero");
  assert.equal(na.perType["Oil Reserve"].buy[0].sunstones, 40 + na.perType["Oil Reserve"].bought * 20,
    "Oil Reserve: base 40, +20 per purchase (buyResource.ts)");
  assert.equal(na.perType["Lava Pit"].sellable, false, "Lava Pit output cannot be sold");
  assert.ok(na.perType["Lava Pit"].unitsPerNode > 0, "so its return is reported in units/day");
  assert.equal(na.perType["Lava Pit"].profitPerDay, 0, "and its FLOWER income is zero");
  assert.equal(na.perType.Tree.sellable, true, "wood, by contrast, is sellable");
  // Buying pays SUNSTONE (buyResource.ts), and sunstone is bought with obsidian 3:1
  // (exchangeObsidian.ts). What the old test got wrong was not the x3 — that is real —
  // but the escalation input, which it never checked at all.
  const tree = na.perType.Tree;
  assert.ok(tree.buy[0].sunstones > 0, "buy is quoted in sunstones");
  // Sunstone is itself bought with obsidian at a fixed 3:1 (exchangeObsidian.ts
  // OBSIDIAN_PRICE), so obsidian is the buy path's real currency and the gate shared
  // with the expand path.
  assert.equal(na.obsidianPerSunstone, 3);
  assert.equal(tree.buy[0].obsidian, tree.buy[0].sunstones * 3);

  // Escalation is per PURCHASE (farmActivity["Tree Bought"]), not per node owned —
  // using the owned count overstated prices by up to 15.4x on a real farm.
  const bought = Math.floor(Number((farm.farmActivity || {})["Tree Bought"]) || 0);
  assert.equal(tree.bought, bought, "escalation input comes from farmActivity");
  assert.equal(tree.buy[0].sunstones, 4 + bought * 3, "Tree: base 4, +3 per purchase");
  assert.equal(tree.buy[1].sunstones, 4 + (bought + 1) * 3, "next purchase costs one step more");

  // expand acquisitions carry a FLOWER cost, the raw materials behind it, and a label
  assert.ok(tree.expand.length > 0 && tree.expand[0].cost > 0 && tree.expand[0].label);
  assert.ok(tree.expand[0].res && typeof tree.expand[0].res === "object",
    "raw per-node materials are exposed, not just the FLOWER conversion");
  assert.ok(tree.expand[0].bundle >= 1, "bundle size the cost was split across");
});

test("node acquisition: obsidian and oil are valued at PRODUCTION cost, not their market quote", () => {
  const na = out.nodeAcq;
  // The two resources that cannot be bought. Their cost models already exist in
  // power.mjs (lava pit recipe / Oil Drill inputs) and are reused here.
  assert.ok(na.prodCost.Obsidian > 0, "obsidian production cost derived");
  assert.ok(na.prodCost.Oil > 0, "oil production cost derived");

  // The defect this pins: pricing obsidian at its marketplace quote. The two valuations
  // must stay far enough apart that the assertions below can tell them apart at all.
  const quote = na.obsidianPrice;
  assert.ok(quote > 0 && Math.abs(quote - na.prodCost.Obsidian) / quote > 0.1,
    `market quote (${quote}) and production cost (${na.prodCost.Obsidian}) must differ ` +
    "materially, else this test proves nothing");

  // BUY: the only input is obsidian, so its material cost is exactly obsidian x prod cost.
  const b = na.perType.Tree.buy[0];
  assert.ok(Math.abs(b.matSfl - b.obsidian * na.prodCost.Obsidian) < 1e-9,
    "buy cost = obsidian x production cost");
  assert.ok(Math.abs(b.matSfl - b.obsidian * quote) > 1e-6,
    "and is NOT the market-quote valuation");

  /*
   * EXPAND goes through the shared pricing helper, so this is where a regression to
   * market pricing would actually hide. Recompute the bag independently from the rule as
   * stated — buyable at its purchase price, obsidian and oil at production cost — and
   * require an exact match. Charging obsidian at the quote breaks this by construction.
   */
  const coinsPerSFL = powerData.exchangeRates.coinsPerSFL;
  const priced = Object.values(na.perType).flatMap((d) => d.expand).filter((e) =>
    !e.matUnpriced && (e.res.Obsidian || 0) > 0 && !e.res.Gem);
  assert.ok(priced.length > 0, "at least one expand step needs obsidian (else nothing to check)");
  for (const e of priced) {
    let want = 0;
    for (const [r, q] of Object.entries(e.res)) {
      if (r === "Coins") want += q / coinsPerSFL;
      else if (na.prodCost[r] > 0) want += q * na.prodCost[r];
      else want += q * (p2p[r] || 0);
    }
    assert.ok(Math.abs(e.matSfl - want) < 1e-6,
      `${e.label}: matSfl ${e.matSfl} should equal rule-priced ${want}`);
    assert.equal(e.obsidian, e.res.Obsidian, "obsidian gate mirrors the raw bag");
  }
});

test("node acquisition: per-node profit is NET of production cost and efficiency-adjusted", () => {
  // The obsidian mining rate in the same table is already efficiency-adjusted, so quoting
  // profit as theoretical gross made the two columns non-comparable — and calling gross
  // revenue "profit" overstated it (tools/seeds sit in the category's costPerDay).
  const cats = powerData.categories.catSummaries;
  const NODE_CAT = { "Crop Plot": "crops", "Fruit Patch": "fruits", Tree: "trees", "Stone Rock": "stone", "Iron Rock": "iron", "Gold Rock": "gold", "Crimstone Rock": "crimstone", "Oil Reserve": "oil", "Lava Pit": "obsidian", "Flower Bed": "flowers" };
  const counts = { crops: "crops", fruits: "fruitPatches", trees: "trees", stone: "stones", iron: "iron", gold: "gold", crimstone: "crimstones", oil: "oilReserves", obsidian: "lavaPits", flowers: "flowers.flowerBeds" };
  // Guard the maps themselves: a node added to the section without being added here would
  // otherwise crash on cats[undefined] instead of failing with something readable.
  for (const node of Object.keys(out.nodeAcq.perType)) {
    assert.ok(NODE_CAT[node], `${node} is served but this test has no category for it`);
    assert.ok(counts[NODE_CAT[node]], `${node}: no farm-key mapping`);
  }

  let sawCost = false, sawEff = false;
  for (const [node, d] of Object.entries(out.nodeAcq.perType)) {
    const cat = NODE_CAT[node], cs = cats[cat];
    const n = counts[cat].split(".").reduce((o,k)=>(o&&typeof o==="object")?o[k]:undefined, farm);
    const nCount = n && typeof n==="object" ? Object.keys(n).length : 0;
    const wantNet = Math.max(0, cs.boostedSfl - cs.costPerDay) / nCount;
    assert.ok(Math.abs(d.netPerNode - wantNet) < 1e-9, `${node}: net = (gross - cost) / nodes`);
    // Against cats, NOT against d.netPerNode — netPerNode is derived back out of
    // profitPerDay, so comparing the two would be circular and prove nothing.
    assert.ok(Math.abs(d.profitPerDay - wantNet * d.effRatio) < 1e-9, `${node}: profit = net x eff`);
    // Gross is kept for reference and must never be the reported profit when either
    // correction actually bites.
    // Only meaningful where there IS revenue to reduce: a non-sellable category has gross
    // and net both structurally zero (see the non-sellable test in power.test.mjs).
    if (cs.costPerDay > 0 && d.sellable) { sawCost = true; assert.ok(d.netPerNode < d.grossPerNode, `${node}: cost reduces net`); }
    if (!d.sellable) {
      assert.equal(d.grossPerNode, 0, `${node}: non-sellable output earns nothing`);
      assert.equal(d.profitPerDay, 0, `${node}: and contributes no profit`);
    }
    // Only where there IS profit for efficiency to scale. For a non-sellable node (Oil
    // Reserve, Lava Pit) profitPerDay and netPerNode are both structurally zero, so they
    // cannot differ however far effRatio sits from 1 — the check would be asserting that
    // 0 !== 0. Its return shows up in unitsPerNode instead, covered above.
    if (d.effRatio !== 1 && d.sellable) { sawEff = true; assert.ok(Math.abs(d.profitPerDay - d.netPerNode) > 1e-12, `${node}: eff moves profit`); }
  }
  assert.ok(sawCost, "at least one category has a production cost, else the net check is vacuous");
  assert.ok(sawEff, "at least one category has a non-unit efficiency, else the eff check is vacuous");
});

test("the plan's step income uses the same corrected per-node value, not gross theoretical", () => {
  // flowerPerDay drives every step's roiDays. Feeding it gross theoretical income while
  // the costs are real made expansions look like they pay back sooner than they do.
  const cats = powerData.categories.catSummaries;
  const NODE_CAT = { "Crop Plot": "crops", "Fruit Patch": "fruits", Tree: "trees", "Stone Rock": "stone", "Iron Rock": "iron", "Gold Rock": "gold", "Crimstone Rock": "crimstone", "Oil Reserve": "oil", "Lava Pit": "obsidian", Beehive: "bees", "Flower Bed": "flowers" };
  const perType = out.nodeAcq.perType;

  let checked = 0, sawDrop = false;
  for (const s of out.steps) {
    let want = 0, gross = 0;
    for (const [node, n] of Object.entries(s.nodesAdded || {})) {
      const cat = NODE_CAT[node];
      if (!cat) continue;
      // For the seven profit nodes the value is the one the table reports, so table and
      // plan are provably reading the same number.
      if (perType[node]) { want += n * perType[node].profitPerDay; gross += n * perType[node].grossPerNode; }
      else { want = NaN; break; }
    }
    if (!Number.isFinite(want) || want === 0) continue;
    checked++;
    assert.ok(Math.abs(s.flowerPerDay - want) < 1e-9,
      `step ${s.island || ""} a${s.asc}e${s.expansion}: flowerPerDay ${s.flowerPerDay} should be the corrected ${want}`);
    if (gross > want + 1e-9) sawDrop = true;
    // ROI must be derived from that same corrected income.
    if (s.roiDays != null && want > 0) {
      const cost = (s.costSfl || 0) + (s.levelCostSfl || 0);
      assert.ok(Math.abs(s.roiDays - cost / want) < 1e-6, "roiDays = cost / corrected income");
    }
  }
  assert.ok(checked > 0, "at least one step adds a profit node, else nothing was verified");
  assert.ok(sawDrop, "the correction must actually reduce income somewhere, else it is a no-op");
  assert.ok(cats.trees, "sanity: category summaries present");
});

test("node acquisition: expand reports the UNDIVIDED cost of the whole expansion too", () => {
  // Wanting one specific node means paying for the whole expansion, whatever else it
  // hands you — so the per-node split alone understates a targeted purchase.
  for (const [node, d] of Object.entries(out.nodeAcq.perType)) {
    for (const e of d.expand) {
      assert.ok(Math.abs(e.totalObsidian - e.obsidian * e.bundle) < 1e-9,
        `${node} ${e.label}: total obsidian is the per-node share x bundle`);
      assert.ok(Math.abs(e.totalMatSfl - e.matSfl * e.bundle) < 1e-6,
        `${node} ${e.label}: total material cost is the per-node share x bundle`);
      for (const [r, q] of Object.entries(e.res)) {
        assert.ok(Math.abs(e.totalRes[r] - q * e.bundle) < 1e-6,
          `${node} ${e.label}: ${r} total is the per-node share x bundle`);
      }
      // A bundle of 2 must not make the expansion look half price.
      if (e.bundle > 1) assert.ok(e.totalMatSfl > e.matSfl, "undivided cost exceeds the split");
    }
  }
});

// ── pre-ascension island completion steps (asc: 0) ──

test("complete volcano farm gets no pre-steps; plan starts at the A1 upgrade", () => {
  assert.equal(out.steps[0].kind, "upgrade");
  assert.equal(out.steps[0].asc, 1);
  assert.ok(!out.steps.some((s) => s.asc === 0));
});

test("first ascension: A1 upgrade tops up the volcano crystals (1+3=4, 12 shards); shards are ×3", () => {
  // Entering swamp from volcano grants the A1 upgrade crystal (1) PLUS the
  // one-time A0_CRYSTALS_BY_ISLAND[volcano]=3 top-up = 4 crystals, mined for 12 shards.
  const a1up = out.steps.find((s) => s.asc === 1 && s.kind === "upgrade");
  assert.equal(a1up.crystals, 4);
  assert.equal(a1up.shards, 12);
  // every crystal mines for exactly 3 shards (ASCENSION_SHARDS_PER_MINE), never 10
  const e31 = out.steps.find((s) => s.asc === 1 && s.expansion === 31);
  assert.equal(e31.crystals, 1);
  assert.equal(e31.shards, 3);
  // A2 upgrade gets no retro top-up — just the 1 upgrade crystal (3 shards)
  const a2up = out.steps.find((s) => s.asc === 2 && s.kind === "upgrade");
  assert.equal(a2up.crystals, 1);
  assert.equal(a2up.shards, 3);
});

test("pre-ascension island upgrade grants 1 crystal / 3 shards; already-earned crystals not re-topped-up", () => {
  // A desert farm (A0[desert]=2): its shown desert→volcano upgrade grants 1 crystal,
  // and the A1 upgrade tops up the remaining 2 → total 4 across the pre-swamp path.
  const f = structuredClone(farm);
  f.island = { type: "desert" };
  f.inventory["Basic Land"] = "24";
  const o = buildAscensionSection(f, powerData, cooking.totalXpPerDay, eff, { max: 1 });
  const up = o.steps.find((s) => s.asc === 0 && s.kind === "upgrade");
  assert.equal(up.crystals, 1);
  assert.equal(up.shards, 3);
  const a1up = o.steps.find((s) => s.asc === 1 && s.kind === "upgrade");
  assert.equal(a1up.crystals, 1 + 2); // 1 upgrade + A0[desert]=2 retro
});

test("mid-volcano farm: remaining volcano expansions precede A1, game-table costs, slots first", () => {
  const f = structuredClone(farm);
  f.inventory["Basic Land"] = "28";
  const o = buildAscensionSection(f, powerData, cooking.totalXpPerDay, eff, { max: 2 });
  const pre = o.steps.filter((s) => s.asc === 0);
  assert.deepEqual(pre.map((s) => `${s.island} e${s.expansion}`), ["volcano e29", "volcano e30"]);
  // VOLCANO_LAND_30_REQUIREMENTS pinned from expansions.ts
  const e30 = pre[1];
  assert.equal(e30.cost.Crimstone, 125);
  assert.equal(e30.cost.Oil, 300);
  assert.equal(e30.cost.Obsidian, 42);
  assert.equal(e30.cost.Coins, 60000);
  assert.equal(e30.cost.Wood, 1500);
  assert.equal(e30.cost.Stone, 600);
  assert.equal(e30.cost.Iron, 70);
  assert.equal(e30.cost.Gold, 50);
  assert.deepEqual(e30.extraCost, { Gem: 225 }); // Gem has no production - stock-only
  assert.equal(e30.time, 259200);
  assert.equal(e30.band, 120); // absolute level gate
  assert.equal(e30.levelMet, true); // fixture is level 150
  // pre-steps occupy the first continuous-expand build slots, before the A1 upgrade
  assert.equal(o.steps[0].asc, 0);
  const a1 = o.steps.find((s) => s.asc === 1 && s.kind === "upgrade");
  assert.ok(a1.buildSlotDays >= e30.buildSlotDays + 259200 / 86400 - 1e-9);
  // cumulative costs include the pre-steps
  assert.ok(a1.cum.Crimstone >= 125 + 30);
});

test("desert farm: chain runs desert remainder → volcano upgrade (200 Oil) → volcano 6..30", () => {
  const f = structuredClone(farm);
  f.island = { type: "desert" };
  f.inventory["Basic Land"] = "24";
  const o = buildAscensionSection(f, powerData, cooking.totalXpPerDay, eff, { max: 1 });
  const pre = o.steps.filter((s) => s.asc === 0);
  assert.equal(pre[0].island, "desert");
  assert.equal(pre[0].expansion, 25);
  const up = pre.find((s) => s.kind === "upgrade");
  assert.equal(up.island, "desert");
  assert.equal(up.next, "volcano");
  assert.equal(up.cost.Oil, 200);
  // volcano starts at 5 Basic Land → first volcano step is expansion 6
  const afterUp = pre[pre.indexOf(up) + 1];
  assert.equal(afterUp.island, "volcano");
  assert.equal(afterUp.expansion, 6);
  assert.equal(pre[pre.length - 1].expansion, 30);
});

test("grinx halves pre-step resources (incl. extraCost) but not coins", () => {
  const f = structuredClone(farm);
  f.inventory["Basic Land"] = "28";
  const g = buildAscensionSection(f, powerData, cooking.totalXpPerDay, eff, { max: 1, grinx: true });
  const e30 = g.steps.find((s) => s.asc === 0 && s.expansion === 30);
  assert.equal(e30.cost.Crimstone, 62.5);
  assert.equal(e30.cost.Wood, 750);
  assert.equal(e30.extraCost.Gem, 112.5);
  assert.equal(e30.cost.Coins, 60000);
});

test("flower economics: node gains valued from power categories, ROI includes leveling cost", () => {
  const o = buildAscensionSection(farm, powerData, cooking, eff, { max: 2 });
  assert.ok(o.rates.farmSflPerDay > 0, "current farm FLOWER/day served");
  assert.ok(o.rates.costPerXp > 0 && o.rates.costPerXp < 0.001, "cooking cost per XP sane");
  const e31 = o.steps.find((s) => s.asc === 1 && s.expansion === 31);
  assert.ok(e31.flowerPerDay > 0, "A1 e31 adds producing nodes");
  assert.ok(e31.costSfl > 0);
  assert.ok(e31.roiDays > 0 && e31.roiDays < 10000);
  assert.ok(Math.abs(e31.roiDays - (e31.costSfl + e31.levelCostSfl) / e31.flowerPerDay) < 1e-9);
  // upgrade step adds no nodes -> no ROI
  const up = o.steps.find((s) => s.asc === 1 && s.kind === "upgrade");
  assert.equal(up.roiDays, null);
  // legacy numeric 3rd param still works (no cooking object -> no costPerXp)
  const legacy = buildAscensionSection(farm, powerData, cooking.totalXpPerDay, eff, { max: 1 });
  assert.equal(legacy.rates.costPerXp, null);
  assert.equal(legacy.rates.xpPerDay, cooking.totalXpPerDay);
});

// ── wishlist section (same fixture set) ──
test("wishlist — catalog ownership, auto-prune of active items, priority cumulative costs", async () => {
  const { buildWishlistSection } = await import("../../core/sections/wishlist.mjs");
  const w = buildWishlistSection(farm, nfts, { list: {
    "collectibles:Foreman Beaver": 1,      // active on farm → pruned
    "collectibles:Test Unowned Statue": 1, // unowned, floor 42
    "collectibles:Immortal Pear": 2,       // ACTIVE (home island) → pruned
  } });
  assert.ok(w.catalog.length >= 3);
  assert.deepEqual(w.pruned.sort(), ["collectibles:Foreman Beaver", "collectibles:Immortal Pear"]);
  assert.equal(w.rows.length, 1);
  assert.equal(w.rows[0].name, "Test Unowned Statue");
  assert.equal(w.byPriority[1].cost, 42);
  assert.equal(w.byPriority[1].cumulative, 42);
  assert.equal(w.byPriority[2].cumulative, 42); // cumulative carries P1 down
  assert.equal(w.byPriority[1].affordable, parseFloat(farm.balance) >= 42);
});

test("node acquisition: an unpriceable node is flagged, not reported as worthless", () => {
  /*
   * Flower Bed is productive (~6 units/day on the fixture) but no flower has a price in the
   * sfl.world p2p feed — only Sunflower and Cauliflower, which are crops. So its FLOWER
   * figure is structurally 0 while the node is not worthless, and a bare 0 reads as if it
   * were. The flag separates "earns nothing" from "cannot be priced".
   */
  const fb = out.nodeAcq.perType["Flower Bed"];
  assert.ok(fb, "Flower Bed is in the table");
  assert.equal(fb.sellable, true, "flowers are sellable in principle, unlike oil/obsidian");
  assert.ok(fb.unitsPerNode > 0, "and a bed does produce");
  assert.equal(fb.grossPerNode, 0, "but there is no price to turn that into FLOWER");
  assert.equal(fb.unpriced, true, "so it must be flagged rather than shown as a zero");

  // The distinction is real: a priced node is not flagged, and a non-sellable one is not
  // either — its zero is genuine, it just pays in units.
  assert.equal(out.nodeAcq.perType.Tree.unpriced, false, "wood has a price");
  assert.ok(out.nodeAcq.perType.Tree.grossPerNode > 0);
  assert.equal(out.nodeAcq.perType["Lava Pit"].unpriced, false, "obsidian is not sellable at all");
  assert.equal(out.nodeAcq.perType["Oil Reserve"].unpriced, false, "nor is oil");

  // The owned count must follow the nested container: farm.flowers is {flowerBeds, discovered},
  // so counting farm.flowers itself would report 2 where the farm has 4 beds.
  assert.equal(fb.currentCount, Object.keys(farm.flowers.flowerBeds).length);
  assert.ok(fb.currentCount > 2, `nested count resolved (${fb.currentCount})`);
  // Price from the game's RESOURCE_NODE_PRICES: 30 base, +25 per purchase.
  assert.equal(fb.buy[0].sunstones, 30 + fb.bought * 25);
});

test("coin stock includes treasures you could sell, reported separately", async () => {
  /*
   * Every ascension step costs Coins, and a dig pile IS coins: treasures sell to an NPC at a
   * fixed price, no market and no counterparty. Counting only farm.coins understated what the
   * plan can pay for — on the fixture by 68% — and made steps look gated on coins already
   * covered by the inventory.
   */
  const c = out.current;
  assert.equal(c.coinsHeld, parseFloat(farm.coins) || 0, "the held figure is farm.coins, untouched");
  assert.ok(c.treasureCoins.total > 0, "the fixture holds sellable treasures");
  assert.ok(Math.abs(c.stock.Coins - (c.coinsHeld + c.treasureCoins.total)) < 1e-9,
    "stock.Coins = held + treasures, so the plan can spend both");
  // Both halves are exposed: the page must be able to say "X held + Y unsold", never one
  // opaque number that looks like cash on hand.
  assert.ok(c.stock.Coins > c.coinsHeld, "and the total is genuinely higher here");

  // Boosts come from the same detection the treasury uses — Treasure Map +20%, Camel +30%,
  // the Camel counting whether it is placed or merely owned.
  const { findCollectible, getCount } = await import("../../core/engine/power-helpers.mjs");
  let want = 1;
  if (findCollectible(farm, "Treasure Map").length > 0) want += 0.2;
  if (getCount(farm.inventory, "Camel") > 0 || findCollectible(farm, "Camel").length > 0) want += 0.3;
  assert.ok(Math.abs(c.treasureCoins.boost - want) < 1e-9, `boost ${c.treasureCoins.boost} != ${want}`);

  // Every line is priced off TREASURE_SELL_PRICES x qty x boost, and they sum to the total.
  const { TREASURE_SELL_PRICES } = await import("../../core/data/crafting.mjs");
  let sum = 0;
  for (const it of c.treasureCoins.items) {
    assert.ok(TREASURE_SELL_PRICES[it.name] > 0, `${it.name} has an NPC price`);
    assert.equal(it.baseCoins, TREASURE_SELL_PRICES[it.name]);
    assert.ok(Math.abs(it.coins - it.baseCoins * c.treasureCoins.boost * it.qty) < 1e-9, `${it.name}: coins = price x boost x qty`);
    sum += it.coins;
  }
  assert.ok(Math.abs(sum - c.treasureCoins.total) < 1e-6, "the lines sum to the total");
  // Sorted richest first, so the page can show the few that matter.
  for (let i = 1; i < c.treasureCoins.items.length; i++) {
    assert.ok(c.treasureCoins.items[i - 1].coins >= c.treasureCoins.items[i].coins, "sorted by value");
  }
});

test("merge is modelled in core, on the same basis as buy", () => {
  /*
   * Merge used to exist ONLY in flowers.html, so the NODES page carried a third engine and the
   * same gold node came out negative there while the roadmap and ascension called it positive.
   * It lives here now; the pages are meant to render this, not recompute it.
   */
  const m = out.nodeAcq.merge;
  assert.ok(Array.isArray(m) && m.length === 4, `four mergeable trees, got ${m && m.length}`);
  for (const t of m) {
    assert.ok(t.tiers && typeof t.tiers.t1 === "number", `${t.mergeKey}: tier counts present`);
    assert.deepEqual(t.merges.map((x) => x.tier), [2, 3], `${t.mergeKey}: both merge steps`);
    for (const x of t.merges) {
      assert.ok(x.obsidian > 0 && x.coins > 0, `${t.mergeKey} T${x.tier}: costs something`);
      assert.equal(x.need, 4, "the game consumes four of the lower tier");
      assert.equal(x.ready, x.have >= 4, `${t.mergeKey} T${x.tier}: ready follows the count`);
      assert.ok(isFinite(x.gainPerDay), `${t.mergeKey} T${x.tier}: a finite gain`);
    }
    /*
     * The T3 delta is +0.5, not +2.5: four T2s already carried half a bonus each, so
     * 2.5 - 4x0.5 = 0.5. Quoting the raw t3 figure would overstate a T3 merge fivefold.
     */
    assert.equal(t.merges[1].bonus, 0.5, `${t.mergeKey}: T3 delta nets out the four T2 bonuses`);
    assert.equal(t.merges[0].bonus, 0.5, `${t.mergeKey}: T2 bonus`);
  }
  // Gold is merged with obsidian and coins, and T3 costs more than T2 — cheap sanity that the
  // cost table is being read per tier rather than reused.
  const gold = m.find((x) => x.mergeKey === "gold");
  assert.ok(gold.merges[1].obsidian > gold.merges[0].obsidian, "T3 costs more obsidian than T2");
});

test("expand-vs-buy is decided in core, and obsidian is what decides it", () => {
  /*
   * The verdict was computed in the page's render, which made it a fourth engine purely by
   * accident of where it lived — and meant the NODES page could disagree with everything else
   * about which side wins. It is a pure function of two figures this section already serves.
   */
  for (const [node, d] of Object.entries(out.nodeAcq.perType)) {
    assert.ok(d.verdict, `${node}: has a verdict`);
    assert.ok(["expand", "buy"].includes(d.verdict.obsWin), `${node}: ${d.verdict.obsWin}`);
    // Obsidian gates BOTH paths — buying pays sunstone, and sunstone is bought with obsidian
    // 3:1 — so it is what decides, and the decision must follow the numbers.
    const { exObs, buObs, obsWin } = d.verdict;
    if (exObs != null && buObs != null) {
      assert.equal(obsWin, exObs <= buObs ? "expand" : "buy", `${node}: verdict follows the obsidian`);
    } else if (exObs == null) {
      assert.equal(obsWin, "buy", `${node}: no expand option means buy`);
    }
    if (d.verdict.obsSaved != null) assert.ok(d.verdict.obsSaved >= 0, `${node}: saving is a magnitude`);
  }

  // An expand bag we cannot fully price is a LOWER bound, so it must never claim the material win.
  const unpricedExpand = Object.entries(out.nodeAcq.perType)
    .filter(([, d]) => (d.expand || [])[0] && d.expand[0].totalMatUnpriced);
  for (const [node, d] of unpricedExpand) {
    assert.notEqual(d.verdict.exMat, undefined);
    assert.equal(d.verdict.exMat, null, `${node}: unpriced expand cost must not be treated as known`);
  }
  /*
   * This fixture answers "expand" for all ten nodes, so asserting the comparison against it
   * cannot tell a real decision from a hardcoded "expand" — checked by hardcoding it, which
   * passed. Two things follow.
   *
   * First, pin the distribution, so the weakness is visible instead of silent: if the fixture
   * ever produces a "buy" the assertion fails and whoever changed it has to look here.
   *
   * Second, and stated plainly rather than papered over: THIS TEST DOES NOT CATCH A HARDCODED
   * "expand". It cannot, on this fixture. Expansion needs 3–26 obsidian here while buying needs
   * 27–240, so expand wins every row and any always-expand implementation satisfies every
   * assertion above — confirmed by hardcoding it and watching the suite stay green.
   *
   * A first attempt at forcing the other branch re-implemented the comparison inside the test,
   * which only tested the test. Doing it honestly needs a fixture whose expansion is dearer than
   * buying, i.e. a farm far enough along that expansions have escalated. Until such a fixture
   * exists, the distribution pin below is the whole guarantee: it fails the moment the fixture
   * stops being expand-only, which is when a real second case becomes possible.
   */
  const wins = {};
  for (const d of Object.values(out.nodeAcq.perType)) wins[d.verdict.obsWin] = (wins[d.verdict.obsWin] || 0) + 1;
  assert.deepEqual(wins, { expand: 10 },
    "this fixture is expand-only; if that changed, add the buy-branch case this test admits it lacks");
});

test("every node carries tier counts, not just the mergeable four", () => {
  /*
   * countNodeTiers was only reached from the merge model, so tiers existed for trees / stones /
   * iron / gold and nowhere else — and the NODES page kept its own tier pass for crops, fruit,
   * oil, lava pits and flower beds. That is the same split brain that had one gold node reading
   * differently on two pages.
   */
  const counts = { "Crop Plot": "crops", "Fruit Patch": "fruitPatches", Tree: "trees", "Stone Rock": "stones", "Iron Rock": "iron", "Gold Rock": "gold", "Crimstone Rock": "crimstones", "Oil Reserve": "oilReserves", "Lava Pit": "lavaPits", "Flower Bed": "flowers.flowerBeds" };
  for (const [node, d] of Object.entries(out.nodeAcq.perType)) {
    assert.ok(d.tiers, `${node}: has tier counts`);
    const { t1, t2, t3, physical, effective } = d.tiers;
    assert.equal(physical, t1 + t2 + t3, `${node}: physical is the sum of the tiers`);
    // A T2 counts as four nodes and a T3 as sixteen — that is what "effective" means, and
    // getting it wrong is what makes purchase escalation and per-node splits wrong.
    assert.equal(effective, t1 + t2 * 4 + t3 * 16, `${node}: effective weights the tiers`);
    assert.ok(effective >= physical, `${node}: effective can never be below physical`);

    // And it must count the SAME objects the owned count does, including the dotted path for
    // flower beds, whose farm.flowers is a container rather than a list.
    const path = counts[node];
    assert.ok(path, `${node}: test knows where to look`);
    const obj = path.split(".").reduce((o, k) => (o && typeof o === "object" ? o[k] : undefined), farm);
    assert.equal(physical, obj ? Object.keys(obj).length : 0, `${node}: tiers count the farm's own nodes`);
    assert.equal(physical, d.currentCount, `${node}: and agree with currentCount`);
  }
  // Not vacuous: the fixture must actually have merged nodes somewhere, or effective === physical
  // everywhere and the weighting is untested.
  const anyMerged = Object.values(out.nodeAcq.perType).some((d) => d.tiers.t2 > 0 || d.tiers.t3 > 0);
  assert.ok(anyMerged, "the fixture farm has merged nodes, so the weighting is exercised");
});

test("the measurement is served, and it is the SAME ratio the per-node profit used", () => {
  /*
   * The NODES page ran its own dig-session pass and used that ratio for the EFF column and the
   * ROI — while profitPerDay already carried the server's ratio. Two engines, and the "real"
   * income scaled by efficiency twice. This pins that there is one ratio and that it reaches
   * the page.
   */
  assert.ok(out.nodeAcq.eff, "nodeAcq serves the efficiency measurement");
  assert.deepEqual(out.nodeAcq.eff.meta, eff.meta, "and the window it was measured over");
  for (const [node, d] of Object.entries(out.nodeAcq.perType)) {
    const cat = { "Crop Plot": "crops", "Fruit Patch": "fruits", Tree: "trees", "Stone Rock": "stone", "Iron Rock": "iron", "Gold Rock": "gold", "Crimstone Rock": "crimstone", "Oil Reserve": "oil", "Lava Pit": "obsidian", "Flower Bed": "flowers" }[node];
    const served = out.nodeAcq.eff.byCat[cat];
    assert.equal(d.effMeasured, !!(served && served.measured), `${node}: measured flag agrees with the served detail`);
    // Obsidian is the one documented exception and must stay one: its value is already capped
    // at one sale per week, so scaling it by throughput would count the same limit twice. The
    // flag still reports that it WAS measured, which is why the page needs both fields.
    if (cat === "obsidian") assert.equal(d.effRatio, 1, "obsidian is not throughput-scaled");
    else if (d.effMeasured) assert.equal(d.effRatio, served.ratio, `${node}: uses the served ratio, not one of its own`);
    // And profitPerDay must ALREADY be scaled by it — so a page that multiplies again is wrong.
    if (d.netPerNode) assert.ok(Math.abs(d.profitPerDay - d.netPerNode * d.effRatio) < 1e-9, `${node}: profitPerDay = netPerNode x effRatio`);
  }
  // Not vacuous: the fixture measures crimstone/oil/obsidian, so at least one node is measured.
  assert.ok(Object.values(out.nodeAcq.perType).some((d) => d.effMeasured), "some node is measured on this fixture");
});

test("merge cost is obsidian AND coins, and the coin half is never negligible", () => {
  /*
   * The served merge cost was obsidian only, so every merge came out cheaper than it is — a gold
   * T3 wants 350k coins on top of its 20 obsidian. How the two halves compare depends on what
   * obsidian costs to produce (14.4 FLOWER on this fixture, well under 2 on some real farms), so
   * neither half can be called dominant in general; what CAN be pinned is that dropping the
   * coins shifts the cost enough to change decisions.
   */
  const cps = powerData.exchangeRates.coinsPerSFL;
  assert.ok(cps > 0, "the fixture has a coin rate");
  for (const t of out.nodeAcq.merge) {
    for (const x of t.merges) {
      assert.ok(Math.abs(x.coinSfl - x.coins / cps) < 1e-9, `${t.mergeKey} T${x.tier}: coins priced at the exchange rate`);
      const obsHalf = x.obsidian * out.nodeAcq.prodCost.Obsidian;
      assert.ok(Math.abs(x.matSfl - (obsHalf + x.coinSfl)) < 1e-9, `${t.mergeKey} T${x.tier}: matSfl is both halves`);
      assert.ok(x.coinSfl / x.matSfl > 0.1, `${t.mergeKey} T${x.tier}: coins are >10% of the cost, so omitting them mattered (${(100 * x.coinSfl / x.matSfl).toFixed(0)}%)`);
    }
  }
});

test("the buy list is deep enough to plan with, and escalates linearly", () => {
  // The NODES page walks a greedy purchase order over these. With three entries it had to
  // re-derive the escalation, which is the duplicate engine being removed.
  for (const [node, d] of Object.entries(out.nodeAcq.perType)) {
    assert.equal(d.buy.length, 8, `${node}: eight purchases served`);
    const step = d.buy[1].sunstones - d.buy[0].sunstones;
    for (let i = 1; i < d.buy.length; i++) {
      assert.equal(d.buy[i].sunstones - d.buy[i - 1].sunstones, step, `${node}: purchase ${i} escalates by the same increment`);
      assert.equal(d.buy[i].obsidian, d.buy[i].sunstones * out.nodeAcq.obsidianPerSunstone, `${node}: obsidian follows the sunstone count`);
    }
    assert.ok(step > 0, `${node}: each purchase costs more than the last`);
    // The rule and the list must be the same thing, or a page walking the rule past entry 8
    // (ROAD TO 2xT3 needs up to 32) silently prices differently from the table above it.
    const r = d.buyRule;
    assert.ok(r, `${node}: escalation rule served`);
    assert.equal(step, r.inc, `${node}: the list escalates by the rule's increment`);
    assert.equal(r.obsidianPerSunstone, out.nodeAcq.obsidianPerSunstone);
    assert.equal(r.obsidianSfl, out.nodeAcq.prodCost.Obsidian || 0, `${node}: rule prices obsidian the same way`);
    for (let i = 0; i < d.buy.length; i++) {
      assert.equal(d.buy[i].sunstones, r.base + (r.bought + i) * r.inc, `${node}: entry ${i} matches the rule`);
    }
  }
});

test("merge carries the ratio it was scaled by, and every node names its category", () => {
  // Both exist so a page can render a theoretical column and an efficiency tooltip WITHOUT
  // measuring anything itself — the last two reasons the NODES page kept its own history pass.
  for (const t of out.nodeAcq.merge) {
    for (const x of t.merges) {
      assert.equal(typeof x.effRatio, "number", `${t.mergeKey} T${x.tier}: ratio served`);
      // gainPerDay = bonus × digs/day × price × ratio, so dividing it back out is the theoretical
      // figure. Pin the relationship rather than the value: a zero ratio must not be silently
      // rewritten to 1.
      if (x.gainPerDay > 0) assert.ok(x.effRatio > 0, `${t.mergeKey} T${x.tier}: a gain implies a ratio`);
    }
  }
  const cats = new Set();
  for (const [node, d] of Object.entries(out.nodeAcq.perType)) {
    assert.ok(d.cat, `${node}: names its category`);
    assert.ok(d.effRatio === 1 || out.nodeAcq.eff.byCat[d.cat] !== undefined || !d.effMeasured,
      `${node}: the category reaches the served measurement`);
    cats.add(d.cat);
  }
  assert.equal(cats.size, 10, "ten distinct categories, so no node borrowed another's");
});

test("the buy path escalates node prices off farmActivity, like the NODES page does", async () => {
  /*
   * roadmapNodeCandidates used `tiers.effective - BASE_NODE_COUNTS[island]` — "how many more do I
   * have than a fresh island starts with" — and called that the purchase count. That counts nodes
   * an EXPANSION granted as purchases and leans on a hand-maintained base table. On farm 155498
   * the two rules coincide, which is why it was invisible, so this drives the REAL function with a
   * farm where they cannot: lots of nodes, nothing ever bought.
   */
  const { _setPowerContext, _setRoadmapState, roadmapNodeCandidates, getRoadmapSettings } = await import("../../core/engine/roadmap.mjs");
  const sunstonesOf = (rows, label) => {
    const r = rows.find((x) => x.name === `Buy ${label} node`);
    if (!r) return null;
    const m = /(\d+) Sunstone/.exec(r.boost || "");
    return m ? parseInt(m[1], 10) : null;
  };

  // Same real power context the section builds, but with the farm's purchase history swapped.
  const withActivity = (activity, extra) => {
    const f = JSON.parse(JSON.stringify(farm));
    f.farmActivity = activity;
    Object.assign(f, extra || {});
    const pd = buildPowerSection(f, p2p, nfts, null, {});
    _setPowerContext({ farm: f, inventory: f.inventory, capacity: pd.capacity, exchangeRates: pd.exchangeRates,
      stockMods: pd.stockMods, p2pPrices: pd.p2pPrices, boostItems: pd.boostItems, savedProducts: {},
      season: pd.season, nftData: pd.nftData, roadmapSettingsRaw: {} });
    /*
     * The ascension plan has to be on the state: node INCOME now comes from its nodeAcq rather than
     * a locally derived margin, and without it roadmapNodeCandidates deliberately returns nothing.
     * That guard exists because the local basis disagreed with nodeAcq by up to 3.3x, and a silent
     * wrong number is worse than a visibly missing row.
     */
    _setRoadmapState({ effByCat: {}, effMeta: null, meanRatio: 0.5,
      ascension: buildAscensionSection(f, pd, cooking.totalXpPerDay, eff, { max: 1 }) });
    return roadmapNodeCandidates(getRoadmapSettings({}));
  };

  // 1. The real farm's counts must produce the same prices the NODES page shows.
  const real = withActivity(farm.farmActivity || {});
  assert.ok(real.length > 0, "node actions are produced at all");
  for (const [label, base, inc, key] of [["Tree", 4, 3, "Tree Bought"], ["Stone", 4, 3, "Stone Rock Bought"],
                                          ["Iron", 7, 5, "Iron Rock Bought"], ["Gold", 10, 6, "Gold Rock Bought"]]) {
    const bought = Math.floor(Number((farm.farmActivity || {})[key]) || 0);
    const got = sunstonesOf(real, label);
    if (got == null) continue; // category may be unpriced on the fixture
    assert.equal(got, base + bought * inc, `${label}: priced off ${key} (${bought})`);
  }

  // 2. Nothing bought ever → every node is at its FIRST-purchase price, however many you own.
  //    The old rule read owned-minus-base here and escalated.
  const none = withActivity({});
  assert.equal(sunstonesOf(none, "Tree"), 4, "no purchases means the base price, whatever the farm holds");
  assert.equal(sunstonesOf(none, "Gold"), 10);
  const realGold = sunstonesOf(real, "Gold");
  assert.ok(realGold > 10, `and the real farm, having bought some, pays more (${realGold})`);

  // 3. The activity key is the GAME's node name, not NODE_PRICES' display label. Reading the label
  //    finds nothing, which would silently price every node as never-purchased.
  const mislabelled = withActivity({ "Gold Bought": 99, "Stone Bought": 99 });
  assert.equal(sunstonesOf(mislabelled, "Gold"), 10, "'Gold Bought' is not a key the game writes");
  const properlyKeyed = withActivity({ "Gold Rock Bought": 5 });
  assert.equal(sunstonesOf(properlyKeyed, "Gold"), 10 + 5 * 6, "'Gold Rock Bought' is");
});

test("the whole ascension ladder is offered, in an order the game will let you build", async () => {
  /*
   * Expansions belong in the buy path: each costs materials and hands you profit nodes, which is the
   * same shape as buying a node or an NFT. Without them the page could tell you to buy a gold node
   * while an expansion two steps away would have handed you several cheaper.
   *
   * The hard part is that ascension steps are STRICTLY SEQUENTIAL. A first version offered all 82
   * pending steps and let the payback sort order them, which produced an order you cannot follow
   * (A2 Expansion 32 above A1 Expansion 31); a second offered only the next one, which was
   * buildable but hid the ladder. The answer is to show the ladder and CONSTRAIN THE PLANNER, so
   * this test is about the sequence, not the count.
   */
  const { buildRoadmapSection } = await import("../../core/sections/roadmap.mjs");
  const out2 = buildRoadmapSection([], { roadmapSettings: { incCollectibles: true, incWearables: true }, farm, p2p, ascension: out });
  const rows = out2.sim.ranked || [];
  const asc = rows.filter((r) => r.type === "Ascension");
  assert.ok(asc.length > 10, `the ladder is shown, got ${asc.length} rows`);

  // 1. Labels are spelled out: "A1 · Expansion 31", not "A1 · e31".
  for (const r of asc) {
    assert.ok(/^(A\d+ · Expansion \d+|Ascension A\d+|Upgrade na .+|\w+ Expansion \d+)$/.test(r.name), `label: ${r.name}`);
    assert.ok(!/· e\d/.test(r.name), `${r.name}: no bare e-number`);
  }

  // 2. THE invariant: in the ranked order, every ascension row appears after all earlier ones.
  //    This is what the planner constraint buys, and it is what "buildable" means.
  const seqInOrder = rows.filter((r) => r.type === "Ascension").map((r) => r.name);
  const planOrder = asc.map((r) => r.name);
  assert.deepEqual(seqInOrder, planOrder, "ascension rows keep their ladder order in the ranked list");
  const ascNum = (n) => { const m = /^A(\d+)/.exec(n); return m ? parseInt(m[1], 10) : 0; };
  const expNum = (n) => { const m = /Expansion (\d+)/.exec(n); return m ? parseInt(m[1], 10) : 0; };
  for (let k = 1; k < planOrder.length; k++) {
    const a = planOrder[k - 1], b = planOrder[k];
    assert.ok(ascNum(b) > ascNum(a) || (ascNum(b) === ascNum(a) && expNum(b) > expNum(a)),
      `${a} must come before ${b}`);
  }

  // 3. Capped at A3 by default — the owner asked to see through A3, not all ten.
  assert.ok(Math.max(...planOrder.map(ascNum)) <= 3, "default cap is A3");

  // 4. Each row is its own INCREMENT, not a cumulative total, or the table's running cost
  //    double-counts. So no row may cost as much as the sum of the ones before it.
  const costs = asc.map((r) => r.floor);
  const total = costs.reduce((x, y) => x + y, 0);
  for (const c of costs) assert.ok(c < total, "a row is an increment, not the running total");

  // 5. Income is what the granted nodes earn, from the SAME per-node figures the NODES page shows.
  const first = asc[0];
  const firstEarning = out.steps.find((st) => Object.keys(st.nodesAdded || {}).some((n) => out.nodeAcq.perType[n]));
  let expectMarg = 0;
  for (const [node, n] of Object.entries(firstEarning.nodesAdded || {})) {
    const d = out.nodeAcq.perType[node];
    if (d) expectMarg += (d.profitPerDay || 0) * n;
  }
  assert.ok(Math.abs(first.value - expectMarg) < 1e-9, `income = the granted nodes (${first.value} vs ${expectMarg})`);

  // 6. A step that grants nothing earning cannot be a row, so its cost is rolled into the next one
  //    and named there — reaching that expansion means paying for it too.
  if (firstEarning !== out.steps[0]) assert.ok(/přes /.test(first.boost), `says what it goes through: ${first.boost}`);
});

// ── date-gated ascensions ──
//
// The game blocks A1 → A2 until SPOOKY_ASCENSION opens (lib/flags.ts, enforced in
// upgradeFarm.ts for exactly `ascensionLevel + 1 === 2`). Before this, the schedule
// chained the ladder purely on build time and told you to walk straight into A2 on a
// date the game refuses. The gate has to move that slot AND everything behind it.

test("only A2 carries a date, taken verbatim from the game's flags.ts", () => {
  assert.deepEqual(Object.keys(ASCENSION_UNLOCK_MS), ["2"], "no band may be gated that the game does not gate");
  assert.equal(new Date(ASCENSION_UNLOCK_MS[2]).toISOString(), "2026-09-07T00:00:00.000Z");
});

test("the A2 upgrade slot cannot open before the unlock, and pushes the rest along", () => {
  const nowMs = Date.now();
  const a2 = out.steps.find((s) => s.kind === "upgrade" && s.asc === 2);
  assert.ok(a2, "A2 upgrade step missing from the ladder");

  const slotMs = nowMs + a2.buildSlotDays * 86400000;
  assert.ok(slotMs >= ASCENSION_UNLOCK_MS[2] - 1000,
    `A2 slot ${new Date(slotMs).toISOString()} opens before the game allows it`);
  assert.equal(a2.gatedUntilMs, ASCENSION_UNLOCK_MS[2]);

  // Nothing before A2 is gated: A1 is explicitly ungated in the game, and expansions
  // are never gated — only the upgrade between bands is.
  for (const s of out.steps) {
    if (s === a2) continue;
    assert.equal(s.gatedUntilMs, undefined, `${s.kind} A${s.asc} must not carry a gate`);
  }

  // Every later step is behind the gate too — the wait shifts the whole tail.
  const after = out.steps.slice(out.steps.indexOf(a2) + 1);
  for (const s of after) {
    assert.ok(s.buildSlotDays >= a2.buildSlotDays - 1e-9,
      `a step after A2 opens before it (${s.buildSlotDays} < ${a2.buildSlotDays})`);
  }
});

test("the gate is reported with the dead time it costs", () => {
  const g = (out.gates || []).find((x) => x.asc === 2);
  assert.ok(g, "gates summary missing the A2 entry");
  assert.equal(g.unlockMs, ASCENSION_UNLOCK_MS[2]);
  assert.ok(g.waitDays >= 0);
  // buildSlotDays − waitDays is when the queue actually arrives at the upgrade, so the
  // page can say "ready in X, then idle Y".
  assert.ok(g.buildSlotDays - g.waitDays >= -1e-9, "arrival cannot be before now");
  assert.ok(Math.abs(g.buildSlotDays - out.steps.find((s) => s.kind === "upgrade" && s.asc === 2).buildSlotDays) < 1e-9);
});

test("a gated step is judged against its real slot, not the ungated one", () => {
  // The whole point: waiting for the gate gives the farm more time, so a step that
  // would miss a continuous slot can still be comfortably ready by the gated one.
  const a2 = out.steps.find((s) => s.kind === "upgrade" && s.asc === 2);
  for (const mode of ["eff", "theo"]) {
    const sim = a2.sim && a2.sim[mode];
    if (!sim || sim.farmEtaDays == null) continue;
    assert.equal(sim.stuck, sim.farmEtaDays > a2.buildSlotDays + 1e-9,
      `${mode}: stuck verdict not taken against the gated slot`);
  }
});

// The gate is only useful if the page SAYS why the schedule jumps. Slice that banner
// out of flowers.html and render it, so silently dropping the explanation fails here.
test("the page explains the gate, with the arrival and the idle time", () => {
  const html = readFileSync(new URL("../../flowers.html", import.meta.url), "utf8");
  const start = html.indexOf("const waitGates = (d.gates || [])");
  assert.ok(start > 0, "gate banner not found in flowers.html");
  const end = html.indexOf("\n      }", start);
  const body = html.slice(start, end) + "\n      }";

  const render = (gates) => new Function("d", "fmtEta", "escHTML",
    "let h = '';\n" + body + "\nreturn h;"
  )({ gates }, (x) => x == null ? "—" : `${x.toFixed(1)}d`, String);

  const out = render([{ asc: 2, unlockMs: Date.UTC(2026, 8, 7), waitDays: 11.6, buildSlotDays: 32.6 }]);
  assert.match(out, /A2 unlocks 7\. ?9\. ?2026/, `unlock date not shown: ${out}`);
  assert.match(out, /11\.6d/, "idle time not shown");
  assert.match(out, /21\.0d/, "arrival (slot − wait) not shown");
  assert.match(out, /SPOOKY_ASCENSION/, "should name the game flag it comes from");
  assert.doesNotMatch(out, /undefined|NaN/);

  // No wait → no banner. A gate the queue already runs past is not news.
  assert.equal(render([{ asc: 2, unlockMs: Date.UTC(2026, 8, 7), waitDays: 0, buildSlotDays: 40 }]), "");
  assert.equal(render([]), "");
});
