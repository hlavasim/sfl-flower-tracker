// CROP MACHINE IN THE ROADMAP.
//
// The machine is not a POWER_CATEGORIES entry, so three things were missing:
//   1. its checkboxes were the PLOT crops' checkboxes — a crop grown only in the machine and
//      unchecked on the plots (Sunflower, Yam, Rhubarb on the owner's farm) vanished from it;
//   2. YOUR INCOME RIGHT NOW never counted it (roadmapCurrentProduction walks POWER_CATEGORIES);
//   3. an NFT that only helps the machine (Groovy Gramophone) was worth 0 in the buy path.
// Now it has its own "cm:<Crop>" switches, the checked crops share its one queue
// (cropMachineMix), that mix is income, and machine items are priced on it.
//
// Revert checks: sharing the plot switches again empties the machine rows in test 2; dropping
// the currentProd fold fails test 3; dropping the item gain fails test 4.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildPowerSection } from "../../core/sections/power.mjs";
import { buildRoadmapSection } from "../../core/sections/roadmap.mjs";
import {
  cropMachineMix, cropMachineItemGain, calcCropMachineDaily, cropMachineCrops,
} from "../../core/engine/crop-machine.mjs";
import {
  getRoadmapSettings, roadmapCropMachineMix, roadmapItemValue, roadmapBuildClones, cmGetSeedRestockCount,
} from "../../core/engine/roadmap.mjs";

const wrap = JSON.parse(readFileSync(new URL("../fixtures/farm-155498.json", import.meta.url)));
const farm = wrap.farm || wrap;
const p2p = JSON.parse(readFileSync(new URL("../fixtures/p2p-prices.json", import.meta.url)));
const nfts = JSON.parse(readFileSync(new URL("../fixtures/nfts-sample.json", import.meta.url)));
const power = buildPowerSection(farm, p2p, nfts, null, {});
const er = power.exchangeRates;

test("mix: crops share one day of machine time, capped by restock seeds, oil only while running", () => {
  const crops = cropMachineCrops(farm);
  const cap = (c) => 2 * cmGetSeedRestockCount(farm, c);
  // The engine's prices (the fixture feed has no Oil; power derives it), so oil is really charged.
  const prices = roadmapCropMachineMix(getRoadmapSettings({})).p2p;
  const mix = cropMachineMix(farm, crops, prices, er, { capSeeds: cap });
  const used = mix.rows.reduce((s, r) => s + r.share, 0);
  assert.ok(used <= 1 + 1e-9, `shares sum to ${used}, more than one day`);
  assert.ok(Math.abs(used + mix.idle - 1) < 1e-9, "shares + idle = the whole day");
  for (const r of mix.rows) {
    assert.ok(r.seeds <= cap(r.crop) + 1e-6, `${r.crop}: ${r.seeds} seeds over the restock cap ${cap(r.crop)}`);
    assert.ok(r.net > 0, `${r.crop} is in the mix at a loss`);
  }
  // Oil is charged for the running share only: the full-day oil times the share used.
  const fullOil = calcCropMachineDaily(farm, crops[0], prices, er, false).oilCost;
  assert.ok(fullOil > 0, "oil is priced");
  assert.ok(mix.rows.length > 0, "something is grown");
  assert.ok(Math.abs(mix.oilCost - fullOil * used) < 1e-9);
  assert.ok(Math.abs(mix.net - mix.rows.reduce((s, r) => s + r.net, 0)) < 1e-9, "rows add up to the mix");
});

test("machine switches are separate from the plot crops", () => {
  // Every machine crop unchecked ON THE PLOTS must still be grown in the machine.
  const crops = cropMachineCrops(farm);
  const plotsOff = buildRoadmapSection([], { roadmapSettings: { excludeCats: crops.slice() }, farm, p2p });
  const g = plotsOff.profitability.groups.find((x) => x.id === "cropMachine");
  assert.ok(g && g.rows.length > 0, "machine rows survive the plot checkboxes");
  const labels = g.rows.map((r) => r.label);
  for (const c of crops) assert.ok(labels.includes(c), `${c} listed in the machine group`);
  // One row per crop (its own profitability), then the mix row last = the income figure.
  const last = g.rows[g.rows.length - 1];
  assert.match(last.label, /^Your mix/);
  const cm = roadmapCropMachineMix(getRoadmapSettings({ excludeCats: crops.slice() }));
  assert.ok(Math.abs(last.net - cm.mix.net) < 1e-9, "mix row = the mix");
  for (const r of g.rows.slice(0, -1)) {
    const full = calcCropMachineDaily(farm, r.label, cm.p2p, cm.er, false, (cm.opts.yields || {})[r.label]);
    const share = Math.min(1, cm.opts.capSeeds(r.label) / full.seedsPerDay);
    assert.ok(Math.abs(r.net - full.net * share) < 1e-9, `${r.label}: row net is the crop alone on its restocked share`);
  }

  // Unchecking it on the MACHINE removes it.
  const off = crops[0];
  const cmOff = buildRoadmapSection([], { roadmapSettings: { excludeCats: ["cm:" + off] }, farm, p2p });
  const g2 = cmOff.profitability.groups.find((x) => x.id === "cropMachine");
  assert.ok(!g2.rows.some((r) => r.label === off), `${off} still shown after cm:${off} was unchecked`);
});

test("YOUR INCOME RIGHT NOW counts the machine mix, at full running time", () => {
  const out = buildRoadmapSection([], { roadmapSettings: {}, farm, p2p });
  const row = out.currentProd.breakdown.find((b) => b.cat === "cropMachine");
  const cm = roadmapCropMachineMix(getRoadmapSettings({}));
  assert.ok(cm.mix.net > 0, "fixture machine mix earns something");
  assert.ok(row, "currentProd carries a cropMachine row");
  assert.ok(Math.abs(row.sfl - cm.mix.net) < 1e-9, `income ${row.sfl} != mix ${cm.mix.net} (must not be activity-scaled)`);
  assert.ok(Math.abs(out.startIncome - out.currentProd.total) < 1e-9);

  // Nothing checked in the machine = no machine income.
  const none = cropMachineCrops(farm).map((c) => "cm:" + c);
  const out2 = buildRoadmapSection([], { roadmapSettings: { excludeCats: none }, farm, p2p });
  assert.ok(!out2.currentProd.breakdown.some((b) => b.cat === "cropMachine"));
});

test("buy path prices items on the machine mix", () => {
  const s = getRoadmapSettings({});
  const cm = roadmapCropMachineMix(s);
  // Gramophone halves grow time: worth something, and exactly the mix delta.
  const gram = cropMachineItemGain("Groovy Gramophone", farm, cm.crops, cm.p2p, cm.er, cm.opts);
  assert.ok(gram > 0, "Groovy Gramophone adds to the machine");
  const faster = cropMachineMix(farm, cm.crops, cm.p2p, cm.er, Object.assign({}, cm.opts, { speedFactor: 0.5 })).net;
  assert.ok(Math.abs(gram - (faster - cm.mix.net)) < 1e-9);
  // Giant Yam only helps Yam, which this farm's modules do not unlock.
  assert.equal(cropMachineItemGain("Giant Yam", farm, cm.crops, cm.p2p, cm.er, cm.opts), 0);
  // A plot-only item is not a machine item.
  assert.equal(cropMachineItemGain("Scary Mike", farm, cm.crops, cm.p2p, cm.er, cm.opts), 0);

  // roadmapItemValue carries it (a bare clone, as roadmapBuildMissing makes for the Gramophone).
  const { catBoostsW } = roadmapBuildClones();
  const clone = { name: "Groovy Gramophone", categories: ["crops"], effects: [], has: false, isDisabled: false };
  assert.ok(Math.abs(roadmapItemValue(clone, catBoostsW, s) - gram) < 1e-9);
  // Unchecking every machine crop makes it worthless.
  const s2 = getRoadmapSettings({ excludeCats: cropMachineCrops(farm).map((c) => "cm:" + c) });
  assert.equal(roadmapItemValue(clone, catBoostsW, s2), 0);
});
