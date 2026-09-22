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

/*
 * The ONE coin-rate fallback for the valuation pages (Treasury, Diff, Investment Tracker).
 *
 * Coins -> FLOWER comes from one of two live sources: Betty (best crop-sell rate, from the p2p
 * feed) or the sfl.world exchange (best coin tier). The page used to paper over a missing source
 * with a hardcoded number — 320 on one page, 1500 on another, the exchange on a third — so the
 * same coins were worth different FLOWER depending on where you looked. The rule now: the source
 * the mode asks for, else the other live source, else 0. Zero means "no rate" (coins unpriced),
 * which the pages flag, rather than a made-up rate that looks measured.
 *
 * Twin copy: flowers.html carries this function verbatim (tests/core/twin-copies.test.mjs).
 */
export function pickCoinsPerSFL(mode, bettyRate, apiRate) {
  const betty = bettyRate > 0 ? bettyRate : 0;
  const api = apiRate > 0 ? apiRate : 0;
  if (mode === "betty") return betty || api;
  if (mode === "api") return api || betty;
  return 0;
}

/*
 * The ONE NFT unit-price rule: the floor (what it sells for now), and the last sale only when
 * there is no floor at all. Treasury used last-sale-first while ROI / Power / Sales used the
 * floor, so a Merino Jumper was 146 on one page and 291 on the next.
 *
 * Twin copy: flowers.html carries this function verbatim (tests/core/twin-copies.test.mjs).
 */
export function nftUnitPrice(nft) {
  if (!nft) return 0;
  const floor = parseFloat(nft.floor) || 0;
  if (floor > 0) return floor;
  return parseFloat(nft.lastSalePrice) || 0;
}
