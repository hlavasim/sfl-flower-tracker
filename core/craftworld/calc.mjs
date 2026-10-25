/*
 * CRAFT WORLD — the arithmetic behind the /craftworld page. Pure functions over:
 *   factories  core/craftworld/factories.json (.factories), every factory with all its levels
 *              (output, duration, power, XP, inputs, upgrade cost) — the game's data via RAWRTools
 *   prices     { SYMBOL: price in COIN } from the Katana RESOURCE/COIN pools
 *   base       the owner's base as transcribed from screenshots: { buildings: [{ slug, level }] }
 *
 * The in-game Exchange charges 2.5 % a trade, so turning an input into an output by trading
 * (sell input, buy output) costs ~5 %, against which crafting is measured.
 */

export const EXCHANGE_FEE = 0.025;

/*
 * Masterpiece contribution: the power cost of each unit rises by tier within a reset window
 * (Iron Clash II screenshot 2026-10-24: 5 / 7 / 13 / 25 / 50 power, tiers at 50 / 250 / 625 / 1,300).
 */
export const MASTERPIECE_TIERS = [
  { upTo: 50, power: 5 }, { upTo: 250, power: 7 }, { upTo: 625, power: 13 }, { upTo: 1300, power: 25 }, { upTo: Infinity, power: 50 },
];

const sym = (s) => String(s || "").toUpperCase().replace(/\s+/g, "");

/** COIN value of a list of { symbol, amount }; null when any price is missing. */
export function bagValue(bag, prices) {
  let v = 0;
  for (const x of bag || []) {
    const p = prices[sym(x.symbol)];
    if (p == null) return null;
    v += x.amount * p;
  }
  return v;
}

/** The output symbol of a factory: its own name as the market spells it (Paper Wrap -> PAPERWRAP). */
export const outputSymbol = (factory) => sym(factory.name);

/**
 * One factory level, valued:
 *   ratio       output value ÷ input value (> 1: crafting adds value)
 *   lossPerDay  COIN destroyed per day by crafting (negative = gained)
 *   xpPerPower  XP per unit of power
 *   xpPerCoin   XP per COIN lost (Infinity when crafting gains)
 *   verdict     what to do with the output: "craft" | "either" | "buy"
 */
export function levelEconomics(factory, lv, prices) {
  const L = factory.levels.find((x) => x.level === lv) || factory.levels[0];
  const outP = prices[outputSymbol(factory)];
  const inV = bagValue(L.inputs, prices);
  const outV = outP == null ? null : L.output * outP;
  const runsPerDay = L.output ? L.productionPerDay / L.output : 0;
  const ratio = inV && outV != null ? outV / inV : null;
  const lossPerDay = inV != null && outV != null ? runsPerDay * (inV - outV) : null;
  const xpPerPower = L.powerCost ? (L.xpPerOutput * L.output) / L.powerCost : null;
  const xpPerCoin = lossPerDay == null ? null : lossPerDay <= 0 ? Infinity : L.xpPerDay / lossPerDay;
  // Trading the input for the output costs two fees; crafting is worth it while it loses less.
  const tradeRatio = (1 - EXCHANGE_FEE) / (1 + EXCHANGE_FEE);
  const verdict = ratio == null ? null : ratio >= 1 ? "craft" : ratio >= tradeRatio ? "either" : "buy";
  return { level: L.level, ratio, lossPerDay, xpPerDay: L.xpPerDay, xpPerPower, xpPerCoin, verdict, inV, outV, runsPerDay };
}

/** Every factory at level 1 (or the owned level), valued — the market table. */
export function marketTable(factories, prices, base) {
  const owned = Object.fromEntries((base && base.buildings || []).map((b) => [b.slug, b.level]));
  return Object.entries(factories)
    .map(([slug, f]) => ({ slug, name: f.name, owned: slug in owned, ...levelEconomics(f, owned[slug] || 1, prices) }))
    .filter((r) => r.ratio != null)
    .sort((a, b) => b.ratio - a.ratio);
}

/** XP sources the owner has, best XP per COIN lost first. */
export function xpSources(factories, prices, base) {
  return (base && base.buildings || [])
    .filter((b) => factories[b.slug])
    .map((b) => ({ slug: b.slug, name: factories[b.slug].name, level: b.level || 1, ...levelEconomics(factories[b.slug], b.level || 1, prices) }))
    .sort((a, b) => (b.xpPerCoin ?? -1) - (a.xpPerCoin ?? -1));
}

/**
 * Next upgrade of every owned factory: its cost in COIN, the XP/day and production/day it adds,
 * and XP/day gained per COIN spent — the order to upgrade in when levelling is the goal.
 */
export function upgradePlan(factories, prices, base) {
  const out = [];
  for (const b of base && base.buildings || []) {
    const f = factories[b.slug];
    if (!f || !b.level) continue;
    const cur = f.levels.find((x) => x.level === b.level), next = f.levels.find((x) => x.level === b.level + 1);
    if (!cur || !next) continue;
    const cost = bagValue(next.upgradeCost, prices);
    const dXp = next.xpPerDay - cur.xpPerDay;
    out.push({ slug: b.slug, name: f.name, from: b.level, to: next.level, cost, upgradeCost: next.upgradeCost,
      dXpPerDay: dXp, dProdPerDay: next.productionPerDay - cur.productionPerDay, dPower: next.powerCost - cur.powerCost,
      xpPerCoin: cost ? dXp / cost : null });
  }
  return out.sort((a, b) => (b.xpPerCoin ?? -1) - (a.xpPerCoin ?? -1));
}

/**
 * A Masterpiece contribution of `qty` units, `already` given in this reset window: power it costs,
 * XP it earns (xpPerUnit each) and XP per power, split by tier.
 */
export function masterpieceCost(qty, xpPerUnit, already = 0, tiers = MASTERPIECE_TIERS) {
  let power = 0, done = already, left = qty;
  const parts = [];
  let lo = 0;
  for (const t of tiers) {
    const room = Math.max(0, t.upTo - Math.max(done, lo));
    const take = Math.min(left, room);
    if (take > 0) { power += take * t.power; parts.push({ upTo: t.upTo, units: take, power: take * t.power, xpPerPower: xpPerUnit / t.power }); done += take; left -= take; }
    lo = t.upTo;
    if (left <= 0) break;
  }
  return { power, xp: qty * xpPerUnit, xpPerPower: power ? (qty * xpPerUnit) / power : null, parts };
}

/** How many units to give before the next unit's XP per power drops below `benchmark`. */
export function masterpieceStop(xpPerUnit, benchmark, already = 0, tiers = MASTERPIECE_TIERS) {
  let stop = already;
  for (const t of tiers) {
    if (xpPerUnit / t.power < benchmark) break;
    stop = Math.max(stop, t.upTo);
  }
  return Math.max(0, (stop === Infinity ? Infinity : stop) - already);
}

/** Katana pool rows -> { SYMBOL: price in COIN }, keeping the deepest pool per symbol. */
export function pricesFromPools(pools) {
  const best = {};
  for (const p of pools || []) {
    const a = p.attributes || p;
    const m = String(a.name || "").replace(/\s+\d+(\.\d+)?%$/, "").split("/").map((s) => s.trim().toUpperCase());
    if (m.length !== 2) continue;
    let [base, quote] = m, price = parseFloat(a.base_token_price_quote_token);
    if (base === "COIN" && quote !== "COIN") { [base, quote] = [quote, base]; price = parseFloat(a.quote_token_price_base_token); }
    if (quote !== "COIN" || !(price > 0)) continue;
    const tvl = parseFloat(a.reserve_in_usd) || 0;
    if (!best[base] || tvl > best[base].tvl) best[base] = { price, tvl, vol: parseFloat((a.volume_usd || {}).h24) || 0 };
  }
  return best;
}

/*
 * TOWN HALL PLAN — for every Town Hall level above the current one: the Town Hall upgrade itself
 * (player level, cost, time, power after) and everything that level opens in the other buildings
 * (buildings/*.json tables carry a "TH req." per building level): a building appearing for the
 * first time, or further levels of one already open, with their costs and what the top level gives.
 *   buildings  core/craftworld/buildings.json (.buildings)
 */
const CTRL = new Set(["Lv", "TH req.", "Player lv req.", "Upgrade time", "Upgrade cost"]);
const cellNum = (c) => typeof c === "string" ? parseFloat(c.replace(/,/g, "")) * (/k$/i.test(c) ? 1e3 : /m$/i.test(c) ? 1e6 : 1) : NaN;

function buildingRows(b) {
  const t = b.tables && b.tables[0];
  if (!t) return [];
  const H = t.headers.map((h) => typeof h === "string" ? h : "");
  const ix = (name) => H.indexOf(name);
  return t.rows.map((r) => ({
    lv: cellNum(r[ix("Lv")]),
    th: ix("TH req.") >= 0 ? cellNum(r[ix("TH req.")]) : null,
    player: ix("Player lv req.") >= 0 ? cellNum(r[ix("Player lv req.")]) : null,
    time: ix("Upgrade time") >= 0 ? r[ix("Upgrade time")] : null,
    cost: ix("Upgrade cost") >= 0 && r[ix("Upgrade cost")] && r[ix("Upgrade cost")].items ? r[ix("Upgrade cost")].items : [],
    effect: Object.fromEntries(H.map((h, i) => [h, r[i]]).filter(([h, v]) => h && !CTRL.has(h) && typeof v === "string")),
  })).filter((r) => isFinite(r.lv));
}

const addBag = (into, items) => { for (const x of items) into[x.symbol] = (into[x.symbol] || 0) + x.amount; return into; };

/*
 * For every Town Hall level n above the current one, three blocks — the way the game's own
 * upgrade screen and the base read:
 *   upgrade        the Town Hall upgrade itself
 *   newBuildings   every building that is new at n, and every EXTRA copy of one the base already
 *                  has ("Max count" rises) — each placed at level 1, at level 1's cost
 *   upgrades       every building with levels to gain at n: copies already standing go from the
 *                  previous Town Hall's cap to the new cap; new copies go from 1 to the new cap
 * Copies already standing are assumed at the previous cap (the owner's actual levels are not
 * known to this function).
 */
export function thPlan(buildings, prices, curTH, playerLevel) {
  const th = buildingRows(buildings["town-hall"] || { tables: [] });
  const maxTH = th.reduce((m, r) => Math.max(m, r.lv), 0);
  const bagOf = (o) => Object.entries(o).map(([symbol, amount]) => ({ symbol, amount }));
  const plan = [];
  for (let n = (curTH || 0) + 1; n <= maxTH; n++) {
    const up = th.find((r) => r.lv === n);
    const newBuildings = [], upgrades = [];
    for (const [slug, b] of Object.entries(buildings)) {
      if (slug === "town-hall") continue;
      const rows = buildingRows(b).filter((r) => r.th != null).sort((a, z) => a.lv - z.lv);
      if (!rows.length) continue;
      const hasCount = rows.some((r) => "Max count" in r.effect);
      const capAt = (k) => rows.filter((r) => r.th <= k).reduce((m, r) => Math.max(m, r.lv), 0);
      const countAt = (k) => hasCount ? rows.filter((r) => r.th <= k).reduce((m, r) => Math.max(m, cellNum(r.effect["Max count"]) || 0), 0) : (capAt(k) > 0 ? 1 : 0);
      const prevCap = capAt(n - 1), cap = capAt(n), prevCount = countAt(n - 1), count = countAt(n);
      const newCopies = Math.max(0, count - prevCount);
      const first = rows[0];
      if (newCopies) {
        newBuildings.push({ slug, name: b.name, isNew: prevCount === 0, copies: newCopies, count,
          buildCost: first.cost, buildCoin: bagValue(first.cost, prices), buildTime: first.time, effect: first.effect });
      }
      const sumRows = (lo, hi) => rows.filter((r) => r.lv >= lo && r.lv <= hi).reduce((acc, r) => addBag(acc, r.cost), {});
      const parts = [];
      if (prevCount > 0 && cap > prevCap) {
        const one = sumRows(prevCap + 1, cap);
        const all = {}; for (let i = 0; i < prevCount; i++) addBag(all, bagOf(one));
        parts.push({ who: prevCount > 1 ? `stávající ${prevCount} ks` : "stávající", from: prevCap, to: cap, copies: prevCount, cost: bagOf(all) });
      }
      if (newCopies && cap > first.lv) {
        const one = sumRows(first.lv + 1, cap);
        const all = {}; for (let i = 0; i < newCopies; i++) addBag(all, bagOf(one));
        parts.push({ who: newCopies > 1 ? `nové ${newCopies} ks` : "nová", from: first.lv, to: cap, copies: newCopies, cost: bagOf(all) });
      }
      if (parts.length) {
        const total = {}; for (const p of parts) addBag(total, p.cost);
        const levels = rows.filter((r) => r.lv > Math.min(...parts.map((p) => p.from)) && r.lv <= cap);
        upgrades.push({ slug, name: b.name, parts, cap, prevCap, totalCost: bagOf(total), totalCoin: bagValue(bagOf(total), prices),
          player: levels.reduce((m, r) => Math.max(m, r.player || 0), 0) || null, top: (rows.find((r) => r.lv === cap) || {}).effect, levels });
      }
    }
    newBuildings.sort((a, z) => (z.isNew - a.isNew) || a.name.localeCompare(z.name));
    upgrades.sort((a, z) => a.name.localeCompare(z.name));
    const total = {};
    if (up) addBag(total, up.cost);
    for (const nb of newBuildings) for (let i = 0; i < nb.copies; i++) addBag(total, nb.buildCost);
    for (const u of upgrades) addBag(total, u.totalCost);
    plan.push({ th: n, upgrade: up && { player: up.player, cost: up.cost, coin: bagValue(up.cost, prices), time: up.time, effect: up.effect },
      levelsShort: up && up.player && playerLevel != null ? Math.max(0, up.player - playerLevel) : null,
      newBuildings, upgrades, totalCost: bagOf(total), totalCoin: bagValue(bagOf(total), prices) });
  }
  return plan;
}

/*
 * Efficiency matrix: every factory × every level — XP per unit of power, XP per hour and power
 * per hour of one factory running non-stop. Mines (they give no XP) are left out.
 */
export function efficiencyMatrix(factories) {
  return Object.entries(factories)
    .filter(([, f]) => f.levels.some((l) => l.xpPerOutput > 0))
    .map(([slug, f]) => ({
      slug, name: f.name,
      levels: f.levels.map((l) => {
        const runsPerHour = 3600 / l.durationSeconds;
        return { level: l.level, xpPerPower: l.powerCost ? (l.xpPerOutput * l.output) / l.powerCost : null,
          xpPerHour: l.xpPerOutput * l.output * runsPerHour, powerPerHour: l.powerCost * runsPerHour };
      }),
    }));
}

/*
 * PRODUCTION TREE — how an item is made, down to the mined base, priced with the Exchange fee:
 *   buy      what buying one costs:      market × (1 + fee)
 *   sell     what selling one brings:    market × (1 − fee)
 *   make     what making one costs: each input at its own best (bought, or made if cheaper)
 *   best     the cheaper of buy / make — what a parent pays for it as an input
 *   diff     (make − buy) / buy: negative = making beats buying
 *   secPerOne, grossPerHour (sell / time), profitPerHour ((sell − make) / time) for one factory
 * `ratios` overrides per factory slug: { slug: { SYMBOL: inputs per ONE output, __sec: seconds per
 * ONE output } } — the owner's numbers after upgrades. Default: the game's level 1.
 */
export function recipeOf(factory, ratios) {
  const L = factory.levels[0];
  const own = ratios && ratios[factory.slug || ""];
  return L.inputs.map((x) => ({ symbol: x.symbol, perOne: own && own[x.symbol] != null ? Number(own[x.symbol]) : x.amount / L.output }));
}
export function secPerOne(factory, ratios) {
  const L = factory.levels[0];
  const own = ratios && ratios[factory.slug || ""];
  return own && own.__sec != null ? Number(own.__sec) : L.durationSeconds / L.output;
}

export function recipeTree(symbol, factories, prices, ratios = {}, fee = EXCHANGE_FEE, seen = new Set()) {
  const sym = String(symbol).toUpperCase();
  const entry = Object.entries(factories).find(([, f]) => outputSymbol(f) === sym && f.levels[0].inputs.length);
  const market = prices[sym] ?? null;
  const buy = market == null ? null : market * (1 + fee), sell = market == null ? null : market * (1 - fee);
  if (!entry || seen.has(sym)) return { symbol: sym, market, buy, sell, make: null, best: buy, inputs: [], slug: entry ? entry[0] : null };
  const [slug, f] = entry;
  const next = new Set(seen).add(sym);
  const inputs = recipeOf({ ...f, slug }, ratios).map((x) => {
    const node = recipeTree(x.symbol, factories, prices, ratios, fee, next);
    return { ...x, node, cost: node.best == null ? null : x.perOne * node.best };
  });
  const make = inputs.some((x) => x.cost == null) ? null : inputs.reduce((a, x) => a + x.cost, 0);
  const best = buy == null ? make : make == null ? buy : Math.min(buy, make);
  const sec = secPerOne({ ...f, slug }, ratios);
  return { symbol: sym, slug, name: f.name, market, buy, sell, make, best, inputs, secPerOne: sec,
    diff: buy && make != null ? (make - buy) / buy : null,
    grossPerHour: sell != null && sec ? sell * 3600 / sec : null,
    profitPerHour: sell != null && make != null && sec ? (sell - make) * 3600 / sec : null };
}
