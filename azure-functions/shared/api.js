const API_KEY = process.env.SFL_API_KEY;

/**
 * Fetch farm data from SFL API.
 * Returns the parsed JSON response (contains .farm with game state).
 */
async function fetchFarmData(farmId) {
  const url = `https://api.sunflower-land.com/community/farms/${farmId}`;
  const resp = await fetch(url, {
    headers: { "x-api-key": API_KEY },
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
