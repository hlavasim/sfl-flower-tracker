import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import {
  bandXp, ascensionBaseline, ascensionStanding, getAscensionUpgradeCost,
  getAscensionExpansionRequirements, getExpansionCrystalCount, getAscensionExpansionDelta,
  V150_XP,
} from "../../core/engine/ascension.mjs";
import { buildAscensionSection } from "../../core/sections/ascension.mjs";
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
  // only the 7 profit nodes; no Oil/Beehive/Lava/Flower/Sunstone
  assert.deepEqual(Object.keys(na.perType).sort(),
    ["Crimstone Rock", "Crop Plot", "Fruit Patch", "Gold Rock", "Iron Rock", "Stone Rock", "Tree"]);
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
  const NODE_CAT = { "Crop Plot": "crops", "Fruit Patch": "fruits", Tree: "trees", "Stone Rock": "stone", "Iron Rock": "iron", "Gold Rock": "gold", "Crimstone Rock": "crimstone" };
  const counts = { crops: "crops", fruits: "fruitPatches", trees: "trees", stone: "stones", iron: "iron", gold: "gold", crimstone: "crimstones" };

  let sawCost = false, sawEff = false;
  for (const [node, d] of Object.entries(out.nodeAcq.perType)) {
    const cat = NODE_CAT[node], cs = cats[cat];
    const n = Object.keys(farm[counts[cat]] || {}).length;
    const wantNet = Math.max(0, cs.boostedSfl - cs.costPerDay) / n;
    assert.ok(Math.abs(d.netPerNode - wantNet) < 1e-9, `${node}: net = (gross - cost) / nodes`);
    assert.ok(Math.abs(d.profitPerDay - d.netPerNode * d.effRatio) < 1e-9, `${node}: profit = net x eff`);
    // Gross is kept for reference and must never be the reported profit when either
    // correction actually bites.
    if (cs.costPerDay > 0) { sawCost = true; assert.ok(d.netPerNode < d.grossPerNode, `${node}: cost reduces net`); }
    if (d.effRatio !== 1) { sawEff = true; assert.ok(Math.abs(d.profitPerDay - d.netPerNode) > 1e-12, `${node}: eff moves profit`); }
  }
  assert.ok(sawCost, "at least one category has a production cost, else the net check is vacuous");
  assert.ok(sawEff, "at least one category has a non-unit efficiency, else the eff check is vacuous");
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
