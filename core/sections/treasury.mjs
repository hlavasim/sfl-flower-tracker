// section=treasury — the TREASURY page's farm valuation, extracted VERBATIM from
// flowers.html (fetchTreasuryData's td assembly 12252-12286 minus its four upstream
// fetches, which live in api/compute.mjs; computeFarmValue 12288-12437). One deviation:
// computeFarmValue's read of localStorage sfl_pet_prices_v1 (user-entered NFT pet
// purchase prices) becomes a `petPrices` parameter — the client passes it via the
// `petprices` query param. The inline computeFarmValue STAYS: the diff-page value
// chart runs it over dozens of HISTORIC snapshot farms client-side.
import { computeBettyRate } from "../engine/prices.mjs";
import { TREASURE_SELL_PRICES } from "../data/crafting.mjs";
import { findCollectible, getCount } from "../engine/power-helpers.mjs";

export function buildTreasuryData(p2p, nftData, exchange, btcUsd) {
  const nftCollectibles = {};
  for (const c of (nftData.collectibles || [])) {
    nftCollectibles[c.name] = c;
  }
  const nftWearables = {};
  for (const w of (nftData.wearables || [])) {
    nftWearables[w.name] = w;
  }

  const p2pPrices = p2p || {};
  const sflUsd = exchange?.sfl?.usd || 0;
  const btcUsd_ = btcUsd || 0;

  // Coins: API rate (best tier) + Betty rate (best crop to sell)
  const coinTiers = Object.values(exchange?.coins || {});
  const bestCoinTier = coinTiers.reduce((best, t) => (!best || (t.coin / t.sfl) > (best.coin / best.sfl)) ? t : best, null);
  const coinsPerSFL_api = bestCoinTier ? (bestCoinTier.coin / bestCoinTier.sfl) : 320;
  const betty = computeBettyRate(Object.fromEntries(Object.entries(p2pPrices).map(([k, v]) => [k, parseFloat(v) || 0])));
  const coinsPerSFL_betty = betty.rate;

  // Gems: best-value tier with -30% pack discount applied
  const gemTiers = Object.values(exchange?.gems || {});
  const bestGemTier = gemTiers.reduce((best, t) => (!best || (t.gem / t.sfl) > (best.gem / best.sfl)) ? t : best, null);
  const gemsPerSFL = bestGemTier ? (bestGemTier.gem / (bestGemTier.sfl * 0.7)) : 0;

  return { nftCollectibles, nftWearables, p2pPrices, sflUsd, coinsPerSFL_api, coinsPerSFL_betty, bettyItem: betty.item, gemsPerSFL, btcUsd: btcUsd_ };
}

    // ── flowers.html 12288-12437: computeFarmValue (petPrices param deviation) ──
    function computeFarmValue(farm, td, coinMode, petPrices) {
      const { nftCollectibles, nftWearables, p2pPrices, sflUsd, coinsPerSFL_api, coinsPerSFL_betty, bettyItem, gemsPerSFL, btcUsd } = td;
      const coinsPerSFL = coinMode === "api" ? coinsPerSFL_api : coinMode === "betty" ? coinsPerSFL_betty : 0;
      const inventory = farm.inventory || {};
      const wardrobe = farm.wardrobe || {};
      const MIN_VALUE = 0.01;

      // Debug: log farm keys to help find gems path
      console.log("[Treasury] farm keys:", Object.keys(farm));
      console.log("[Treasury] farm.gems:", farm.gems, "| farm.bank:", farm.bank, "| inventory Gem:", inventory["Gem"]);

      // --- Resources: inventory items with P2P prices ---
      const resources = [];
      for (const [name, price] of Object.entries(p2pPrices)) {
        const qty = getCount(inventory, name);
        if (qty <= 0) continue;
        const total = qty * price;
        if (total < MIN_VALUE) continue;
        resources.push({ name, qty, unitPrice: price, total });
      }
      resources.sort((a, b) => b.total - a.total);

      // --- Treasures: inventory items with coin sell prices ---
      const treasures = [];
      // Detect treasure sell boosts
      let treasureBoost = 1;
      if (findCollectible(farm, "Treasure Map").length > 0) treasureBoost += 0.2;
      // Camel: check inventory (might not be placed)
      if (getCount(inventory, "Camel") > 0 || findCollectible(farm, "Camel").length > 0) treasureBoost += 0.3;

      for (const [name, baseCoins] of Object.entries(TREASURE_SELL_PRICES)) {
        const qty = getCount(inventory, name);
        if (qty <= 0) continue;
        const boostedCoins = baseCoins * treasureBoost;
        const sflValue = coinsPerSFL > 0 ? boostedCoins / coinsPerSFL : 0;
        const total = qty * sflValue;
        if (total < MIN_VALUE) continue;
        treasures.push({ name, qty, unitPrice: sflValue, unitCoins: boostedCoins, total });
      }
      treasures.sort((a, b) => b.total - a.total);

      // --- Collectibles: inventory NFT collectibles (inventory includes placed) ---
      const collectibles = [];
      const countedCollectibles = new Set();

      for (const name of Object.keys(nftCollectibles)) {
        const nft = nftCollectibles[name];
        const floor = parseFloat(nft.floor) || 0;
        if (floor <= 0) continue;

        const qty = getCount(inventory, name);
        if (qty <= 0) continue;
        const total = qty * floor;
        if (total < MIN_VALUE) continue;
        collectibles.push({ name, qty, unitPrice: floor, total });
        countedCollectibles.add(name);
      }
      collectibles.sort((a, b) => b.total - a.total);

      // --- Wearables: wardrobe matched against NFT wearables ---
      const wearables = [];
      for (const [name, qty] of Object.entries(wardrobe)) {
        if (!qty || qty <= 0) continue;
        const nft = nftWearables[name];
        if (!nft) continue;
        const price = parseFloat(nft.lastSalePrice) || parseFloat(nft.floor) || 0;
        if (price <= 0) continue;
        const total = qty * price;
        if (total < MIN_VALUE) continue;
        wearables.push({ name, qty, unitPrice: price, total });
      }
      wearables.sort((a, b) => b.total - a.total);

      // --- Pets: NFT pets valued at user-entered purchase prices (sfl_pet_prices_v1) ---
      // Keyed `nft-${id}` to match the Power-page Pets panel. Common pets aren't
      // tradeable, so only NFT pets count toward liquidatable farm value.
      const pets = [];
      const PET_DEFAULT_PRICE = 2000; // flat fallback per NFT pet (no reliable per-type floor data)
      const _petPrices = petPrices || {}; // deviation: localStorage sfl_pet_prices_v1 → param
      for (const [id, pet] of Object.entries(farm.pets?.nfts || {})) {
        const price = parseFloat(_petPrices["nft-" + id]) || PET_DEFAULT_PRICE; // entered price wins, else 2000
        if (price < MIN_VALUE) continue;
        const petType = pet.traits?.type || "Pet";
        pets.push({ name: `${petType} #${id}`, qty: 1, unitPrice: price, total: price });
      }
      pets.sort((a, b) => b.total - a.total);

      // --- Listings: FUNGIBLE items escrowed in active marketplace listings (trades.listings) ---
      // IMPORTANT: only resources are added here. NFTs (collectibles / wearables / pets / buds)
      // STAY in inventory / wardrobe / pets.nfts while listed, so they're already counted in
      // those categories — adding them here too double-counts (treasury + listing). Only fungible
      // resources are deducted from inventory when listed, so only those would otherwise vanish.
      // Valued at market (p2p) — same methodology as the Resources category.
      const NFT_LISTING_COLLECTIONS = ["collectibles", "wearables", "pets", "buds"];
      const listings = [];
      const _listAgg = {};
      for (const l of Object.values(farm.trades?.listings || {})) {
        if (NFT_LISTING_COLLECTIONS.includes(l.collection)) continue; // already counted in their own category
        for (const [name, qty] of Object.entries(l.items || {})) {
          const q = parseFloat(qty) || 0;
          if (q <= 0) continue;
          let price = p2pPrices[name] || 0;
          if (price <= 0 && nftCollectibles[name]) price = parseFloat(nftCollectibles[name].floor) || 0;
          if (price <= 0 && nftWearables[name]) price = parseFloat(nftWearables[name].lastSalePrice) || parseFloat(nftWearables[name].floor) || 0;
          if (!_listAgg[name]) _listAgg[name] = { qty: 0, price };
          _listAgg[name].qty += q;
        }
      }
      for (const [name, agg] of Object.entries(_listAgg)) {
        const total = agg.qty * agg.price;
        if (total < MIN_VALUE) continue;
        listings.push({ name, qty: agg.qty, unitPrice: agg.price, total });
      }
      listings.sort((a, b) => b.total - a.total);

      // --- Liquid: SFL balance + coins + gems ---
      const sflBalance = parseFloat(farm.balance) || 0;
      const coinBalance = parseFloat(farm.coins) || 0;
      // Try multiple paths for gems
      const gemBalance = parseFloat(farm.gems) || parseFloat(farm.bank?.gems) || getCount(inventory, "Gem") || 0;
      const coinsAsSFL = coinsPerSFL > 0 ? coinBalance / coinsPerSFL : 0;
      const gemsAsSFL = gemsPerSFL > 0 ? gemBalance / gemsPerSFL : 0;
      const liquidTotal = sflBalance + coinsAsSFL + gemsAsSFL;

      const resourcesTotal = resources.reduce((s, r) => s + r.total, 0);
      const treasuresTotal = treasures.reduce((s, t) => s + t.total, 0);
      const collectiblesTotal = collectibles.reduce((s, c) => s + c.total, 0);
      const wearablesTotal = wearables.reduce((s, w) => s + w.total, 0);
      const petsTotal = pets.reduce((s, p) => s + p.total, 0);
      const listingsTotal = listings.reduce((s, l) => s + l.total, 0);
      const grandTotal = resourcesTotal + treasuresTotal + collectiblesTotal + wearablesTotal + petsTotal + listingsTotal + liquidTotal;

      return {
        resources, treasures, collectibles, wearables, pets, listings,
        liquid: { sflBalance, coinBalance, gemBalance, coinsAsSFL, gemsAsSFL, total: liquidTotal },
        treasureBoost,
        totals: {
          resources: resourcesTotal,
          treasures: treasuresTotal,
          collectibles: collectiblesTotal,
          wearables: wearablesTotal,
          pets: petsTotal,
          listings: listingsTotal,
          liquid: liquidTotal,
          grand: grandTotal,
        },
        rates: { sflUsd, btcUsd, coinsPerSFL, coinsPerSFL_api, coinsPerSFL_betty, bettyItem },
      };
    }

export { computeFarmValue };

export function buildTreasurySection(farm, p2p, nftData, exchange, btcUsd, settings = {}) {
  const td = buildTreasuryData(p2p, nftData, exchange, btcUsd);
  const coinMode = settings.coinMode || "betty";
  const value = computeFarmValue(farm, td, coinMode, settings.petPrices || {});
  return { td, coinMode, value };
}
