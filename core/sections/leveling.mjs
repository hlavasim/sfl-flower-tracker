/*
 * LEVELING — what it takes to reach a target ascension level (default the end of A5) from the
 * kitchens and the fish route, for any configuration and any set of "what if I had it" items.
 * Spec: docs/superpowers/specs/2026-11-24-leveling-page-design.md.
 *
 * Everything is the engine's own answer for a what-if copy of the farm (applyWhatIf): recipe XP,
 * cook time and cost from buildCookingSection, aged-fish XP from its Aging Shed rows, fish per cast
 * from computeFishYieldPerCast, salt from side-values' salt model. What this module adds is the
 * day: how many cooks fit the restarts, how many fish the salt and the slots can age, and what a
 * caught fish costs when everything caught is eaten or aged — a share of the CAST (rod + worm),
 * not the targeted-catch price the Bumpkin page uses for picking one species.
 *
 * Aging is bound by salt: a fish's aged XP and its salt are both its max aging XP scaled, so every
 * fish gives about the same XP per salt. Big fish (and the baits that force them) save slot time.
 */
import { buildCookingSection } from "./cooking.mjs";
import { applyWhatIf, ownedLevelingItems } from "../engine/leveling-whatif.mjs";
import { LEVELING_ITEMS, LEVELING_ITEM_BY_NAME } from "../data/leveling-items.mjs";
import { computeFishYieldPerCast } from "../engine/cooking-cost.mjs";
import { computeRodCostSFL, computeBaitCostSFL } from "../engine/item-value.mjs";
import { sideSaltNow } from "../engine/side-values.mjs";
import { ascensionXpFor, ascensionStanding } from "../engine/ascension.mjs";
import { computeFoodXP, detectCookingBoosts } from "../engine/cooking.mjs";
import { FISH_BASE_XP, getAgingSaltCost } from "../data/cooking.mjs";
import { FISH_TIER_MAP, FISH_BAIT_CATCH, FISH_MARKET_RECIPES, FISH_COMMUNITY_CATCH } from "../data/fishing.mjs";
import { dashHasVipAccess } from "../engine/gifts-deliveries.mjs";
import { hasItem, findCollectible } from "../derive/items.mjs";
import { BUD_AURA_MULTIPLIERS, decodeBud } from "../engine/buds.mjs";
import { SKILL_UPGRADES, skillUpgradeCost } from "../engine/skill-ranks.mjs";
import { SKILL_TREE_DATA } from "../engine/power-helpers.mjs";

export const LEVELING_KITCHENS = ["Fire Pit", "Kitchen", "Bakery", "Deli", "Smoothie Shack"];
const SEASONS = ["spring", "summer", "autumn", "winter"];
const NO_BID_LOSS = 0.15;          // resale loss when nobody bids: 15 % of the floor
const BUBBLE_AURA_BAIT = 1.2;      // Bubble Aura: 20 % chance of +1 bait per Fish Market job
// Crab Stick needs crustaceans from water traps, which this plan does not model: fish baits only.
const FISH_BAITS = ["Fish Flake", "Fish Stick", "Fish Oil"];
// Fish Market job length (fishProcessing.ts FISH_PROCESSING_TIME_SECONDS); one job at a time, the
// queue is 1 without VIP and 4 with it (processResource.ts MAX_FISH_PROCESSING_SLOTS).
const FISH_MARKET_HOURS = { "Fish Flake": 1, "Fish Stick": 2, "Crab Stick": 4, "Fish Oil": 16 };
const FISH_MARKET_VIP_QUEUE = 4;
export const LEVELING_WORMS = ["Earthworm", "Grub", "Red Wiggler"];
const SEASON_LETTER = { winter: "w", spring: "p", summer: "s", autumn: "a" };
/**
 * What one worm catches: the community counts undiluted per season (a fish in k seasons is 1/k of
 * its pooled count in each), normalised per season, each season a 1/n share of the year.
 */
export function wormCatchShare(worm, seasons = SEASONS) {
  const share = {};
  for (const sn of seasons) {
    const l = SEASON_LETTER[sn], m = {};
    let tot = 0;
    for (const [f, rec] of Object.entries(FISH_COMMUNITY_CATCH)) {
      const n = rec.s.includes(l) ? (rec.b[worm] || 0) / rec.s.length : 0;
      if (n > 0) { m[f] = n; tot += n; }
    }
    for (const [f, n] of Object.entries(m)) share[f] = (share[f] || 0) + n / tot / seasons.length;
  }
  return share;
}
/**
 * The worms behind a catch history, from the fish only one worm catches (Anchovy is Earthworm's,
 * Walleye Grub's, Trout Red Wiggler's): each worm's weight is its exclusive fish's observed share
 * over the share that worm alone would give them. Normalised; null when nothing exclusive was caught.
 */
export function wormMixOf(share) {
  const w = {};
  for (const worm of LEVELING_WORMS) {
    const model = wormCatchShare(worm);
    let obs = 0, exp = 0;
    for (const [f, rec] of Object.entries(FISH_COMMUNITY_CATCH)) {
      const worms = Object.keys(rec.b).filter((b) => LEVELING_WORMS.includes(b));
      if (worms.length !== 1 || worms[0] !== worm) continue;
      obs += Object.entries(share).filter(([k]) => lc(k) === lc(f)).reduce((a, [, v]) => a + v, 0);
      exp += model[f] || 0;
    }
    w[worm] = exp > 0 ? obs / exp : 0;
  }
  const tot = Object.values(w).reduce((a, b) => a + b, 0);
  return tot > 0 ? Object.fromEntries(Object.entries(w).map(([k, v]) => [k, v / tot])) : null;
}

const lc = (s) => String(s).toLowerCase();
const BASE = Object.fromEntries(Object.entries(FISH_BASE_XP).map(([k, v]) => [lc(k), v]));
const TIER = Object.fromEntries(Object.entries(FISH_TIER_MAP).map(([k, v]) => [lc(k), v]));
const rankOf = (v) => { const n = Number(v); return n > 0 ? n : (v ? 1 : 0); };
const skillRank = (farm, s) => rankOf((((farm || {}).bumpkin || {}).skills || {})[s]);
const upRank = (farm, s, i) => { const r = skillRank(farm, s); const up = SKILL_UPGRADES[s]; return r ? (up ? up.ranks[Math.min(r, up.ranks.length) - 1] : 0) : 0; };

/** getDailyFishingLimit (types/fishing.ts:821-905), without the chapter-only VIP +5. */
export function dailyFishingLimit(farm) {
  let n = 20;
  if (hasItem(farm, "Angler Waders")) n += 10;
  for (const c of ["Reelmaster's Chair", "Nautilus", "Deep Sea Slug", "Otty the Otter"]) if (findCollectible(farm, c).length) n += 5;
  if (hasItem(farm, "Saw Fish")) n += 5;
  for (const s of ["Fisherman's 5 Fold", "Fisherman's 10 Fold", "More With Less"]) n += upRank(farm, s);
  return n;
}

/** Sea bud's +fish per cast: aura × (type 0.1 + Fish Hat stem 0.1), best placed bud only. */
function budFishPerCast(farm) {
  let best = 0;
  for (const b of Object.values((farm && farm.buds) || {})) {
    if (!b || !b.coordinates) continue;
    const v = (BUD_AURA_MULTIPLIERS[b.aura] || 1) * ((b.type === "Sea" ? 0.1 : 0) + (b.stem === "Fish Hat" ? 0.1 : 0));
    best = Math.max(best, v);
  }
  return best;
}

/** Expected fish per cast for a tier, averaged over the four seasons (seasonal +1 collectibles). */
function tierYield(farm, tier) {
  let s = 0;
  for (const season of SEASONS) s += computeFishYieldPerCast({ ...farm, season: { ...(farm.season || {}), season } }, tier);
  return s / SEASONS.length;
}

/** The farm's catch: species shares and fish per cast, from its lifetime farmActivity counters. */
function catchMix(farm) {
  const fa = farm.farmActivity || {};
  const counts = {};
  for (const [k, v] of Object.entries(fa)) {
    if (!k.endsWith(" Caught")) continue;
    const name = k.slice(0, -" Caught".length);
    if (BASE[lc(name)] && v > 0) counts[name] = (counts[name] || 0) + v;
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const casts = fa["Rod Casted"] || 0;
  const share = {};
  for (const [k, v] of Object.entries(counts)) share[k] = total ? v / total : 0;
  return { share, fishPerCast: casts > 0 && total > 0 ? total / casts : 1 };
}

const isFishItem = (n) => !!BASE[lc(n)];
/** Recipes a building could cook in the plan: timed, priced, no fish in them (fish have their own route). */
function plannable(r) {
  return r && r.time > 0 && !r.isInstant && r.cost > 0 && !r.hasUnpriced && !(r.items || []).some((i) => isFishItem(i.name));
}
// Visits are evenly spaced (24 h / restarts): a cook or an aging job waits for the visit after it
// finishes, so it takes a whole number of gaps — a 6.2 h Pizza at 6 restarts is an 8 h cycle.
const cycleHours = (hours, restarts) => { const gap = 24 / restarts; return Math.max(1, Math.ceil(hours / gap - 1e-9)) * gap; };
function cooksPerDay(r, restarts, count) { return (24 / cycleHours(r.time / 3600, restarts)) * count; }
function bestRecipe(b, restarts) {
  let best = null, bx = -1;
  for (const r of b.recipes || []) {
    if (!plannable(r)) continue;
    const x = r.xp * r.amount * cooksPerDay(r, restarts, b.buildingCount || 1);
    if (x > bx) { bx = x; best = r; }
  }
  return best;
}

function cookingFor(farm, inputs) {
  return buildCookingSection(farm, inputs.prices || {}, { coinsPerSFL: inputs.coinsPerSFL || 0, now: inputs.now });
}
/*
 * The cooking section for a what-if farm, remembered per (farm, inputs, ticked set). Salt items and
 * reel items change nothing it computes (no kitchen recipe uses Salt; reels are not in it), so they
 * are left out of the key — the impacts table re-plans once per catalogue row, and this halves it.
 * Fish-per-cast items stay in: they price the Fish Market baits some kitchen recipes use.
 */
const COOKING_NEUTRAL = new Set(LEVELING_ITEMS.filter((it) => it.group === "salt"
  || /daily reels/.test(it.boost)).map((it) => it.name));
const _ckCache = new WeakMap();
function cookingForWhatIf(farm, inputs, ticked, w) {
  let byInputs = _ckCache.get(farm);
  if (!byInputs) _ckCache.set(farm, (byInputs = new WeakMap()));
  let m = byInputs.get(inputs);
  if (!m) byInputs.set(inputs, (m = new Map()));
  const key = ticked.filter((n) => !COOKING_NEUTRAL.has(n)).sort().join("|");
  if (!m.has(key)) {
    if (m.size >= 300) m.clear();   // the frontier search tries many sets; keep memory bounded
    m.set(key, cookingFor(w, inputs));
  }
  return m.get(key);
}

/** Starting point: end of A5, 6 restarts, every placed kitchen but the Smoothie Shack on its best recipe. */
export function defaultLevelingConfig(farm, inputs = {}) {
  const ck = cookingFor(farm, inputs);
  const buildings = {};
  for (const name of LEVELING_KITCHENS) {
    const b = ck.buildings[name];
    if (!b) continue;
    const r = bestRecipe(b, 6);
    buildings[name] = { on: name !== "Smoothie Shack" && !!r, recipe: r ? r.name : null };
  }
  return {
    target: { ascension: 5, level: 50 }, restarts: 6, buildings,
    fish: { age: !!ck.buildings["Aging Shed"], eatRaw: true, reels: dailyFishingLimit(farm), baits: true, buySalt: false },
    ticked: [], resell: false,
  };
}

/** Floor and resale loss; `known` false when it cannot be bought or has no floor (the plan counts 0 for it). */
function itemPrice(it, inputs) {
  if (!it.tradeable) return { price: null, loss: 0, known: false };
  const floor = it.kind === "bud" ? (inputs.budFloors || {})[it.budType] : (inputs.floors || {})[it.name];
  if (!(floor > 0)) return { price: null, loss: 0, known: false };
  const bid = it.kind === "bud" ? (inputs.budBids || {})[it.budType] : (inputs.bids || {})[it.name];
  return { price: floor, loss: bid > 0 ? Math.max(0, floor - bid) : floor * NO_BID_LOSS, known: true };
}

/** Greedy aging: fill salt and slot-hours with the best fish; tried in two orders, the better kept. */
function ageGreedy(rows, salt, slotHours, gap) {
  const run = (key) => {
    let sl = salt, sh = slotHours, gain = 0, used = 0;
    const taken = new Map();
    for (const r of [...rows].sort((a, b) => key(b) - key(a))) {
      if (!(r.gain > 0)) continue;
      const occ = cycleHours(r.hours, 24 / gap);
      const n = Math.max(0, Math.min(r.n, occ > 0 ? sh / occ : Infinity, r.salt > 0 ? sl / r.salt : Infinity));
      if (!(n > 0)) continue;
      taken.set(r, n); gain += n * r.gain; used += n * r.salt;
      sl -= n * r.salt; sh -= n * occ;
    }
    return { gain, used, saltLeft: sl, slotLeft: sh, taken };
  };
  const bySalt = run((r) => r.gain / Math.max(r.salt, 1e-9));
  const bySlot = run((r) => r.gain / cycleHours(r.hours, 24 / gap));
  return bySlot.gain > bySalt.gain ? bySlot : bySalt;
}

/** The plan for one configuration. See the module comment for what each number means. */
export function levelingPlan(farm, inputs, config) {
  const owned = ownedLevelingItems(farm);
  const ticked = (config.ticked || []).filter((n) => LEVELING_ITEM_BY_NAME[n] && !owned.has(n));
  const w = applyWhatIf(farm, ticked);
  const ck = cookingForWhatIf(farm, inputs, ticked, w);
  const restarts = Math.max(1, config.restarts || 1);
  const skills = (w.bumpkin && w.bumpkin.skills) || {};

  // ── need ──
  const t = config.target || { ascension: 5, level: 50 };
  const bankedXp = (ck.bankedFood && ck.bankedFood.totalXp) || 0;
  const needXp = ascensionXpFor(t.ascension, t.level) - ((farm.bumpkin && farm.bumpkin.experience) || 0) - bankedXp;

  // ── kitchens ──
  const buildings = [];
  let kXp = 0, kCost = 0;
  for (const name of LEVELING_KITCHENS) {
    const b = ck.buildings[name], bc = (config.buildings || {})[name];
    if (!b || !bc || !bc.on) continue;
    const r = (b.recipes || []).find((x) => x.name === bc.recipe && x.time > 0) || bestRecipe(b, restarts);
    if (!r) continue;
    const cooks = cooksPerDay(r, restarts, b.buildingCount || 1);
    const xp = r.xp * r.amount * cooks;
    const cost = (r.cost || 0) * (skills["Double Nom"] ? 2 : 1) * cooks;
    buildings.push({ name, recipe: r.name, cooksPerDay: cooks, xpPerDay: xp, costPerDay: cost });
    kXp += xp; kCost += cost;
  }

  // ── fish ──
  const fishCfg = config.fish || {};
  // A chosen worm: its community catch and its price. None: the farm's own catch history.
  const worm = LEVELING_WORMS.includes(fishCfg.worm) ? fishCfg.worm : null;
  const own = catchMix(farm);
  const mix = worm ? { share: wormCatchShare(worm), fishPerCast: own.fishPerCast } : own;
  const shedPlaced = !!ck.buildings["Aging Shed"];
  // Cast only when a fish can give XP: a catch history to go by, and eating raw or a shed to age in.
  const fishing = Object.keys(mix.share).length > 0 && (fishCfg.eatRaw || (fishCfg.age && shedPlaced)) && (fishCfg.reels || 0) > 0;
  const boosts = detectCookingBoosts(w, { now: inputs.now });
  const rawXp = (name) => computeFoodXP(name, { xp: BASE[lc(name)] || 0 }, null, boosts);
  const aged = Object.fromEntries(((ck.buildings["Aging Shed"] || {}).recipes || [])
    .map((r) => [lc(r.name.replace(/^Aged /, "")), r]));
  // Yield delta of the what-if items, tier-weighted over the farm's catch, plus the Sea bud.
  let dYield = budFishPerCast(w) - budFishPerCast(farm);
  for (const [name, sh] of Object.entries(mix.share)) {
    const tier = TIER[lc(name)];
    if (tier) dYield += sh * (tierYield(w, tier) - tierYield(farm, tier));
  }
  const fishPerCast = mix.fishPerCast + dYield;
  // The configured reels are today's; a ticked reel item (Nautilus, a Fold rank…) adds its own.
  const reels = fishing ? Math.max(0, fishCfg.reels + dailyFishingLimit(w) - dailyFishingLimit(farm)) : 0;
  const fishPerDay = reels * fishPerCast;
  const surfer = hasItem(w, "Surfer Hair") ? 0.5 : 1;
  const agerRank = skillRank(w, "Ager");
  const ager = agerRank ? SKILL_UPGRADES.Ager.ranks[Math.min(agerRank, 3) - 1] : 1;
  const shed = ck.buildings["Aging Shed"];
  const slots = shed ? shed.buildingCount || 0 : 0;

  const rows = Object.entries(mix.share).map(([name, sh]) => {
    const r = aged[lc(name)], raw = fishCfg.eatRaw ? rawXp(name) : 0;
    const n = fishPerDay * sh;
    return { name, n, raw, agedXp: r ? r.xp : 0, hours: r ? r.time / 3600 : 0,
      salt: getAgingSaltCost(BASE[lc(name)]) * surfer, gain: r ? r.xp - raw : 0 };
  });
  const avgRaw = rows.reduce((a, r) => a + (fishPerDay > 0 ? r.raw * r.n / fishPerDay : 0), 0);

  const saltPrice = (inputs.prices || {}).Salt || 0;
  const bubble = hasItem(w, "Bubble Aura") ? BUBBLE_AURA_BAIT : 1;
  const vip = dashHasVipAccess(w, inputs.now || Date.now());
  const jobMult = (hasItem(w, "Bubble Aura") ? 0.8 : 1) * (hasItem(w, "Cyclops Bloom") ? 0.8 : 1);
  // Fish Market hours a day the taken baits fill. Without VIP a finished job waits for the next visit.
  const marketUse = (taken) => {
    let hours = 0, jobs = 0;
    for (const [r, n] of taken) {
      if (!r.bait) continue;
      const j = n / bubble, h = FISH_MARKET_HOURS[r.bait] * jobMult;
      jobs += j; hours += j * (vip ? h : cycleHours(h, restarts));
    }
    return { hours, jobs, fit: Math.min(1, hours > 24 ? 24 / hours : 1, vip && jobs > FISH_MARKET_VIP_QUEUE * restarts ? FISH_MARKET_VIP_QUEUE * restarts / jobs : 1) };
  };
  const buySalt = !!fishCfg.buySalt && saltPrice > 0;
  const fishRoute = (useBaits) => {
  let saltPerDay = 0, rakeCost = 0, ag = { gain: 0, used: 0, saltLeft: 0, slotLeft: 0, taken: new Map() }, baitsPerDay = 0;
  if (fishing && fishCfg.age && slots > 0) {
    const s = sideSaltNow({ farm: w, prices: inputs.prices || {}, coinsPerSFL: inputs.coinsPerSFL || 0, isActive: (n) => hasItem(w, n), activity: inputs.activity || null,
      current: { farm, isActive: (n) => hasItem(farm, n) } });
    saltPerDay = (s.harvests || 0) * ((s.p && s.p.yieldPerRake) || 0);
    rakeCost = s.cost || 0;
    const cand = rows.filter((r) => r.agedXp > 0);
    if (useBaits) {
      // A bait forces its best fish; it costs its recipe's fish (their raw XP) and one cast's catch.
      // The Fish Market recipe changes with the season: each season's recipe gets a quarter of the year.
      for (const season of SEASONS) for (const bait of FISH_BAITS) {
        const best = (FISH_BAIT_CATCH[bait] || []).map((n) => ({ n, r: aged[lc(n)] })).filter((x) => x.r)
          .sort((a, b) => b.r.xp - a.r.xp)[0];
        const recipe = (FISH_MARKET_RECIPES[bait] || {})[season];
        if (!best || !recipe) continue;
        let loss = fishPerCast * avgRaw, cap = Infinity;
        for (const [inp, q] of Object.entries(recipe)) {
          const src = rows.find((r) => lc(r.name) === lc(inp));
          loss += (q / bubble) * (fishCfg.eatRaw ? rawXp(inp) : 0);
          cap = Math.min(cap, src ? src.n * bubble / q : 0);
        }
        cap /= SEASONS.length;
        if (cap > 0) cand.push({ name: best.n, bait, season, n: cap, agedXp: best.r.xp, hours: best.r.time / 3600,
          salt: getAgingSaltCost(BASE[lc(best.n)]) * surfer, gain: best.r.xp - loss, raw: 0,
          inputs: Object.entries(recipe).map(([inp, q]) => ({ row: rows.find((r) => lc(r.name) === lc(inp)), q: q / bubble })) });
      }
    }
    // Bought salt (fish.buySalt): aging is then bound by the slots and the fish, not the nodes.
    ag = ageGreedy(cand, buySalt ? Infinity : saltPerDay, slots * 24 * ager, 24 / restarts);
    // One Fish Market: more baits than its queue makes are capped, and the freed salt and slots re-planned.
    const mu = useBaits ? marketUse(ag.taken) : null;
    if (mu && mu.fit < 1 - 1e-9) {
      const capped = cand.filter((r) => !r.bait || ag.taken.has(r)).map((r) => (r.bait ? { ...r, n: ag.taken.get(r) * mu.fit } : r));
      ag = ageGreedy(capped, buySalt ? Infinity : saltPerDay, slots * 24 * ager, 24 / restarts);
    }
    for (const [r, n] of ag.taken) if (r.bait) baitsPerDay += n;
  }
  // Every fish is counted once: aged, spent on a bait, or eaten raw. A bait's cast catches no random
  // fish, and a bait cannot take input fish that aging already took — the greedy above saw neither,
  // so shrink to fit (a few passes settle it: fewer baits free casts, which frees inputs).
  const taken = new Map(ag.taken);
  let scale = 1, spent = new Map();
  for (let pass = 0; pass < 6; pass++) {
    const baits = [...taken].filter(([r]) => r.bait).reduce((a, [, n]) => a + n, 0);
    scale = reels > 0 ? Math.max(0, (reels - baits) / reels) : 0;
    for (const [r, n] of taken) if (!r.bait) taken.set(r, Math.min(n, r.n * scale));
    spent = new Map();
    for (const [r, n] of taken) for (const { row, q } of r.inputs || []) if (row) spent.set(row, (spent.get(row) || 0) + n * q);
    // A bait outranked aging its own inputs in the greedy (higher gain), so those go to the bait.
    for (const [row, need] of spent) {
      const own = taken.get(row) || 0, excess = need - Math.max(0, row.n * scale - own);
      if (excess > 0 && own > 0) taken.set(row, Math.max(0, own - excess));
    }
    for (const [r, n] of taken) {
      if (!r.bait) continue;
      let f = 1;
      for (const { row } of r.inputs) {
        const avail = row ? Math.max(0, row.n * scale - (taken.get(row) || 0)) : 0, need = spent.get(row) || 0;
        if (need > avail) f = Math.min(f, need > 0 ? avail / need : 0);
      }
      taken.set(r, n * f);
    }
  }
  let agedN = 0, agingXp = 0, baitInputN = 0, saltUsed = 0, slotUsed = 0;
  baitsPerDay = 0;
  const baitUse = [];
  for (const [r, n] of taken) {
    agedN += n; agingXp += n * r.agedXp; saltUsed += n * r.salt; slotUsed += n * cycleHours(r.hours, restarts);
    if (r.bait && n > 1e-9) { baitsPerDay += n; baitUse.push({ bait: r.bait, fish: r.name, season: r.season, perDay: n, gainEach: r.gain }); }
  }
  const marketHours = marketUse(taken).hours;
  for (const n of spent.values()) baitInputN += n;
  let rawEaten = 0, eatenN = 0;
  for (const r of rows) {
    const left = Math.max(0, r.n * scale - (taken.get(r) || 0) - (spent.get(r) || 0));
    eatenN += left; rawEaten += left * r.raw;
  }
  return { saltPerDay, rakeCost, agedN, agingXp, baitInputN, saltUsed, slotUsed, baitsPerDay, rawEaten, eatenN, baitUse, marketHours };
  };
  // Baits are a choice the plan makes itself: used only when they make the day better.
  const plain = fishRoute(false), baited = fishCfg.baits === false ? null : fishRoute(true);
  const fr = baited && baited.agingXp + baited.rawEaten > plain.agingXp + plain.rawEaten ? baited : plain;
  const { saltPerDay, rakeCost, agedN, agingXp, baitInputN, saltUsed, slotUsed, baitsPerDay, rawEaten, eatenN, baitUse, marketHours } = fr;
  const xpPerDay = { kitchens: kXp, aging: agingXp, raw: rawEaten };
  xpPerDay.total = kXp + agingXp + rawEaten;

  // The cast's worm: the chosen one, or the mix the catch history points to (Earthworm if none).
  const wormMix = worm ? { [worm]: 1 } : (wormMixOf(own.share) || { Earthworm: 1 });
  const wormCost = Object.entries(wormMix).reduce((a, [k, v]) => a + v * computeBaitCostSFL(k, inputs.prices || {}), 0);
  const castCost = computeRodCostSFL(inputs.prices || {}, inputs.coinsPerSFL || 0, skills) + wormCost;
  // Rakes only for the salt the shed uses: salt the nodes could give beyond that is not raked.
  const raked = saltPerDay > 0 ? Math.min(1, saltUsed / saltPerDay) : 0;
  const saltBought = buySalt ? Math.max(0, saltUsed - saltPerDay) : 0;
  // costScale: the page's "what if ingredient prices move ±20 %" switch (running costs only).
  const scale = config.costScale > 0 ? config.costScale : 1;
  const fishCost = (reels * castCost + (fishing && fishCfg.age && slots > 0 ? rakeCost * raked : 0) + saltBought * saltPrice) * scale;
  const costPerDay = kCost * scale + fishCost;

  // ── items bought ──
  let nftCost = 0, resaleLoss = 0;
  for (const n of ticked) { const p = itemPrice(LEVELING_ITEM_BY_NAME[n], inputs); nftCost += p.price || 0; resaleLoss += p.loss; }

  const days = needXp <= 0 ? 0 : xpPerDay.total > 0 ? needXp / xpPerDay.total : Infinity;
  // Running cost to the target, plus the NFTs: their full price, or only the resale loss when the
  // owner sells them once the target is reached (config.resell).
  const runningFlower = days === 0 ? 0 : days === Infinity ? Infinity : costPerDay * days;
  const totalFlower = days === 0 ? 0 : runningFlower + (config.resell ? resaleLoss : nftCost);
  const slotCap = slots * 24 * ager;
  const bottleneck = !(fishing && fishCfg.age && slots > 0) ? null
    : !buySalt && saltUsed >= saltPerDay * 0.99 ? "salt" : slotUsed >= slotCap * 0.99 ? "slots" : "fish";

  return {
    needXp, bankedXp, xpPerDay, costPerDay, costSplit: { kitchens: kCost * scale, fish: fishCost },
    days, runningFlower, totalFlower, nftCost, resaleLoss, oneOff: config.resell ? resaleLoss : nftCost, bottleneck, buildings,
    fish: { saltBought, saltPrice, perDay: fishPerDay * (reels > 0 ? Math.max(0, (reels - baitsPerDay) / reels) : 0), fishPerCast, aged: agedN, agedCaughtN: agedN - baitsPerDay, eatenN, baitInputN,
      saltUsed, saltPerDay, baitsPerDay, slots, worm, wormMix, castCost, baitUse, marketHours, vip,
      baitsHelp: !!baited && fr === baited && baitsPerDay > 1e-9 },
  };
}

/** Skill points a catalogue skill row costs from the farm's current rank (SKILL_TREE_DATA + rank-ups). */
function pointCost(farm, it) {
  const cur = skillRank(farm, it.skill);
  let pts = 0;
  for (let r = cur + 1; r <= it.rank; r++) {
    if (r === 1) pts += (SKILL_TREE_DATA[it.skill] || {}).points || 0;
    else { const up = SKILL_UPGRADES[it.skill]; pts += up ? skillUpgradeCost(up.tier).points : 0; }
  }
  return pts;
}

// Never NaN: never → never is no change; never → a number is −Infinity (the page says "z nikdy").
const diff = (a, b) => (a === b ? 0 : a - b);
/** Every catalogue row the farm does not have: what toggling it (alone) does to the plan. */
export function itemImpacts(farm, inputs, config) {
  const owned = ownedLevelingItems(farm);
  const base = levelingPlan(farm, inputs, config);
  const ticked = new Set(config.ticked || []);
  return LEVELING_ITEMS.filter((it) => !owned.has(it.name)).map((it) => {
    const on = ticked.has(it.name);
    const other = levelingPlan(farm, inputs, { ...config, ticked: on ? [...ticked].filter((n) => n !== it.name) : [...ticked, it.name] });
    const [without, withIt] = on ? [other, base] : [base, other];
    const p = itemPrice(it, inputs);
    return {
      name: it.name, group: it.group, kind: it.kind, boost: it.boost, tradeable: it.tradeable,
      price: p.price, loss: p.loss, priceKnown: p.known, ticked: on,
      withP: planPoint(withIt), withoutP: planPoint(without),
      dXpPerDay: withIt.xpPerDay.total - without.xpPerDay.total,
      days: withIt.days, baseDays: without.days,
      dDays: diff(withIt.days, without.days),
      dRunning: diff(withIt.runningFlower, without.runningFlower),
      dFlower: diff(withIt.totalFlower, without.totalFlower),
      ...(it.kind === "skill" ? { pointCost: pointCost(farm, it) } : {}),
    };
  });
}

/** Cheapest listing per bud type from the marketplace book (`items["Bud #N"].f`), for the bud rows. */
export function budTypeFloors(bookItems) {
  const out = {};
  for (const [k, v] of Object.entries(bookItems || {})) {
    const m = /^Bud #(\d+)$/.exec(k);
    if (!m || !(v && v.f > 0)) continue;
    const b = decodeBud(Number(m[1]));
    if (b && b.type && !(out[b.type] <= v.f)) out[b.type] = v.f;
  }
  return out;
}

/** Best bid per bud type from the marketplace book, for the bud rows' resale loss. */
export function budTypeBids(bookItems) {
  const out = {};
  for (const [k, v] of Object.entries(bookItems || {})) {
    const m = /^Bud #(\d+)$/.exec(k);
    if (!m || !(v && v.b > 0)) continue;
    const b = decodeBud(Number(m[1]));
    if (b && b.type && !(out[b.type] >= v.b)) out[b.type] = v.b;
  }
  return out;
}

/**
 * Each placed kitchen's plannable recipes with XP and FLOWER a day at `restarts`, best first — for
 * the what-if farm of `ticked` (so they agree with the plan), with FLOWER per 1 M XP (`perM`).
 */
export function levelingRecipeOptions(farm, inputs, restarts, ticked = []) {
  const owned = ownedLevelingItems(farm);
  const tk = (ticked || []).filter((n) => LEVELING_ITEM_BY_NAME[n] && !owned.has(n));
  const w = tk.length ? applyWhatIf(farm, tk) : farm;
  const ck = tk.length ? cookingForWhatIf(farm, inputs, tk, w) : cookingFor(farm, inputs);
  const nom = ((w.bumpkin && w.bumpkin.skills) || {})["Double Nom"] ? 2 : 1;
  const out = {};
  for (const name of LEVELING_KITCHENS) {
    const b = ck.buildings[name];
    if (!b) continue;
    out[name] = (b.recipes || []).filter(plannable).map((r) => {
      const cooks = cooksPerDay(r, Math.max(1, restarts || 1), b.buildingCount || 1);
      const xpPerDay = r.xp * r.amount * cooks, costPerDay = r.cost * nom * cooks;
      return { name: r.name, xpPerDay, costPerDay, perM: xpPerDay > 0 ? costPerDay / (xpPerDay / 1e6) : Infinity, hours: r.time / 3600 };
    }).sort((a, b) => b.xpPerDay - a.xpPerDay);
  }
  return out;
}

const clamp = (v, lo, hi, d) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
/** A stored config made safe against `defaults`: unknown buildings, recipes and items dropped, numbers clamped. */
export function sanitizeLevelingConfig(raw, defaults, recipeOptions) {
  const d = JSON.parse(JSON.stringify(defaults));
  if (!raw || typeof raw !== "object") return d;
  const t = raw.target || {};
  const out = {
    target: { ascension: clamp(t.ascension, 1, 10, d.target.ascension), level: clamp(t.level, 1, 50, d.target.level) },
    restarts: clamp(raw.restarts, 1, 48, d.restarts),
    buildings: {},
    fish: { ...d.fish },
    ticked: Array.isArray(raw.ticked) ? [...new Set(raw.ticked.filter((n) => LEVELING_ITEM_BY_NAME[n]))] : [],
  };
  for (const [name, def] of Object.entries(d.buildings)) {
    const b = (raw.buildings || {})[name] || {};
    const ok = ((recipeOptions || {})[name] || []).some((r) => r.name === b.recipe);
    out.buildings[name] = { on: typeof b.on === "boolean" ? b.on : def.on, recipe: ok ? b.recipe : def.recipe };
  }
  const f = raw.fish || {};
  // Baits are no longer a switch on the page: the plan uses them whenever they pay.
  for (const k of ["age", "eatRaw", "buySalt"]) if (typeof f[k] === "boolean") out.fish[k] = f[k];
  if (LEVELING_WORMS.includes(f.worm)) out.fish.worm = f.worm; else delete out.fish.worm;
  out.fish.baits = true;
  if ([0.8, 1, 1.2].includes(raw.costScale)) out.costScale = raw.costScale;
  out.resell = typeof raw.resell === "boolean" ? raw.resell : !!d.resell;
  out.fish.reels = clamp(f.reels, 0, 500, d.fish.reels);
  return out;
}

/** Skill points the ticked skill rows cost together: each skill once, at its highest ticked rank. */
export function tickedSkillPoints(farm, ticked) {
  const top = {};
  for (const n of ticked || []) {
    const it = LEVELING_ITEM_BY_NAME[n];
    if (it && it.kind === "skill" && !(top[it.skill] && top[it.skill].rank >= it.rank)) top[it.skill] = it;
  }
  return Object.values(top).reduce((a, it) => a + pointCost(farm, it), 0);
}

/** The page's start: defaults, the stored config made safe, and recipe options at ITS restarts. */
export function levelingInit(farm, inputs, saved) {
  const def = defaultLevelingConfig(farm, inputs);
  const first = sanitizeLevelingConfig(saved, def, null);
  const options = levelingRecipeOptions(farm, inputs, first.restarts, first.ticked);
  return { def, options, cfg: sanitizeLevelingConfig(saved, def, options) };
}

/* ── v2: the ascension ladder, the item × ascension matrix, steps and the days × FLOWER frontier ── */

/**
 * A plan reduced to what the target changes: the day's rates are fixed (levelingPlan never looks at
 * the target except for needXp), so FLOWER to ANY total-XP point is need / x × c + the one-off.
 */
function planPoint(p) {
  return { x: p.xpPerDay.total, c: p.costPerDay, banked: p.bankedXp || 0, one: p.oneOff || 0 };
}
const expOf = (farm) => (farm && farm.bumpkin && farm.bumpkin.experience) || 0;
/** Days and FLOWER of a plan point to the total-XP threshold `xpAt`. */
function pointAt(farm, P, xpAt) {
  const need = xpAt - expOf(farm) - P.banked;
  if (need <= 0) return { days: 0, flower: 0 };
  if (!(P.x > 0)) return { days: Infinity, flower: Infinity };
  const days = need / P.x;
  return { days, flower: days * P.c + P.one };
}
const asc0 = (farm) => Number((farm && farm.island && farm.island.ascensionLevel) || 0);
/** The farm's absolute level (getTotalBumpkinLevel): 150 + 50 per finished band + the band level. */
function totalLevel(farm) {
  const a = asc0(farm);
  return a >= 1 ? 150 + (a - 1) * 50 + ascensionStanding(expOf(farm), a) : null;
}

/**
 * The ladder: every ascension band not finished yet, up to `maxAsc` — this band's XP, days and
 * FLOWER (running cost only), and from today: days and FLOWER (one-off NFTs counted once), and the
 * skill points free by then (1 a level, choseSkill.ts; levels count once the island has ascended).
 */
export function levelingLadder(farm, plan, maxAsc = 10, freePoints = 0) {
  const P = planPoint(plan), xpNow = expOf(farm) + P.banked;
  const lvlNow = totalLevel(farm);
  const rows = [];
  for (let a = 1; a <= maxAsc; a++) {
    const end = ascensionXpFor(a, 50);
    if (end <= xpNow) continue;
    const start = Math.max(xpNow, a > 1 ? ascensionXpFor(a - 1, 50) : 0);
    const xp = end - start;
    const days = P.x > 0 ? xp / P.x : Infinity;
    const cum = pointAt(farm, P, end);
    rows.push({
      ascension: a, fromLevel: start === xpNow ? ascensionStanding(xpNow, a) : 1, xp, xpEnd: end, days,
      flower: days === Infinity ? Infinity : days * P.c, cumDays: cum.days, cumFlower: cum.flower,
      points: lvlNow == null ? null : freePoints + Math.max(0, 150 + 50 * a - lvlNow),
    });
  }
  return rows;
}

/** One catalogue row's net FLOWER if the owner stops at total XP `xpAt` (negative = it saves). */
export function impactAt(farm, row, xpAt) {
  const a = pointAt(farm, row.withP, xpAt).flower, b = pointAt(farm, row.withoutP, xpAt).flower;
  return a === b ? 0 : a - b;
}
/** The Σ row: the ticked set against the same config with nothing ticked. */
export function tickedAt(farm, plan, bare, xpAt) {
  const a = pointAt(farm, planPoint(plan), xpAt).flower, b = pointAt(farm, planPoint(bare), xpAt).flower;
  return a === b ? 0 : a - b;
}

/**
 * Where a row starts to pay: the first (ascension, level) from today at which its net FLOWER turns
 * negative. "now" when it saves from the next level on, null when not by the end of `maxAsc`.
 */
export function breakEven(farm, row, maxAsc = 10) {
  const xpNow = expOf(farm) + row.withoutP.banked;
  let first = true;
  for (let a = 1; a <= maxAsc; a++) for (let l = 2; l <= 50; l++) {
    const xp = ascensionXpFor(a, l);
    if (xp <= xpNow) continue;
    if (impactAt(farm, row, xp) < 0) return first ? "now" : { ascension: a, level: l };
    first = false;
  }
  return null;
}

/** The first (ascension, level) by which `points` more skill points have been earned, or null. */
export function pointsReachedAt(farm, points, maxAsc = 10) {
  const now = totalLevel(farm);
  if (now == null) return null;
  const lvl = now + Math.max(0, points);
  const a = Math.max(asc0(farm), Math.ceil((lvl - 150) / 50));
  if (a > maxAsc) return null;
  return { ascension: a, level: lvl - 150 - (a - 1) * 50 };
}

/** May the search tick it: a skill, or an NFT with a real price (no "free" unknowns). */
const buyable = (r) => r.kind === "skill" || (r.tradeable && r.priceKnown);

/**
 * The best single changes from here, by FLOWER to the target: tick / untick an item, switch a
 * kitchen off or on, its recipe to the cheapest per XP, the fish switches. Each with the config
 * it leads to, so the page can apply it.
 */
export function levelingSteps(farm, inputs, config, impacts, n = 3) {
  const base = levelingPlan(farm, inputs, config);
  const out = [];
  const tryCfg = (label, kind, cfg) => {
    const p = levelingPlan(farm, inputs, cfg);
    const d = diff(p.totalFlower, base.totalFlower);
    if (d < -1) out.push({ label, kind, dFlower: d, dDays: diff(p.days, base.days), config: cfg });
  };
  const free = inputs.freePoints || 0;
  for (const r of impacts || []) {
    if (!r.ticked && !buyable(r)) continue;
    if (!r.ticked && r.kind === "skill" && tickedSkillPoints(farm, [...(config.ticked || []), r.name]) > free) continue;
    const d = r.ticked ? -r.dFlower : r.dFlower;
    if (!(d < -1)) continue;
    const ticked = r.ticked ? config.ticked.filter((x) => x !== r.name) : [...config.ticked, r.name];
    out.push({ label: `${r.ticked ? "Odeber" : r.kind === "skill" ? "Vezmi skill" : "Kup"} ${r.name}`, kind: "item", name: r.name,
      dFlower: d, dDays: r.ticked ? -r.dDays : r.dDays, price: r.ticked ? null : r.price, config: { ...config, ticked } });
  }
  const opts = levelingRecipeOptions(farm, inputs, config.restarts, config.ticked);
  for (const [name, b] of Object.entries(config.buildings || {})) {
    const set = (v) => ({ ...config, buildings: { ...config.buildings, [name]: { ...b, ...v } } });
    if (b.on) tryCfg(`Vypni ${name}`, "building", set({ on: false }));
    else if (b.recipe) tryCfg(`Zapni ${name}`, "building", set({ on: true }));
    const list = opts[name] || [], top = list[0];
    const cheap = list.filter((o) => top && o.xpPerDay >= 0.25 * top.xpPerDay).sort((x, y) => x.perM - y.perM)[0];
    if (b.on && cheap && cheap.name !== b.recipe) tryCfg(`${name}: vař ${cheap.name}`, "recipe", set({ recipe: cheap.name }));
  }
  const f = config.fish || {};
  const fishSet = (v) => ({ ...config, fish: { ...f, ...v } });
  tryCfg(f.age ? "Nestárni ryby" : "Stárni ryby", "fish", fishSet({ age: !f.age }));
  tryCfg(f.eatRaw ? "Nejez syrové ryby" : "Jez zbytek ryb syrový", "fish", fishSet({ eatRaw: !f.eatRaw }));
  for (const wm of LEVELING_WORMS) if (wm !== f.worm) tryCfg(`Nahazuj ${wm}`, "worm", fishSet({ worm: wm }));
  if ((inputs.prices || {}).Salt > 0) tryCfg(f.buySalt ? "Nekupuj sůl" : "Dokupuj sůl na stárnutí", "fish", fishSet({ buySalt: !f.buySalt }));
  return out.sort((a, b) => a.dFlower - b.dFlower).slice(0, n);
}

/**
 * Kitchens and fish add up (a kitchen's XP and cost a day do not depend on the fish), so for one
 * ticked set the plan is: the fish part (one plan per fish setting, kitchens off) + any choice of
 * recipe per kitchen (off, the top two by XP, the cheapest per XP). Every combination is a point.
 */
function setPoints(farm, inputs, config, ticked) {
  const offB = Object.fromEntries(Object.entries(config.buildings || {}).map(([k, v]) => [k, { ...v, on: false }]));
  const fishVariants = [];
  const salt = (inputs.prices || {}).Salt > 0;
  for (const age of [true, false]) for (const eatRaw of [true, false]) for (const buySalt of salt && age ? [false, true] : [false]) {
    const fish = { ...config.fish, age, eatRaw, buySalt, baits: true };
    const p = levelingPlan(farm, inputs, { ...config, ticked, buildings: offB, fish });
    fishVariants.push({ fish, x: p.xpPerDay.total, c: p.costPerDay, banked: p.bankedXp || 0, one: p.oneOff || 0 });
  }
  // Each worm on the main setting (age + eat the rest): its own catch and cast price.
  for (const worm of LEVELING_WORMS) for (const buySalt of salt ? [false, true] : [false]) {
    const fish = { ...config.fish, age: true, eatRaw: true, buySalt, baits: true, worm };
    const p = levelingPlan(farm, inputs, { ...config, ticked, buildings: offB, fish });
    fishVariants.push({ fish, x: p.xpPerDay.total, c: p.costPerDay, banked: p.bankedXp || 0, one: p.oneOff || 0 });
  }
  const opts = levelingRecipeOptions(farm, inputs, config.restarts, ticked);
  const choices = Object.keys(config.buildings || {}).map((name) => {
    const list = opts[name] || [];
    const top = list.slice(0, 2);
    const cheap = list.filter((o) => list[0] && o.xpPerDay >= 0.25 * list[0].xpPerDay).sort((a, b) => a.perM - b.perM)[0];
    const uniq = [...new Map([...top, ...(cheap ? [cheap] : [])].map((o) => [o.name, o])).values()];
    return [{ name, recipe: null, x: 0, c: 0 }, ...uniq.map((o) => ({ name, recipe: o.name, x: o.xpPerDay, c: o.costPerDay }))];
  });
  const scale = config.costScale > 0 ? config.costScale : 1;
  const xpAt = ascensionXpFor(config.target.ascension, config.target.level);
  const pts = [];
  const walk = (i, x, c, picks) => {
    if (i === choices.length) {
      for (const fv of fishVariants) {
        const X = x + fv.x;
        if (!(X > 0)) continue;
        const need = xpAt - expOf(farm) - fv.banked;
        const days = need > 0 ? need / X : 0;
        pts.push({ days, flower: days > 0 ? days * (c * scale + fv.c) + fv.one : 0, picks, fish: fv.fish, ticked });
      }
      return;
    }
    for (const o of choices[i]) walk(i + 1, x + o.x, c + o.c, o.recipe ? [...picks, o] : picks);
  };
  walk(0, 0, 0, []);
  return pts;
}
/** Points no other point beats on both days and FLOWER, fastest first. */
function paretoOf(pts) {
  const s = [...pts].sort((a, b) => a.days - b.days || a.flower - b.flower);
  const out = [];
  for (const p of s) if (!out.length || p.flower < out[out.length - 1].flower - 1e-6) out.push(p);
  return out;
}
const toConfig = (config, pt) => ({
  ...config, ticked: pt.ticked, fish: pt.fish,
  buildings: Object.fromEntries(Object.entries(config.buildings || {}).map(([k, v]) => {
    const pick = pt.picks.find((p) => p.name === k);
    return [k, pick ? { on: true, recipe: pick.recipe } : { ...v, on: false }];
  })),
});

/**
 * The days × FLOWER frontier to the configured target: the cheapest way to get there for every
 * pace. Item sets come from a greedy from a few anchor points (the fastest, a middle one, the cheapest
 * of each fish setting): add the item that lowers FLOWER most, while any does, within the free skill points;
 * then drop any that stopped paying. At most `max` points, spread over the days.
 */
export function levelingFrontier(farm, inputs, config, max = 10) {
  const owned = ownedLevelingItems(farm);
  const free = inputs.freePoints || 0;
  const start = (config.ticked || []).filter((n) => {
    const it = LEVELING_ITEM_BY_NAME[n];
    return it && !owned.has(n) && (it.kind === "skill" || itemPrice(it, inputs).known);
  });
  const keyOf = (t) => t.slice().sort().join("|");
  let all = setPoints(farm, inputs, config, start);
  const ok = all.filter((p) => Number.isFinite(p.flower) && p.days > 0);
  const front0 = paretoOf(ok);
  // Anchors: the fastest, a middle one, and the cheapest of EVERY fish setting — a route that is
  // dear without items (fish only) can be the cheapest with them, and the greedy cannot see past that.
  const cheapestBy = new Map();
  for (const p of ok) {
    const k = JSON.stringify([p.fish.age, p.fish.eatRaw, p.fish.buySalt, p.fish.worm || null]);
    if (!cheapestBy.has(k) || p.flower < cheapestBy.get(k).flower) cheapestBy.set(k, p);
  }
  const anchors = [...new Set([front0[0], front0[Math.floor(front0.length / 2)], ...cheapestBy.values()].filter(Boolean))];
  const sets = new Map([[keyOf(start), start]]);
  for (const a of anchors) {
    let cfg = toConfig(config, a);
    let cur = levelingPlan(farm, inputs, cfg).totalFlower;
    const cands = itemImpacts(farm, inputs, cfg).filter((r) => !r.ticked && buyable(r) && r.dFlower < 0)
      .sort((x, y) => x.dFlower - y.dFlower).slice(0, 20).map((r) => r.name);
    for (let round = 0; round < 15; round++) {
      let best = null;
      for (const n of cands) {
        if (cfg.ticked.includes(n)) continue;
        const ticked = [...cfg.ticked, n];
        if (LEVELING_ITEM_BY_NAME[n].kind === "skill" && tickedSkillPoints(farm, ticked) > free) continue;
        const v = levelingPlan(farm, inputs, { ...cfg, ticked }).totalFlower;
        if (v < cur - 1 && (!best || v < best.v)) best = { n, v };
      }
      if (!best) break;
      cfg = { ...cfg, ticked: [...cfg.ticked, best.n] }; cur = best.v;
    }
    for (const n of [...cfg.ticked]) {      // an item a later one made pointless goes again
      const ticked = cfg.ticked.filter((x) => x !== n);
      const v = levelingPlan(farm, inputs, { ...cfg, ticked }).totalFlower;
      if (v <= cur) { cfg = { ...cfg, ticked }; cur = v; }
    }
    sets.set(keyOf(cfg.ticked), cfg.ticked);
  }
  for (const [k, t] of sets) if (k !== keyOf(start)) all = all.concat(setPoints(farm, inputs, config, t));
  let front = paretoOf(all.filter((p) => Number.isFinite(p.flower) && p.days > 0));
  if (front.length > max) {
    const lo = front[0].days, hi = front[front.length - 1].days, keep = new Set([0, front.length - 1]);
    for (let i = 1; i < max - 1; i++) {
      const t = lo + ((hi - lo) * i) / (max - 1);
      let bi = 0;
      front.forEach((p, j) => { if (Math.abs(p.days - t) < Math.abs(front[bi].days - t)) bi = j; });
      keep.add(bi);
    }
    front = front.filter((_, j) => keep.has(j));
  }
  return front.map((p) => ({ days: p.days, flower: p.flower, config: toConfig(config, p),
    kitchens: p.picks.map((o) => o.name), fish: p.fish, ticked: p.ticked }));
}
