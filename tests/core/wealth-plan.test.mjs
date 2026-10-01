import { test } from "node:test";
import assert from "node:assert";
import { planByWealth, resaleFactor } from "../../core/engine/wealth-plan.mjs";
import { getRoadmapSettings } from "../../core/engine/roadmap.mjs";

/*
 * The buy path by FLOWER in hand at the horizon. The old order maximised gross income and bought
 * every candidate whatever the horizon; these pin the behaviour that replaced it.
 */
const run = (cands, o = {}) => {
  const owned = new Set();
  return planByWealth(cands, {
    startIncome: 100, horizonDays: 5 * 365, ...o,
    valueOf: (c) => (c.needs && !owned.has(c.needs) ? 0 : c.gain),
    buy: (c) => owned.add(c.name),
  });
};

test("an item that cannot earn its price back within the horizon stays out of the plan", () => {
  const r = run([
    { name: "quick", price: 500, gain: 5, type: "Skill" },          // 100 days
    { name: "slow", price: 50000, gain: 5, type: "Skill" },         // 10,000 days
  ]);
  assert.deepEqual(r.steps.map((s) => s.c.name), ["quick"]);
  assert.deepEqual(r.left.map((x) => x.c.name), ["slow"]);
  assert.ok(r.left[0].horizonGain < 0, "and it reports what it would have cost");
});

test("resale counts: an NFT that keeps its value can pay off where a skill cannot", () => {
  // Price 1,000, +0.4/day, one-year horizon, bought on day 10: it earns 0.4 x 355 = 142.
  // A skill is then 858 short. The NFT (value held: drift 1) sells for 1,000 x 0.99 x 0.9 = 891,
  // so it ends 33 ahead.
  const o = { horizonDays: 365, driftOverride: 1 };
  const skill = run([{ name: "s", price: 1000, gain: 0.4, type: "Skill" }], o);
  const nft = run([{ name: "n", price: 1000, gain: 0.4, type: "Collectible" }], o);
  assert.equal(skill.steps.length, 0);
  assert.equal(nft.steps.length, 1);
  assert.ok(Math.abs(nft.steps[0].horizonGain - (142 - 1000 + 891)) < 1e-6);
});

test("the repay plan's withdrawal slows the plan down", () => {
  const cands = [{ name: "a", price: 1000, gain: 2, type: "Skill" }];
  const free = run(cands);
  const repaying = run(cands, { withdrawPerDay: 50 });
  assert.equal(free.steps[0].atDay, 10);
  assert.equal(repaying.steps[0].atDay, 20, "only 50 of the 100/day is reinvested");
  assert.ok(repaying.wealth < free.wealth);
});

test("a chain is bought in ladder order, and a step unlocked by an earlier buy is re-valued", () => {
  const r = run([
    { name: "L3", price: 100, gain: 9, type: "Skill", chainId: "x", chainSeq: 1 },
    { name: "L2", price: 100, gain: 1, type: "Skill", chainId: "x", chainSeq: 0 },
    { name: "tool", price: 10, gain: 0.5, type: "Skill" },
    { name: "node", price: 200, gain: 3, type: "Skill", needs: "tool" },
  ]);
  const order = r.steps.map((s) => s.c.name);
  assert.ok(order.indexOf("L2") < order.indexOf("L3"));
  assert.ok(order.includes("node") && order.indexOf("tool") < order.indexOf("node"));
});

/*
 * BUNDLES. Taken one at a time, a step that adds nothing never qualifies, so the good thing
 * behind it was never reached (A3 Expansion 35 at +0.03/day in front of Expansion 38 at +1.80).
 */
const runB = (cands, o = {}) => {
  const owned = new Set();
  return planByWealth(cands, {
    startIncome: 100, horizonDays: 5 * 365, ...o,
    valueOf: (c) => (c.needs && !owned.has(c.needs) ? 0 : c.gain),
    buy: (c) => owned.add(c.name),
    unbuy: (c) => owned.delete(c.name),
    groups: (c) => c.groups || ["all"],
  });
};

test("a chain step worth nothing is bought together with the step behind it that pays", () => {
  const cands = [
    { name: "E35", price: 100, gain: 0.01, type: "Skill", chainId: "asc", chainSeq: 0 },
    { name: "E36", price: 120, gain: 0.02, type: "Skill", chainId: "asc", chainSeq: 1 },
    { name: "E38", price: 300, gain: 2, type: "Skill", chainId: "asc", chainSeq: 2 },
  ];
  assert.equal(run(cands).steps.length, 0, "one at a time: E35 never qualifies, so nothing happens");
  const r = runB(cands);
  assert.deepEqual(r.steps.map((s) => s.c.name), ["E35", "E36", "E38"]);
  assert.equal(r.steps[0].bundle, 3);
  assert.ok(r.steps[0].horizonGain > 0 && r.steps[1].horizonGain === 0, "the bundle's gain sits on its first row");
});

test("a tool that is worth nothing alone is bought with the node that needs it", () => {
  const r = runB([
    { name: "tool", price: 50, gain: 0, type: "Skill", groups: ["iron"] },
    { name: "node", price: 400, gain: 4, type: "Skill", needs: "tool", groups: ["iron"] },
  ]);
  assert.deepEqual(r.steps.map((s) => s.c.name).sort(), ["node", "tool"]);
});

test("something that pays on its own is not folded into a bundle", () => {
  const r = runB([
    { name: "E35", price: 100, gain: 0.01, type: "Skill", chainId: "asc", chainSeq: 0, groups: ["stone"] },
    { name: "E38", price: 300, gain: 2, type: "Skill", chainId: "asc", chainSeq: 1, groups: ["stone"] },
    { name: "strong", price: 200, gain: 3, type: "Skill", groups: ["stone"] },
  ]);
  const strong = r.steps.find((s) => s.c.name === "strong");
  assert.ok(strong && !strong.bundle, "bought alone");
  assert.equal(r.steps.find((s) => s.c.name === "E35").bundle, 2);
});

/*
 * Limited inputs: obsidian priced at production cost bought 49 nodes by day 405 on a farm that
 * makes 4.45 a day. Purchases now wait for the input (or top it up from the market), and a
 * purchase waiting on an input does not freeze the cash that other purchases could use.
 */
test("an obsidian purchase waits for production and does not block cash purchases meanwhile", () => {
  const r = runB([
    { name: "node", price: 90, gain: 1, type: "Node", res: { obsidian: 90 } },     // 90 obsidian at 1/day
    { name: "nft", price: 500, gain: 1, type: "Skill" },                             // cash only, day 5
  ], { resources: { obsidian: { stock: 0, perDay: 1, market: 100, unitCost: 1 } } });
  const at = Object.fromEntries(r.steps.map((s) => [s.c.name, s.atDay]));
  assert.ok(at.nft < at.node, "the cash purchase is not held up by the obsidian one");
  assert.ok(Math.abs(at.node - 90) < 1e-6, "the node comes when 90 obsidian are made");
});

test("the shortfall is bought on the market when that leaves more FLOWER", () => {
  // Cheap obsidian on the market (2 vs 1 made) and slow production: buying it beats waiting a year.
  const r = runB([{ name: "node", price: 100, gain: 3, type: "Node", res: { obsidian: 100 } }],
    { resources: { obsidian: { stock: 0, perDay: 0.25, market: 2, unitCost: 1 } } });
  assert.ok(r.steps[0].atDay < 10, `bought early, day ${r.steps[0].atDay}`);
});

test("resale model: nothing above 10k, less the longer it is held, nothing for non-NFTs", () => {
  assert.equal(resaleFactor("Collectible", 12000, 1), 0);
  assert.equal(resaleFactor("Skill", 500, 1), 0);
  const y1 = resaleFactor("Wearable", 800, 1), y5 = resaleFactor("Wearable", 800, 5);
  assert.ok(y1 > y5 && y5 > 0);
  assert.ok(Math.abs(resaleFactor("Collectible", 800, 0) - 0.99 * 0.9) < 1e-9, "at once: listing price after the 10 % fee");
  assert.ok(Math.abs(resaleFactor("Collectible", 800, 2, 1) - 0.99 * 0.9) < 1e-9, "a drift override of 1 keeps the value");
});

test("the horizon defaults to five years, and the old 100-year default is read as five", () => {
  assert.equal(getRoadmapSettings({}).horizonYears, 5);
  assert.equal(getRoadmapSettings({ horizonYears: 100 }).horizonYears, 5);
  assert.equal(getRoadmapSettings({ horizonYears: 8 }).horizonYears, 8);
  assert.equal(getRoadmapSettings({}).withdrawPerDay, null);
});

test("minReturn: a gain under that share of the price by the horizon does not count as paying back", () => {
  // Skills (no resale), price 1,000, bought on day 10 (100/day income, no cash): horizonGain is
  // gain x 1,815 days - 1,000. 0.5785/day -> +50 (5 %); 0.6612/day -> +200 (20 %).
  const cands = () => [
    { name: "five", price: 1000, gain: 1050 / 1815, type: "Skill" },
    { name: "twenty", price: 1000, gain: 1200 / 1815, type: "Skill" },
  ];
  const plain = run(cands());
  assert.deepEqual(plain.steps.map((s) => s.c.name).sort(), ["five", "twenty"], "without a floor both pay back");
  const floor = run(cands(), { minReturn: 0.1 });
  assert.deepEqual(floor.steps.map((s) => s.c.name), ["twenty"]);
  assert.deepEqual(floor.left.map((x) => x.c.name), ["five"], "the +5 % one is listed as not paying");
});
