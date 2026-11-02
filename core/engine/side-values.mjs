/*
 * SIDE VALUES — what a boost the production categories cannot see is worth on THIS farm.
 *
 * POWER / ROADMAP value a boost by re-running a category's production with and without it
 * (calcBoostValue). Salt, the aging racks, animal feed buffs, the crop machine's skills, XP… have
 * no such production model there, so ~145 items and skills parsed into "other" and were worth 0:
 * they never appeared in the buy path at all ("nevidím tam ani skilly na sůl").
 *
 * Each model here is the game's own rule for one activity (file refs inline, read from the game
 * source 2026-10-06), run on a STATE: the farm's current skills ranks and active items, which a
 * caller can override. An item's value is net(state with it) − net(state without it), with
 * everything else the farm has — the same marginal calcBoostValue computes. A skill rank's value
 * is net(rank L) − net(rank L−1).
 *
 * Throughput is the farm's own: measured activity where the weekly records have it (ctx.activity,
 * measuredActivity in core/sections/tickets.mjs), else the theoretical rate the nodes allow.
 */

import { FISH_BASE_XP, GAME_FISH_SPELLING, getAgingSaltCost, getAgingMaxXP } from "../data/cooking.mjs";

const DAY_MS = 86400000;

/* ── state ─────────────────────────────────────────────────────────────────────────────── */

/**
 * The farm as the models read it: skill ranks, and the names of the items that are ACTIVE
 * (placed collectibles, equipped wearables — an item in the chest does nothing).
 * @param ctx.isActive (name) → boolean, the caller's own placed/equipped check
 */
export function sideState(ctx) {
  const skills = {};
  for (const [k, v] of Object.entries((ctx.farm && ctx.farm.bumpkin && ctx.farm.bumpkin.skills) || {})) {
    const n = Number(v);
    skills[k] = n > 0 ? n : (v ? 1 : 0);
  }
  return { skills, active: (name) => !!(ctx.isActive && ctx.isActive(name)), overrides: {} };
}
const lvl = (st, name) => (name in st.overrides ? st.overrides[name] : (st.skills[name] || 0));
const on = (st, name) => (name in st.overrides ? !!st.overrides[name] : st.active(name));
const rank = (ranks, l) => (l > 0 ? ranks[Math.min(l, ranks.length) - 1] : null);

/* ── SALT (types/salt.ts, events/landExpansion/harvestSalt.ts, craftTool.ts, skillUsed.ts) ── */

const SALT_CHARGE_MS = 7 * 3600000;                 // SALT_CHARGE_GENERATION_TIME
const SALT_BASE_YIELD = 10;                         // BASE_SALT_YIELD, per rake
const SALT_RAKE = { coins: 20, wood: 3 };           // tools.ts "Salt Rake"
const SEA_BLESSED_NODES = 4;                        // SEA_BLESSED_NODE_COUNT
const R = {
  "Salty Seas": [0.9, 0.85, 0.8],                   // charge time ×
  "Wide Rakes": [2, 3, 4],                          // + salt per rake
  "Cheap Rakes": [0.8, 0.7, 0.6],                   // rake coin cost ×
  "Sea Blessed": [5, 6.5, 8],                       // % chance a harvest gives +1 charge to 4 nodes
  "Salt Surge": [72, 60, 48],                       // h cooldown; refills every node to max
};

function saltParams(ctx, st) {
  const farm = ctx.farm || {};
  const nodes = Object.keys((farm.saltFarm && farm.saltFarm.nodes) || {}).length;
  const sculpt = (farm.sculptures && farm.sculptures["Salt Sculpture"] && farm.sculptures["Salt Sculpture"].level) || 0;
  let chargeMs = SALT_CHARGE_MS;
  if (lvl(st, "Salty Seas")) chargeMs *= rank(R["Salty Seas"], lvl(st, "Salty Seas"));
  if (sculpt >= 1) chargeMs *= 0.95;
  if (on(st, "Salt Worker Gnome")) chargeMs *= 0.7;
  let yieldPerRake = SALT_BASE_YIELD;
  if (lvl(st, "Wide Rakes")) yieldPerRake += rank(R["Wide Rakes"], lvl(st, "Wide Rakes"));
  if (on(st, "Deep Sea Salt Cave Background")) yieldPerRake += 5;
  if (on(st, "Salt Worker Gnome")) yieldPerRake += 2;
  let coinMult = 1;
  if (lvl(st, "Cheap Rakes")) coinMult *= rank(R["Cheap Rakes"], lvl(st, "Cheap Rakes"));
  if (sculpt >= 4) coinMult *= 0.9;
  const maxCharges = 3 + (sculpt >= 3 ? 1 : 0) + (sculpt >= 6 ? 1 : 0);
  return {
    nodes, chargeMs, yieldPerRake, coinMult, maxCharges,
    rakeFree: on(st, "Ascended Idol"),
    seaChance: lvl(st, "Sea Blessed") ? rank(R["Sea Blessed"], lvl(st, "Sea Blessed")) / 100 : 0,
    surgeH: lvl(st, "Salt Surge") ? rank(R["Salt Surge"], lvl(st, "Salt Surge")) : 0,
  };
}

/** Harvests a day the nodes allow: every charge raked as it comes, Sea Blessed's extra charges, Salt Surge used on cooldown. */
function saltHarvests(p) {
  if (!(p.nodes > 0)) return 0;
  const base = p.nodes * (DAY_MS / p.chargeMs);
  // Each harvest has a seaChance of +1 charge on up to 4 nodes; those charges are harvests too.
  const k = p.seaChance * Math.min(SEA_BLESSED_NODES, p.nodes);
  const blessed = k < 0.95 ? base / (1 - k) : base * 20;
  const surge = p.surgeH > 0 ? p.nodes * p.maxCharges * (24 / p.surgeH) : 0;
  return blessed + surge;
}

function saltNet(ctx, st) {
  const p = saltParams(ctx, st);
  const theo = saltHarvests(p);
  if (!(theo > 0)) return { net: 0, gross: 0, cost: 0, harvests: 0, p };
  // The farm's real pace: measured harvests against what its CURRENT setup allows; a change in
  // the setup scales from there.
  const cur = saltHarvests(saltParams(ctx, sideState(ctx)));
  const measured = ctx.activity && ctx.activity.saltHarvests > 0 ? ctx.activity.saltHarvests : null;
  const eff = measured && cur > 0 ? Math.min(2, measured / cur) : 1;   // the ROADMAP_EFF_MAX ceiling
  const harvests = theo * eff;
  const prices = ctx.prices || {};
  const gross = harvests * p.yieldPerRake * (prices["Salt"] || 0);
  const coin = ctx.coinsFree || !(ctx.coinsPerSFL > 0) ? 0 : (SALT_RAKE.coins * p.coinMult) / ctx.coinsPerSFL;
  const rake = coin + SALT_RAKE.wood * (prices["Wood"] || 0);
  const cost = p.rakeFree ? 0 : harvests * rake;
  return { net: gross - cost, gross, cost, harvests, eff, measured: !!measured, p };
}

/* ── ANIMALS: feed buffs and Bale (applyAnimalFeedBuff.ts, lib/animals.ts) ──────────────── */

/*
 * Vibraphone: a Salt Lick / Honey Treat buff lasts 6 harvests instead of 3, so the same buffs need
 * half the items. The farm's use of them is read from what its spice rack makes — a "Spiced"
 * counter is one JOB (collectSpiceRack.ts), five items each (the recipe's output), ×Ager.
 */
const SPICE_OUT = { "Refined Salt": 1, "Salt Lick": 5, "Honey Treat": 5 };      // spiceRack.ts outputs per job
function spiceUnitsPerDay(ctx, item) {
  const jobs = ((ctx.activity && ctx.activity.racks) || {})[item] || 0;
  return jobs * (SPICE_OUT[item] || 1) * agerMult(sideState(ctx));
}
function feedNet(ctx, st) {
  if (!on(st, "Vibraphone")) return 0;
  const used = spiceUnitsPerDay(ctx, "Salt Lick") * unitValue(ctx, "Salt Lick") + spiceUnitsPerDay(ctx, "Honey Treat") * unitValue(ctx, "Honey Treat");
  return used * 0.5;   // the half no longer needed
}

const BALE_BASE = 0.1;
const DOUBLE_BALE = [2, 2.5, 3];
/** Bale's extra produce a day: +0.1 Egg, +0.1 Milk / Wool with Bale Economy, ×Double Bale. */
function baleNet(ctx, st) {
  if (!on(st, "Bale")) return 0;
  const h = ctx.animalHarvests || {}, pr = ctx.prices || {};
  const d = lvl(st, "Double Bale");
  const per = BALE_BASE * (d ? rank(DOUBLE_BALE, d) : 1);
  let v = (h.chickens || 0) * per * (pr["Egg"] || 0);
  if (lvl(st, "Bale Economy")) v += ((h.sheep || 0) * (pr["Wool"] || 0) + (h.cows || 0) * (pr["Milk"] || 0)) * per;
  return v;
}

/* ── AGING SHED and RACKS (agingFormulas.ts, agingBase.ts, spiceRack.ts, fermentation.ts) ─ */

const AGER = [2, 3, 4];                 // inputs AND outputs × per job
const SPEEDY_AGING = [0.9, 0.85, 0.8];  // aging time ×
const FISH_SMOKING = [2, 3, 4];         // Prime Aged chance ×
const REFINER = [15, 25, 35];           // % chance of +1 Refined Salt per job
const BACALHAU = [1, 2, 3];             // + bait per bait job
const PRIME_BASE = 10;                  // % — PRIME_AGED_BASE_CHANCE 0.1
const PRIME_XP = 1.3;                   // PRIME_AGED_XP_MULTIPLIER
const ASTRO_DOUBLE = 0.15;              // Astrolabe: chance to double a spice / fermentation job
const POTION_FEE = 320;                 // startPotion.ts GAME_FEE, coins
const BAITS = { "Capsule Bait": 1, "Umbrella Bait": 1, "Crimson Baitfish": 1 };

function agerMult(st) { return lvl(st, "Ager") ? rank(AGER, lvl(st, "Ager")) : 1; }
function sculptLevel(ctx) {
  return (ctx.farm && ctx.farm.sculptures && ctx.farm.sculptures["Salt Sculpture"] && ctx.farm.sculptures["Salt Sculpture"].level) || 0;
}
function primeChance(ctx, st) {
  let c = PRIME_BASE * (lvl(st, "Fish Smoking") ? rank(FISH_SMOKING, lvl(st, "Fish Smoking")) : 1);
  if (sculptLevel(ctx) >= 2) c += 4;
  if (on(st, "Winged Vase")) c += 14;
  return Math.min(100, c) / 100;
}
/** Aging shed throughput × (1 / time multiplier). */
function agingSpeed(ctx, st) {
  let t = lvl(st, "Speedy Aging") ? rank(SPEEDY_AGING, lvl(st, "Speedy Aging")) : 1;
  if (sculptLevel(ctx) >= 5) t *= 0.95;
  if (on(st, "Fish Trap")) t *= 0.8;          // agingFormulas.ts
  return 1 / t;
}
/** Aged fish a day by species, as measured (plain + Prime), at the farm's current setup. */
function agedRows(ctx) {
  const a = ctx.activity;
  if (!a) return [];
  const spell = Object.fromEntries(Object.entries(GAME_FISH_SPELLING).map(([k, v]) => [v, k]));
  return Object.keys({ ...(a.aged || {}), ...(a.prime || {}) }).map((sp) => {
    const fish = spell[sp] || sp, base = FISH_BASE_XP[fish];
    return base ? { fish, base, perDay: ((a.aged || {})[sp] || 0) + ((a.prime || {})[sp] || 0) } : null;
  }).filter(Boolean);
}
/**
 * The aging shed's net a day: each aged fish is worth the XP it gives over the raw fish it was
 * made from (that fish could be eaten as it is), less its salt. The count scales from the measured
 * one by the speed and the Ager batch the state has against the farm's own.
 */
function agingNet(ctx, st) {
  const rows = agedRows(ctx);
  if (!rows.length || !(ctx.sflPerXP > 0)) return 0;
  const cur = sideState(ctx);
  const scale = (agingSpeed(ctx, st) / agingSpeed(ctx, cur)) * (agerMult(st) / agerMult(cur));
  const c = primeChance(ctx, st), astro = on(st, "Astrolabe") ? 1.05 : 1;
  const saltP = (ctx.prices || {})["Salt"] || 0;
  const saltMult = on(st, "Surfer Hair") ? 0.5 : 1;
  let v = 0;
  for (const r of rows) {
    const max = getAgingMaxXP(r.base), prime = Math.floor(max * PRIME_XP);
    const xp = ((1 - c) * max + c * prime) * astro - r.base;
    v += r.perDay * scale * (xp * ctx.sflPerXP - getAgingSaltCost(r.base) * saltMult * saltP);
  }
  return v;
}
/*
 * Spice and fermentation racks: jobs a day as measured, each worth its outputs less its inputs.
 * A spice counter is a job; a fermentation counter is the ITEMS it gave (grantFermentationRecipeOutputs.ts),
 * so it is divided by the job's output at the farm's Ager rank. Ager runs the same jobs with every
 * input and output ×rank — throughput ×rank in the same rack time.
 */
const RACK_RECIPES = {
  "Refined Salt": { in: { Salt: 10 }, out: 1, spice: true },
  "Salt Lick": { in: { "Refined Salt": 5 }, out: 5, spice: true },
  "Honey Treat": { in: { "Refined Salt": 5, Honey: 5 }, out: 5, spice: true },
  "Sproutroot Surprise": { in: { "Sprout Mix": 5, "Rapid Root": 5, "Refined Salt": 2 }, out: 5 },
  "Turbofruit Mix": { in: { "Rapid Root": 5, "Fruitful Blend": 5, "Refined Salt": 2 }, out: 5 },
};
/**
 * A rack product's worth: its market price, or — the rack products barely trade — what its
 * inputs cost per item through the recipe chain (Salt Lick = 1 Refined Salt = 10 Salt).
 */
function unitValue(ctx, item, depth = 0) {
  const pr = ctx.prices || {};
  if (pr[item] > 0) return pr[item];
  const rc = RACK_RECIPES[item];
  if (!rc || depth > 3) return 0;
  return Object.entries(rc.in).reduce((t, [k, q]) => t + unitValue(ctx, k, depth + 1) * q, 0) / rc.out;
}
/*
 * The racks run to what the farm NEEDS, so a boost that adds output is worth the items it adds at
 * the jobs the farm runs (Astrolabe, Refiner, Bacalhau, Salt Bottle Onesie); Ager's bigger
 * batches only save rack time there and are not counted (it is valued on the aging shed).
 */
function racksNet(ctx, st) {
  const a = ctx.activity;
  if (!a || !a.racks) return 0;
  const am = agerMult(sideState(ctx));
  let v = 0;
  for (const [item, count] of Object.entries(a.racks)) {
    const rc = RACK_RECIPES[item];
    if (!rc && !BAITS[item]) continue;
    const base = rc ? rc.out : 1;
    const jobs = rc && rc.spice ? count : count / Math.max(1e-9, base * am);
    let extra = 0;
    if (on(st, "Astrolabe")) extra += base * am * ASTRO_DOUBLE;
    if (item === "Refined Salt" && lvl(st, "Refiner")) extra += rank(REFINER, lvl(st, "Refiner")) / 100;
    if (BAITS[item] && lvl(st, "Bacalhau")) extra += rank(BACALHAU, lvl(st, "Bacalhau"));
    if (rc && rc.spice && on(st, "Salt Bottle Onesie")) extra += 1;
    v += jobs * extra * unitValue(ctx, item);
  }
  return v;
}
function agingAll(ctx, st) { return agingNet(ctx, st) + racksNet(ctx, st); }

/** Potion House: Alchemist Apron halves the game fee (coins), so its value is the fee saved. */
function potionNet(ctx, st) {
  const g = (ctx.activity && ctx.activity.potionGames) || 0;
  if (!g || ctx.coinsFree || !(ctx.coinsPerSFL > 0)) return 0;
  return -(g * POTION_FEE * (on(st, "Alchemist Apron") ? 0.5 : 1)) / ctx.coinsPerSFL;
}

/* ── CROP MACHINE skills (cropMachine.ts via core/engine/crop-machine.mjs) ─────────────── */

/*
 * The machine's model reads its skills off the farm (plots, oil per hour, unlocked crops), so a
 * skill is valued by re-running the machine's day with the state's skill set:
 * ctx.machineNet(skills) is that run (the caller wires it — this module stays import-free of the
 * machine). Oil Gadget / Efficiency Extension cut the oil, Field Extension adds 5 plots, the Crop
 * Extension Modules unlock crops. Leak-Proof Tank and Field Expansion Module only save refills
 * and queue clicks — no change in a day's output, so 0.
 */
const MACHINE_SKILLS = ["Oil Gadget", "Efficiency Extension Module", "Field Extension Module",
  "Crop Extension Module I", "Crop Extension Module II", "Crop Extension Module III", "Leak-Proof Tank", "Field Expansion Module"];
function machineNet(ctx, st) {
  if (!ctx.machineNet) return 0;
  const skills = {};
  for (const n of MACHINE_SKILLS) { const l = lvl(st, n); if (l) skills[n] = l; }
  return ctx.machineNet(skills) || 0;
}

/* ── POWER SKILLS (skillUsed.ts): each use finishes a whole cycle of its category ───────── */

/*
 * Used as soon as the cooldown allows, a power skill is 86400000 / cooldown extra cycles a day of
 * its category (the "extra_cycles" effect applyBoosts already prices for Luna's Crescent). The
 * category's net with those cycles minus without is ctx.catGain(cat, effects) — wired by the caller
 * to the roadmap's category engine, so it carries the category's costs too. Instant Gratification
 * (cooking) and Salt Surge (salt model) are not here.
 */
const POWER_SKILLS = {
  "Instant Growth": { cats: ["crops"], cd: [259200000, 216000000, 172800000] },
  "Tree Blitz": { cats: ["trees"], cd: [86400000, 64800000, 43200000] },
  "Barnyard Rouse": { cats: ["chickens", "cows", "sheep"], cd: [432000000, 345600000, 302400000] },
  "Petal Blessed": { cats: ["flowers"], cd: [345600000, 302400000, 259200000] },
  "Greenhouse Guru": { cats: ["greenhouse"], cd: [345600000, 302400000, 259200000] },
  "Grease Lightning": { cats: ["oil"], cd: [345600000, 302400000, 259200000] },
};
function powerSkillNet(name) {
  return (ctx, st) => {
    const l = lvl(st, name), ps = POWER_SKILLS[name];
    if (!l || !ps || !ctx.catGain) return 0;
    const perDay = DAY_MS / rank(ps.cd, l);
    return ps.cats.reduce((t, cat) => t + (ctx.catGain(cat, [{ type: "extra_cycles", value: perDay, cat, raw: `${name}: +${perDay.toFixed(2)} cycles/day` }]) || 0), 0);
  };
}

/* ── BUMPKIN XP (expansion/lib/boosts.ts getFoodExpBoost: every boost MULTIPLIES) ──────── */

/*
 * The XP the farm gains a day is measured (ctx.activity.xpPerDay, the weekly snapshots' bumpkin
 * experience) with every multiplier it HAS; an item worth ×m adds (m − 1) of the unboosted XP,
 * i.e. X × (m − 1) when it is missing and X × (1 − 1/m) when it is there. An XP is worth what the
 * farm's cheapest XP recipe pays for one (ctx.sflPerXP — the skill-point price). Only the boosts on
 * ALL food are here: the per-food ones (cakes, fish, deli…) need the food mix, which the snapshots
 * no longer carry (bumpkin.activity is empty).
 */
// Giant Truffle is ×1.3 on non-fish food (×1.6 on Smoothie Shack / Deli food, not counted).
const XP_ITEMS = { "Observatory": 1.05, "Golden Spatula": 1.1, "Pan": 1.25, "Giant Truffle": 1.3 };
const MUNCHING = [0.05, 0.075, 0.1];
function xpMult(st) {
  let m = 1;
  for (const [n, f] of Object.entries(XP_ITEMS)) if (on(st, n)) m *= f;
  if (lvl(st, "Munching Mastery")) m *= 1 + rank(MUNCHING, lvl(st, "Munching Mastery"));
  return m;
}
function xpNet(ctx, st) {
  const x = ctx.activity && ctx.activity.xpPerDay;
  if (!(x > 0) || !(ctx.sflPerXP > 0)) return 0;
  const unboosted = x / xpMult(sideState(ctx));
  return unboosted * xpMult(st) * ctx.sflPerXP;
}

/* ── PIGS and the CAVE (Cave Dwellers; game source 2026-11-02) ─────────────────────────── */

/*
 * A Pig sleeps 24 h (feedAnimal.ts) and, fed back to "ready", gives Truffles by level
 * (types/animals.ts). Like the other animals here, a cycle needs the XP to the next level
 * (Cow thresholds) and every feed is one Slop of the level's favourite tier (or a cheaper one
 * per XP); a Slop costs ONE of its crops in the listed amount (types/pigFeeds.ts). Pig Bristles
 * only come from trading a pig in (tradeInPig.ts: awake, level 3+, the pig is gone), so a pen slot
 * has two long-run plays: keep the pig at L15 for its Truffles, or raise a new one (100 coins) to
 * level L — one level a day, Truffles on every claim — and trade it in for its Bristles. pigSlot
 * finds the better per day; valuations use it, as a pen slot is held for good.
 *
 * The Cave's Myco Bins dig a 25-tile patch every 12 h (types/caveRecipes.ts, cavePatch.ts).
 * Its outputs are valued by what they bring on THIS farm: a Beetle is the better of its p2p price
 * and that much animal-feed XP, a Wild / Magic Mushroom is one Rich / Gourmet Slop, and Mud is the feed a Mud coat saves (×1.25 feed XP for one claim,
 * 25 Mud; two claims with Vibraphone) — only as much Mud as the farm's pigs can use.
 * A Truffle is its p2p price once it trades, else what its best recipe pays in XP over the
 * other ingredients (consumables.ts), at the farm's FLOWER per XP.
 */
const PIG_LEVELS = [0, 180, 360, 720, 1080, 1440, 1980, 2520, 3060, 3600, 4320, 5040, 5760, 6480, 7200, 8160];
const PIG_TRUFFLES = [0, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 4];
const SLOP_XP = [   // [from level, XP of Basic / Hearty / Rich / Gourmet]
  [0, { "Basic Slop": 60, "Hearty Slop": 10, "Rich Slop": 20, "Gourmet Slop": 30 }],
  [3, { "Basic Slop": 10, "Hearty Slop": 60, "Rich Slop": 20, "Gourmet Slop": 30 }],
  [6, { "Basic Slop": 10, "Hearty Slop": 20, "Rich Slop": 60, "Gourmet Slop": 30 }],
  [10, { "Basic Slop": 10, "Hearty Slop": 20, "Rich Slop": 30, "Gourmet Slop": 80 }],
];
const SLOP_CROPS = {
  "Basic Slop": { Sunflower: 800, Potato: 150, Rhubarb: 100, Pumpkin: 60, Zucchini: 60, Carrot: 25, Yam: 25, Cabbage: 15, Broccoli: 15, Soybean: 9 },
  "Hearty Slop": { Beetroot: 15, Pepper: 15, Cauliflower: 8, Parsnip: 5, Tomato: 20, Lemon: 4, Blueberry: 4 },
  "Rich Slop": { Eggplant: 6, Wheat: 6, Turnip: 6, Corn: 5, Onion: 5, Radish: 5, Kale: 4, Artichoke: 4, Barley: 3, Orange: 3, Apple: 2, Banana: 2 },
  "Gourmet Slop": { Rice: 1, Olive: 1, Grape: 1, Celestine: 1, Lunara: 1, Duskberry: 1 },
};
const MUD_COAT = 25;                 // lib/animals.ts MUD_COAT_COST, one claim (Vibraphone: two)
const MUD_XP = 1.25;
const TRUFFLE_RECIPES = [            // consumables.ts
  { truffles: 1, xp: 1000, other: { Potato: 30 } },                               // Ember-Roasted Truffle Potatoes
  { truffles: 15, xp: 30000, other: { Wheat: 30, Egg: 30, Honey: 5 } },           // Truffle Cake
  { truffles: 8, xp: 32000, other: { Rice: 3, "Wild Mushroom": 5 } },             // Creamy Truffle Risotto
];
const PIG_BRISTLES = [0, 0, 0, 1, 1, 2, 3, 3, 4, 5, 6, 6, 7, 8, 9, 12];   // types/animals.ts, per trade-in
const PIG_PRICE = 100;                                                   // coins, types/animals.ts
const BRISTLE_PAYOUT = [1.1, 1.2, 1.3];
const CATTLEGRIM = 0.25, BARN_MANAGER = 0.1;
const TRUFFLE_YIELD = [1.1, 1.2, 1.3];
const SWILL_SAVVY = [0.75, 0.65, 0.5], SWILL_DEBUFF = [1.5, 1.55, 1.65];

const CAVE_BATCH_H = 12;
const CAVE_TILES = 25;
const CAVE_RECIPES = {               // caveRecipes.ts
  Mushroom: { mush: 6, beetle: 2, mud: 17, mudX: 1, input: { Wood: 10 } },
  Beetle: { mush: 3, beetle: 5, mud: 17, mudX: 1, input: { Egg: 30 } },
  Mud: { mush: 3, beetle: 2, mud: 20, mudX: 2, input: null },
};
const CAVE_MUD_CROPS = { Sunflower: 500, Potato: 80, Rhubarb: 40, Pumpkin: 20, Zucchini: 20, Carrot: 10, Yam: 10, Cabbage: 5,
  Broccoli: 5, Soybean: 3, Beetroot: 3, Pepper: 3, Cauliflower: 2, Parsnip: 2, Eggplant: 2, Corn: 2, Onion: 2, Wheat: 2, Turnip: 2,
  Radish: 2, Kale: 2, Artichoke: 2, Barley: 2, Rice: 1, Olive: 1 };
const BEETLE_XP = { "Green Beetle": 100, "Blue Beetle": 200, "Pink Beetle": 400, "Amber Beetle": 800 };
const BEETLE_ODDS = [{ "Green Beetle": 40, "Blue Beetle": 30, "Pink Beetle": 20, "Amber Beetle": 10 },
  { "Green Beetle": 35, "Blue Beetle": 35, "Pink Beetle": 15, "Amber Beetle": 15 },     // Rare Breeds 1-3
  { "Green Beetle": 30, "Blue Beetle": 30, "Pink Beetle": 20, "Amber Beetle": 20 },
  { "Green Beetle": 25, "Blue Beetle": 25, "Pink Beetle": 25, "Amber Beetle": 25 }];
const SAND_SHOVEL = { coins: 20, Wood: 2, Stone: 1 };                                    // tools.ts, 1 tile
const SAND_DRILL = { coins: 40, Oil: 1, Crimstone: 1, Wood: 3, Leather: 1 };            // 2×2 = 4 tiles
const CAVE_SKILLS = {
  "Lean Compost": [0.95, 0.9, 0.85], "Rapid Mycelium": [0.95, 0.9, 0.85], "Mushroom Bloom": [1, 2, 3],
  "Muddy Bounty": [1.1, 1.2, 1.3], "Sturdy Shovel": [0.1, 0.2, 0.3], "Fungal Harvest": [0.2, 0.3, 0.4],
  "Beetle Nest": [1, 2, 3], "Sturdy Drill": [0.2, 0.3, 0.4], "Tool Hoarder": [0, 0, 0], "Rare Breeds": [1, 2, 3],
  "Twin Beetles": [0.05, 0.1, 0.15],
};
const cs = (st, name, dflt) => (lvl(st, name) ? rank(CAVE_SKILLS[name], lvl(st, name)) : dflt);

/** FLOWER for a bundle of coins and items; Infinity when an item has no price (it cannot be the cheap route). */
function bundleCost(ctx, b) {
  const pr = ctx.prices || {};
  let v = 0;
  for (const [k, q] of Object.entries(b)) {
    if (k === "coins") { if (!ctx.coinsFree && ctx.coinsPerSFL > 0) v += q / ctx.coinsPerSFL; continue; }
    if (!(pr[k] > 0)) return Infinity;
    v += q * pr[k];
  }
  return v;
}
/** The cheapest crop route to one Slop (crops without a price are skipped). */
function slopCost(ctx, slop) {
  const pr = ctx.prices || {};
  let best = Infinity;
  for (const [crop, q] of Object.entries(SLOP_CROPS[slop])) if (pr[crop] > 0) best = Math.min(best, q * pr[crop]);
  return isFinite(best) ? best : 0;
}
function pigLevel(xp) { let l = 0; for (let i = 0; i < PIG_LEVELS.length; i++) if (xp >= PIG_LEVELS[i]) l = i; return l; }
/** Levels of the farm's pigs (farm.pigpen.animals). */
export function farmPigs(farm) {
  return Object.values((farm && farm.pigpen && farm.pigpen.animals) || {}).filter((a) => a && a.type === "Pig")
    .map((a) => pigLevel(Number(a.experience) || 0));
}
/** One claim's feed for a pig at `level`: the cheapest Slop per XP, at the state's XP and feed multipliers. */
function pigFeed(ctx, st, level, xpMult) {
  const need = level >= 15 ? PIG_LEVELS[15] - PIG_LEVELS[14] : PIG_LEVELS[level + 1] - PIG_LEVELS[level];
  const row = SLOP_XP.filter(([from]) => level >= from).pop()[1];
  const qty = lvl(st, "Swill Savvy") ? rank(SWILL_SAVVY, lvl(st, "Swill Savvy")) : 1;
  let best = Infinity;
  for (const [slop, xp] of Object.entries(row)) {
    const c = slopCost(ctx, slop);
    if (!(c > 0)) continue;
    best = Math.min(best, Math.ceil(need / (xp * xpMult)) * qty * c);
  }
  return isFinite(best) ? best : 0;
}
function pigXpMult(st) { return on(st, "Pig Onesie") ? 1.05 : 1; }
/**
 * FLOWER for one Truffle: its p2p price, else its best recipe's XP over the other ingredients.
 * ctx.sflPerXP is per BOOSTED XP (the skill-point price), so the recipe's XP takes the farm's
 * own food-XP boost (ctx.xpBoost, boostedXP / xp of that recipe).
 */
export function truffleValue(ctx) {
  const pr = ctx.prices || {};
  if (pr["Truffle"] > 0) return pr["Truffle"];
  if (!(ctx.sflPerXP > 0)) return 0;
  const wild = slopCost(ctx, "Rich Slop");
  let best = 0;
  for (const r of TRUFFLE_RECIPES) {
    const other = Object.entries(r.other).reduce((t, [k, q]) => t + q * (k === "Wild Mushroom" ? wild : (pr[k] || 0)), 0);
    best = Math.max(best, (r.xp * (ctx.xpBoost || 1) * ctx.sflPerXP - other) / r.truffles);
  }
  return best;
}
function trufflesPerClaim(st, level) {
  let t = PIG_TRUFFLES[level] || 0;
  if (!t) return 0;
  if (on(st, "Cattlegrim")) t += CATTLEGRIM;
  if (lvl(st, "Barn Manager")) t += BARN_MANAGER;
  if (lvl(st, "Truffle Yield")) t *= rank(TRUFFLE_YIELD, lvl(st, "Truffle Yield"));
  return t;
}
/** One pig's day at `level` (1 claim): Truffles less its uncoated feed. */
export function pigDay(ctx, st, level) {
  const truffles = trufflesPerClaim(st, level);
  const feed = pigFeed(ctx, st, level, pigXpMult(st));
  return { truffles, feed, net: truffles * truffleValue(ctx) - feed };
}
/** Bristles for trading a pig in at `level` (lib/animals.ts getPigBristles: same adds as Truffles, ×Bristle Payout). */
function bristlesAt(st, level) {
  let b = PIG_BRISTLES[level] || 0;
  if (!b) return 0;
  if (on(st, "Cattlegrim")) b += CATTLEGRIM;
  if (lvl(st, "Barn Manager")) b += BARN_MANAGER;
  if (lvl(st, "Bristle Payout")) b *= rank(BRISTLE_PAYOUT, lvl(st, "Bristle Payout"));
  return b;
}
/**
 * A pen slot's long run, FLOWER a day: keeping a pig at L15, or the best trade-in cycle — buy a pig,
 * raise it to L (L days: feed at levels 0…L−1, Truffles at 1…L), trade it in for its Bristles.
 * Bristles are only counted at a p2p price.
 */
export function pigSlot(ctx, st) {
  const tv = truffleValue(ctx), bp = (ctx.prices || {})["Pig Bristles"] || 0;
  const coin = !ctx.coinsFree && ctx.coinsPerSFL > 0 ? PIG_PRICE / ctx.coinsPerSFL : 0;
  const keep = pigDay(ctx, st, 15).net;
  const cycles = [];
  let truffles = 0, feed = 0;
  for (let L = 1; L <= 15; L++) {
    feed += pigFeed(ctx, st, L - 1, pigXpMult(st));
    truffles += trufflesPerClaim(st, L);
    const bristles = bristlesAt(st, L);
    if (!bristles) continue;
    const total = truffles * tv - feed + bristles * bp - coin;
    cycles.push({ level: L, days: L, truffles, bristles, feed, total, perDay: total / L });
  }
  const best = bp > 0 ? cycles.reduce((a, c) => (!a || c.perDay > a.perDay ? c : a), null) : null;
  const tradeIn = !!(best && best.perDay > keep);
  return { keep, cycles, best, tradeIn, perDay: tradeIn ? best.perDay : keep };
}
function pigsNet(ctx, st) {
  const pigs = farmPigs(ctx.farm);
  let v = pigs.length * pigSlot(ctx, st).perDay;
  // Swill Savvy's debuff: every other animal eats ×1.5 / 1.55 / 1.65.
  if (lvl(st, "Swill Savvy") && ctx.catGain) {
    const d = rank(SWILL_DEBUFF, lvl(st, "Swill Savvy")) - 1;
    for (const cat of ["chickens", "cows", "sheep"]) v += ctx.catGain(cat, [{ type: "feed_reduction", value: d, cat, raw: `Swill Savvy: +${Math.round(d * 100)}% feed` }]) || 0;
  }
  return v;
}

/** What a Mud coat saves per Mud on each pig (×1.25 feed XP for one claim), and the Mud a day they can use. */
function mudUse(ctx, st) {
  const perClaim = MUD_COAT / (on(st, "Vibraphone") ? 2 : 1);
  const m = pigXpMult(st);
  let need = 0, saving = 0;
  for (const l of farmPigs(ctx.farm)) {
    const s = pigFeed(ctx, st, l, m) - pigFeed(ctx, st, l, m * MUD_XP);
    if (s > 0) { need += perClaim; saving += s; }
  }
  return { need, perMud: need > 0 ? saving / need : 0 };
}
/** The farm's FLOWER per animal-feed XP — a Beetle's worth per XP (its pigs' favourite Slop, else Basic Slop). */
function feedPerXP(ctx) {
  const pigs = farmPigs(ctx.farm);
  const lvls = pigs.length ? pigs : [0];
  let t = 0;
  for (const l of lvls) {
    const row = SLOP_XP.filter(([from]) => l >= from).pop()[1];
    let best = Infinity;
    for (const [slop, xp] of Object.entries(row)) { const c = slopCost(ctx, slop); if (c > 0) best = Math.min(best, c / xp); }
    t += isFinite(best) ? best : 0;
  }
  return t / lvls.length;
}
/** One Myco Bin batch of `recipe`: what it gives and costs, with the state's cave skills. */
export function caveBatch(ctx, st, recipe, mudValue) {
  const r = CAVE_RECIPES[recipe];
  const pr = ctx.prices || {};
  const bloom = cs(st, "Mushroom Bloom", 0), nest = recipe === "Beetle" ? cs(st, "Beetle Nest", 0) : 0;
  const mushT = r.mush + bloom, beetleT = r.beetle + nest, mudT = Math.max(0, CAVE_TILES - mushT - beetleT);
  const mushrooms = mushT * (1 + cs(st, "Fungal Harvest", 0));
  const beetles = beetleT * (1 + cs(st, "Twin Beetles", 0));
  const odds = BEETLE_ODDS[lvl(st, "Rare Breeds") ? Math.min(3, lvl(st, "Rare Breeds")) : 0];
  const beetleXp = Object.entries(odds).reduce((t, [b, p]) => t + (p / 100) * BEETLE_XP[b], 0);
  // A Beetle is worth the better of selling it and feeding it (its XP as animal feed).
  const fpx = feedPerXP(ctx);
  const beetleValue = Object.entries(odds).reduce((t, [b, p]) => t + (p / 100) * Math.max(pr[b] || 0, BEETLE_XP[b] * fpx), 0);
  const mud = mudT * r.mudX * cs(st, "Muddy Bounty", 1);
  let input = 0;
  if (r.input) { input = bundleCost(ctx, r.input); if (!isFinite(input)) input = 0; }
  else {
    let best = Infinity;
    for (const [crop, q] of Object.entries(CAVE_MUD_CROPS)) if (pr[crop] > 0) best = Math.min(best, q * pr[crop]);
    input = isFinite(best) ? best : 0;
  }
  input *= cs(st, "Lean Compost", 1);
  const shovel = bundleCost(ctx, SAND_SHOVEL) * (1 - cs(st, "Sturdy Shovel", 0));
  const drill = (bundleCost(ctx, SAND_DRILL) / 4) * (1 - cs(st, "Sturdy Drill", 0));
  const perTile = Math.min(shovel, drill);
  const dig = CAVE_TILES * (isFinite(perTile) ? perTile : 0);
  const gross = mushrooms * (0.9 * slopCost(ctx, "Rich Slop") + 0.1 * slopCost(ctx, "Gourmet Slop"))
    + beetles * beetleValue + mud * (mudValue || 0);
  return { recipe, mushrooms, beetles, beetleXp, mud, input, dig, gross, net: gross - input - dig };
}
/** Myco Bins on the farm: one per cave tier (types/caveTiers.ts). */
export function farmBins(farm) {
  const c = farm && farm.cave;
  if (!c) return 0;
  return Math.max(Object.keys(c.machines || {}).length, Number(c.tier) || 0);
}
/** The cave's day: each bin runs its best recipe; Mud is worth its coat saving only up to what the pigs use. */
export function caveDay(ctx, st, bins) {
  const n = bins != null ? bins : farmBins(ctx.farm);
  const per = DAY_MS / (CAVE_BATCH_H * 3600000 * cs(st, "Rapid Mycelium", 1));
  let { need, perMud } = mudUse(ctx, st);
  const out = [];
  let net = 0;
  for (let i = 0; i < n; i++) {
    let best = null;
    for (const rec of Object.keys(CAVE_RECIPES)) {
      const b = caveBatch(ctx, st, rec, 0);
      const mudPerDay = b.mud * per;
      const useful = Math.min(mudPerDay, Math.max(0, need));
      const dayNet = b.net * per + useful * perMud;
      if (!best || dayNet > best.dayNet) best = { ...b, dayNet, mudUsed: useful };
    }
    need -= best.mudUsed;
    net += best.dayNet;
    out.push(best);
  }
  return { net, bins: out, batchesPerDay: per };
}
function caveNet(ctx, st) { return caveDay(ctx, st).net; }

/** Pigs and cave as the farm stands — YOUR INCOME rows. */
export function sideCavePigsNow(ctx) {
  const st = sideState(ctx);
  const pigs = farmPigs(ctx.farm);
  return { pigs: pigs.map((l) => ({ level: l, ...pigDay(ctx, st, l) })), pigsNet: pigsNet(ctx, st), slot: pigSlot(ctx, st),
    truffleValue: truffleValue(ctx), cave: caveDay(ctx, st) };
}

/* ── registry ──────────────────────────────────────────────────────────────────────────── */

/**
 * name → { cat, skill?, maxLevel?, net(ctx, state), why(ctx, state) }. `skill` items take a rank
 * (0…maxLevel); the rest are on/off.
 */
const SALT = { cat: "salt", net: (ctx, st) => saltNet(ctx, st).net };
export const SIDE_MODELS = {
  "Salty Seas": { ...SALT, skill: true, maxLevel: 3 },
  "Wide Rakes": { ...SALT, skill: true, maxLevel: 3 },
  "Cheap Rakes": { ...SALT, skill: true, maxLevel: 3 },
  "Sea Blessed": { ...SALT, skill: true, maxLevel: 3 },
  "Salt Surge": { ...SALT, skill: true, maxLevel: 3, power: true },
  "Ascended Idol": SALT,
  "Salt Worker Gnome": SALT,
  "Deep Sea Salt Cave Background": SALT,
  // animals
  "Vibraphone": { cat: "animalx", net: feedNet },
  "Double Bale": { cat: "animalx", net: baleNet, skill: true, maxLevel: 3 },
  "Bale Economy": { cat: "animalx", net: baleNet, skill: true, maxLevel: 1 },
  // aging shed and racks — measured activity only (ctx.activity); 0 without it
  "Winged Vase": { cat: "aging", net: agingAll },
  "Surfer Hair": { cat: "aging", net: agingAll },
  "Astrolabe": { cat: "aging", net: agingAll },
  "Salt Bottle Onesie": { cat: "aging", net: agingAll },
  "Fish Smoking": { cat: "aging", net: agingAll, skill: true, maxLevel: 3 },
  "Speedy Aging": { cat: "aging", net: agingAll, skill: true, maxLevel: 3 },
  "Ager": { cat: "aging", net: agingAll, skill: true, maxLevel: 3 },
  "Refiner": { cat: "aging", net: agingAll, skill: true, maxLevel: 3 },
  "Bacalhau": { cat: "aging", net: agingAll, skill: true, maxLevel: 3 },
  "Alchemist Apron": { cat: "aging", net: potionNet },
  "Fish Trap": { cat: "aging", net: agingAll },
  // crop machine
  ...Object.fromEntries(MACHINE_SKILLS.map((n) => [n, { cat: "machine", net: machineNet, skill: true, maxLevel: /^Crop Extension/.test(n) ? 1 : 3 }])),
  // bumpkin XP
  "Observatory": { cat: "xp", net: xpNet },
  "Golden Spatula": { cat: "xp", net: xpNet },
  "Pan": { cat: "xp", net: xpNet },
  "Munching Mastery": { cat: "xp", net: xpNet, skill: true, maxLevel: 3 },
  "Giant Truffle": { cat: "xp", net: xpNet },
  // pigs — Truffles less feed, on the farm's own pigs
  "Truffle Yield": { cat: "pigs", net: pigsNet, skill: true, maxLevel: 3 },
  "Swill Savvy": { cat: "pigs", net: pigsNet, skill: true, maxLevel: 3 },
  "Pig Onesie": { cat: "pigs", net: pigsNet },
  "Cattlegrim": { cat: "pigs", net: pigsNet },
  "Barn Manager": { cat: "pigs", net: pigsNet, skill: true, maxLevel: 1 },
  "Bristle Payout": { cat: "pigs", net: pigsNet, skill: true, maxLevel: 3 },
  // cave — the Myco Bins' day
  ...Object.fromEntries(Object.keys(CAVE_SKILLS).filter((n) => n !== "Tool Hoarder").map((n) => [n, { cat: "cave", net: caveNet, skill: true, maxLevel: 3 }])),
  // power skills — "if you use it every time the cooldown is up"
  ...Object.fromEntries(Object.keys(POWER_SKILLS).map((n) => [n, { cat: "power", net: powerSkillNet(n), skill: true, maxLevel: 3, power: true }])),
};

/*
 * WHY a boost has no FLOWER value — shown next to it (POWER's qualitative rows, ROADMAP's no-value
 * list) so nothing goes missing silently. By name first, then by what its text is about.
 */
const NO_VALUE = [
  [["Grain Grinder", "Skill Shrimpy", "Drive-Through Deli", "Juicy Boost", "Buzzworthy Treats", "Swiss Whiskers", "Hungry Hare", "Fishy Feast"],
    "XP jen z určitého jídla — co jíš, se z historie farmy nedá vyčíst (hra přestala ukládat bumpkin.activity)"],
  [["Fast Feasts", "Frosted Cakes", "Turbo Fry", "Swift Sizzle", "Fry Frenzy", "Luna's Hat", "Instant Gratification", "Double Nom", "Fiery Jackpot", "Maneki Neko", "Nom Nom"],
    "vaření — kolik a co vaříš, se z historie farmy nedá vyčíst"],
  [["Betty's Friend", "Coin Swindler", "Fruity Profit", "Forge-Ward Profits", "Fishy Fortune", "Bountiful Bounties", "Victoria's Secretary", "Chef Apron", "Goblin Crown"],
    "coiny z dodávek a prodejů — odměny jednotlivých dodávek historie neukládá"],
  [["More Axes", "More Picks", "Crime Fruit"], "jen větší zásoba nástrojů / semínek — výnos nemění, ušetří restock"],
  [["Insta-Chop", "Tap Prospector"], "jen pohodlí (jeden klik místo několika) — výnos nemění"],
  [["Reel Deal", "Ancient Rod", "Shrimp Onesie", "Royal Crab Pot", "Speed Trap", "Crab House", "Pistol Shrimp", "Crab Trap", "Ancient Shovel", "Camel", "Navigation Table"],
    "rybaření, pasti a kopání — tracker tyhle činnosti zatím neoceňuje"],
  [["Oaken", "Squirrel Onesie", "Mushroom House", "Mushroom Hat"], "žaludy / divoké houby — sběr tracker neměří"],
  [["Turd Topper", "Soil Krabby", "Knowledge Crab", "Feathery Business", "Composting Bonanza", "Composting Revamp", "Composting Overhaul"],
    "compost — denní hodnotu má jen část compost skillů (u ostatních záleží, jak často boostuješ)"],
  [["Kale Mix", "Alternate Medicine", "Barn Blueprint", "Oil Rig"], "mění recept nebo kapacitu zvířat — zatím neoceněno"],
  [["Straw House"], "compost — denní hodnotu má jen část compost skillů (u ostatních záleží, jak často boostuješ)"],
  [["Tool Hoarder"], "jen větší zásoba lopat a vrtáků — výnos nemění, ušetří restock"],
  [["Cyclops Bloom", "Pot of Luck"], "rychlejší Fish Market / poklady v poušti — tracker tyhle činnosti zatím neoceňuje"],
  [["Rooster", "Carrot Sword"], "šance na mutanta — náhodný drop bez tržní ceny"],
  [["Bee Collective", "Hornet Mask"], "šance na roj včel — jak často roj přijde, rozhoduje server"],
  [["Loyal Macaw", "Pear Turbocharge", "Gnome"], "zdvojí efekt jiného předmětu — zatím neoceněno"],
  [["Golden Sunflower"], "šance na zlato při sklizni slunečnic — zatím neoceněno"],
  [["Stick House", "Brick House", "Hercules Beetle Hat", "Duende Monument", "Spooky Bed"],
    "levnější / rychlejší expanze nebo farmhand navíc — jednorázový efekt, žádný denní výnos"],
  [["Grinx's Hammer", "Ascension Monument", "Architect Ruler", "Sol & Luna", "Dino Egg Trophy", "Genie Lamp", "Christmas Tree", "Lunar Temple", "Blossom Bonding"],
    "jednorázový nebo nepeněžní efekt — žádný denní výnos"],
];
const NO_VALUE_BY_NAME = Object.fromEntries(NO_VALUE.flatMap(([names, why]) => names.map((n) => [n, why])));
export function noValueReason(name, cats) {
  if (NO_VALUE_BY_NAME[name]) return NO_VALUE_BY_NAME[name];
  const c = cats || [];
  if (c.includes("pets")) return "mazlíčci — XP a energie mazlíčků nejsou FLOWER";
  if (c.includes("protection")) return "ochrana před sezónní katastrofou — škodu, které zabrání, nelze odhadnout";
  if (c.includes("cooking")) return "vaření — kolik a co vaříš, se z historie farmy nedá vyčíst";
  if (c.includes("coins")) return "coiny — ROADMAP je bere jako zdarma, když jich máš dost";
  return "efekt, který tracker zatím neumí ocenit";
}

/** The categories the side models add, for POWER_CATEGORIES and the page. */
export const SIDE_CATS = {
  salt: { label: "SALT", emoji: "🧂" },
  animalx: { label: "ANIMAL EXTRAS", emoji: "🐮" },
  aging: { label: "AGING & RACKS", emoji: "🐟" },
  machine: { label: "CROP MACHINE", emoji: "⚙️" },
  power: { label: "POWER SKILLS", emoji: "⚡" },
  xp: { label: "BUMPKIN XP", emoji: "⭐" },
  pigs: { label: "PIGS", emoji: "🐖" },
  cave: { label: "CAVE", emoji: "🍄" },
};

/** What the item adds at `level` (skills) / when active (items) vs without it, everything else as the farm has it. */
export function sideValue(name, ctx, level) {
  const m = SIDE_MODELS[name];
  if (!m) return null;
  const base = sideState(ctx);
  const withIt = { ...base, overrides: { [name]: m.skill ? (level != null ? level : Math.max(1, lvl(base, name))) : true } };
  const without = { ...base, overrides: { [name]: m.skill ? 0 : false } };
  return { cat: m.cat, perDay: m.net(ctx, withIt) - m.net(ctx, without) };
}

/** A skill rank's marginal: rank `level` vs rank `level − 1`. */
export function sideRankDelta(name, ctx, level) {
  const m = SIDE_MODELS[name];
  if (!m || !m.skill) return null;
  const base = sideState(ctx);
  const at = (l) => m.net(ctx, { ...base, overrides: { [name]: l } });
  return at(level) - at(level - 1);
}

/** The salt farm's net a day as the farm stands (YOUR INCOME), with what it rests on. */
export function sideSaltNow(ctx) { return saltNet(ctx, sideState(ctx)); }
