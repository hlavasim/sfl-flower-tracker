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
    /*
     * And the SKILL multiplier, which this ignored — FERTILISER_EFFECTS has carried
     * `skillMultiplier: "Fruitful Bounty"` on Fruitful Blend since the data went in, and nothing
     * read it. Anyone holding that skill had every Fruitful Blend, and therefore the Turbo
     * Composter's whole output, valued at half. bumpkin.skills stores the LEVEL as a number, so
     * presence is `> 0`, not `in`.
     */
    const skillDoubled = !!(eff.skillMultiplier && hasSkill(farm, eff.skillMultiplier));
    if (skillDoubled) units *= 2;
    return { value: units * price, units, product, doubled: !!doubled, skillDoubled };
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

/** bumpkin.skills stores the current LEVEL as a number, never a presence flag. */
function hasSkill(farm, name) {
  return (Number(((farm && farm.bumpkin && farm.bumpkin.skills) || {})[name]) || 0) > 0;
}

/*
 * What the COMPOST skill tree is worth.
 *
 * The whole tree valued at exactly 0, and for two unrelated reasons — worth separating, because
 * only one of them was a missing model:
 *
 *   1. Most of the tree changes a composter's OUTPUT ("+5 Sprout Mix", "-10% compost time"). With
 *      no fertiliser effect there was nothing to value; FERTILISER_EFFECTS and composterVerdict
 *      supply it now, so these become ordinary per-day figures.
 *   2. Three are POWER skills that change how a fertiliser is APPLIED ("Sprout Mix on all
 *      plots"). Those have no per-day rate at all without a model of how often you activate them,
 *      and inventing one would be worse than reporting the per-activation gain, which is exact.
 *
 * Every value here is CONDITIONAL on actually running the composter, and that is the point rather
 * than a caveat: on a farm where a composter nets negative — which is all three on the reference
 * farm — a skill that improves its output is worth nothing until you run it, and a skill that
 * makes it FASTER is actively worse. Nothing is clamped to zero.
 */
/*
 * Verified against events/landExpansion/startComposter.ts getCompostAmount, the only place a
 * composter's produce count is decided:
 *
 *   - the three "+N" skills are each gated to ONE building (`&& building === "Compost Bin"` and so
 *     on), which is what makes inferring the building from the output item safe here;
 *   - Composting Revamp has NO building check, so its +N lands on whichever composter you run;
 *   - Composting Overhaul does not appear in getCompostAmount AT ALL. Its buff table here reads
 *     "-5 fertilisers" and the source applies no such penalty to the produce count — it only adds
 *     worms (composterBait.ts). So no penalty is modelled: inventing one the game does not apply
 *     would be worse than the gap. It stays worms-only, i.e. unpriced.
 */
const COMPOST_SKILL_OUTPUT = {
  // "+N <item>" — more of one output per batch. The composter is inferred from its recipe, which is
  // sound because the game gates each of these to exactly that building.
  "Efficient Bin":  { addOutput: { "Sprout Mix": 5 } },
  "Turbo Charged":  { addOutput: { "Fruitful Blend": 5 } },
  "Premium Worms":  { addOutput: { "Rapid Root": 10 } },
  "Wormy Treat":    { addOutput: { "Earthworm": 1 } },
  // Any composter — so it is worth whichever one you actually run, never the sum of all three.
  "Composting Revamp": { allComposters: 5 },
  // Speed: more batches a day, which cuts both ways.
  "Swift Decomposer": { timeMult: 0.9 },
};
const COMPOST_SKILL_APPLY = {
  "Sprout Surge": "Sprout Mix",
  "Blend-tastic": "Fruitful Blend",
  "Root Rocket":  "Rapid Root",
};

/**
 * Per-skill valuation for the Compost tree. Returns one row per skill it can model, each saying
 * what the figure is worth and what it depends on.
 */
export function compostSkillValues(farm, p2pPrices, season, opts = {}) {
  const verdicts = {};
  for (const v of composterVerdicts(farm, p2pPrices, season, opts)) verdicts[v.name] = v;
  // Which composter produces a given item, so "+5 Sprout Mix" knows whose batch it lands in.
  const producerOf = {};
  for (const [cName, r] of Object.entries(COMPOST_RECIPES)) {
    for (const item of Object.keys(r.outputs || {})) if (!producerOf[item]) producerOf[item] = cName;
  }
  const rows = [];

  for (const [skill, def] of Object.entries(COMPOST_SKILL_OUTPUT)) {
    const has = hasSkill(farm, skill);
    if (def.addOutput) {
      const [item, qty] = Object.entries(def.addOutput)[0];
      const composter = producerOf[item];
      const v = composter && verdicts[composter];
      const fv = fertiliserValue(item, farm, p2pPrices, opts);
      if (!v) { rows.push({ skill, has, value: null, unpriced: true, note: `no composter produces ${item}` }); continue; }
      if (!fv) {
        // Baits are fishing items, not fertilisers. Unpriced is the honest answer, not 0 —
        // reporting 0 reads as "worthless" for something that does have a use.
        rows.push({ skill, has, value: null, unpriced: true, composter: composter,
          note: `${item} is fishing bait, not a fertiliser — no effect model, so no FLOWER figure` });
        continue;
      }
      rows.push({
        skill, has, composter, item, qty,
        perBatch: fv.value * qty, value: fv.value * qty * v.batchesPerDay,
        unpriced: !!fv.unpriced, approximate: !!fv.approximate,
        // The condition, stated: this is only real if the composter runs, and running it is
        // itself a loss here.
        conditional: `pouze když ${composter} běží (ten teď nese ${v.netPerDay.toFixed(3)} FLOWER/den)`,
        composterNetPerDay: v.netPerDay,
      });
    } else if (def.allComposters) {
      /*
       * +N fertilisers on ANY composter. Worth the best one you would actually run, NOT the sum
       * across all three: you run one batch at a time, and adding them up would count a single
       * skill three times.
       */
      let best = null;
      for (const v of Object.values(verdicts)) {
        const out0 = (v.outputs || [])[0];
        if (!out0) continue;
        const fv = fertiliserValue(out0.item, farm, p2pPrices, opts);
        if (!fv || !(fv.value > 0)) continue;
        const val = def.allComposters * fv.value * v.batchesPerDay;
        if (!best || val > best.value) best = { value: val, composter: v.name, item: out0.item, netPerDay: v.netPerDay };
      }
      rows.push(best
        ? { skill, has, composter: best.composter, item: best.item, qty: def.allComposters, value: best.value,
            perBatch: best.value / (verdicts[best.composter].batchesPerDay || 1),
            conditional: `platí na kterýkoliv composter — počítáno pro ${best.composter} (nejlepší, net ${best.netPerDay.toFixed(3)} FLOWER/den); nesčítá se přes všechny, batch běží po jednom`,
            composterNetPerDay: best.netPerDay }
        : { skill, has, value: null, unpriced: true, note: "žádné ocenitelné hnojivo, ke kterému přidat" });
    } else if (def.timeMult) {
      /*
       * Faster batches scale the composter's whole net, including a negative one. A speed skill on
       * a loss-making composter increases the loss, and showing that is the point — the previous
       * behaviour (0 for everything) hid it.
       */
      const parts = [];
      for (const v of Object.values(verdicts)) parts.push({ composter: v.name, delta: v.netPerDay * (1 / def.timeMult - 1) });
      const total = parts.reduce((s, x) => s + x.delta, 0);
      rows.push({ skill, has: hasSkill(farm, skill), value: total, parts,
        conditional: "pouze u composterů, které skutečně necháváš běžet",
        harmful: total < 0 });
    }
  }

  for (const [skill, item] of Object.entries(COMPOST_SKILL_APPLY)) {
    const fv = fertiliserValue(item, farm, p2pPrices, opts);
    const eff = FERTILISER_EFFECTS[item];
    const cat = eff && eff.cat;
    const plots = cat ? (getCapacityCount(cat, opts.capacity || {}) || 0) : 0;
    const held = getCount(farm.inventory || {}, item);
    rows.push({
      skill, has: hasSkill(farm, skill), item, plots, held,
      /*
       * One activation fertilises every plot instead of one, so the gain is the extra plots. It is
       * a PER-ACTIVATION figure, not per day: how often you press it is a player habit this app
       * does not measure, and multiplying by a guessed frequency would turn an exact number into
       * an invented one.
       */
      perActivation: fv && plots > 1 ? fv.value * (plots - 1) : 0,
      value: null, perDay: false,
      unpriced: !(fv && fv.value > 0),
      conditional: `na jedno použití, ${plots} ${cat} plotů · potřebuje Sprout/Blend zásobu (máš ${held})`,
    });
  }
  return rows;
}
