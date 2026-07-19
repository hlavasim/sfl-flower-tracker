// section=roadmap — the ROADMAP page's computed layer: measured efficiency (from
// posted farm-history snapshots, like section=eff), current production, and the full
// buy-path simulation (greedy + local-search reinvestment ordering). POST-only.
// Requires the power context to be set first (api/compute.mjs calls buildPowerSection
// before this). Non-finite roi/atDay values are nulled for JSON; the client maps them
// back to Infinity. Clone object references are stripped from the list fields — the
// page renders plain fields only.
import {
  getRoadmapSettings, roadmapComputeEfficiency, _setRoadmapState,
  roadmapCurrentProduction, roadmapSimulate,
  roadmapMiningChain, roadmapCatBreakdown, roadmapProductBreakdown, roadmapSaltBreakdown,
  roadmapEffFactor, roadmapOwnedEffects, roadmapCoinsFree, roadmapInSeason, MINE_RES,
  cmGetSeedRestockCount, _getPowerContext,
} from "../engine/roadmap.mjs";
import { getCapacityCount, POWER_CATEGORIES } from "../engine/power-helpers.mjs";
import { getAnimalCatSfl, calcAnimalFeedCost, calcSicknessCost } from "../engine/power-costs.mjs";
import { CROP_GROW_DATA, FRUIT_GROW_DATA, GREENHOUSE_GROW_DATA } from "../engine/power-boosts.mjs";
import { farmHasCropMachine, cropMachineCrops, calcCropMachineDaily } from "../engine/crop-machine.mjs";
import { roadmapPerPlot } from "../engine/roadmap.mjs";
import {
  DEFAULT_FLOWER_POINTS, BUMPKIN_GIFTS_DATA, getFlowerGiftPoints, getFlowerChainHours,
  dashCalculateDeliveryTickets, roadmapItemCost, roadmapGiftRewardValue, _setItemCostMaps,
} from "../engine/gifts-deliveries.mjs";
import { buildPricesSection } from "./prices.mjs";

const _nf = (v) => (typeof v === "number" && !isFinite(v) ? null : v);
const _strip = (m) => ({ name: m.name, type: m.type, floor: m.floor, boost: m.boost, supply: m.supply });

export function buildRoadmapSection(snapshots, settings = {}) {
  const eff = roadmapComputeEfficiency(snapshots || []);
  // Same shape renderRoadmap builds client-side from section=eff.
  const meanRatio = typeof eff.meanRatio === "number" ? eff.meanRatio : 0.5;
  _setRoadmapState({ effByCat: eff.effByCat || {}, effMeta: eff.meta, meanRatio });

  const rs = getRoadmapSettings(settings.roadmapSettings || {});
  const currentProd = roadmapCurrentProduction(rs);
  const startIncome = (rs.startIncome != null) ? rs.startIncome : currentProd.total;
  const sim = roadmapSimulate(rs, startIncome);

  // JSON-safe: strip clone refs, null non-finite numbers.
  sim.untradeable = (sim.untradeable || []).map(_strip);
  sim.tail = (sim.tail || []).map(_strip);
  sim.situational = (sim.situational || []).map((m) => ({ ..._strip(m), sitValue: m.sitValue, sitReason: m.sitReason }));
  for (const t of (sim.timeline || [])) { t.roi = _nf(t.roi); t.atDay = _nf(t.atDay); }
  for (const r of (sim.ranked || [])) { r.roi = _nf(r.roi); r.atDay = _nf(r.atDay); }
  sim.totalDays = _nf(sim.totalDays);
  sim.coreDays = _nf(sim.coreDays);

  // ── profitability: roadmapProfitabilityHtml's calc loops (page ~16696-16776) ported
  // verbatim minus the HTML assembly — groups of plain rows; mining rows carry the chain
  // row for the client's expand detail. detail strings are plain text (no markup).
  const profitability = buildProfitability(rs);

  // ── todo: roadmapTodoBranches ported verbatim (page 17287-17347) minus
  // roadmapFlowIcon (DOM) — actions carry iconName, the client wraps them in <img>.
  // roadmapItemCost's PRICES() client cache becomes the same maps built server-side
  // (buildPricesSection priced with the exchangeRates profile) via _setItemCostMaps.
  // roadmapItemCost precedence needs the section=prices maps priced with the
  // exchangeRates profile — built from the RAW p2p (before the Oil injection), exactly
  // what the client cache held. farm/p2p arrive via settings from the handler.
  if (settings.farm && settings.p2p) {
    const _er = _getPowerContext().exchangeRates || {};
    _setItemCostMaps(buildPricesSection(settings.farm, settings.p2p, { ..._er }));
  } else {
    _setItemCostMaps({ productionCost: {}, marketValue: {} });
  }
  const todo = buildTodo(rs);

  return { eff, currentProd, startIncome, sim, profitability, todo };
}

function _fmtFlower(v) {
  if (!isFinite(v)) return "∞";
  if (v >= 1e6) return (v / 1e6).toFixed(2) + "M";
  if (v >= 1e4) return Math.round(v).toLocaleString();
  if (v >= 100) return v.toFixed(0);
  if (v >= 1) return v.toFixed(2);
  return v.toFixed(3);
}

function buildTodo(settings) {
  const powerState = _getPowerContext();
  const cap = powerState.capacity, p2p = powerState.p2pPrices, er = powerState.exchangeRates, farm = powerState.farm;
  const branches = [];
  // FARM — best in-season crops to plant
  if (getCapacityCount("crops", cap) > 0) {
    const oeff = roadmapOwnedEffects("crops"), plots = getCapacityCount("crops", cap), cr = [];
    for (const c of Object.keys(CROP_GROW_DATA)) { if (!roadmapInSeason(c)) continue; const pp = roadmapPerPlot("crops", c, oeff, settings); if (pp) cr.push({ c, net: (pp.gpp - pp.cpp) }); }
    cr.sort((a, b) => b.net - a.net);
    const acts = cr.slice(0, 3).map(r => ({ label: "Plant " + r.c, sub: "+" + _fmtFlower(r.net * plots) + "/day", good: r.net > 0, iconName: r.c }));
    if (acts.length) branches.push({ label: "FARM", iconName: "Kale", actions: acts });
  }
  // MINE — resources worth actively harvesting
  const mine = [];
  for (const [catx, prod] of [["trees", "Wood"], ["stone", "Stone"], ["iron", "Iron"], ["gold", "Gold"], ["crimstone", "Crimstone"]]) {
    if (getCapacityCount(catx, cap) <= 0) continue;
    const bd = roadmapCatBreakdown(catx, roadmapOwnedEffects(catx), settings);
    const net = (bd ? bd.net : 0) * roadmapEffFactor(catx, settings);
    if (net > 0.001) mine.push({ label: "Mine " + prod, sub: "+" + _fmtFlower(net) + "/day", good: true, iconName: prod, net });
  }
  mine.sort((a, b) => b.net - a.net);
  if (mine.length) branches.push({ label: "MINE", iconName: "Pickaxe", actions: mine.slice(0, 4) });
  // ANIMALS — feed or skip
  const ani = [];
  for (const [catA, typ, drop] of [["chickens", "Chicken", "Egg"], ["cows", "Cow", "Milk"], ["sheep", "Sheep", "Wool"]]) {
    const animals = (cap.animalDetails && cap.animalDetails[catA]) || []; if (!animals.length) continue;
    const oeff = roadmapOwnedEffects(catA);
    const produce = (getAnimalCatSfl(catA, cap, oeff, p2p).totalSfl) || 0;
    let feed = 0; try { feed = (calcAnimalFeedCost(catA, cap, p2p, oeff, powerState.stockMods).costPerDay) || 0; } catch {}
    const net = produce - feed;
    ani.push({ label: (net > 0 ? "Feed " : "Skip ") + typ + "s", sub: (net > 0 ? "+" : "") + _fmtFlower(net) + "/day", good: net > 0, iconName: drop });
  }
  if (ani.length) branches.push({ label: "ANIMALS", iconName: "Egg", actions: ani });
  // GIFTS — top NPCs to gift flowers
  const hasBB = !!(farm.bumpkin && farm.bumpkin.skills && farm.bumpkin.skills["Blossom Bonding"]);
  const gl = Object.keys(DEFAULT_FLOWER_POINTS), gr = [];
  for (const [npc, data] of Object.entries(BUMPKIN_GIFTS_DATA)) {
    if (!data.repeats) continue;
    let best = null;
    for (const f of gl) { const p = getFlowerGiftPoints(npc, f, hasBB); let hrs = 0; try { hrs = getFlowerChainHours(f); } catch {} const days = Math.max(1, (hrs || 24) / 24); const eff = p / days; if (!best || eff > best.eff) best = { f, p, days, eff }; }
    const rv = roadmapGiftRewardValue(data.repeats, () => 0), pd = (rv > 0 && best.eff > 0) ? rv * best.eff / data.repeats.fp : 0;
    if (pd > 0.05) gr.push({ npc, bf: best.f, days: best.days, pd });
  }
  gr.sort((a, b) => b.pd - a.pd);
  if (gr.length) branches.push({ label: "GIFTS", iconName: "Red Pansy", actions: gr.slice(0, 4).map(g => ({ label: "Gift " + g.bf + " → " + g.npc, sub: "+" + _fmtFlower(g.pd) + "/day · " + g.days.toFixed(0) + "d grow", good: true, iconName: g.bf })) });
  // DELIVER — best pending deliveries
  const now = Date.now();
  const estItem = (n) => roadmapItemCost(n);
  const cFree = roadmapCoinsFree(settings), dr = [];
  for (const o of ((farm.delivery && farm.delivery.orders) || [])) {
    if (o.completedAt) continue;
    let cost = 0; for (const [it, q] of Object.entries(o.items || {})) cost += (it === "coins") ? (cFree ? 0 : (er.coinsPerSFL > 0 ? q / er.coinsPerSFL : 0)) : estItem(it) * q;
    const give = Object.entries(o.items || {}).map(([it, q]) => it === "coins" ? (q.toLocaleString() + " coins") : (q + "× " + it)).join(", ");
    const r = o.reward || {}; let rv = (r.sfl || 0) + ((r.coins || 0) > 0 && er.coinsPerSFL > 0 ? r.coins / er.coinsPerSFL : 0);
    let tk = 0; try { tk = dashCalculateDeliveryTickets(o.from, farm, now) || 0; } catch {}
    rv += tk * (typeof settings.ticketValueSfl === "number" ? settings.ticketValueSfl : 1);
    dr.push({ from: o.from, give, cost, rewardVal: rv, tickets: tk, net: rv - cost });
  }
  dr.sort((a, b) => b.net - a.net);
  if (dr.length) branches.push({ label: "DELIVER", iconName: "Pancakes", actions: dr.slice(0, 4).map(d => ({ label: "Deliver → " + d.from, sub: "give " + (d.give || "?") + " · get " + _fmtFlower(d.rewardVal) + (d.tickets ? (" (" + d.tickets + "tk)") : "") + (d.cost > 0.001 ? (" · cost " + _fmtFlower(d.cost)) : "") + " · net " + (d.net >= 0 ? "+" : "−") + _fmtFlower(Math.abs(d.net)), good: d.net > 0 })) });
  return branches;
}


function _fmtFl(v) { return (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2)); }

function buildProfitability(settings) {
  const powerState = _getPowerContext();
  const cf = roadmapCoinsFree(settings);
  const _excl = (c) => (settings.excludeCats || []).indexOf(c) >= 0;
  const coins = Math.round(parseFloat(powerState.farm && powerState.farm.coins) || 0);
  const er = cf ? Object.assign({}, powerState.exchangeRates, { coinsPerSFL: Infinity }) : powerState.exchangeRates;
  const cap = powerState.capacity;
  const groups = [];
  const mk = (id, title) => { const g = { id, title, rows: [] }; groups.push(g); return g; };
  const gMine = mk("mine", "MINING & TREES"); gMine.keepOrder = true;
  const gAni = mk("animals", "ANIMALS");
  const gCrop = mk("crops", "CROPS");
  const gGh = mk("greenhouse", "GREENHOUSE");
  const gFruit = mk("fruits", "FRUITS");
  const gCm = mk("cropMachine", "CROP MACHINE");
  const gOther = mk("other", "OTHER");
  const addBd = (g, label, icon, bd, sub) => { if (bd && isFinite(bd.net)) g.rows.push({ label, icon, gross: bd.gross || 0, cost: bd.cost || 0, net: bd.net, sub }); };
  const sBd = (bd, f) => bd ? { gross: (bd.gross || 0) * f, cost: (bd.cost || 0) * f, net: (bd.net || 0) * f } : bd;

  const _miCh = roadmapMiningChain(settings);
  for (const cat of ["trees", "stone", "iron", "gold", "crimstone", "oil"]) {
    if (getCapacityCount(cat, cap) <= 0 || _excl(cat)) continue;
    const r = _miCh.byCat[cat]; if (!r) continue;
    const f = roadmapEffFactor(cat, settings);
    gMine.rows.push({ label: MINE_RES[cat], icon: MINE_RES[cat], cat, gross: r.gross * f, cost: (r.gross - r.dailyProfit) * f, net: r.dailyProfit * f, soloNet: r.soloNet * f, verdict: r.verdict, isPeak: r.isPeak, feeds: r.feeds, eff: f, chain: r });
  }
  for (const [cat, icon] of [["obsidian", "Obsidian"]]) {
    if (getCapacityCount(cat, cap) <= 0 || _excl(cat)) continue;
    addBd(gOther, (POWER_CATEGORIES[cat] ? POWER_CATEGORIES[cat].label : cat), icon, sBd(roadmapCatBreakdown(cat, roadmapOwnedEffects(cat), settings), roadmapEffFactor(cat, settings)), "1/wk");
  }
  for (const [cat, icon] of [["chickens", "Egg"], ["cows", "Milk"], ["sheep", "Wool"]]) {
    if (getCapacityCount(cat, cap) <= 0 || _excl(cat)) continue;
    const n = (cap.animalDetails && cap.animalDetails[cat]) ? cap.animalDetails[cat].length : 0;
    const oeff = roadmapOwnedEffects(cat);
    const f = roadmapEffFactor(cat, settings);
    const bd = sBd(roadmapCatBreakdown(cat, oeff, settings), f);
    let detail = "";
    try {
      const ani = getAnimalCatSfl(cat, cap, oeff, powerState.p2pPrices);
      const feed = calcAnimalFeedCost(cat, cap, powerState.p2pPrices, oeff, powerState.stockMods);
      const skl = (powerState.farm.bumpkin && powerState.farm.bumpkin.skills) || {};
      const sick = calcSicknessCost(cat, cap, powerState.p2pPrices, powerState.boostItems, skl);
      const parts = (ani.breakdown || []).filter(b => b.sfl > 0.0001).map(b => `${b.product} +${_fmtFl(b.sfl * f)}`);
      if ((feed.costPerDay || 0) > 0.0001) parts.push(`feed −${_fmtFl(feed.costPerDay * f)}`);
      if ((sick.costPerDay || 0) > 0.0001) parts.push(`sick −${_fmtFl(sick.costPerDay * f)}`);
      detail = parts.join(" · ");
    } catch {}
    if (bd && isFinite(bd.net)) gAni.rows.push({ label: POWER_CATEGORIES[cat].label, icon, gross: bd.gross || 0, cost: bd.cost || 0, net: bd.net, sub: n ? n + "×" : "", detail });
  }
  const rpd = settings.restocksPerDay || 2;
  if (getCapacityCount("crops", cap) > 0) for (const crop of Object.keys(CROP_GROW_DATA)) { if (_excl(crop)) continue;
    const bd = roadmapProductBreakdown("crops", crop, settings);
    if (bd && isFinite(bd.net)) gCrop.rows.push({ label: crop, icon: crop, gross: bd.gross || 0, cost: bd.cost || 0, net: bd.net, fade: !roadmapInSeason(crop) });
  }
  if (getCapacityCount("greenhouse", cap) > 0) for (const gp of Object.keys(GREENHOUSE_GROW_DATA)) { if (_excl(gp)) continue; addBd(gGh, gp, gp, sBd(roadmapProductBreakdown("greenhouse", gp, settings), roadmapEffFactor("greenhouse", settings))); }
  if (farmHasCropMachine(powerState.farm)) {
    for (const crop of cropMachineCrops(powerState.farm)) {
      if (_excl(crop)) continue;
      const r = calcCropMachineDaily(powerState.farm, crop, powerState.p2pPrices, er, false);
      if (!r) continue;
      let gross = r.revenue, cost = (r.oilCost || 0) + (r.seedCostPerDay || 0), net = r.net;
      const capSeeds = rpd * (cmGetSeedRestockCount(powerState.farm, crop) || 0);
      if (r.cropsPerDay > 0 && capSeeds < r.cropsPerDay) { const sf = capSeeds / r.cropsPerDay; gross *= sf; cost *= sf; net *= sf; }
      if (isFinite(net)) gCm.rows.push({ label: crop, icon: crop, gross, cost, net });
    }
  }
  if (getCapacityCount("fruits", cap) > 0) for (const fr of Object.keys(FRUIT_GROW_DATA)) { if (_excl(fr)) continue;
    const bd = sBd(roadmapProductBreakdown("fruits", fr, settings), roadmapEffFactor("fruits", settings));
    if (bd && isFinite(bd.net)) gFruit.rows.push({ label: fr, icon: fr, gross: bd.gross || 0, cost: bd.cost || 0, net: bd.net, fade: !roadmapInSeason(fr) });
  }
  for (const [cat, icon] of [["flowers", "Red Pansy"], ["bees", "Honey"], ["fishing", "Fish"]]) {
    if ((cat !== "fishing" && getCapacityCount(cat, cap) <= 0) || _excl(cat)) continue;
    addBd(gOther, POWER_CATEGORIES[cat].label, icon, sBd(roadmapCatBreakdown(cat, roadmapOwnedEffects(cat), settings), roadmapEffFactor(cat, settings)));
  }
  if (!_excl("salt")) addBd(gOther, "Salt Farm", "Salt", sBd(roadmapSaltBreakdown(settings), roadmapEffFactor("salt", settings)), "rake");

  return { groups, coinsFree: cf, coins, miningChain: { byCat: _miCh.byCat, mode: _miCh.mode, fee: _miCh.fee, peak: _miCh.peak } };
}

