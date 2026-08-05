import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import {
  petFoodDifficulty, petFoodRequests, petFeedEnergy, petFeedXp, buildPetFeedingTable,
} from "../../core/engine/pets.mjs";
import { PET_REQUESTS, PET_REQUEST_XP } from "../../core/data/pets.mjs";
import { buildPetsSection } from "../../core/sections/pets.mjs";

// The feeding table is a port of the game's own feedPet.ts. These tests pin the parts
// that are easy to get subtly wrong and impossible to eyeball:
//   - base energy == base XP == PET_REQUEST_XP[difficulty] (energy is a property of the
//     REQUEST, never of the dish — a 2-FLOWER hard dish and a 0.002-FLOWER easy one are
//     what makes the value ranking interesting);
//   - the flat level bonuses go in BEFORE the NFT aura multiplies, the wearable's +5 after;
//   - XP level multipliers scale the base only, every flat bonus lands afterwards;
//   - requests.food is filtered by the pet's level exactly the way the game filters it.

const FARM = new URL("../fixtures/farm-155498.json", import.meta.url);
const P2P = new URL("../fixtures/p2p-prices.json", import.meta.url);

test("every request food maps to exactly one difficulty, and the pools match the game", () => {
  assert.equal(PET_REQUESTS.easy.length, 14);
  assert.equal(PET_REQUESTS.medium.length, 26);
  assert.equal(PET_REQUESTS.hard.length, 24);
  assert.deepEqual(PET_REQUEST_XP, { easy: 20, medium: 100, hard: 300 });

  const seen = new Set();
  for (const [difficulty, foods] of Object.entries(PET_REQUESTS)) {
    for (const food of foods) {
      assert.equal(petFoodDifficulty(food), difficulty, `${food} resolved to the wrong tier`);
      assert.ok(!seen.has(food), `${food} appears in two difficulty pools`);
      seen.add(food);
    }
  }
  assert.equal(seen.size, 64);
  assert.equal(petFoodDifficulty("Sunflower"), null);  // not a pet food
});

test("feed energy: level bonuses are multiplied by the aura, the wearable is not", () => {
  // No boosts at all → the raw request value.
  assert.equal(petFeedEnergy(20, { level: 1 }), 20);
  assert.equal(petFeedEnergy(300, { level: 1 }), 300);

  // +5 at 5 / 35 / 75, cumulative.
  assert.equal(petFeedEnergy(20, { level: 5 }), 25);
  assert.equal(petFeedEnergy(20, { level: 35 }), 30);
  assert.equal(petFeedEnergy(20, { level: 75 }), 35);

  // Aura applies to (base + level bonuses), NFT only.
  assert.equal(petFeedEnergy(20, { level: 35, isNft: true, aura: "Mythic Aura" }), 90);   // (20+10)*3
  assert.equal(petFeedEnergy(20, { level: 35, isNft: true, aura: "Common Aura" }), 45);   // (20+10)*1.5
  assert.equal(petFeedEnergy(20, { level: 35, aura: "Mythic Aura" }), 30, "aura must not apply to a common pet");

  // Walrus Onesie lands AFTER the multiplier — 95, not 105.
  assert.equal(petFeedEnergy(20, { level: 35, isNft: true, aura: "Mythic Aura", walrusOnesie: true }), 95);
});

test("feed XP: level multipliers scale the base, flat bonuses are added after", () => {
  assert.equal(petFeedXp(100, "medium", { level: 1 }), 100);
  assert.equal(petFeedXp(100, "medium", { level: 27 }), 110);                       // x1.10
  assert.equal(petFeedXp(100, "medium", { level: 40, isNft: true }), 125);          // x1.25
  assert.equal(petFeedXp(100, "medium", { level: 85, isNft: true }), 150);          // x1.50
  assert.equal(petFeedXp(100, "medium", { level: 40 }), 110, "NFT-only tier applied to a common pet");

  // Flat bonuses are outside the multiplier: 100*1.1 + 10 = 120, not 121.
  assert.equal(petFeedXp(100, "medium", { level: 27, petBowls: true }), 120);
  assert.equal(petFeedXp(100, "medium", { level: 1, houndShrine: true }), 200);

  // Beast Shoes pays per difficulty, and nothing on easy.
  assert.equal(petFeedXp(20, "easy", { level: 1, beastShoes: true }), 20);
  assert.equal(petFeedXp(100, "medium", { level: 1, beastShoes: true }), 200);
  assert.equal(petFeedXp(300, "hard", { level: 1, beastShoes: true }), 550);

  // Bib is NFT-only.
  assert.equal(petFeedXp(20, "easy", { level: 1, isNft: true, bib: "Gold Necklace" }), 30);
  assert.equal(petFeedXp(20, "easy", { level: 1, bib: "Gold Necklace" }), 20);
});

test("requests are filtered by level exactly the way the game filters them", () => {
  const draw = ["Mashed Potato", "Orange Cake", "Pancakes", "The Lot", "Blue Cheese"];  // 1 easy, 2 medium, 2 hard

  // Common pet: below 10 it sees the first two non-hard requests, then all of them.
  assert.deepEqual(petFoodRequests(draw, 9, false), ["Mashed Potato", "Orange Cake"]);
  assert.deepEqual(petFoodRequests(draw, 10, false), draw);

  // NFT: 1/1/1 below 30, one more medium to 199, everything at 200.
  assert.deepEqual(petFoodRequests(draw, 29, true), ["Mashed Potato", "Orange Cake", "The Lot"]);
  assert.deepEqual(petFoodRequests(draw, 30, true), ["Mashed Potato", "Orange Cake", "Pancakes", "The Lot"]);
  assert.deepEqual(petFoodRequests(draw, 200, true), draw);

  assert.deepEqual(petFoodRequests(undefined, 50, false), []);
});

test("table ranks by energy per FLOWER and marks fed rows, unpriced dishes last", () => {
  const pet = {
    level: 50, isNft: false, aura: null, bib: null,
    foods: ["Mashed Potato", "Orange Cake", "The Lot", "Cheese"],
    foodFed: ["Orange Cake"],
  };
  const cost = { "Mashed Potato": 0.0029, "Orange Cake": 0.8, "The Lot": 0.29 };  // Cheese unpriced
  const rows = buildPetFeedingTable(pet, (f) => cost[f], { petBowls: true });

  assert.deepEqual(rows.map((r) => r.food), ["Mashed Potato", "The Lot", "Orange Cake", "Cheese"]);
  assert.equal(rows[0].best, true);
  assert.ok(rows.slice(1).every((r) => !r.best), "more than one row flagged best");
  assert.equal(rows.at(-1).price, null, "an unpriced dish must not rank as free");
  assert.equal(rows.at(-1).energyPerSfl, null);
  assert.equal(rows.find((r) => r.food === "Orange Cake").fed, true);
  assert.equal(rows.find((r) => r.food === "Mashed Potato").fed, false);

  // Lv50 common, no aura: 20 + 5 + 5 = 30 energy; XP 20*1.1 + 10 = 32.
  assert.equal(rows[0].energy, 30);
  assert.equal(rows[0].xp, 32);
  assert.equal(Math.round(rows[0].energyPerSfl), Math.round(30 / 0.0029));
});

test("section=pets attaches a feeding table priced from the same map as prices/diff", () => {
  const farm = JSON.parse(readFileSync(FARM, "utf8")).farm;
  const p2p = JSON.parse(readFileSync(P2P, "utf8"));
  const data = buildPetsSection(farm, p2p, {});

  assert.ok(data.pets.length > 0);
  for (const pet of data.pets) {
    assert.ok(Array.isArray(pet.feeding), `${pet.name} has no feeding table`);
    for (const row of pet.feeding) {
      assert.ok(["easy", "medium", "hard"].includes(row.difficulty));
      assert.equal(row.baseEnergy, PET_REQUEST_XP[row.difficulty]);
      assert.ok(row.energy >= row.baseEnergy, "boosts can only add energy");
      if (row.price != null) {
        assert.ok(row.price > 0, "a priced row must carry a positive cost");
        assert.ok(Math.abs(row.energyPerSfl - row.energy / row.price) < 1e-9);
      }
    }
    // Ranked best-value first.
    const eff = pet.feeding.map((r) => r.energyPerSfl ?? -1);
    assert.deepEqual(eff, [...eff].sort((a, b) => b - a), `${pet.name} feeding table is not ranked`);
  }
  // The boosts the feeding math reads are reported so the page can explain the numbers.
  for (const k of ["hasPetBowls", "hasWalrusOnesie", "hasBeastShoes", "hasHoundShrine"]) {
    assert.equal(typeof data[k], "boolean", `${k} missing from the section payload`);
  }
});

// The page renders the table from a template literal that no unit test would otherwise
// touch. Slice that block out of flowers.html and run it against a payload row, so a
// typo (or a silent revert to the old plain food list) shows up as a red test.
const PAGE = new URL("../../flowers.html", import.meta.url);

function renderFeedingBlock(pet) {
  const html = readFileSync(PAGE, "utf8");
  const start = html.indexOf("// Feeding table — today's requests");
  const end = html.indexOf("} else if (pet.foods.length > 0) {", start);
  assert.ok(start > 0 && end > start, "feeding block not found in flowers.html");
  const body = html.slice(start, end) + "}";
  return new Function("pet", "escHTML", "sflIcon",
    "let content = '';\n" + body + "\nreturn content;"
  )(pet, (s) => String(s).replace(/[&<>\"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])), () => "<i></i>");
}

test("the page renders the feeding rows, not the old plain food list", () => {
  const out = renderFeedingBlock({
    foods: ["a"], feeding: [
      { food: "Rhubarb Tart", difficulty: "easy", energy: 35, xp: 22, price: 0.002, energyPerSfl: 17207, fed: false, best: true },
      { food: "Grape Juice", difficulty: "hard", energy: 315, xp: 330, price: 1.2805, energyPerSfl: 246, fed: true },
      { food: "Cheese", difficulty: "easy", energy: 35, xp: 22, price: null, energyPerSfl: null, fed: false },
    ],
  });

  assert.match(out, /FEEDING/);
  // A single table, so every column shares one track and the numbers line up between
  // rows — per-row grids sized their columns independently and looked scrambled.
  assert.equal((out.match(/<table class="pet-feed-table">/g) || []).length, 1);
  assert.equal((out.match(/<tr/g) || []).length, 4, "one header row + one row per request");
  for (const row of out.split("<tr").slice(2)) {
    assert.equal((row.match(/<td/g) || []).length, 5, "row does not have all five cells");
  }
  assert.match(out, /<tr class="pet-best">/, "best row not highlighted");
  assert.match(out, /pet-fed/, "fed row not dimmed");
  assert.match(out, /pet-feed-tier easy/);
  assert.match(out, /pet-feed-tier hard/);
  assert.match(out, /17,207/, "efficiency not formatted");
  assert.match(out, /0\.0020/, "sub-cent cost needs 4 decimals or it reads as 0.00");
  assert.match(out, /1\.280/, "cost above a cent should read at 3 decimals");
  assert.match(out, /1\/3 fed today/);
  assert.doesNotMatch(out, /undefined|NaN/, "template produced undefined/NaN");
  // Units belong in the header; repeating them in every cell is what made the numbers
  // hard to read. And the column is per SFL — the app's currency label everywhere else.
  assert.doesNotMatch(out, /\d+ &#x26A1;<\/td>|\d+ xp<\/td>/, "units repeated in the cells");
  assert.doesNotMatch(out, /FLOWER/, "the rest of the app labels this currency SFL");
  // The value bar is scaled against the best row of this pet.
  assert.match(out, /pet-feed-bar" style="width:100%/, "best row's bar should be full width");
  const bars = [...out.matchAll(/pet-feed-bar" style="width:(\d+)%/g)].map((m) => Number(m[1]));
  assert.deepEqual(bars, [100, 4], "bars not proportional to the best value (unpriced row gets none)");
  // The unpriced row still renders, with an em dash instead of a fake price. Counted over
  // the rows only — the footer note carries an em dash of its own.
  const rowsOnly = out.split("pet-feed-note")[0];
  assert.equal((rowsOnly.match(/&#x2014;/g) || []).length, 2, "unpriced row should dash BOTH cost and value");
});

test("a pet with no feeding rows falls back to the old food list instead of blanking", () => {
  const out = renderFeedingBlock({ foods: ["Mashed Potato"], feeding: [] });
  assert.equal(out, "", "empty feeding must fall through to the else-if branch");
});
