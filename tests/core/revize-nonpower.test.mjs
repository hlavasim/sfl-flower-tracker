import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

/*
 * Revision 2026-09-22, non-power sections (findings D1–D12 + the section-F duplicates).
 * Every test here pins a GAME rule, with the game source it comes from, against the fixture farm
 * or a minimal variant of it — and each one failed on the code before the fix.
 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const wrap = JSON.parse(readFileSync(path.join(ROOT, "tests/fixtures/farm-155498.json"), "utf8"));
const farm = wrap.farm || wrap;
const p2pRaw = JSON.parse(readFileSync(path.join(ROOT, "tests/fixtures/p2p-prices.json"), "utf8"));
const p2p = {}; for (const [k, v] of Object.entries(p2pRaw)) p2p[k] = parseFloat(v) || 0;
const clone = (o) => JSON.parse(JSON.stringify(o));
const JULY_16 = Date.parse("2026-07-16T12:00:00Z");   // inside the fixture's faction week 2026-07-13

// ── The page's own inline script, evaluated for its declarations (same harness idea as
// fishing-render.test.mjs) so page-only code — the dashboard, the delivery pricer — is tested too.
const SRC = readFileSync(path.join(ROOT, "flowers.html"), "utf8");
const SCRIPT = SRC.slice(SRC.indexOf("<script>") + 8, SRC.lastIndexOf("</script>"));
function loadPage() {
  const stubEl = () => ({ innerHTML: "", textContent: "", style: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    appendChild() {}, addEventListener() {}, setAttribute() {}, removeAttribute() {}, querySelector: () => null,
    querySelectorAll: () => [], getContext: () => null, children: [], dataset: {} });
  const doc = { getElementById: () => stubEl(), querySelector: () => null, querySelectorAll: () => [], createElement: stubEl,
    addEventListener() {}, removeEventListener() {}, body: stubEl(), documentElement: stubEl(), head: stubEl(), readyState: "complete", cookie: "" };
  const store = {};
  const win = {
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    location: { href: "https://example.test/", search: "", hash: "", pathname: "/", origin: "https://example.test" },
    addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {} }),
    requestAnimationFrame: () => 0, setTimeout: () => 0, setInterval: () => 0, clearTimeout() {}, clearInterval() {},
    history: { replaceState() {}, pushState() {} }, navigator: { userAgent: "node", clipboard: { writeText: async () => {} } },
    fetch: async () => ({ ok: false, status: 503, json: async () => ({}) }), console,
  };
  win.window = win; win.document = doc;
  const run = new Function("window", "document", "localStorage", "sessionStorage", "fetch", "requestAnimationFrame", "setTimeout",
    "setInterval", "clearTimeout", "clearInterval", "location", "history", "navigator", "matchMedia",
    `${SCRIPT}
     return {
       dashParseCrops, dashParseFruits, dashP2PCost, cropMachineSpeedMult,
       seedPrices: (rates, data) => _pricesCache.set(_pricesKey(rates), data),
       setDashRates: (r) => { dashRates = r; },
     };`);
  return run(win, doc, win.localStorage, win.sessionStorage, win.fetch, win.requestAnimationFrame, win.setTimeout,
    win.setInterval, win.clearTimeout, win.clearInterval, win.location, win.history, win.navigator, win.matchMedia);
}
const page = loadPage();

// ── D1 ────────────────────────────────────────────────────────────────────────────────────────
test("D1 dashboard: grow times come from the canonical tables (Lemon 4 h, Rhubarb 10 min)", () => {
  const now = Date.now();
  // Lemon patch harvested 5 h ago: ready after 4 h (PATCH_FRUIT_SEEDS "Lemon Seed" plantSeconds
  // 4 h). The dashboard's own table said 24 h and showed it as not ready for 19 more hours.
  const fruits = page.dashParseFruits({ fruitPatches: { a: { fruit: { name: "Lemon", harvestedAt: now - 5 * 3600e3 } } } });
  assert.ok(fruits.some((a) => a.status === "ready"), `Lemon 5 h after harvest must be ready: ${JSON.stringify(fruits)}`);
  // Rhubarb (10 min) was missing from the dashboard table and fell back to 24 h.
  const crops = page.dashParseCrops({ crops: { a: { crop: { name: "Rhubarb", plantedAt: now - 11 * 60e3 } } } });
  assert.ok(crops.some((a) => a.status === "ready"), `Rhubarb 11 min after planting must be ready: ${JSON.stringify(crops)}`);
  // Blueberry 6 h (was 12 h): 7 h after harvest it is ready.
  const bb = page.dashParseFruits({ fruitPatches: { a: { fruit: { name: "Blueberry", harvestedAt: now - 7 * 3600e3 } } } });
  assert.ok(bb.some((a) => a.status === "ready"), "Blueberry 7 h after harvest must be ready");
});

// ── D2 ────────────────────────────────────────────────────────────────────────────────────────
test("D2 buds: type and stem ADD, then the aura multiplies the sum (getBudYieldBoosts.ts:161-167)", async () => {
  const { calcBudSflPerDay, decodeBud } = await import("../../core/engine/buds.mjs");
  const { detectFarmCapacity } = await import("../../core/engine/power-helpers.mjs");
  const cap = detectFarmCapacity(farm);
  const trees = (bud) => (calcBudSflPerDay(bud, cap, p2p, {}).breakdown.find((b) => b.catId === "trees") || { sflPerDay: 0 }).sflPerDay;
  const both = { type: "Woodlands", stem: "Tree Hat", aura: "No Aura" };        // 0.2 + 0.2
  const typeOnly = { type: "Woodlands", stem: "Hibiscus", aura: "No Aura" };    // 0.2
  assert.ok(trees(typeOnly) > 0);
  assert.ok(Math.abs(trees(both) / trees(typeOnly) - 2) < 1e-9, `Woodlands + Tree Hat is +0.4 wood, not +0.2 (${trees(both)} vs ${trees(typeOnly)})`);
  // Bud #220 is exactly that bud; and a Rare aura doubles the SUM.
  assert.deepEqual(decodeBud(220), { id: 220, type: "Woodlands", stem: "Tree Hat", aura: "No Aura" });
  assert.ok(Math.abs(trees({ ...both, aura: "Rare" }) / trees(both) - 2) < 1e-9, "aura x (type + stem)");
});

// ── D3 ────────────────────────────────────────────────────────────────────────────────────────
test("D3 pets: one energy number — the card's energy/feed equals the feeding table beside it", async () => {
  const { buildPetsSection } = await import("../../core/sections/pets.mjs");
  const s = buildPetsSection(farm, p2p, {});
  const burro = s.pets.find((p) => p.name === "Burro");
  // Lv 50 common pet, Walrus Onesie worn: per request (base + 10) + 5 → 35 + 115 + 315 = 465
  // (getPetEnergy, feedPet.ts:46-94). The card used to say 420 + 10 = 430.
  assert.equal(burro.calc.energyPerFeed, 465);
  assert.equal(burro.feeding.reduce((t, r) => t + r.energy, 0), burro.calc.energyPerFeed);
  for (const p of s.pets) assert.equal(p.calc.energyPerFeed, p.feeding.reduce((t, r) => t + r.energy, 0), `${p.name}: one number`);
});

test("D3 pets: an NFT pet's aura multiplies its feed energy", async () => {
  const { petDailyCalc } = await import("../../core/engine/pets.mjs");
  const mythic = petDailyCalc({ level: 80, isNft: true, aura: "Mythic Aura", petType: "Dragon" }, p2p, 1, false);
  const plain = petDailyCalc({ level: 80, isNft: true, aura: "No Aura", petType: "Dragon" }, p2p, 1, false);
  // Lv 80 NFT: easy+medium+hard+2nd medium = 520 base + 4 x 15 level bonus = 580, x3 Mythic = 1740.
  assert.equal(plain.energyPerFeed, 580);
  assert.equal(mythic.energyPerFeed, 1740);
});

test("D3 pets: fetch yield follows getFetchYield (fetchPet.ts:45-100)", async () => {
  const { petFetchYield, petDailyCalc } = await import("../../core/engine/pets.mjs");
  // 1. Fossil Shell gets NO level share; everything else does (Lv 100: +25%).
  assert.equal(petFetchYield("Fossil Shell", 100, false, {}), 1);
  assert.equal(petFetchYield("Ruffroot", 100, false, {}), 1.25);
  // 2. The Lv 18 +1 Acorn is per ACORN fetch, not a flat +1 Acorn a day.
  assert.equal(petFetchYield("Acorn", 20, false, {}), 1 + 0.1 + 1);
  // 3. The Lv 60 NFT +1 lands on the fetched resource only, and never on Acorn or Moonfur.
  assert.equal(petFetchYield("Ruffroot", 60, true, {}), 1 + 0.15 + 1);
  assert.equal(petFetchYield("Moonfur", 60, true, {}), 1 + 0.15);
  assert.equal(petFetchYield("Moonfur", 150, true, {}), 1 + 0.25 + 0.25, "and +25% Moonfur at NFT 150");
  // A pet that fetches Ruffroot gets no Acorn income from the Lv 18 perk.
  const prices = { Ruffroot: 1, Acorn: 0.1 };
  const c = petDailyCalc({ level: 20, isNft: false, petType: "Horse" }, prices, 1, false);
  assert.equal(c.bestRes.res, "Ruffroot");
  assert.equal(c.acornBonus, 0);
  assert.ok(Math.abs(c.dailySfl - c.fetchesPerDay * 1 * 1.1) < 1e-9, "dailySfl = fetches x price x (1 + 10%)");
});

// ── D4 ────────────────────────────────────────────────────────────────────────────────────────
test("D4 cooking: building oil shortens the cook, bonus food adds dishes (cook.ts:48-103, collectRecipe.ts:27-78)", async () => {
  const { buildCookingSection } = await import("../../core/sections/cooking.mjs");
  const p = buildCookingSection(farm, {}, { petSimulate: false });
  // Fire Pit holds 2.5 oil → oiled, x0.6 with Swift Sizzle. Bakery holds 0 → not oiled.
  const fp = p.boosts.timeBoosts.find((b) => b.name === "Building Oil" && b.buildings[0] === "Fire Pit");
  assert.equal(fp.multiplier, 0.6);
  assert.ok(!p.boosts.timeBoosts.some((b) => b.name === "Building Oil" && b.buildings[0] === "Bakery"), "a dry Bakery gets no oil boost");
  assert.equal(p.buildings["Fire Pit"].dishesPerCook, 2.3, "1 + Double Nom + 20% Fiery Jackpot + 10% Cleaver");
  // Draining the Fire Pit's oil takes the boost away — it is read from the farm, not assumed.
  const dry = clone(farm); dry.buildings["Fire Pit"][0].oil = 0;
  const pd = buildCookingSection(dry, {}, { petSimulate: false });
  assert.ok(Math.abs(pd.buildings["Fire Pit"].xpPerDay * (1 / 0.6) - p.buildings["Fire Pit"].xpPerDay) < 1e-3 * p.buildings["Fire Pit"].xpPerDay);
});

// ── D5 ────────────────────────────────────────────────────────────────────────────────────────
test("D5 composters: the verdict carries the farm's composter skills (startComposter.ts:31-107)", async () => {
  const { composterVerdict } = await import("../../core/engine/compost.mjs");
  const season = farm.season.season;
  // 10 + Efficient Bin 5 - Composting Overhaul 5 + Composting Revamp 5 + Turd Topper (worn) 1 = 16.
  const bin = composterVerdict("Compost Bin", farm, p2p, season, {});
  assert.equal(bin.outputs.find((o) => o.item === "Sprout Mix").qty, 16);
  // 10 + Premium Worms 10 - 5 + 5 + 1 = 21 Rapid Root.
  const prem = composterVerdict("Premium Composter", farm, p2p, season, {});
  assert.equal(prem.outputs.find((o) => o.item === "Rapid Root").qty, 21);
  // Swift Decomposer x0.9 time.
  assert.ok(Math.abs(bin.batchesPerDay - 24 / 5.4) < 1e-12);
  // With its own skills the Bin and the Premium pay on this farm (they read as losses before).
  assert.ok(bin.netPerDay > 0, `Compost Bin ${bin.netPerDay}`);
  assert.ok(prem.netPerDay > 0, `Premium Composter ${prem.netPerDay}`);
});

// ── D6 ────────────────────────────────────────────────────────────────────────────────────────
test("D6 pet streak: LAST week's streak, gated by qualifiesForBoost and the cooldown (factions.ts:582-611)", async () => {
  const { detectCookingBoosts } = await import("../../core/engine/cooking.mjs");
  const f = clone(farm);
  f.faction.history["2026-07-06"].collectivePet.streak = 4;   // last week
  f.faction.history["2026-07-13"].collectivePet.streak = 1;   // this week
  f.faction.pet.qualifiesForBoost = true;
  const on = detectCookingBoosts(f, { now: JULY_16 });
  const streak = on.xpBoosts.find((b) => b.petStreak);
  assert.ok(streak, "active: qualified, last week's streak 4");
  assert.equal(streak.multiplier, 1.2, "streak 4-5 → x1.2, read from LAST week");
  f.faction.pet.qualifiesForBoost = false;
  assert.ok(!detectCookingBoosts(f, { now: JULY_16 }).xpBoosts.some((b) => b.petStreak), "not qualified → no boost");
  f.faction.pet.qualifiesForBoost = true;
  f.faction.boostCooldownUntil = JULY_16 + 86400e3;
  assert.ok(!detectCookingBoosts(f, { now: JULY_16 }).xpBoosts.some((b) => b.petStreak), "faction-switch cooldown → no boost");
});

// ── D7 ────────────────────────────────────────────────────────────────────────────────────────
test("D7 XP boosts land on the dishes the game gives them to (expansion/lib/boosts.ts:295-430)", async () => {
  const { detectCookingBoosts, computeFoodXP } = await import("../../core/engine/cooking.mjs");
  const { COOKING_RECIPES_DATA } = await import("../../core/data/cooking.mjs");
  const xp = (f, name, opts = {}) => computeFoodXP(name, COOKING_RECIPES_DATA[name], COOKING_RECIPES_DATA[name].building, detectCookingBoosts(f, { now: JULY_16, ...opts }));
  const base = (name) => COOKING_RECIPES_DATA[name].xp;
  const general = 1.05 * 1.05 * 1.1 * 1.1;   // Munching Mastery, Observatory, Blossombeard, VIP
  // Skill Shrimpy + Fishy Feast (x1.44) reach a Kitchen fish dish, not only the Aging Shed.
  assert.ok(Math.abs(xp(farm, "Sushi Roll") - base("Sushi Roll") * general * 1.44) < 1e-6, "Sushi Roll x1.44");
  // Grain Grinder is cakes only: Cornbread (Bakery, not a cake) gets no x1.2, Carrot Cake does.
  assert.ok(Math.abs(xp(farm, "Cornbread") - base("Cornbread") * general) < 1e-6, "Cornbread: no Grain Grinder");
  assert.ok(Math.abs(xp(farm, "Carrot Cake") - base("Carrot Cake") * general * 1.2) < 1e-6, "Carrot Cake: Grain Grinder");
  // VIP from vip.expiresAt alone (no Lifetime Farmer Banner) — hasVipAccess, lib/vipAccess.ts.
  const noBanner = clone(farm); delete noBanner.inventory["Lifetime Farmer Banner"];
  assert.ok(detectCookingBoosts(noBanner, { now: JULY_16 }).xpBoosts.some((b) => b.name === "VIP Access"), "paid VIP counts");
  // Swiss Whiskers placed: +500 on a cheese recipe, before the pet multiplier.
  const swiss = clone(farm); swiss.collectibles["Swiss Whiskers"] = [{ coordinates: { x: 0, y: 0 } }];
  assert.ok(Math.abs(xp(swiss, "Pizza Margherita") - (base("Pizza Margherita") * general + 500)) < 1e-6, "Pizza +500");
  assert.ok(Math.abs(xp(swiss, "Carrot Cake") - xp(farm, "Carrot Cake")) < 1e-9, "no cheese, no +500");
  // Hungry Hare placed: x2 on Fermented Carrots only.
  const hare = clone(farm); hare.collectibles["Hungry Hare"] = [{ coordinates: { x: 0, y: 0 } }];
  assert.ok(Math.abs(xp(hare, "Fermented Carrots") / xp(farm, "Fermented Carrots") - 2) < 1e-9);
  // A placed Mythical Port bud: x(1 + 5 x 0.1) on fish consumables (getBudExperienceBoosts.ts).
  const port = clone(farm); port.buds = { 7: { type: "Port", stem: "3 Leaf Clover", aura: "Mythical", coordinates: { x: 1, y: 1 } } };
  assert.ok(Math.abs(xp(port, "Aged Tuna") / xp(farm, "Aged Tuna") - 1.5) < 1e-9, "Port bud on an aged fish");
  assert.ok(Math.abs(xp(port, "Carrot Cake") - xp(farm, "Carrot Cake")) < 1e-9, "and not on a cake");
});

// ── D8 ────────────────────────────────────────────────────────────────────────────────────────
test("D8 Camel pays only when PLACED — ascension and digging agree (treasureSold.ts:28-47)", async () => {
  const { buildAscensionSection } = await import("../../core/sections/ascension.mjs");
  const { diggingVerdict, treasureSellMultiplier } = await import("../../core/engine/digging.mjs");
  const unplaced = clone(farm);
  for (const m of [unplaced.collectibles, unplaced.home && unplaced.home.collectibles,
                   unplaced.interior && unplaced.interior.ground && unplaced.interior.ground.collectibles,
                   unplaced.interior && unplaced.interior.level_one && unplaced.interior.level_one.collectibles]) if (m) delete m.Camel;
  assert.ok(Number(unplaced.inventory.Camel) > 0, "the Camel is still owned");
  assert.equal(treasureSellMultiplier(unplaced), 1.2, "Treasure Map only");
  assert.equal(treasureSellMultiplier(farm), 1.5, "Map + placed Camel");
  const asc = buildAscensionSection(unplaced, {}, 0, {}, {});
  assert.equal(asc.current.treasureCoins.boost, 1.2);
  // Digging prices its finds with the same multiplier.
  const d0 = diggingVerdict(farm, p2p, { coinsPerSFL: 1000 }, {});
  const d1 = diggingVerdict(unplaced, p2p, { coinsPerSFL: 1000 }, {});
  assert.ok(d0.coins > 0);
  assert.ok(Math.abs(d0.coins / d1.coins - 1.5 / 1.2) < 1e-9, "placed Camel lifts the dig haul by the same 1.5/1.2");
});

// ── D9 ────────────────────────────────────────────────────────────────────────────────────────
test("D9 banked food counts Prime Aged fish and the game's own fish spellings", async () => {
  const { buildCookingSection } = await import("../../core/sections/cooking.mjs");
  const f = clone(farm);
  f.inventory["Aged Hammerhead shark"] = "2";      // the game's spelling (consumables.ts:1261)
  const items = buildCookingSection(f, {}, { petSimulate: false, now: JULY_16 }).bankedFood.items;
  const primes = items.filter((i) => i.name.startsWith("Prime Aged "));
  assert.equal(primes.reduce((s, i) => s + i.qty, 0), 36, "all 36 Prime Aged fish in the fixture inventory");
  const tuna = primes.find((i) => i.name === "Prime Aged Tuna");
  const agedTuna = items.find((i) => i.name === "Aged Tuna");
  // floor(600 x 1.3) = 780 vs 600 (consumables.ts:1420-1433); same boosts, no expected-prime uplift.
  assert.ok(Math.abs(tuna.xpEach / agedTuna.xpEach - 780 / 600) < 1e-9);
  assert.ok(items.some((i) => i.name === "Aged Hammerhead shark" && i.qty === 2), "Aged Hammerhead shark is banked");
});

// ── D10 ───────────────────────────────────────────────────────────────────────────────────────
test("D10 a pre-ascension level gate needs the XP OF that level (lib/level.ts LEVEL_EXPERIENCE)", async () => {
  const { buildAscensionSection } = await import("../../core/sections/ascension.mjs");
  const { BUMPKIN_XP_TABLE, getBumpkinLevel } = await import("../../core/engine/power-helpers.mjs");
  const f = clone(farm);
  f.island = { type: "basic", ascensionLevel: 0 };
  f.inventory["Basic Land"] = "5";
  const steps = buildAscensionSection(f, {}, 0, {}, {}).steps.filter((s) => s.asc === 0 && s.kind === "exp" && s.band > 1);
  assert.ok(steps.length > 0, "pre-ascension expansion steps exist");
  for (const s of steps) {
    assert.equal(s.levelXpNeeded, BUMPKIN_XP_TABLE[s.band - 1], `level ${s.band} gate`);
    assert.equal(getBumpkinLevel(s.levelXpNeeded), s.band, "that XP IS the level");
    assert.equal(getBumpkinLevel(s.levelXpNeeded - 1), s.band - 1, "one XP short is the level below");
  }
});

// ── D11 ───────────────────────────────────────────────────────────────────────────────────────
test("D11 delivery tickets: tywin 5, finn 3 (events/landExpansion/deliver.ts:39-51)", async () => {
  const { dashCalculateDeliveryTickets } = await import("../../core/engine/gifts-deliveries.mjs");
  const bare = { inventory: {}, bumpkin: { equipped: {} } };
  assert.equal(dashCalculateDeliveryTickets("tywin", bare, JULY_16), 5);
  assert.equal(dashCalculateDeliveryTickets("finn", bare, JULY_16), 3);
});

// ── F: one placed-check ───────────────────────────────────────────────────────────────────────
test("F placed checks see all four collectible maps (Groovy Gramophone in the house)", async () => {
  const { cropMachineSpeedMult } = await import("../../core/engine/crop-machine.mjs");
  const f = clone(farm);
  f.interior = f.interior || {};
  f.interior.ground = f.interior.ground || {};
  f.interior.ground.collectibles = { ...(f.interior.ground.collectibles || {}), "Groovy Gramophone": [{ coordinates: { x: 0, y: 0 } }] };
  const without = cropMachineSpeedMult(farm, false);
  assert.ok(Math.abs(cropMachineSpeedMult(f, false) - without * 0.5) < 1e-12, "core copy");
  assert.ok(Math.abs(page.cropMachineSpeedMult(f, false) - without * 0.5) < 1e-12, "page copy");
});

// ── F: one delivery price ─────────────────────────────────────────────────────────────────────
test("F a delivery item is priced one way: production cost first, then market, then p2p", () => {
  const rates = { coinsPerSFL: 1000, gemsPerSFL: 0 };
  page.setDashRates(rates);
  page.seedPrices(rates, { productionCost: { "Pumpkin Soup": 0.4 }, marketValue: { "Pumpkin Soup": 0.9, Carrot: 0.02 } });
  // The Dashboard read market value only (0.9); the Roadmap's rule takes the cooking cost.
  assert.ok(Math.abs(page.dashP2PCost([{ name: "Pumpkin Soup", qty: 2 }]) - 0.8) < 1e-12);
  assert.ok(Math.abs(page.dashP2PCost({ Carrot: 10 }) - 0.2) < 1e-12, "no production cost → market value");
});

// ── F: shrines on Power's numbers ─────────────────────────────────────────────────────────────
test("F the Shrines page prices on Power's rate, Oil and efficiency — no constants of its own", () => {
  const body = SRC.slice(SRC.indexOf("async function renderShrines("), SRC.indexOf("async function renderBuds("));
  assert.ok(!/coinsPerSFL:\s*320/.test(body.slice(0, body.indexOf("function _shrineMarginalSflPerDay"))), "no hard-coded 320 coins/FLOWER");
  assert.ok(/section=power/.test(body), "prices, Oil and rates from section=power");
  assert.ok(/section=eff/.test(body), "efficiency from section=eff, the Power/Roadmap measurement");
  assert.ok(!/_shrineBuildEffMap|SHRINE_FALLBACK_EFF/.test(SRC), "the page's own 14-day efficiency is gone");
});
