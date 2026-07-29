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
import { findCollectible, isWearableEquipped, getCount, detectFarmCapacity } from "../engine/power-helpers.mjs";
import { decodeBud, calcBudSflPerDay, BUD_BOOST_FILTERS, budHasBoostFilter } from "../engine/buds.mjs";
import { roadmapEffFactor, getRoadmapSettings } from "../engine/roadmap.mjs";

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

  /*
   * Buds ("buds:<id>"). They are 1-of-1 NFTs, so they are absent from the sfl.world
   * collectible/wearable feed the catalog above is built from. flowers.html used to append
   * them to `rows` AFTER this function had already returned, which meant the ROI block below
   * never saw them: every bud reached the table with perDay/roiDays undefined, so its ROI
   * column was unreachable rather than merely empty. Resolving them here puts them on the
   * same row / per-day / ROI path as every other item.
   *
   * Their floor cannot come from the NFT feed either — each id carries its own marketplace
   * ask, which lives in the DB, and compute stays DB-free — so the caller passes the floors
   * it already fetched for the picker as `settings.budFloors` ({ "<id>": floor }).
   *
   * Value comes from the bud engine, keyed off the same farm capacity and raw p2p prices
   * buildBudsSection uses, so a wishlisted bud reports exactly the FLOWER/day the BUDS page
   * and the wishlist picker show for it. That figure is gross extra output rather than
   * calcBoostValue's synergy-over-what-you-own: for a bud's flat yield boosts the two
   * coincide (extra yield per harvest costs no extra tools); a Saphiro speed bud is the one
   * exception and is optimistic by its extra seed restocks.
   */
  const budFloors = settings.budFloors || {};
  let budCapacity = null; // derived on the first bud row, so a bud-free wishlist pays nothing
  const budPrices = {};
  for (const [k, v] of Object.entries(settings.p2p || {})) budPrices[k] = parseFloat(v) || 0;
  // The measured column applies this farm's per-category throughput to each breakdown entry —
  // the same roadmapEffFactor the roadmap and calcBoostValue's measured pass use, so a bud
  // and a collectible are discounted by the same activity model (including its meanRatio
  // fallback when no farm history was posted).
  const budEffSettings = getRoadmapSettings(settings.roadmapSettings || {});
  const budVals = {}; // wishlist key → [theoretical, at measured efficiency]

  /** Value one decoded bud. Traits come from the id alone; only the money needs prices. */
  const valueBud = (bud) => {
    if (!bud || !settings.p2p) return { theo: null, eff: null, cats: [] };
    if (!budCapacity) budCapacity = detectFarmCapacity(farm);
    try {
      const v = calcBudSflPerDay(bud, budCapacity, budPrices, settings.savedProducts || {});
      return {
        theo: v.totalSfl,
        eff: (v.breakdown || []).reduce((s, b) => s + b.sflPerDay * roadmapEffFactor(b.catId, budEffSettings), 0),
        cats: (v.breakdown || []).map((b) => b.catId),
      };
    } catch { return { theo: null, eff: null, cats: [] }; }
  };
  const budLabel = (bud, cats) => `#${bud.id} ${bud.type}/${bud.stem}${cats.length ? " +" + cats.join("+") : ""}`;

  /*
   * Listed buds, cheapest first. `budFloors` is the whole marketplace floor map the client
   * already fetches for the picker, not just the wishlisted ids — a category row has to see
   * every bud on sale to find the cheapest one.
   */
  const listedBuds = Object.entries(budFloors)
    .map(([idStr, floor]) => ({ bud: decodeBud(parseInt(idStr, 10)), floor: parseFloat(floor) || 0 }))
    .filter((x) => x.bud && x.floor > 0)
    .sort((a, b) => a.floor - b.floor);

  for (const [key, prio] of Object.entries(list)) {
    const priority = [1, 2, 3].includes(prio) ? prio : 2;

    if (key.startsWith("buds:")) {
      const idStr = key.slice(5);
      const bud = decodeBud(parseInt(idStr, 10));
      const { theo, eff, cats } = valueBud(bud);
      budVals[key] = [theo, eff];
      rows.push({
        key, collection: "buds", id: bud ? bud.id : null,
        name: bud ? `🌱 ${budLabel(bud, cats)}` : `🌱 Bud #${idStr}`,
        floor: parseFloat(budFloors[idStr]) || 0,
        lastSale: 0, supply: 1,
        boost: cats.length ? `+${cats.join("+")}` : "",
        // Ownership is deliberately not asserted for buds — the client never did either, and
        // pruning an owned bud out of the list (§1.3) is a separate decision from pricing it.
        owned: false, active: false, priority,
      });
      continue;
    }

    /*
     * `budboost:<filter>` — "I want ANY bud with this boost", using the game's own
     * Marketplace → Bud NFTs → Boost taxonomy. The row stands for the CHEAPEST bud currently
     * listed with that boost and reports that bud's own floor, FLOWER/day and ROI, so it
     * behaves exactly like pinning that id by hand — it just re-picks as listings change.
     *
     * Cheapest, not best-ROI: that is what was asked for. Be aware the two often differ by a
     * lot (on 2026-07-29 the cheapest iron bud paid back in 3008 days and one 38% dearer in
     * 1526), so a category row is a floor-price probe, not a recommendation.
     */
    if (key.startsWith("budboost:")) {
      const filter = key.slice(9);
      const known = Object.prototype.hasOwnProperty.call(BUD_BOOST_FILTERS, filter);
      const hit = known ? listedBuds.find((x) => budHasBoostFilter(x.bud, filter)) : null;
      const { theo, eff, cats } = hit ? valueBud(hit.bud) : { theo: null, eff: null, cats: [] };
      budVals[key] = [theo, eff];
      rows.push({
        key, collection: "budboost", id: hit ? hit.bud.id : null,
        name: hit
          ? `🌱 ${filter} → ${budLabel(hit.bud, cats)}`
          : `🌱 ${filter}${known ? " — nic v prodeji" : " — neznámý boost"}`,
        floor: hit ? hit.floor : 0,
        lastSale: 0, supply: 0,
        boost: cats.length ? `+${cats.join("+")}` : "",
        owned: false, active: false, priority,
      });
    }
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
  /*
   * Offer the boost filters in the picker. They go into the catalog the client already
   * renders, each carrying its own `key`, so the page needs no copy of the taxonomy — it just
   * lists what the server sends. `floor` is the cheapest listing, which is what the row would
   * cost today; a filter with nothing on sale still appears, priced 0, rather than vanishing.
   */
  for (const filter of Object.keys(BUD_BOOST_FILTERS)) {
    const hit = listedBuds.find((x) => budHasBoostFilter(x.bud, filter));
    const n = listedBuds.filter((x) => budHasBoostFilter(x.bud, filter)).length;
    catalog.push({
      name: `${filter} (bud boost)`, key: `budboost:${filter}`, collection: "budboost",
      id: null, floor: hit ? hit.floor : 0, lastSale: 0, supply: n,
      boost: n ? `nejlevnější z ${n} v prodeji` : "nic v prodeji",
      owned: false, active: false,
    });
  }

  for (const r of rows) {
    // Buds were valued above by the bud engine; everything else by calcBoostValue's synergy.
    // Same fields, same ROI formula, one path.
    const [theo, eff] = r.collection === "buds" || r.collection === "budboost"
      ? (budVals[r.key] || [null, null])
      : [sumSynergy(bv, r.name), sumSynergy(bvEff, r.name)];
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
