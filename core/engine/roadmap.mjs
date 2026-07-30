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
  getEffectsForCategory, TOOL_TO_CAT, SKILL_POINTS_PER_TIER,
} from "./power-helpers.mjs";
import {
  unitToSfl, calcSeedCostPerDay, calcAnimalFeedCost, calcSicknessCost,
  calcLavaPitCostPerDay, getAnimalCatSfl, getPriceProduct, activeShrineEffects,
} from "./power-costs.mjs";
import {
  CROP_GROW_DATA, FRUIT_GROW_DATA, GREENHOUSE_GROW_DATA, FRUIT_HARVEST_COUNT,
} from "./power-boosts.mjs";
import { TOOL_COSTS } from "../data/economy.mjs";
import { SALT_RAKE_COST } from "../data/cooking.mjs";
import { computeSaltYieldPerRake, computeSaltRakeCoinMult } from "./cooking-cost.mjs";

// Deviation 1: the page global, module-scoped. Set before any calc.
let powerState = null;
let roadmapState = null; // deviation 3: no measured history server-side
export function _setPowerContext(ps) { powerState = ps; }
export function _getPowerContext() { return powerState; }
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
    /*
     * Which products fill the plots, and what that grosses and costs.
     *
     * Two bases. The default is unchanged: only what is in season RIGHT NOW competes, which is
     * the honest answer to "what am I earning this week".
     *
     * `seasonBasis: "annual"` — set by calcBoostValue, the PERMANENT-value path — answers a
     * different question, because a boost is bought once and kept. The in-season gate was wrong
     * there in both directions: a boost tied to Banana (summer + autumn) scored 100% for half a
     * year and 0% for the other half, and the 13 single-season products scored 100% for a
     * quarter of it. Up to a 4x overstatement on the exact number a buy decision is made from.
     *
     * It is annualised by running the selection ONCE PER SEASON and averaging the four results.
     * Not by weighting each product by its share of the year and selecting once — that was the
     * first attempt and it was worse than the bug: a weighted Corn never beats year-round Wheat
     * for a plot, so every Corn-specific boost collapsed to exactly 0 instead of a quarter of
     * its value. In Corn's own season Corn does win, and that value is real.
     *
     * Cost of doing it properly is near zero: roadmapPerPlot does not depend on the season, so
     * it still runs once per product. Only the fill — a sort and a loop — repeats four times.
     */
    function roadmapCatMix(cat, effects, settings) {
      const plots = getCapacityCount(cat, powerState.capacity);
      if (!(plots > 0)) return { gross: 0, cost: 0 };
      const table = cat === "crops" ? CROP_GROW_DATA : (cat === "fruits" ? FRUIT_GROW_DATA : GREENHOUSE_GROW_DATA);
      const rows = [];
      const _exM = (settings.excludeCats || []);
      for (const p of Object.keys(table)) {
        if (_exM.indexOf(p) >= 0) continue;
        const pp = roadmapPerPlot(cat, p, effects, settings); if (!pp) continue;
        rows.push({ p, netPerPlot: pp.gpp - pp.cpp, grossPerPlot: pp.gpp, costPerPlot: pp.cpp, maxPlots: pp.maxPlots });
      }
      // Fill the plots with the best available, richest first. `allow` decides what is available.
      const fill = (allow) => {
        const rs = (allow ? rows.filter((r) => allow(r.p)) : rows).slice().sort((a, b) => b.netPerPlot - a.netPerPlot);
        let rem = plots, gross = 0, cost = 0;
        for (const r of rs) {
          if (rem <= 1e-9 || !(r.netPerPlot > 0)) break;
          const take = Math.min(rem, r.maxPlots); if (take <= 0) continue;
          gross += r.grossPerPlot * take; cost += r.costPerPlot * take; rem -= take;
        }
        return { gross, cost };
      };
      const seasonal = (cat === "crops" || cat === "fruits");
      if (!seasonal) return fill(null);
      if (settings.seasonBasis !== "annual") return fill((p) => roadmapInSeason(p));
      const names = Object.keys(SEASON_CROPS);
      let g = 0, c = 0;
      for (const sName of names) {
        const list = SEASON_CROPS[sName] || [];
        // A product in no season table at all is year-round (greenhouse items reaching here).
        const inAny = (p) => names.some((x) => (SEASON_CROPS[x] || []).indexOf(p) >= 0);
        const r = fill((p) => (list.indexOf(p) >= 0) || !inAny(p));
        g += r.gross; c += r.cost;
      }
      return { gross: g / names.length, cost: c / names.length };
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
    function calcBoostValue(boostItem, catId, product, capacity, p2pPrices, allCatBoosts, isOwned, effMode) {
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
      /*
       * effMode defaults to "theoretical" — deviations 1+2, so the Power page and the
       * roadmap agree on every yield/tool boost. A caller can ask for "measured" instead to
       * get what the boost is worth at this farm's OBSERVED throughput, which is what the
       * wishlist's efficiency toggle shows. Only the explicit opt-in changes behaviour;
       * every existing caller keeps the theoretical figure it had.
       */
      // seasonBasis "annual": bought once and kept, so valued over the whole year.
      const _s = effMode === "measured"
        ? Object.assign({}, getRoadmapSettings(powerState.roadmapSettingsRaw), { seasonBasis: "annual" })
        : Object.assign({}, getRoadmapSettings(powerState.roadmapSettingsRaw), { effMode: "theoretical", effOverrides: {}, seasonBasis: "annual" });
      const ownedEff = allCatBoosts.filter(b => b.has && !b.isDisabled && b.name !== boostItem.name).flatMap(b => getEffectsForCategory(b, catId)).concat(activeShrineEffects(powerState.farm, catId)); // deviation 4
      let synergy, solo;
      if (ROADMAP_MINING_CATS.indexOf(catId) >= 0) {
        const mk = (ef) => { const o = {}; o[catId] = ef; return roadmapMiningChain(_s, o).total; };
        synergy = mk(ownedEff.concat(catEffects)) - mk(ownedEff);
        solo = mk(catEffects) - mk([]);
      } else {
        /*
         * Clamp the DIFFERENCE, not each side of it.
         *
         * Clamping both nets first made every boost on a loss-making category read exactly
         * 0. On a real farm chickens net -0.87 FLOWER/day (gross 1.05 vs 1.92 of feed and
         * sickness), so max(0, ·) flattened both sides to 0 and took the marginal with it:
         * Rich Chicken's +0.016/day of extra eggs and Fat Chicken's +0.168/day of saved feed
         * both reported as worthless. It also overstated the reverse case — a boost that
         * turns a loss-maker profitable scored its whole net instead of the part it added.
         *
         * The mining branch above already differences raw nets; this matches it.
         *
         * And the difference is NOT clamped either, as of the unclamp pass: a boost that makes
         * a category worse reports the negative. Measured on a real farm before shipping it —
         * 6 of 277 valued items move, none of them owned, and what they gain is a warning:
         * Acre Farm reads -0.74/day there because its -0.5 Advanced Crop debuff outweighs its
         * buff on that crop mix, where a clamped 0.00 read as merely uninteresting.
         */
        const net = (ef) => roadmapCatNet(catId, ef, _s);
        synergy = net(ownedEff.concat(catEffects)) - net(ownedEff);
        solo = net(catEffects) - net([]);
      }
      /*
       * Coin drops per harvest (coin_chance): Money Tree's "1% chance +200 Coins chopping
       * trees". Neither the chain nor roadmapCatNet models coins, so this is additive on top
       * of whatever the category's production came to — it is extra revenue per harvest event,
       * not a change to the yield.
       *
       * Added here because it was the one component the roadmap's skills view priced and this
       * engine did not: Money Tree read 0.756/day there and exactly 0 on the Power page.
       * Converted through coinsPerSFL, and scaled by the harvest rate the same cost model uses
       * for tools, so a category you barely touch earns proportionally less from it.
       */
      const coinEffects = catEffects.filter(e => e.type === "coin_chance");
      if (coinEffects.length) {
        const { capacity, exchangeRates } = powerState;
        const cps = exchangeRates && exchangeRates.coinsPerSFL;
        if (cps > 0) {
          let harvests = 0;
          try { harvests = miningToolsPerDay(catId, capacity, powerState.farm, ownedEff) || 0; } catch (e) { harvests = 0; }
          if (harvests > 0) {
            let add = 0;
            for (const e of coinEffects) add += ((e.pct || 0) / 100) * (e.coins || 0) * harvests / cps;
            synergy += add;
            solo += add;
          }
        }
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
        /*
         * Deliberately roadmapCatNet, not the plot-aware roadmapAnyCatNet. A blanket rename caught
         * this call site by accident and it must not change: this is the farm's CURRENT income,
         * which feeds startIncome and therefore every ETA on the page. Making it plot-aware would
         * very likely be an improvement — roadmapCatNet reports 0 for greenhouse — but that is a
         * separate, deliberate change with its own measurement, not a side effect of this one.
         */
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

    /*
     * SKILLS AND ASCENSION RANKS IN THE BUY PATH.
     *
     * They were excluded, and the reason given was that they cost skill POINTS rather than FLOWER
     * so they do not belong in a FLOWER-ordered reinvestment queue. That is half right, and the
     * half that is wrong is the important half: a skill point is BOUGHT, with the FLOWER of the
     * food you cook to earn the XP. skillCostInfo already derives that rate (the cheapest XP
     * recipe on this farm, with the farm's own XP boosts applied), and every skill boostItem
     * already carries `floor = points x sflPerPoint` because the Power page shows it.
     *
     * So there are two kinds of skill action, and collapsing them is what made this look
     * impossible:
     *
     *   1. Points you ALREADY HAVE. Those cost nothing — the XP is spent, the point is sitting
     *      unused — so the skill is free income and belongs at the very FRONT of the order, ahead
     *      of everything you have to save up for. Free points are a fixed budget, so they are
     *      allocated here by value PER POINT before the queue is built; leaving the simulator to
     *      break the tie would hand them out arbitrarily.
     *   2. Points you do not have yet. Those cost points x sflPerPoint, which is a real FLOWER
     *      cost and competes on equal terms with an NFT.
     *
     * Ascension ranks (Level 2 / Level 3) additionally cost Ascension Shards. Shards have no
     * market — they come from ascension crystals — so they are priced by DERIVATION, and it is the
     * owner's: one shard is worth a Gold Pickaxe's material cost. That is an assumption, not a
     * quote, and it is labelled as one everywhere it is used. `shardSfl` is reported so the
     * consumer can show it and so changing it is one edit.
     *
     * Values come from the SAME clone the rest of the path uses, so a skill's synergy with owned
     * items is modelled exactly as an NFT's is. Rank deltas come from the served rank layer, which
     * is the engine the Power page and the Skills tab already read.
     */
    function roadmapShardSfl() {
      // Gold Pickaxe: 100 coins + 3 Wood + 3 Gold (economy.mjs TOOL_COSTS). Coins follow the
      // roadmap's own coins-are-free rule so this cannot contradict the rest of the page.
      const p2pPrices = roadmapPrices(getRoadmapSettings(powerState.roadmapSettingsRaw || {}));
      const t = (typeof TOOL_COSTS !== "undefined" && TOOL_COSTS["Gold Pickaxe"]) || null;
      if (!t) return 0;
      let sfl = 0;
      for (const [item, qty] of Object.entries(t.materials || {})) sfl += (p2pPrices[item] || 0) * qty;
      return sfl;
    }
    function roadmapSkillCandidates(settings, byName, catBoostsW) {
      const out = [];
      const { boostItems, farm, skillCostInfo, skillRanks } = powerState;
      if (!boostItems) return out;
      const sflPerPoint = (skillCostInfo && skillCostInfo.sflPerPoint) || 0;
      const skills = boostItems.filter((b) => b.type === "Skill");
      if (!skills.length) return out;

      /*
       * Tier gates, from the game's getUnlockedTierForTree: a tier only opens once enough points
       * sit in that TREE, and points spent on tier-3 skills never count toward a gate. A gated
       * skill is not buyable yet at any price, so offering it would make the order a fiction.
       */
      const inTree = {};
      for (const b of skills) {
        if (!b.has || (Number(b.skillTier) || 1) === 3) continue;
        inTree[b.skillTree] = (inTree[b.skillTree] || 0) + (b.skillPoints || 1);
      }
      const gated = (b) => {
        const need = (SKILL_POINTS_PER_TIER[b.skillTree] || {})[Number(b.skillTier) || 1] || 0;
        return (inTree[b.skillTree] || 0) < need;
      };

      // Free points: (level - 1) minus what is already spent, or the owner's override.
      const level = (skillCostInfo && skillCostInfo.level) || 1;
      let spent = 0;
      for (const b of skills) if (b.has) spent += (b.skillPoints || 1);
      let freePts = (settings.skillPts != null && isFinite(settings.skillPts))
        ? Math.max(0, settings.skillPts) : Math.max(0, (level - 1) - spent);

      const mk = (name, floor, cat, marg, desc, extra) => Object.assign({
        name, type: "Skill", floor, boost: desc, supply: 0,
        clone: { name, categories: [cat], effects: [], fixedMarginal: marg, has: false, isDisabled: false },
      }, extra || {});

      // ── L1: skills not taken yet ──
      const l1 = [];
      for (const b of skills) {
        if (b.has || gated(b)) continue;
        const clone = byName[b.name];
        if (!clone) continue;
        const marg = roadmapItemValue(clone, catBoostsW, settings);
        if (!(marg > 0)) continue;                       // harmful/zero skills are not a BUY action
        const pts = b.skillPoints || 1;
        l1.push({ b, pts, marg, perPoint: marg / pts, cat: (b.categories || [])[0] || "crops" });
      }
      /*
       * A point you already HOLD does not make the skill free.
       *
       * Two earlier versions got this wrong in opposite directions — first "does it fit entirely in
       * the free points?" (so one spare point went to the best 1pt skill instead of discounting the
       * best skill), then partial coverage. Both still zeroed or discounted the cost, and that is
       * the actual error: it is the same mistake as calling an NFT free because you happen to hold
       * enough FLOWER. The buy path prices an NFT at its floor whatever your balance is, and a skill
       * point is no different — it cost XP to earn, and that XP has a FLOWER price.
       *
       * Zeroing it also broke the ordering it was meant to help: cost 0 makes payback 0, so eight
       * +0.03/day skills sorted above every real purchase on the reference farm. So the cost is
       * always points x sflPerPoint, and "you can take this right now" travels as a FLAG instead —
       * which is information the reader wants without it distorting the ROI.
       */
      l1.sort((x, y) => y.perPoint - x.perPoint);
      let ptsLeft = freePts;
      for (const r of l1) {
        // Which skills the points you hold would actually cover, in best-per-point order. Reported,
        // never subtracted.
        const canTakeNow = ptsLeft >= r.pts;
        if (canTakeNow) ptsLeft -= r.pts;
        out.push(mk(r.b.name, r.pts * sflPerPoint, r.cat, r.marg,
          `${r.pts}pt · ${r.b.skillTree || "?"} · ${r.pts} × ${sflPerPoint.toFixed(0)} FLOWER XP${canTakeNow ? " · body už máš, můžeš hned" : ""}`,
          { skillFree: false, skillTakeNow: canTakeNow, skillPoints: r.pts, skillTree: r.b.skillTree || null }));
      }

      // ── L2 / L3: the next rank of a skill already owned ──
      const shardSfl = roadmapShardSfl();
      /*
       * EVERY remaining rank, not just the next one.
       *
       * This offered only `nextLevel`, on the grounds that ranks are sequential — the same reasoning
       * that once limited the ascension ladder to one row, and wrong for the same reason: sequence is
       * a constraint on the PLAN, not a reason to hide the ladder. Level 2 and Level 3 are one chain
       * per skill, so the planner can never place L3 before L2 and the display cannot show it that
       * way either, while you still get to see what the whole upgrade is worth.
       */
      for (const [name, sr] of Object.entries(skillRanks || {})) {
        if (!sr || !sr.nextLevel) continue;              // not owned, or already maxed
        let cseq = 0;
        for (const row of (sr.rows || [])) {
          if (row.lvl < sr.nextLevel) continue;          // already at or past this rank
          if (!(row.delta > 0)) continue;                // a rank that adds nothing is not a buy
          const cat = Object.keys(row.byCat || {})[0] || "crops";
          const shards = row.shards || 0;
          const floor = (row.points || 0) * sflPerPoint + shards * shardSfl;
          if (!(floor > 0)) continue;
          out.push(mk(`${name} \u2192 Level ${row.lvl}`, floor, cat, row.delta,
            `${row.points}pt + ${shards} Ascension Shard \u00b7 ${row.text || ""}`,
            { skillRank: row.lvl, skillPoints: row.points, shards, shardSfl,
              chainId: `rank:${name}`, chainSeq: cseq++,
              // The assumption travels with the row so a consumer cannot show the number without it.
              shardNote: `shard oce\u0148ov\u00e1n materi\u00e1lem Gold Pickaxe (\u2248${shardSfl.toFixed(2)} FLOWER) \u2014 odvozen\u00ed, ne tr\u017en\u00ed cena` }));
        }
      }
      return out;
    }

    /*
     * ASCENSION EXPANSIONS AND UPGRADES IN THE BUY PATH.
     *
     * They have exactly the shape the rest of the path has: a cost in materials, and an income,
     * because every expansion hands you profit nodes. Leaving them out meant the page could tell
     * you to buy a gold node while an expansion three steps away would have handed you four of
     * them cheaper — which is the comparison the ascension page makes in isolation and nothing
     * else could see.
     *
     * Costs follow the section's own valuation rule, not the marketplace: anything you can BUY is
     * worth its purchase price, and obsidian and oil (which you cannot) are worth what producing
     * them costs. That rule and the numbers behind it come from nodeAcq.prodCost, so this cannot
     * disagree with the ascension page about what an expansion costs.
     *
     * Income is what the nodes it GRANTS earn, taken from nodeAcq.perType — the same per-node
     * figures the NODES page renders. Steps are strictly ORDERED (you cannot do A2 before A1), so
     * they are offered as a prefix of the plan rather than as free-floating options, and each row
     * says which step it is.
     */
    function roadmapAscensionCandidates(settings) {
      const out = [];
      const asc = roadmapState && roadmapState.ascension;
      if (!asc || !Array.isArray(asc.steps) || !asc.nodeAcq) return out;
      const prodCost = asc.nodeAcq.prodCost || {};
      const perType = asc.nodeAcq.perType || {};
      const p2pPrices = roadmapPrices(settings);
      const coinsFree = roadmapCoinsFree(settings);
      const cps = (powerState.exchangeRates && powerState.exchangeRates.coinsPerSFL) || 0;
      // Same rule as the ascension section: produce-only resources at production cost, everything
      // else at its purchase price. A resource we cannot price at all makes the cost a FLOOR, and
      // a floor must not be allowed to win a comparison, so the step is skipped rather than shown
      // cheap.
      const priceRes = (res) => {
        let sfl = 0, unpriced = false;
        for (const [item, qty] of Object.entries(res || {})) {
          if (!qty) continue;
          if (item === "Coins") { if (!coinsFree && cps > 0) sfl += qty / cps; continue; }
          const unit = prodCost[item] > 0 ? prodCost[item] : (p2pPrices[item] || 0);
          if (!(unit > 0)) { unpriced = true; continue; }
          sfl += unit * qty;
        }
        return { sfl, unpriced };
      };
      /*
       * Every step up to ASC_MAX, not just the next one.
       *
       * It used to emit exactly one row, because ascension steps are strictly SEQUENTIAL and the
       * first version let the payback sort order all 82 of them — producing an order you cannot
       * follow (A2 Expansion 32 above A1 Expansion 31). The fix for that is a constraint in the
       * PLANNER, not a shorter list: greedyOrder below may only take the earliest unplaced step, so
       * the whole ladder can be shown while staying buildable.
       *
       * Each row is its own INCREMENT (not cumulative), so the table's running total stays honest.
       * Steps that grant no earning node — island upgrades, decoration-only expansions — cannot be
       * rows of their own, so their cost is rolled into the next earning step and they are named in
       * its text: reaching that expansion means paying for them too.
       */
      const ASC_MAX = settings.ascMax != null ? settings.ascMax : 3;
      let pending = 0; const via = []; let seq = 0;
      for (const st of asc.steps) {
        if (st.asc > ASC_MAX) break;
        const priced = priceRes(Object.assign({}, st.cost, st.extraCost));
        if (priced.unpriced) break;   // cannot price the ladder past here — a floor must not compete
        pending += priced.sfl;
        let marg = 0; const gained = [];
        for (const [node, n] of Object.entries(st.nodesAdded || {})) {
          const d = perType[node];
          if (!d || !n) continue;
          marg += (d.profitPerDay || 0) * n;
          gained.push(`${n}x ${node}`);
        }
        const label = st.asc === 0
          ? (st.kind === "upgrade" ? `Upgrade na ${st.next || "?"}` : `${st.island || "?"} Expansion ${st.expansion}`)
          : (st.kind === "upgrade" ? `Ascension A${st.asc}` : `A${st.asc} · Expansion ${st.expansion}`);
        if (!(marg > 0)) { via.push(label); continue; }   // no income of its own: roll its cost on
        if (!(pending > 0)) { via.length = 0; pending = 0; continue; }
        out.push({
          name: label, type: "Ascension", floor: pending, supply: 0,
          boost: `${gained.join(" + ")}${via.length ? ` · přes ${via.join(", ")}` : ""}${st.absLevel ? ` · level ${st.absLevel}` : ""}`,
          clone: { name: label, categories: ["crops"], effects: [], fixedMarginal: marg, has: false, isDisabled: false },
          /*
           * chainId/chainSeq are the generic sequencing hook: within a chain, step N cannot be
           * taken before N-1. Ascension steps are one chain; each rankable skill is another
           * (Level 2 before Level 3). The planner and the display both honour it.
           */
          chainId: "ascension", chainSeq: seq,
          ascStep: { seq: seq++, asc: st.asc, expansion: st.expansion, kind: st.kind, via: via.slice(), nodesAdded: st.nodesAdded || {} },
        });
        via.length = 0; pending = 0;
      }
      return out;
    }

    /*
     * "Co koupit, abych s tímhle vůbec mohl začít."
     *
     * The buy path answers "what next", which is only useful for things you already do. A category
     * you do NOT run — greenhouse, chickens, crop machine, pets — never surfaces there, because a
     * boost for it is worth nothing until the category itself is above water, so every such item
     * sinks to the bottom as CONDITIONAL and the question "how do I start?" is never answered.
     *
     * This answers it directly: for each category that is idle or loss-making, find the cheapest set
     * of unowned boosts that flips it POSITIVE, by adding them in best-value-per-FLOWER order and
     * recomputing the category net after each one — the same synergy-aware recompute the buy path
     * uses, so a set that claims to flip the category really does.
     *
     * Two honest outcomes besides a plan: a category can be structurally impossible to price (no
     * capacity at all, e.g. no Greenhouse built — the app cannot buy you a building), and a category
     * can be unflippable with anything on the market. Both are reported as such rather than omitted,
     * because "nothing will fix this" is an answer and an empty row is not.
     */
    /*
     * Net per day for ONE category, whichever kind it is.
     *
     * roadmapCatNet does not handle PLOT categories — crops, fruits and greenhouse go through
     * roadmapPerPlot instead, which is exactly why roadmapItemSituational carries a separate branch
     * for them. Calling roadmapCatNet for everything silently valued all three at zero, so a
     * greenhouse losing 1.73 FLOWER a day looked idle rather than loss-making.
     *
     * For a plot category the product matters, so every product it can grow is tried and the best
     * net wins — the startup question is "what is the best this could do", not "what is it set to".
     */
    const PLOT_CATS = { crops: 1, fruits: 1, greenhouse: 1 };
    function roadmapAnyCatNet(cat, effects, settings) {
      if (!PLOT_CATS[cat]) return roadmapCatNet(cat, effects, settings);
      const l = roadmapCatProductNets(cat, effects, settings);
      return l.length ? l[0].net : 0;
    }
    /*
     * Every product the category can grow, best first — not just the winner.
     *
     * "Should I run the greenhouse" is really "which of Grape / Olive / Rice pays, and by how
     * much"; one aggregate number hides that Olive nets -0.44 where Grape nets -1.73, which is the
     * difference between a near miss and a dead end. So the whole list travels and the caller can
     * show it.
     */
    function roadmapCatProductNets(cat, effects, settings) {
      if (!PLOT_CATS[cat]) return [];
      const table = cat === "crops" ? CROP_GROW_DATA : (cat === "fruits" ? FRUIT_GROW_DATA : GREENHOUSE_GROW_DATA);
      const out = [];
      for (const prod of Object.keys(table)) {
        if ((settings.excludeCats || []).indexOf(prod) >= 0) continue;
        const a = roadmapPerPlot(cat, prod, effects, settings);
        if (!a) continue;
        const plots = Math.min(a.plots, a.maxPlots);
        out.push({ product: prod, net: (a.gpp - a.cpp) * plots, perPlot: a.gpp - a.cpp, plots,
          gross: a.gpp * plots, cost: a.cpp * plots });
      }
      out.sort((x, y) => y.net - x.net);
      return out;
    }
    /** The product that best net came from, for the row to name what you would grow. */
    function roadmapBestCatProduct(cat, effects, settings) {
      const l = roadmapCatProductNets(cat, effects, settings);
      return l.length ? l[0].product : null;
    }

    /*
     * How many animals the buildings could hold, for the counterfactual "if I actually ran this".
     *
     * Formula from the game: buyAnimal.ts getBaseAnimalCapacity = 10 + (level-1)*5, plus 5*level
     * again for a built Chicken Coop (hen house) or Barn Blueprint (barn).
     *
     * CAVEAT, measured and not resolved: on farm 155498 the barn reports level 3, which the formula
     * turns into capacity 20 — while the barn actually holds 35 sheep. So `barn.level` is not the
     * input the formula wants, or capacity is raised by something not modelled here. Rather than
     * ship a ceiling contradicted by the farm in front of it, the formula is treated as a LOWER
     * BOUND: the capacity used is never below what the building demonstrably holds already.
     *
     * The barn is SHARED between cows and sheep, which matters for exactly the question being
     * asked: a barn full of sheep has no room for a cow, and "buy these boosts" would be the wrong
     * answer when the real blocker is livestock.
     */
    function roadmapAnimalCapacity(cat) {
      const farm = powerState.farm || {};
      const built = (n) => (((farm.collectibles || {})[n] || []).length
        + ((((farm.home || {}).collectibles) || {})[n] || []).length) > 0;
      const base = (lvl) => 10 + (Math.max(1, Number(lvl) || 1) - 1) * 5;
      if (cat === "chickens") {
        const hh = farm.henHouse || {};
        const lvl = Math.max(1, Number(hh.level) || 1);
        const held = Object.keys(hh.animals || {}).length;
        return { total: Math.max(base(lvl) + (built("Chicken Coop") ? 5 * lvl : 0), held), held, free: 0, shared: null };
      }
      if (cat === "cows" || cat === "sheep") {
        const bn = farm.barn || {};
        const lvl = Math.max(1, Number(bn.level) || 1);
        const animals = Object.values(bn.animals || {});
        const held = animals.length;
        const mine = animals.filter((a) => (a.type || "").toLowerCase() === (cat === "cows" ? "cow" : "sheep")).length;
        const total = Math.max(base(lvl) + (built("Barn Blueprint") ? 5 * lvl : 0), held);
        // Free slots are what the OTHER species has left you.
        return { total, held, free: Math.max(0, total - held), mine, shared: "barn" };
      }
      return null;
    }

    function roadmapStartupPlans(userSettings, byName, catBoostsW) {
      /*
       * THEORETICAL, always — and this is the whole reason the first version answered nothing.
       *
       * Measured efficiency is "how much of the theoretical maximum did you actually harvest", and
       * for an activity you do not do it is 0 by construction. So every figure in a dead category
       * was multiplied by zero: the category net came out at exactly 0.000, every candidate boost
       * showed a gain of 0, nothing could ever flip anything, and the honest-looking verdict
       * "unflippable" was an artefact of the question being asked in the wrong basis.
       *
       * The question here is counterfactual — "IF I started doing this, would it pay?" — so it has
       * to be asked at full efficiency. effOverrides is dropped too: a manual slider parked at 0 for
       * a category you ignore would defeat the same purpose in the same way.
       */
      const settings = Object.assign({}, userSettings, { effMode: "theoretical", effOverrides: null });
      /*
       * Effects must be read from the CLONES, not from powerState.
       *
       * roadmapOwnedEffects filters powerState.boostItems, and this planner toggles `has` on the
       * clones in catBoostsW — so every "what if I owned this" probe changed nothing the net could
       * see, every gain came out as 0, and every category was declared unflippable. The catalogue
       * had 21 unowned greenhouse boosts available the whole time. Same pattern
       * roadmapItemSituational uses, plus the shrine effects roadmapOwnedEffects also folds in.
       */
      const effectsFor = (cat) => (catBoostsW[cat] || [])
        .filter((b) => b.has && !b.isDisabled)
        .flatMap((b) => b.effects.filter((e) => e.cat === cat))
        .concat(activeShrineEffects(powerState.farm, cat));
      const out = [];
      const { capacity } = powerState;
      const maxP = (settings.maxPrice && settings.maxPrice > 0) ? settings.maxPrice : Infinity;
      const TROLL = 500000;
      for (const [cat, def] of Object.entries(POWER_CATEGORIES)) {
        if (!def || !def.quantifiable) continue;
        if ((settings.excludeCats || []).indexOf(cat) >= 0) continue;
        const owned = effectsFor(cat);
        let nowNet = 0;
        try { nowNet = roadmapAnyCatNet(cat, owned, settings); } catch (e) { continue; }
        if (nowNet > 0.0001) continue;                 // already earning — the buy path covers it

        // No capacity at all is a different problem: you need the building or the animals first,
        // and no marketplace item substitutes for that.
        let count = 0;
        try { count = getCapacityCount(cat, capacity) || 0; } catch (e) { count = 0; }
        /*
         * "Počty dle maxu, ne dle reality" — the owner is right that the counterfactual needs it:
         * with 0 chickens every figure is 0 whatever you buy, so the honest answer is what a FULL
         * hen house would earn. The capacity is swapped for the building maximum while planning and
         * restored afterwards, so nothing else on the page sees it.
         */
        const animalCap = roadmapAnimalCapacity(cat);
        let atMax = count, capRestore = null, roomBlocked = false;
        if (animalCap) {
          atMax = animalCap.shared === "barn" ? (animalCap.mine || 0) + animalCap.free : animalCap.total;
          // A barn already full of the other species is the real blocker, and boosts cannot fix it.
          roomBlocked = atMax <= 0;
          if (atMax > count) { capRestore = capacity[cat]; capacity[cat] = atMax; }
        }

        // Candidates: unowned, priced, boost-bearing items that touch this category.
        const cands = [];
        for (const c of (catBoostsW[cat] || [])) {
          if (c.has || c.isDisabled) continue;
          if (!(c.floor > 0) || c.floor > TROLL || c.floor > maxP) continue;
          cands.push(c);
        }

        const picked = []; let net = nowNet; let cost = 0;
        const restore = [];
        if (atMax > 0) {
          for (let guard = 0; guard < 40 && net <= 0 && cands.length; guard++) {
            // Value each remaining candidate by what it adds to THIS category right now, then take
            // the best per FLOWER. Recomputed every round, so stacking effects are not double-counted.
            let bi = -1, bestRatio = 0, bestGain = 0;
            for (let i = 0; i < cands.length; i++) {
              const c = cands[i];
              c.has = true;
              let after = net;
              try { after = roadmapAnyCatNet(cat, effectsFor(cat), settings); } catch (e) {}
              c.has = false;
              const gain = after - net;
              if (!(gain > 0)) continue;
              const ratio = gain / c.floor;
              if (ratio > bestRatio) { bi = i; bestRatio = ratio; bestGain = gain; }
            }
            if (bi < 0) break;                          // nothing left that helps
            const c = cands.splice(bi, 1)[0];
            c.has = true; restore.push(c);
            const netBefore = net;
            const step = { name: c.name, floor: c.floor, gain: bestGain, boost: c.boost || "",
              netBefore, type: c.type || null };
            picked.push(step);
            cost += c.floor;
            try { net = roadmapAnyCatNet(cat, effectsFor(cat), settings); } catch (e) {}
            /*
             * The running net after this purchase, so a consumer can show WHERE the category stops
             * losing money instead of only the endpoints. "-0.31/day becomes +0.31/day for 192
             * FLOWER" hides which single item crosses zero, which is the one you would buy first if
             * you only bought one.
             */
            step.netAfter = net;
            step.cumCost = cost;
            step.crosses = step.netBefore <= 0 && net > 0;
          }
        }
        for (const c of restore) c.has = false;         // never leak state into the buy path
        if (capRestore != null) capacity[cat] = capRestore;   // and never leak the inflated capacity

        /*
         * "Cannot be flipped" and "cannot be PRICED" are different answers and looked identical.
         * Flowers are the case: the category produces ~8 units a day and no flower has a price in
         * the p2p feed at all, so its FLOWER figure is structurally 0 and no boost can ever move it.
         * Reporting that as unflippable blames the farm for a gap in the price data.
         */
        const summary = ((powerState.categories || {}).catSummaries || {})[cat] || null;
        let produces = 0, grosses = 0;
        try {
          const ab = applyBoosts(cat, getDefaultProduct(cat), capacity, owned);
          produces = (ab && ab.unitsPerDay) || 0;
          grosses = unitToSfl(produces, getPriceProduct(cat, getDefaultProduct(cat)), roadmapPrices(settings)) || 0;
        } catch (e) {}
        const unpriced = produces > 0 && !(grosses > 0);

        out.push({
          cat, label: def.label || cat, count, nowNet, unpriced, unitsPerDay: produces,
          // What the figures assume you would run, and where that ceiling comes from.
          atMax, capacity: animalCap, roomBlocked,
          // Which product the figures assume, when the category has a choice.
          // Every product, best first, both as it stands now and after the plan's purchases.
          productsBefore: (() => { try { return roadmapCatProductNets(cat, owned, settings); } catch (e) { return []; } })(),
          picked, cost, net,
          // Why it is not actionable, when it is not.
          blocked: unpriced ? "unpriced" : roomBlocked ? "no-room" : (atMax <= 0 ? "capacity" : (net <= 0 ? "unflippable" : null)),
          flips: net > 0 && picked.length > 0,
        });
      }
      // Cheapest route to a working category first — that is the one worth starting.
      out.sort((a, b) => {
        if (a.flips !== b.flips) return a.flips ? -1 : 1;
        if (a.flips) return a.cost - b.cost;
        return (a.blocked === "capacity" ? 1 : 0) - (b.blocked === "capacity" ? 1 : 0);
      });
      return out;
    }

    // ── flowers.html 17378-17431: roadmapNodeCandidates ──
    /*
     * NODE_PRICES is keyed by farm key and LABELLED for display ("Stone", "Gold"), but
     * farmActivity uses the game's node names ("Stone Rock Bought", "Gold Rock Bought"). Reading
     * the label straight would have found nothing and read every count as 0, i.e. quietly quoted
     * every node at its first-purchase price. Verified against farm 155498's farmActivity keys.
     */
    const NODE_ACTIVITY_NAME = {
      trees: "Tree", stones: "Stone Rock", iron: "Iron Rock", gold: "Gold Rock",
      crimstones: "Crimstone Rock", oilReserves: "Oil Reserve", lavaPits: "Lava Pit",
      crops: "Crop Plot", fruitPatches: "Fruit Patch", flowers: "Flower Bed",
    };
    function roadmapNodeCandidates(settings) {
      const out = [];
      const { capacity, exchangeRates, farm } = powerState;
      const p2pPrices = roadmapPrices(settings);
      const obsidianP = p2pPrices["Obsidian"] || 0;
      if (!(obsidianP > 0)) return out;               // can't price Obsidian → skip node actions
      /*
       * Node income comes from nodeAcq, which the ascension section serves and the NODES page
       * renders. Without it there are NO node rows — deliberately. Falling back to a locally
       * derived margin is what made this page disagree with the other two by up to 3.3x, and a
       * silent wrong number is worse than a visibly missing one.
       */
      const ascNodeAcq = (roadmapState && roadmapState.ascension && roadmapState.ascension.nodeAcq) || null;
      if (!ascNodeAcq || !ascNodeAcq.perType) return out;
      const sunstoneP = obsidianP * 3;                 // 1 Sunstone = 3 Obsidian
      const coinsFree = roadmapCoinsFree(settings);
      const er = coinsFree ? Object.assign({}, exchangeRates, { coinsPerSFL: Infinity }) : exchangeRates;
      const coinSfl = (coins) => coinsFree ? 0 : (er.coinsPerSFL > 0 ? coins / er.coinsPerSFL : 0);
      // islandType and BASE_NODE_COUNTS were only here to guess the purchase count; farmActivity
      // carries it, so neither is needed.
      const mkItem = (name, cost, cat, marg, desc) => ({ name, type: "Node", floor: cost, boost: desc, supply: 0,
        clone: { name, categories: [cat], effects: [], fixedMarginal: marg, has: false, isDisabled: false } });
      const MERGEKEY_CAT = { trees: "trees", stones: "stone", iron: "iron", gold: "gold" };
      const cyclesFor = (cat) => { const oeff = roadmapOwnedEffects(cat); const ab = applyBoosts(cat, getDefaultProduct(cat), capacity, oeff); return ab.effectiveCycle > 0 ? 86400 / ab.effectiveCycle : 0; };

      /*
       * A. Obsidian merges. The GAIN comes from nodeAcq.merge, not from a local
       * cycles x price x eff product.
       *
       * Measured on farm 155498, the two bases disagreed by 0.19x to 3.33x per node type (Tree
       * 0.43/day here against 2.29 there, Crimstone 1.13 against 0.34), so the buy path was ranking
       * node actions on numbers the NODES page and the ascension plan both contradicted. nodeAcq is
       * the source those two already share, and it derives the figure from the power engine's own
       * category totals instead of re-deriving it.
       */
      const acqMerge = {};
      for (const m of (ascNodeAcq.merge || [])) acqMerge[m.mergeKey] = m;
      for (const [mk, mc] of Object.entries(MERGE_COSTS)) {
        const cat = MERGEKEY_CAT[mk]; const fk = RES_FARMKEY[cat]; if (!cat || !fk) continue;
        const tiers = countNodeTiers(farm[fk] || {});
        const am = acqMerge[mk];
        if (!am) continue;
        const label = (typeof NODE_PRICES !== "undefined" && NODE_PRICES[mk] && NODE_PRICES[mk].label) || cat;
        const nT2 = Math.floor((tiers.t1 || 0) / 4);
        const costT2 = mc.t2.obsidian * obsidianP + coinSfl(mc.t2.coins);
        const gainT2 = (am.merges.find((x) => x.tier === 2) || {}).gainPerDay || 0;
        if (gainT2 > 0) for (let i = 0; i < Math.min(nT2, 20); i++) out.push(mkItem("Merge " + label + " \u2192 tier 2", costT2, cat, gainT2, "4\u00d7 t1 \u2192 t2 \u00b7 +0.5/cycle \u00b7 " + mc.t2.obsidian + " Obsidian" + (coinsFree ? "" : " + " + (mc.t2.coins / 1000) + "k coins")));
        const nT3 = Math.floor((tiers.t2 || 0) / 4);
        const costT3 = mc.t3.obsidian * obsidianP + coinSfl(mc.t3.coins);
        const gainT3 = (am.merges.find((x) => x.tier === 3) || {}).gainPerDay || 0;
        if (gainT3 > 0) for (let i = 0; i < Math.min(nT3, 10); i++) out.push(mkItem("Merge " + label + " \u2192 tier 3", costT3, cat, gainT3, "4\u00d7 t2 \u2192 t3 \u00b7 +0.5/cycle \u00b7 " + mc.t3.obsidian + " Obsidian" + (coinsFree ? "" : " + " + (mc.t3.coins / 1000) + "k coins")));
      }

      // B. Buy new nodes with Sunstone (next 3 per resource; escalating cost).
      if (typeof NODE_PRICES !== "undefined") for (const [nk, np] of Object.entries(NODE_PRICES)) {
        const cat = np.catId; const fk = RES_FARMKEY[cat]; if (!fk) continue; // mineable/tree nodes only
        /*
         * Escalation reads the game's own purchase counter, not a guess.
         *
         * This used `tiers.effective - BASE_NODE_COUNTS[island]`, which asks "how many more do I
         * have than a fresh island of this type starts with" and calls the answer "bought". That
         * counts nodes an EXPANSION granted as purchases, and it depends on a hand-maintained
         * base table. getResourcePrice reads farmActivity["<Node> Bought"], so that is what the
         * price escalates on — the same input nodeAcq uses, so the buy path and the NODES page
         * cannot price the same node differently.
         *
         * On farm 155498 the two rules happen to agree for all ten node types (bought ==
         * effective - base there), so this fixes no visible number today; it diverges as soon as
         * expansions hand out nodes at a rate the base table does not predict.
         */
        const purchased = Math.floor(Number((farm.farmActivity || {})[`${NODE_ACTIVITY_NAME[nk] || np.label} Bought`]) || 0);
        // Same source as the merges above and as the NODES page: what ONE node of this category
        // actually nets per day, already carrying the measured efficiency.
        const acqNode = ascNodeAcq.perType[NODE_ACTIVITY_NAME[nk] || np.label];
        const marg = acqNode ? (acqNode.profitPerDay || 0) : 0;
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
      /*
       * Skills and ascension ranks, folded in on the same terms. A skill whose point you
       * ALREADY HAVE has floor 0, so the `> 0` guard the nodes use would drop exactly the rows
       * that matter most — free income belongs at the front of the order, not off it.
       */
      const skillCands = roadmapSkillCandidates(settings, byName, catBoostsW);
      for (const sc of skillCands) { if (sc.floor <= maxP) econ.push(sc); }
      // Ascension expansions and upgrades, on the same terms.
      for (const ac of roadmapAscensionCandidates(settings)) { if (ac.floor <= maxP) econ.push(ac); }
      /*
       * SCENARIOS — activities the farm does not run yet, switched on by the user.
       *
       * These rows do not exist in the buy path by construction: a boost on a dead category is
       * worth nothing until the category is above water, so it never becomes a candidate and the
       * question "what do I buy to START this" can never be answered by filtering what is already
       * here. That is why the toggle has to change what goes INTO the simulation.
       *
       * Once folded in they are ordinary rows: same ranking, same cumulative FLOWER/day — which
       * starts lower, because you pay before the activity earns, and climbs as the enabling
       * purchases land. That progression IS the answer.
       */
      const scen = settings.scenarios || [];
      if (scen.length) {
        for (const plan of roadmapStartupPlans(settings, byName, catBoostsW)) {
          if (!scen.includes(plan.cat) && !scen.includes(plan.product)) continue;
          for (const x of (plan.picked || [])) {
            const clone = byName[x.name];
            if (!clone || clone.has || x.floor > maxP) continue;
            econ.push({ name: x.name, type: "Scenario", floor: x.floor, supply: 0,
              boost: `${plan.label}: ${x.boost || ""}`.trim(), clone,
              scenarioCat: plan.cat });
          }
        }
      }
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
        /*
         * CHAINS are strictly sequential: you cannot do A2 before A1, and you cannot take a skill's
         * Level 3 before its Level 2. So within each chain only the earliest unplaced step is ever
         * eligible. Without this the payback sort interleaves them freely and the plan reads as an
         * order you cannot follow. Everything outside a chain is unconstrained.
         */
        const nextInChain = {};
        const eligible = (m) => !m.chainId || (nextInChain[m.chainId] || 0) === m.chainSeq;
        while (rem.length && g++ < 5000) {
          let bi = -1;
          for (let i = 0; i < rem.length; i++) {
            if (!eligible(rem[i])) continue;
            if (bi < 0 || rem[i]._roi < rem[bi]._roi) bi = i;
          }
          if (bi < 0) break;   // only ineligible items left
          const nx = rem.splice(bi, 1)[0];
          if (nx.chainId) nextInChain[nx.chainId] = (nextInChain[nx.chainId] || 0) + 1;
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
            // A swap inside a chain (two ascension steps, or a skill's L2 and L3) produces a plan the
            // game will not let you build, whatever it does to the integral.
            if (order[i].chainId && order[i].chainId === order[i + 1].chainId) continue;
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
          timeline.push({ name: s.m.name, type: s.m.type, boost: s.m.boost, floor: s.m.floor, marginal: bm, roi: bm > 0 ? s.m.floor / bm : Infinity, atDay: rd, rateAfter: ri, kind: "econ", skillFree: s.m.skillFree, skillPoints: s.m.skillPoints, skillTakeNow: s.m.skillTakeNow, skillRank: s.m.skillRank, shards: s.m.shards, shardSfl: s.m.shardSfl, shardNote: s.m.shardNote, skillTree: s.m.skillTree, skillTier: s.m.skillTier, chainId: s.m.chainId, chainSeq: s.m.chainSeq, scenarioCat: s.m.scenarioCat }); } }
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
      for (const s of fin.steps) { const bm = Math.max(0, s.m.marginal || 0); ranked.push({ name: s.m.name, type: s.m.type, boost: s.m.boost, floor: s.m.floor, value: bm, roi: bm > 0 ? s.m.floor / bm : Infinity, status: "plan", skillFree: s.m.skillFree, skillPoints: s.m.skillPoints, skillTakeNow: s.m.skillTakeNow, skillRank: s.m.skillRank, shards: s.m.shards, shardSfl: s.m.shardSfl, shardNote: s.m.shardNote, skillTree: s.m.skillTree, skillTier: s.m.skillTier, chainId: s.m.chainId, chainSeq: s.m.chainSeq, scenarioCat: s.m.scenarioCat }); }
      for (const m of situational) ranked.push({ name: m.name, type: m.type, boost: m.boost, floor: m.floor, value: m.sitValue, roi: m.sitValue > 0 ? m.floor / m.sitValue : Infinity, status: "conditional", reason: m.sitReason });
      ranked.sort((a, b) => a.roi - b.roi);
      /*
       * The table is ranked by PAYBACK, and a chain has to stay in ladder order inside it — you
       * cannot take a skill's Level 3 before its Level 2, or A2 before A1.
       *
       * The first attempt kept the SLOTS the payback sort gave each chain and refilled them in ladder
       * order. That was wrong in a way only the rendered table showed: the chain's first step lands in
       * the BEST slot any of its members earned, the second step in the second best, and so on — so
       * the early ladder is hoisted to the top regardless of its own payback. On a real farm that put
       * "A1 Expansion 36" (2.0 YEARS) at row 5 of 163 and "A1 Expansion 38" (7.6 years) at row 7,
       * above everything worth buying. The sort said one thing and the table showed another.
       *
       * A chain is one decision, so it gets ONE position: the whole chain is placed as a contiguous
       * block at the payback its FIRST step earns, because that first step is the only one you can
       * actually act on next. The rows inside the block keep ladder order and their own paybacks,
       * which vary — that is honest, and it is what a sequence looks like.
       */
      const chains = {};
      for (const r of ranked) if (r.chainId) (chains[r.chainId] = chains[r.chainId] || []).push(r);
      if (Object.keys(chains).length) {
        /*
         * A chain row is placed by its PREFIX payback: what it costs to get there including every
         * step you must do first, over what you earn once you have them all.
         *
         * Anchoring the whole chain on its first step was the previous attempt and it was still
         * wrong — the ascension ladder's first step pays back in 61 days, so all 31 rows sat above
         * every NFT, including the ones that pay back in 30 years. A sequence is not one decision.
         *
         * The prefix figure is the honest one: "A1 Expansion 38" is not a 7.6-year purchase, it is
         * the far end of a run you must buy through, and that run's cumulative payback is what
         * decides whether it belongs above or below the next NFT. Taking a running MAX also makes
         * the value non-decreasing along the chain, which is what keeps the ladder in order once
         * everything is sorted together — order is a property of the sort key, not a patch after it.
         *
         * Each row still DISPLAYS its own cost, gain and payback. Only the position uses the prefix.
         */
        for (const rows of Object.values(chains)) {
          rows.sort((a, b) => a.chainSeq - b.chainSeq);
          let cost = 0, gain = 0, worst = 0;
          for (const r of rows) {
            cost += r.floor; gain += r.value;
            const prefix = gain > 0 ? cost / gain : Infinity;
            // Strictly increasing along the chain: a running max alone produces TIES, and ties fall
            // back on the payback order the array already had, which reordered 17 rows.
            worst = Math.max(worst, prefix);
            r.sortRoi = worst + r.chainSeq * 1e-9;
            r.prefixRoi = prefix;          // served so the page can explain the placement
            r.prefixCost = cost;
          }
        }
        for (const r of ranked) if (r.sortRoi == null) r.sortRoi = r.roi;
        // Stable by construction: equal keys keep the order the payback sort already gave them.
        ranked.sort((a, b) => a.sortRoi - b.sortRoi);
      }
      { let rc = 0, ri = (startIncome > 0 ? startIncome : 0), rd = 0;
        for (const r of ranked) { if (r.status !== "plan") continue; const dd = ri > 0 ? r.floor / ri : Infinity; if (isFinite(dd)) rd += dd; rc += r.floor; ri += r.value; r.cumCost = rc; r.rateAfter = ri; r.atDay = rd; } }
      return { timeline, ranked, coreCount, coreCost, coreRate, coreDays, econSteps, cosmeticCount: cosmetic.length, econCost, untradeable, tail, tailCost, noBoostCount, situational, startRate: startIncome, finalRate, totalDays: cumDays, totalCost, optGainPct, horizonYears: (settings.horizonYears || 100) };
    }


    // ── flowers.html 16144-16166: roadmapProductBreakdown + roadmapProductNet ──
    function roadmapProductBreakdown(cat, product, settings) {
      const { capacity, exchangeRates, stockMods } = powerState;
      const p2pPrices = roadmapPrices(settings);
      const er = roadmapCoinsFree(settings) ? Object.assign({}, exchangeRates, { coinsPerSFL: Infinity }) : exchangeRates;
      const ownedEff = roadmapOwnedEffects(cat);
      if (ROADMAP_MINING_CATS.indexOf(cat) >= 0) return roadmapCatBreakdown(cat, ownedEff, settings);
      let gross = 0, cost = 0;
      try {
        const ab = applyBoosts(cat, product, capacity, ownedEff);
        gross = unitToSfl(ab.unitsPerDay, getPriceProduct(cat, product), p2pPrices) || 0;
        if (cat === "crops" || cat === "fruits" || cat === "greenhouse" || cat === "flowers") {
          cost += (calcSeedCostPerDay(cat, product, capacity, er, stockMods, ownedEff, p2pPrices).costPerDay) || 0;
        }
        // Seed-restock cap: you can only plant restocksPerDay × Betty-restock seeds/day of a crop.
        if (cat === "crops") {
          const theoSeedsPerDay = getCapacityCount("crops", capacity) * (ab.effectiveCycle > 0 ? 86400 / ab.effectiveCycle : 0);
          const capSeeds = (settings.restocksPerDay || 2) * (cmGetSeedRestockCount(powerState.farm, product) || 0);
          if (theoSeedsPerDay > 0 && capSeeds < theoSeedsPerDay) { const sf = capSeeds / theoSeedsPerDay; gross *= sf; cost *= sf; }
        }
      } catch {}
      return { gross, cost, net: gross - cost };
    }
    function roadmapProductNet(cat, product, settings) { return roadmapProductBreakdown(cat, product, settings).net; }


    // ── flowers.html 16182-16206: roadmapSaltBreakdown ──
    function roadmapSaltBreakdown(settings) {
      const { farm, p2pPrices, exchangeRates } = powerState;
      const sf = farm && farm.saltFarm;
      if (!sf || !sf.nodes) return null;
      const nodes = Object.values(sf.nodes);
      if (nodes.length === 0) return null;
      const cyc = nodes.map(x => (x.salt && x.salt.nextChargeAt && x.salt.claimedAt) ? (x.salt.nextChargeAt - x.salt.claimedAt) : 0).filter(v => v > 0).sort((a, b) => a - b);
      let cycleMs = cyc.length ? cyc[Math.floor(cyc.length / 2)] : 6 * 3600000;
      cycleMs = Math.min(48 * 3600000, Math.max(3600000, cycleMs));
      const rakesPerDay = nodes.length * (86400000 / cycleMs);
      let yieldPerRake = 10, coinMult = 1;
      try { yieldPerRake = computeSaltYieldPerRake(farm); } catch {}
      try { coinMult = computeSaltRakeCoinMult(farm); } catch {}
      const gross = rakesPerDay * yieldPerRake * (p2pPrices["Salt"] || 0);
      const coinSFL = roadmapCoinsFree(settings) ? 0 : (exchangeRates.coinsPerSFL > 0 ? (SALT_RAKE_COST.coins * coinMult) / exchangeRates.coinsPerSFL : 0);
      let matSFL = 0;
      for (const [m, q] of Object.entries(SALT_RAKE_COST.materials)) matSFL += (p2pPrices[m] || 0) * q;
      const cost = rakesPerDay * (coinSFL + matSFL);
      return { gross, cost, net: gross - cost };
    }

export {
  roadmapProductBreakdown, roadmapSaltBreakdown, roadmapEffFactor,
  roadmapCoinsFree, roadmapInSeason, MINE_RES,
  roadmapPerPlot,   BASE_NODE_COUNTS, MERGE_COSTS, countNodeTiers, roadmapCurrentProduction,
  roadmapItemValue, roadmapItemSituational, roadmapSimulate, _setRoadmapState,
  // Exported for testing: the node actions the buy path folds in. Its escalation has to match
  // nodeAcq's, and a test that re-derives the rule instead of calling this proves nothing.
  roadmapNodeCandidates, roadmapSkillCandidates, roadmapAscensionCandidates, roadmapStartupPlans, roadmapBuildClones,
  ROADMAP_EFF_HKEY, roadmapComputeEfficiency,
  getRoadmapSettings, roadmapOwnedEffects, roadmapCatBreakdown, roadmapCatNet,
  roadmapMiningChain, roadmapCatMix, ROADMAP_MINING_CATS, calcBoostValue, cmGetSeedRestockCount,
};
