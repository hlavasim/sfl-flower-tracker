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

module.exports = { fetchFarmData, fetchPrices, fetchNfts };
