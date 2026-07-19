// Roadmap valuation engine + calcBoostValue — extracted VERBATIM from flowers.html
// (ranges marked) so section=power can ship per-boost solo/synergy/ROI values. The
// page's copy STAYS inline: the skill-rank ladder and the roadmap page call it with
// synthetic/rank-scaled boost items that cannot be precomputed server-side.
//
// Deviations (each marked at its site), same policy as power-helpers.mjs:
//   1. Module-level `powerState` + _setPowerContext() replace the page global. The
//      context object also carries `roadmapSettingsRaw` (the page's localStorage
//      sfl_roadmap_settings, passed by the client via the `roadmap` query param).
//   2. getRoadmapSettings normalizes powerState.roadmapSettingsRaw instead of reading
//      localStorage — the normalization body is byte-identical.
//   3. roadmapState (measured-efficiency history) is null server-side; roadmapEffFactor
//      already guards on it and calcBoostValue forces effMode "theoretical" anyway.
//   4. activeShrineEffects/miningToolsPerDay get powerState.farm passed explicitly
//      (they read the global on the page).
import {
  RES_FARMKEY, gameResYield, gameResBoostedBase, applyBoosts, miningToolsPerDay, calcToolCostPerDay,
  getCycleSec, getCapacityCount, getDefaultProduct, isAnimalCat, POWER_CATEGORIES,
  getCount, findCollectible,
  getEffectsForCategory, TOOL_TO_CAT,
} from "./power-helpers.mjs";
import {
  unitToSfl, calcSeedCostPerDay, calcAnimalFeedCost, calcSicknessCost,
  calcLavaPitCostPerDay, getAnimalCatSfl, getPriceProduct, activeShrineEffects,
} from "./power-costs.mjs";
import {
  CROP_GROW_DATA, FRUIT_GROW_DATA, GREENHOUSE_GROW_DATA, FRUIT_HARVEST_COUNT,
} from "./power-boosts.mjs";
import { TOOL_COSTS } from "../data/economy.mjs";

// Deviation 1: the page global, module-scoped. Set before any calc.
let powerState = null;
let roadmapState = null; // deviation 3: no measured history server-side
export function _setPowerContext(ps) { powerState = ps; }
function _setRoadmapState(rs) { roadmapState = rs; } // deviation 3: eff arrives from the caller


    // ── flowers.html 4114-4121: BETTY_RESTOCK_AMOUNT ──
    const BETTY_RESTOCK_AMOUNT = {
      "Sunflower": 800, "Potato": 400, "Rhubarb": 400, "Zucchini": 400,
      "Pumpkin": 300, "Carrot": 200, "Cabbage": 180, "Yam": 180, "Soybean": 180,
      "Broccoli": 180, "Beetroot": 160, "Pepper": 160, "Cauliflower": 160,
      "Parsnip": 120, "Eggplant": 100, "Corn": 100, "Onion": 100,
      "Turnip": 80, "Radish": 80, "Wheat": 80,
      "Kale": 60, "Artichoke": 60, "Barley": 60,
    };

    // ── flowers.html 4122-4130: farmHasWarehouse + cmGetSeedRestockCount ──
    function farmHasWarehouse(farm) {
      return (((farm.buildings || {})["Warehouse"]) || []).length > 0;
    }
    // Effective restock amount per Betty visit: base × 1.2 if Warehouse present.
    function cmGetSeedRestockCount(farm, cropName) {
      const base = BETTY_RESTOCK_AMOUNT[cropName];
      if (!base) return 0;
      return farmHasWarehouse(farm) ? Math.ceil(base * 1.2) : base;
    }

    // ── flowers.html 15850-15862: SEASON_CROPS + roadmapInSeason ──
    const SEASON_CROPS = {
      spring: ["Sunflower","Rhubarb","Carrot","Cabbage","Soybean","Corn","Wheat","Kale","Barley","Tomato","Blueberry","Orange","Rice","Olive","Grape"],
      summer: ["Sunflower","Potato","Zucchini","Pepper","Beetroot","Cauliflower","Eggplant","Radish","Wheat","Lemon","Orange","Banana","Rice","Olive","Grape"],
      autumn: ["Potato","Pumpkin","Carrot","Yam","Broccoli","Soybean","Wheat","Barley","Artichoke","Tomato","Apple","Banana","Rice","Olive","Grape"],
      winter: ["Potato","Cabbage","Beetroot","Cauliflower","Parsnip","Onion","Turnip","Wheat","Kale","Lemon","Blueberry","Apple","Rice","Olive","Grape"],
    };
    function roadmapInSeason(product) {
      const s = ((powerState.farm && powerState.farm.season && powerState.farm.season.season) || "").toLowerCase();
      const list = SEASON_CROPS[s];
      if (!list) return true;
      return list.includes(product);
    }


    // ── flowers.html 15784-15791: gameResUnitsPerDay ──
    function gameResUnitsPerDay(cat, farm, capacity, effects) {
      if (!RES_FARMKEY[cat]) return 0;
      const eff = effects || roadmapOwnedEffects(cat);
      const ab = applyBoosts(cat, getDefaultProduct(cat), capacity, eff, farm); // deviation 4
      const ec = ab.effectiveCycle || getCycleSec(cat, getDefaultProduct(cat));
      return ec > 0 ? gameResYield(farm, cat, eff) * (86400 / ec) : 0;
    }
    // Average resource per single node-harvest (per tool used) — for the mining-strategy tool cost.

    // ── flowers.html 15863-15887: getRoadmapSettings ──
    // Deviation 2 (see header): raw object passed in; normalization body unchanged.
    function getRoadmapSettings(raw) {
      let s = raw && typeof raw === "object" ? raw : {};
      return {
        effMode: s.effMode === "theoretical" ? "theoretical" : "real",
        globalActivity: (typeof s.globalActivity === "number") ? s.globalActivity : null,
        startIncome: (typeof s.startIncome === "number" && s.startIncome >= 0) ? s.startIncome : null,
        incCollectibles: s.incCollectibles !== false,
        incWearables: s.incWearables !== false,
        incSkills: s.incSkills !== false,
        excludeCats: Array.isArray(s.excludeCats) ? s.excludeCats.filter(x => typeof x === "string") : [],
        miningCostMode: s.miningCostMode === "production" ? "production" : "market",
        marketFee: (typeof s.marketFee === "number" && s.marketFee >= 0) ? s.marketFee : 10,
        skillPts: (typeof s.skillPts === "number" && s.skillPts >= 0) ? s.skillPts : null,
        showCosmetic: !!s.showCosmetic,
        maxPrice: (typeof s.maxPrice === "number" && s.maxPrice >= 0) ? s.maxPrice : 0,
        coinsFree: (s.coinsFree === true || s.coinsFree === false) ? s.coinsFree : undefined,
        restocksPerDay: (typeof s.restocksPerDay === "number" && s.restocksPerDay > 0) ? s.restocksPerDay : 2,
        horizonYears: (typeof s.horizonYears === "number" && s.horizonYears > 0) ? s.horizonYears : 100,
        optimizeOrder: s.optimizeOrder !== false,
        effOverrides: (s.effOverrides && typeof s.effOverrides === "object") ? s.effOverrides : {},
        ticketValueSfl: (typeof s.ticketValueSfl === "number" && s.ticketValueSfl >= 0) ? s.ticketValueSfl : 0,
        resourceUseValue: {}, // removed — resources are always p2p
      };
    }

    // ── flowers.html 15893-15911: roadmapPrices + roadmapEffFactor ──
    function roadmapPrices(settings) {
      // Resources are ALWAYS valued at p2p (marketplace). No per-resource overrides.
      return powerState.p2pPrices || {};
    }

    function roadmapEffFactor(cat, settings) {
      const ov = settings.effOverrides && settings.effOverrides[cat];
      if (typeof ov === "number" && isFinite(ov)) return Math.max(0, Math.min(1, ov)); // manual slider
      if (settings.effMode === "theoretical") return 1;
      if (cat === "obsidian") return 1; // obsidian net already capped at 1 sale/week
      if (isAnimalCat(cat)) return 1; // animals are 24h-cycle stockpilers — caught each daily login (~full); _h.* units don't match here
      if (!roadmapState || !roadmapState.effByCat) return 1; // no measured history loaded (e.g. Power page) → theoretical
      const eb = roadmapState.effByCat;
      // Categories with their own harvest signal use the measured throughput ratio.
      if (eb[cat] && eb[cat].measured) return eb[cat].ratio;
      // bees / fishing have no per-category signal → use overall average activity
      return roadmapState.meanRatio || 1;
    }


    // ── flowers.html 15960-16020: roadmapCoinsFree + roadmapPerPlot + roadmapCatMix ──
    function roadmapCoinsFree(settings) {
      if (settings && settings.coinsFree === true) return true;
      if (settings && settings.coinsFree === false) return false;
      return (parseFloat(powerState.farm && powerState.farm.coins) || 0) > 10000;
    }

    // NET FLOWER/day for a category given an effect set: gross production − running costs
    // (feed, sickness, seed, tools, lava). Mirrors the ROI/Power full-cost model — so a
    // loss-making activity (e.g. low-level animals where feed ≥ produce) nets ≤ 0.
    // Per-plot economics of growing product p (one crop/fruit/greenhouse item) under an effect set.
    // Returns per-plot gross & cost (all-plots figure ÷ plots) plus its seed-restock plot cap.
    function roadmapPerPlot(cat, p, effects, settings) {
      const { capacity, exchangeRates, stockMods } = powerState;
      const p2pPrices = roadmapPrices(settings);
      const plots = getCapacityCount(cat, capacity);
      if (!(plots > 0)) return null;
      const er = roadmapCoinsFree(settings) ? Object.assign({}, exchangeRates, { coinsPerSFL: Infinity }) : exchangeRates;
      let ab; try { ab = applyBoosts(cat, p, capacity, effects); } catch { return null; }
      if (!ab || !(ab.unitsPerDay > 0)) return null;
      const grossAll = unitToSfl(ab.unitsPerDay, getPriceProduct(cat, p), p2pPrices) || 0;
      let costAll = 0;
      try { costAll = (calcSeedCostPerDay(cat, p, capacity, er, stockMods, effects, p2pPrices).costPerDay) || 0; } catch {}
      const cyclesPerDay = ab.effectiveCycle > 0 ? 86400 / ab.effectiveCycle : 0;
      // Seed-restock cap → plots that product p can keep continuously planted from daily Betty restocks.
      let maxPlots = plots;
      const capSeeds = (settings.restocksPerDay || 2) * (cmGetSeedRestockCount(powerState.farm, p) || 0);
      if (capSeeds > 0 && cyclesPerDay > 0) maxPlots = Math.min(plots, capSeeds / cyclesPerDay);
      return { gpp: grossAll / plots, cpp: costAll / plots, plots, maxPlots, cyclesPerDay };
    }

    // Category net for crops/fruits/greenhouse = the OPTIMAL mix over ALL in-season products, filling
    // the farm's plots by descending net-per-plot under each product's 2-restock/day seed cap (so you
    // typically grow a few crops before a restock, exactly as the game forces). A boost that lifts a
    // crop into the profitable mix is captured as a real improvement here. Returns { gross, cost }.
    function roadmapCatMix(cat, effects, settings) {
      const plots = getCapacityCount(cat, powerState.capacity);
      if (!(plots > 0)) return { gross: 0, cost: 0 };
      const table = cat === "crops" ? CROP_GROW_DATA : (cat === "fruits" ? FRUIT_GROW_DATA : GREENHOUSE_GROW_DATA);
      const rows = [];
      const _exM = (settings.excludeCats || []);
      for (const p of Object.keys(table)) {
        if (_exM.indexOf(p) >= 0) continue;
        if ((cat === "crops" || cat === "fruits") && !roadmapInSeason(p)) continue;
        const pp = roadmapPerPlot(cat, p, effects, settings); if (!pp) continue;
        rows.push({ netPerPlot: pp.gpp - pp.cpp, grossPerPlot: pp.gpp, costPerPlot: pp.cpp, maxPlots: pp.maxPlots });
      }
      rows.sort((a, b) => b.netPerPlot - a.netPerPlot);
      let rem = plots, gross = 0, cost = 0;
      for (const r of rows) {
        if (rem <= 1e-9 || !(r.netPerPlot > 0)) break;
        const take = Math.min(rem, r.maxPlots); if (take <= 0) continue;
        gross += r.grossPerPlot * take; cost += r.costPerPlot * take; rem -= take;
      }
      return { gross, cost };
    }

    // Tools are NEVER free: a pickaxe eats real Wood/Iron you could have sold, so mining a resource costs
    // the sell-value of its tool's inputs. Each mining category's net = gross \u2212 full tool cost (materials
    // priced at sell value + coins). If that net is negative the ore is worth LESS than the inputs its pickaxe
    // eats \u2192 you should sell the inputs raw, not mine it (flagged in Mining Strategy). One helper so the
    // income hero and what-to-mine agree.

    // ── flowers.html 16021-16144: ROADMAP_MINING_CATS + mining consts + roadmapMiningChain ──
    const ROADMAP_MINING_CATS = ["trees", "stone", "iron", "gold", "crimstone", "oil"];
    function roadmapMiningNetCost(cat, settings) {
      const { capacity, exchangeRates, stockMods } = powerState;
      const p2p = roadmapPrices(settings);
      const er = roadmapCoinsFree(settings) ? Object.assign({}, exchangeRates, { coinsPerSFL: Infinity }) : exchangeRates;
      try { return (calcToolCostPerDay(cat, capacity, er, p2p, stockMods, false, powerState.farm, roadmapOwnedEffects(cat)).costPerDay) || 0; } catch { return 0; }
    }
    // ── Mining CHAIN model (recursive sell-vs-use) ──────────────────────────────────────────────────
    // Tools are never free: a pickaxe eats real lower resources. Each resource gets a true value
    //   V[R] = max( sell at p2p , use it to feed the next tier ),  solved as a fixed point up the chain.
    // A tier is mined when mining it (inputs valued at V) beats selling those inputs; even a sell-negative
    // tier (Stone) gets mined if a boosted tier above (Iron) makes its USE value exceed its sell price.
    // Income = each resource's sellable surplus (produced - eaten by your mined tools) x p2p; inputs are
    // netted out of their PRODUCER, never double-charged to the consumer. effOverride[cat] swaps a cat's
    // effects (used by the marginal toggle); default = owned.
    const MINE_CHAIN = ["trees", "stone", "iron", "gold", "crimstone", "oil"];
    const MINE_RES = { trees: "Wood", stone: "Stone", iron: "Iron", gold: "Gold", crimstone: "Crimstone", oil: "Oil" };
    const MINE_TOOL = {
      stone:     { chain: { trees: 3 },           mat: {},            coins: 20 },
      iron:      { chain: { trees: 3, stone: 5 },  mat: {},            coins: 20 },
      gold:      { chain: { trees: 3, iron: 5 },   mat: {},            coins: 80 },
      crimstone: { chain: { trees: 3, gold: 3 },   mat: {},            coins: 100 },
      oil:       { chain: { trees: 20, iron: 9 },  mat: { Leather: 10 }, coins: 100 },
    };
    function roadmapMiningChain(settings, effOverride) {
      const farm = powerState.farm, cap = powerState.capacity;
      const p2p = roadmapPrices(settings), sm = powerState.stockMods;
      const cf = roadmapCoinsFree(settings);
      const er = cf ? Object.assign({}, powerState.exchangeRates, { coinsPerSFL: Infinity }) : powerState.exchangeRates;
      const eff = (c) => (effOverride && effOverride[c]) || roadmapOwnedEffects(c);
      const P = {}, tools = {}, price = {}, free = {};
      for (const c of MINE_CHAIN) {
        const e = eff(c);
        P[c] = RES_FARMKEY[c] ? gameResUnitsPerDay(c, farm, cap, e) : (applyBoosts(c, MINE_RES[c], cap, e).unitsPerDay || 0);
        tools[c] = miningToolsPerDay(c, cap, farm, roadmapOwnedEffects(c)); // deviation 4
        price[c] = p2p[MINE_RES[c]] || 0;
        try { free[c] = !!calcToolCostPerDay(c, cap, er, p2p, sm, false, farm, roadmapOwnedEffects(c)).freeTool || (eff(c) || []).some(e => e.type === "free_tool"); } catch { free[c] = (eff(c) || []).some(e => e.type === "free_tool"); }
      }
      // own (non-chain) tool cost per day: leather/wool + coins
      const ownCost = (c) => {
        if (!MINE_TOOL[c] || free[c]) return 0;
        let mats = MINE_TOOL[c].mat || {};
        if (c === "oil" && sm.oilRigActive) { mats = { Wool: 20 }; }
        let m = 0; for (const k in mats) m += (p2p[k] || 0) * mats[k];
        const coin = cf ? 0 : (er.coinsPerSFL > 0 ? (MINE_TOOL[c].coins || 0) / er.coinsPerSFL : 0);
        return (m + coin) * (tools[c] || 0);
      };
      // EMBEDDED-WOOD valuation. Wood is the base you produce; every ore is made FROM wood through its whole
      // pickaxe chain. To mine an ore you must mine its intermediates yourself, so its true cost is the TOTAL
      // wood baked in. embWood[c] = wood consumed per unit of c (recursive). Mine & sell c only if price > that.
      const woodPrice = price.trees || 0;
      const yieldOf = {}; for (const c of MINE_CHAIN) yieldOf[c] = (tools[c] > 0) ? P[c] / tools[c] : 0;
      const embWood = { trees: 1 };
      for (const c of ["stone", "iron", "gold", "crimstone", "oil"]) {
        const T = MINE_TOOL[c];
        if (!T || free[c] || !(yieldOf[c] > 0)) { embWood[c] = 0; continue; }
        let w = 0; for (const i in T.chain) w += T.chain[i] * (embWood[i] != null ? embWood[i] : (woodPrice > 0 ? (price[i] / woodPrice) : 0));
        embWood[c] = w / yieldOf[c];
      }
      // per-unit net vs selling the embedded wood; per-day profit; mine if positive
      const mined = {}, dailyProfit = {}, netPerUnit = {}, soloNet = {};
      let treeToolCost = 0; try { const _tt = calcToolCostPerDay("trees", cap, er, p2p, sm, false, farm, roadmapOwnedEffects("trees")); treeToolCost = _tt.freeTool ? 0 : (_tt.costPerDay || 0); } catch {}
      for (const c of MINE_CHAIN) {
        // SOLO net: mine c & sell it, buying its DIRECT recipe inputs at p2p (vs the chain's self-mined all-in wood).
        let _inSolo = 0; const _Ts = MINE_TOOL[c]; if (_Ts && !free[c]) for (const i in _Ts.chain) _inSolo += _Ts.chain[i] * price[i] * (tools[c] || 0);
        soloNet[c] = P[c] * price[c] - _inSolo - (c === "trees" ? treeToolCost : ownCost(c));
        if (c === "trees") { netPerUnit[c] = woodPrice; dailyProfit[c] = P[c] * woodPrice - treeToolCost; mined[c] = dailyProfit[c] > 1e-9; continue; }
        const costPerUnit = embWood[c] * woodPrice;          // wood baked in, per unit
        netPerUnit[c] = price[c] - costPerUnit;
        dailyProfit[c] = P[c] * netPerUnit[c] - ownCost(c);   // own = leather/wool + coins per day (≈0 for coins-free)
        mined[c] = dailyProfit[c] > 1e-9;
      }
      // return-on-wood per ore (how much converting Wood this far multiplies it) + the chain PEAK (best stop).
      const rowReturn = { trees: 1 };
      const chainOrder = ["stone", "iron", "gold", "crimstone"];
      for (const c of chainOrder) rowReturn[c] = (embWood[c] > 0 && woodPrice > 0 && P[c] > 0) ? price[c] / (embWood[c] * woodPrice) : 0;
      let peak = null, peakR = 1 + 1e-9;   // 1.0 = just selling Wood
      for (const c of chainOrder) if (P[c] > 0 && rowReturn[c] > peakR) { peakR = rowReturn[c]; peak = c; }
      const peakIdx = peak ? chainOrder.indexOf(peak) : -1;
      const verdict = { trees: "sell" };
      for (let i = 0; i < chainOrder.length; i++) {
        const c = chainOrder[i];
        if (!(P[c] > 0) || peak == null) verdict[c] = "skip";
        else if (i < peakIdx) verdict[c] = "step";   // necessary intermediate (loses on its own)
        else if (i === peakIdx) verdict[c] = "sell";  // best stopping point — sell here
        else verdict[c] = "skip";                      // one step too far
      }
      // ── MARKET (opportunity-cost) net: output & the tool's DIRECT inputs valued at marketplace sell, after
      //    fee. Free tool => no inputs charged (pure profit). Independent of how the inputs were produced.
      const _mode = settings.miningCostMode === "production" ? "production" : "market";
      const _fee = _mode === "market" ? Math.max(0, Math.min(0.6, (settings.marketFee != null ? +settings.marketFee : 10) / 100)) : 0;
      const marketNet = {};
      for (const c of MINE_CHAIN) {
        const _T = MINE_TOOL[c];
        let resCost = 0;
        if (_T && !free[c]) {
          for (const i in _T.chain) resCost += _T.chain[i] * price[i];
          const mats = (c === "oil" && sm.oilRigActive) ? { Wool: 20 } : (_T.mat || {});
          for (const m in mats) resCost += (p2p[m] || 0) * mats[m];
          resCost *= (tools[c] || 0);
        }
        let coin = 0;
        if (c === "trees") coin = treeToolCost;
        else if (_T && !free[c] && !cf && er.coinsPerSFL > 0) coin = ((_T.coins || 0) / er.coinsPerSFL) * (tools[c] || 0);
        marketNet[c] = (P[c] * price[c] - resCost) * (1 - _fee) - coin;
      }
      const byCat = {}; let total = 0;
      for (const c of MINE_CHAIN) {
        let v, net, dp, isP, feedsC;
        if (_mode === "market") {
          dp = marketNet[c]; v = dp > 1e-9 ? "sell" : "skip"; net = dp > 1e-9 ? dp : 0; isP = false; feedsC = null;
        } else {
          v = verdict[c] || "skip"; dp = dailyProfit[c] || 0; net = (v === "sell") ? dailyProfit[c] : 0; isP = (c === peak); feedsC = (v === "step" && peak) ? peak : null;
        }
        byCat[c] = { gross: P[c] * price[c], net, V: price[c], price: price[c], verdict: v,
          feeds: feedsC, mined: v !== "skip", produced: P[c],
          dailyProfit: dp, marketNet: marketNet[c] || 0, prodNet: dailyProfit[c] || 0, soloNet: soloNet[c] || 0,
          embWood: embWood[c] || 0, netPerUnit: netPerUnit[c] || 0,
          woodCostPerUnit: (embWood[c] || 0) * woodPrice, rowReturn: rowReturn[c] || 0, isPeak: isP,
          sellable: (v === "sell") ? P[c] : 0, consumed: 0, inputLimited: false };
        if (v === "sell") total += net;
      }
      return { byCat, total, peak: _mode === "production" ? peak : null, mode: _mode, fee: _fee };
    }

    // ── flowers.html 16175-16229: roadmapCatBreakdown + roadmapCatNet ──
    function roadmapCatBreakdown(cat, effects, settings) {
      const { capacity, savedProducts, exchangeRates, stockMods, season } = powerState;
      const p2pPrices = roadmapPrices(settings);
      const skills = (powerState.farm && powerState.farm.bumpkin && powerState.farm.bumpkin.skills) || {};
      const product = savedProducts[cat] || getDefaultProduct(cat);
      const er = roadmapCoinsFree(settings) ? Object.assign({}, exchangeRates, { coinsPerSFL: Infinity }) : exchangeRates;
      // Obsidian can only be liquidated ~1×/week → income = (1 obsidian − 1 ignition's fuel) / 7 days.
      if (cat === "obsidian") {
        if (getCapacityCount("obsidian", capacity) <= 0) return { gross: 0, cost: 0, net: 0 };
        const price = p2pPrices["Obsidian"] || 0;
        let lavaMult = 1;
        for (const e of (effects || [])) if (e.type === "lava_cost_reduction" && e.cat === "obsidian") lavaMult *= (1 - (e.value || 0));
        let ign = 0;
        try { ign = (calcLavaPitCostPerDay(capacity, p2pPrices, season, lavaMult).costPerIgnition) || 0; } catch {}
        return { gross: price / 7, cost: ign / 7, net: (price - ign) / 7 };
      }
      let gross = 0, cost = 0;
      try {
        if (isAnimalCat(cat)) {
          gross = (getAnimalCatSfl(cat, capacity, effects, p2pPrices).totalSfl) || 0;
          cost += (calcAnimalFeedCost(cat, capacity, p2pPrices, effects, stockMods).costPerDay) || 0;
          cost += (calcSicknessCost(cat, capacity, p2pPrices, powerState.boostItems, skills).costPerDay) || 0;
        } else if (cat === "crops" || cat === "fruits" || cat === "greenhouse") {
          const mix = roadmapCatMix(cat, effects, settings);
          gross = mix.gross; cost += mix.cost;
          if (cat === "fruits") {
            // Fruit-stump boosts (No Axe No Worries / Fruity Woody): wood gained + axe saved per lifecycle.
            const sw = (effects || []).filter(e => e.type === "fruit_stump_wood");
            const fc = (effects || []).filter(e => e.type === "fruit_free_chop");
            if (sw.length || fc.length) {
              const prod = savedProducts.fruits || getDefaultProduct("fruits");
              const hc = (typeof FRUIT_HARVEST_COUNT !== "undefined" && FRUIT_HARVEST_COUNT[prod]) || 3;
              const gs = (typeof FRUIT_GROW_DATA !== "undefined" && FRUIT_GROW_DATA[prod]) || 43200;
              const lc = getCapacityCount("fruits", capacity) * (86400 / (hc * gs));
              let sv = 0;
              for (const e of sw) sv += lc * (e.value || 0) * (p2pPrices["Wood"] || 0);
              if (fc.length && er.coinsPerSFL > 0) { const axe = TOOL_COSTS["Axe"]; if (axe) sv += lc * (axe.coins / er.coinsPerSFL); }
              gross += sv;
            }
          }
        } else if (ROADMAP_MINING_CATS.indexOf(cat) >= 0) {
          // Mining chain (sell-vs-use). effOverride routes a boost toggle through for marginals.
          const r = roadmapMiningChain(settings, { [cat]: effects }).byCat[cat] || { gross: 0, net: 0 };
          gross = r.gross; cost = r.gross - r.net;
        } else {
          gross = unitToSfl(applyBoosts(cat, product, capacity, effects).unitsPerDay, getPriceProduct(cat, product), p2pPrices) || 0;
          if (cat === "flowers") {
            cost += (calcSeedCostPerDay(cat, product, capacity, er, stockMods, effects, p2pPrices).costPerDay) || 0;
          }
        }
      } catch {}
      return { gross, cost, net: gross - cost };
    }
    function roadmapCatNet(cat, effects, settings) { return roadmapCatBreakdown(cat, effects, settings).net; }


    // ── flowers.html (roadmapOwnedEffects; deviation 4: farm passed to shrines) ──
    function roadmapOwnedEffects(cat) {
      return powerState.boostItems.filter(b => b.has).flatMap(b => b.effects.filter(e => e.cat === cat)).concat(activeShrineEffects(powerState.farm, cat));
    }


    // ── flowers.html 15360-15419: calcBoostValue ──
    function calcBoostValue(boostItem, catId, product, capacity, p2pPrices, allCatBoosts, isOwned) {
      const catEffects = getEffectsForCategory(boostItem, catId);
      if (catEffects.length === 0) return { solo: 0, synergy: 0, roi: Infinity };

      // If this boost is disabled by a stronger owned item, it contributes nothing
      if (boostItem.isDisabled) {
        return { solo: 0, synergy: 0, roi: Infinity, disabled: true, disabledByName: boostItem.disabledByName };
      }

      // Handle cost_reduction effects (e.g., Feller's Discount, Frugal Miner)
      const costEffects = catEffects.filter(e => e.type === "cost_reduction");
      if (costEffects.length > 0) {
        // Cost reduction value = base cost - discounted cost for this category
        const { exchangeRates, stockMods } = powerState;
        if (["trees", "stone", "iron", "gold", "crimstone", "oil"].includes(catId)) {
          // If category already has free tools, cost reduction has no effect
          const hasFreeTools = allCatBoosts.some(b => b.has && !b.isDisabled &&
            getEffectsForCategory(b, catId).some(e => e.type === "free_tool"));
          if (hasFreeTools) {
            return { solo: 0, synergy: 0, roi: Infinity, redundantFreeTool: true };
          }
          const baseCost = calcToolCostPerDay(catId, capacity, exchangeRates, p2pPrices, stockMods, true, powerState.farm, roadmapOwnedEffects(catId));
          // Apply only THIS boost's discount
          const discountValue = costEffects[0].value || 0.2;
          const savings = baseCost.costPerDay * discountValue; // 20% of base coin cost portion
          // More precisely: savings = (baseCoins * discountValue / coinsPerSFL) * toolsPerDay
          const toolName = Object.keys(TOOL_TO_CAT).find(t => TOOL_TO_CAT[t] === catId);
          const tool = toolName ? TOOL_COSTS[toolName] : null;
          let solo = 0;
          if (tool && baseCost.toolsPerDay > 0 && exchangeRates.coinsPerSFL > 0) {
            const coinSavingsPerUse = tool.coins * discountValue / exchangeRates.coinsPerSFL;
            solo = coinSavingsPerUse * baseCost.toolsPerDay;
          }
          const roi = (boostItem.floor > 0 && solo > 0) ? boostItem.floor / solo : Infinity;
          return { solo, synergy: solo, roi, isCostReduction: true };
        }
        return { solo: 0, synergy: 0, roi: Infinity };
      }

      // Non-animal categories: value via the SHARED roadmap engine (NET — with tool/seed cost + the mining
      // chain — at theoretical efficiency), so the Power page and the roadmap agree on every yield/tool boost.
      const _s = Object.assign({}, getRoadmapSettings(powerState.roadmapSettingsRaw), { effMode: "theoretical", effOverrides: {} }); // deviations 1+2
      const ownedEff = allCatBoosts.filter(b => b.has && !b.isDisabled && b.name !== boostItem.name).flatMap(b => getEffectsForCategory(b, catId)).concat(activeShrineEffects(powerState.farm, catId)); // deviation 4
      let synergy, solo;
      if (ROADMAP_MINING_CATS.indexOf(catId) >= 0) {
        const mk = (ef) => { const o = {}; o[catId] = ef; return roadmapMiningChain(_s, o).total; };
        synergy = mk(ownedEff.concat(catEffects)) - mk(ownedEff);
        solo = mk(catEffects) - mk([]);
      } else {
        const net = (ef) => Math.max(0, roadmapCatNet(catId, ef, _s));
        synergy = net(ownedEff.concat(catEffects)) - net(ownedEff);
        solo = net(catEffects) - net([]);
      }
      const roi = (boostItem.floor > 0 && synergy > 0) ? boostItem.floor / synergy : Infinity;
      const out = { solo, synergy, roi };
      if (catEffects.some(e => e.type === "free_tool")) out.isFreeTool = true;
      else if (catEffects.some(e => e.type === "lava_cost_reduction")) out.isLavaCostReduction = true;
      else if (catEffects.some(e => e.type === "fruit_stump_wood" || e.type === "fruit_free_chop")) out.isFruitStump = true;
      return out;
    }


    // ── flowers.html 15843-15847: ROADMAP_EFF_HKEY ──
    const ROADMAP_EFF_HKEY = {
      crops: "_h.crops", flowers: "_h.flowerBeds", fruits: "_h.fruitPatches", greenhouse: "_h.greenhouse",
      trees: "_h.trees", stone: "_h.stones", iron: "_h.iron", gold: "_h.gold", crimstone: "_h.crimstones",
      oil: "_h.oilReserves", obsidian: "_h.lavaPits", chickens: "_h.chickens", cows: "_h.cows", sheep: "_h.sheep",
    };

    // ── flowers.html 17360-17399: roadmapComputeMayEfficiency, fetch removed ──
    // The page fetched /api/farm-history itself; here the caller POSTs those snapshot
    // rows (diff-page pattern — compute stays DB-free). Body verbatim from the `if
    // (!rows...)` guard down; applyBoosts gets powerState.farm (deviation 4).
    function roadmapComputeEfficiency(rows) {
      const out = { effByCat: {}, meta: { snaps: 0, days: 0, available: false, from: "", to: "" } };
      if (!rows || rows.length < 2) return out;
      const sorted = rows.filter(s => s.captured_at && s.diff && Object.keys(s.diff).some(k => k.startsWith("_h.")))
        .sort((a, b) => new Date(a.captured_at) - new Date(b.captured_at));
      if (sorted.length < 2) return out;
      const pDays = (new Date(sorted[sorted.length - 1].captured_at) - new Date(sorted[0].captured_at)) / 86400000;
      out.meta = { snaps: sorted.length, days: pDays, available: pDays > 1, from: sorted[0].captured_at.slice(0, 10), to: sorted[sorted.length - 1].captured_at.slice(0, 10) };
      if (pDays <= 1) return out;
      const measuredRatios = [];
      for (const [catId, hKey] of Object.entries(ROADMAP_EFF_HKEY)) {
        const oeff = roadmapOwnedEffects(catId);
        const nodeCount = getCapacityCount(catId, powerState.capacity);
        // Harvest timestamps (+ cumulative units) from the _h.* history.
        let total = 0; const digTimes = [];
        for (const snap of sorted) { const c = (snap.diff || {})[hKey]; if (c > 0) { total += c; digTimes.push(new Date(snap.captured_at).getTime()); } }
        // Merge digs within 30 min into one session (exactly like the Nodes page).
        const sessions = [];
        if (digTimes.length) { let ss = digTimes[0], se = digTimes[0]; for (let i = 1; i < digTimes.length; i++) { if (digTimes[i] - se <= 1800000) se = digTimes[i]; else { sessions.push(ss); ss = digTimes[i]; se = digTimes[i]; } } sessions.push(ss); }
        // Theoretical cycles/day from the boosted respawn (animals have none → unmeasured; roadmapEffFactor returns 1 for them).
        let effectiveCycle = 0;
        try { effectiveCycle = applyBoosts(catId, getDefaultProduct(catId), powerState.capacity, oeff, powerState.farm).effectiveCycle || 0; } catch {}
        const theoPerDay = effectiveCycle > 0 ? 86400 / effectiveCycle : 0;
        const actualPerDay = sessions.length / pDays;
        let ratio = theoPerDay > 0 ? actualPerDay / theoPerDay : 0;
        if (ratio > 1.5) ratio = 1.5; // same clamp as the Nodes page
        const measured = theoPerDay > 0 && sessions.length > 0;
        out.effByCat[catId] = { ratio, total, actualPerDay, theoPerDay, sessions: sessions.length, nodeCount, measured };
        if (measured && catId !== "obsidian") measuredRatios.push(ratio);
      }
      out.meanRatio = measuredRatios.length ? measuredRatios.reduce((a, b) => a + b, 0) / measuredRatios.length : 0.5;
      return out;
    }



    // ── flowers.html 3934-3945: NODE_PRICES ──
    const NODE_PRICES = {
      trees:       { base: 4,  increase: 3,  farmKey: "trees",       catId: "trees",    label: "Tree" },
      stones:      { base: 4,  increase: 3,  farmKey: "stones",      catId: "stone",    label: "Stone" },
      iron:        { base: 7,  increase: 5,  farmKey: "iron",        catId: "iron",     label: "Iron" },
      gold:        { base: 10, increase: 6,  farmKey: "gold",        catId: "gold",     label: "Gold" },
      crimstones:  { base: 20, increase: 20, farmKey: "crimstones",  catId: "crimstone", label: "Crimstone" },
      oilReserves: { base: 40, increase: 20, farmKey: "oilReserves", catId: "oil",      label: "Oil Reserve" },
      crops:       { base: 3,  increase: 2,  farmKey: "crops",       catId: "crops",    label: "Crop Plot" },
      fruitPatches:{ base: 5,  increase: 5,  farmKey: "fruitPatches", catId: "fruits",  label: "Fruit Patch" },
      flowers:     { base: 30, increase: 25, farmKey: "flowers",     catId: "flowers",  label: "Flower Bed" },
    };


    // ── flowers.html 3959-3973: BASE_NODE_COUNTS + MERGE_COSTS ──
    const BASE_NODE_COUNTS = {
      basic:          { crops:31, trees:9,  stones:7,  iron:4,  gold:2, crimstones:0, oilReserves:0, lavaPits:0, fruitPatches:0, flowers:0 },
      spring:         { crops:45, trees:18, stones:15, iron:9,  gold:6, crimstones:2, oilReserves:0, lavaPits:0, fruitPatches:11, flowers:3 },
      desert:         { crops:65, trees:23, stones:20, iron:12, gold:7, crimstones:4, oilReserves:3, lavaPits:0, fruitPatches:15, flowers:3 },
      volcano:        { crops:65, trees:23, stones:20, iron:13, gold:8, crimstones:5, oilReserves:4, lavaPits:3, fruitPatches:15, flowers:3 },
    };

    // ── Merge costs (4×t1→t2, 4×t2→t3) ──
    const MERGE_COSTS = {
      trees:  { t2: { obsidian:3,  coins:25000  }, t3: { obsidian:5,  coins:50000  }, yieldBonus: { t2:0.5, t3:2.5 } },
      stones: { t2: { obsidian:5,  coins:50000  }, t3: { obsidian:10, coins:100000 }, yieldBonus: { t2:0.5, t3:2.5 } },
      iron:   { t2: { obsidian:10, coins:100000 }, t3: { obsidian:15, coins:200000 }, yieldBonus: { t2:0.5, t3:2.5 } },
      gold:   { t2: { obsidian:15, coins:200000 }, t3: { obsidian:20, coins:350000 }, yieldBonus: { t2:0.5, t3:2.5 } },
    };


    // ── flowers.html 19396-19404: countNodeTiers ──
    function countNodeTiers(resourceObj) {
      let t1 = 0, t2 = 0, t3 = 0;
      for (const node of Object.values(resourceObj || {})) {
        const m = node.multiplier || 1;
        if (m >= 16) t3++; else if (m >= 4) t2++; else t1++;
      }
      return { physical: t1 + t2 + t3, t1, t2, t3, effective: t1 + t2 * 4 + t3 * 16 };
    }


    // ── flowers.html 16216-16227: roadmapCurrentProduction ──
    function roadmapCurrentProduction(settings) {
      let total = 0; const breakdown = [];
      for (const [cat, meta] of Object.entries(POWER_CATEGORIES)) {
        if (!meta.quantifiable) continue;
        const net = roadmapCatNet(cat, roadmapOwnedEffects(cat), settings);
        const v = Math.max(0, net) * roadmapEffFactor(cat, settings);
        if (v > 0) { total += v; breakdown.push({ cat, sfl: v }); }
      }
      breakdown.sort((a, b) => b.sfl - a.sfl);
      return { total, breakdown };
    }


    // ── flowers.html 16896-16968: roadmapItemValue + roadmapItemSituational ──
    function roadmapItemValue(clone, catBoostsW, settings) {
      if (!clone) return 0;
      if (clone.fixedMarginal !== undefined) return clone.fixedMarginal; // node merge/expand actions
      let total = 0;
      const _exV = (settings.excludeCats || []);
      const mineCats = clone.categories.filter(c => ROADMAP_MINING_CATS.indexOf(c) >= 0 && POWER_CATEGORIES[c] && POWER_CATEGORIES[c].quantifiable && clone.effects.some(e => e.cat === c) && _exV.indexOf(c) < 0);
      // Mining boosts use the WHOLE-CHAIN delta: a tool/yield boost on one tier shifts other tiers' nets
      // (e.g. a free tool frees the upstream resource it would have eaten) — a per-category delta misses that.
      if (mineCats.length) {
        const override = {};
        for (const cat of mineCats) {
          const ownedEff = catBoostsW[cat].filter(b => b.has && !b.isDisabled).flatMap(b => b.effects.filter(e => e.cat === cat));
          override[cat] = ownedEff.concat(clone.effects.filter(e => e.cat === cat));
        }
        const d = roadmapMiningChain(settings, override).total - roadmapMiningChain(settings).total;
        if (d > 0) total += d * roadmapEffFactor(mineCats[0], settings);
      }
      for (const cat of clone.categories) {
        if (ROADMAP_MINING_CATS.indexOf(cat) >= 0) continue; // handled by the chain delta above
        if (_exV.indexOf(cat) >= 0) continue; // user filtered this activity out
        if (!POWER_CATEGORIES[cat] || !POWER_CATEGORIES[cat].quantifiable) continue;
        const itemEff = clone.effects.filter(e => e.cat === cat);
        if (itemEff.length === 0) continue;
        const ownedEff = catBoostsW[cat].filter(b => b.has && !b.isDisabled).flatMap(b => b.effects.filter(e => e.cat === cat));
        const without = Math.max(0, roadmapCatNet(cat, ownedEff, settings));
        const withIt = Math.max(0, roadmapCatNet(cat, ownedEff.concat(itemEff), settings));
        const delta = withIt - without;
        if (delta > 0) total += delta * roadmapEffFactor(cat, settings);
      }
      return total;
    }

    // "Situational" value: what a boost is worth if you DID run the activity it touches, even when that
    // activity isn't in your current profit-optimal setup. Crops/fruits/greenhouse → grow the boosted
    // product on its seed-capped plots and take the best single deployment. Resources/animals → the
    // unfloored category improvement (so a boost to a still-loss-making category like crimstone still
    // registers). Returns { value, reason } — used only to surface 0-marginal boosts, never income.
    function roadmapItemSituational(clone, catBoostsW, settings) {
      if (!clone) return { value: 0, reason: "" };
      let total = 0; const reasons = [];
      for (const cat of clone.categories) {
        if (!POWER_CATEGORIES[cat] || !POWER_CATEGORIES[cat].quantifiable) continue;
        if ((settings.excludeCats || []).indexOf(cat) >= 0) continue;
        const itemEff = clone.effects.filter(e => e.cat === cat);
        if (!itemEff.length) continue;
        const ownedEff = catBoostsW[cat].filter(b => b.has && !b.isDisabled).flatMap(b => b.effects.filter(e => e.cat === cat));
        let v = 0;
        if (cat === "crops" || cat === "fruits" || cat === "greenhouse") {
          const table = cat === "crops" ? CROP_GROW_DATA : (cat === "fruits" ? FRUIT_GROW_DATA : GREENHOUSE_GROW_DATA);
          let prods = Array.from(new Set(itemEff.filter(e => e.product).map(e => e.product)));
          if (!prods.length) prods = Object.keys(table); // AOE/global → best of any product
          prods = prods.filter(p => (settings.excludeCats || []).indexOf(p) < 0); // drop crops/fruits the user filtered out
          let best = 0, bestP = "";
          for (const p of prods) {
            if (!table[p]) continue;
            const a = roadmapPerPlot(cat, p, ownedEff.concat(itemEff), settings);
            const b = roadmapPerPlot(cat, p, ownedEff, settings);
            if (!a || !b) continue;
            const plotsP = Math.min(a.plots, a.maxPlots);
            const d = ((a.gpp - a.cpp) - (b.gpp - b.cpp)) * plotsP;
            if (d > best) { best = d; bestP = p; }
          }
          v = best;
          if (best > 0 && bestP) reasons.push("if you grow " + bestP);
        } else {
          const d = roadmapCatNet(cat, ownedEff.concat(itemEff), settings) - roadmapCatNet(cat, ownedEff, settings);
          v = Math.max(0, d);
          if (v > 0) reasons.push((POWER_CATEGORIES[cat].label || cat) + " (still below break-even)");
        }
        total += v * roadmapEffFactor(cat, settings);
      }
      return { value: total, reason: reasons.join(", ") };
    }

    // ── flowers.html 17344-17373: roadmapBuildClones + roadmapBuildMissing ──
    function roadmapBuildClones() {
      const clones = powerState.boostItems.map(b => Object.assign({}, b));
      const byName = {};
      clones.forEach(c => { byName[c.name] = c; });
      const catBoostsW = {};
      for (const cat of Object.keys(POWER_CATEGORIES)) catBoostsW[cat] = clones.filter(c => c.categories.includes(cat));
      return { byName, catBoostsW };
    }

    function roadmapBuildMissing(byName, settings) {
      const { nftData, inventory, farm } = powerState;
      const wardrobe = farm.wardrobe || {};
      const out = [];
      const seen = new Set();
      const add = (item, type) => {
        const name = item && item.name;
        if (!name || seen.has(name)) return;
        seen.add(name);
        const has = type === "Wearable"
          ? (wardrobe[name] || 0) > 0
          : (getCount(inventory, name) > 0 || findCollectible(farm, name).length > 0);
        if (has) return;
        const clone = byName[name] || null;
        const floor = clone ? clone.floor : (parseFloat(item.floor) || 0);
        out.push({ name, type, floor, clone, boost: (item.boost_text || (clone && clone.boost) || ""), supply: item.supply || 0 });
      };
      if (settings.incCollectibles && nftData) for (const it of (nftData.collectibles || [])) add(it, "Collectible");
      if (settings.incWearables && nftData) for (const it of (nftData.wearables || [])) add(it, "Wearable");
      return out;
    }

    // ── flowers.html 17378-17431: roadmapNodeCandidates ──
    function roadmapNodeCandidates(settings) {
      const out = [];
      const { capacity, exchangeRates, farm } = powerState;
      const p2pPrices = roadmapPrices(settings);
      const obsidianP = p2pPrices["Obsidian"] || 0;
      if (!(obsidianP > 0)) return out;               // can't price Obsidian → skip node actions
      const sunstoneP = obsidianP * 3;                 // 1 Sunstone = 3 Obsidian
      const coinsFree = roadmapCoinsFree(settings);
      const er = coinsFree ? Object.assign({}, exchangeRates, { coinsPerSFL: Infinity }) : exchangeRates;
      const coinSfl = (coins) => coinsFree ? 0 : (er.coinsPerSFL > 0 ? coins / er.coinsPerSFL : 0);
      const islandType = ((farm.island && farm.island.type) || "basic").toLowerCase();
      const baseNodes = (typeof BASE_NODE_COUNTS !== "undefined" && (BASE_NODE_COUNTS[islandType] || BASE_NODE_COUNTS.basic)) || {};
      const mkItem = (name, cost, cat, marg, desc) => ({ name, type: "Node", floor: cost, boost: desc, supply: 0,
        clone: { name, categories: [cat], effects: [], fixedMarginal: marg, has: false, isDisabled: false } });
      const MERGEKEY_CAT = { trees: "trees", stones: "stone", iron: "iron", gold: "gold" };
      const cyclesFor = (cat) => { const oeff = roadmapOwnedEffects(cat); const ab = applyBoosts(cat, getDefaultProduct(cat), capacity, oeff); return ab.effectiveCycle > 0 ? 86400 / ab.effectiveCycle : 0; };

      // A. Obsidian merges (4× t1 -> t2, 4× t2 -> t3) — each +0.5 yield/cycle.
      for (const [mk, mc] of Object.entries(MERGE_COSTS)) {
        const cat = MERGEKEY_CAT[mk]; const fk = RES_FARMKEY[cat]; if (!cat || !fk) continue;
        const tiers = countNodeTiers(farm[fk] || {});
        const price = p2pPrices[getDefaultProduct(cat)] || 0;
        const marg = 0.5 * cyclesFor(cat) * price * roadmapEffFactor(cat, settings);
        if (!(marg > 0)) continue;
        const label = (typeof NODE_PRICES !== "undefined" && NODE_PRICES[mk] && NODE_PRICES[mk].label) || cat;
        const nT2 = Math.floor((tiers.t1 || 0) / 4);
        const costT2 = mc.t2.obsidian * obsidianP + coinSfl(mc.t2.coins);
        for (let i = 0; i < Math.min(nT2, 20); i++) out.push(mkItem("Merge " + label + " \u2192 tier 2", costT2, cat, marg, "4\u00d7 t1 \u2192 t2 \u00b7 +0.5/cycle \u00b7 " + mc.t2.obsidian + " Obsidian" + (coinsFree ? "" : " + " + (mc.t2.coins / 1000) + "k coins")));
        const nT3 = Math.floor((tiers.t2 || 0) / 4);
        const costT3 = mc.t3.obsidian * obsidianP + coinSfl(mc.t3.coins);
        for (let i = 0; i < Math.min(nT3, 10); i++) out.push(mkItem("Merge " + label + " \u2192 tier 3", costT3, cat, marg, "4\u00d7 t2 \u2192 t3 \u00b7 +0.5/cycle \u00b7 " + mc.t3.obsidian + " Obsidian" + (coinsFree ? "" : " + " + (mc.t3.coins / 1000) + "k coins")));
      }

      // B. Buy new nodes with Sunstone (next 3 per resource; escalating cost).
      if (typeof NODE_PRICES !== "undefined") for (const [nk, np] of Object.entries(NODE_PRICES)) {
        const cat = np.catId; const fk = RES_FARMKEY[cat]; if (!fk) continue; // mineable/tree nodes only
        const tiers = countNodeTiers(farm[fk] || {});
        const purchased = Math.max(0, tiers.effective - (baseNodes[nk] || 0));
        const oeff = roadmapOwnedEffects(cat);
        const price = p2pPrices[getDefaultProduct(cat)] || 0;
        const perNodeBase = gameResBoostedBase(farm, cat, oeff);   // one fresh t1 node, yield/cycle
        const grossDay = perNodeBase * cyclesFor(cat) * price;
        let toolPerNode = 0;
        try { const tc = (calcToolCostPerDay(cat, capacity, er, p2pPrices, powerState.stockMods, false).costPerDay) || 0; const nN = Object.keys(farm[fk] || {}).length; toolPerNode = nN > 0 ? tc / nN : 0; } catch {}
        const marg = Math.max(0, grossDay - toolPerNode) * roadmapEffFactor(cat, settings);
        if (!(marg > 0)) continue;
        for (let i = 0; i < 3; i++) {
          const nextSun = np.base + (purchased + i) * np.increase;
          out.push(mkItem("Buy " + np.label + " node", nextSun * sunstoneP, cat, marg, "+1 node \u00b7 " + nextSun + " Sunstone (" + (nextSun * 3) + " Obsidian)"));
        }
      }
      return out;
    }


    // ── flowers.html 17432-17560: roadmapSimulate ──
    function roadmapSimulate(settings, startIncome) {
      const { byName, catBoostsW } = roadmapBuildClones();
      const missing = roadmapBuildMissing(byName, settings);
      const econ = [], cosmetic = [], untradeable = [], tail = [];
      let noBoostCount = 0;
      const TROLL = 500000; // floors above this are troll listings / no real liquidity (SFL supply ~50M)
      const maxP = (settings.maxPrice && settings.maxPrice > 0) ? settings.maxPrice : Infinity;
      for (const m of missing) {
        if (!(m.floor > 0) || m.floor > TROLL) { untradeable.push(m); continue; }
        if (!m.clone) { noBoostCount++; continue; } // no boost at all (pure decoration) → not part of the profit roadmap
        if (m.floor > maxP) { tail.push(m); continue; }
        const economic = !m.clone.isDisabled && m.clone.categories.some(c => POWER_CATEGORIES[c] && POWER_CATEGORIES[c].quantifiable);
        if (economic) econ.push(m); else cosmetic.push(m);
      }
      // Fold in node expansion / Obsidian-merge actions (respect the price cap).
      const nodeCands = roadmapNodeCandidates(settings);
      for (const nc of nodeCands) { if (nc.floor > 0 && nc.floor <= maxP) econ.push(nc); }
      // Skills are NOT part of the buy path (Visual / Table) — they live in their own Skills tab. They cost
      // skill POINTS, not FLOWER, so they don't belong in a FLOWER reinvestment-ordered buy order.
      tail.sort((a, b) => a.floor - b.floor);
      const tailCost = tail.reduce((s, m) => s + m.floor, 0);
      // Snapshot the original owned state so we can re-simulate any order from scratch.
      const origHas = [];
      for (const cat of Object.keys(catBoostsW)) for (const c of catBoostsW[cat]) origHas.push([c, c.has]);
      for (const nc of nodeCands) origHas.push([nc.clone, nc.clone.has]);
      const resetClones = () => { for (const [c, h] of origHas) c.has = h; };

      const econPos = [], situational = [];
      for (const m of econ) {
        m.marginal = roadmapItemValue(m.clone, catBoostsW, settings);
        if (m.marginal > 0) { econPos.push(m); continue; }
        const sit = roadmapItemSituational(m.clone, catBoostsW, settings);
        if (sit.value > 0.0001) { m.sitValue = sit.value; m.sitReason = sit.reason; situational.push(m); }
        else cosmetic.push(m);
      }
      situational.sort((a, b) => (a.floor / (a.sitValue || 1e-9)) - (b.floor / (b.sitValue || 1e-9)));

      // Simulate a buy ORDER with reinvestment + dynamic synergy. Returns the step timeline,
      // final rate, total days, and the total FLOWER income integrated over horizon H (objective).
      const simOrder = (order, H) => {
        resetClones();
        let r = startIncome > 0 ? startIncome : 0, day = 0, integral = 0, cumc = 0;
        const steps = [];
        for (const m of order) {
          const marg = Math.max(0, roadmapItemValue(m.clone, catBoostsW, settings));
          const dd = r > 0 ? m.floor / r : Infinity;
          if (isFinite(dd)) integral += r * dd;
          day += dd; m.clone.has = true; r += marg;
          cumc += m.floor; steps.push({ m, marg, atDay: day, rateAfter: r, cumCost: cumc });
        }
        if (H > 0 && isFinite(day)) integral += r * Math.max(0, H - day);
        return { steps, finalRate: r, totalDays: day, integral };
      };

      // Greedy start: lowest payback first, recomputing synergy after each buy.
      const greedyOrder = () => {
        resetClones();
        const rem = econPos.slice();
        for (const m of rem) { m._mg = roadmapItemValue(m.clone, catBoostsW, settings); m._roi = m._mg > 0 ? m.floor / m._mg : Infinity; }
        const ord = []; let g = 0;
        while (rem.length && g++ < 5000) {
          let bi = 0; for (let i = 1; i < rem.length; i++) if (rem[i]._roi < rem[bi]._roi) bi = i;
          const nx = rem.splice(bi, 1)[0];
          if (!(nx._mg > 0)) continue;
          nx.clone.has = true; ord.push(nx);
          const cats = new Set(nx.clone.categories);
          for (const m of rem) if (m.clone.categories.some(c => cats.has(c))) { m._mg = roadmapItemValue(m.clone, catBoostsW, settings); m._roi = m._mg > 0 ? m.floor / m._mg : Infinity; }
        }
        return ord;
      };

      let order = greedyOrder();
      const H = (settings.horizonYears || 100) * 365;
      const greedyVal = order.length ? simOrder(order, H).integral : 0;
      // Local-search refinement: adjacent swaps that raise total FLOWER over the horizon. Greedy
      // ROI is optimal for independent items; this catches reinvestment cases where buying a cheap
      // booster slightly earlier compounds into more total FLOWER (the user's "B then A" case).
      if (settings.optimizeOrder !== false && order.length > 1 && order.length <= 140) {
        let best = greedyVal, improved = true, passes = 0;
        while (improved && passes++ < 8) {
          improved = false;
          for (let i = 0; i < order.length - 1; i++) {
            const sw = order.slice(); const tmp = sw[i]; sw[i] = sw[i + 1]; sw[i + 1] = tmp;
            const v = simOrder(sw, H).integral;
            if (v > best + Math.abs(best) * 1e-9 + 1e-6) { order = sw; best = v; improved = true; }
          }
        }
      }
      const fin = simOrder(order, H);
      const optGainPct = greedyVal > 0 ? (fin.integral / greedyVal - 1) * 100 : 0;

      // DISPLAY uses each item's marginal vs your CURRENT farm (s.m.marginal) — NOT its buy-ORDER
      // position. Otherwise a boost bought after big synergistic ones (e.g. Tiki Totem after the Beavers
      // double Wood respawn) shows an inflated, order-dependent number. Cumulative cost / income / ETA
      // are a running total in the shown order, so the columns add up to the per-row +FL/day.
      const timeline = [];
      { let ri = (startIncome > 0 ? startIncome : 0), rd = 0;
        for (const s of fin.steps) { const bm = Math.max(0, s.m.marginal || 0); const dd = ri > 0 ? s.m.floor / ri : Infinity; if (isFinite(dd)) rd += dd; ri += bm;
          timeline.push({ name: s.m.name, type: s.m.type, boost: s.m.boost, floor: s.m.floor, marginal: bm, roi: bm > 0 ? s.m.floor / bm : Infinity, atDay: rd, rateAfter: ri, kind: "econ", skillFree: s.m.skillFree, skillPoints: s.m.skillPoints, skillTree: s.m.skillTree, skillTier: s.m.skillTier }); } }
      let rate = (startIncome > 0 ? startIncome : 0) + fin.steps.reduce((a, s) => a + Math.max(0, s.m.marginal || 0), 0);
      let cumDays = timeline.length ? timeline[timeline.length - 1].atDay : 0;
      const econSteps = timeline.length;
      const econCost = timeline.reduce((s, t) => s + t.floor, 0);
      const finalRate = rate;

      cosmetic.sort((a, b) => a.floor - b.floor);
      for (const m of cosmetic) {
        const days = rate > 0 ? m.floor / rate : Infinity;
        cumDays += days;
        timeline.push({ name: m.name, type: m.type, boost: m.boost, floor: m.floor, marginal: 0, roi: Infinity, atDay: cumDays, rateAfter: rate, kind: "cosmetic" });
      }
      const totalCost = timeline.reduce((s, t) => s + t.floor, 0);
      // Worthwhile core: the good-payback buys (the ones actually worth doing) vs the expensive long tail.
      const CORE_ROI_DAYS = 730; // 2 years
      let coreCost = 0, coreMarg = 0, coreCount = 0, coreDays = 0;
      for (const t of timeline) {
        if (t.kind !== "econ") continue;
        if (t.roi <= CORE_ROI_DAYS) { coreCost += t.floor; coreMarg += t.marginal; coreCount++; coreDays = Math.max(coreDays, t.atDay); }
      }
      const coreRate = (startIncome > 0 ? startIncome : 0) + coreMarg;
      // Unified ranked list: in-plan steps + conditional (situational), sorted by payback (ROI).
      const ranked = [];
      for (const s of fin.steps) { const bm = Math.max(0, s.m.marginal || 0); ranked.push({ name: s.m.name, type: s.m.type, boost: s.m.boost, floor: s.m.floor, value: bm, roi: bm > 0 ? s.m.floor / bm : Infinity, status: "plan", skillFree: s.m.skillFree, skillTree: s.m.skillTree, skillTier: s.m.skillTier }); }
      for (const m of situational) ranked.push({ name: m.name, type: m.type, boost: m.boost, floor: m.floor, value: m.sitValue, roi: m.sitValue > 0 ? m.floor / m.sitValue : Infinity, status: "conditional", reason: m.sitReason });
      ranked.sort((a, b) => a.roi - b.roi);
      { let rc = 0, ri = (startIncome > 0 ? startIncome : 0), rd = 0;
        for (const r of ranked) { if (r.status !== "plan") continue; const dd = ri > 0 ? r.floor / ri : Infinity; if (isFinite(dd)) rd += dd; rc += r.floor; ri += r.value; r.cumCost = rc; r.rateAfter = ri; r.atDay = rd; } }
      return { timeline, ranked, coreCount, coreCost, coreRate, coreDays, econSteps, cosmeticCount: cosmetic.length, econCost, untradeable, tail, tailCost, noBoostCount, situational, startRate: startIncome, finalRate, totalDays: cumDays, totalCost, optGainPct, horizonYears: (settings.horizonYears || 100) };
    }

export {
  BASE_NODE_COUNTS, MERGE_COSTS, countNodeTiers, roadmapCurrentProduction,
  roadmapItemValue, roadmapItemSituational, roadmapSimulate, _setRoadmapState,
  ROADMAP_EFF_HKEY, roadmapComputeEfficiency,
  getRoadmapSettings, roadmapOwnedEffects, roadmapCatBreakdown, roadmapCatNet,
  roadmapMiningChain, ROADMAP_MINING_CATS, calcBoostValue, cmGetSeedRestockCount,
};
