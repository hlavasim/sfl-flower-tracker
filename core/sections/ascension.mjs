// section=ascension — the ascension calculator (ported from the external cockpit's
// documented model, MIGRATION.md §2, 2026-07-19), computing from THIS app's own
// engines instead of the retired /api/power-summary:
//   - expansion/upgrade costs, levels, crystals, node drip: core/engine/ascension.mjs
//     (formula port of the game source — nothing extracted or guessed);
//   - production rates: the power context's per-category boostedUnitsPerDay
//     (theoretical) × the measured efficiency ratio (posted farm-history snapshots,
//     same roadmapComputeEfficiency as sections eff/roadmap) for the effective mode;
//   - xpPerDay: buildCookingSection's totalXpPerDay (the verified cooking engine).
// POST-only (snapshots for efficiency); query grinx=0|1, max=1..10.
import { COOKING_RECIPES_DATA } from "../data/cooking.mjs";
// Merge lives here now, not in flowers.html. nodeAcq was the only place computing buy and
// expand, so the NODES page kept a THIRD engine for merges — which is how the same gold node
// came out negative on one page and positive on two others. One source or none.
import { MERGE_COSTS, countNodeTiers, roadmapEffFactor, getRoadmapSettings } from "../engine/roadmap.mjs";
import { detectCookingBoosts, computeFoodXP } from "../engine/cooking.mjs";
import { PRE_EXPANSION_REQUIREMENTS, ISLAND_PROGRESSION } from "../data/expansions.mjs";
import { BUMPKIN_XP_TABLE, findCollectible, miningToolsPerDay } from "../engine/power-helpers.mjs";
// Treasures sell to an NPC at a fixed coin price — the same table and boosts the treasury
// section uses, so the two cannot disagree about what a dig pile is worth.
import { TREASURE_SELL_PRICES } from "../data/crafting.mjs";
import {
  SWAMP_BASE_EXPANSION, SWAMP_EXPANSIONS_PER_ASCENSION, HOURS_PER_EXPANSION,
  getAscensionUpgradeCost, getAscensionExpansionRequirements, getExpansionCrystalCount,
  getAscensionExpansionDelta, ascensionStanding, ascensionXpFor, ascensionBaseline,
  bandXp, V150_XP, LEVELS_PER_ASCENSION,
} from "../engine/ascension.mjs";

const RES3 = ["Crimstone", "Oil", "Obsidian"];
// Pre-ascension expansions also cost Wood/Stone/Iron/Gold — the power + eff
// engines measure those categories too, so they are fully simulated alongside
// RES3. Gem has no production and stays a stock-only check (extraCost).
const PRE_RES = ["Wood", "Stone", "Iron", "Gold"];
const SIM_RES = [...RES3, ...PRE_RES];
const NODE_TO_RES = {
  "Crimstone Rock": "Crimstone", "Oil Reserve": "Oil", "Lava Pit": "Obsidian",
  "Tree": "Wood", "Stone Rock": "Stone", "Iron Rock": "Iron", "Gold Rock": "Gold",
};
// Continuous-expand build schedule start (MIGRATION.md §2.5).
const CONTINUOUS_EXPAND_START_MS = Date.UTC(2026, 7, 3); // 3.8.2026

const getCount = (inv, name) => {
  const v = (inv || {})[name];
  if (v === undefined || v === null) return 0;
  return parseFloat(v) || 0;
};

// XP threshold for an ABSOLUTE bumpkin level (pre-ascension gates, 1..150).
const xpForLevel = (lvl) => lvl <= 1 ? 0 : BUMPKIN_XP_TABLE[lvl - 2] ?? BUMPKIN_XP_TABLE[BUMPKIN_XP_TABLE.length - 1];

// Steps still missing BEFORE ascension: finish the current island, upgrade,
// finish the next... through volcano 30 (upgradeFarm.ts chain). asc: 0 marks
// them; level gates are absolute bumpkin levels. nodesAdded comes from the
// game's island layouts (deriveExpansionNodes deltas), so the sim gains
// production nodes through these steps too. Wood/Stone/Iron/Gold are fully
// simulated (SIM_RES); only Gem (no production) stays a stock-only extraCost.
export function buildPreAscensionSteps(islandType, basicLand, grinx) {
  const startIdx = ISLAND_PROGRESSION.findIndex((p) => p.island === islandType);
  if (startIdx === -1) return []; // already an ascension island
  const steps = [];
  let from = basicLand;
  for (let i = startIdx; i < ISLAND_PROGRESSION.length; i++) {
    const prog = ISLAND_PROGRESSION[i];
    const table = PRE_EXPANSION_REQUIREMENTS[prog.island] || {};
    for (let e = from + 1; e <= prog.max; e++) {
      const req = table[e];
      if (!req) continue;
      const cost = { Coins: req.coins || 0 };
      for (const r of SIM_RES) cost[r] = 0;
      const extraCost = {};
      for (const [r, q] of Object.entries(req.resources || {})) {
        const v = grinx ? q / 2 : q; // Grinx halves expansion resource costs (not coins)
        if (r in cost) cost[r] = v; else extraCost[r] = v;
      }
      steps.push({
        kind: "exp", asc: 0, island: prog.island, expansion: e, band: req.level, absLevel: req.level,
        cost, extraCost, time: req.seconds, nodesAdded: req.nodes || {}, crystals: 0, shards: 0,
      });
    }
    if (!prog.next) break;
    // island upgrade: expansions complete + flat item cost, no build time, no level gate
    const upCost = { Coins: 0 };
    for (const r of SIM_RES) upCost[r] = 0;
    const upExtra = {};
    for (const [r, q] of Object.entries(prog.upgradeItems)) {
      if (r in upCost) upCost[r] = q; else upExtra[r] = q;
    }
    steps.push({
      kind: "upgrade", asc: 0, island: prog.island, next: prog.next, expansion: null, band: 0, absLevel: 0,
      cost: upCost, extraCost: upExtra, time: 0, nodesAdded: {}, crystals: 0, shards: 0,
    });
    from = ISLAND_PROGRESSION[i + 1] ? prog.nextStart ?? 0 : 0;
  }
  return steps;
}

// steps for a = 1..maxAsc: one upgrade step + 12 expansion steps each (§2.2).
export function buildAscensionSteps(grinx, maxAsc) {
  const steps = [];
  for (let a = 1; a <= maxAsc; a++) {
    const base = 150 + (a - 1) * LEVELS_PER_ASCENSION;
    const up = getAscensionUpgradeCost(a);
    const upCost = { ...up.items, Coins: up.coins };
    if (grinx) for (const r of RES3) upCost[r] = upCost[r] / 2;
    steps.push({ kind: "upgrade", asc: a, expansion: null, band: 0, absLevel: base, cost: upCost, time: 0, nodesAdded: {}, crystals: 1, shards: 10 });
    for (let e = 1; e <= SWAMP_EXPANSIONS_PER_ASCENSION; e++) {
      const expansion = SWAMP_BASE_EXPANSION + e;
      const req = getAscensionExpansionRequirements(a, expansion);
      const cost = { ...req.resources, Coins: req.coins };
      if (grinx) for (const r of RES3) cost[r] = cost[r] / 2;
      const crystals = getExpansionCrystalCount(a, expansion);
      steps.push({
        kind: "exp", asc: a, expansion, band: req.levelRequired, absLevel: base + req.levelRequired,
        cost, time: req.seconds, nodesAdded: getAscensionExpansionDelta(a, expansion),
        crystals, shards: crystals * 10,
      });
    }
  }
  return steps;
}

export function buildAscensionSection(farm, powerData, cookingTotalXp, eff, settings = {}) {
  // 3rd param: either the plain xp/day number (legacy) or the whole cooking
  // section object — the latter also carries recipe costs for the leveling ROI.
  const cookingObj = cookingTotalXp && typeof cookingTotalXp === "object" ? cookingTotalXp : null;
  if (cookingObj) cookingTotalXp = cookingObj.totalXpPerDay || 0;
  const grinx = !!settings.grinx;
  const maxAsc = Math.min(Math.max(parseInt(settings.max) || 10, 1), 10);
  const inv = farm.inventory || {};
  const island = farm.island || {};
  const ascensionLevel = island.ascensionLevel || 0;
  const basicLand = getCount(inv, "Basic Land");
  const experience = farm.bumpkin?.experience || 0;

  // ── banked food XP: everything already COOKED and sitting in the inventory is XP
  // waiting to be eaten — and the user eats with the ×1.5 pet-streak boost active, so
  // it is valued with petSimulate boosts (the same computeFoodXP the Bumpkin page
  // uses). Level gates and ETAs below run on experience + this bank.
  let bankedFoodXp = 0;
  {
    const boosts = detectCookingBoosts(farm, { petSimulate: true });
    for (const [food, data] of Object.entries(COOKING_RECIPES_DATA)) {
      const qty = getCount(inv, food);
      if (qty > 0) bankedFoodXp += qty * computeFoodXP(food, data, data.building, boosts);
    }
  }
  const experienceEff = experience + bankedFoodXp;

  /*
   * Coins you could have, not just coins you hold.
   *
   * Every ascension step costs Coins, and treasures sitting in the inventory ARE coins — they
   * sell to the NPC at a fixed price, no market, no counterparty. Counting only farm.coins
   * understated what the plan can pay for and made steps look gated on coins that a dig pile
   * already covers.
   *
   * Reused wholesale from the treasury section rather than re-derived: TREASURE_SELL_PRICES
   * for the price and the same two boosts it detects (Treasure Map +20%, Camel +30%, and the
   * Camel counts whether placed or merely owned). Reported separately as well as folded into
   * the stock, so the plan never silently spends something the user has not sold yet.
   */
  let treasureBoost = 1;
  if (findCollectible(farm, "Treasure Map").length > 0) treasureBoost += 0.2;
  if (getCount(inv, "Camel") > 0 || findCollectible(farm, "Camel").length > 0) treasureBoost += 0.3;
  const treasureCoins = { total: 0, boost: treasureBoost, items: [] };
  for (const [name, baseCoins] of Object.entries(TREASURE_SELL_PRICES)) {
    const qty = getCount(inv, name);
    if (qty <= 0) continue;
    const coins = baseCoins * treasureBoost * qty;
    treasureCoins.total += coins;
    treasureCoins.items.push({ name, qty, baseCoins, coins });
  }
  treasureCoins.items.sort((a, b) => b.coins - a.coins);

  // ── current state (§2.7 `current`) ──
  const coinsHeld = parseFloat(farm.coins) || 0;
  const stock = { Coins: coinsHeld + treasureCoins.total };
  for (const r of SIM_RES) stock[r] = getCount(inv, r);
  if (grinx) { /* grinx halves COSTS, not stock */ }
  const bandStandings = {};
  for (let a = 1; a <= maxAsc; a++) bandStandings[a] = ascensionStanding(experienceEff, a);
  const nodeCounts = {
    Crimstone: Object.keys(farm.crimstones || {}).length,
    Oil: Object.keys(farm.oilReserves || {}).length,
    Obsidian: Object.keys(farm.lavaPits || {}).length,
    Wood: Object.keys(farm.trees || {}).length,
    Stone: Object.keys(farm.stones || {}).length,
    Iron: Object.keys(farm.iron || {}).length,
    Gold: Object.keys(farm.gold || {}).length,
  };
  const current = {
    island: island.type || "basic", ascensionLevel, basicLand, stock, experience,
    bumpkinLevel: experience >= V150_XP ? 150 : null,
    bankedFoodXp,
    // stock.Coins already includes treasureCoins.total; both parts are reported so the page
    // can show "X coins + Y from treasures you have not sold" rather than one opaque number.
    coinsHeld, treasureCoins,
    // ready to ascend into the NEXT band = current band complete = its baseline reached
    // (banked cooked food counts — it will be eaten with the pet boost before ascending)
    readyToAscend: ascensionLevel === 0 ? experienceEff >= V150_XP : experienceEff >= ascensionBaseline(ascensionLevel + 1),
    bandStandings,
    crystals: getCount(inv, "Ascension Crystal"),
    shards: getCount(inv, "Ascension Shard"),
    grinx: getCount(inv, "Grinx's Hammer") > 0,
  };

  // ── rates (§2.7 `rates`): theoretical from the power categories, effective ×ratio ──
  const cats = (powerData && powerData.categories && powerData.categories.catSummaries) || {};
  const effBy = (eff && eff.effByCat) || {};
  const CAT_OF = { Crimstone: "crimstone", Oil: "oil", Obsidian: "obsidian", Wood: "trees", Stone: "stone", Iron: "iron", Gold: "gold" };
  const rates = { xpPerDay: cookingTotalXp || 0, windowDays: (eff && eff.meta && eff.meta.days) || 0 };
  for (const r of SIM_RES) {
    const cat = CAT_OF[r];
    const theo = (cats[cat] && cats[cat].boostedUnitsPerDay) || 0;
    const ratio = (effBy[cat] && effBy[cat].measured) ? effBy[cat].ratio : 0;
    rates[r] = { theo, eff: theo * ratio, ratio };
  }

  // ── steps + done-marking (steps already built on this farm) ──
  // Pre-ascension remainder first (finish current island → ... → volcano 30),
  // then the ascension ladder. Ascension islands have no pre-steps.
  const preSteps = ascensionLevel === 0 ? buildPreAscensionSteps(island.type || "basic", basicLand, grinx) : [];
  const steps = [...preSteps, ...buildAscensionSteps(grinx, maxAsc)];
  for (const s of steps) {
    if (s.asc === 0) {
      s.done = false; // built only for the not-yet-completed range
      s.standing = 0;
      s.levelMet = experienceEff >= xpForLevel(s.band);
      s.levelXpNeeded = xpForLevel(s.band);
      continue;
    }
    s.done = s.asc < ascensionLevel
      || (s.asc === ascensionLevel && s.kind === "upgrade")
      || (s.asc === ascensionLevel && s.kind === "exp" && s.expansion <= basicLand);
    s.standing = bandStandings[s.asc] || 0;
    s.levelMet = s.kind === "upgrade"
      ? (s.asc === 1 ? experienceEff >= V150_XP : (bandStandings[s.asc - 1] || 0) >= LEVELS_PER_ASCENSION)
      : (s.standing >= s.band);
    // exp step: XP threshold of its within-band level; upgrade step: previous band
    // complete == baseline of THIS ascension reached (baseline(1) = level-150 XP).
    s.levelXpNeeded = s.kind === "exp" ? ascensionXpFor(s.asc, s.band) : ascensionBaseline(s.asc);
  }
  // pending = not built yet, in order
  const pending = steps.filter((s) => !s.done);
  // stock of the non-simulated pre-step resources (Wood, Stone, ...) for UI have/miss
  current.extraStock = {};
  for (const s of pending) for (const r of Object.keys(s.extraCost || {}))
    if (!(r in current.extraStock)) current.extraStock[r] = getCount(inv, r);

  // cumulative costs over PENDING steps (frontier walks these, §2.6)
  const cum = { Coins: 0 };
  for (const r of SIM_RES) cum[r] = 0;
  for (const s of pending) {
    for (const r of [...SIM_RES, "Coins"]) cum[r] += s.cost[r] || 0;
    s.cum = { ...cum };
  }

  // ── frontier / bottleneck (stock-only, §2.6) ──
  let frontier = null, bottleneck = null;
  for (const s of pending) {
    const short = [...SIM_RES, "Coins"].find((r) => (s.cum[r] || 0) > stock[r]);
    if (short) { bottleneck = short; break; }
    frontier = { asc: s.asc, expansion: s.expansion, kind: s.kind, island: s.island || null };
  }
  // per-resource reach: how many pending steps each resource alone covers
  const reach = {};
  for (const r of [...SIM_RES, "Coins"]) {
    let n = 0;
    for (const s of pending) { if ((s.cum[r] || 0) <= stock[r]) n++; else break; }
    reach[r] = n;
  }

  // ── node-aware production simulation (§2.4), eff + theo ──
  // level ETA counts banked cooked food (experienceEff), consistent with the
  // level cell in the UI.
  const levelEta = (s, xpPerDay) => {
    const need = (s.levelXpNeeded || 0) - experienceEff;
    if (need <= 0) return 0;
    if (!(xpPerDay > 0)) return null; // fallback: show remaining XP (§2.3)
    return need / xpPerDay;
  };
  // Per-resource INDEPENDENT timelines: each resource farms continuously and its
  // rate GROWS as that resource's own nodes are added by expansions — but a
  // resource never waits on another. resEta[r] for a step = the point on r's own
  // monotonic timeline where cumulative production (stock + Σ rate·dt across the
  // node-growth schedule) first covers that step's cumulative cost. Monotonic by
  // construction (cumulative cost ↑, time ↑), so a later step can never show a
  // smaller time than an earlier one. Farm ETA of a step = max over resources of
  // resEta plus the level ETA (you need every resource AND the level).
  for (const mode of ["eff", "theo"]) {
    const nodes = { ...nodeCounts };
    const perNode = {};
    for (const r of SIM_RES) perNode[r] = nodeCounts[r] > 0 ? (rates[r][mode] || 0) / nodeCounts[r] : 0;
    const prod = { ...stock };  // total produced so far (incl. starting stock)
    const tR = {}; for (const r of SIM_RES) tR[r] = 0;
    const blockedR = {}; for (const r of SIM_RES) blockedR[r] = false;
    for (const s of pending) {
      if (!s.sim) s.sim = {};
      const resEta = {};
      for (const r of SIM_RES) {
        const cumNeed = s.cum[r] || 0;
        if (cumNeed <= stock[r]) { resEta[r] = 0; continue; }  // stock alone covers it
        if (blockedR[r]) { resEta[r] = null; continue; }        // no production, unreachable
        const rate = nodes[r] * perNode[r];
        if (prod[r] < cumNeed) {
          if (!(rate > 0)) { blockedR[r] = true; resEta[r] = null; continue; }
          tR[r] += (cumNeed - prod[r]) / rate;  // advance r's own clock to cover cumNeed
          prod[r] = cumNeed;
        }
        resEta[r] = tR[r];
      }
      const lEta = levelEta(s, rates.xpPerDay);
      const times = SIM_RES.map((r) => resEta[r]);
      const blocked = times.some((v) => v == null);
      const maxRes = blocked ? null : Math.max(0, ...times);
      s.sim[mode] = {
        res: { ...resEta },
        all: maxRes,
        blocked,
        levelEtaDays: lEta == null ? null : lEta,
        farmEtaDays: blocked ? null : Math.max(maxRes, lEta == null ? 0 : lEta),
      };
      // built expansion adds its nodes for SUBSEQUENT steps (higher rate onward)
      for (const [node, n] of Object.entries(s.nodesAdded || {})) {
        const r = NODE_TO_RES[node];
        if (r) nodes[r] += n;
      }
    }
  }

  // ── continuous-expand deadline (§2.5): sequential build slots from the start date ──
  const nowMs = Date.now();
  // pre-ascension steps (asc 0) build under the normal rules starting NOW;
  // only the ascension ladder waits for the continuous-expand start date.
  let slotMs = nowMs;
  let stuck = null;
  for (const s of pending) {
    if (s.asc >= 1 && slotMs < CONTINUOUS_EXPAND_START_MS) slotMs = CONTINUOUS_EXPAND_START_MS;
    s.buildSlotDays = (slotMs - nowMs) / 86400000;
    // stuck is per-mode: the UI shows one mode's ETAs, so the jam verdict must come
    // from the SAME mode (an eff-only flag next to theo ETAs reads "jams 14d vs 8h").
    for (const mode of ["eff", "theo"]) {
      const sim = s.sim && s.sim[mode];
      if (sim) sim.stuck = sim.farmEtaDays == null ? true : sim.farmEtaDays > s.buildSlotDays + 1e-9;
    }
    const farmEta = s.sim && s.sim.eff ? s.sim.eff.farmEtaDays : null;
    s.stuck = s.sim && s.sim.eff ? s.sim.eff.stuck : true;
    if (s.stuck && !stuck) stuck = { asc: s.asc, expansion: s.expansion, kind: s.kind, island: s.island || null, buildSlotDays: s.buildSlotDays, farmEtaDays: farmEta };
    slotMs += (s.time || 0) * 1000;
  }

  // ── FLOWER economics per step: daily production gain of the added nodes + ROI ──
  // Value of one node of a category = the power context's boosted SFL/day for the
  // category ÷ current node count (approximation: today's boosts and prices).
  // Cost of a step = resources at P2P prices + coins/coinsPerSFL (+ gems/gemsPerSFL)
  // + the INCREMENTAL leveling cost: XP still missing to its level gate beyond what
  // earlier steps already require, priced at the cooking engine's cost per XP
  // (selected recipes). Resources without a P2P price flag costUnpriced (cost is
  // then a lower bound). ROI = payback days = cost / daily gain.
  const p2pP = powerData && powerData.p2pPrices ? powerData.p2pPrices : {};
  const xr = (powerData && powerData.exchangeRates) || { coinsPerSFL: 320, gemsPerSFL: 0 };
  const NODE_CAT = {
    "Crop Plot": "crops", "Fruit Patch": "fruits", "Tree": "trees", "Stone Rock": "stone",
    "Iron Rock": "iron", "Gold Rock": "gold", "Crimstone Rock": "crimstone",
    "Oil Reserve": "oil", "Lava Pit": "obsidian", "Beehive": "bees", "Flower Bed": "flowers",
  };
  const catNodeCount = {
    crops: Object.keys(farm.crops || {}).length,
    fruits: Object.keys(farm.fruitPatches || {}).length,
    trees: Object.keys(farm.trees || {}).length,
    stone: Object.keys(farm.stones || {}).length,
    iron: Object.keys(farm.iron || {}).length,
    gold: Object.keys(farm.gold || {}).length,
    crimstone: Object.keys(farm.crimstones || {}).length,
    oil: Object.keys(farm.oilReserves || {}).length,
    obsidian: Object.keys(farm.lavaPits || {}).length,
    bees: Object.keys(farm.beehives || {}).length,
    flowers: Object.keys((farm.flowers && farm.flowers.flowerBeds) || {}).length,
  };
  /*
   * Measured throughput efficiency, mirroring roadmapEffFactor in core/engine/roadmap.mjs:
   * the measured ratio where the category has its own harvest signal, the farm's mean
   * activity where it does not (bees), and 1 with no history at all. Obsidian is excluded
   * for the reason given there — its value is already capped at one sale per week, so
   * scaling it again double-counts the same limit.
   */
  const effRatioFor = (cat) => {
    if (cat === "obsidian") return 1;
    const e = effBy[cat];
    if (e && e.measured) return e.ratio;
    const mean = eff && typeof eff.meanRatio === "number" ? eff.meanRatio : 0;
    return mean > 0 ? mean : 1;
  };
  /*
   * What one node of a category is worth per day. boostedSfl is GROSS revenue and the
   * category's production inputs (seeds, mining tools) sit in costPerDay, so the value has
   * to be net of them; and it has to carry the same efficiency correction the resource
   * rates below already apply, or the plan compares a theoretical income against realistic
   * costs. Gross is kept alongside for reference.
   */
  const perNodeSfl = {}, grossPerNodeSfl = {};
  for (const [cat, n] of Object.entries(catNodeCount)) {
    const cs = cats[cat] || {};
    grossPerNodeSfl[cat] = n > 0 ? (cs.boostedSfl || 0) / n : 0;
    const net = n > 0 ? Math.max(0, (cs.boostedSfl || 0) - (cs.costPerDay || 0)) / n : 0;
    perNodeSfl[cat] = net * effRatioFor(cat);
  }
  // cooking cost per XP from the selected recipe of each building, xp/day-weighted
  let costPerXp = null;
  if (cookingObj && cookingObj.buildings) {
    let costDay = 0, xpDay = 0, priced = true;
    for (const b of Object.values(cookingObj.buildings)) {
      if (!(b.xpPerDay > 0)) continue;
      const r = (b.recipes || []).find((x) => x.name === b.recipe);
      if (!r || !(r.xp > 0) || r.cost == null) { priced = false; continue; }
      costDay += (r.cost / r.xp) * b.xpPerDay;
      xpDay += b.xpPerDay;
    }
    if (xpDay > 0 && priced) costPerXp = costDay / xpDay;
    else if (xpDay > 0) costPerXp = costDay / xpDay; // partial: lower bound
  }
  rates.farmSflPerDay = (powerData && powerData.categories && powerData.categories.totalBoostedSfl) || 0;
  rates.costPerXp = costPerXp;
  let maxXpReq = experienceEff;
  for (const s of pending) {
    let gain = 0;
    for (const [node, n] of Object.entries(s.nodesAdded || {})) {
      const cat = NODE_CAT[node];
      if (cat) gain += n * (perNodeSfl[cat] || 0);
    }
    s.flowerPerDay = gain;
    let cost = 0, unpriced = false;
    for (const [r, q] of Object.entries({ ...s.cost, ...s.extraCost })) {
      if (!q) continue;
      if (r === "Coins") cost += xr.coinsPerSFL > 0 ? q / xr.coinsPerSFL : 0;
      else if (r === "Gem") { if (xr.gemsPerSFL > 0) cost += q / xr.gemsPerSFL; else unpriced = true; }
      else if (p2pP[r] > 0) cost += q * p2pP[r];
      else unpriced = true;
    }
    const incXp = Math.max(0, (s.levelXpNeeded || 0) - maxXpReq);
    maxXpReq = Math.max(maxXpReq, s.levelXpNeeded || 0);
    s.levelCostSfl = costPerXp != null ? incXp * costPerXp : (incXp > 0 ? null : 0);
    s.costSfl = cost;
    s.costUnpriced = unpriced || (incXp > 0 && costPerXp == null);
    const totalCost = cost + (s.levelCostSfl || 0);
    s.roiDays = gain > 0 ? totalCost / gain : null;
  }

  // ── node acquisition cost: expand vs buy-with-sunstones (per profit node) ──
  // "Profit" nodes generate FLOWER income by selling their resource: crops,
  // fruits, trees, stone, iron, gold, crimstone. Oil/Beehive/Sunstone Rock/Lava
  // Pit/Flower Bed/crystals are excluded (currency or non-income, user's call).
  //
  // EXPAND cost per node (rolling): walk the pending expansions; an expansion
  // with no profit node is "dead" and its full FLOWER cost (resources+coins+XP
  // leveling) carries forward; the next expansion WITH profit node(s) costs
  // (carried dead cost + its own), split EQUALLY among the profit nodes it adds.
  // BUY cost per node: the N-th bought node costs base+idx×increase Sunstones =
  // ×3 Obsidian, priced at the Obsidian market price; time = Obsidian ÷ eff/day.
  /*
   * Nodes the acquisition table covers. Lava Pit is included even though it earns no
   * FLOWER — obsidian cannot be sold (TradeResource in the game's tradeLimits.ts excludes
   * it), and the pit is the only source of the very resource this comparison is denominated
   * in, so leaving it out made the table silent about the one purchase that unlocks the
   * others. Its return is reported in obsidian/day instead of FLOWER/day.
   */
  /*
   * Oil Reserve was missing here exactly the way Lava Pit once was, and for the same reason:
   * everything behind it was already in place (NON_SELLABLE_CATS knows "oil", so the
   * units/day path works) but the node itself was never listed, so the expand-vs-buy table
   * and every per-node section below it silently had no oil row at all.
   *
   * Price 40 / +20 per purchase, desert-gated — verified against RESOURCE_NODE_PRICES in the
   * game's events/landExpansion/buyResource.ts, not copied from our own inline table.
   */
  const PROFIT_NODES = new Set(["Crop Plot", "Fruit Patch", "Tree", "Stone Rock", "Iron Rock", "Gold Rock", "Crimstone Rock", "Oil Reserve", "Lava Pit", "Flower Bed"]);
  // exchangeObsidian.ts OBSIDIAN_PRICE — 3 obsidian buys 1 sunstone, on click.
  const OBSIDIAN_PER_SUNSTONE = 3;
  // Prices from the game's RESOURCE_NODE_PRICES (events/landExpansion/buyResource.ts).
  const NODE_BUY = {
    "Crop Plot": { base: 3, inc: 2, fk: "crops" }, "Fruit Patch": { base: 5, inc: 5, fk: "fruitPatches" },
    "Tree": { base: 4, inc: 3, fk: "trees" }, "Stone Rock": { base: 4, inc: 3, fk: "stones" },
    "Iron Rock": { base: 7, inc: 5, fk: "iron" }, "Gold Rock": { base: 10, inc: 6, fk: "gold" },
    "Crimstone Rock": { base: 20, inc: 20, fk: "crimstones" },
    "Oil Reserve": { base: 40, inc: 20, fk: "oilReserves" },
    "Lava Pit": { base: 40, inc: 40, fk: "lavaPits" },
    // Flower beds are NOT a flat farm key: farm.flowers is a container, {flowerBeds,
    // discovered}. Counting farm.flowers directly returns 2 — the container's own keys —
    // where the farm has 4 beds, so the escalation and the per-node split would both be
    // wrong. detectFarmCapacity already reads farm.flowers.flowerBeds; `fk` is a dotted
    // path so this follows the same route.
    "Flower Bed": { base: 30, inc: 25, fk: "flowers.flowerBeds" },
  };
  /** Resolve a NODE_BUY.fk, which may be a dotted path into a container. */
  const nodeOwnedCount = (fk) => {
    let o = farm;
    for (const part of String(fk).split(".")) { if (!o || typeof o !== "object") return 0; o = o[part]; }
    return o && typeof o === "object" ? Object.keys(o).length : 0;
  };
  const NODE_TO_CAT = { "Crop Plot": "crops", "Fruit Patch": "fruits", "Tree": "trees", "Stone Rock": "stone", "Iron Rock": "iron", "Gold Rock": "gold", "Crimstone Rock": "crimstone", "Oil Reserve": "oil", "Lava Pit": "obsidian", "Flower Bed": "flowers" };
  // Categories whose output cannot be sold — reported in units/day, never as FLOWER income.
  const NON_SELLABLE_CATS = new Set(["obsidian", "oil"]);
  const obsidianPrice = p2pP["Obsidian"] || 0;
  const obsidianPerDay = (rates.Obsidian && rates.Obsidian.eff) || 0;

  /*
   * Valuation rule: anything you can BUY is worth its purchase price; anything you can
   * only PRODUCE is worth what producing it costs. Obsidian and oil are the two that
   * cannot be bought, and pricing obsidian at its marketplace quote is what made the old
   * table nonsense — the quote (~20 FLOWER) is ~12x its production cost (~1.7), so the
   * buy-with-sunstones path looked absurdly expensive.
   *
   * Both production models already exist in power.mjs and are reused, not rebuilt:
   *   obsidian — calcLavaPitCostPerDay: lava pit recipe inputs per ignition
   *   oil      — calcToolCostPerDay: Oil Drill inputs (coins + wood/iron/leather)
   * Each arrives here as its category's costPerDay / boostedUnitsPerDay.
   */
  const PRODUCED_CAT = { Obsidian: "obsidian", Oil: "oil" };
  const prodCost = {};
  for (const [res, cat] of Object.entries(PRODUCED_CAT)) {
    const cs = cats[cat];
    if (cs && cs.costPerDay > 0 && cs.boostedUnitsPerDay > 0) prodCost[res] = cs.costPerDay / cs.boostedUnitsPerDay;
  }
  /** Price a resource bag in FLOWER under the rule above. */
  const priceRes = (res) => {
    let sfl = 0, unpriced = false;
    for (const [r, q] of Object.entries(res || {})) {
      if (!q) continue;
      if (r === "Coins") sfl += xr.coinsPerSFL > 0 ? q / xr.coinsPerSFL : 0;
      else if (r === "Gem") { if (xr.gemsPerSFL > 0) sfl += q / xr.gemsPerSFL; else unpriced = true; }
      else if (prodCost[r] > 0) sfl += q * prodCost[r];
      else if (p2pP[r] > 0) sfl += q * p2pP[r];
      else unpriced = true;
    }
    return { sfl, unpriced };
  };
  // EXPAND: rolling dead-cost accumulation
  const expandAcq = {};
  let deadCost = 0, deadUnpriced = false;
  // RAW resources are rolled up alongside the FLOWER figure. Obsidian is the gating
  // resource for both paths, and comparing paths through a P2P sell price hides that —
  // so the per-node requirement is also reported in actual materials.
  let deadRes = {};
  const addRes = (into, from) => {
    for (const [r, q] of Object.entries(from || {})) into[r] = (into[r] || 0) + (Number(q) || 0);
    return into;
  };
  for (const s of pending) {
    const stepCost = (s.costSfl || 0) + (s.levelCostSfl || 0);
    const prof = [];
    for (const [node, q] of Object.entries(s.nodesAdded || {})) if (PROFIT_NODES.has(node)) for (let i = 0; i < q; i++) prof.push(node);
    if (!prof.length) {
      deadCost += stepCost;
      addRes(deadRes, s.cost); addRes(deadRes, s.extraCost);
      if (s.costUnpriced) deadUnpriced = true;
      continue;
    }
    const total = deadCost + stepCost, unpriced = deadUnpriced || s.costUnpriced;
    const totalRes = addRes(addRes(addRes({}, deadRes), s.cost), s.extraCost);
    deadCost = 0; deadUnpriced = false; deadRes = {};
    const perNode = total / prof.length;
    const resPerNode = {};
    for (const [r, q] of Object.entries(totalRes)) if (q) resPerNode[r] = q / prof.length;
    // Material cost under the production-cost rule. Distinct from `cost`, which values
    // every resource at its marketplace quote — kept so the level/XP part stays visible.
    const priced = priceRes(resPerNode);
    const levelPerNode = (s.levelCostSfl || 0) / prof.length;
    const obsidian = resPerNode["Obsidian"] || 0;
    /*
     * The same figures UNDIVIDED. The per-node split is the fair price only if you want
     * every node the expansion hands you; if you want one specific node and the rest is
     * incidental, you still pay the whole expansion. Both are reported because they answer
     * different questions, and the split alone understates a targeted purchase.
     */
    const totalPriced = priceRes(totalRes);
    const totalObsidian = totalRes["Obsidian"] || 0;
    const label = s.asc === 0 ? `${s.island} e${s.expansion}` : (s.kind === "upgrade" ? `A${s.asc}` : `A${s.asc}·e${s.expansion}`);
    for (const node of prof) (expandAcq[node] = expandAcq[node] || []).push({
      cost: perNode, res: resPerNode, bundle: prof.length, unpriced, label,
      matSfl: priced.sfl, matUnpriced: priced.unpriced, levelSfl: levelPerNode,
      obsidian, obsidianDays: obsidianPerDay > 0 ? obsidian / obsidianPerDay : null,
      totalRes, totalMatSfl: totalPriced.sfl, totalMatUnpriced: totalPriced.unpriced,
      totalObsidian, totalObsidianDays: obsidianPerDay > 0 ? totalObsidian / obsidianPerDay : null,
      farmEtaDays: s.sim && s.sim.eff ? s.sim.eff.farmEtaDays : null, buildSlotDays: s.buildSlotDays,
    });
  }
  // BUY: next few purchases per node type
  const nodeAcq = { obsidianPerDay, obsidianPrice, costPerXp, prodCost,
    obsidianPerSunstone: OBSIDIAN_PER_SUNSTONE, perType: {} };
  /*
   * MERGE: four T1 nodes become one T2 (and four T2 become one T3).
   *
   * Effective capacity is unchanged — a T2 counts as four nodes — and so is tool cost per unit
   * of yield: chop.ts's getRequiredAxeAmount() returns `1 * multiplier` while the yield is
   * `amount.mul(multiplier)`, so a multiplier-4 node costs four tools per dig and pays four
   * times. Verified in the game source, not assumed. What merging actually buys is the flat
   * yieldBonus, and nothing else.
   *
   * The bonus is FLAT, so percentage yield boosts must not multiply it. That is the one place
   * merge legitimately differs from buy and must not be unified away.
   */
  const MERGE_TO_FARMKEY = { trees: "trees", stones: "stones", iron: "iron", gold: "gold" };
  const MERGE_TO_CAT = { trees: "trees", stones: "stone", iron: "iron", gold: "gold" };
  const mergeSettings = getRoadmapSettings(settings.roadmapSettings || {});
  const mergeFor = (mergeKey) => {
    const mc = MERGE_COSTS[mergeKey];
    const cat = MERGE_TO_CAT[mergeKey];
    if (!mc || !cat) return null;
    const tiers = countNodeTiers(farm[MERGE_TO_FARMKEY[mergeKey]] || {});
    const price = p2pP[(cats[cat] || {}).product] || 0;
    /*
     * DIGS per day, not units per day. The bonus is a flat add per dig, so multiplying it by
     * output would double-count every yield boost the node already has — boostedUnitsPerDay
     * includes them. miningToolsPerDay is the dig count, and it is what the buy side prices
     * tools from, so both stay on one basis.
     */
    let cyclesPerDay = 0;
    try { cyclesPerDay = (miningToolsPerDay(cat, powerData.capacity, farm, []) || 0) / Math.max(1, catNodeCount[cat] || 1); } catch (e) { cyclesPerDay = 0; }
    const eff = effRatioFor(cat);
    const out = [];
    for (const tier of [2, 3]) {
      const c = mc[`t${tier}`];
      if (!c) continue;
      // Delta at T3 is 2.5 - 4x0.5 = +0.5: four T2s already carried half a bonus each.
      const bonus = tier === 2 ? mc.yieldBonus.t2 : (mc.yieldBonus.t3 - 4 * mc.yieldBonus.t2);
      const have = tier === 2 ? tiers.t1 : tiers.t2;
      out.push({
        tier, obsidian: c.obsidian, coins: c.coins,
        bonus, gainPerDay: bonus * cyclesPerDay * price * eff,
        // The game needs four of the lower tier in hand; below that it is not yet actionable.
        have, need: 4, ready: have >= 4,
        matSfl: prodCost["Obsidian"] > 0 ? c.obsidian * prodCost["Obsidian"] : null,
      });
    }
    return { mergeKey, cat, tiers, merges: out };
  };
  nodeAcq.merge = Object.keys(MERGE_COSTS).map(mergeFor).filter(Boolean);

  for (const node of PROFIT_NODES) {
    const cat = NODE_TO_CAT[node];
    // Same figure the plan's step ROI uses — one source, so the table and the plan cannot
    // disagree about what a node earns.
    const profitPerDay = perNodeSfl[cat] || 0;
    const effRatio = effRatioFor(cat);
    const grossPerNode = grossPerNodeSfl[cat] || 0;
    const netPerNode = effRatio > 0 ? profitPerDay / effRatio : 0;
    // For a category that cannot be sold, FLOWER/day is structurally zero and meaningless;
    // what one node returns is units of the resource itself.
    const sellable = !NON_SELLABLE_CATS.has(cat);
    const catCount = catNodeCount[cat] || 0;
    const unitsPerNode = catCount > 0
      ? (((cats[cat] || {}).boostedUnitsPerDay || 0) / catCount) * effRatio : 0;
    const np = NODE_BUY[node];
    const owned = nodeOwnedCount(np.fk);
    // The real escalation input: how many of this node the farm has BOUGHT.
    const bought = Math.floor(Number((farm.farmActivity || {})[`${node} Bought`]) || 0);
    const buy = [];
    for (let i = 0; i < 3; i++) {
      // buyResource.ts pays in SUNSTONE, and sunstone is itself bought with obsidian at
      // a fixed rate — exchangeObsidian.ts: OBSIDIAN_PRICE = 3, one sunstone per 3
      // obsidian, on click. So obsidian is the real currency of the buy path, which makes
      // it the gating resource for BOTH paths and lets them be compared directly.
      //
      // Escalation is per PURCHASE, not per node owned: getResourcePrice reads
      // farmActivity["<Node> Bought"]. Using the owned count overstated prices by up to
      // 15.4x on a real farm (Crop Plot: 9 sunstones actual, 139 reported).
      const sun = np.base + (bought + i) * np.inc;
      const obs = sun * OBSIDIAN_PER_SUNSTONE;
      buy.push({
        sunstones: sun,
        obsidian: obs,
        obsidianDays: obsidianPerDay > 0 ? obs / obsidianPerDay : null,
        // Obsidian is the ONLY input of the buy path, so its material cost is entirely
        // obsidian priced at production cost.
        matSfl: prodCost["Obsidian"] > 0 ? obs * prodCost["Obsidian"] : null,
        matUnpriced: !(prodCost["Obsidian"] > 0),
      });
    }
    /*
     * "earns 0" and "we cannot price it" are different answers and used to look identical.
     * Flowers are the case: the category produces ~6 units/day, but no flower has a price in
     * the sfl.world p2p feed at all (only Sunflower and Cauliflower, which are crops), so its
     * FLOWER figure is structurally 0 while the node is genuinely productive. Reporting that
     * as a plain zero reads as "worthless", which is wrong — hence the flag, so the table can
     * show units/day and say the price is unknown.
     */
    const unpriced = sellable && unitsPerNode > 0 && !(grossPerNode > 0);
    nodeAcq.perType[node] = { profitPerDay, grossPerNode, netPerNode, effRatio, effMeasured: !!(effBy[cat] && effBy[cat].measured), unpriced,
      sellable, unitsPerNode, unitName: (cats[cat] || {}).product || null,
      expand: (expandAcq[node] || []).slice(0, 4), buy, currentCount: owned, bought };
  }
  /*
   * EXPAND vs BUY, decided here rather than in the page's render.
   *
   * It was already a pure function of the two figures this section serves — so it was a fourth
   * engine only by accident of where it lived, and leaving it there meant the NODES page could
   * still disagree with everything else about which side wins.
   *
   * Obsidian decides it, because obsidian gates BOTH paths: buying pays sunstone, and sunstone
   * is bought with obsidian 3:1. Materials are compared separately and only reported when they
   * disagree with the obsidian verdict, since that is the case worth a sentence.
   */
  for (const [node, d] of Object.entries(nodeAcq.perType)) {
    const ex = (d.expand || [])[0] || null, bu = (d.buy || [])[0] || null;
    const exObs = ex ? ex.totalObsidian : null, buObs = bu ? bu.obsidian : null;
    const obsWin = exObs == null ? "buy" : buObs == null ? "expand" : (exObs <= buObs ? "expand" : "buy");
    // An unpriced expand bag is only a LOWER bound, so it must not be allowed to claim a win.
    const exMat = ex && !ex.totalMatUnpriced ? ex.totalMatSfl : null;
    const buMat = bu ? bu.matSfl : null;
    const matWin = exMat == null ? (buMat == null ? null : "buy") : buMat == null ? "expand" : (exMat <= buMat ? "expand" : "buy");
    d.verdict = {
      obsWin, matWin,
      obsSaved: (exObs != null && buObs != null) ? Math.abs(buObs - exObs) : null,
      matDisagrees: matWin != null && matWin !== obsWin,
      exObs, buObs, exMat, buMat,
    };
  }

  return { current, rates, steps: pending, frontier, bottleneck, reach, nodeCounts, grinx, maxAsc, nodeAcq };
}
