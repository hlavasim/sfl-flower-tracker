import { test, afterEach } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { buildPowerSection } from "../../core/sections/power.mjs";
import { buildRoadmapSection } from "../../core/sections/roadmap.mjs";
import * as RM from "../../core/engine/roadmap.mjs";
import {
  applyBoosts, miningToolsPerDay, detectStockModifiers, BUMPKIN_XP_TABLE, getDefaultProduct,
} from "../../core/engine/power-helpers.mjs";
import { calcSicknessCost } from "../../core/engine/power-costs.mjs";

/*
 * Regression pins for the POWER / ROADMAP findings of the 2026-09-22 review (B2, C1–C13, the
 * LOW row and the crop-machine duplicate). Every test here failed on e33a90b; each says which
 * finding it pins and what the game (or the engine's own rule) requires.
 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const wrap = JSON.parse(readFileSync(path.join(ROOT, "tests/fixtures/farm-155498.json"), "utf8"));
const FARM = wrap.farm || wrap;
const p2p = JSON.parse(readFileSync(path.join(ROOT, "tests/fixtures/p2p-prices.json"), "utf8"));
const nfts = JSON.parse(readFileSync(path.join(ROOT, "tests/fixtures/nfts-sample.json"), "utf8"));
const clone = (o) => JSON.parse(JSON.stringify(o));
const quiet = (fn) => { const l = console.log; console.log = () => {}; try { return fn(); } finally { console.log = l; } };
const power = (farm, nftData, settings = {}) => quiet(() => buildPowerSection(farm, p2p, nftData || nfts, null, settings));
const placed = (farm, name) => { farm.collectibles[name] = [{ id: name, coordinates: { x: 1, y: 1 }, readyAt: 0, createdAt: 0 }]; };
const ownedEff = (out, cat) => out.boostItems.filter((b) => b.has && !b.isDisabled).flatMap((b) => b.effects.filter((e) => e.cat === cat));

afterEach(() => RM._setRoadmapState(null));

test("B2: no usable history is theoretical (1.0) and flagged, not a silent 0.5", () => {
  const eff = RM.roadmapComputeEfficiency([]);
  assert.equal(eff.meanRatio, null, "nothing measured → no mean");
  assert.equal(eff.meta.measured, false, "and the meta says so");
  power(FARM);
  const r = buildRoadmapSection([], { roadmapSettings: {}, farm: FARM, p2p });
  assert.equal(r.effUnmeasured, true, "the roadmap payload flags the unmeasured efficiency");
  const rs = RM.getRoadmapSettings({});
  for (const cat of ["trees", "stone", "crops", "bees", "fishing"]) {
    assert.equal(RM.roadmapEffFactor(cat, rs), 1, `${cat}: unmeasured must read 100%, not a default`);
  }
  // Current income equals the theoretical-mode income when nothing was measured.
  const theo = RM.roadmapCurrentProduction(RM.getRoadmapSettings({ effMode: "theoretical" })).total;
  assert.ok(Math.abs(r.currentProd.total - (theo + ((r.currentProd.breakdown.find((b) => b.cat === "pets") || {}).sfl || 0))) < 1e-9,
    `income ${r.currentProd.total} must equal the theoretical ${theo} (+ pets)`);
});

test("C1: mining tools follow the override's speed, so a speed boost's extra output is not free", () => {
  const out = power(FARM);
  const all = ownedEff(out, "iron");
  const without = out.boostItems.filter((b) => b.has && !b.isDisabled && b.name !== "Iron Hustle")
    .flatMap((b) => b.effects.filter((e) => e.cat === "iron"));
  assert.ok(all.length > without.length, "Iron Hustle is an owned iron speed skill on the fixture");
  const s = Object.assign({}, RM.getRoadmapSettings({}), { effMode: "theoretical", seasonBasis: "annual" });
  const withNet = RM.roadmapMiningChain(s, { iron: all }).byCat.iron.marketNet;
  const noNet = RM.roadmapMiningChain(s, { iron: without }).byCat.iron.marketNet;
  // A pure speed boost scales output AND tools by the same factor (yield per node is unchanged),
  // so the iron net must scale by exactly the tool ratio.
  const tw = miningToolsPerDay("iron", out.capacity, FARM, all), to = miningToolsPerDay("iron", out.capacity, FARM, without);
  assert.ok(tw > to, "the speed boost means more pickaxes a day");
  assert.ok(Math.abs(withNet / noNet - tw / to) < 1e-9, `net ratio ${withNet / noNet} must equal tool ratio ${tw / to}`);
});

test("C2/C10: a boost the feed already carries counts once (Giant Kale +2, not +4)", () => {
  const farm = clone(FARM); placed(farm, "Giant Kale");
  const feed = { collectibles: [...nfts.collectibles, { name: "Giant Kale", have_boost: 1, boost_text: "+2 Kale", floor: "10" }], wearables: nfts.wearables };
  const out = power(farm, feed);
  const kale = ownedEff(out, "crops").filter((e) => e.type === "yield_flat" && e.product === "Kale");
  assert.equal(kale.reduce((s, e) => s + e.value, 0), 2, `Kale flat bonus: ${JSON.stringify(kale)}`);
  // Scary Mike + Horror Mike: the game gives +0.3 in total (Horror replaces +0.2 with +0.3).
  const medium = out.boostItems.filter((b) => b.has && (b.name === "Horror Mike" || b.name === "Game boosts (API-missing)"))
    .flatMap((b) => b.effects.filter((e) => e.cropTier === "medium" && (b.name === "Horror Mike" || e.source === "Scary Mike")));
  assert.ok(Math.abs(medium.reduce((s, e) => s + e.value, 0) - 0.3) < 1e-9, `Scary+Horror Mike = +0.3: ${JSON.stringify(medium)}`);
});

test("C10: area skills do nothing without their collectible placed; Chonky is a TIME boost", () => {
  const farm = clone(FARM);
  delete farm.collectibles["Scary Mike"];
  if (farm.home && farm.home.collectibles) delete farm.home.collectibles["Scary Mike"];
  const out = power(farm);
  const hm = out.boostItems.find((b) => b.name === "Horror Mike");
  assert.equal(hm.has, true, "the skill is still taken");
  assert.deepEqual(hm.effects, [], "but without Scary Mike on the farm it boosts nothing");
  assert.equal(hm.requires, "Scary Mike");
  const ch = power(FARM).boostItems.find((b) => b.name === "Chonky Scarecrow");
  assert.ok(ch.effects.some((e) => e.type === "speed_pct" && e.cropTier === "basic"), "x0.7 instead of x0.8 = a basic-crop time boost");
  assert.ok(!ch.effects.some((e) => e.type === "yield_flat"), "not a yield boost");
});

test("C3: the wishlist's theoretical and measured columns are not swapped", () => {
  power(FARM, nfts, { roadmapSettings: {} });
  RM._setRoadmapState({ effByCat: { trees: { ratio: 0.3, measured: true } }, meanRatio: 0.3 });
  const out = power(FARM, nfts, { roadmapSettings: {}, effectiveFor: ["Test Unowned Statue"] });
  const theo = out.boostValuesTheo.trees["Test Unowned Statue"].synergy;
  const eff = out.boostValuesEff.trees["Test Unowned Statue"].synergy;
  assert.ok(theo > 0, "the statue is worth something");
  assert.ok(Math.abs(eff - theo * 0.3) < 1e-9, `measured ${eff} = theoretical ${theo} × 0.3`);
  RM._setRoadmapState(null);
  const plain = power(FARM, nfts, { roadmapSettings: {} }).boostValues.trees["Test Unowned Statue"].synergy;
  assert.ok(Math.abs(theo - plain) < 1e-9, "theoretical column = the unscaled Power value");
});

test("C4: items the game disables do not count on the roadmap either (Woody under Foreman)", () => {
  // The real feed's texts (the sample feed carries neither beaver).
  const feed = { wearables: nfts.wearables, collectibles: [...nfts.collectibles,
    { name: "Woody the Beaver", have_boost: 1, boost_text: "+20% Wood\nDisabled if Apprentice Beaver or Foreman Beaver Active", floor: "384" },
    { name: "Apprentice Beaver", have_boost: 1, boost_text: "+20% Wood\n-50% Tree Recovery Time\nDisabled if Foreman Beaver Active", floor: "1256" }] };
  const trees = (farm) => {
    const out = power(farm, feed);
    for (const n of ["Woody the Beaver", "Apprentice Beaver"]) {
      const b = out.boostItems.find((x) => x.name === n);
      if (b.has) assert.equal(b.isDisabled, true, `${n} is switched off by the placed Foreman Beaver`);
    }
    return RM.roadmapCatNet("trees", RM.roadmapOwnedEffects("trees"), RM.getRoadmapSettings({ effMode: "theoretical" }));
  };
  const base = trees(FARM);
  const farm = clone(FARM);
  for (const n of ["Woody the Beaver", "Apprentice Beaver"]) { placed(farm, n); farm.inventory[n] = "1"; }
  assert.ok(Math.abs(trees(farm) - base) < 1e-9, "Foreman Beaver is placed, so both beavers add nothing");
});

test("C5: a seasonal crop's boost is valued over the year (Kale grows 2 seasons of 4)", () => {
  power(FARM);
  const s = Object.assign({}, RM.getRoadmapSettings({}), { effMode: "theoretical", effOverrides: {} });
  const eff = [{ type: "yield_flat", value: 2, cat: "crops", product: "Kale" }];
  const own = RM.roadmapOwnedEffects("crops");
  const pp = (e) => { const r = RM.roadmapPerPlot("crops", "Kale", e, s); return (r.gpp - r.cpp) * Math.min(r.plots, r.maxPlots); };
  const inSeason = pp(own.concat(eff)) - pp(own);
  const item = { name: "Kale Probe", effects: eff, categories: ["crops"], floor: 10, has: false };
  const out = power(FARM);
  const v = RM.calcBoostValue(item, "crops", "Kale", out.capacity, out.p2pPrices, out.boostItems.filter((b) => b.categories.includes("crops")), false);
  assert.ok(inSeason > 0);
  assert.ok(Math.abs(v.synergy - inSeason * 0.5) < 1e-9, `annual ${v.synergy} must be half the in-season ${inSeason}`);
});

test("C6: a skill point costs the NEXT level's XP, not the average level", () => {
  const out = power(FARM);
  const sci = out.skillCostInfo;
  assert.equal(sci.level, 186);
  const next = BUMPKIN_XP_TABLE[186] - BUMPKIN_XP_TABLE[185];
  assert.equal(sci.nextLevelXp, next);
  assert.ok(Math.abs(sci.sflPerPoint - next / sci.bestRecipe.ratio) < 1e-9, `${sci.sflPerPoint} FLOWER/point`);
  assert.ok(sci.sflPerPoint > 3 * sci.sflPerLevel, "the next level is far dearer than the average one");
});

test("C7: seasonal sickness protection counts only in its season", () => {
  const cap = { animalDetails: { sheep: Array.from({ length: 10 }, () => ({ level: 12 })) } };
  const nurse = [{ type: "sickness_prevention", value: 1, cat: "sheep", season: "summer" }];
  const none = calcSicknessCost("sheep", cap, p2p, [], {}, [], "annual").costPerDay;
  assert.ok(none > 0);
  assert.equal(calcSicknessCost("sheep", cap, p2p, [], {}, nurse, "summer").costPerDay, 0, "in summer: no sickness");
  assert.ok(Math.abs(calcSicknessCost("sheep", cap, p2p, [], {}, nurse, "autumn").costPerDay - none) < 1e-12, "in autumn: no help");
  assert.ok(Math.abs(calcSicknessCost("sheep", cap, p2p, [], {}, nurse, "annual").costPerDay - none * 0.75) < 1e-12, "over the year: a quarter");
});

test("C8: Obsidian and Oil are not income (the game does not let them be traded)", () => {
  power(FARM);
  const s = RM.getRoadmapSettings({ effMode: "theoretical" });
  const obs = RM.roadmapCatBreakdown("obsidian", RM.roadmapOwnedEffects("obsidian"), s);
  assert.equal(obs.gross, 0, "obsidian grosses nothing");
  assert.ok(obs.cost > 0, "the lava fuel is still a cost");
  const oil = RM.roadmapMiningChain(s).byCat.oil;
  assert.equal(oil.gross, 0, "oil grosses nothing");
  const cp = RM.roadmapCurrentProduction(s).breakdown.map((b) => b.cat);
  assert.ok(!cp.includes("obsidian") && !cp.includes("oil"), `current income lists neither: ${cp}`);
});

test("C9: only placed collectibles and equipped wearables are active; ownership kept apart", () => {
  const out = power(FARM);
  const armor = out.boostItems.find((b) => b.name === "Crimstone Armor");
  if (armor) {   // in the real feed; the sample feed may lack it
    assert.equal(armor.has, false); assert.equal(armor.owned, true);
  }
  const farm = clone(FARM);
  farm.wardrobe["Crimstone Spikes Hair"] = 1;           // owned, not worn
  delete farm.collectibles.Quarry; if (farm.home && farm.home.collectibles) delete farm.home.collectibles.Quarry;
  for (const fl of ["ground", "level_one"]) if (farm.interior && farm.interior[fl] && farm.interior[fl].collectibles) delete farm.interior[fl].collectibles.Quarry;
  farm.inventory.Quarry = "1";                           // owned, not placed
  const sm = detectStockModifiers(farm);
  assert.equal(sm.hasCrimstoneSpikesHair, false, "an unequipped hair does not make pickaxes free");
  assert.equal(sm.hasQuarry, false, "an unplaced Quarry does not make stone free");
  const withArmor = clone(FARM);
  withArmor.bumpkin.equipped.suit = "Crimstone Armor";
  const feed = { collectibles: nfts.collectibles, wearables: [...nfts.wearables, { name: "Crimstone Armor", have_boost: 1, boost_text: "+0.1 Crimstones", floor: "5" }] };
  const idle = power(FARM, feed).boostItems.find((b) => b.name === "Crimstone Armor");
  const worn = power(withArmor, feed).boostItems.find((b) => b.name === "Crimstone Armor");
  assert.deepEqual([idle.has, idle.owned], [false, true], "in the wardrobe: owned, inactive");
  assert.deepEqual([worn.has, worn.owned], [true, true], "equipped: active");
});

test("C11: a coin discount is worth nothing when coins are treated as free", () => {
  const free = power(FARM, nfts, { roadmapSettings: {} });          // 284k coins → auto coins-free
  const paid = power(FARM, nfts, { roadmapSettings: { coinsFree: false } });
  assert.equal(free.boostValues.iron["Frugal Miner"].synergy, 0);
  assert.ok(paid.boostValues.iron["Frugal Miner"].synergy > 0, "priced when coins cost FLOWER");
});

test("C12: free skill points = the game's level − points spent, served once", () => {
  const out = power(FARM);
  const spent = out.boostItems.filter((b) => b.type === "Skill" && b.has).reduce((s, b) => s + b.skillPoints, 0);
  assert.equal(out.skillCostInfo.spentPoints, spent);
  assert.equal(out.skillCostInfo.freePoints, out.skillCostInfo.level - spent, "not level − 1 − spent");
});

test("C13: the formula panel explains the value the list shows", () => {
  const out = power(FARM, nfts, { formulaFor: "Test Unowned Statue", formulaCat: "trees" });
  const v = out.boostValues.trees["Test Unowned Statue"];
  assert.ok(v.synergy > 0 && v.roi > 0);
  assert.ok(out.formulaHtml.includes(v.synergy.toFixed(4)), "the listed FLOWER/day appears in the panel");
  assert.ok(out.formulaHtml.includes(`${v.roi.toFixed(0)} days`), "and so does the listed ROI");
  const rois = [...out.formulaHtml.matchAll(/= <span[^>]*>(\d+) days/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(rois)], [v.roi.toFixed(0)], `one ROI, the list's: ${rois}`);
});

test("LOW: oil counted once in the totals; fishing is flagged unvalued, not a real 0", () => {
  const out = power(FARM);
  const cs = out.categories.catSummaries;
  const sum = Object.values(cs).reduce((s, c) => s + c.costPerDay, 0);
  const ghOil = (cs.greenhouse.costDetails && cs.greenhouse.costDetails.oilCostPerDay) || 0;
  assert.ok(ghOil > 0 && cs.oil.costPerDay > 0, "the fixture drills oil and burns it in the greenhouse");
  assert.ok(Math.abs(out.categories.totalCostSfl - (sum - ghOil)) < 1e-9, "the greenhouse's oil is the drilling already counted");
  assert.equal(cs.fishing.unvalued, true);
  for (const v of Object.values(out.boostValues.fishing)) assert.equal(v.unvalued, true);
});

test("F: the page's RESTOCK QUEUE uses the server panel's crops-per-seed, not 1", async () => {
  const { CROP_GROW_DATA } = await import("../../core/engine/power-boosts.mjs");
  const { SEED_COSTS } = await import("../../core/data/economy.mjs");
  const SRC = readFileSync(path.join(ROOT, "flowers.html"), "utf8");
  // Slice a declaration out of the page by bracket matching (the page's real code, not a copy).
  const slice = (head) => {
    const i = SRC.indexOf(head); assert.ok(i >= 0, head);
    const open = SRC.indexOf(head.startsWith("function") ? "{" : (SRC[SRC.indexOf("=", i) + 2]), SRC.indexOf(head.startsWith("function") ? ")" : "=", i));
    const pairs = { "{": "}", "[": "]" }, o = SRC[open], c = pairs[o];
    let d = 0;
    for (let k = open; k < SRC.length; k++) { if (SRC[k] === o) d++; else if (SRC[k] === c && --d === 0) return SRC.slice(i, k + 1) + ";"; }
    return null;
  };
  const code = ["function findCollectible(", "const CROP_MACHINE_BASIC", "const CROP_MACHINE_MODULE_I ", "const CROP_MACHINE_MODULE_II ", "const CROP_MACHINE_MODULE_III",
    "const BETTY_RESTOCK_AMOUNT", "function farmHasWarehouse(", "function cmGetSeedRestockCount(", "function cropMachineCrops(",
    "function cropMachinePlots(", "function cropMachineSpeedMult(", "function cropMachineOilPerHour(", "function cmSimulateQueue("].map(slice).join("\n");
  const cmSimulateQueue = new Function("CROP_GROW_DATA", "SEED_COSTS", code + "\nreturn cmSimulateQueue;")(CROP_GROW_DATA, SEED_COSTS);
  const out = power(FARM);
  const yields = {}; for (const r of out.cropMachine.rows) yields[r.crop] = r.yieldPerSeed;
  const sim = cmSimulateQueue(FARM, out.p2pPrices, out.exchangeRates, false, 86400, yields);
  assert.ok(sim.queue.length > 0, "something is worth queueing");
  for (const q of sim.queue) {
    assert.notEqual(yields[q.crop], 1, "the fixture's machine yield is not 1 (Acre Farm etc.), so the test can tell");
    assert.ok(Math.abs(q.revenue / q.seedsUsed - out.p2pPrices[q.crop] * yields[q.crop]) < 1e-9,
      `${q.crop}: revenue per seed = price × the server's ${yields[q.crop]} crops/seed`);
  }
});

test("F: the crop machine panel applies machine-reaching yield boosts only (no plot AOE)", () => {
  const farm = clone(FARM); placed(farm, "Sir Goldensnout");
  const out = power(farm);
  const sun = out.cropMachine.rows.find((r) => r.crop === "Sunflower");
  const plot = applyBoosts("crops", "Sunflower", out.capacity, ownedEff(out, "crops"), farm);
  assert.ok(Math.abs((1 * plot.yieldMult + plot.yieldFlat) - sun.yieldPerSeed - 0.5) < 1e-3,
    "a plot gets Sir Goldensnout's +0.5, a machine pack does not (harvest.ts needs a plot)");
  assert.ok(!sun.active.concat(sun.available).some((e) => e.name === "Sir Goldensnout"), "and it is not listed as a machine boost");
});
