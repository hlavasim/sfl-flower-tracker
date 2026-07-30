import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { buildPowerSection } from "../../core/sections/power.mjs";
import { roadmapCatMix, roadmapOwnedEffects, getRoadmapSettings, roadmapInSeason } from "../../core/engine/roadmap.mjs";

/*
 * A permanent purchase has to be valued over the YEAR, not over whatever this season allows.
 * roadmapInSeason is a yes/no gate and every call site skipped out-of-season products, so a
 * boost tied to Banana (summer + autumn) scored 100% for half the year and 0% for the other
 * half, and the 13 single-season products scored 100% for a quarter of it — up to a 4x
 * overstatement on the number a buy decision is made from.
 *
 * These tests pin the STRUCTURE, not a figure: they never ask what season it is today, because
 * the real date is not a fixture and a pinned number would rot every three months.
 */
const wrap = JSON.parse(readFileSync(new URL("../fixtures/farm-155498.json", import.meta.url)));
const farm = wrap.farm || wrap;
const p2p = JSON.parse(readFileSync(new URL("../fixtures/p2p-prices.json", import.meta.url)));
const nfts = { collectibles: [], wearables: [] };
const SEASONS = ["spring", "summer", "autumn", "winter"];

/** Build the power context for a farm pinned to one season, then take that season's mix. */
function mixInSeason(season, cat) {
  const f = { ...farm, season: { ...(farm.season || {}), season } };
  buildPowerSection(f, p2p, nfts, null, {});           // sets the context roadmapCatMix reads
  const s = getRoadmapSettings({});
  return roadmapCatMix(cat, roadmapOwnedEffects(cat), s);
}

test("the annual basis is the MEAN of the four seasons, not a weighted single pick", () => {
  for (const cat of ["crops", "fruits"]) {
    const per = SEASONS.map((s) => mixInSeason(s, cat));
    const meanGross = per.reduce((a, r) => a + r.gross, 0) / SEASONS.length;
    const meanCost = per.reduce((a, r) => a + r.cost, 0) / SEASONS.length;

    // Same context as the last loop iteration; the annual basis must not depend on which.
    const s = { ...getRoadmapSettings({}), seasonBasis: "annual" };
    const annual = roadmapCatMix(cat, roadmapOwnedEffects(cat), s);

    assert.ok(Math.abs(annual.gross - meanGross) < 1e-6,
      `${cat}: annual gross ${annual.gross} must equal the seasons' mean ${meanGross}`);
    assert.ok(Math.abs(annual.cost - meanCost) < 1e-6, `${cat}: and likewise the cost`);

    // Not vacuous: the seasons must actually differ, or the mean proves nothing.
    const grosses = per.map((r) => r.gross);
    assert.ok(Math.max(...grosses) - Math.min(...grosses) > 1e-6,
      `${cat}: the four seasons must produce different mixes (${grosses.join(", ")})`);
  }
});

test("the annual basis does not depend on today's season", () => {
  // The bug it replaces did: the answer changed four times a year for a purchase you keep.
  const seen = [];
  for (const season of SEASONS) {
    const f = { ...farm, season: { ...(farm.season || {}), season } };
    buildPowerSection(f, p2p, nfts, null, {});
    const s = { ...getRoadmapSettings({}), seasonBasis: "annual" };
    seen.push(roadmapCatMix("crops", roadmapOwnedEffects("crops"), s).gross);
  }
  for (const v of seen) assert.ok(Math.abs(v - seen[0]) < 1e-6, `annual gross drifted with the season: ${seen.join(", ")}`);
});

test("the in-season basis is untouched, and still gated on the season", () => {
  // "What am I earning this week" must keep its old meaning: only what grows now competes.
  buildPowerSection(farm, p2p, nfts, null, {});
  const s = getRoadmapSettings({});
  assert.notEqual(s.seasonBasis, "annual", "default settings must NOT be annual");
  const now = roadmapCatMix("crops", roadmapOwnedEffects("crops"), s);
  const annual = roadmapCatMix("crops", roadmapOwnedEffects("crops"), { ...s, seasonBasis: "annual" });
  assert.ok(now.gross > 0 && annual.gross > 0, "both bases produce something");
  assert.ok(Math.abs(now.gross - annual.gross) > 1e-6,
    "and they must differ — if they match, the annual pass is not doing anything");
  // The gate itself still works.
  assert.equal(typeof roadmapInSeason("Wheat"), "boolean");
  assert.equal(roadmapInSeason("Wheat"), true, "Wheat is a year-round crop");
});

test("calcBoostValue asks for the annual basis", async () => {
  // The whole point: the permanent-value engine must be on the annual basis, or a season-locked
  // boost is still quoted at four times its worth for three months of the year.
  const page = readFileSync(new URL("../../flowers.html", import.meta.url), "utf8");
  const core = readFileSync(new URL("../../core/engine/roadmap.mjs", import.meta.url), "utf8");
  for (const [name, src] of [["core", core], ["flowers.html", page]]) {
    const i = src.indexOf("function calcBoostValue");
    assert.ok(i > 0, `${name}: calcBoostValue present`);
    const body = src.slice(i, i + 4000);
    assert.match(body, /seasonBasis: "annual"/, `${name}: calcBoostValue must request the annual basis`);
  }
});
