import { buildCookingSection } from "../core/sections/cooking.mjs";
import { buildConstantsSection } from "../core/sections/constants.mjs";
import { buildPricesSection } from "../core/sections/prices.mjs";
import { valueDiff } from "../core/sections/diff.mjs";
import { buildPowerSection } from "../core/sections/power.mjs";
import { buildRoiSection } from "../core/sections/roi.mjs";
import { roadmapComputeEfficiency } from "../core/engine/roadmap.mjs";
import { buildTreasurySection } from "../core/sections/treasury.mjs";
import { buildRoadmapSection } from "../core/sections/roadmap.mjs";
import { buildAscensionSection } from "../core/sections/ascension.mjs";
import { buildWishlistSection } from "../core/sections/wishlist.mjs";
import { buildCookingSection as _cookingForAscension } from "../core/sections/cooking.mjs";
import { buildBudsSection } from "../core/sections/buds.mjs";
import { buildPetsSection } from "../core/sections/pets.mjs";
import { computeBettyRate } from "../core/engine/prices.mjs";
import { API_SPEC } from "../core/api-spec.mjs";

const PROXY = process.env.PROXY_ORIGIN || "https://sunflower.sajmonium.quest";
const PRICES_URL = "https://sfl.world/api/v1/prices";
const NFTS_URL = "https://sfl.world/api/v1/nfts";
const EXCHANGE_URL = "https://sfl.world/api/v1.1/exchange";
const BTC_URL = "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd";

// --- Short-TTL in-process cache for the two upstream fetches -------------------------------
// /api/compute is a pure read. Each migrated consumer on a page (marks today, more sections
// to follow) makes its own call to this endpoint, and each call re-fetches the same farm and
// the same prices from upstream. The upstream rate-limits aggressively (429, surfaced to us
// as a 502 through the proxy), so N consumers on one page load can turn into N upstream hits
// — and when one gets rate-limited, a page ends up half-priced (task F2-2-cache).
//
// Caching the parsed farm (keyed by farmId) and the parsed prices (single key — prices take
// no farm) lets near-simultaneous requests for the same farm share ONE upstream hit apiece
// instead of N. 10s TTL: comfortably covers the ~4-5 consumer calls a single page load fires
// today, short enough that "current farm state" is never meaningfully stale.
//
// Plain module-level Maps — not a distributed cache. On Vercel, each function instance keeps
// its own cache and a cold start drops it; that's expected and fine, because Fluid Compute
// reuses a warm instance across the concurrent/near-simultaneous requests one page load
// produces, which is exactly the case this is deduping.
//
// The cache stores the in-flight PROMISE, not just the resolved value. A page load's 4-5
// consumer calls arrive close enough together that a "check cache, fetch, cache the result"
// cache would let every one of them miss before the first fetch resolves (a stampede) — only
// callers that arrive strictly after a previous fetch finished would ever see a hit. Caching
// the promise itself, synchronously, before it's awaited, means callers that arrive while a
// fetch is still in flight share that same fetch instead of starting their own.
const CACHE_TTL_MS = 10_000;
const CACHE_MAX_ENTRIES = 64; // sweep expired entries past this — bounds a warm instance's farmCache
// The caches live on globalThis, not as bare module-level Maps: the dev server
// (dev-server.mjs) cache-busts THIS module with `?t=Date.now()` on every request, so a
// fresh module instance — and empty module-level caches — would be created per request,
// silently disabling the TTL dedupe and the stale fallback exactly where they get
// exercised most. On Vercel there is one instance either way; globalThis is a no-op there.
const G = globalThis.__computeShared ??= {};
const farmCache = G.farmCache ??= new Map(); // farmId -> { promise, expiresAt }
const pricesCache = G.pricesCache ??= new Map(); // "prices" -> { promise, expiresAt } — single entry, no farm key
const nftsCache = G.nftsCache ??= new Map(); // "nfts" -> { promise, expiresAt } — sections power+roi
// Slow-moving upstreams get longer TTLs than the 10s farm/prices default. Observed in
// Playwright runs: page loads that re-fetch nfts/exchange/btc every 10s trip sfl.world /
// coingecko rate limits (502 through the proxy) — yet NFT floors and exchange tiers move
// on minutes-to-hours timescales, so serving them minutes-stale is strictly better than
// serving a 502. Farm and p2p prices KEEP 10s (they are what "current state" means here).
const NFTS_TTL_MS = 5 * 60_000;
const EXCHANGE_TTL_MS = 60_000;
const BTC_TTL_MS = 60_000;
const exchangeCache = G.exchangeCache ??= new Map(); // "exchange" -> { promise, expiresAt } — sections power+roi
const btcCache = G.btcCache ??= new Map(); // "btc" -> { promise, expiresAt } — section=roi only

// Runs `run()` at most once per TTL per key, sharing the in-flight promise across callers
// that arrive before it settles. `run()` must resolve to `{ ok, ... }`; a `{ ok: false }`
// result (or a rejection) is evicted immediately so the very next call retries against
// upstream instead of replaying the failure for the rest of the TTL.
function cachedFetch(cache, key, run, ttlMs = CACHE_TTL_MS) {
  // Opportunistic sweep: drop successful-but-expired entries so a warm instance serving many
  // distinct farmIds does not grow the Map without bound (only failures self-evict below).
  if (cache.size > CACHE_MAX_ENTRIES) {
    const now = Date.now();
    for (const [k, v] of cache) if (v.expiresAt <= now) cache.delete(k);
  }
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.promise;
  const entry = { promise: run(), expiresAt: Date.now() + ttlMs };
  cache.set(key, entry);
  // Evict on failure — but ONLY if this exact entry is still the cached one. A slow promise
  // can settle after the TTL lapsed and a newer request already replaced it; deleting
  // unconditionally would wipe that newer, still-valid entry and reintroduce the stampede.
  const evictIfMine = () => { if (cache.get(key) === entry) cache.delete(key); };
  entry.promise.then(
    (result) => { if (!result.ok) evictIfMine(); },
    evictIfMine
  );
  return entry.promise;
}

// Last SUCCESSFUL results, kept indefinitely (bounded), as a stale fallback: the SFL
// farm API throttles hard enough that a page navigating between sections routinely hits
// a 429 window, and every section 502s with it. A minutes-stale farm is strictly better
// than a dead page for a read-only dashboard — so when the live fetch fails but we have
// EVER succeeded for this farm on this instance, serve that instead. Same for nfts
// (single key). Prices/exchange/btc are already best-effort by design.
const lastGoodFarm = G.lastGoodFarm ??= new Map(); // farmId -> wrap
const lastGoodNfts = G.lastGoodNfts ??= { data: null };

async function fetchFarm(farmId) {
  const result = await cachedFetch(farmCache, farmId, async () => {
    const sflUrl = `https://api.sunflower-land.com/community/farms/${farmId}`;
    const r = await fetch(`${PROXY}/api/proxy?url=${encodeURIComponent(sflUrl)}`);
    if (!r.ok) return { ok: false, status: r.status };
    const wrap = await r.json();
    return { ok: true, data: wrap };
  });
  if (result.ok) {
    if (lastGoodFarm.size > CACHE_MAX_ENTRIES) lastGoodFarm.delete(lastGoodFarm.keys().next().value);
    lastGoodFarm.set(farmId, result.data);
    return result;
  }
  const stale = lastGoodFarm.get(farmId);
  if (stale) return { ok: true, data: stale, stale: true };
  return result;
}

// Prices are best-effort: a failed/erroring fetch must not fail the whole endpoint
// (costs come back null/unpriced instead), unlike the farm fetch which still 502s. Unwrapped
// to the bare p2p map for callers — {} both on failure and (in principle) on a genuinely
// empty upstream response; only the failure case is excluded from the cache.
async function fetchPrices() {
  const result = await cachedFetch(pricesCache, "prices", async () => {
    try {
      const r = await fetch(`${PROXY}/api/proxy?url=${encodeURIComponent(PRICES_URL)}`);
      if (!r.ok) return { ok: false, data: {} };
      const json = await r.json();
      return { ok: true, data: json?.data?.p2p || {} };
    } catch {
      return { ok: false, data: {} };
    }
  });
  return result.data;
}

// Section=power upstreams. Nfts must load (the section is ABOUT the boost NFTs) → not ok
// fails the request like the farm fetch. Exchange is best-effort like prices: on failure
// the page's own behaviour was to keep the Betty rate and gemsPerSFL 0, so null suffices.
async function fetchNfts() {
  const result = await cachedFetch(nftsCache, "nfts", async () => {
    const r = await fetch(`${PROXY}/api/proxy?url=${encodeURIComponent(NFTS_URL)}`);
    if (!r.ok) return { ok: false, status: r.status };
    return { ok: true, data: await r.json() };
  }, NFTS_TTL_MS);
  if (result.ok) { lastGoodNfts.data = result.data; return result; }
  if (lastGoodNfts.data) return { ok: true, data: lastGoodNfts.data, stale: true };
  return result;
}

// BTC/USD for the ROI page's currency toggle — best-effort exactly like the page
// (its coingecko fetch had .catch(() => null) → btcUsd 0).
async function fetchBtc() {
  const result = await cachedFetch(btcCache, "btc", async () => {
    try {
      const r = await fetch(`${PROXY}/api/proxy?url=${encodeURIComponent(BTC_URL)}`);
      if (!r.ok) return { ok: false, data: 0 };
      const json = await r.json();
      return { ok: true, data: json?.bitcoin?.usd || 0 };
    } catch {
      return { ok: false, data: 0 };
    }
  }, BTC_TTL_MS);
  return result.data;
}

async function fetchExchange() {
  const result = await cachedFetch(exchangeCache, "exchange", async () => {
    try {
      const r = await fetch(`${PROXY}/api/proxy?url=${encodeURIComponent(EXCHANGE_URL)}`);
      if (!r.ok) return { ok: false, data: null };
      return { ok: true, data: await r.json() };
    } catch {
      return { ok: false, data: null };
    }
  }, EXCHANGE_TTL_MS);
  return result.data;
}

// Test-only hook: node:test imports this module once and runs every test in a file against
// that same instance, so the module-level caches above persist across tests unless cleared.
// Production callers never call this.
export function _clearCacheForTests(opts = {}) {
  // opts.keepLastGood: clear only the TTL caches — lets a test open the throttle-window
  // path (TTL miss + upstream failure) while the stale fallback still has data.
  if (!opts.keepLastGood) {
    lastGoodFarm.clear();
    lastGoodNfts.data = null;
  }
  farmCache.clear();
  pricesCache.clear();
  nftsCache.clear();
  exchangeCache.clear();
  btcCache.clear();
}

export default async function handler(req, res) {
  const farmId = (req.query && req.query.farm) || "";
  const section = (req.query && req.query.section) || "cooking";
  // Sections that describe the API itself need no farm — must branch before the farm guard.
  if (section === "constants") {
    return res.status(200).json({ section, computedAt: new Date().toISOString(), data: buildConstantsSection() });
  }
  if (section === "openapi") return res.status(200).json(API_SPEC);
  if (!farmId) return res.status(400).json({ error: "farm required" });
  try {
    const [farmResult, p2p] = await Promise.all([
      fetchFarm(farmId),
      fetchPrices(),
    ]);
    if (!farmResult.ok) return res.status(502).json({ error: `farm fetch failed: ${farmResult.status}` });
    const wrap = farmResult.data;
    const farm = wrap.farm || wrap;
    const coinsPerSFL = req.query.coinsPerSFL !== undefined
      ? Number(req.query.coinsPerSFL)
      : (computeBettyRate(p2p).rate || 0);
    // Rate-profile override for section=prices: different consumers (marks/deliveries,
    // dashboard, roadmap, ROI) use different rate profiles today (task-F2-2a). Unparseable
    // or absent must fall back to {} — never a 500 — so today's coinsPerSFL-only behaviour
    // is unaffected when a caller doesn't send it.
    let rates = {};
    if (req.query.rates) {
      try { rates = JSON.parse(req.query.rates); } catch { rates = {}; }
    }
    const settings = {
      savedRecipes: req.query.recipes ? JSON.parse(req.query.recipes) : {},
      petSimulate: req.query.petSimulate === "1",
      coinsPerSFL,
      // section=prices only (task-TRACE3): attaches marketTrace/productionTrace when "1".
      explain: req.query.explain === "1",
      ...rates,
    };
    let data;
    if (section === "cooking") data = buildCookingSection(farm, p2p, settings);
    // `prices` needs a farm (productionCost is per-farm: skills, salt/fish yield), so
    // unlike constants/openapi its branch belongs here, after the farm-required guard.
    else if (section === "prices") data = buildPricesSection(farm, p2p, settings);
    // `diff`: VALUE a batch of already-fetched delta maps. The client POSTs the diffs it got
    // from /api/farm-history or /api/farm-diff-agg (the diff itself is produced upstream by the
    // snapshot collector and stored); we only apply the market price map built above from the
    // SAME rate profile the client passes, replacing the inline processDiff. compute stays
    // DB-free — data lives in the DB endpoints, valuation lives here. explain=1 attaches a
    // per-snapshot net-SFL trace. Body: { snapshots: [{ capturedAt, diff }, ...] }.
    else if (section === "diff") {
      const priceMap = (buildPricesSection(farm, p2p, settings).marketValue) || {};
      let input = {};
      try { input = req.body ? JSON.parse(req.body.toString()) : {}; } catch { input = {}; }
      const list = Array.isArray(input.snapshots) ? input.snapshots : [];
      const snapshots = list.map((s) => {
        const dm = (s && s.diff) || {};
        const trace = settings.explain ? [] : undefined;
        const { items, netSfl } = valueDiff(dm, priceMap, settings, trace);
        return { capturedAt: s.capturedAt ?? s.time ?? null, netSfl, items, ...(settings.explain ? { trace: trace[0] } : {}) };
      });
      data = { snapshots };
    }
    // `power`: the POWER/ROADMAP pages' shared boost state (task: power migration). Needs
    // two extra upstreams the other sections don't: the sfl.world NFT list (the section is
    // an analysis OF those boost NFTs — a failed fetch is a 502, same as the farm) and the
    // exchange rates (best-effort — null keeps the Betty rate, exactly the page's fallback).
    else if (section === "power") {
      const [nftResult, exchange] = await Promise.all([fetchNfts(), fetchExchange()]);
      if (!nftResult.ok) return res.status(502).json({ error: `nfts fetch failed: ${nftResult.status}` });
      // `products` mirrors the page's per-category product selectors (same param as buds).
      // `roadmap` = the client's raw sfl_roadmap_settings (localStorage) — feeds the
      // boostValues engine; absent → defaults, matching a fresh browser.
      let roadmapSettings = {};
      try { roadmapSettings = req.query.roadmap ? JSON.parse(req.query.roadmap) : {}; } catch { roadmapSettings = {}; }
      // formulaFor/formulaCat: on-demand derivation panel for one boost (page click).
      data = buildPowerSection(farm, p2p, nftResult.data, exchange, { ...settings, roadmapSettings, formulaFor: req.query.formulaFor, formulaCat: req.query.formulaCat, savedProducts: req.query.products ? JSON.parse(req.query.products) : {} });
    }
    // `eff`: POST-only — measured harvest EFFICIENCY per category from farm-history
    // snapshot rows the client already fetched (diff-page pattern: compute stays
    // DB-free). Uses the power context (boost effects, capacity) that
    // buildPowerSection sets, so the theoretical cycles match section=power's.
    // Body: { snapshots: [{ captured_at, diff }, ...] }.
    else if (section === "eff") {
      const [nftResult, exchange] = await Promise.all([fetchNfts(), fetchExchange()]);
      if (!nftResult.ok) return res.status(502).json({ error: `nfts fetch failed: ${nftResult.status}` });
      buildPowerSection(farm, p2p, nftResult.data, exchange, settings); // sets the roadmap context
      let input = {};
      try { input = req.body ? JSON.parse(req.body.toString()) : {}; } catch { input = {}; }
      data = roadmapComputeEfficiency(Array.isArray(input.snapshots) ? input.snapshots : []);
    }
    // `roadmap`: POST-only — the roadmap page's whole computed layer: efficiency from
    // posted farm-history snapshots + current production + the buy-path simulation.
    // buildPowerSection runs first to set the shared power/roadmap context (boost items,
    // capacity, rates) — its own payload is discarded, only the context matters here.
    else if (section === "roadmap") {
      const [nftResult, exchange] = await Promise.all([fetchNfts(), fetchExchange()]);
      if (!nftResult.ok) return res.status(502).json({ error: `nfts fetch failed: ${nftResult.status}` });
      let roadmapSettings = {};
      try { roadmapSettings = req.query.roadmap ? JSON.parse(req.query.roadmap) : {}; } catch { roadmapSettings = {}; }
      buildPowerSection(farm, p2p, nftResult.data, exchange, { ...settings, roadmapSettings, savedProducts: req.query.products ? JSON.parse(req.query.products) : {} });
      let input = {};
      try { input = req.body ? JSON.parse(req.body.toString()) : {}; } catch { input = {}; }
      data = buildRoadmapSection(Array.isArray(input.snapshots) ? input.snapshots : [], { roadmapSettings, farm, p2p });
    }
    // `ascension`: the prestige-loop calculator (replaces the external cockpit that
    // read /api/power-summary): costs/levels/crystals from the game-formula port,
    // production rates from the power context, xpPerDay from the cooking engine,
    // efficiency from POSTed farm-history snapshots. Query: grinx=0|1, max=1..10.
    else if (section === "ascension") {
      const [nftResult, exchange] = await Promise.all([fetchNfts(), fetchExchange()]);
      if (!nftResult.ok) return res.status(502).json({ error: `nfts fetch failed: ${nftResult.status}` });
      const powerData = buildPowerSection(farm, p2p, nftResult.data, exchange, settings);
      const cooking = _cookingForAscension(farm, p2p, settings);
      let input = {};
      try { input = req.body ? JSON.parse(req.body.toString()) : {}; } catch { input = {}; }
      const effData = roadmapComputeEfficiency(Array.isArray(input.snapshots) ? input.snapshots : []);
      data = buildAscensionSection(farm, powerData, cooking, effData, { grinx: req.query.grinx === "1", max: req.query.max });
    }
    // `wishlist`: the cockpit's wishlist math — boosted-NFT catalog with ownership +
    // per-priority cumulative costs vs the farm's FLOWER balance. `list` query param =
    // the client's localStorage wishlist ({ "collection:name": 1|2|3 }).
    else if (section === "wishlist") {
      const nftResult = await fetchNfts();
      if (!nftResult.ok) return res.status(502).json({ error: `nfts fetch failed: ${nftResult.status}` });
      let list = {};
      try { list = req.query.list ? JSON.parse(req.query.list) : {}; } catch { list = {}; }
      data = buildWishlistSection(farm, nftResult.data, { list });
    }
    // `roi`: the ROI page's state — the page's own copy of the power fetch+rate block
    // (plus a 4th upstream, BTC/USD) and its own boost-item/pet builders. Same 502
    // semantics for the NFT list as section=power; btc is best-effort (0 on failure).
    else if (section === "roi") {
      const [nftResult, exchange, btcUsd] = await Promise.all([fetchNfts(), fetchExchange(), fetchBtc()]);
      if (!nftResult.ok) return res.status(502).json({ error: `nfts fetch failed: ${nftResult.status}` });
      // `multicat` = the client's localStorage multi-category assignments (roi page).
      let multicat = {};
      try { multicat = req.query.multicat ? JSON.parse(req.query.multicat) : {}; } catch { multicat = {}; }
      data = buildRoiSection(farm, p2p, nftResult.data, exchange, btcUsd, { ...settings, multicat });
    }
    // `buds`: valuation table over all 2621 encoded buds (SFL/day per bud, ownership).
    // `products` query param carries the client's per-category product selections
    // (localStorage), reusing the recipes-style pass-through: settings.savedProducts.
    else if (section === "buds") data = buildBudsSection(farm, p2p, { ...settings, savedProducts: req.query.products ? JSON.parse(req.query.products) : {} });
    // `pets`: the pet advisor's per-pet daily economics + raw p2p prices for the
    // page's resource tables.
    else if (section === "pets") data = buildPetsSection(farm, p2p, settings);
    // `treasury`: full-farm liquidation valuation (td rates + computeFarmValue).
    // `coinMode` (betty|api|off) picks the coins→SFL rate; `petprices` carries the
    // client's user-entered NFT pet purchase prices (localStorage).
    else if (section === "treasury") {
      const [nftResult, exchange, btcUsd] = await Promise.all([fetchNfts(), fetchExchange(), fetchBtc()]);
      if (!nftResult.ok) return res.status(502).json({ error: `nfts fetch failed: ${nftResult.status}` });
      let petPrices = {};
      try { petPrices = req.query.petprices ? JSON.parse(req.query.petprices) : {}; } catch { petPrices = {}; }
      data = buildTreasurySection(farm, p2p, nftResult.data, exchange, btcUsd, { coinMode: req.query.coinMode || "betty", petPrices });
    }
    else return res.status(400).json({ error: `unknown section: ${section}` });
    const payload = { farm: farmId, computedAt: new Date().toISOString(), section, data };
    // section=prices only (task F2-2e-fix): fetchPrices() above is best-effort and silently
    // falls back to {} on any upstream failure, so a 200 alone cannot tell the client "prices
    // genuinely loaded" from "upstream was rate-limited, data.marketValue is near-empty". The
    // client's PRICES() cache has no TTL, so caching the latter as if it were the former reads
    // 0 for every migrated price for the rest of the session. pricesOk lets the client tell
    // the two apart and treat a false as retryable instead of durable success.
    if (section === "prices") payload.pricesOk = Object.keys(p2p).length > 0;
    return res.status(200).json(payload);
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e) });
  }
}
