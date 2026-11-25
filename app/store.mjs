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
    ttl: 60_000,
    load: ({ farm }, { json }) =>
      json(`/api/proxy?url=${enc(`https://api.sunflower-land.com/community/farms/${farm}`)}`),
  },
  // The recorded weekly snapshots (tracked farms only) that let salt follow the measured harvests.
  ticketWeeks: {
    ttl: 10 * 60_000,
    load: async ({ farm }, { json }) => (await json(`/api/farm-history?type=ticket-weeks&farm=${enc(farm)}`)).weeks || null,
  },
  // The LEVELING plan inputs; POSTs the recorded weeks when there are any, as the pages always did.
  leveling: {
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

export function createStore({ fetch: f = (...a) => globalThis.fetch(...a), now = Date.now, resources = RESOURCES } = {}) {
  const entries = new Map();   // key → {query, data, status, asOf, stale, error}
  const inflight = new Map();  // key → Promise<entry>
  const subs = new Map();      // key → Set<fn>

  const settle = (key, entry) => {
    entries.set(key, entry);
    for (const fn of subs.get(key) || []) { try { fn(entry); } catch (e) { console.error("[store] subscriber", e); } }
    return entry;
  };

  function get(query, { force = false } = {}) {
    const key = keyOf(query);
    const def = resources[query.res];
    if (!def) return Promise.resolve({ data: null, status: "error", asOf: null, stale: false, error: `unknown resource ${query.res}` });
    const have = entries.get(key);
    if (!force && have && have.status === "ok" && now() - have.asOf < def.ttl) return Promise.resolve(have);
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

  const peek = (query) => entries.get(keyOf(query)) || null;

  return { get, invalidate, subscribe, peek };
}
