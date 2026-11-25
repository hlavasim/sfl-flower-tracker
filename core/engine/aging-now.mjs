// What to put in the Aging Shed now (the FISHING page's "DO SUDU" list).
import { FISH_MARKET_RECIPES } from "../data/fishing.mjs";
import { FISH_BASE_XP, getAgingMaxXP, getAgingSaltCost } from "../data/cooking.mjs";

const lc = (s) => String(s).toLowerCase();
const GROUPS = ["free", "surplus", "bait"];

/** The ingredient a bait needs in every season (Anchovy, Red Snapper, Tuna, Crab): never the scarce one. */
export function baitCommonIngredient(bait, recipes = FISH_MARKET_RECIPES) {
  const seasons = Object.values(recipes[bait] || {});
  if (!seasons.length) return null;
  return Object.keys(seasons[0]).find((ing) => seasons.every((r) => r[ing] > 0)) || null;
}

/**
 * Fish in the inventory, in the order to age them:
 *  - free:    no Fish Market recipe wants the fish in any season — all of it;
 *  - surplus: a recipe fish beyond `buffer` × what its scarcest HARD partner can match (the common
 *             ingredient never limits; the common one itself keeps `buffer` × what the hard ones make);
 *  - bait:    the kept rest of the recipe fish — listed only when no baits are being made.
 * Within a group: XP gained over eating it raw, per salt, highest first.
 */
export function agingNow({ owned = {}, recipes = FISH_MARKET_RECIPES, baitsWanted = true, buffer = 2 } = {}) {
  const have = {};
  for (const [k, v] of Object.entries(owned)) have[lc(k)] = (have[lc(k)] || 0) + (+v || 0);
  const H = (n) => have[lc(n)] || 0;
  // keep[fish] = the most any recipe asks to hold back, with the partner that set it
  const keep = {};
  for (const [bait, bySeason] of Object.entries(recipes)) {
    const common = baitCommonIngredient(bait, recipes);
    for (const recipe of Object.values(bySeason)) {
      const ings = Object.entries(recipe);
      const hard = ings.filter(([i]) => i !== common);
      for (const [fish, q] of ings) {
        const partners = fish === common ? hard : hard.filter(([i]) => i !== fish);
        if (!partners.length) continue;
        let make = Infinity, partner = null;
        for (const [p, pq] of partners) { const m = Math.floor(H(p) / pq); if (m < make) { make = m; partner = p; } }
        const k = buffer * q * make, cur = keep[lc(fish)];
        if (!cur || k > cur.n) keep[lc(fish)] = { n: k, partner, bait };
      }
    }
  }
  const rows = [];
  for (const [name, base] of Object.entries(FISH_BASE_XP)) {
    const qty = H(name);
    if (!(qty > 0)) continue;
    const agedXp = getAgingMaxXP(base), saltEach = getAgingSaltCost(base);
    const row = (group, age, extra = {}) => rows.push({ name, group, age, qty, agedXp, saltEach, salt: age * saltEach,
      gainPerSalt: saltEach > 0 ? (agedXp - base) / saltEach : 0, ...extra });
    const k = keep[lc(name)];
    if (!k) { row("free", qty); continue; }
    const kept = Math.min(qty, k.n), extra = { keep: k.n, partner: k.partner, bait: k.bait };
    if (qty > kept) row("surplus", qty - kept, extra);
    if (!baitsWanted && kept > 0) row("bait", kept, extra);
  }
  return rows.sort((a, b) => GROUPS.indexOf(a.group) - GROUPS.indexOf(b.group) || b.gainPerSalt - a.gainPerSalt || b.agedXp - a.agedXp);
}
