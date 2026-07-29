// Ascension skill RANKS (Level 2 / Level 3) — ported out of flowers.html so the value is
// computed ONCE, in core, and served by the API. It used to exist inline only, which is why a
// second consumer had nothing to reuse and reached for a different engine instead: the roadmap
// panel priced Frugal Miner at +10.00/day against the Power page's +0.31/day.
//
// Nothing here re-implements valuation. powerSkillRankVals re-runs calcBoostValue with the
// skill's effects scaled to each rank's magnitude, so a rank row is the same engine's answer to
// "what if this boost were stronger", and the marginal of a rank-up is the difference between
// two of those answers. The table and the helper bodies are copied verbatim from the page.
import { calcBoostValue } from "./roadmap.mjs";

const SKILL_UPGRADES = {
  "Betty's Friend":          { tier: 1, maxLevel: 3, kind: "coinBonus",       ranks: [0.3, 0.45, 0.6] },
  "Coin Swindler":           { tier: 2, maxLevel: 3, kind: "coinBonus",       ranks: [0.1, 0.2, 0.3] },
  "Drive-Through Deli":      { tier: 2, maxLevel: 3, kind: "xpBonus",         ranks: [0.15, 0.2, 0.25] },
  "Efficiency Extension Module": { tier: 3, maxLevel: 3, kind: "oilReduction",    ranks: [0.3, 0.4, 0.5] },
  "Experienced Farmer":      { tier: 1, maxLevel: 3, kind: "additiveYield",   ranks: [0.1, 0.125, 0.15] },
  "Fast Feasts":             { tier: 1, maxLevel: 3, kind: "timeReduction",   ranks: [0.1, 0.15, 0.2] },
  "Feller's Discount":       { tier: 2, maxLevel: 3, kind: "costMultiplier",  ranks: [0.8, 0.75, 0.7] },
  "Field Expansion Module":  { tier: 3, maxLevel: 3, kind: "flatBonus",       ranks: [5, 7, 10] },
  "Field Extension Module":  { tier: 3, maxLevel: 3, kind: "flatBonus",       ranks: [5, 7, 10] },
  "Fiery Jackpot":           { tier: 3, maxLevel: 3, kind: "chance",          ranks: [20, 35, 50] },
  "Fire Kissed":             { tier: 2, maxLevel: 3, kind: "additiveYield",   ranks: [1, 1.35, 1.75] },
  "Fireside Alchemist":      { tier: 3, maxLevel: 3, kind: "growthMultiplier", ranks: [0.85, 0.75, 0.6] },
  "Fisherman's 10 Fold":     { tier: 2, maxLevel: 3, kind: "dailyLimit",      ranks: [10, 18, 25] },
  "Fisherman's 5 Fold":      { tier: 1, maxLevel: 3, kind: "dailyLimit",      ranks: [5, 7, 10] },
  "Fishy Chance":            { tier: 1, maxLevel: 3, kind: "chance",          ranks: [10, 12.5, 15] },
  "Fishy Feast":             { tier: 3, maxLevel: 3, kind: "xpBonus",         ranks: [0.2, 0.3, 0.4] },
  "Fishy Fortune":           { tier: 2, maxLevel: 3, kind: "coinBonus",       ranks: [1, 1.25, 1.5] },
  "Fishy Gamble":            { tier: 2, maxLevel: 3, kind: "chance",          ranks: [20, 25, 30] },
  "Fishy Roll":              { tier: 1, maxLevel: 3, kind: "chance",          ranks: [10, 12.5, 15] },
  "Forge-Ward Profits":      { tier: 1, maxLevel: 3, kind: "coinBonus",       ranks: [0.2, 0.3, 0.4] },
  "Frosted Cakes":           { tier: 2, maxLevel: 3, kind: "timeReduction",   ranks: [0.1, 0.2, 0.3] },
  "Frugal Miner":            { tier: 2, maxLevel: 3, kind: "costMultiplier",  ranks: [0.8, 0.7, 0.6] },
  "Fruitful Fumble":         { tier: 1, maxLevel: 3, kind: "additiveYield",   ranks: [0.1, 0.15, 0.2] },
  "Fruity Heaven":           { tier: 1, maxLevel: 3, kind: "costMultiplier",  ranks: [0.9, 0.85, 0.8] },
  "Fruity Profit":           { tier: 1, maxLevel: 3, kind: "coinBonus",       ranks: [0.5, 0.75, 1] },
  "Fruity Woody":            { tier: 2, maxLevel: 3, kind: "additiveYield",   ranks: [1, 1.5, 2] },
  "Fry Frenzy":              { tier: 3, maxLevel: 3, kind: "timeReduction",   ranks: [0.6, 0.65, 0.7] },
  "Generous Orchard":        { tier: 3, maxLevel: 3, kind: "chance",          ranks: [20, 30, 50] },
  "Glass Room":              { tier: 1, maxLevel: 3, kind: "additiveYield",   ranks: [0.1, 0.15, 0.2] },
  "Golden Touch":            { tier: 3, maxLevel: 3, kind: "additiveYield",   ranks: [0.5, 0.75, 1] },
  "Green Thumb":             { tier: 1, maxLevel: 3, kind: "growthMultiplier", ranks: [0.95, 0.94, 0.925] },
  "Greenhouse Gamble":       { tier: 3, maxLevel: 3, kind: "chance",          ranks: [25, 35, 45] },
  "Iron Bumpkin":            { tier: 1, maxLevel: 3, kind: "additiveYield",   ranks: [0.1, 0.15, 0.2] },
  "Iron Hustle":             { tier: 2, maxLevel: 3, kind: "growthMultiplier", ranks: [0.7, 0.65, 0.6] },
  "Juicy Boost":             { tier: 2, maxLevel: 3, kind: "xpBonus",         ranks: [0.1, 0.2, 0.3] },
  "Leak-Proof Tank":         { tier: 1, maxLevel: 3, kind: "multiplier",      ranks: [3, 4, 5] },
  "Lumberjack's Extra":      { tier: 1, maxLevel: 3, kind: "additiveYield",   ranks: [0.1, 0.15, 0.2] },
  "Midas Rush":              { tier: 3, maxLevel: 3, kind: "growthMultiplier", ranks: [0.8, 0.75, 0.7] },
  "Midas Sprint":            { tier: 2, maxLevel: 3, kind: "growthMultiplier", ranks: [0.9, 0.875, 0.85] },
  "Money Tree":              { tier: 2, maxLevel: 3, kind: "chance",          ranks: [1, 2, 3] },
  "More With Less":          { tier: 3, maxLevel: 3, kind: "dailyLimit",      ranks: [10, 25, 50] },
  "Munching Mastery":        { tier: 1, maxLevel: 3, kind: "xpBonus",         ranks: [0.05, 0.075, 0.1] },
  "No Axe No Worries":       { tier: 1, maxLevel: 3, kind: "flatDebuff",      ranks: [1, 0.75, 0.5] },
  "Nom Nom":                 { tier: 1, maxLevel: 3, kind: "coinBonus",       ranks: [0.1, 0.3, 0.5] },
  "Oil Be Back":             { tier: 2, maxLevel: 3, kind: "growthMultiplier", ranks: [0.8, 0.7, 0.6] },
  "Oil Extraction":          { tier: 1, maxLevel: 3, kind: "additiveYield",   ranks: [1, 1.5, 2] },
  "Oil Gadget":              { tier: 1, maxLevel: 3, kind: "oilReduction",    ranks: [0.1, 0.15, 0.2] },
  "Old Farmer":              { tier: 1, maxLevel: 3, kind: "additiveYield",   ranks: [0.1, 0.125, 0.15] },
  "Olive Express":           { tier: 2, maxLevel: 3, kind: "growthMultiplier", ranks: [0.9, 0.85, 0.8] },
  "Pear Turbocharge":        { tier: 2, maxLevel: 3, kind: "multiplier",      ranks: [2, 3, 4] },
  "Reel Deal":               { tier: 1, maxLevel: 3, kind: "costMultiplier",  ranks: [0.5, 0.45, 0.4] },
  "Rice Rocket":             { tier: 2, maxLevel: 3, kind: "growthMultiplier", ranks: [0.9, 0.85, 0.8] },
  "Rice and Shine":          { tier: 1, maxLevel: 3, kind: "growthMultiplier", ranks: [0.95, 0.94, 0.925] },
  "Rock'N'Roll":             { tier: 1, maxLevel: 3, kind: "additiveYield",   ranks: [0.1, 0.15, 0.2] },
  "Seedy Business":          { tier: 1, maxLevel: 3, kind: "costMultiplier",  ranks: [0.85, 0.8, 0.75] },
  "Slick Saver":             { tier: 3, maxLevel: 3, kind: "flatReduction",   ranks: [1, 1.5, 2] },
  "Speed Miner":             { tier: 1, maxLevel: 3, kind: "growthMultiplier", ranks: [0.8, 0.75, 0.7] },
  "Strong Roots":            { tier: 2, maxLevel: 3, kind: "growthMultiplier", ranks: [0.9, 0.875, 0.85] },
  "Swift Sizzle":            { tier: 1, maxLevel: 3, kind: "timeReduction",   ranks: [0.4, 0.45, 0.5] },
  "Tough Tree":              { tier: 2, maxLevel: 3, kind: "chance",          ranks: [10, 20, 30] },
  "Tree Charge":             { tier: 1, maxLevel: 3, kind: "growthMultiplier", ranks: [0.9, 0.875, 0.85] },
  "Tree Turnaround":         { tier: 3, maxLevel: 3, kind: "chance",          ranks: [15, 25, 40] },
  "Turbo Fry":               { tier: 2, maxLevel: 3, kind: "timeReduction",   ranks: [0.5, 0.55, 0.6] },
  "Victoria's Secretary":    { tier: 1, maxLevel: 3, kind: "coinBonus",       ranks: [0.5, 0.75, 1] },
  "Vine Velocity":           { tier: 2, maxLevel: 3, kind: "growthMultiplier", ranks: [0.9, 0.85, 0.8] },
  "Young Farmer":            { tier: 1, maxLevel: 3, kind: "additiveYield",   ranks: [0.1, 0.125, 0.15] },
};

function skillUpgradeCost(tier) { return { shards: tier, points: tier * 3 }; }

// growthMultiplier / costMultiplier store the REMAINING fraction (0.95 = -5%), so the magnitude
// that matters is the reduction (1 - v). Every other kind stores the magnitude directly.
function skillRankMag(kind, v) { return (kind === "growthMultiplier" || kind === "costMultiplier") ? (1 - v) : v; }

function skillRankFactor(up, rank) {
  const r = up && up.ranks; if (!r || rank < 1 || rank > r.length) return 1;
  const base = skillRankMag(up.kind, r[0]);
  if (!(Math.abs(base) > 1e-9)) return 1;
  return skillRankMag(up.kind, r[rank - 1]) / base;
}

// Kinds whose magnitude maps onto an effect our value engine already prices.
const SKILL_RANK_PRICEABLE = ["additiveYield", "growthMultiplier", "costMultiplier", "coinBonus", "flatDebuff", "oilReduction", "multiplier", "flatReduction", "chance"];

// Per-rank value of a skill for ONE category. rows[] = the MARGINAL of each rank-up.
function powerSkillRankVals(b, catId, product, capacity, p2pPrices, allCatBoosts, isOwned) {
  if (!b || b.type !== "Skill" || typeof SKILL_UPGRADES === "undefined") return null;
  const up = SKILL_UPGRADES[b.name];
  if (!up || !up.ranks || !(up.maxLevel > 1)) return null;
  const cost = skillUpgradeCost(up.tier);
  const priceable = SKILL_RANK_PRICEABLE.indexOf(up.kind) >= 0;
  const out = { up, cost, priceable, rows: [] };
  if (!priceable) { for (let lvl = 2; lvl <= up.maxLevel; lvl++) out.rows.push({ lvl, delta: 0, shards: cost.shards, points: cost.points }); return out; }
  const valAt = (lvl) => {
    const f = skillRankFactor(up, lvl);
    const sb = Object.assign({}, b, { effects: (b.effects || []).map(e => (typeof e.value === "number") ? Object.assign({}, e, { value: e.value * f }) : e) });
    try { const v = calcBoostValue(sb, catId, product, capacity, p2pPrices, allCatBoosts, isOwned); return (v && isFinite(v.synergy)) ? v.synergy : 0; } catch (e) { return 0; }
  };
  let prev = valAt(1);
  for (let lvl = 2; lvl <= up.maxLevel; lvl++) { const v = valAt(lvl); out.rows.push({ lvl, delta: v - prev, shards: cost.shards, points: cost.points }); prev = v; }
  return out;
}

// Human text for what a rank changes, e.g. "Level 2: -6% growth time (was -5%)".
function skillRankText(up, lvl) {
  const f = (x) => {
    switch (up.kind) {
      case "growthMultiplier": return "−" + (+((1 - x) * 100).toFixed(2)) + "% growth time";
      case "costMultiplier": return "−" + (+((1 - x) * 100).toFixed(2)) + "% cost";
      case "coinBonus": return "+" + (+(x * 100).toFixed(0)) + "% coins";
      case "xpBonus": return "+" + (+(x * 100).toFixed(0)) + "% XP";
      case "timeReduction": return "−" + (+(x * 100).toFixed(0)) + "% time";
      case "oilReduction": return "−" + (+(x * 100).toFixed(0)) + "% oil";
      case "multiplier": return x + "× effect";
      case "flatDebuff": return "debuff " + x;
      case "flatReduction": return "−" + x;
      case "dailyLimit": return "+" + x + " daily limit";
      case "flatBonus": return "+" + x;
      case "chance": return x + "% chance";
      case "additiveYield": return "+" + x + " yield";
      default: return "+" + x;
    }
  };
  return "Level " + lvl + ": " + f(up.ranks[lvl - 1]) + " (was " + f(up.ranks[lvl - 2]) + ")";
}

export {
  SKILL_UPGRADES, SKILL_RANK_PRICEABLE,
  skillUpgradeCost, skillRankMag, skillRankFactor, skillRankText, powerSkillRankVals,
};
