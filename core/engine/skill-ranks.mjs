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
  "Abundant Harvest":            { tier: 2, maxLevel: 3, kind: "additiveYield", ranks: [0.2, 0.35, 0.5] },
  "Acre Farm":                   { tier: 3, maxLevel: 3, kind: "yieldWithDebuff", ranks: [1, 1.4, 1.8] },
  "Ager":                        { tier: 3, maxLevel: 3, kind: "multiplier", ranks: [2, 3, 4] },
  "Bacalhau":                    { tier: 1, maxLevel: 3, kind: "additiveYield", ranks: [1, 2, 3] },
  "Barnyard Rouse":              { tier: 3, maxLevel: 3, kind: "cooldown", ranks: [432000000, 345600000, 302400000] },
  "Bee Collective":              { tier: 3, maxLevel: 3, kind: "chance", ranks: [20, 27.5, 35] },
  "Betty's Friend":              { tier: 1, maxLevel: 3, kind: "coinBonus", ranks: [0.3, 0.45, 0.6] },
  "Blooming Boost":              { tier: 1, maxLevel: 3, kind: "growthMultiplier", ranks: [0.9, 0.875, 0.85] },
  "Blossom Bonding":             { tier: 2, maxLevel: 3, kind: "flatBonus", ranks: [2, 3, 4] },
  "Bountiful Bounties":          { tier: 1, maxLevel: 3, kind: "coinBonus", ranks: [0.5, 0.75, 1] },
  "Buzzworthy Treats":           { tier: 2, maxLevel: 3, kind: "xpBonus", ranks: [0.1, 0.2, 0.3] },
  "Catchup":                     { tier: 2, maxLevel: 3, kind: "growthMultiplier", ranks: [0.9, 0.85, 0.8] },
  "Cheap Rakes":                 { tier: 1, maxLevel: 3, kind: "costMultiplier", ranks: [0.8, 0.7, 0.6] },
  "Chonky Feed":                 { tier: 3, maxLevel: 3, kind: "xpWithFeedDebuff", ranks: [2, 2.5, 3] },
  "Chonky Scarecrow":            { tier: 1, maxLevel: 3, kind: "aoe", ranks: [0, 0.05, 0.1] },
  "Clucky Grazing":              { tier: 3, maxLevel: 3, kind: "costWithDebuff", ranks: [0.75, 0.65, 0.5] },
  "Coin Swindler":               { tier: 2, maxLevel: 3, kind: "coinBonus", ranks: [0.1, 0.2, 0.3] },
  "Composting Bonanza":          { tier: 2, maxLevel: 3, kind: "flatTimeBonus", ranks: [3600000, 5400000, 7200000] },
  "Composting Overhaul":         { tier: 3, maxLevel: 3, kind: "additiveYield", ranks: [2, 5, 8] },
  "Composting Revamp":           { tier: 3, maxLevel: 3, kind: "yieldWithDebuff", ranks: [5, 8, 10] },
  "Cow-Smart Nutrition":         { tier: 3, maxLevel: 3, kind: "costWithDebuff", ranks: [0.75, 0.65, 0.5] },
  "Crime Fruit":                 { tier: 2, maxLevel: 3, kind: "stockBonus", ranks: [10, 25, 50] },
  "Crop Processor Unit":         { tier: 1, maxLevel: 3, kind: "growthWithOilDebuff", ranks: [0.95, 0.9, 0.85] },
  "Double Bale":                 { tier: 1, maxLevel: 3, kind: "multiplier", ranks: [2, 2.5, 3] },
  "Double Nom":                  { tier: 3, maxLevel: 3, kind: "doubleNom", ranks: [1, 2, 3] },
  "Drive-Through Deli":          { tier: 2, maxLevel: 3, kind: "xpBonus", ranks: [0.15, 0.2, 0.25] },
  "Efficiency Extension Module": { tier: 3, maxLevel: 3, kind: "oilReduction", ranks: [0.3, 0.4, 0.5] },
  "Efficient Bin":               { tier: 1, maxLevel: 3, kind: "additiveYield", ranks: [5, 7, 9] },
  "Efficient Feeding":           { tier: 1, maxLevel: 3, kind: "costMultiplier", ranks: [0.95, 0.94, 0.925] },
  "Experienced Farmer":          { tier: 1, maxLevel: 3, kind: "additiveYield", ranks: [0.1, 0.125, 0.15] },
  "Fast Feasts":                 { tier: 1, maxLevel: 3, kind: "timeReduction", ranks: [0.1, 0.15, 0.2] },
  "Featherweight":               { tier: 1, maxLevel: 3, kind: "yieldWithDebuff", ranks: [0.35, 0.45, 0.55] },
  "Feathery Business":           { tier: 1, maxLevel: 3, kind: "costMultiplier", ranks: [2, 1.5, 1] },
  "Feller's Discount":           { tier: 2, maxLevel: 3, kind: "costMultiplier", ranks: [0.8, 0.75, 0.7] },
  "Ferrous Favor":               { tier: 3, maxLevel: 3, kind: "yieldWithDebuff", ranks: [1, 1.5, 2] },
  "Field Expansion Module":      { tier: 3, maxLevel: 3, kind: "flatBonus", ranks: [5, 7, 10] },
  "Field Extension Module":      { tier: 3, maxLevel: 3, kind: "flatBonus", ranks: [5, 7, 10] },
  "Fiery Jackpot":               { tier: 3, maxLevel: 3, kind: "chance", ranks: [20, 35, 50] },
  "Fine Fibers":                 { tier: 1, maxLevel: 3, kind: "additiveYield", ranks: [0.1, 0.15, 0.2] },
  "Fire Kissed":                 { tier: 2, maxLevel: 3, kind: "additiveYield", ranks: [1, 1.35, 1.75] },
  "Fireside Alchemist":          { tier: 3, maxLevel: 3, kind: "growthMultiplier", ranks: [0.85, 0.75, 0.6] },
  "Fish Smoking":                { tier: 2, maxLevel: 3, kind: "multiplier", ranks: [2, 3, 4] },
  "Fisherman's 10 Fold":         { tier: 2, maxLevel: 3, kind: "dailyLimit", ranks: [10, 18, 25] },
  "Fisherman's 5 Fold":          { tier: 1, maxLevel: 3, kind: "dailyLimit", ranks: [5, 7, 10] },
  "Fishy Chance":                { tier: 1, maxLevel: 3, kind: "chance", ranks: [10, 12.5, 15] },
  "Fishy Feast":                 { tier: 3, maxLevel: 3, kind: "xpBonus", ranks: [0.2, 0.3, 0.4] },
  "Fishy Fortune":               { tier: 2, maxLevel: 3, kind: "coinBonus", ranks: [1, 1.25, 1.5] },
  "Fishy Gamble":                { tier: 2, maxLevel: 3, kind: "chance", ranks: [20, 25, 30] },
  "Fishy Roll":                  { tier: 1, maxLevel: 3, kind: "chance", ranks: [10, 12.5, 15] },
  "Flower Power":                { tier: 3, maxLevel: 3, kind: "growthMultiplier", ranks: [0.8, 0.7, 0.6] },
  "Flower Sale":                 { tier: 1, maxLevel: 3, kind: "costMultiplier", ranks: [0.8, 0.75, 0.7] },
  "Flowery Abode":               { tier: 3, maxLevel: 3, kind: "rateWithGrowthDebuff", ranks: [0.5, 0.75, 1] },
  "Forge-Ward Profits":          { tier: 1, maxLevel: 3, kind: "coinBonus", ranks: [0.2, 0.3, 0.4] },
  "Frenzied Fish":               { tier: 3, maxLevel: 3, kind: "frenziedFish", ranks: [1, 2, 3] },
  "Frosted Cakes":               { tier: 2, maxLevel: 3, kind: "timeReduction", ranks: [0.1, 0.2, 0.3] },
  "Frugal Miner":                { tier: 2, maxLevel: 3, kind: "costMultiplier", ranks: [0.8, 0.7, 0.6] },
  "Fruitful Bounty":             { tier: 2, maxLevel: 3, kind: "multiplier", ranks: [2, 3, 4] },
  "Fruitful Fumble":             { tier: 1, maxLevel: 3, kind: "additiveYield", ranks: [0.1, 0.15, 0.2] },
  "Fruity Heaven":               { tier: 1, maxLevel: 3, kind: "costMultiplier", ranks: [0.9, 0.85, 0.8] },
  "Fruity Profit":               { tier: 1, maxLevel: 3, kind: "coinBonus", ranks: [0.5, 0.75, 1] },
  "Fruity Woody":                { tier: 2, maxLevel: 3, kind: "additiveYield", ranks: [1, 1.25, 1.5] },
  "Fry Frenzy":                  { tier: 3, maxLevel: 3, kind: "timeReduction", ranks: [0.6, 0.65, 0.7] },
  "Generous Orchard":            { tier: 3, maxLevel: 3, kind: "chance", ranks: [20, 30, 50] },
  "Glass Room":                  { tier: 1, maxLevel: 3, kind: "additiveYield", ranks: [0.1, 0.15, 0.2] },
  "Golden Sunflower":            { tier: 2, maxLevel: 3, kind: "dropChance", ranks: [0.14285714285714285, 0.18181818181818182, 0.25] },
  "Golden Touch":                { tier: 3, maxLevel: 3, kind: "additiveYield", ranks: [0.5, 0.75, 1] },
  "Grease Lightning":            { tier: 3, maxLevel: 3, kind: "cooldown", ranks: [345600000, 302400000, 259200000] },
  "Greasy Plants":               { tier: 3, maxLevel: 3, kind: "yieldWithOilDebuff", ranks: [1, 1.5, 2] },
  "Green Thumb":                 { tier: 1, maxLevel: 3, kind: "growthMultiplier", ranks: [0.95, 0.94, 0.925] },
  "Greenhouse Gamble":           { tier: 3, maxLevel: 3, kind: "chance", ranks: [30, 40, 50] },
  "Greenhouse Guru":             { tier: 3, maxLevel: 3, kind: "cooldown", ranks: [345600000, 302400000, 259200000] },
  "Healthy Livestock":           { tier: 2, maxLevel: 3, kind: "sicknessWithSpread", ranks: [0.5, 0.5, 0.5] },
  "Heartwarming Instruments":    { tier: 2, maxLevel: 3, kind: "xpBonus", ranks: [0.5, 0.6, 0.7] },
  "Hectare Farm":                { tier: 3, maxLevel: 3, kind: "yieldWithDebuff", ranks: [1, 1.4, 1.8] },
  "Horror Mike":                 { tier: 2, maxLevel: 3, kind: "aoe", ranks: [0.1, 0.15, 0.2] },
  "Hyper Bees":                  { tier: 1, maxLevel: 3, kind: "productionRate", ranks: [0.1, 0.15, 0.2] },
  "Instant Gratification":       { tier: 3, maxLevel: 3, kind: "cooldown", ranks: [345600000, 302400000, 259200000] },
  "Instant Growth":              { tier: 3, maxLevel: 3, kind: "cooldown", ranks: [259200000, 216000000, 172800000] },
  "Iron Bumpkin":                { tier: 1, maxLevel: 3, kind: "additiveYield", ranks: [0.1, 0.15, 0.2] },
  "Iron Hustle":                 { tier: 2, maxLevel: 3, kind: "growthMultiplier", ranks: [0.7, 0.65, 0.6] },
  "Juicy Boost":                 { tier: 2, maxLevel: 3, kind: "xpBonus", ranks: [0.1, 0.2, 0.3] },
  "Kale Mix":                    { tier: 2, maxLevel: 3, kind: "flatBonus", ranks: [3, 2.5, 2] },
  "Laurie's Gains":              { tier: 2, maxLevel: 3, kind: "aoe", ranks: [0.1, 0.15, 0.2] },
  "Leak-Proof Tank":             { tier: 1, maxLevel: 3, kind: "multiplier", ranks: [3, 4, 5] },
  "Leathercraft Mastery":        { tier: 3, maxLevel: 3, kind: "yieldWithDebuff", ranks: [0.35, 0.6, 0.8] },
  "Long Pickings":               { tier: 3, maxLevel: 3, kind: "growthWithDebuff", ranks: [0.75, 0.65, 0.55] },
  "Loyal Macaw":                 { tier: 1, maxLevel: 3, kind: "additiveYield", ranks: [0.2, 0.25, 0.3] },
  "Lumberjack's Extra":          { tier: 1, maxLevel: 3, kind: "additiveYield", ranks: [0.1, 0.15, 0.2] },
  "Merino Whisperer":            { tier: 2, maxLevel: 3, kind: "yieldWithDebuff", ranks: [0.35, 0.6, 0.9] },
  "Midas Rush":                  { tier: 3, maxLevel: 3, kind: "growthMultiplier", ranks: [0.8, 0.75, 0.7] },
  "Midas Sprint":                { tier: 2, maxLevel: 3, kind: "growthMultiplier", ranks: [0.9, 0.875, 0.85] },
  "Money Tree":                  { tier: 2, maxLevel: 3, kind: "chance", ranks: [1, 2, 3] },
  "More Axes":                   { tier: 1, maxLevel: 3, kind: "stockBonus", ranks: [50, 100, 150] },
  "More Picks":                  { tier: 3, maxLevel: 3, kind: "stockBonus", ranks: [70, 140, 280] },
  "More With Less":              { tier: 3, maxLevel: 3, kind: "dailyLimit", ranks: [10, 25, 50] },
  "Munching Mastery":            { tier: 1, maxLevel: 3, kind: "xpBonus", ranks: [0.05, 0.075, 0.1] },
  "No Axe No Worries":           { tier: 1, maxLevel: 3, kind: "flatDebuff", ranks: [1, 0.9, 0.8] },
  "Nom Nom":                     { tier: 1, maxLevel: 3, kind: "coinBonus", ranks: [0.1, 0.3, 0.5] },
  "Oil Be Back":                 { tier: 2, maxLevel: 3, kind: "growthMultiplier", ranks: [0.8, 0.7, 0.6] },
  "Oil Extraction":              { tier: 1, maxLevel: 3, kind: "additiveYield", ranks: [1, 1.5, 2] },
  "Oil Gadget":                  { tier: 1, maxLevel: 3, kind: "oilReduction", ranks: [0.1, 0.15, 0.2] },
  "Oil Rig":                     { tier: 2, maxLevel: 3, kind: "flatBonus", ranks: [] },
  "Old Farmer":                  { tier: 1, maxLevel: 3, kind: "additiveYield", ranks: [0.1, 0.125, 0.15] },
  "Olive Express":               { tier: 2, maxLevel: 3, kind: "growthMultiplier", ranks: [0.9, 0.85, 0.8] },
  "Pear Turbocharge":            { tier: 2, maxLevel: 3, kind: "multiplier", ranks: [2, 3, 4] },
  "Petal Blessed":               { tier: 3, maxLevel: 3, kind: "cooldown", ranks: [345600000, 302400000, 259200000] },
  "Petalled Perk":               { tier: 2, maxLevel: 3, kind: "chance", ranks: [10, 17.5, 25] },
  "Pollen Power Up":             { tier: 2, maxLevel: 3, kind: "additiveYield", ranks: [0.1, 0.15, 0.2] },
  "Premium Worms":               { tier: 2, maxLevel: 3, kind: "additiveYield", ranks: [10, 15, 20] },
  "Rapid Rig":                   { tier: 2, maxLevel: 3, kind: "growthWithOilDebuff", ranks: [0.8, 0.7, 0.6] },
  "Reel Deal":                   { tier: 1, maxLevel: 3, kind: "costMultiplier", ranks: [0.5, 0.45, 0.4] },
  "Refiner":                     { tier: 2, maxLevel: 3, kind: "chance", ranks: [15, 25, 35] },
  "Restless Animals":            { tier: 1, maxLevel: 3, kind: "growthMultiplier", ranks: [0.9, 0.85, 0.8] },
  "Rice and Shine":              { tier: 1, maxLevel: 3, kind: "growthMultiplier", ranks: [0.95, 0.94, 0.925] },
  "Rice Rocket":                 { tier: 2, maxLevel: 3, kind: "growthMultiplier", ranks: [0.9, 0.85, 0.8] },
  "Rock'N'Roll":                 { tier: 1, maxLevel: 3, kind: "additiveYield", ranks: [0.1, 0.15, 0.2] },
  "Rocky Favor":                 { tier: 2, maxLevel: 3, kind: "yieldWithDebuff", ranks: [1, 1.4, 1.8] },
  "Salt Surge":                  { tier: 3, maxLevel: 3, kind: "cooldown", ranks: [259200000, 216000000, 172800000] },
  "Salty Seas":                  { tier: 1, maxLevel: 3, kind: "growthMultiplier", ranks: [0.9, 0.85, 0.8] },
  "Sea Blessed":                 { tier: 2, maxLevel: 3, kind: "chance", ranks: [5, 6.5, 8] },
  "Seeded Bounty":               { tier: 2, maxLevel: 3, kind: "additiveYield", ranks: [0.5, 0.75, 1] },
  "Seedy Business":              { tier: 1, maxLevel: 3, kind: "costMultiplier", ranks: [0.85, 0.8, 0.75] },
  "Sheepwise Diet":              { tier: 3, maxLevel: 3, kind: "costWithDebuff", ranks: [0.75, 0.65, 0.5] },
  "Short Pickings":              { tier: 3, maxLevel: 3, kind: "growthWithDebuff", ranks: [0.75, 0.65, 0.55] },
  "Slick Saver":                 { tier: 3, maxLevel: 3, kind: "flatReduction", ranks: [1, 1.5, 2] },
  "Speed Miner":                 { tier: 1, maxLevel: 3, kind: "growthMultiplier", ranks: [0.8, 0.75, 0.7] },
  "Speedy Aging":                { tier: 1, maxLevel: 3, kind: "growthMultiplier", ranks: [0.9, 0.85, 0.8] },
  "Strong Roots":                { tier: 2, maxLevel: 3, kind: "growthMultiplier", ranks: [0.9, 0.875, 0.85] },
  "Sweet Bonus":                 { tier: 1, maxLevel: 3, kind: "additiveYield", ranks: [0.1, 0.15, 0.2] },
  "Swift Decomposer":            { tier: 2, maxLevel: 3, kind: "growthMultiplier", ranks: [0.9, 0.875, 0.85] },
  "Swift Sizzle":                { tier: 1, maxLevel: 3, kind: "timeReduction", ranks: [0.4, 0.45, 0.5] },
  "Tough Tree":                  { tier: 2, maxLevel: 3, kind: "chance", ranks: [10, 20, 30] },
  "Tree Blitz":                  { tier: 3, maxLevel: 3, kind: "cooldown", ranks: [86400000, 64800000, 43200000] },
  "Tree Charge":                 { tier: 1, maxLevel: 3, kind: "growthMultiplier", ranks: [0.9, 0.875, 0.85] },
  "Tree Turnaround":             { tier: 3, maxLevel: 3, kind: "chance", ranks: [15, 25, 35] },
  "Turbo Charged":               { tier: 1, maxLevel: 3, kind: "additiveYield", ranks: [5, 7, 9] },
  "Turbo Fry":                   { tier: 2, maxLevel: 3, kind: "timeReduction", ranks: [0.5, 0.55, 0.6] },
  "Victoria's Secretary":        { tier: 1, maxLevel: 3, kind: "coinBonus", ranks: [0.5, 0.75, 1] },
  "Vine Velocity":               { tier: 2, maxLevel: 3, kind: "growthMultiplier", ranks: [0.9, 0.85, 0.8] },
  "Wide Rakes":                  { tier: 1, maxLevel: 3, kind: "additiveYield", ranks: [2, 3, 4] },
  "Wormy Treat":                 { tier: 1, maxLevel: 3, kind: "additiveYield", ranks: [1, 2, 3] },
  "Young Farmer":                { tier: 1, maxLevel: 3, kind: "additiveYield", ranks: [0.1, 0.125, 0.15] },
  "Zesty Vibes":                 { tier: 3, maxLevel: 3, kind: "yieldWithDebuff", ranks: [1, 1.5, 2] },
};

// Verified against getSkillUpgradeCost + UPGRADE_POINTS_BY_TIER (bumpkinSkills.ts, 2026-08-03):
// points are 1 / 3 / 6 by tier — NOT tier x 3, which overcharged every rank-up ("Je to 1-3-6").
// Shards equal the tier.
function skillUpgradeCost(tier) { return { shards: tier, points: { 1: 1, 2: 3, 3: 6 }[tier] || 0 }; }

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
function powerSkillRankVals(b, catId, product, capacity, p2pPrices, allCatBoosts, isOwned, effMode) {
  if (!b || b.type !== "Skill" || typeof SKILL_UPGRADES === "undefined") return null;
  const up = SKILL_UPGRADES[b.name];
  if (!up || !up.ranks || !(up.maxLevel > 1)) return null;
  const cost = skillUpgradeCost(up.tier);
  const priceable = SKILL_RANK_PRICEABLE.indexOf(up.kind) >= 0;
  const out = { up, cost, priceable, rows: [] };
  if (!priceable) { for (let lvl = 2; lvl <= up.maxLevel; lvl++) out.rows.push({ lvl, delta: 0, shards: cost.shards, points: cost.points }); return out; }
  const valAt = (lvl) => {
    const f = skillRankFactor(up, lvl);
    /*
     * Scale whichever field carries the rank's magnitude. `value` covers most effects, but
     * chance effects carry it in `pct` (chance {pct, extra}, coin_chance {pct, coins}) — the
     * rank raises the CHANCE, the payout stays — and scaling only `value` made every chance
     * skill's ranks (Money Tree, Greenhouse Gamble, Fishy Chance…) compute a delta of exactly 0.
     */
    const scale = (e) => {
      if (typeof e.value === "number") return Object.assign({}, e, { value: e.value * f });
      if (typeof e.pct === "number") return Object.assign({}, e, { pct: e.pct * f });
      return e;
    };
    const sb = Object.assign({}, b, { effects: (b.effects || []).map(scale) });
    try { const v = calcBoostValue(sb, catId, product, capacity, p2pPrices, allCatBoosts, isOwned, effMode); return (v && isFinite(v.synergy)) ? v.synergy : 0; } catch (e) { return 0; }
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
      case "cooldown": return +(x / 3600000).toFixed(1) + "h cooldown";
      case "flatBonus": return "+" + x;
      case "chance": return x + "% chance";
      case "additiveYield": return "+" + x + " yield";
      default: return "+" + x;
    }
  };
  // Bespoke effect shapes (per-item stock tables, buff/debuff pairs) may carry no scalar
  // magnitude for a rank; the ladder still shows, just without a number.
  if (up.ranks[lvl - 1] == null || up.ranks[lvl - 2] == null) return "Level " + lvl;
  return "Level " + lvl + ": " + f(up.ranks[lvl - 1]) + " (was " + f(up.ranks[lvl - 2]) + ")";
}

export {
  SKILL_UPGRADES, SKILL_RANK_PRICEABLE,
  skillUpgradeCost, skillRankMag, skillRankFactor, skillRankText, powerSkillRankVals,
};
