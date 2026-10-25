import { test } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import { levelEconomics, marketTable, upgradePlan, masterpieceCost, masterpieceStop, pricesFromPools, xpSources } from "../../core/craftworld/calc.mjs";

const factories = JSON.parse(fs.readFileSync(new URL("../../core/craftworld/factories.json", import.meta.url))).factories;
// Prices in COIN as read 2026-10-23 (30 Sand ≈ 10.7, 1 Copper ≈ 9.72).
const prices = { SAND: 10.7 / 30, COPPER: 9.72, STEEL: 43.75, LUMBER: 0.13 / 5, BEAM: 0.14 };

test("factory data: Copper L1 is 30 Sand -> 1 Copper, 1 h, 250 power, 2,000 XP", () => {
  const l1 = factories.copper.levels[0];
  assert.deepEqual(l1.inputs, [{ symbol: "SAND", amount: 30 }]);
  assert.equal(l1.output, 1);
  assert.equal(l1.durationSeconds, 3600);
  assert.equal(l1.powerCost, 250);
  assert.equal(l1.xpPerOutput, 2000);
});

test("Copper from Sand loses value: ratio 0.91, trading it is cheaper (verdict buy)", () => {
  const e = levelEconomics(factories.copper, 1, prices);
  assert.ok(Math.abs(e.ratio - 9.72 / 10.7) < 1e-9);
  assert.equal(e.verdict, "buy");          // 0.908 < (1-2.5%)/(1+2.5%) = 0.951
  assert.equal(e.xpPerPower, 8);           // 2,000 XP / 250 power
  assert.ok(e.lossPerDay > 0 && e.xpPerCoin > 0);
});

test("a gaining factory gives XP for free", () => {
  const e = levelEconomics(factories.beam, 1, prices);   // 5 Lumber (0.13) -> Beam 0.14
  assert.equal(e.verdict, "craft");
  assert.equal(e.xpPerCoin, Infinity);
});

test("market table skips unpriced factories and sorts by ratio", () => {
  const t = marketTable(factories, prices, { buildings: [{ slug: "copper", level: 1 }] });
  assert.ok(t.length >= 3);
  for (let i = 1; i < t.length; i++) assert.ok(t[i - 1].ratio >= t[i].ratio);
  assert.equal(t.find((r) => r.slug === "copper").owned, true);
});

test("upgrade plan prices the next level and ranks by XP/day per COIN", () => {
  const p = upgradePlan(factories, prices, { buildings: [{ slug: "copper", level: 1 }, { slug: "steel", level: 1 }, { slug: "mud", level: null }] });
  const cu = p.find((r) => r.slug === "copper");
  assert.equal(cu.to, 2);
  assert.deepEqual(cu.upgradeCost, [{ symbol: "COPPER", amount: 1 }]);
  assert.equal(cu.cost, 9.72);
  assert.equal(cu.dXpPerDay, 48000);
  assert.ok(!p.some((r) => r.slug === "mud"), "unknown level -> no plan");
});

test("masterpiece: 551 Sand in a fresh window costs 5,563 power (the screenshot said 5.57k)", () => {
  const m = masterpieceCost(551, 50);
  assert.equal(m.power, 50 * 5 + 200 * 7 + 301 * 13);
  assert.equal(m.parts.length, 3);
  // with Copper's 8 XP/power as the bar, stop after the 7-power tier (50/7 = 7.1 < 8 -> stop at 50)
  assert.equal(masterpieceStop(50, 8), 50);
  assert.equal(masterpieceStop(50, 7), 250);
  assert.equal(masterpieceStop(50, 7, 100), 150, "already given counts against the window");
});

test("pool rows -> prices in COIN, either orientation, deepest pool wins", () => {
  const p = pricesFromPools([
    { attributes: { name: "SAND / COIN 1%", base_token_price_quote_token: "0.36", reserve_in_usd: "1000" } },
    { attributes: { name: "SAND / COIN 0.3%", base_token_price_quote_token: "0.5", reserve_in_usd: "10" } },
    { attributes: { name: "COIN / WATER 1%", quote_token_price_base_token: "2.3", base_token_price_quote_token: "0.43", reserve_in_usd: "8000" } },
    { attributes: { name: "COIN / USDC 1%", base_token_price_quote_token: "0.0002", reserve_in_usd: "50000" } },
  ]);
  assert.equal(p.SAND.price, 0.36);
  assert.equal(p.WATER.price, 2.3);
  assert.ok(!p.USDC || p.USDC.price > 0);
});

test("xp sources rank owned factories by XP per COIN lost", () => {
  const s = xpSources(factories, prices, { buildings: [{ slug: "copper", level: 1 }, { slug: "beam", level: 1 }] });
  assert.equal(s[0].slug, "beam");
});

test("town hall plan: TH6 = 3 Ceramics; new: Battery, Secret Lab, a 4th Airstream and Power Cell; upgrades incl. the new copies", async () => {
  const { thPlan } = await import("../../core/craftworld/calc.mjs");
  const buildings = JSON.parse(fs.readFileSync(new URL("../../core/craftworld/buildings.json", import.meta.url))).buildings;
  const plan = thPlan(buildings, { CERAMICS: 66, SCREWS: 100 }, 5, 33);
  const th6 = plan[0];
  assert.equal(th6.th, 6);
  assert.deepEqual(th6.upgrade.cost, [{ symbol: "CERAMICS", amount: 3 }]);
  assert.equal(th6.upgrade.coin, 198);
  assert.equal(th6.levelsShort, 0);
  const nb = Object.fromEntries(th6.newBuildings.map((x) => [x.slug, x]));
  assert.equal(nb.battery.isNew, true);
  assert.equal(nb["secret-lab"].isNew, true);
  assert.equal(nb.airstream.copies, 1);
  assert.equal(nb.airstream.count, 4);
  assert.deepEqual(nb.airstream.buildCost, [{ symbol: "MUD", amount: 3 }]);
  assert.equal(nb["power-cell"].count, 4);
  const ups = Object.fromEntries(th6.upgrades.map((x) => [x.slug, x]));
  const air = ups.airstream;
  assert.deepEqual(air.parts.map((p) => [p.from, p.to, p.copies]), [[8, 9, 3], [1, 9, 1]], "3 standing copies 8->9, the new one 1->9");
  assert.ok(ups.battery && ups.battery.parts[0].from === 1 && ups.battery.cap === 3);
  assert.ok(plan.length === 5 && plan[4].th === 10, "TH6..TH10");
  assert.equal(plan[1].levelsShort, 17, "TH7 needs level 50");
});

test("efficiency matrix: Copper L1 8 XP/power, 2,000 XP/h, 250 power/h; Sand L9 18.75 XP/power", async () => {
  const { efficiencyMatrix } = await import("../../core/craftworld/calc.mjs");
  const m = Object.fromEntries(efficiencyMatrix(factories).map((r) => [r.slug, r]));
  assert.deepEqual(m.copper.levels[0], { level: 1, xpPerPower: 8, xpPerHour: 2000, powerPerHour: 250 });
  assert.equal(m.sand.levels[8].xpPerPower, 18.75);
  assert.ok(!m.earth, "mines use no power");
});

test("recipe tree: Copper from Sand with the 2.5 % fee on every buy and sell; own ratios and time override", async () => {
  const { recipeTree } = await import("../../core/craftworld/calc.mjs");
  const p = { COPPER: 9.72, SAND: 0.36, CLAY: 0.13, MUD: 0.01, EARTH: 0.003 };
  const t = recipeTree("COPPER", factories, p);
  assert.equal(t.inputs[0].symbol, "SAND");
  assert.equal(t.inputs[0].perOne, 30);
  // each step takes the cheaper of buying (market × 1.025) and making:
  // Mud: buy 0.01025 vs make 3 × 0.003075 = 0.009225 -> 0.009225; Clay: buy 0.13325 vs 0.09225;
  // Sand: buy 0.369 vs 3 × 0.09225 = 0.27675; Copper make = 30 × 0.27675 = 8.3025
  assert.ok(Math.abs(t.make - 8.3025) < 1e-9);
  assert.ok(Math.abs(t.buy - 9.72 * 1.025) < 1e-9 && Math.abs(t.sell - 9.72 * 0.975) < 1e-9);
  assert.ok(t.diff < 0);
  assert.equal(t.secPerOne, 3600);
  assert.ok(Math.abs(t.grossPerHour - 9.72 * 0.975) < 1e-9, "one Copper an hour, sold after the fee");
  assert.ok(Math.abs(t.profitPerHour - (9.72 * 0.975 - 8.3025)) < 1e-9);
  // a 3 % edge does not survive the fees: buy inputs at +2.5 %, sell at −2.5 %
  const thin = recipeTree("COPPER", factories, { COPPER: 10, SAND: 10 / 30 / 1.03 });
  assert.ok(thin.profitPerHour < 0, "a 3 % edge is a loss after 2.5 % in and 2.5 % out");
  const own = recipeTree("COPPER", factories, p, { copper: { SAND: 28, __sec: 1800 } });
  assert.ok(Math.abs(own.make - 28 * 0.27675) < 1e-9);
  assert.ok(Math.abs(own.grossPerHour - 2 * 9.72 * 0.975) < 1e-9, "one every 30 min = two an hour");
});
