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
  RES_FARMKEY, gameResYield, applyBoosts, miningToolsPerDay, calcToolCostPerDay,
  getCycleSec, getCapacityCount, getDefaultProduct, isAnimalCat,
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


export {
  ROADMAP_EFF_HKEY, roadmapComputeEfficiency,
  getRoadmapSettings, roadmapOwnedEffects, roadmapCatBreakdown, roadmapCatNet,
  roadmapMiningChain, ROADMAP_MINING_CATS, calcBoostValue, cmGetSeedRestockCount,
};
