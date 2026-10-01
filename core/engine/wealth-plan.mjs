/*
 * Buy-path planner by FLOWER IN HAND at the horizon (default 5 years).
 *
 * The owner's goal is the most FLOWER earned over five years, not the most income per day forever.
 * The previous order maximised gross income over the horizon without subtracting what was spent,
 * so it bought all 133 candidates regardless of horizon; on the reference farm 74 of them never
 * earned their price back within five years (-133k FLOWER against +56k for the rest).
 *
 * Model, day by day in cash terms:
 *   - income r per day (the farm's net FLOWER/day) minus the daily BTC withdrawal of the repay
 *     plan is what can be reinvested;
 *   - a purchase happens the moment its price is saved up;
 *   - FLOWER in hand at the horizon = cash + what the NFTs bought can be sold for then.
 * Each step buys what adds the most FLOWER-at-horizon per FLOWER spent, given what is already
 * owned; the plan stops when nothing adds anything.
 *
 * BUNDLES. Some things only pay together: an ascension run where Expansion 35 adds nothing but
 * Expansion 38 behind it pays in half a year, a node that needs its tool, stalls that need
 * animals. Taken one at a time the first step never qualifies and the good one is never reached.
 * So from every candidate that does not pay on its own, a bundle is grown greedily (the next
 * chain step, or anything sharing a group with it — up to `maxBundle` items) as long as that
 * raises the bundle's gain per FLOWER; a bundle is valued as a whole: joint FLOWER/day with every
 * member owned, total price, total resale.
 *
 * Pure: the caller supplies how an item is valued against the current state and how buying (and
 * un-buying, for trial bundles) changes that state, so the synergy logic stays in the engine.
 */

/*
 * NFT resale, measured on the marketplace (2026-09-28): by floor bucket, the median realised
 * listing price against the floor (trades since July) and the floor's median change over six
 * months in FLOWER, annualised. From 10k up there is no market: 67 % (10-50k) and 100 % (50k+)
 * of items sold nothing in 30 days and the best offer sat at 22 % / 1 % of the floor, so resale
 * is taken as zero. The seller pays the 10 % marketplace fee.
 */
export const NFT_RESALE_BUCKETS = [
  { below: 100, sell: 0.99, driftPerYear: 0.81 },
  { below: 500, sell: 0.98, driftPerYear: 0.53 },
  { below: 2000, sell: 0.99, driftPerYear: 0.62 },
  { below: 10000, sell: 0.86, driftPerYear: 0.67 },
];
const SELLER_FEE = 0.10;
const TRADEABLE_TYPES = new Set(["Collectible", "Wearable"]);

/**
 * Share of the purchase price an item returns when sold `years` after buying.
 * Only marketplace NFTs resell; skills, nodes, expansions and scenarios return nothing.
 * `driftOverride` (per year, e.g. 0.9) replaces the measured drift when the owner sets one.
 */
export function resaleFactor(type, price, years, driftOverride) {
  if (!TRADEABLE_TYPES.has(type || "Collectible") || !(price > 0)) return 0;
  const b = NFT_RESALE_BUCKETS.find((x) => price < x.below);
  if (!b) return 0;
  const drift = (typeof driftOverride === "number" && driftOverride >= 0) ? driftOverride : b.driftPerYear;
  return b.sell * (1 - SELLER_FEE) * Math.pow(drift, Math.max(0, years));
}

/**
 * @param {Array} cands  candidates: { price, type, chainId?, chainSeq? } — any extra fields pass through
 * @param {object} o
 *   startIncome     farm FLOWER/day now
 *   withdrawPerDay  FLOWER/day taken out (repay plan), not reinvested
 *   horizonDays     planning horizon
 *   startCash       FLOWER available now (default 0)
 *   driftOverride   optional NFT value change per year
 *   valueOf(c)      FLOWER/day the candidate adds given everything bought so far
 *   buy(c)          mark it owned (so later valueOf calls see it)
 *   unbuy(c)        undo buy(c) — needed for trial bundles; without it bundles are off
 *   groups(c)       keys of what c interacts with (e.g. its categories); default: one shared group
 *   maxBundle       largest bundle tried (default 4; 1 = no bundles)
 *   maxChainRun     longest run of one chain in a bundle (default 8)
 *   minReturn       smallest gain by the horizon, as a share of the price, that counts as paying
 *                   back (default 0). 0.1 = an item must add at least 10 % of what it costs.
 *   resources       limited inputs a candidate may also need, e.g.
 *                     { obsidian: { stock, perDay, market, unitCost } } with c.res = { obsidian: n }.
 *                   c.price already counts n x unitCost. A purchase waits until enough is made,
 *                   or buys the shortfall at `market` — whichever leaves more FLOWER at H.
 * @returns {{ steps, left, wealth, cash, resale, days }}
 *   steps: [{ c, gain (FLOWER/day), atDay, rate, cumCost, horizonGain, resale, bundle? }]
 *   left:  [{ c, gain, horizonGain }] — worth something per day, but not within the horizon
 */
export function planByWealth(cands, o) {
  const H = o.horizonDays;
  /*
   * "Pays back" = gains more than minReturn x price by the horizon. A sliver above zero (+2 % in
   * five years on 3,000 FLOWER) is a coin flip on the price model, not a purchase worth making,
   * so the owner set a floor; such items go to `left` like any other that does not pay.
   */
  const minRet = Math.max(0, o.minReturn || 0);
  const pays = (ev) => !!ev && ev.horizonGain > minRet * Math.max(0, ev.price || 0);
  const withdraw = Math.max(0, o.withdrawPerDay || 0);
  const maxBundle = o.unbuy ? Math.max(1, o.maxBundle || 4) : 1;
  // A chain run (ascension expansions, skill ranks) may be longer: 35 -> 38 is four steps and
  // the one that pays can sit further down. Only chain steps may take a bundle past maxBundle.
  const maxChainRun = o.unbuy ? Math.max(maxBundle, o.maxChainRun || 8) : 1;
  const groupsOf = o.groups || (() => ["all"]);
  let t = 0, cash = Math.max(0, o.startCash || 0), rate = Math.max(0, o.startIncome || 0), cum = 0;
  const net = () => rate - withdraw;
  const rem = new Set(cands);
  const val = new Map();
  const value = (c) => Math.max(0, o.valueOf(c));
  for (const c of rem) val.set(c, value(c));
  /*
   * Limited inputs. Obsidian priced at production cost made the plan buy 49 nodes by day 405,
   * needing 6,822 obsidian from a farm that makes 4.45 a day (1,533 days' worth). A resource is
   * made at `perDay`; what a purchase needs beyond the stock either waits for production or is
   * bought on the market, and the planner takes whichever leaves more FLOWER at the horizon.
   */
  const resources = o.resources || {};
  const used = {};
  for (const k of Object.keys(resources)) used[k] = 0;
  const stockAt = (k, time) => (resources[k].stock || 0) + (resources[k].perDay || 0) * time - used[k];
  const needsOf = (list) => {
    const n = {};
    for (const c of list) for (const [k, q] of Object.entries(c.res || {})) if (resources[k] && q > 0) n[k] = (n[k] || 0) + q;
    return n;
  };
  const nextInChain = {};
  // Eligible given the chain steps already bought plus those earlier in `bundle`.
  const eligible = (c, bundle) => {
    if (!c.chainId) return true;
    const done = (nextInChain[c.chainId] || 0) + (bundle ? bundle.filter((x) => x.chainId === c.chainId).length : 0);
    return done === c.chainSeq;
  };
  // FLOWER in hand at H that buying `list` (jointly adding `g`/day) as soon as affordable adds.
  const evaluate = (list, g) => {
    if (!(g > 0)) return null;
    const p0 = list.reduce((s, c) => s + c.price, 0);
    const r = net();
    const cashAt = (p) => t + (cash >= p ? 0 : (r > 0 ? (p - cash) / r : Infinity));
    const needs = needsOf(list);
    const option = (p, at, bought) => {
      if (!(at < H)) return null;
      const resale = list.reduce((s, c) => s + c.price * resaleFactor(c.type, c.price, (H - at) / 365, o.driftOverride), 0);
      const horizonGain = g * (H - at) - p + resale;
      // waiting on an INPUT rather than on cash: taking it now would idle the cash until then
      const inputBound = at > cashAt(p) + 1e-9;
      return { at, wait: at - t, horizonGain, resale, price: p, bought, inputBound, score: horizonGain / Math.max(p, 1e-9) };
    };
    // a) wait until the inputs are made
    let atWait = cashAt(p0);
    for (const [k, q] of Object.entries(needs)) {
      const short = q - stockAt(k, t);
      if (short > 0) atWait = Math.max(atWait, resources[k].perDay > 0 ? t + short / resources[k].perDay : Infinity);
    }
    let best = option(p0, atWait, null);
    // b) buy the shortfall on the market
    let extra = 0; const bought = {};
    for (const [k, q] of Object.entries(needs)) {
      const short = q - Math.max(0, stockAt(k, t));
      if (short > 0 && resources[k].market > 0) { extra += short * (resources[k].market - (resources[k].unitCost || 0)); bought[k] = short; }
      else if (short > 0) { extra = Infinity; }
    }
    if (Object.keys(bought).length && isFinite(extra)) {
      const alt = option(p0 + extra, cashAt(p0 + extra), bought);
      if (alt && (!best || alt.horizonGain > best.horizonGain)) best = alt;
    }
    return best;
  };
  // Members of each group, among what is left — the pool a bundle may grow from.
  const groupIndex = () => {
    const idx = new Map();
    for (const c of rem) for (const k of groupsOf(c)) { if (!idx.has(k)) idx.set(k, []); idx.get(k).push(c); }
    return idx;
  };
  // Grow the best bundle starting at `start` (which does not pay on its own). Returns the bundle
  // (members + joint FLOWER/day) or null, plus the groups and chains it looked at — its cache key.
  const growBundle = (start, idx) => {
    const keys = new Set(groupsOf(start)), chains = new Set(start.chainId ? [start.chainId] : []);
    const list = [start];
    o.buy(start);
    let g = val.get(start);
    let best = evaluate(list, g);
    let bestList = best ? list.slice() : null, bestG = g;
    try {
      while (list.length < maxChainRun) {
        const pool = new Set();
        for (const m of list) for (const k of groupsOf(m)) for (const c of (idx.get(k) || [])) pool.add(c);
        // the next step of any chain in the bundle is always a candidate, whatever its group
        for (const c of rem) if (c.chainId && list.some((m) => m.chainId === c.chainId)) pool.add(c);
        let pick = null, pickEv = null, pickG = 0;
        for (const c of pool) {
          if (list.includes(c) || !eligible(c, list)) continue;
          const chainNext = !!(c.chainId && list.some((m) => m.chainId === c.chainId));
          if (list.length >= maxBundle && !chainNext) continue;
          /*
           * A bundle holds only what belongs to it: the next step of its chain, or something that
           * does not pay on its own either. A strong single (Sir Goldensnout) got folded into an
           * unrelated ascension run just because it lifted the average, and showed as "+0"; it is
           * bought on its own instead, and any synergy is picked up by the re-valuation after.
           */
          if (!chainNext) { const alone = evaluate([c], val.get(c)); if (pays(alone)) continue; }
          const gc = trialValue(c, list);
          const ev = evaluate(list.concat(c), g + gc);
          if (ev && (!pickEv || ev.score > pickEv.score)) { pick = c; pickEv = ev; pickG = gc; }
        }
        if (!pick) break;
        list.push(pick); o.buy(pick); g += pickG;
        for (const k of groupsOf(pick)) keys.add(k);
        if (pick.chainId) chains.add(pick.chainId);
        if (!best || pickEv.score > best.score) { best = pickEv; bestList = list.slice(); bestG = g; }
      }
    } finally {
      for (let i = list.length - 1; i >= 0; i--) o.unbuy(list[i]);
    }
    const res = (!pays(best) || !bestList || bestList.length < 2) ? null : { list: bestList, g: bestG };
    return { res, keys, chains };
  };
  /*
   * Bundles are cached per starting item and dropped only when a purchase touches one of the
   * groups or chains the bundle looked at: growing every bundle again after every purchase made
   * the roadmap 25x slower. A cached bundle is re-evaluated against today's cash and date.
   */
  const bundleCache = new Map();
  // An item's value with a trial set bought depends only on that set (the rest of the state is
  // fixed within a step), so it is memoised per step on (item, set).
  let trialMemo = new Map();
  const ids = new Map(); cands.forEach((c, i) => ids.set(c, i));
  const trialValue = (c, list) => {
    const key = ids.get(c) + ":" + list.map((m) => ids.get(m)).sort((a, b) => a - b).join(",");
    let v = trialMemo.get(key);
    if (v === undefined) { v = value(c); trialMemo.set(key, v); }
    return v;
  };

  const steps = [];
  /*
   * A candidate that waits on an input (obsidian) rather than on cash is not taken while
   * something else can use the cash now: taking it would jump the clock to the day the input is
   * ready and idle the cash in between. It is taken once nothing else is buyable, which is when
   * the clock may advance to it.
   */
  const better = (ev, cur) => !cur || (!!cur.inputBound !== !!ev.inputBound ? !ev.inputBound : ev.score > cur.score);
  for (let guard = 0; guard < 5000 && rem.size; guard++) {
    let bestList = null, bestEv = null;
    const lonely = [];
    for (const c of rem) {
      if (!eligible(c, null)) continue;
      const ev = evaluate([c], val.get(c));
      if (pays(ev)) {
        if (better(ev, bestEv)) { bestList = [c]; bestEv = ev; }
      } else lonely.push(c);
    }
    if (maxBundle > 1 && lonely.length) {
      let idx = null;
      for (const c of lonely) {
        let e = bundleCache.get(c);
        if (!e) { idx = idx || groupIndex(); e = growBundle(c, idx); bundleCache.set(c, e); }
        if (!e.res) continue;
        const ev = evaluate(e.res.list, e.res.g);
        if (pays(ev) && better(ev, bestEv)) { bestList = e.res.list; bestEv = ev; }
      }
    }
    if (!bestList) break;
    cash += net() * bestEv.wait;
    t = bestEv.at;
    cash -= bestEv.price;
    const bundle = bestList.length > 1;
    for (const [k, q] of Object.entries(needsOf(bestList))) used[k] += q - ((bestEv.bought && bestEv.bought[k]) || 0);
    for (const c of bestList) {
      const g = value(c);                       // in bundle order: each sees the ones before it
      rate += g; cum += c.price;
      o.buy(c);
      rem.delete(c);
      if (c.chainId) nextInChain[c.chainId] = (nextInChain[c.chainId] || 0) + 1;
      const resale = c.price * resaleFactor(c.type, c.price, (H - t) / 365, o.driftOverride);
      steps.push({ c, gain: g, atDay: t, rate, cumCost: cum, horizonGain: bundle ? null : bestEv.horizonGain, resale, bundle: bundle ? bestList.length : 0 });
    }
    if (bundle) {
      // A bundle's gain belongs to the bundle; the first row carries it so the column still adds up.
      steps[steps.length - bestList.length].horizonGain = bestEv.horizonGain;
      for (let i = steps.length - bestList.length + 1; i < steps.length; i++) steps[i].horizonGain = 0;
    }
    // Re-value what shares a group with anything just bought.
    const touched = new Set();
    for (const b of bestList) for (const k of groupsOf(b)) touched.add(k);
    for (const c of rem) if (groupsOf(c).some((k) => touched.has(k))) val.set(c, value(c));
    trialMemo = new Map();
    const boughtChains = new Set(bestList.filter((b) => b.chainId).map((b) => b.chainId));
    for (const [start, e] of bundleCache) {
      if (!rem.has(start) || [...e.keys].some((k) => touched.has(k)) || [...e.chains].some((ch) => boughtChains.has(ch))
          || (e.res && e.res.list.some((m) => !rem.has(m)))) bundleCache.delete(start);
    }
  }
  // Worth something per day but not within the horizon: what buying it next would do by H.
  const left = [];
  for (const c of rem) {
    const g = val.get(c);
    if (!(g > 0)) continue;
    const ev = evaluate([c], g);
    left.push({ c, gain: g, horizonGain: ev ? ev.horizonGain : -c.price });
  }
  left.sort((a, b) => b.horizonGain - a.horizonGain);
  const endCash = cash + net() * Math.max(0, H - t);
  const resale = steps.reduce((s, x) => s + x.resale, 0);
  return { steps, left, wealth: endCash + resale, cash: endCash, resale, days: t };
}
