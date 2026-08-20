// Value a precomputed farm-diff delta map into per-item SFL contributions + a net total.
// The diff itself is produced upstream (the snapshot collector) and stored; this only VALUES
// an already-computed numeric delta map. Extracted verbatim from flowers.html's processDiff
// (~:25201) so the diff page's numbers live in one tested place.
//
//   diff:     { "<key>": <delta number>, ... } — keys are balance / coins / gems /
//             inventory.<Item> / wardrobe.<Item> / stock.<Item> / nodes / _v / _h.* / _c.*
//   priceMap: marketValue map from buildPricesSection (item name -> SFL), for inventory items
//   rates:    { coinsPerSFL, gemsPerSFL } — coins/gems are valued directly, not via the map
//   trace:    optional sink; when present, pushes one { item, method, formula, value, unit,
//             steps } net-SFL node whose children are the per-item contributions (SFL).
//
// Returns { items, netSfl } identically to the inline version (same fields, same sort).
export function valueDiff(diff, priceMap, rates = {}, trace) {
  const coinsPerSFL = rates.coinsPerSFL || 0;
  const gemsPerSFL = rates.gemsPerSFL || 0;
  const map = priceMap || {};
  let netSfl = 0;
  const items = [];
  const kids = trace ? [] : null;
  for (const [key, rawDelta] of Object.entries(diff)) {
    if (key === "nodes" || key === "_v" || key.startsWith("_h.") || key.startsWith("_c.")) continue;
    const d = typeof rawDelta === "number" ? rawDelta : parseFloat(rawDelta);
    if (isNaN(d) || Math.abs(d) < 0.0001) continue;

    let category = "other";
    let itemName = key;
    let sflValue = 0;
    let formula = "";

    if (key === "balance") {
      category = "sfl"; itemName = "SFL Balance"; sflValue = d;
      formula = `${d} SFL (1:1)`;
    } else if (key === "coins") {
      category = "coins"; itemName = "Coins";
      sflValue = coinsPerSFL > 0 ? d / coinsPerSFL : 0;
      formula = coinsPerSFL > 0 ? `${d} coins / ${coinsPerSFL.toFixed(2)} c/SFL` : `${d} coins (no rate)`;
    } else if (key === "gems" || key === "inventory.Gem") {
      category = "gems"; itemName = key === "gems" ? "Gems" : "Gem";
      sflValue = gemsPerSFL > 0 ? d / gemsPerSFL : 0;
      formula = gemsPerSFL > 0 ? `${d} gems / ${gemsPerSFL.toFixed(2)} gems/SFL` : `${d} gems (no rate)`;
    } else if (key.startsWith("inventory.")) {
      itemName = key.substring(10); category = "inventory";
      const price = map[itemName] || 0;
      sflValue = d * price;
      formula = `${d} × ${price.toFixed(5)} SFL`;
    } else if (key.startsWith("wardrobe.")) {
      itemName = key.substring(9); category = "wardrobe";
    } else if (key.startsWith("stock.")) {
      continue;
    }

    items.push({ key, itemName, category, delta: d, sflValue, hasPrice: sflValue !== 0 || category === "sfl" || category === "coins" || category === "gems" });
    netSfl += sflValue;
    if (trace && sflValue !== 0) {
      kids.push({ item: itemName, method: category, formula, value: sflValue, unit: "SFL" });
    }
  }
  items.sort((a, b) => Math.abs(b.sflValue) - Math.abs(a.sflValue) || a.itemName.localeCompare(b.itemName));
  if (trace) {
    trace.push({ item: "net SFL", method: "diff valuation", formula: `Σ of ${kids.length} priced changes`, value: netSfl, unit: "SFL", steps: kids });
  }
  return { items, netSfl };
}

/*
 * The visible slice of the diff timeline — the "slicer".
 *
 * The chart drew every period it had loaded, so raw mode ran off the right edge of the screen
 * and "now", the one bar anyone opens the page for, was the one you had to scroll to reach.
 * The fix is a window: a fixed number of periods ending, by default, at the newest one.
 *
 *   total  how many periods are loaded
 *   size   how many to show; 0 / null / negative / >= total all mean "everything"
 *   start  index of the leftmost visible period; null means "pin to the newest", which is what
 *          a fresh load, a period change and the NOW button all want
 *
 * `start` is clamped into [0, total - size] rather than rejected, so a window that no longer
 * fits (period switched, data refetched, size grown) lands on the newest rows instead of on an
 * empty chart. `end` is INCLUSIVE, and is -1 when there is nothing to show.
 */
export function diffWindowRange(total, size, start) {
  const n = Math.max(0, Math.floor(Number(total)) || 0);
  const want = Math.floor(Number(size));
  const eff = Math.max(0, Math.min(want > 0 ? want : n, n));
  const maxStart = Math.max(0, n - eff);
  const s = (start === null || start === undefined || !Number.isFinite(Number(start)))
    ? maxStart
    : Math.max(0, Math.min(Math.floor(Number(start)), maxStart));
  return { start: s, end: s + eff - 1, size: eff, total: n, maxStart, atNow: s >= maxStart };
}

/*
 * A from/to window, normalised once for both the page and the API.
 *
 * Either end may be absent — "everything before 22:40" and "everything since Tuesday" are both
 * legitimate — so a missing or unparseable bound comes back null rather than as some sentinel
 * date the caller then has to recognise. Reversed bounds are swapped instead of returning
 * nothing: typing the two boxes in the wrong order is a slip, not a request for an empty chart.
 *
 * Both ends come back as ISO UTC, which is what the SQL bounds and the history endpoint take,
 * and which compares correctly as a string.
 */
export function parseDiffRange(from, to) {
  const one = (v) => {
    if (v === undefined || v === null || v === "") return null;
    const t = new Date(v);
    return Number.isNaN(t.getTime()) ? null : t.toISOString();
  };
  let a = one(from);
  let b = one(to);
  if (a && b && a > b) { const t = a; a = b; b = t; }
  return { from: a, to: b };
}
