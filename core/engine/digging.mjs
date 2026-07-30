/*
 * Is digging worth it? MEASURED, not modelled.
 *
 * This was open as "TREASURE_SELL_PRICES exists but the dig-rate model does not". It turns out no
 * probability model is needed and building one would have been worse: the farm carries
 * `desert.digging.grid`, which is every hole dug at the site with the exact items each one
 * yielded and the tool used. That is a real sample of this farm's own luck, on the same principle
 * as the measured harvest efficiency the rest of the app runs on — so the answer comes from what
 * you actually dug, not from a treasure table someone would have to keep in sync.
 *
 * The grid is one site's worth (35 holes on a real farm, reset per site), so it is both the sample
 * AND the daily allowance, which is why a separate "digs per day" figure is not invented here.
 *
 * The awkward part, stated rather than smoothed over: treasures sell for COINS. This app treats
 * coins as free once you hold more than 10k, so converting a dig's coin haul into FLOWER at
 * coinsPerSFL is an ASSUMPTION, and under the app's own coins-are-free rule the honest FLOWER value
 * of a treasure haul is near zero. Both figures are therefore reported separately and neither is
 * presented as the answer.
 */
import { TREASURE_SELL_PRICES } from "../data/crafting.mjs";
import { TOOL_COSTS } from "../data/economy.mjs";

/** Material + coin cost of one dig with a given tool. */
export function digToolCost(tool, p2pPrices, exchangeRates, opts = {}) {
  const t = TOOL_COSTS[tool];
  if (!t) return null;
  const cps = (exchangeRates && exchangeRates.coinsPerSFL) || 0;
  let matSfl = 0, unpriced = false;
  for (const [item, qty] of Object.entries(t.materials || {})) {
    const price = (p2pPrices && p2pPrices[item]) || 0;
    if (!(price > 0)) unpriced = true;
    matSfl += price * qty;
  }
  // Same rule the rest of the app uses: coins are free once you are past the threshold, so a
  // shovel's coin price is charged only when the caller says coins count.
  const coinSfl = opts.coinsFree ? 0 : (cps > 0 ? (t.coins || 0) / cps : 0);
  return { tool, coins: t.coins || 0, materials: t.materials || {}, matSfl, coinSfl, sfl: matSfl + coinSfl, unpriced };
}

/**
 * What this farm's own digging actually returned, per hole and per site.
 *
 * `coinsFree` follows the caller's roadmap setting so the cost side cannot contradict the rest of
 * the page.
 */
export function diggingVerdict(farm, p2pPrices, exchangeRates, opts = {}) {
  const dig = ((farm && farm.desert) || {}).digging || {};
  const grid = Array.isArray(dig.grid) ? dig.grid : [];
  const dug = grid.filter((c) => c && c.dugAt);
  const cps = (exchangeRates && exchangeRates.coinsPerSFL) || 0;

  const byTool = {};
  const found = {};
  for (const c of dug) {
    byTool[c.tool || "?"] = (byTool[c.tool || "?"] || 0) + 1;
    for (const [item, qty] of Object.entries(c.items || {})) found[item] = (found[item] || 0) + (qty || 0);
  }

  /*
   * Two income streams, deliberately kept apart:
   *   coin  — treasures with an NPC sell price (TREASURE_SELL_PRICES). Real, but paid in coins.
   *   flower— items with a p2p market price (Wood, Stone, Gold, and any treasure that trades).
   * An item in neither is reported as unpriced. Salt Dino Egg is the live example: it comes out of
   * the sand and has no sell price and no market quote, so calling it 0 would be wrong.
   */
  const items = [];
  let coins = 0, flowerSfl = 0;
  const unpriced = [];
  for (const [item, qty] of Object.entries(found)) {
    const sell = TREASURE_SELL_PRICES[item];
    const p2p = (p2pPrices && p2pPrices[item]) || 0;
    const row = { item, qty, sellCoins: sell != null ? sell * qty : null, p2pSfl: p2p > 0 ? p2p * qty : null };
    if (sell != null) coins += sell * qty;
    if (p2p > 0) flowerSfl += p2p * qty;
    if (sell == null && !(p2p > 0)) unpriced.push(item);
    items.push(row);
  }
  items.sort((a, b) => (b.sellCoins || 0) - (a.sellCoins || 0));

  // Cost: what the holes were dug WITH, at this farm's own tool mix.
  let costSfl = 0; const tools = [];
  for (const [tool, n] of Object.entries(byTool)) {
    const tc = digToolCost(tool, p2pPrices, exchangeRates, opts);
    if (!tc) continue;
    costSfl += tc.sfl * n;
    tools.push({ ...tc, digs: n, totalSfl: tc.sfl * n });
  }

  const digs = dug.length;
  // The coin haul expressed in FLOWER — an ASSUMPTION (see the header), never mixed into the
  // market-priced figure.
  const coinsAsSfl = cps > 0 ? coins / cps : null;
  return {
    digs, holes: grid.length, remaining: Math.max(0, grid.length - digs),
    extraDigs: dig.extraDigs || 0,
    streak: dig.streak ? { count: dig.streak.count || 0, totalClaimed: dig.streak.totalClaimed || 0 } : null,
    completedPatterns: Array.isArray(dig.completedPatterns) ? dig.completedPatterns.slice() : [],
    patternsAvailable: Array.isArray(dig.patterns) ? dig.patterns.length : 0,
    byTool, tools, items, unpriced,
    coins, coinsAsSfl, flowerSfl, costSfl,
    perDig: digs > 0 ? {
      coins: coins / digs,
      coinsAsSfl: coinsAsSfl == null ? null : coinsAsSfl / digs,
      flowerSfl: flowerSfl / digs,
      costSfl: costSfl / digs,
      // Net under the coin assumption, and net on market prices alone. The gap between them IS
      // the assumption's weight, which is why both are here.
      netWithCoins: coinsAsSfl == null ? null : (coinsAsSfl + flowerSfl - costSfl) / digs,
      netMarketOnly: (flowerSfl - costSfl) / digs,
    } : null,
    // No sample means no answer. Saying 0 would read as "digging is worthless".
    measured: digs > 0,
    coinAssumption: cps > 0
      ? `coiny přepočítány na FLOWER kurzem ${Math.round(cps)} c/FLOWER — předpoklad, ne trh; podle pravidla téhle appky jsou coiny nad 10k zdarma, a pak je hodnota pokladů v FLOWER blízko nule`
      : "coiny nelze přepočítat — chybí kurz",
  };
}
