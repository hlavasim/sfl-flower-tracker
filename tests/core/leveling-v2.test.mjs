import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import * as LV from "../../core/sections/leveling.mjs";
import { ascensionXpFor } from "../../core/engine/ascension.mjs";

// LEVELING v2: measured salt, salt buying, the ascension ladder, the item × ascension matrix,
// the days × FLOWER frontier and the "next steps".
const farm = JSON.parse(readFileSync(new URL("../fixtures/farm-155498.json", import.meta.url))).farm;
const prices = JSON.parse(readFileSync(new URL("../fixtures/p2p-prices.json", import.meta.url)));
const NOW = Date.UTC(2026, 10, 24);
const inputs = { prices, coinsPerSFL: 1192, floors: { Walrus: 1399, "Surfer Hair": 3279, "Salt Worker Gnome": 2799 }, bids: { Walrus: 1155 }, budFloors: { Port: 1700, Sea: 1650 }, freePoints: 3, now: NOW };
const measured = { ...inputs, activity: { saltHarvests: 50 } };
const cfg = (over = {}) => ({ ...LV.defaultLevelingConfig(farm, inputs), ...over });

test("measured salt still lets a what-if node speed-up (Salty Seas 3) raise salt per day", () => {
  const f = { ...farm, bumpkin: { ...farm.bumpkin, skills: { ...farm.bumpkin.skills, "Salty Seas": 0 } } };
  const c = LV.defaultLevelingConfig(f, measured);
  const a = LV.levelingPlan(f, measured, c), b = LV.levelingPlan(f, measured, { ...c, ticked: ["Salty Seas 3"] });
  assert.ok(b.fish.saltPerDay > a.fish.saltPerDay * 1.1, `${a.fish.saltPerDay} → ${b.fish.saltPerDay}`);
});

const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));

test("ladder: the band to end of A5 ends where levelingPlan to A5 L50 ends, and the bands add up", () => {
  const c = cfg({ ticked: ["Walrus"] });
  const p = LV.levelingPlan(farm, inputs, c);
  const rows = LV.levelingLadder(farm, p, 10, 3);
  const a5 = rows.find((r) => r.ascension === 5);
  assert.ok(near(a5.cumDays, p.days) && near(a5.cumFlower, p.totalFlower), `${a5.cumFlower} vs ${p.totalFlower}`);
  const upTo5 = rows.filter((r) => r.ascension <= 5);
  assert.ok(near(upTo5.reduce((s, r) => s + r.days, 0), p.days));
  assert.ok(near(upTo5.reduce((s, r) => s + r.flower, 0) + p.oneOff, p.totalFlower));
  assert.equal(rows[rows.length - 1].ascension, 10);
  assert.ok(rows[0].fromLevel > 1, "the first band starts at today's level");
  // 1 skill point a level: the end of A(n+1) has 50 more than the end of An.
  const r6 = rows.find((r) => r.ascension === 6);
  if (a5.points != null) assert.equal(r6.points - a5.points, 50);
});

test("matrix cell at the configured target equals the catalogue row's net FLOWER", () => {
  const c = cfg();
  const row = LV.itemImpacts(farm, inputs, c).find((r) => r.name === "Walrus");
  const xp = ascensionXpFor(5, 50);
  assert.ok(near(LV.impactAt(farm, row, xp), row.dFlower), `${LV.impactAt(farm, row, xp)} vs ${row.dFlower}`);
  // further out the running saving grows, the price stays: the cell only gets better
  assert.ok(LV.impactAt(farm, row, ascensionXpFor(8, 50)) < LV.impactAt(farm, row, xp));
});

test("breakEven: the net turns negative exactly there, not one level earlier", () => {
  const row = LV.itemImpacts(farm, inputs, cfg()).find((r) => r.name === "Walrus");
  const be = LV.breakEven(farm, row, 10);
  assert.ok(be && be !== "now", JSON.stringify(be));
  assert.ok(LV.impactAt(farm, row, ascensionXpFor(be.ascension, be.level)) < 0);
  const prev = be.level > 2 ? ascensionXpFor(be.ascension, be.level - 1) : ascensionXpFor(be.ascension - 1, 50);
  assert.ok(LV.impactAt(farm, row, prev) >= 0);
});

test("Σ of nothing ticked is 0; Σ of one ticked item equals that row", () => {
  const c = cfg(), bare = LV.levelingPlan(farm, inputs, c);
  assert.equal(LV.tickedAt(farm, bare, bare, ascensionXpFor(6, 50)), 0);
  const c1 = cfg({ ticked: ["Walrus"] }), p1 = LV.levelingPlan(farm, inputs, c1);
  const row = LV.itemImpacts(farm, inputs, c1).find((r) => r.name === "Walrus");
  assert.ok(near(LV.tickedAt(farm, p1, bare, ascensionXpFor(6, 50)), LV.impactAt(farm, row, ascensionXpFor(6, 50))));
});

test("an NFT without a floor is flagged priceKnown false, never a silent free item", () => {
  const rows = LV.itemImpacts(farm, inputs, cfg());
  assert.equal(rows.find((r) => r.name === "Walrus").priceKnown, true);
  const unpriced = rows.find((r) => r.kind !== "skill" && r.tradeable && !(inputs.floors[r.name] > 0) && r.kind !== "bud");
  assert.equal(unpriced.priceKnown, false);
});

test("buds: the resale loss uses the best bid of that bud type", () => {
  const withBid = { ...inputs, budBids: { Port: 1600 } };
  const r = LV.itemImpacts(farm, withBid, cfg()).find((x) => x.name === "Port bud");
  assert.ok(near(r.loss, 100), String(r.loss));
  const out = LV.budTypeBids({ "Bud #1": { b: 50 }, "Bud #2": { b: 70 }, Walrus: { b: 9 } });
  assert.ok(Object.values(out).every((v) => v === 50 || v === 70));
});

test("buying salt: aging is no longer salt-bound and the bought salt is paid", () => {
  const c = cfg();
  const a = LV.levelingPlan(farm, inputs, c), b = LV.levelingPlan(farm, inputs, { ...c, fish: { ...c.fish, buySalt: true } });
  assert.ok(b.xpPerDay.aging >= a.xpPerDay.aging);
  assert.notEqual(b.bottleneck, "salt");
  assert.ok(near(b.costPerDay - a.costPerDay, b.fish.saltBought * prices.Salt, 1e-3) || b.fish.saltBought === 0);
});

test("costScale scales the running cost, not the NFT price", () => {
  const c = cfg({ ticked: ["Walrus"] });
  const a = LV.levelingPlan(farm, inputs, c), b = LV.levelingPlan(farm, inputs, { ...c, costScale: 1.2 });
  assert.ok(near(b.costPerDay, a.costPerDay * 1.2));
  assert.equal(b.oneOff, a.oneOff);
});

test("sanitize: baits always on, buySalt and costScale kept", () => {
  const d = LV.defaultLevelingConfig(farm, inputs);
  const s = LV.sanitizeLevelingConfig({ fish: { baits: false, buySalt: true }, costScale: 1.2 }, d, null);
  assert.equal(s.fish.baits, true);
  assert.equal(s.fish.buySalt, true);
  assert.equal(s.costScale, 1.2);
  assert.equal(LV.sanitizeLevelingConfig({ costScale: 7 }, d, null).costScale, undefined);
});

test("recipe options follow the ticked items (Golden Spatula +10 % XP) and carry FLOWER per 1 M XP", () => {
  const a = LV.levelingRecipeOptions(farm, inputs, 6), b = LV.levelingRecipeOptions(farm, inputs, 6, ["Golden Spatula"]);
  const k = Object.keys(a)[0];
  assert.ok(b[k][0].xpPerDay > a[k][0].xpPerDay);
  assert.ok(near(a[k][0].perM, a[k][0].costPerDay / (a[k][0].xpPerDay / 1e6)));
});

test("steps: each saves FLOWER, best first, and its config replans to that saving", () => {
  const c = cfg();
  const imp = LV.itemImpacts(farm, inputs, c);
  const steps = LV.levelingSteps(farm, inputs, c, imp, 3);
  assert.ok(steps.length > 0);
  const base = LV.levelingPlan(farm, inputs, c).totalFlower;
  for (let i = 0; i < steps.length; i++) {
    assert.ok(steps[i].dFlower < -1);
    if (i) assert.ok(steps[i].dFlower >= steps[i - 1].dFlower);
    assert.ok(near(LV.levelingPlan(farm, inputs, steps[i].config).totalFlower - base, steps[i].dFlower, 1e-6));
  }
});

test("frontier: faster points cost more, the cheapest beats the default, each point replans to itself", () => {
  const c = cfg();
  const fr = LV.levelingFrontier(farm, inputs, c, 10);
  assert.ok(fr.length >= 2 && fr.length <= 10);
  for (let i = 1; i < fr.length; i++) { assert.ok(fr[i].days > fr[i - 1].days); assert.ok(fr[i].flower < fr[i - 1].flower); }
  assert.ok(fr[fr.length - 1].flower <= LV.levelingPlan(farm, inputs, c).totalFlower);
  for (const p of fr) {
    const q = LV.levelingPlan(farm, inputs, p.config);
    assert.ok(near(q.totalFlower, p.flower, 1e-6) && near(q.days, p.days, 1e-6), `${q.totalFlower} vs ${p.flower}`);
    assert.ok(LV.tickedSkillPoints(farm, p.ticked) <= inputs.freePoints);
  }
});
