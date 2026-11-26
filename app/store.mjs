// The page's data layer. Widgets ask for a resource ({res, ...params}); the store answers from
// memory while the entry is fresh, otherwise fetches it once however many widgets ask at the same
// time. A result always resolves, never rejects:
//   { data, status: "ok" | "error", asOf, stale, error? }
// A failed refresh keeps the last good data (stale: true) so a panel can show it with a warning
// instead of going blank.

async function fetchJson(f, url, init) {
  const r = await f(url, init);
  if (!r.ok) throw new Error(`${url.split("?")[0]} ${r.status}`);
  return r.json();
}

const enc = encodeURIComponent;

// ttl in ms. load(params, {json, get}) returns the data; get() reads another resource through the
// same store, so a dependency is shared and deduplicated too.
export const RESOURCES = {
  farm: {
    persist: true,
    ttl: 60_000,
    load: ({ farm }, { json }) =>
      json(`/api/proxy?url=${enc(`https://api.sunflower-land.com/community/farms/${farm}`)}`),
  },
  // The recorded weekly snapshots (tracked farms only) that let salt follow the measured harvests.
  ticketWeeks: {
    ttl: 10 * 60_000,
    load: async ({ farm }, { json }) => (await json(`/api/farm-history?type=ticket-weeks&farm=${enc(farm)}`)).weeks || null,
  },
  // The marketplace book (floors f / bids b per item, buds included), from the community activity.
  book: {
    persist: true,
    ttl: 5 * 60_000,
    load: (_, { json }) => json("/api/marketplace-orderbook?book=1"),
  },
  // TICKETY: section=tickets, with the recorded weeks POSTed like the page does.
  tickets: {
    persist: true,
    ttl: 5 * 60_000,
    load: async ({ farm }, { json, get }) => {
      const weeks = (await get({ res: "ticketWeeks", farm })).data;
      const url = `/api/compute?farm=${enc(farm)}&section=tickets`;
      const body = weeks && weeks.length
        ? await json(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ weeks }) })
        : await json(url);
      return body.data || null;
    },
  },
  // WORLD: one cached aggregate (the charts' buckets) and the viewer's own row. The data is a daily dump.
  worldAgg: {
    persist: true,
    ttl: 30 * 60_000,
    // active: the activity window in days (90 / 30), absent = every farm in the dataset
    load: async ({ group, limit, active }, { json }) =>
      (await json(`/api/farm-history?type=world&mode=agg&group=${enc(group)}${limit ? `&limit=${enc(limit)}` : ""}` +
        `${active ? `&active_days=${enc(active)}` : ""}`)).rows || [],
  },
  // WORLD: the dataset stats (farm counts, activity, the daily dump's provenance).
  worldStats: {
    persist: true,
    ttl: 30 * 60_000,
    load: async (_, { json }) => {
      const d = await json("/api/farm-history?type=world&mode=stats");
      if (d && d.error) throw new Error(d.error);
      return d;
    },
  },
  // WORLD: one buyable node type's T1-equivalent distribution (with the viewer's own count).
  worldNodes: {
    persist: true,
    ttl: 30 * 60_000,
    load: async ({ node, active, farm }, { json }) => {
      const d = await json(`/api/farm-history?type=world&mode=nodes&node=${enc(node)}${active ? `&active_days=${enc(active)}` : ""}` +
        `${farm ? `&farm=${enc(farm)}` : ""}`);
      if (d && d.error) throw new Error(d.error);
      return d;
    },
  },
  // WORLD: the viewer's auction-priority rank (ascension, level, XP) and the 50 farms just ahead.
  worldPrio: {
    ttl: 30 * 60_000,
    load: async ({ farm }, { json }) => {
      const d = await json(`/api/farm-history?type=world&mode=priority&farm=${enc(farm)}`);
      if (d && d.error) throw new Error(d.error);
      return d;
    },
  },
  worldMe: {
    persist: true,
    ttl: 30 * 60_000,
    load: ({ farm }, { json }) => json(`/api/farm-history?type=world&mode=farm&farm=${enc(farm)}`),
  },
  // Boosted-NFT flips from the stored orderbook (farm-independent).
  flips: {
    persist: true,
    ttl: 10 * 60_000,
    load: (_, { json }) => json("/api/marketplace-orderbook?flips=1&sort=score"),
  },
  // The farm valuation (TREASURY): section=treasury with the page's coin mode and pet prices, read
  // from the page's own keys at load time (a change shows after the TTL or a ↻).
  treasury: {
    persist: true,
    ttl: 5 * 60_000,
    load: async ({ farm }, { json }) => {
      const ls = globalThis.localStorage;
      const pick = (k, d) => { try { return (ls && ls.getItem(k)) || d; } catch { return d; } };
      const body = await json(`/api/compute?farm=${enc(farm)}&section=treasury&coinMode=${enc(pick("sfl_coin_mode", "betty"))}` +
        `&petprices=${enc(pick("sfl_pet_prices_v1", "{}"))}`);
      const d = body.data || {};
      return { value: d.value || null, coinMode: d.coinMode, pricesOk: body.pricesOk !== false };
    },
  },
  // Any compute section (POWER, ROADMAP, BUMPKIN…): { farm, section, q?: {extra query params} }.
  // The answer's data, with the answer's pricesOk carried along (false = market prices failed).
  compute: {
    persist: true,
    ttl: 5 * 60_000,
    load: async ({ farm, section, q = {} }, { json }) => {
      if (!section) throw new Error("compute: no section");
      const extra = Object.keys(q).sort().map((k) => `&${enc(k)}=${enc(q[k])}`).join("");
      // the upstream farm fetch behind /api/compute is intermittently flaky (502): two retries
      let body;
      for (let attempt = 0; ; attempt++) {
        try { body = await json(`/api/compute?farm=${enc(farm)}&section=${enc(section)}${extra}`); break; }
        catch (e) { if (attempt >= 2) throw e; await new Promise((r) => setTimeout(r, 400 * (attempt + 1))); }
      }
      const d = body.data;
      return d && typeof d === "object" && !Array.isArray(d) ? { ...d, pricesOk: body.pricesOk !== false } : d;
    },
  },
  // The ASCENSION plan: section=ascension with the BUMPKIN page's recipe pick (recipes: its JSON; else
  // the server assumes every kitchen cooks) and the last week's farm-history snapshots POSTed for the measured
  // production, as the page always sent it; a flaky upstream (502) gets two more tries.
  ascension: {
    persist: true,
    ttl: 5 * 60_000,
    load: async ({ farm, grinx, recipes }, { json }) => {
      let snapshots = [];
      try {
        const from = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10), to = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
        const h = await json(`/api/farm-history?farm=${enc(farm)}&from=${from}&to=${to}&limit=2000`);
        snapshots = (h.snapshots || []).map((sn) => ({ captured_at: sn.captured_at,
          diff: Object.fromEntries(Object.entries(sn.diff || {}).filter(([k]) => k.startsWith("_h."))) }));
      } catch { /* no history: the plan runs on theoretical production */ }
      const url = `/api/compute?farm=${enc(farm)}&section=ascension&grinx=${grinx ? 1 : 0}&max=10&recipes=${enc(recipes || "{}")}`;
      const init = { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ snapshots }) };
      for (let attempt = 1; ; attempt++) {
        try { return (await json(url, init)).data || null; } catch (e) {
          if (attempt >= 3) throw e;
          await new Promise((r) => setTimeout(r, 1000 * attempt));
        }
      }
    },
  },
  // ROADMAP: the last 7 days of farm-history slimmed to the _h.* diff slices section=roadmap
  // measures the harvest efficiency from ([] when there is no history).
  roadmapHistory: {
    ttl: 10 * 60_000,
    load: async ({ farm }, { json }) => {
      const day = (ms) => new Date(ms).toISOString().slice(0, 10);
      const now = Date.now();
      let d;
      try { d = await json(`/api/farm-history?farm=${enc(farm)}&from=${day(now - 7 * 86400000)}&to=${day(now + 86400000)}&limit=2000`); }
      catch { return []; }
      return (d.snapshots || []).map((sn) => ({ captured_at: sn.captured_at,
        diff: Object.fromEntries(Object.entries(sn.diff || {}).filter(([k]) => k.startsWith("_h."))) }));
    },
  },
  // Listed buds' marketplace floors { "<id>": floor } ({} when the book is unreachable).
  budFloors: {
    ttl: 10 * 60_000,
    load: async (_, { json }) => {
      const floors = {};
      try { for (const i of (await json("/api/marketplace-orderbook?budfloors=1")).items || []) floors[i.id] = i.floor; }
      catch { /* no buds on the buy path */ }
      return floors;
    },
  },
  // ROADMAP: section=roadmap POSTed with the history, the bud floors and the recorded weeks, and the
  // page's own settings read from its keys at load time (the product picks, sfl_roadmap_settings;
  // no typed BTC withdrawal = the repay plan's daily one), exactly as the ROADMAP page sends them.
  roadmap: {
    ttl: 5 * 60_000,
    load: async ({ farm }, { json, get }) => {
      const ls = globalThis.localStorage;
      const read = (k) => { try { return ls ? ls.getItem(k) : null; } catch { return null; } };
      let s = {};
      try { s = JSON.parse(read("sfl_roadmap_settings") || "{}") || {}; } catch { s = {}; }
      if (!(typeof s.withdrawPerDay === "number" && s.withdrawPerDay >= 0)) {
        const auto = parseFloat(read("sfl_repay_daily_flower"));
        if (isFinite(auto) && auto > 0) s.withdrawPerDay = auto;
      }
      let products = {};
      try { products = JSON.parse(read("sfl_power_products") || "{}") || {}; } catch { products = {}; }
      const [h, b, w] = await Promise.all([get({ res: "roadmapHistory", farm }), get({ res: "budFloors" }), get({ res: "ticketWeeks", farm })]);
      const body = await json(`/api/compute?farm=${enc(farm)}&section=roadmap&products=${enc(JSON.stringify(products))}&roadmap=${enc(JSON.stringify(s))}`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ snapshots: h.data || [], budFloors: b.data || {}, weeks: w.data || [] }),
      });
      return body.data || null;
    },
  },
  // The LEVELING plan inputs; POSTs the recorded weeks when there are any, as the pages always did.
  leveling: {
    persist: true,
    ttl: 5 * 60_000,
    load: async ({ farm }, { json, get }) => {
      const weeks = (await get({ res: "ticketWeeks", farm })).data;
      const url = `/api/compute?farm=${enc(farm)}&section=leveling`;
      const body = weeks && weeks.length
        ? await json(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ weeks }) })
        : await json(url);
      return body.data || null;
    },
  },
};

export function keyOf(query) {
  return JSON.stringify(Object.keys(query).sort().map((k) => [k, query[k]]));
}

// Instant first paint: a resource marked `persist` keeps its last good result in `persist`
// (localStorage on the page) under sfl_wcache:<key>. After a reload, peek/get start from it, with
// its real age, and get refreshes it as usual once it is older than the TTL. Older than
// PERSIST_MAX_AGE it is not shown at all; storage errors (full, broken JSON) are ignored.
const PERSIST_PREFIX = "sfl_wcache:";
const PERSIST_MAX_AGE = 12 * 3600_000;

export function createStore({ fetch: f = (...a) => globalThis.fetch(...a), now = Date.now, resources = RESOURCES, persist = null } = {}) {
  const entries = new Map();   // key → {query, data, status, asOf, stale, error}
  const inflight = new Map();  // key → Promise<entry>
  const subs = new Map();      // key → Set<fn>

  // Drop saved results too old to show (or unreadable), so storage holds only what can be used.
  if (persist && typeof persist.key === "function") {
    try {
      const old = [];
      for (let i = 0; i < persist.length; i++) {
        const k = persist.key(i);
        if (!k || !k.startsWith(PERSIST_PREFIX)) continue;
        let asOf = NaN;
        try { asOf = JSON.parse(persist.getItem(k)).asOf; } catch { /* unreadable */ }
        if (!Number.isFinite(asOf) || now() - asOf > PERSIST_MAX_AGE) old.push(k);
      }
      for (const k of old) persist.removeItem(k);
    } catch { /* storage unavailable */ }
  }
  const persisted = (query) => !!(persist && resources[query.res] && resources[query.res].persist);
  function restore(key, query) {
    if (!persisted(query)) return null;
    try {
      const saved = JSON.parse(persist.getItem(PERSIST_PREFIX + key));
      if (!saved || !Number.isFinite(saved.asOf) || now() - saved.asOf > PERSIST_MAX_AGE) return null;
      const entry = { query, data: saved.data, status: "ok", asOf: saved.asOf, stale: false, restored: true };
      entries.set(key, entry);
      return entry;
    } catch { return null; }
  }
  const have = (key, query) => entries.get(key) || restore(key, query);

  const settle = (key, entry) => {
    entries.set(key, entry);
    if (entry.status === "ok" && persisted(entry.query)) {
      try { persist.setItem(PERSIST_PREFIX + key, JSON.stringify({ asOf: entry.asOf, data: entry.data })); } catch { /* full: no instant paint */ }
    }
    for (const fn of subs.get(key) || []) { try { fn(entry); } catch (e) { console.error("[store] subscriber", e); } }
    return entry;
  };

  function get(query, { force = false } = {}) {
    const key = keyOf(query);
    const def = resources[query.res];
    if (!def) return Promise.resolve({ data: null, status: "error", asOf: null, stale: false, error: `unknown resource ${query.res}` });
    const cur = have(key, query);
    if (!force && cur && cur.status === "ok" && now() - cur.asOf < def.ttl) return Promise.resolve(cur);
    if (inflight.has(key)) return inflight.get(key);
    const { res, ...params } = query;
    const p = (async () => {
      try {
        const data = await def.load(params, { json: (url, init) => fetchJson(f, url, init), get });
        return settle(key, { query, data, status: "ok", asOf: now(), stale: false });
      } catch (e) {
        const prev = entries.get(key);
        return settle(key, {
          query, data: prev ? prev.data : null, status: "error", asOf: prev ? prev.asOf : null,
          stale: !!prev, error: String((e && e.message) || e),
        });
      } finally {
        inflight.delete(key);
      }
    })();
    inflight.set(key, p);
    return p;
  }

  // Drops cached entries (all, or those whose params match every given field) so the next get refetches.
  function invalidate(match = {}) {
    for (const [key, e] of entries) {
      if (Object.entries(match).every(([k, v]) => String(e.query[k]) === String(v))) entries.delete(key);
    }
  }

  function subscribe(query, fn) {
    const key = keyOf(query);
    if (!subs.has(key)) subs.set(key, new Set());
    subs.get(key).add(fn);
    return () => subs.get(key).delete(fn);
  }

  const peek = (query) => have(keyOf(query), query) || null;

  return { get, invalidate, subscribe, peek };
}
