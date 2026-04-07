const DEFAULT_API_KEY = process.env.SFL_API_KEY;

/**
 * Fetch farm data from SFL API.
 * @param {string} farmId
 * @param {string} [apiKey] - per-farm API key (falls back to SFL_API_KEY env var)
 */
async function fetchFarmData(farmId, apiKey) {
  const key = apiKey || DEFAULT_API_KEY;
  const url = `https://api.sunflower-land.com/community/farms/${farmId}`;
  const resp = await fetch(url, {
    headers: { "x-api-key": key },
  });
  if (!resp.ok) {
    throw new Error(`Farm API ${resp.status}: ${await resp.text()}`);
  }
  return resp.json();
}

/**
 * Fetch P2P prices from sfl.world.
 * Returns object like { "Sunflower": 0.001, "Rice": 0.05, ... }
 */
async function fetchPrices() {
  const resp = await fetch("https://sfl.world/api/v1/prices");
  if (!resp.ok) {
    throw new Error(`Prices API ${resp.status}: ${await resp.text()}`);
  }
  const json = await resp.json();
  // Structure: { data: { p2p: {...}, seq: {...}, ge: {...} }, updatedAt, ... }
  return (json.data && json.data.p2p) || {};
}

/**
 * Fetch NFT data from sfl.world.
 * Returns { collectibles: [...], wearables: [...] }
 */
async function fetchNfts() {
  const resp = await fetch("https://sfl.world/api/v1/nfts");
  if (!resp.ok) {
    throw new Error(`NFTs API ${resp.status}: ${await resp.text()}`);
  }
  return resp.json();
}


/**
 * Fetch marketplace activity data (daily aggregates, no auth needed).
 * Returns { flowerPrice, reports: { "YYYY-MM-DD": { totals, items } } }
 */
async function fetchMarketplaceActivity() {
  const resp = await fetch(
    "https://api.sunflower-land.com/data?type=marketplaceActivity",
    { headers: { "Content-Type": "application/json;charset=UTF-8" } }
  );
  if (!resp.ok) throw new Error(`MarketplaceActivity API ${resp.status}: ${await resp.text()}`);
  const json = await resp.json();
  return json.data || {};
}

/**
 * Fetch rich per-item collection data (requires Bearer JWT).
 * Returns { id, floor, supply, history, listings, offers, ... }
 */
async function fetchCollectionItem(collection, itemId, token) {
  const resp = await fetch(
    `https://api.sunflower-land.com/collection/${collection}/${itemId}?type=${collection}`,
    {
      headers: {
        "Content-Type": "application/json;charset=UTF-8",
        "Authorization": `Bearer ${token}`,
      },
    }
  );
  if (resp.status === 429) {
    throw Object.assign(new Error("Rate limited"), { status: 429 });
  }
  if (!resp.ok) throw new Error(`Collection API ${resp.status}: ${await resp.text()}`);
  return resp.json();
}

/**
 * Fetch marks leaderboard (public, no auth needed).
 * Returns top 10 + nearby ranks for the queried farmId.
 */
async function fetchLeaderboard(farmId) {
  const date = new Date().toISOString().slice(0, 10);
  const url = `https://api.sunflower-land.com/leaderboard/kingdom/${farmId}?date=${date}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Leaderboard API ${resp.status}: ${await resp.text()}`);
  return resp.json();
}

module.exports = { fetchFarmData, fetchPrices, fetchNfts, fetchMarketplaceActivity, fetchCollectionItem, fetchLeaderboard };
