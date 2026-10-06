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
const XP_ITEMS = { "Observatory": 1.05, "Golden Spatula": 1.1, "Pan": 1.25 };
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
  // crop machine
  ...Object.fromEntries(MACHINE_SKILLS.map((n) => [n, { cat: "machine", net: machineNet, skill: true, maxLevel: /^Crop Extension/.test(n) ? 1 : 3 }])),
  // bumpkin XP
  "Observatory": { cat: "xp", net: xpNet },
  "Golden Spatula": { cat: "xp", net: xpNet },
  "Pan": { cat: "xp", net: xpNet },
  "Munching Mastery": { cat: "xp", net: xpNet, skill: true, maxLevel: 3 },
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
  [["Rooster", "Carrot Sword"], "šance na mutanta — náhodný drop bez tržní ceny"],
  [["Bee Collective", "Hornet Mask"], "šance na roj včel — jak často roj přijde, rozhoduje server"],
  [["Loyal Macaw", "Pear Turbocharge", "Gnome"], "zdvojí efekt jiného předmětu — zatím neoceněno"],
  [["Golden Sunflower"], "šance na zlato při sklizni slunečnic — zatím neoceněno"],
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
