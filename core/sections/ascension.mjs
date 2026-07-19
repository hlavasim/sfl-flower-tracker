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
import { detectCookingBoosts, computeFoodXP } from "../engine/cooking.mjs";
import { PRE_EXPANSION_REQUIREMENTS, ISLAND_PROGRESSION } from "../data/expansions.mjs";
import { BUMPKIN_XP_TABLE } from "../engine/power-helpers.mjs";
import {
  SWAMP_BASE_EXPANSION, SWAMP_EXPANSIONS_PER_ASCENSION, HOURS_PER_EXPANSION,
  getAscensionUpgradeCost, getAscensionExpansionRequirements, getExpansionCrystalCount,
  getAscensionExpansionDelta, ascensionStanding, ascensionXpFor, ascensionBaseline,
  bandXp, V150_XP, LEVELS_PER_ASCENSION,
} from "../engine/ascension.mjs";

const RES3 = ["Crimstone", "Oil", "Obsidian"];
const NODE_TO_RES = { "Crimstone Rock": "Crimstone", "Oil Reserve": "Oil", "Lava Pit": "Obsidian" };
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
// them; level gates are absolute bumpkin levels. Deviations from the ascension
// steps (documented): nodesAdded stays {} (pre-ascension expansion node
// layouts not ported — the sim keeps current production rates through these
// steps, slightly pessimistic), and non-tracked resources (Wood, Stone, Iron,
// Gold, Gem) are carried in extraCost for stock have/miss display only, not
// simulated over time.
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
      const cost = { Crimstone: 0, Oil: 0, Obsidian: 0, Coins: req.coins || 0 };
      const extraCost = {};
      for (const [r, q] of Object.entries(req.resources || {})) {
        const v = grinx ? q / 2 : q; // Grinx halves expansion resource costs (not coins)
        if (r in cost) cost[r] = v; else extraCost[r] = v;
      }
      steps.push({
        kind: "exp", asc: 0, island: prog.island, expansion: e, band: req.level, absLevel: req.level,
        cost, extraCost, time: req.seconds, nodesAdded: {}, crystals: 0, shards: 0,
      });
    }
    if (!prog.next) break;
    // island upgrade: expansions complete + flat item cost, no build time, no level gate
    const upCost = { Crimstone: 0, Oil: 0, Obsidian: 0, Coins: 0 };
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

  // ── current state (§2.7 `current`) ──
  const stock = {
    Crimstone: getCount(inv, "Crimstone"), Oil: getCount(inv, "Oil"),
    Obsidian: getCount(inv, "Obsidian"), Coins: parseFloat(farm.coins) || 0,
  };
  if (grinx) { /* grinx halves COSTS, not stock */ }
  const bandStandings = {};
  for (let a = 1; a <= maxAsc; a++) bandStandings[a] = ascensionStanding(experienceEff, a);
  const nodeCounts = {
    Crimstone: Object.keys(farm.crimstones || {}).length,
    Oil: Object.keys(farm.oilReserves || {}).length,
    Obsidian: Object.keys(farm.lavaPits || {}).length,
  };
  const current = {
    island: island.type || "basic", ascensionLevel, basicLand, stock, experience,
    bumpkinLevel: experience >= V150_XP ? 150 : null,
    bankedFoodXp,
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
  const CAT_OF = { Crimstone: "crimstone", Oil: "oil", Obsidian: "obsidian" };
  const rates = { xpPerDay: cookingTotalXp || 0, windowDays: (eff && eff.meta && eff.meta.days) || 0 };
  for (const r of RES3) {
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
  const cum = { Crimstone: 0, Oil: 0, Obsidian: 0, Coins: 0 };
  for (const s of pending) {
    for (const r of [...RES3, "Coins"]) cum[r] += s.cost[r] || 0;
    s.cum = { ...cum };
  }

  // ── frontier / bottleneck (stock-only, §2.6) ──
  let frontier = null, bottleneck = null;
  for (const s of pending) {
    const short = [...RES3, "Coins"].find((r) => (s.cum[r] || 0) > stock[r]);
    if (short) { bottleneck = short; break; }
    frontier = { asc: s.asc, expansion: s.expansion, kind: s.kind };
  }
  // per-resource reach: how many pending steps each resource alone covers
  const reach = {};
  for (const r of [...RES3, "Coins"]) {
    let n = 0;
    for (const s of pending) { if ((s.cum[r] || 0) <= stock[r]) n++; else break; }
    reach[r] = n;
  }

  // ── node-aware production simulation (§2.4), eff + theo ──
  const levelEta = (s, xpPerDay) => {
    const need = (s.levelXpNeeded || 0) - experienceEff; // banked food already counted
    if (need <= 0) return 0;
    if (!(xpPerDay > 0)) return null; // fallback: show remaining XP (§2.3)
    return need / xpPerDay;
  };
  for (const mode of ["eff", "theo"]) {
    const counts = { ...nodeCounts };
    const yields = {};
    for (const r of RES3) yields[r] = counts[r] > 0 ? (rates[r][mode] || 0) / counts[r] : 0;
    const prod = { ...stock };
    const cumc = { Crimstone: 0, Oil: 0, Obsidian: 0 };
    let t = 0, blocked = false;
    for (const s of pending) {
      if (!s.sim) s.sim = {};
      if (blocked) { s.sim[mode] = { all: null, blocked: true }; continue; }
      const rate = {};
      for (const r of RES3) rate[r] = counts[r] * yields[r];
      let dt = 0, bad = false;
      const resEta = {};
      for (const r of RES3) {
        const need = (cumc[r] + (s.cost[r] || 0)) - prod[r];
        if (need > 0) {
          if (!(rate[r] > 0)) { bad = true; break; }
          const d = need / rate[r];
          resEta[r] = t + d;
          if (d > dt) dt = d;
        } else resEta[r] = t;
      }
      if (bad) { blocked = true; s.sim[mode] = { all: null, blocked: true }; continue; }
      // rates are units/DAY, so dt/t/resEta are already DAYS — no seconds conversion.
      t += dt;
      for (const r of RES3) { prod[r] += rate[r] * dt; cumc[r] += s.cost[r] || 0; }
      const lEta = levelEta(s, rates.xpPerDay);
      s.sim[mode] = {
        res: { Crimstone: resEta.Crimstone, Oil: resEta.Oil, Obsidian: resEta.Obsidian },
        all: t,
        levelEtaDays: lEta == null ? null : lEta,
        farmEtaDays: Math.max(t, lEta == null ? 0 : lEta),
      };
      for (const [node, n] of Object.entries(s.nodesAdded || {})) {
        const r = NODE_TO_RES[node];
        if (r) counts[r] += n;
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
    if (s.stuck && !stuck) stuck = { asc: s.asc, expansion: s.expansion, kind: s.kind, buildSlotDays: s.buildSlotDays, farmEtaDays: farmEta };
    slotMs += (s.time || 0) * 1000;
  }

  return { current, rates, steps: pending, frontier, bottleneck, reach, nodeCounts, grinx, maxAsc };
}
