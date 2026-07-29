// section=wishlist — the cockpit's wishlist math (MIGRATION.md §1), folded into this
// app. Catalog = every boosted NFT from the sfl.world feed (floor/lastSale/supply);
// ownership from the farm (active = placed/equipped, owned = active OR in inventory/
// wardrobe); the wishlist itself ({ "collection:name": priority } — priorities 1/2/3)
// arrives via the `list` query param (client localStorage).
//
// Deliberate scope cuts vs the cockpit (documented, not omissions): best-OFFER prices
// and the my-offers action plan needed its private orderbook collector + JWT profile —
// this app prices buy-now at FLOOR (the sfl.world ask) with lastSale as reference. The
// per-priority cumulative-cost + affordability model is ported intact. Auto-prune
// (§1.3): items that became active are excluded from costs and reported in `pruned`.
import { findCollectible, isWearableEquipped, getCount } from "../engine/power-helpers.mjs";

export function buildWishlistSection(farm, nftData, settings = {}) {
  const inv = farm.inventory || {};
  const wardrobe = farm.wardrobe || {};
  const balance = parseFloat(farm.balance) || 0;
  const list = settings.list || {}; // { "collectibles:Name"|"wearables:Name": 1|2|3 }

  const catalog = [];
  const add = (item, collection) => {
    if (!item.have_boost || !item.name || !item.boost_text) return;
    const isWearable = collection === "wearables";
    const active = isWearable
      ? isWearableEquipped(farm, item.name)
      : findCollectible(farm, item.name).length > 0;
    const owned = active || (isWearable ? (wardrobe[item.name] || 0) > 0 : getCount(inv, item.name) > 0);
    catalog.push({
      name: item.name, collection, id: item.id ?? null,
      floor: parseFloat(item.floor) || 0,
      lastSale: parseFloat(item.lastSalePrice) || 0,
      supply: item.supply || 0, boost: item.boost_text,
      owned, active,
    });
  };
  for (const c of (nftData.collectibles || [])) add(c, "collectibles");
  for (const w of (nftData.wearables || [])) add(w, "wearables");

  // ── wishlist rows + auto-prune ──
  const byKey = {};
  for (const it of catalog) byKey[`${it.collection}:${it.name}`] = it;
  const rows = [];
  const pruned = [];
  for (const [key, prio] of Object.entries(list)) {
    const it = byKey[key];
    if (!it) continue;
    if (it.active) { pruned.push(key); continue; } // §1.3: placed/worn → out
    rows.push({ ...it, key, priority: [1, 2, 3].includes(prio) ? prio : 2 });
  }
  rows.sort((a, b) => a.priority - b.priority || b.floor - a.floor);

  /*
   * What each wishlisted boost is worth per day, and how long it takes to pay for itself.
   *
   * The numbers come from the power section's own calcBoostValue, not a second model, so the
   * wishlist cannot disagree with the Power page about what a boost does. Two figures per
   * row: `theo` at theoretical throughput (every node harvested the moment it respawns) and
   * `eff` at this farm's MEASURED throughput. The gap between them is the farm's own
   * activity, which is why the page offers both rather than picking one.
   *
   * A boost can affect several categories, so the per-day value is the sum of its SYNERGY
   * value across them — synergy, not solo, because that is what the boost adds on top of what
   * the farm already owns, which is what the buyer actually gains.
   *
   * ROI is computed here rather than taken from calcBoostValue's own `roi`: that one divides
   * by a single category's synergy, so for a multi-category item it would overstate the
   * payback time.
   */
  const bv = settings.boostValues || null;
  const bvEff = settings.boostValuesEff || null;
  const sumSynergy = (src, name) => {
    if (!src) return null;
    let total = 0, found = false;
    for (const cat of Object.values(src)) {
      const v = cat && cat[name];
      if (!v || !isFinite(v.synergy)) continue;
      found = true;
      total += v.synergy;
    }
    return found ? total : null;
  };
  for (const r of rows) {
    const theo = sumSynergy(bv, r.name);
    const eff = sumSynergy(bvEff, r.name);
    r.perDay = theo;
    r.perDayEff = eff;
    // Priced at the floor ask, matching what the cost columns already charge for the item.
    r.roiDays = theo > 0 && r.floor > 0 ? r.floor / theo : null;
    r.roiDaysEff = eff > 0 && r.floor > 0 ? r.floor / eff : null;
  }

  // ── per-priority costs (§1.4): pay only for UNOWNED; cumulative includes higher prios ──
  const byPriority = {};
  let cumulative = 0;
  for (const p of [1, 2, 3]) {
    const items = rows.filter((r) => r.priority === p);
    const unowned = items.filter((r) => !r.owned);
    const cost = unowned.reduce((s, r) => s + r.floor, 0);
    cumulative += cost;
    byPriority[p] = {
      count: items.length, unowned: unowned.length, cost, cumulative,
      affordable: balance >= cumulative,
    };
  }

  return { catalog, rows, byPriority, pruned, balance };
}
