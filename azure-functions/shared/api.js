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
 * Fetch marketplace activity data (daily aggregates + live market snapshot).
 * Returns { flowerPrice, reports: { "YYYY-MM-DD": { totals, items } } }
 *
 * The /community path, not the bare /data one we used before. They are not the same feed:
 * /data returns 2,467 items with trade stats only, /community/data returns 3,131 WITH a
 * market snapshot per item — floor, bestOffer, listingCount, offerCount, live for 1,599 of
 * them. That snapshot is the whole top of the book for the entire catalogue in ONE request,
 * which is what lets the orderbook collector exist again at all: the per-item route the old
 * one used is walled off, and this endpoint is throttled to roughly one request per 5s.
 *
 * floor/bestOffer are omitted per item when that side of the book is empty, and the snapshot
 * is point-in-time (live on today's report, end-of-day on a past one) while the trade stats
 * are cumulative over the marketplace's whole history.
 */
async function fetchMarketplaceActivity(apiKey) {
  const key = apiKey || DEFAULT_API_KEY;
  const resp = await fetch(
    "https://api.sunflower-land.com/community/data?type=marketplaceActivity",
    { headers: { "Content-Type": "application/json;charset=UTF-8", "x-api-key": key } }
  );
  if (resp.status === 429) throw Object.assign(new Error("Rate limited"), { status: 429 });
  if (!resp.ok) throw new Error(`MarketplaceActivity API ${resp.status}: ${await resp.text()}`);
  const json = await resp.json();
  return json.data || {};
}

/**
 * Fetch rich per-item marketplace data: floor, supply, the 50 best offers and listings on
 * each side, and the sale history. Returns { id, floor, supply, history, listings, offers, ... }
 *
 * This replaces /collection/{collection}/{id}, which the game walled behind its request-token
 * anti-scraping layer on 2026-09-01 (RT-001) and which now answers 500 to every server-side
 * caller. The community route carries the same object — offers/listings as {sfl, quantity} and
 * history.sales with initiatedBy/fulfilledBy, field for field — so the callers did not change;
 * only the URL, the auth (an API key instead of a player's Bearer JWT, so no token in Redis to
 * keep alive) and the {data:…} envelope did.
 *
 * Two things the public view does NOT carry, by design: `balance` (it never reports what a
 * particular farm owns) and any per-farm signature. Callers that recorded `balance` now record
 * null for it.
 *
 * Throttled to roughly one request per 5 seconds per IP, doubling to 10 if you keep going —
 * measured, not assumed: at 1.5s apart 4 of 6 calls 429, at 5.5s apart 2 of 6 still did. Pace
 * per-item sweeps accordingly and retry the 429s.
 */
async function fetchCollectionItem(collection, itemId, apiKey) {
  const key = apiKey || DEFAULT_API_KEY;
  const resp = await fetch(
    `https://api.sunflower-land.com/community/data?type=tradeable&collection=${encodeURIComponent(collection)}&id=${encodeURIComponent(itemId)}`,
    { headers: { "Content-Type": "application/json;charset=UTF-8", "x-api-key": key } }
  );
  if (resp.status === 429) {
    throw Object.assign(new Error("Rate limited"), { status: 429 });
  }
  if (!resp.ok) throw new Error(`Tradeable API ${resp.status}: ${await resp.text()}`);
  const json = await resp.json();
  return json.data || {};
}

/**
 * One farm's marketplace profile: its last 50 settled trades (both sides of the book), its
 * open listings and offers, its five most frequent trading partners and weekly FLOWER flows.
 *
 * One request for what the old per-item sweep could only reach by visiting every item the farm
 * had ever touched — this is how "my trades" is collected now.
 */
async function fetchMarketplaceProfile(farmId, apiKey) {
  const key = apiKey || DEFAULT_API_KEY;
  const resp = await fetch(
    `https://api.sunflower-land.com/community/data?type=marketplaceProfile&farmId=${encodeURIComponent(farmId)}`,
    { headers: { "Content-Type": "application/json;charset=UTF-8", "x-api-key": key } }
  );
  if (resp.status === 429) throw Object.assign(new Error("Rate limited"), { status: 429 });
  if (!resp.ok) throw new Error(`MarketplaceProfile API ${resp.status}: ${await resp.text()}`);
  const json = await resp.json();
  return json.data || {};
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

module.exports = { fetchFarmData, fetchFarmsBatch, fetchFarmsByIds, GET_FARMS_MAX_IDS, encodeCursor, decodeCursor, fetchPrices, fetchNfts, fetchMarketplaceActivity, fetchCollectionItem, fetchMarketplaceProfile, fetchLeaderboard };
