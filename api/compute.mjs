import { buildCookingSection } from "../core/sections/cooking.mjs";
import { buildConstantsSection } from "../core/sections/constants.mjs";
import { buildPricesSection } from "../core/sections/prices.mjs";
import { valueDiff } from "../core/sections/diff.mjs";
import { buildPowerSection } from "../core/sections/power.mjs";
import { computeBettyRate } from "../core/engine/prices.mjs";
import { API_SPEC } from "../core/api-spec.mjs";

const PROXY = process.env.PROXY_ORIGIN || "https://sunflower.sajmonium.quest";
const PRICES_URL = "https://sfl.world/api/v1/prices";
const NFTS_URL = "https://sfl.world/api/v1/nfts";
const EXCHANGE_URL = "https://sfl.world/api/v1.1/exchange";

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
const farmCache = new Map(); // farmId -> { promise, expiresAt }
const pricesCache = new Map(); // "prices" -> { promise, expiresAt } — single entry, no farm key
const nftsCache = new Map(); // "nfts" -> { promise, expiresAt } — section=power only
const exchangeCache = new Map(); // "exchange" -> { promise, expiresAt } — section=power only

// Runs `run()` at most once per TTL per key, sharing the in-flight promise across callers
// that arrive before it settles. `run()` must resolve to `{ ok, ... }`; a `{ ok: false }`
// result (or a rejection) is evicted immediately so the very next call retries against
// upstream instead of replaying the failure for the rest of the TTL.
function cachedFetch(cache, key, run) {
  // Opportunistic sweep: drop successful-but-expired entries so a warm instance serving many
  // distinct farmIds does not grow the Map without bound (only failures self-evict below).
  if (cache.size > CACHE_MAX_ENTRIES) {
    const now = Date.now();
    for (const [k, v] of cache) if (v.expiresAt <= now) cache.delete(k);
  }
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.promise;
  const entry = { promise: run(), expiresAt: Date.now() + CACHE_TTL_MS };
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

async function fetchFarm(farmId) {
  return cachedFetch(farmCache, farmId, async () => {
    const sflUrl = `https://api.sunflower-land.com/community/farms/${farmId}`;
    const r = await fetch(`${PROXY}/api/proxy?url=${encodeURIComponent(sflUrl)}`);
    if (!r.ok) return { ok: false, status: r.status };
    const wrap = await r.json();
    return { ok: true, data: wrap };
  });
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
  return cachedFetch(nftsCache, "nfts", async () => {
    const r = await fetch(`${PROXY}/api/proxy?url=${encodeURIComponent(NFTS_URL)}`);
    if (!r.ok) return { ok: false, status: r.status };
    return { ok: true, data: await r.json() };
  });
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
  });
  return result.data;
}

// Test-only hook: node:test imports this module once and runs every test in a file against
// that same instance, so the module-level caches above persist across tests unless cleared.
// Production callers never call this.
export function _clearCacheForTests() {
  farmCache.clear();
  pricesCache.clear();
  nftsCache.clear();
  exchangeCache.clear();
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
      data = buildPowerSection(farm, p2p, nftResult.data, exchange, settings);
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
