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
import { ascensionXpFor } from "../engine/ascension.mjs";
import { computeFoodXP, detectCookingBoosts } from "../engine/cooking.mjs";
import { FISH_BASE_XP, getAgingSaltCost } from "../data/cooking.mjs";
import { FISH_TIER_MAP, FISH_BAIT_CATCH, FISH_MARKET_RECIPES } from "../data/fishing.mjs";
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
  if (!m.has(key)) m.set(key, cookingFor(w, inputs));
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
    fish: { age: !!ck.buildings["Aging Shed"], eatRaw: true, reels: dailyFishingLimit(farm), baits: false },
    ticked: [], resell: false,
  };
}

function itemPrice(it, inputs) {
  if (!it.tradeable) return { price: null, loss: 0 };
  const floor = it.kind === "bud" ? (inputs.budFloors || {})[it.budType] : (inputs.floors || {})[it.name];
  if (!(floor > 0)) return { price: null, loss: 0 };
  const bid = (inputs.bids || {})[it.name];
  return { price: floor, loss: bid > 0 ? Math.max(0, floor - bid) : floor * NO_BID_LOSS };
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
  const mix = catchMix(farm);
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

  const fishRoute = (useBaits) => {
  let saltPerDay = 0, rakeCost = 0, ag = { gain: 0, used: 0, saltLeft: 0, slotLeft: 0, taken: new Map() }, baitsPerDay = 0;
  if (fishing && fishCfg.age && slots > 0) {
    const s = sideSaltNow({ farm: w, prices: inputs.prices || {}, coinsPerSFL: inputs.coinsPerSFL || 0, isActive: (n) => hasItem(w, n), activity: inputs.activity || null });
    saltPerDay = (s.harvests || 0) * ((s.p && s.p.yieldPerRake) || 0);
    rakeCost = s.cost || 0;
    const cand = rows.filter((r) => r.agedXp > 0);
    if (useBaits) {
      // A bait forces its best fish; it costs its recipe's fish (their raw XP) and one cast's catch.
      const season = lc((farm.season && farm.season.season) || "summer");
      const bubble = hasItem(w, "Bubble Aura") ? BUBBLE_AURA_BAIT : 1;
      for (const bait of FISH_BAITS) {
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
        if (cap > 0) cand.push({ name: best.n, bait, n: cap, agedXp: best.r.xp, hours: best.r.time / 3600,
          salt: getAgingSaltCost(BASE[lc(best.n)]) * surfer, gain: best.r.xp - loss, raw: 0,
          inputs: Object.entries(recipe).map(([inp, q]) => ({ row: rows.find((r) => lc(r.name) === lc(inp)), q: q / bubble })) });
      }
    }
    ag = ageGreedy(cand, saltPerDay, slots * 24 * ager, 24 / restarts);
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
  for (const [r, n] of taken) { agedN += n; agingXp += n * r.agedXp; saltUsed += n * r.salt; slotUsed += n * cycleHours(r.hours, restarts); if (r.bait) baitsPerDay += n; }
  for (const n of spent.values()) baitInputN += n;
  let rawEaten = 0, eatenN = 0;
  for (const r of rows) {
    const left = Math.max(0, r.n * scale - (taken.get(r) || 0) - (spent.get(r) || 0));
    eatenN += left; rawEaten += left * r.raw;
  }
  return { saltPerDay, rakeCost, agedN, agingXp, baitInputN, saltUsed, slotUsed, baitsPerDay, rawEaten, eatenN };
  };
  // Baits are a choice: use them only when they make the day better.
  const plain = fishRoute(false), baited = fishCfg.baits ? fishRoute(true) : null;
  const fr = baited && baited.agingXp + baited.rawEaten > plain.agingXp + plain.rawEaten ? baited : plain;
  const { saltPerDay, rakeCost, agedN, agingXp, baitInputN, saltUsed, slotUsed, baitsPerDay, rawEaten, eatenN } = fr;
  const xpPerDay = { kitchens: kXp, aging: agingXp, raw: rawEaten };
  xpPerDay.total = kXp + agingXp + rawEaten;

  const castCost = computeRodCostSFL(inputs.prices || {}, inputs.coinsPerSFL || 0, skills) + computeBaitCostSFL("Earthworm", inputs.prices || {});
  // Rakes only for the salt the shed uses: salt the nodes could give beyond that is not raked.
  const raked = saltPerDay > 0 ? Math.min(1, saltUsed / saltPerDay) : 0;
  const costPerDay = kCost + reels * castCost + (fishing && fishCfg.age && slots > 0 ? rakeCost * raked : 0);

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
    : saltUsed >= saltPerDay * 0.99 ? "salt" : slotUsed >= slotCap * 0.99 ? "slots" : "fish";

  return {
    needXp, bankedXp, xpPerDay, costPerDay, days, runningFlower, totalFlower, nftCost, resaleLoss, bottleneck, buildings,
    fish: { perDay: fishPerDay * (reels > 0 ? Math.max(0, (reels - baitsPerDay) / reels) : 0), fishPerCast, aged: agedN, agedCaughtN: agedN - baitsPerDay, eatenN, baitInputN,
      saltUsed, saltPerDay, baitsPerDay, slots },
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
      price: p.price, loss: p.loss, ticked: on,
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

/** Each placed kitchen's plannable recipes with XP and FLOWER a day at `restarts`, best first. */
export function levelingRecipeOptions(farm, inputs, restarts) {
  const ck = cookingFor(farm, inputs);
  const nom = ((farm.bumpkin && farm.bumpkin.skills) || {})["Double Nom"] ? 2 : 1;
  const out = {};
  for (const name of LEVELING_KITCHENS) {
    const b = ck.buildings[name];
    if (!b) continue;
    out[name] = (b.recipes || []).filter(plannable).map((r) => {
      const cooks = cooksPerDay(r, Math.max(1, restarts || 1), b.buildingCount || 1);
      return { name: r.name, xpPerDay: r.xp * r.amount * cooks, costPerDay: r.cost * nom * cooks, hours: r.time / 3600 };
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
  for (const k of ["age", "eatRaw", "baits"]) if (typeof f[k] === "boolean") out.fish[k] = f[k];
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
  const options = levelingRecipeOptions(farm, inputs, first.restarts);
  return { def, options, cfg: sanitizeLevelingConfig(saved, def, options) };
}
