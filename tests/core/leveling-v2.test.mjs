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
