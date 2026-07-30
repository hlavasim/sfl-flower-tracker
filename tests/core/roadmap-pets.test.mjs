// PETS INCOME IS REAL INCOME.
//
// `pets` sits in POWER_CATEGORIES but is not `quantifiable`, so roadmapCurrentProduction
// skips it — and startIncome, which prices every ETA and reinvestment date on the ROADMAP
// page, ran low by whatever the pets actually fetch. The farm HAS pets; this was never a
// scenario ("co kdybych rozjel"), it was a leak. buildRoadmapSection now folds the PETS
// page's own daily model (buildPetsSection → petDailyCalc) into currentProd/startIncome.
//
// Revert check: without the fold, `breakdown` has no "pets" row and the first assert fails.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildPowerSection } from "../../core/sections/power.mjs";
import { buildRoadmapSection } from "../../core/sections/roadmap.mjs";
import { buildPetsSection } from "../../core/sections/pets.mjs";

const wrap = JSON.parse(readFileSync(new URL("../fixtures/farm-155498.json", import.meta.url)));
const farm = wrap.farm || wrap;
const p2p = JSON.parse(readFileSync(new URL("../fixtures/p2p-prices.json", import.meta.url)));
const nfts = JSON.parse(readFileSync(new URL("../fixtures/nfts-sample.json", import.meta.url)));

buildPowerSection(farm, p2p, nfts, null, {});

test("pets income lands in currentProd and startIncome", () => {
  const petsPage = buildPetsSection(farm, p2p);
  const theoretical = petsPage.pets.reduce((s, p) => s + ((p.calc && p.calc.dailySfl) || 0), 0);
  assert.ok(petsPage.pets.length >= 1, "fixture farm keeps pets");
  assert.ok(theoretical > 0, "the pets fetch something worth > 0 SFL/day");

  const out = buildRoadmapSection([], { roadmapSettings: {}, farm, p2p });
  const row = out.currentProd.breakdown.find((b) => b.cat === "pets");
  assert.ok(row, "currentProd breakdown carries a pets row");
  assert.ok(row.sfl > 0, "the pets row is worth something");
  // startIncome is currentProd.total (no manual override) and moves WITH the pets row.
  assert.ok(Math.abs(out.startIncome - out.currentProd.total) < 1e-9);
  assert.ok(out.startIncome > out.currentProd.total - row.sfl, "startIncome includes the pets income");
  // Scaled by measured activity (meanRatio), never above the theoretical fetch value.
  assert.ok(row.sfl <= theoretical + 1e-9, `eff-scaled (${row.sfl}) must not exceed theoretical (${theoretical})`);
});
