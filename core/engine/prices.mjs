import { BETTY_SELL_PRICES } from "../data/prices.mjs";

export function computeBettyRate(p2pPrices) {
  let bestRate = 0, bestItem = "";
  for (const [name, sellCoins] of Object.entries(BETTY_SELL_PRICES)) {
    const p2p = p2pPrices[name];
    if (!p2p || p2p <= 0) continue;
    const rate = sellCoins / p2p;
    if (rate > bestRate) { bestRate = rate; bestItem = name; }
  }
  return { rate: bestRate, item: bestItem };
}
