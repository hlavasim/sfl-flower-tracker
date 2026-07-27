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
 * Fetch a page of farms from the batch endpoint.
 * The cursor is base64(lastFarmId) without padding, so pages can also be
 * synthesised to jump over farms the API refuses to serve.
 * @returns {{farms: Array, next_cursor: string}}
 * @throws {Error & {status:number}} 429 when rate limited, 5xx when the page is
 *   too large for the upstream response limit (~6 MB) or a record is broken.
 */
async function fetchFarmsBatch(cursor, limit, apiKey) {
  const key = apiKey || DEFAULT_API_KEY;
  const url = `https://api.sunflower-land.com/community/farms?limit=${limit}` +
    (cursor ? `&cursor=${encodeURIComponent(cursor)}` : "");
  const resp = await fetch(url, { headers: { "x-api-key": key } });
  const text = await resp.text();
  if (!resp.ok) {
    const err = new Error(`Farms batch ${resp.status}: ${text.slice(0, 120)}`);
    err.status = resp.status;
    throw err;
  }
  const json = JSON.parse(text);
  // Byte size is returned so the caller can size the next page against the upstream
  // response cap instead of discovering it by triggering a 500.
  json.__bytes = Buffer.byteLength(text);
  return json;
}

/**
 * Fetch specific farms by id via POST /community/getFarms.
 *
 * Measured 2026-07-27:
 *   - hard cap of 100 ids; 101 returns 500 in ~300ms (a validation reject, not payload)
 *   - ids that do not exist come back listed in `skipped`, harmlessly
 *   - an id the upstream cannot serve (e.g. 54) still 500s the WHOLE batch, exactly
 *     like the cursor endpoint — so callers must exclude known-bad ids and bisect to
 *     find new ones
 *   - rate limited: at a 3s interval 3 of 5 calls returned 429, so keep the same ~16s
 *     spacing as the cursor path
 *   - the response carries `warning: "This endpoint is deprecated. Please use
 *     pagination"`. It works today, but every caller must be able to fall back to the
 *     cursor path, because this can disappear without notice.
 *
 * @returns {{farms: Record<string, object>, skipped: number[], deprecated: boolean}}
 */
const GET_FARMS_MAX_IDS = 100;

async function fetchFarmsByIds(ids, apiKey) {
  if (ids.length > GET_FARMS_MAX_IDS) {
    throw new Error(`getFarms accepts at most ${GET_FARMS_MAX_IDS} ids, got ${ids.length}`);
  }
  const key = apiKey || DEFAULT_API_KEY;
  const resp = await fetch("https://api.sunflower-land.com/community/getFarms", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": key },
    body: JSON.stringify({ ids }),
  });
  const text = await resp.text();
  if (!resp.ok) {
    const err = new Error(`getFarms ${resp.status}: ${text.slice(0, 120)}`);
    err.status = resp.status;
    throw err;
  }
  const json = JSON.parse(text);
  return {
    farms: json.farms || {},
    skipped: json.skipped || [],
    deprecated: !!json.warning,
    __bytes: Buffer.byteLength(text),
  };
}

const encodeCursor = (id) => Buffer.from(String(id)).toString("base64").replace(/=+$/, "");
const decodeCursor = (c) => {
  if (!c) return null;
  const n = parseInt(Buffer.from(c, "base64").toString(), 10);
  return Number.isFinite(n) ? n : null;
};

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

module.exports = { fetchFarmData, fetchFarmsBatch, fetchFarmsByIds, GET_FARMS_MAX_IDS, encodeCursor, decodeCursor, fetchPrices, fetchNfts, fetchMarketplaceActivity, fetchCollectionItem, fetchLeaderboard };
