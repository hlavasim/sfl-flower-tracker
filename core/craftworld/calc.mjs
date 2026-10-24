/*
 * CRAFT WORLD — the arithmetic behind the /craftworld page. Pure functions over:
 *   factories  core/craftworld/factories.json (.factories), every factory with all its levels
 *              (output, duration, power, XP, inputs, upgrade cost) — the game's data via RAWRTools
 *   prices     { SYMBOL: price in COIN } from the Katana RESOURCE/COIN pools
 *   base       the owner's base as transcribed from screenshots: { buildings: [{ slug, level }] }
 *
 * The in-game Exchange charges 2.5 % a trade, so turning an input into an output by trading
 * (sell input, buy output) costs ~5 %, against which crafting is measured.
 */

export const EXCHANGE_FEE = 0.025;

/*
 * Masterpiece contribution: the power cost of each unit rises by tier within a reset window
 * (Iron Clash II screenshot 2026-10-24: 5 / 7 / 13 / 25 / 50 power, tiers at 50 / 250 / 625 / 1,300).
 */
export const MASTERPIECE_TIERS = [
  { upTo: 50, power: 5 }, { upTo: 250, power: 7 }, { upTo: 625, power: 13 }, { upTo: 1300, power: 25 }, { upTo: Infinity, power: 50 },
];

const sym = (s) => String(s || "").toUpperCase().replace(/\s+/g, "");

/** COIN value of a list of { symbol, amount }; null when any price is missing. */
export function bagValue(bag, prices) {
  let v = 0;
  for (const x of bag || []) {
    const p = prices[sym(x.symbol)];
    if (p == null) return null;
    v += x.amount * p;
  }
  return v;
}

/** The output symbol of a factory: its own name as the market spells it (Paper Wrap -> PAPERWRAP). */
export const outputSymbol = (factory) => sym(factory.name);

/**
 * One factory level, valued:
 *   ratio       output value ÷ input value (> 1: crafting adds value)
 *   lossPerDay  COIN destroyed per day by crafting (negative = gained)
 *   xpPerPower  XP per unit of power
 *   xpPerCoin   XP per COIN lost (Infinity when crafting gains)
 *   verdict     what to do with the output: "craft" | "either" | "buy"
 */
export function levelEconomics(factory, lv, prices) {
  const L = factory.levels.find((x) => x.level === lv) || factory.levels[0];
  const outP = prices[outputSymbol(factory)];
  const inV = bagValue(L.inputs, prices);
  const outV = outP == null ? null : L.output * outP;
  const runsPerDay = L.output ? L.productionPerDay / L.output : 0;
  const ratio = inV && outV != null ? outV / inV : null;
  const lossPerDay = inV != null && outV != null ? runsPerDay * (inV - outV) : null;
  const xpPerPower = L.powerCost ? (L.xpPerOutput * L.output) / L.powerCost : null;
  const xpPerCoin = lossPerDay == null ? null : lossPerDay <= 0 ? Infinity : L.xpPerDay / lossPerDay;
  // Trading the input for the output costs two fees; crafting is worth it while it loses less.
  const tradeRatio = (1 - EXCHANGE_FEE) / (1 + EXCHANGE_FEE);
  const verdict = ratio == null ? null : ratio >= 1 ? "craft" : ratio >= tradeRatio ? "either" : "buy";
  return { level: L.level, ratio, lossPerDay, xpPerDay: L.xpPerDay, xpPerPower, xpPerCoin, verdict, inV, outV, runsPerDay };
}

/** Every factory at level 1 (or the owned level), valued — the market table. */
export function marketTable(factories, prices, base) {
  const owned = Object.fromEntries((base && base.buildings || []).map((b) => [b.slug, b.level]));
  return Object.entries(factories)
    .map(([slug, f]) => ({ slug, name: f.name, owned: slug in owned, ...levelEconomics(f, owned[slug] || 1, prices) }))
    .filter((r) => r.ratio != null)
    .sort((a, b) => b.ratio - a.ratio);
}

/** XP sources the owner has, best XP per COIN lost first. */
export function xpSources(factories, prices, base) {
  return (base && base.buildings || [])
    .filter((b) => factories[b.slug])
    .map((b) => ({ slug: b.slug, name: factories[b.slug].name, level: b.level || 1, ...levelEconomics(factories[b.slug], b.level || 1, prices) }))
    .sort((a, b) => (b.xpPerCoin ?? -1) - (a.xpPerCoin ?? -1));
}

/**
 * Next upgrade of every owned factory: its cost in COIN, the XP/day and production/day it adds,
 * and XP/day gained per COIN spent — the order to upgrade in when levelling is the goal.
 */
export function upgradePlan(factories, prices, base) {
  const out = [];
  for (const b of base && base.buildings || []) {
    const f = factories[b.slug];
    if (!f || !b.level) continue;
    const cur = f.levels.find((x) => x.level === b.level), next = f.levels.find((x) => x.level === b.level + 1);
    if (!cur || !next) continue;
    const cost = bagValue(next.upgradeCost, prices);
    const dXp = next.xpPerDay - cur.xpPerDay;
    out.push({ slug: b.slug, name: f.name, from: b.level, to: next.level, cost, upgradeCost: next.upgradeCost,
      dXpPerDay: dXp, dProdPerDay: next.productionPerDay - cur.productionPerDay, dPower: next.powerCost - cur.powerCost,
      xpPerCoin: cost ? dXp / cost : null });
  }
  return out.sort((a, b) => (b.xpPerCoin ?? -1) - (a.xpPerCoin ?? -1));
}

/**
 * A Masterpiece contribution of `qty` units, `already` given in this reset window: power it costs,
 * XP it earns (xpPerUnit each) and XP per power, split by tier.
 */
export function masterpieceCost(qty, xpPerUnit, already = 0, tiers = MASTERPIECE_TIERS) {
  let power = 0, done = already, left = qty;
  const parts = [];
  let lo = 0;
  for (const t of tiers) {
    const room = Math.max(0, t.upTo - Math.max(done, lo));
    const take = Math.min(left, room);
    if (take > 0) { power += take * t.power; parts.push({ upTo: t.upTo, units: take, power: take * t.power, xpPerPower: xpPerUnit / t.power }); done += take; left -= take; }
    lo = t.upTo;
    if (left <= 0) break;
  }
  return { power, xp: qty * xpPerUnit, xpPerPower: power ? (qty * xpPerUnit) / power : null, parts };
}

/** How many units to give before the next unit's XP per power drops below `benchmark`. */
export function masterpieceStop(xpPerUnit, benchmark, already = 0, tiers = MASTERPIECE_TIERS) {
  let stop = already;
  for (const t of tiers) {
    if (xpPerUnit / t.power < benchmark) break;
    stop = Math.max(stop, t.upTo);
  }
  return Math.max(0, (stop === Infinity ? Infinity : stop) - already);
}

/** Katana pool rows -> { SYMBOL: price in COIN }, keeping the deepest pool per symbol. */
export function pricesFromPools(pools) {
  const best = {};
  for (const p of pools || []) {
    const a = p.attributes || p;
    const m = String(a.name || "").replace(/\s+\d+(\.\d+)?%$/, "").split("/").map((s) => s.trim().toUpperCase());
    if (m.length !== 2) continue;
    let [base, quote] = m, price = parseFloat(a.base_token_price_quote_token);
    if (base === "COIN" && quote !== "COIN") { [base, quote] = [quote, base]; price = parseFloat(a.quote_token_price_base_token); }
    if (quote !== "COIN" || !(price > 0)) continue;
    const tvl = parseFloat(a.reserve_in_usd) || 0;
    if (!best[base] || tvl > best[base].tvl) best[base] = { price, tvl, vol: parseFloat((a.volume_usd || {}).h24) || 0 };
  }
  return best;
}
