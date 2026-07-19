// Gifts + deliveries valuation — extracted VERBATIM from flowers.html (ranges marked)
// for section=roadmap's `todo` block. Deviations, same policy as the roadmap engine:
//   1. powerState reads go through _getPowerContext() (the page global).
//   2. roadmapItemCost's PRICES(...) client cache becomes the price maps the section
//      hands in via _setItemCostMaps (server: buildPricesSection on the same farm/p2p,
//      priced with the exchangeRates profile — the exact map the client cache held).
import { _getPowerContext } from "./roadmap.mjs";
import { getCount, findCollectible, SEED_DATA } from "./power-helpers.mjs";
import { toMs } from "./power-costs.mjs";
import { FLOWER_RECIPES } from "../data/recipes.mjs";

let _itemCostMaps = { productionCost: {}, marketValue: {} };
export function _setItemCostMaps(maps) { _itemCostMaps = maps || { productionCost: {}, marketValue: {} }; }


    // ── flowers.html 3054-3083: BUMPKIN_FLOWER_BONUSES + DEFAULT_FLOWER_POINTS ──
    const BUMPKIN_FLOWER_BONUSES = {
      "betty":         { "Red Pansy": 5, "Yellow Pansy": 5, "Purple Pansy": 5, "White Pansy": 5, "Blue Pansy": 5 },
      "pumpkin' pete": { "Yellow Cosmos": 6 },
      "blacksmith":    { "Red Carnation": 5 },
      "bert":          { "Red Lotus": 6, "Yellow Lotus": 6, "Purple Lotus": 6, "White Lotus": 6, "Blue Lotus": 6 },
      "finley":        { "Red Daffodil": 5, "Yellow Daffodil": 5, "Purple Daffodil": 5, "White Daffodil": 5, "Blue Daffodil": 5 },
      "raven":         { "Purple Carnation": 6, "Purple Lotus": 5, "Purple Daffodil": 4, "Purple Pansy": 4, "Purple Cosmos": 4, "Purple Balloon Flower": 4, "Purple Gladiolus": 3, "Purple Lavender": 4, "Purple Clover": 3, "Purple Edelweiss": 4 },
      "old salty":     { "Blue Carnation": 6, "Blue Lotus": 5, "Blue Daffodil": 4, "Blue Pansy": 4, "Blue Balloon Flower": 5, "Blue Cosmos": 4, "Blue Gladiolus": 4, "Blue Lavender": 3, "Blue Clover": 4, "Blue Edelweiss": 3 },
      "miranda":       { "Yellow Carnation": 6, "Yellow Lotus": 5, "Yellow Daffodil": 4, "Yellow Pansy": 4, "Yellow Balloon Flower": 5, "Yellow Cosmos": 4, "Yellow Gladiolus": 4, "Yellow Lavender": 4, "Yellow Clover": 4, "Yellow Edelweiss": 4 },
      "finn":          { "White Cosmos": 5, "Blue Cosmos": 5 },
      "corale":        { "Prism Petal": 6 },
      "cornwell":      { "Red Balloon Flower": 5, "Yellow Balloon Flower": 5, "Purple Balloon Flower": 5, "White Balloon Flower": 5, "Blue Balloon Flower": 5 },
      "tywin":         { "Primula Enigma": 7, "Celestial Frostbloom": 6 },
      "victoria":      { "Primula Enigma": 8 },
      "jester":        { "Red Balloon Flower": 6, "Red Carnation": 6 },
    };

    const DEFAULT_FLOWER_POINTS = {
      "Red Pansy": 3, "Yellow Pansy": 3, "Purple Pansy": 3, "White Pansy": 3, "Blue Pansy": 3,
      "Red Cosmos": 3, "Yellow Cosmos": 3, "Purple Cosmos": 3, "White Cosmos": 3, "Blue Cosmos": 3,
      "Red Balloon Flower": 5, "Yellow Balloon Flower": 5, "Purple Balloon Flower": 5, "White Balloon Flower": 5, "Blue Balloon Flower": 5,
      "Red Carnation": 5, "Yellow Carnation": 5, "Purple Carnation": 5, "White Carnation": 5, "Blue Carnation": 5,
      "Red Daffodil": 7, "Yellow Daffodil": 7, "Purple Daffodil": 7, "White Daffodil": 7, "Blue Daffodil": 7,
      "Red Lotus": 7, "Yellow Lotus": 7, "Purple Lotus": 7, "White Lotus": 7, "Blue Lotus": 7,
      "Prism Petal": 12, "Celestial Frostbloom": 12, "Primula Enigma": 12,
      "Red Edelweiss": 4, "Yellow Edelweiss": 4, "Purple Edelweiss": 4, "White Edelweiss": 4, "Blue Edelweiss": 4,
      "Red Gladiolus": 4, "Yellow Gladiolus": 4, "Purple Gladiolus": 4, "White Gladiolus": 4, "Blue Gladiolus": 4,
      "Red Lavender": 4, "Yellow Lavender": 4, "Purple Lavender": 4, "White Lavender": 4, "Blue Lavender": 4,
      "Red Clover": 4, "Yellow Clover": 4, "Purple Clover": 4, "White Clover": 4, "Blue Clover": 4,
    };

    // ── flowers.html 3085-3210: BUMPKIN_GIFTS_DATA ──
    const BUMPKIN_GIFTS_DATA = {
      "pumpkin' pete": {
        planned: [
          { fp: 5,   items: {}, coins: 160, wearables: {} },
          { fp: 12,  items: {"Treasure Key": 1}, coins: 0, wearables: {} },
          { fp: 50,  items: {}, coins: 0, wearables: {"Pumpkin Hat": 1} },
          { fp: 100, items: {}, coins: 640, wearables: {} },
        ],
        repeats: { fp: 100, items: {"Treasure Key": 1}, coins: 640, wearables: {} },
      },
      "betty": {
        planned: [
          { fp: 10,  items: {}, coins: 120, wearables: {} },
          { fp: 20,  items: {}, coins: 960, wearables: {}, recipe: "Basic Bed" },
          { fp: 40,  items: {"Treasure Key": 1}, coins: 0, wearables: {}, recipe: "Doll" },
          { fp: 110, items: {"Radish Cake": 1}, coins: 0, wearables: {}, recipe: "Buzz Doll" },
        ],
        repeats: { fp: 100, items: {"Treasure Key": 1}, coins: 0, wearables: {} },
      },
      "blacksmith": {
        planned: [
          { fp: 50,  items: {"Treasure Key": 1}, coins: 0, wearables: {}, recipe: "Timber" },
          { fp: 110, items: {}, coins: 760, wearables: {}, recipe: "Cushion" },
          { fp: 200, items: {}, coins: 1600, wearables: {}, recipe: "Hardened Leather" },
          { fp: 320, items: {"Pickaxe": 10}, coins: 0, wearables: {}, recipe: "Crimsteel" },
        ],
        repeats: { fp: 150, items: {"Treasure Key": 1}, coins: 960, wearables: {}, recipe: "Crude Doll" },
      },
      "bert": {
        planned: [
          { fp: 60,  items: {}, coins: 0, wearables: {"Tattered Jacket": 1}, recipe: "Wooly Doll" },
          { fp: 100, items: {"Gem": 1}, coins: 0, wearables: {}, recipe: "Cluck Doll" },
          { fp: 210, items: {"Pirate Cake": 3}, coins: 0, wearables: {}, recipe: "Cow Bed" },
          { fp: 330, items: {}, coins: 0, wearables: {"Greyed Glory": 1}, recipe: "Moo Doll" },
        ],
        repeats: { fp: 150, items: {"Rare Key": 1}, coins: 0, wearables: {} },
      },
      "finley": {
        planned: [
          { fp: 25,  items: {"Fishing Lure": 3}, coins: 0, wearables: {}, recipe: "Fisher Bed" },
          { fp: 95,  items: {}, coins: 3200, wearables: {} },
          { fp: 150, items: {"Tuna": 5}, coins: 0, wearables: {} },
        ],
        repeats: { fp: 100, items: {"Fishing Lure": 5}, coins: 0, wearables: {} },
      },
      "raven": {
        planned: [
          { fp: 50,  items: {"Time Warp Totem": 1}, coins: 0, wearables: {} },
          { fp: 140, items: {}, coins: 2560, wearables: {}, recipe: "Lunar Doll" },
          { fp: 220, items: {}, coins: 0, wearables: {"Victorian Hat": 1} },
          { fp: 330, items: {"Eggplant Seed": 50}, coins: 1600, wearables: {}, recipe: "Shadow Doll" },
          { fp: 700, items: {}, coins: 0, wearables: {"Bat Wings": 1} },
        ],
        repeats: { fp: 160, items: {"Rare Key": 1}, coins: 0, wearables: {} },
      },
      "miranda": {
        planned: [
          { fp: 30,  items: {"Time Warp Totem": 1}, coins: 0, wearables: {}, recipe: "Floral Bed" },
          { fp: 90,  items: {}, coins: 960, wearables: {"Fruit Picker Shirt": 1} },
          { fp: 260, items: {}, coins: 0, wearables: {"Fruit Picker Apron": 1}, recipe: "Desert Bed" },
          { fp: 500, items: {}, coins: 6400, wearables: {"Fruit Bowl": 1}, recipe: "Juicy Doll" },
        ],
        repeats: { fp: 100, items: {"Blueberry Seed": 5, "Apple Seed": 5, "Banana Plant": 5, "Orange Seed": 5}, coins: 0, wearables: {} },
      },
      "finn": {
        planned: [
          { fp: 40,  items: {"Rod": 10}, coins: 0, wearables: {} },
          { fp: 150, items: {}, coins: 960, wearables: {} },
        ],
        repeats: { fp: 130, items: {"Rare Key": 1}, coins: 0, wearables: {} },
      },
      "corale": {
        planned: [
          { fp: 45,  items: {}, coins: 960, wearables: {} },
          { fp: 150, items: {"Gem": 2}, coins: 0, wearables: {}, recipe: "Synthetic Fabric" },
          { fp: 320, items: {}, coins: 0, wearables: {"Pink Ponytail": 1}, recipe: "Kelp Fibre" },
        ],
        repeats: { fp: 200, items: {}, coins: 3200, wearables: {} },
      },
      "cornwell": {
        planned: [
          { fp: 65,  items: {"Rare Key": 1}, coins: 0, wearables: {}, recipe: "Sturdy Bed" },
          { fp: 175, items: {"Gem": 1}, coins: 0, wearables: {} },
          { fp: 340, items: {}, coins: 0, wearables: {"Wise Robes": 1}, recipe: "Harvest Doll" },
          { fp: 600, items: {}, coins: 0, wearables: {"Wise Beard": 1}, recipe: "Ember Doll" },
        ],
        repeats: { fp: 200, items: {"Luxury Key": 1}, coins: 0, wearables: {} },
      },
      "tywin": {
        planned: [
          { fp: 35,  items: {"Rare Key": 1}, coins: 0, wearables: {} },
          { fp: 175, items: {}, coins: 3200, wearables: {} },
          { fp: 330, items: {"Pirate Cake": 5}, coins: 0, wearables: {} },
        ],
        repeats: { fp: 160, items: {"Luxury Key": 1}, coins: 0, wearables: {} },
      },
      "victoria": {
        planned: [
          { fp: 50,  items: {}, coins: 2560, wearables: {} },
          { fp: 140, items: {"Time Warp Totem": 1}, coins: 0, wearables: {}, recipe: "Royal Bed" },
          { fp: 340, items: {}, coins: 0, wearables: {"Royal Dress": 1} },
          { fp: 520, items: {}, coins: 16000, wearables: {} },
          { fp: 850, items: {}, coins: 0, wearables: {"Queen's Crown": 1} },
        ],
        repeats: { fp: 160, items: {"Rare Key": 1}, coins: 0, wearables: {} },
      },
      "jester": {
        planned: [
          { fp: 50,  items: {"Time Warp Totem": 1}, coins: 0, wearables: {}, recipe: "Royal Bedding" },
          { fp: 140, items: {"Rare Key": 1}, coins: 0, wearables: {}, recipe: "Royal Ornament" },
          { fp: 340, items: {}, coins: 0, wearables: {"Cap n Bells": 1} },
          { fp: 520, items: {}, coins: 16000, wearables: {} },
          { fp: 740, items: {}, coins: 0, wearables: {"Motley": 1} },
        ],
        repeats: { fp: 90, items: {"Treasure Key": 1}, coins: 0, wearables: {} },
      },
      "old salty": {
        planned: [
          { fp: 30,  items: {}, coins: 80, wearables: {"Striped Blue Shirt": 1} },
          { fp: 90,  items: {}, coins: 260, wearables: {"Peg Leg": 1}, recipe: "Gilded Doll" },
          { fp: 500, items: {}, coins: 0, wearables: {"Pirate Potion": 1}, recipe: "Pirate Bed" },
          { fp: 850, items: {"Pirate Bounty": 1}, coins: 0, wearables: {"Pirate Hat": 1}, recipe: "Ocean's Treasure" },
        ],
        repeats: { fp: 250, items: {}, coins: 2500, wearables: {} },
      },
    };

    // ── flowers.html 3215-3238: getFlowerGiftPoints + getFlowerChainHours ──
    function getFlowerGiftPoints(npc, flower, hasBlossomBonding) {
      // Bonuses are ADDITIVE: total = base + npc-specific bonus + skill bonus (+2 if Blossom Bonding)
      const base = DEFAULT_FLOWER_POINTS[flower] || 0;
      const bonus = (BUMPKIN_FLOWER_BONUSES[npc] || {})[flower] || 0;
      const skill = hasBlossomBonding ? 2 : 0;
      return base + bonus + skill;
    }

    // Recursive chain-time calculation: sum grow times through entire flower chain
    // Crop inputs are treated as 0 hours (assumed available/quick).
    // Cycles are broken with a visiting Set.
    function getFlowerChainHours(flower, visiting) {
      visiting = visiting || new Set();
      if (visiting.has(flower)) return 0;
      visiting.add(flower);
      const recipe = FLOWER_RECIPES[flower];
      if (!recipe) return 0;
      const seedSec = SEED_DATA[recipe.seed]?.seconds || 0;
      const seedHours = seedSec / 3600;
      if (FLOWER_RECIPES[recipe.input]) {
        return seedHours + getFlowerChainHours(recipe.input, visiting);
      }
      return seedHours;
    }

    // ── flowers.html 8722-8747: CHAPTERS + TICKET_REWARDS + KNOWN_BOOST_COLLECTIBLES ──
    const CHAPTERS = [
      { name: "Solar Flare",       start: Date.UTC(2023,  0,  1), ticket: "Solar Flare Ticket",  boosts: ["Cow Scratcher", "Cow Scratcher", "Cow Scratcher"] },
      { name: "Dawn Breaker",      start: Date.UTC(2023,  4,  1), ticket: "Dawn Breaker Ticket", boosts: ["Cow Scratcher", "Cow Scratcher", "Cow Scratcher"] },
      { name: "Witches' Eve",      start: Date.UTC(2023,  7,  1), ticket: "Crow Feather",        boosts: ["Cow Scratcher", "Cow Scratcher", "Cow Scratcher"] },
      { name: "Catch the Kraken",  start: Date.UTC(2023, 10,  1), ticket: "Mermaid Scale",       boosts: ["Cow Scratcher", "Cow Scratcher", "Cow Scratcher"] },
      { name: "Spring Blossom",    start: Date.UTC(2024,  1,  1), ticket: "Tulip Bulb",          boosts: ["Cow Scratcher", "Cow Scratcher", "Cow Scratcher"] },
      { name: "Clash of Factions", start: Date.UTC(2024,  4,  1), ticket: "Scroll",              boosts: ["Cow Scratcher", "Cow Scratcher", "Cow Scratcher"] },
      { name: "Pharaoh's Treasure",start: Date.UTC(2024,  7,  1), ticket: "Amber Fossil",        boosts: ["Cow Scratcher", "Cow Scratcher", "Cow Scratcher"] },
      { name: "Bull Run",          start: Date.UTC(2024, 10,  1), ticket: "Horseshoe",           boosts: ["Cowboy Hat", "Cowboy Shirt", "Cowboy Trouser"] },
      { name: "Winds of Change",   start: Date.UTC(2025,  1,  3), ticket: "Timeshard",           boosts: ["Acorn Hat", "Igloo", "Hammock"] },
      { name: "Great Bloom",       start: Date.UTC(2025,  4,  1), ticket: "Geniseed",            boosts: ["Flower Mask", "Love Charm Shirt", "Heart Air Balloon"] },
      { name: "Better Together",   start: Date.UTC(2025,  7,  4), ticket: "Bracelet",            boosts: ["Garbage Bin Hat", "Raccoon Onesie", "Recycle Shirt"] },
      { name: "Paw Prints",        start: Date.UTC(2025, 10,  3), ticket: "Pet Cookie",          boosts: ["Pet Specialist Hat", "Pet Specialist Pants", "Pet Specialist Shirt"] },
      { name: "Crabs and Traps",   start: Date.UTC(2026,  1,  2), ticket: "Floater",             boosts: ["Fish Hook Hat", "Fish Hook Vest", "Fish Hook Waders"] },
      { name: "Salt Awakening",    start: Date.UTC(2026,  4,  4), ticket: "Salt Rock",           boosts: ["Spa Hat", "Spa Robe", "Spa Slippers"] },
    ];

    // Per-NPC base ticket reward (mirrors TICKET_REWARDS in deliver.ts).
    const TICKET_REWARDS = {
      "pumpkin' pete": 1, "bert": 2, "miranda": 2, "finley": 2, "raven": 3,
      "finn": 4, "timmy": 4, "cornwell": 4, "tywin": 10, "jester": 4, "pharaoh": 5,
    };

    // Collectibles that count as "built" via findCollectible() length > 0.
    // Anything not in this set is treated as a wearable (equipped check).
    const KNOWN_BOOST_COLLECTIBLES = new Set(["Igloo", "Hammock", "Heart Air Balloon"]);

    // ── flowers.html 8749-8785: dashGetCurrentChapter/SeasonalTicket/HasVipAccess/_dashHasWearable ──
    function dashGetCurrentChapter(now) {
      now = now || Date.now();
      let active = CHAPTERS[0];
      for (const c of CHAPTERS) {
        if (c.start <= now) active = c;
      }
      return active;
    }

    function dashGetSeasonalTicket(farm) {
      return dashGetCurrentChapter(Date.now()).ticket;
    }

    function dashHasVipAccess(farm, now) {
      now = now || Date.now();
      if (Number(getCount(farm.inventory || {}, "Lifetime Farmer Banner")) > 0) return true;
      const vip = farm.vip || {};
      const TRIAL_MS = 7 * 24 * 3600 * 1000;
      const trialAt = toMs(vip.trialStartedAt || 0);
      if (trialAt && trialAt > now - TRIAL_MS) return true;
      const expiresAt = toMs(vip.expiresAt || 0);
      if (expiresAt && expiresAt > now) return true;
      return false;
    }

    function _dashHasWearable(farm, name) {
      const equipped = Object.values(farm.bumpkin?.equipped || {});
      if (equipped.includes(name)) return true;
      const hands = farm.farmHands?.bumpkins || {};
      for (const h of Object.values(hands)) {
        if (Object.values(h.equipped || {}).includes(name)) return true;
      }
      return false;
    }

    // Returns the total ticket reward for a delivery from `npc` on this farm,
    // including VIP +2 and chapter boost items (+1 each, up to +3).

    // ── flowers.html 8787-8802: dashCalculateDeliveryTickets ──
    function dashCalculateDeliveryTickets(npc, farm, now) {
      const base = TICKET_REWARDS[npc];
      if (!base) return 0;
      now = now || Date.now();
      let amount = base;
      if (dashHasVipAccess(farm, now)) amount += 2;
      const chapter = dashGetCurrentChapter(now);
      for (const item of chapter.boosts) {
        if (KNOWN_BOOST_COLLECTIBLES.has(item)) {
          if (findCollectible(farm, item).length > 0) amount += 1;
        } else {
          if (_dashHasWearable(farm, item)) amount += 1;
        }
      }
      return amount;
    }

    // ── flowers.html 16278-16291: KEY_CHEST + roadmapKeyValue ──
    const KEY_CHEST = {
      "Treasure Key": { gems: 2, coins: 3000, sunstone: 0, misc: 0.3 },
      "Rare Key": { gems: 6, coins: 6000, sunstone: 0.05, misc: 0.6 },
      "Luxury Key": { gems: 16, coins: 9000, sunstone: 0.1, misc: 1.2 },
    };
    function roadmapKeyValue(name) {
      const c = KEY_CHEST[name]; if (!c) return 0;
      const powerState = _getPowerContext(); // deviation 1
      const er = powerState.exchangeRates || {}, p2p = powerState.p2pPrices || {};
      const coinsFree = (parseFloat(powerState.farm && powerState.farm.coins) || 0) > 10000;
      const gemSfl = er.gemsPerSFL > 0 ? c.gems / er.gemsPerSFL : 0;
      const coinSfl = coinsFree ? 0 : (er.coinsPerSFL > 0 ? c.coins / er.coinsPerSFL : 0);
      const sunSfl = (c.sunstone || 0) * 3 * (p2p["Obsidian"] || 0);
      return gemSfl + coinSfl + sunSfl + (c.misc || 0);
    }

    // ── flowers.html 16296-16324: roadmapItemCost + roadmapGiftRewardValue ──
    function roadmapItemCost(name) {
      if (name === "coins") return 0;
      const powerState = _getPowerContext(); // deviation 1
      const p2p = powerState.p2pPrices || {};
      // F2-2f: roadmap reads the shared price map (/api/compute?section=prices), priced with the
      // exchangeRates profile, instead of calling _resolveItemSfl/estimateItemSfl directly.
      // Precedence preserved verbatim (C6): production cost first (if >0), else market value (if
      // >0), else raw p2p. PRICES(...) is null until this profile's fetch resolves; guard to {} so
      // lookups fall through to the existing "|| 0" absence handling below, and the arrival
      // rerender (via main()) repaints with real data once the map lands.
      const maps = _itemCostMaps || {}; // deviation 2: served price maps, not the client cache
      const prodMap = maps.productionCost || {}, mktMap = maps.marketValue || {};
      if (prodMap[name] > 0) return prodMap[name];
      if (mktMap[name] > 0) return mktMap[name];
      return p2p[name] || 0;
    }
    function roadmapGiftRewardValue(reward, nftFloor) {
      const powerState = _getPowerContext(); // deviation 1
      const { p2pPrices, exchangeRates } = powerState;
      const coinsFree = (parseFloat(powerState.farm && powerState.farm.coins) || 0) > 10000;
      let v = 0;
      if (reward.coins && !coinsFree && exchangeRates.coinsPerSFL > 0) v += reward.coins / exchangeRates.coinsPerSFL;
      for (const [item, qty] of Object.entries(reward.items || {})) v += (KEY_CHEST[item] ? roadmapKeyValue(item) : (p2pPrices[item] || roadmapItemCost(item) || nftFloor(item) || 0)) * qty;
      for (const [w, qty] of Object.entries(reward.wearables || {})) v += (nftFloor(w) || 0) * qty;
      return v;
    }
    function roadmapGiftRewardLabel(reward) {
      const parts = [];
      for (const [i, q] of Object.entries(reward.items || {})) parts.push(q + "\u00d7 " + i);
      if (reward.coins) parts.push(reward.coins.toLocaleString() + " coins");
      for (const [w, q] of Object.entries(reward.wearables || {})) parts.push(q + "\u00d7 " + w);

      return parts.join(", ") || "\u2014";
    }

export {
  BUMPKIN_FLOWER_BONUSES, DEFAULT_FLOWER_POINTS, BUMPKIN_GIFTS_DATA,
  getFlowerGiftPoints, getFlowerChainHours,
  CHAPTERS, TICKET_REWARDS, dashGetCurrentChapter, dashHasVipAccess,
  dashCalculateDeliveryTickets, KEY_CHEST, roadmapKeyValue,
  roadmapItemCost, roadmapGiftRewardValue,
};
