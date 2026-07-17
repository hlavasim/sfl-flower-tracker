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
