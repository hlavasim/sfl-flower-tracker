// Is a composter worth running? The app could not answer that: it priced the fertilisers
// (item-value.mjs derives a production cost) but modelled no effect, so the bonus side of the
// question did not exist. FERTILISER_EFFECTS supplies it now; this turns it into money.
//
// A composter is a PERIODIC action, not a permanent upgrade — it has a cycle and consumes
// inputs — so what it returns is a per-day net, not an ROI.
import { COMPOST_RECIPES, COMPOSTER_CYCLE, FERTILISER_EFFECTS } from "../data/crafting.mjs";
import { findCollectible, getCount, getCycleSec, getCapacityCount, getDefaultProduct } from "./power-helpers.mjs";

/**
 * FLOWER value of ONE fertiliser, i.e. of applying it to one plot for one harvest.
 *
 * Deliberately per-plot-per-harvest, matching how the game consumes it. Quoting a per-day
 * figure here would be wrong twice over: a fertiliser is used once, and the plot it goes on
 * would have produced anyway.
 */
export function fertiliserValue(name, farm, p2pPrices, opts = {}) {
  const eff = FERTILISER_EFFECTS[name];
  if (!eff) return null;
  const product = (opts.savedProducts && opts.savedProducts[eff.cat]) || getDefaultProduct(eff.cat);
  const price = (p2pPrices && p2pPrices[product]) || 0;
  if (!(price > 0)) return { value: 0, unpriced: true, product, note: `no price for ${product}` };

  if (eff.kind === "yield_flat") {
    let units = eff.value;
    // harvest.ts adds the bonus a SECOND time when Knowledge Crab is built — the collectible
    // doubles the mix, which nothing in the app knew.
    const doubled = eff.doubledBy && findCollectible(farm, eff.doubledBy).length > 0;
    if (doubled) units *= 2;
    return { value: units * price, units, product, doubled: !!doubled };
  }

  if (eff.kind === "growth_mult") {
    /*
     * Rapid Root halves the growth time of one crop on one plot. Halving a cycle brings the
     * harvest forward by half a cycle, so the gain is roughly the output that half-cycle would
     * otherwise have taken to earn: 0.5 x one harvest's worth.
     *
     * An approximation, and labelled as one. The exact figure depends on whether the freed time
     * is refilled immediately, which depends on the player. It is also the entry carrying the
     * SPEED_BOOSTS caveat from FERTILISER_EFFECTS — under that flag the mechanic is a windowed
     * 2x rather than a flat halving, and this would overstate it.
     */
    const cycleSec = getCycleSec(eff.cat, product) || 0;
    if (!(cycleSec > 0)) return { value: 0, unpriced: true, product, note: "no cycle time" };
    const perHarvest = price; // one unit per plot per harvest at base yield
    return { value: (1 - eff.value) * perHarvest, approximate: true, product };
  }
  return { value: 0, note: `unhandled kind ${eff.kind}` };
}

/**
 * Per-day net of running one composter flat out: the fertilisers it makes, minus the crops it
 * eats. Season-dependent, because the inputs are.
 */
export function composterVerdict(name, farm, p2pPrices, season, opts = {}) {
  const recipe = COMPOST_RECIPES[name];
  const cycle = COMPOSTER_CYCLE[name];
  if (!recipe || !cycle || !(cycle.hours > 0)) return null;
  const batchesPerDay = 24 / cycle.hours;

  // Outputs. Baits (Earthworm, Grub, Red Wiggler) are fishing items, not fertilisers — counted
  // as unpriced rather than silently dropped, so the verdict cannot look better than it is.
  let outPerBatch = 0; const outputs = []; const ignored = [];
  for (const [item, qty] of Object.entries(recipe.outputs || {})) {
    const fv = fertiliserValue(item, farm, p2pPrices, opts);
    if (!fv) { ignored.push({ item, qty, reason: "not a fertiliser" }); continue; }
    outPerBatch += fv.value * qty;
    outputs.push({ item, qty, each: fv.value, total: fv.value * qty, ...fv });
  }

  // Inputs for THIS season; fall back to the first listed so an unknown season still costs.
  const inputs = (recipe.inputs && (recipe.inputs[season] || Object.values(recipe.inputs)[0])) || {};
  let inPerBatch = 0; const inputRows = []; let inputUnpriced = false;
  for (const [item, qty] of Object.entries(inputs)) {
    const price = (p2pPrices && p2pPrices[item]) || 0;
    if (!(price > 0)) inputUnpriced = true;
    inPerBatch += price * qty;
    inputRows.push({ item, qty, price, total: price * qty });
  }

  const grossPerDay = outPerBatch * batchesPerDay;
  const costPerDay = inPerBatch * batchesPerDay;
  return {
    name, batchesPerDay, season: season || null,
    grossPerDay, costPerDay, netPerDay: grossPerDay - costPerDay,
    outputs, inputs: inputRows, ignored,
    // Flagged, not hidden: a missing price makes the net a floor, not an answer.
    unpriced: inputUnpriced || outputs.some((o) => o.unpriced),
    approximate: outputs.some((o) => o.approximate),
    built: getCount(farm.inventory || {}, name) > 0 || findCollectible(farm, name).length > 0,
  };
}

/** All composters, best net per day first. */
export function composterVerdicts(farm, p2pPrices, season, opts = {}) {
  return Object.keys(COMPOST_RECIPES)
    .map((n) => composterVerdict(n, farm, p2pPrices, season, opts))
    .filter(Boolean)
    .sort((a, b) => b.netPerDay - a.netPerDay);
}
