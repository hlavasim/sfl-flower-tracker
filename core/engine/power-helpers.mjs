// Power-page helper subsystem — extracted VERBATIM from flowers.html (line ranges marked
// inline) for core/sections/power.mjs. Tables already migrated elsewhere in core are
// IMPORTED, not re-duplicated (TOOL_COSTS, CRAFTED_INGREDIENT_RECIPES, cooking data);
// tables new to core are duplicated here and the inline copies stay until their other
// consumers migrate (same policy as power-boosts.mjs). DOM-free.
//
// Three deliberate deviations from the page (each required to be global-free):
//   1. applyBoosts gains an optional 5th param `farm` replacing the page's read of the
//      global `powerState.farm` (per-node resource engine). Omitted → the plain
//      n × cycles × output path, which is exactly the page's behaviour DURING
//      buildPowerState (powerState is still null at that point).
//   2. miningToolsPerDay gains optional `farm` + `effects` params replacing its reads of
//      `powerState.farm` and `roadmapOwnedEffects(catId)`. Omitted → capacity fallback and
//      base respawn cycle — again the page's during-build behaviour (its try/catch around
//      roadmapOwnedEffects throws on powerState=null and falls back the same way).
//   3. calcToolCostPerDay forwards those two through as optional trailing params.
import {
  parseBoostEffects, classifyToCategories,
  CROP_GROW_DATA, FRUIT_GROW_DATA, GREENHOUSE_GROW_DATA,
  SKILL_FEED_EFFECTS, PRODUCT_TO_CATEGORY,
} from "./power-boosts.mjs";
import { TOOL_COSTS } from "../data/economy.mjs";
import { CRAFTED_INGREDIENT_RECIPES } from "../data/crafting.mjs";
import { COOKING_RECIPES_DATA } from "../data/cooking.mjs";
import { RECIPE_INGREDIENTS } from "../data/recipes.mjs";
import { detectCookingBoosts, computeFoodXP } from "./cooking.mjs";

    // ── flowers.html 2842-2850: SEED_DATA ──
    const SEED_DATA = {
      "Sunpetal Seed":   { baseSeconds: 86400,  color: "#FFD700", label: "Sunpetal", season: null },
      "Bloom Seed":      { baseSeconds: 172800, color: "#FF69B4", label: "Bloom", season: null },
      "Edelweiss Seed":  { baseSeconds: 259200, color: "#87CEEB", label: "Edelweiss", season: "Winter" },
      "Gladiolus Seed":  { baseSeconds: 259200, color: "#FF6347", label: "Gladiolus", season: "Summer" },
      "Lavender Seed":   { baseSeconds: 259200, color: "#C8A2C8", label: "Lavender", season: "Spring" },
      "Clover Seed":     { baseSeconds: 259200, color: "#2ECC71", label: "Clover", season: "Autumn" },
      "Lily Seed":       { baseSeconds: 432000, color: "#B07CD8", label: "Lily", season: null },
    };

    // ── flowers.html 2866-2871: findCollectible ──
    function findCollectible(farm, name) {
      // Collectibles can be on main island or home island
      const main = farm.collectibles?.[name] || [];
      const home = farm.home?.collectibles?.[name] || [];
      return [...main, ...home];
    }

    // ── flowers.html 3491-3532: BUMPKIN_XP_TABLE ──
    const BUMPKIN_XP_TABLE = [
      // Lvl 1-10
      0, 2, 22, 205, 555, 1155, 2155, 3405, 5405, 7905,
      // Lvl 11-20
      10905, 14405, 18405, 22905, 27905, 33655, 40155, 47405, 55405, 64155,
      // Lvl 21-30
      73905, 84655, 96405, 109155, 122905, 137405, 152905, 169405, 186905, 205405,
      // Lvl 31-40
      225405, 246905, 269905, 294405, 320405, 348405, 378405, 410405, 444405, 480405,
      // Lvl 41-50
      518905, 559905, 603405, 649405, 697905, 749405, 803905, 861405, 921905, 985405,
      // Lvl 51-60
      1053905, 1127405, 1205905, 1289405, 1377905, 1476405, 1584905, 1703405, 1831905, 1970405,
      // Lvl 61-70
      2128905, 2287405, 2485905, 2704405, 2942905, 3221405, 3539905, 3898405, 4296905, 4735405,
      // Lvl 71-80
      5233905, 5743905, 6263905, 6793905, 7333905, 7883905, 8443905, 9013905, 9593905, 10183905,
      // Lvl 81-90
      10783905, 11393905, 12013905, 12643905, 13283905, 13933905, 14593905, 15263905, 15943905, 16633905,
      // Lvl 91-100
      17333905, 18043905, 18763905, 19493905, 20233905, 20983905, 21743905, 22513905, 23293905, 24083905,
      // Lvl 101-110
      24893905, 25723905, 26573905, 27443905, 28333905, 29243905, 30173905, 31123905, 32093905, 33083905,
      // Lvl 111-120
      34093905, 35123905, 36173905, 37243905, 38333905, 39443905, 40573905, 41723905, 42893905, 44083905,
      // Lvl 121-130
      45293905, 46523905, 47773905, 49043905, 50333905, 51653905, 53003905, 54383905, 55793905, 57233905,
      // Lvl 131-140
      58708905, 60218905, 61763905, 63343905, 64958905, 66613905, 68308905, 70043905, 71818905, 73633905,
      // Lvl 141-150
      75493905, 77398905, 79348905, 81343905, 83383905, 85473905, 87613905, 89803905, 92043905, 94333905,
      // Lvl 151-160
      95662605, 97031166, 98440783, 99892688, 101388150, 102928475, 104515009, 106149139, 107832292, 109565939,
      // Lvl 161-170
      111351595, 113190820, 115085221, 117036454, 119046223, 121116285, 123248448, 125444575, 127706585, 130036455,
      // Lvl 171-180
      132436221, 134907979, 137453889, 140076176, 142777131, 145559114, 148424556, 151375961, 154415908, 157547053,
      // Lvl 181-190
      160772132, 164093963, 167515448, 171039577, 174669429, 178408176, 182259085, 186225521, 190310950, 194518941,
      // Lvl 191-200
      198853171, 203317427, 207915610, 212651738, 217529949, 222554506, 227729799, 233060350, 238550817, 244206000,
    ];

    // ── flowers.html 3754-3761: ANIMAL_CYCLE_DATA + ANIMAL_CAT_MAP + isAnimalCat + getAnimalData ──
    const ANIMAL_CYCLE_DATA = {
      "Chicken": { cycleSec: 24 * 3600, products: ["Egg", "Feather"], farmKey: "chickens" },
      "Cow":     { cycleSec: 24 * 3600, products: ["Milk", "Leather"], farmKey: "cows" },
      "Sheep":   { cycleSec: 24 * 3600, products: ["Wool", "Merino Wool"], farmKey: "sheep" },
    };
    const ANIMAL_CAT_MAP = { chickens: "Chicken", cows: "Cow", sheep: "Sheep" };
    function isAnimalCat(catId) { return catId in ANIMAL_CAT_MAP; }
    function getAnimalData(catId) { return ANIMAL_CYCLE_DATA[ANIMAL_CAT_MAP[catId]]; }

    // ── flowers.html 3765-3769: ANIMAL_LEVELS ──
    const ANIMAL_LEVELS = {
      Chicken: [0,60,120,240,360,480,660,840,1020,1200,1440,1680,1920,2160,2400,2720],
      Cow:     [0,180,360,720,1080,1440,1980,2520,3060,3600,4320,5040,5760,6480,7200,8160],
      Sheep:   [0,120,240,480,720,960,1320,1680,2040,2400,2880,3360,3840,4320,4800,5440],
    };

    // ── flowers.html 3793-3793: GOLDEN_ANIMALS ──
    const GOLDEN_ANIMALS = { "Gold Egg": "Chicken", "Golden Cow": "Cow", "Golden Sheep": "Sheep" };

    // ── flowers.html 3842-3849: getAnimalLevel ──
    function getAnimalLevel(animalType, experience) {
      const thresholds = ANIMAL_LEVELS[animalType];
      if (!thresholds) return 0;
      for (let i = thresholds.length - 1; i >= 0; i--) {
        if (experience >= thresholds[i]) return i;
      }
      return 0;
    }

    // ── flowers.html 3872-3880: RESOURCE_RESPAWN_DATA ──
    const RESOURCE_RESPAWN_DATA = {
      "Stone":     { respawnSec: 14400, yield: 2.2, farmKey: "stones" },  // base 2 + Native (20%×1=+0.2)
      "Iron":      { respawnSec: 28800, yield: 1.2, farmKey: "iron" },    // base 1 + Native (20%×1=+0.2)
      "Gold":      { respawnSec: 86400, yield: 1.2, farmKey: "gold" },    // base 1 + Native (20%×1=+0.2)
      "Crimstone": { respawnSec: 86400, yield: 1.4, farmKey: "crimstones" }, // native +2 every 5th dig = +0.4 avg
      "Wood":      { respawnSec: 7200,  yield: 3, farmKey: "trees" },
      "Obsidian":  { respawnSec: 259200, yield: 1, farmKey: "lavaPits" }, // 3 days
      "Oil":       { respawnSec: 72000, yield: 16.67, farmKey: "oilReserves" }, // 20h, avg yield (10+10+30)/3
    };

    // ── flowers.html 4293-4296: TOOL_TO_CAT ──
    const TOOL_TO_CAT = {
      "Axe": "trees", "Pickaxe": "stone", "Stone Pickaxe": "iron",
      "Iron Pickaxe": "gold", "Gold Pickaxe": "crimstone", "Oil Drill": "oil",
    };

    // ── flowers.html 4302-4319: BASE_STOCK ──
    const BASE_STOCK = {
      "Sunflower Seed": 800, "Potato Seed": 400, "Rhubarb Seed": 400,
      "Pumpkin Seed": 300, "Zucchini Seed": 400,
      "Carrot Seed": 200, "Yam Seed": 180, "Cabbage Seed": 180,
      "Broccoli Seed": 180, "Soybean Seed": 200, "Beetroot Seed": 120,
      "Pepper Seed": 150, "Cauliflower Seed": 100, "Parsnip Seed": 80,
      "Eggplant Seed": 100, "Corn Seed": 100, "Onion Seed": 80,
      "Radish Seed": 60, "Wheat Seed": 80, "Turnip Seed": 80,
      "Kale Seed": 60, "Artichoke Seed": 60, "Barley Seed": 60,
      // Fruits
      "Tomato Seed": 40, "Blueberry Seed": 20, "Orange Seed": 15,
      "Apple Seed": 15, "Banana Seed": 15, "Lemon Seed": 20,
      // Greenhouse
      "Grape Seed": 10, "Rice Seed": 10, "Olive Seed": 10,
      // Tools
      "Axe": 200, "Pickaxe": 60, "Stone Pickaxe": 20,
      "Iron Pickaxe": 5, "Gold Pickaxe": 5, "Oil Drill": 5,
    };

    // ── flowers.html 4322-4489: SKILL_TREE_DATA ──
    const SKILL_TREE_DATA = {
      // ── Crops ──
      "Green Thumb":        { tree: "Crops", points: 1, tier: 1, buff: "-5% Crop Growth Time", debuff: null },
      "Young Farmer":       { tree: "Crops", points: 1, tier: 1, buff: "+0.1 Basic Crop yield", debuff: null },
      "Experienced Farmer": { tree: "Crops", points: 1, tier: 1, buff: "+0.1 Medium Crop yield", debuff: null },
      "Old Farmer":         { tree: "Crops", points: 1, tier: 1, buff: "+0.1 Advanced Crop yield", debuff: null },
      "Chonky Scarecrow":   { tree: "Crops", points: 1, tier: 1, buff: "+0.1 Basic Crop yield", debuff: null },
      "Betty's Friend":     { tree: "Crops", points: 1, tier: 1, buff: "+30% Betty Coin delivery revenue", debuff: null },
      "Strong Roots":       { tree: "Crops", points: 2, tier: 2, buff: "-10% Advanced Crop Growth Time", debuff: null },
      "Coin Swindler":      { tree: "Crops", points: 2, tier: 2, buff: "+10% coins selling crops at Market", debuff: null },
      "Golden Sunflower":   { tree: "Crops", points: 2, tier: 2, buff: "1/700 chance +0.35 Gold harvesting Sunflower", debuff: null },
      "Horror Mike":        { tree: "Crops", points: 2, tier: 2, buff: "+0.1 Medium Crop yield", debuff: null },
      "Laurie's Gains":     { tree: "Crops", points: 2, tier: 2, buff: "+0.1 Advanced Crop yield", debuff: null },
      "Instant Growth":     { tree: "Crops", points: 3, tier: 3, buff: "Instantly harvest all growing crops", debuff: null, power: true },
      "Acre Farm":          { tree: "Crops", points: 3, tier: 3, buff: "+1 Advanced Crop yield", debuff: "-0.5 Basic and Medium Crop yield" },
      "Hectare Farm":       { tree: "Crops", points: 3, tier: 3, buff: "+1 Basic and Medium Crop yield", debuff: "-0.5 Advanced Crop yield" },
      // ── Fruit Patch ──
      "Fruitful Fumble":    { tree: "Fruit Patch", points: 1, tier: 1, buff: "+0.1 Fruit yield", debuff: null },
      "Fruity Heaven":      { tree: "Fruit Patch", points: 1, tier: 1, buff: "-10% Fruit seeds cost", debuff: null },
      "Fruity Profit":      { tree: "Fruit Patch", points: 1, tier: 1, buff: "+50% coins from Tango deliveries", debuff: null },
      "Loyal Macaw":        { tree: "Fruit Patch", points: 1, tier: 1, buff: "Double Macaw effect", debuff: null },
      "No Axe No Worries":  { tree: "Fruit Patch", points: 1, tier: 1, buff: "Chop fruit without axes", debuff: "-1 Wood from fruit" },
      "Catchup":            { tree: "Fruit Patch", points: 2, tier: 2, buff: "-10% Fruit Growth Time", debuff: null },
      "Fruity Woody":       { tree: "Fruit Patch", points: 2, tier: 2, buff: "+1 Wood from fruit branches", debuff: null },
      "Pear Turbocharge":   { tree: "Fruit Patch", points: 2, tier: 2, buff: "Double Immortal Pear effect", debuff: null },
      "Crime Fruit":        { tree: "Fruit Patch", points: 2, tier: 2, buff: "+10 Tomato and Lemon seed stock", debuff: null },
      "Generous Orchard":   { tree: "Fruit Patch", points: 3, tier: 3, buff: "20% chance +1 Fruit yield", debuff: null },
      "Long Pickings":      { tree: "Fruit Patch", points: 3, tier: 3, buff: "-50% Apple and Banana Growth Time", debuff: "+100% Growth Time other fruits" },
      "Short Pickings":     { tree: "Fruit Patch", points: 3, tier: 3, buff: "-50% Blueberry and Orange Growth Time", debuff: "+100% Growth Time other fruits" },
      "Zesty Vibes":        { tree: "Fruit Patch", points: 3, tier: 3, buff: "+1 Tomato and Lemon yield", debuff: "-0.25 yield other fruits" },
      // ── Trees ──
      "Lumberjack's Extra": { tree: "Trees", points: 1, tier: 1, buff: "+0.1 Wood yield", debuff: null },
      "Tree Charge":        { tree: "Trees", points: 1, tier: 1, buff: "-10% Tree Recovery Time", debuff: null },
      "More Axes":          { tree: "Trees", points: 1, tier: 1, buff: "+50 axe stock", debuff: null },
      "Insta-Chop":         { tree: "Trees", points: 1, tier: 1, buff: "1 Tap Trees", debuff: null },
      "Tough Tree":         { tree: "Trees", points: 2, tier: 2, buff: "10% chance x3 Wood yield", debuff: null },
      "Feller's Discount":  { tree: "Trees", points: 2, tier: 2, buff: "-20% axe cost", debuff: null },
      "Money Tree":         { tree: "Trees", points: 2, tier: 2, buff: "1% chance +200 Coins chopping trees", debuff: null },
      "Tree Turnaround":    { tree: "Trees", points: 3, tier: 3, buff: "15% chance trees grow instantly", debuff: null },
      "Tree Blitz":         { tree: "Trees", points: 3, tier: 3, buff: "Instantly grow all trees", debuff: null, power: true },
      // ── Mining ──
      "Rock'N'Roll":        { tree: "Mining", points: 1, tier: 1, buff: "+0.1 Stone Yield", debuff: null },
      "Iron Bumpkin":       { tree: "Mining", points: 1, tier: 1, buff: "+0.1 Iron Yield", debuff: null },
      "Speed Miner":        { tree: "Mining", points: 1, tier: 1, buff: "-20% Stone Recovery Time", debuff: null },
      "Tap Prospector":     { tree: "Mining", points: 1, tier: 1, buff: "1 tap mineral nodes", debuff: null },
      "Forge-Ward Profits": { tree: "Mining", points: 1, tier: 1, buff: "+20% Blacksmith delivery revenue", debuff: null },
      "Iron Hustle":        { tree: "Mining", points: 2, tier: 2, buff: "-30% Iron Recovery Time", debuff: null },
      "Frugal Miner":       { tree: "Mining", points: 2, tier: 2, buff: "-20% pickaxe cost", debuff: null },
      "Rocky Favor":        { tree: "Mining", points: 2, tier: 2, buff: "+1 Stone yield", debuff: "-0.5 Iron yield" },
      "Fire Kissed":        { tree: "Mining", points: 2, tier: 2, buff: "+1 Crimstone on 5th consecutive mine", debuff: null },
      "Midas Sprint":       { tree: "Mining", points: 2, tier: 2, buff: "-10% Gold Recovery Time", debuff: null },
      "Ferrous Favor":      { tree: "Mining", points: 3, tier: 3, buff: "+1 Iron yield", debuff: "-0.5 Stone yield" },
      "Golden Touch":       { tree: "Mining", points: 3, tier: 3, buff: "+0.5 Gold Yield", debuff: null },
      "More Picks":         { tree: "Mining", points: 3, tier: 3, buff: "Increased pickaxe stock", debuff: null },
      "Fireside Alchemist": { tree: "Mining", points: 3, tier: 3, buff: "-15% Crimstone Recovery Time", debuff: null },
      "Midas Rush":         { tree: "Mining", points: 3, tier: 3, buff: "-20% Gold Recovery Time", debuff: null },
      // ── Fishing ──
      "Fisherman's 5 Fold": { tree: "Fishing", points: 1, tier: 1, buff: "+5 daily fishing limit", debuff: null },
      "Fishy Chance":       { tree: "Fishing", points: 1, tier: 1, buff: "10% chance +1 basic fish", debuff: null },
      "Fishy Roll":         { tree: "Fishing", points: 1, tier: 1, buff: "10% chance +1 advanced fish", debuff: null },
      "Reel Deal":          { tree: "Fishing", points: 1, tier: 1, buff: "-50% rod cost", debuff: null },
      "Fisherman's 10 Fold":{ tree: "Fishing", points: 2, tier: 2, buff: "+10 daily fishing limit", debuff: null },
      "Fishy Fortune":      { tree: "Fishing", points: 2, tier: 2, buff: "+100% coins from Corale deliveries", debuff: null },
      "Fishy Gamble":       { tree: "Fishing", points: 2, tier: 2, buff: "20% chance +1 expert fish", debuff: null },
      "Frenzied Fish":      { tree: "Fishing", points: 3, tier: 3, buff: "Fish frenzy: +1 fish, 50% chance +1", debuff: null },
      "More With Less":     { tree: "Fishing", points: 3, tier: 3, buff: "+15 daily fishing limit", debuff: "-1 worm from composters" },
      "Fishy Feast":        { tree: "Fishing", points: 3, tier: 3, buff: "+20% Fish XP", debuff: null },
      // ── Animals ──
      "Efficient Feeding":  { tree: "Animals", points: 1, tier: 1, buff: "-5% feed for all animals", debuff: null },
      "Restless Animals":   { tree: "Animals", points: 1, tier: 1, buff: "-10% Animal sleep time", debuff: null },
      "Fine Fibers":        { tree: "Animals", points: 1, tier: 1, buff: "+0.1 Feather, Leather, Merino Wool yield", debuff: null },
      "Bountiful Bounties": { tree: "Animals", points: 1, tier: 1, buff: "+50% Coins from Animal Bounties", debuff: null },
      "Double Bale":        { tree: "Animals", points: 1, tier: 1, buff: "Double Bale effect", debuff: null },
      "Bale Economy":       { tree: "Animals", points: 1, tier: 1, buff: "Bale affects milk and wool production", debuff: null },
      "Featherweight":      { tree: "Animals", points: 1, tier: 1, buff: "+0.25 Feather yield", debuff: "-0.35 Leather & Merino Wool yield" },
      "Abundant Harvest":   { tree: "Animals", points: 2, tier: 2, buff: "+0.2 Egg, Wool and Milk yield", debuff: null },
      "Heartwarming Instruments": { tree: "Animals", points: 2, tier: 2, buff: "+50% Animal XP from tools", debuff: null },
      "Kale Mix":           { tree: "Animals", points: 2, tier: 2, buff: "Mixed Grain requires 3 Kale instead", debuff: null },
      "Alternate Medicine": { tree: "Animals", points: 2, tier: 2, buff: "Barn Delight requires -1 Lemon and Honey", debuff: null },
      "Healthy Livestock":  { tree: "Animals", points: 2, tier: 2, buff: "-50% chance of sickness", debuff: null },
      "Merino Whisperer":   { tree: "Animals", points: 2, tier: 2, buff: "+0.25 Merino Wool yield", debuff: "-0.35 Leather & Feather yield" },
      "Clucky Grazing":     { tree: "Animals", points: 3, tier: 3, buff: "-25% feed for Chickens", debuff: "+50% feed other animals" },
      "Sheepwise Diet":     { tree: "Animals", points: 3, tier: 3, buff: "-25% feed for Sheep", debuff: "+50% feed other animals" },
      "Cow-Smart Nutrition":{ tree: "Animals", points: 3, tier: 3, buff: "-25% feed for Cows", debuff: "+50% feed other animals" },
      "Chonky Feed":        { tree: "Animals", points: 3, tier: 3, buff: "2x animal XP from feed", debuff: "+50% feed all animals" },
      "Leathercraft Mastery":{ tree: "Animals", points: 3, tier: 3, buff: "+0.25 Leather yield", debuff: "-0.35 Feather & Merino Wool yield" },
      "Barnyard Rouse":     { tree: "Animals", points: 3, tier: 3, buff: "Instantly wake all animals", debuff: null, power: true },
      // ── Bees & Flowers ──
      "Sweet Bonus":        { tree: "Bees & Flowers", points: 1, tier: 1, buff: "+0.1 Honey per hive", debuff: null },
      "Hyper Bees":         { tree: "Bees & Flowers", points: 1, tier: 1, buff: "+0.1 Honey production speed", debuff: null },
      "Blooming Boost":     { tree: "Bees & Flowers", points: 1, tier: 1, buff: "-10% Flower Growth Time", debuff: null },
      "Flower Sale":        { tree: "Bees & Flowers", points: 1, tier: 1, buff: "-20% Flower Seeds cost", debuff: null },
      "Buzzworthy Treats":  { tree: "Bees & Flowers", points: 2, tier: 2, buff: "+10% XP on food with Honey", debuff: null },
      "Blossom Bonding":    { tree: "Bees & Flowers", points: 2, tier: 2, buff: "+2 relationship points gifting flowers", debuff: null },
      "Pollen Power Up":    { tree: "Bees & Flowers", points: 2, tier: 2, buff: "+0.1 Crop yield after pollination", debuff: null },
      "Petalled Perk":      { tree: "Bees & Flowers", points: 2, tier: 2, buff: "10% chance +1 Flower", debuff: null },
      "Bee Collective":     { tree: "Bees & Flowers", points: 3, tier: 3, buff: "+20% Bee Swarm chance", debuff: null },
      "Flower Power":       { tree: "Bees & Flowers", points: 3, tier: 3, buff: "-20% Flower Growth Time", debuff: null },
      "Flowery Abode":      { tree: "Bees & Flowers", points: 3, tier: 3, buff: "+0.5 Honey production speed", debuff: "+50% Flower Growth Time" },
      "Petal Blessed":      { tree: "Bees & Flowers", points: 3, tier: 3, buff: "Instantly harvest all flowers", debuff: null, power: true },
      // ── Cooking ──
      "Fast Feasts":        { tree: "Cooking", points: 1, tier: 1, buff: "-10% Firepit and Kitchen cook time", debuff: null },
      "Nom Nom":            { tree: "Cooking", points: 1, tier: 1, buff: "+10% Food delivery revenue", debuff: null },
      "Munching Mastery":   { tree: "Cooking", points: 1, tier: 1, buff: "+5% XP from eating meals", debuff: null },
      "Swift Sizzle":       { tree: "Cooking", points: 1, tier: 1, buff: "-40% Fire Pit cook time with oil", debuff: null },
      "Frosted Cakes":      { tree: "Cooking", points: 2, tier: 2, buff: "-10% Cakes cook time", debuff: null },
      "Juicy Boost":        { tree: "Cooking", points: 2, tier: 2, buff: "+10% XP Smoothie Shack drinks", debuff: null },
      "Turbo Fry":          { tree: "Cooking", points: 2, tier: 2, buff: "-50% Kitchen cook time with oil", debuff: null },
      "Drive-Through Deli": { tree: "Cooking", points: 2, tier: 2, buff: "+15% XP Deli meals", debuff: null },
      "Instant Gratification":{ tree: "Cooking", points: 3, tier: 3, buff: "Instantly finish all cooking", debuff: null, power: true },
      "Double Nom":         { tree: "Cooking", points: 3, tier: 3, buff: "+1 food from cooking", debuff: "2x ingredients required" },
      "Fiery Jackpot":      { tree: "Cooking", points: 3, tier: 3, buff: "20% chance +1 food from Firepit", debuff: null },
      "Fry Frenzy":         { tree: "Cooking", points: 3, tier: 3, buff: "-60% Deli cook time with oil", debuff: null },
      // ── Greenhouse ──
      "Glass Room":         { tree: "Greenhouse", points: 1, tier: 1, buff: "+0.1 Greenhouse yield", debuff: null },
      "Seedy Business":     { tree: "Greenhouse", points: 1, tier: 1, buff: "-15% Greenhouse seeds cost", debuff: null },
      "Rice and Shine":     { tree: "Greenhouse", points: 1, tier: 1, buff: "-5% Greenhouse Growth Time", debuff: null },
      "Victoria's Secretary":{ tree: "Greenhouse", points: 1, tier: 1, buff: "+50% coins Victoria deliveries", debuff: null },
      "Olive Express":      { tree: "Greenhouse", points: 2, tier: 2, buff: "-10% Olive Growth Time", debuff: null },
      "Rice Rocket":        { tree: "Greenhouse", points: 2, tier: 2, buff: "-10% Rice Growth Time", debuff: null },
      "Vine Velocity":      { tree: "Greenhouse", points: 2, tier: 2, buff: "-10% Grape Growth Time", debuff: null },
      "Seeded Bounty":      { tree: "Greenhouse", points: 2, tier: 2, buff: "+0.5 Greenhouse yield", debuff: "+1 seed to plant" },
      "Greenhouse Guru":    { tree: "Greenhouse", points: 3, tier: 3, buff: "Instantly harvest greenhouse", debuff: null, power: true },
      "Greenhouse Gamble":  { tree: "Greenhouse", points: 3, tier: 3, buff: "25% chance +1 greenhouse produce", debuff: null },
      "Slick Saver":        { tree: "Greenhouse", points: 3, tier: 3, buff: "-1 Oil for greenhouse", debuff: null },
      "Greasy Plants":      { tree: "Greenhouse", points: 3, tier: 3, buff: "+1 Greenhouse yield", debuff: "+100% Oil consumption" },
      // ── Machinery ──
      "Crop Extension Module I":  { tree: "Machinery", points: 1, tier: 1, buff: "Rhubarb/Zucchini in crop machine", debuff: null },
      "Crop Processor Unit":      { tree: "Machinery", points: 1, tier: 1, buff: "-5% Crop Machine growth time", debuff: "+10% Oil in Crop Machine" },
      "Oil Gadget":               { tree: "Machinery", points: 1, tier: 1, buff: "-10% Oil in Crop Machine", debuff: null },
      "Oil Extraction":           { tree: "Machinery", points: 1, tier: 1, buff: "+1 Oil from reserves", debuff: null },
      "Leak-Proof Tank":          { tree: "Machinery", points: 1, tier: 1, buff: "3x oil tank in crop machine", debuff: null },
      "Crop Extension Module II": { tree: "Machinery", points: 2, tier: 2, buff: "Carrot/Cabbage in crop machine", debuff: null },
      "Crop Extension Module III":{ tree: "Machinery", points: 2, tier: 2, buff: "Yam/Broccoli in crop machine", debuff: null },
      "Rapid Rig":                { tree: "Machinery", points: 2, tier: 2, buff: "-20% Crop Machine growth time", debuff: "+40% Oil in Crop Machine" },
      "Oil Be Back":              { tree: "Machinery", points: 2, tier: 2, buff: "-20% Oil refill time", debuff: null },
      "Oil Rig":                  { tree: "Machinery", points: 2, tier: 2, buff: "Oil Drill uses Wool instead of Leather", debuff: null },
      "Field Expansion Module":   { tree: "Machinery", points: 3, tier: 3, buff: "+5 packs in machine queue", debuff: null },
      "Field Extension Module":   { tree: "Machinery", points: 3, tier: 3, buff: "+5 plots in machine", debuff: null },
      "Efficiency Extension Module":{ tree: "Machinery", points: 3, tier: 3, buff: "-30% Oil in Crop Machine", debuff: null },
      "Grease Lightning":         { tree: "Machinery", points: 3, tier: 3, buff: "Instantly refill oil wells", debuff: null, power: true },
      // ── Compost ──
      "Efficient Bin":      { tree: "Compost", points: 1, tier: 1, buff: "+5 Sprout Mix", debuff: null },
      "Turbo Charged":      { tree: "Compost", points: 1, tier: 1, buff: "+5 Fruitful Blend", debuff: null },
      "Wormy Treat":        { tree: "Compost", points: 1, tier: 1, buff: "+1 Worm", debuff: null },
      "Feathery Business":  { tree: "Compost", points: 1, tier: 1, buff: "Feathers instead of eggs for compost", debuff: "2x feathers needed" },
      "Sprout Surge":       { tree: "Compost", points: 1, tier: 1, buff: "Sprout Mix on all plots", debuff: null, power: true },
      "Blend-tastic":       { tree: "Compost", points: 1, tier: 1, buff: "Fruitful Blend on all plots", debuff: null, power: true },
      "Premium Worms":      { tree: "Compost", points: 2, tier: 2, buff: "+10 Rapid Root", debuff: null },
      "Fruitful Bounty":    { tree: "Compost", points: 2, tier: 2, buff: "Double Fruitful Blend effect", debuff: null },
      "Swift Decomposer":   { tree: "Compost", points: 2, tier: 2, buff: "-10% compost time", debuff: null },
      "Composting Bonanza":  { tree: "Compost", points: 2, tier: 2, buff: "+1h compost speed when boosting", debuff: "2x resources to boost" },
      "Root Rocket":        { tree: "Compost", points: 2, tier: 2, buff: "Rapid Root on all plots", debuff: null, power: true },
      "Composting Overhaul":{ tree: "Compost", points: 3, tier: 3, buff: "+2 Worms", debuff: "-5 fertilisers" },
      "Composting Revamp":  { tree: "Compost", points: 3, tier: 3, buff: "+5 fertilisers", debuff: "-3 Worms" },
      // -- Aging (Salt) -- from sunflower-land bumpkinSkills.ts (tree "Aging"). Wide/Cheap Rakes buffs verified
      // from the live farm; others are concise (exact strings live behind i18n keys; salt income is minor).
      "Wide Rakes":         { tree: "Aging", points: 1, tier: 1, buff: "+2 Salt", debuff: null },
      "Cheap Rakes":        { tree: "Aging", points: 1, tier: 1, buff: "-20% Salt Rake cost", debuff: null },
      "Salty Seas":         { tree: "Aging", points: 1, tier: 1, buff: "Faster Salt recovery", debuff: null },
      "Speedy Aging":       { tree: "Aging", points: 1, tier: 1, buff: "Faster aging in the Aging Shed", debuff: null },
      "Bacalhau":           { tree: "Aging", points: 1, tier: 1, buff: "Unlocks the Bacalhau dish", debuff: null },
      "Fish Smoking":       { tree: "Aging", points: 2, tier: 2, buff: "Smoke fish for a preservation bonus", debuff: null },
      "Refiner":            { tree: "Aging", points: 2, tier: 2, buff: "Salt refining bonus", debuff: null },
      "Sea Blessed":        { tree: "Aging", points: 2, tier: 2, buff: "Bonus Salt", debuff: null },
      "Ager":               { tree: "Aging", points: 3, tier: 3, buff: "Aging Shed bonus", debuff: null },
      "Salt Surge":         { tree: "Aging", points: 3, tier: 3, buff: "Instant Salt surge", debuff: null, power: true },
    };

    // ── flowers.html 4633-4637: CROP_TIERS ──
    const CROP_TIERS = {
      basic:    ["Sunflower", "Potato", "Rhubarb", "Pumpkin", "Zucchini"],
      medium:   ["Carrot", "Yam", "Cabbage", "Broccoli", "Soybean", "Beetroot", "Pepper", "Cauliflower", "Parsnip"],
      advanced: ["Eggplant", "Corn", "Onion", "Radish", "Wheat", "Turnip", "Kale", "Artichoke", "Barley"],
    };

    // ── flowers.html 4695-4720: FACTION_MARK_PRICES + FACTION_KEYWORDS + getFactionMarkCost + marksToSfl ──
    const FACTION_MARK_PRICES = {
      // Wearables (faction variants: Goblin/Bumpkin/Sunflorian/Nightshade)
      "Crown": 210000,     // + requires Helmet (burned)
      "Shield": 240000,
      "Quiver": 240000,
      "Medallion": 240000,
      "Armor": 112500,
      "Helmet": 56250,
      "Sword": 56250,
      "Axe": 56250,
      "Pants": 37500,
      "Sabatons": 37500,
      // Collectibles
      "Throne": 75000,
    };
    const FACTION_KEYWORDS = ["Goblin", "Bumpkin", "Sunflorian", "Nightshade"];
    function getFactionMarkCost(itemName) {
      for (const [suffix, marks] of Object.entries(FACTION_MARK_PRICES)) {
        if (itemName.endsWith(" " + suffix)) {
          const prefix = itemName.slice(0, -(suffix.length + 1));
          if (FACTION_KEYWORDS.includes(prefix)) return marks;
        }
      }
      return 0;
    }
    function marksToSfl(marks) { return marks / 100; }

    // ── flowers.html 5010-5060: calcSkillPointCost ──
    function calcSkillPointCost(bumpkin, p2pPrices, farm) {
      const xp = bumpkin?.experience || 0;
      const level = getBumpkinLevel(xp);
      if (level <= 1) return { sflPerPoint: 0, bestRecipe: null, level, totalXP: xp };

      const totalXP = BUMPKIN_XP_TABLE[level - 1] || 0;

      // Build effective prices including crafted ingredients
      const prices = { ...p2pPrices };
      for (const [crafted, recipe] of Object.entries(CRAFTED_INGREDIENT_RECIPES)) {
        if (!prices[crafted]) {
          let derivedCost = 0;
          for (const [item, qty] of Object.entries(recipe)) {
            derivedCost += (prices[item] || 0) * qty;
          }
          if (derivedCost > 0) prices[crafted] = derivedCost;
        }
      }

      // Detect cooking boosts to apply XP multipliers
      const cookingBoosts = farm ? detectCookingBoosts(farm) : { xpBoosts: [], timeBoosts: [] };

      // Hardcoded: Pizza Margherita for verification (TODO: restore best-recipe search after verified)
      const recipeName = "Pizza Margherita";
      const ingredients = RECIPE_INGREDIENTS[recipeName];
      const recipeData = COOKING_RECIPES_DATA[recipeName];
      let cost = 0;
      let missingIngredient = false;
      for (const [item, qty] of Object.entries(ingredients)) {
        const price = prices[item] || 0;
        if (price === 0) { missingIngredient = true; break; }
        cost += price * qty;
      }
      if (missingIngredient || cost <= 0) return { sflPerPoint: 0, bestRecipe: null, level, totalXP };

      const boostedXP = computeFoodXP(recipeName, recipeData, recipeData.building, cookingBoosts);
      const bestRatio = boostedXP / cost;
      const bestRecipe = { name: recipeName, xp: recipeData.xp, boostedXP: Math.round(boostedXP), cost, ratio: bestRatio, building: recipeData.building, ingredients };

      if (bestRatio === 0) return { sflPerPoint: 0, bestRecipe: null, level, totalXP };

      // Total SFL to reach current level via most efficient cooking
      const totalSFL = totalXP / bestRatio;
      const sflPerLevel = totalSFL / level;
      // 1 level = 1 skill point
      const xpBoostNames = cookingBoosts.xpBoosts.filter(b =>
        !b.buildings || b.buildings.includes(bestRecipe.building)
      ).map(b => `${b.name} (×${b.multiplier})`);

      return { sflPerPoint: sflPerLevel, bestRecipe, level, totalXP, totalSFL, sflPerLevel, xpBoostNames };
    }

    // ── flowers.html 5063-5087: POWER_CATEGORIES ──
    const POWER_CATEGORIES = {
      // Quantifiable
      crops:      { label: "CROPS",      emoji: "🌾", selector: "crop",       quantifiable: true },
      fruits:     { label: "FRUITS",     emoji: "🍎", selector: "fruit",      quantifiable: true },
      greenhouse: { label: "GREENHOUSE", emoji: "🏠", selector: "greenhouse", quantifiable: true },
      chickens: { label: "CHICKENS", emoji: "🐔", selector: null,   quantifiable: true },
      cows:     { label: "COWS",     emoji: "🐄", selector: null,   quantifiable: true },
      sheep:    { label: "SHEEP",    emoji: "🐑", selector: null,   quantifiable: true },
      flowers:  { label: "FLOWERS",  emoji: "🌸", selector: "flower", quantifiable: true },
      stone:    { label: "STONE",    emoji: "⛏️", selector: null,   quantifiable: true },
      iron:     { label: "IRON",     emoji: "🪨", selector: null,   quantifiable: true },
      gold:      { label: "GOLD",      emoji: "🥇", selector: null,   quantifiable: true },
      crimstone: { label: "CRIMSTONE",emoji: "💎", selector: null,   quantifiable: true },
      obsidian:  { label: "OBSIDIAN", emoji: "🌋", selector: null,   quantifiable: true },
      oil:       { label: "OIL",     emoji: "🛢️", selector: null,   quantifiable: true },
      trees:     { label: "TREES",    emoji: "🌳", selector: null,   quantifiable: true },
      fishing:  { label: "FISHING",  emoji: "🎣", selector: null,   quantifiable: true },
      bees:     { label: "BEES",     emoji: "🐝", selector: null,   quantifiable: true },
      // Qualitative
      pets:       { label: "PETS",          emoji: "🐾", selector: null, quantifiable: false },
      cooking:    { label: "COOKING / XP",  emoji: "🍳", selector: null, quantifiable: false },
      coins:      { label: "COINS / SFL",   emoji: "🪙", selector: null, quantifiable: false },
      protection: { label: "PROTECTION",    emoji: "🛡️", selector: null, quantifiable: false },
      other:      { label: "OTHER",         emoji: "❓", selector: null, quantifiable: false },
    };

    // ── flowers.html 6534-6538: getCount ──
    function getCount(inv, name) {
      const v = inv[name];
      if (v === undefined || v === null) return 0;
      return Math.floor(parseFloat(v));
    }

    // ── flowers.html 6577-6601: getBumpkinLevel + getAllEquippedWearables + isWearableEquipped ──
    function getBumpkinLevel(xp) {
      for (let i = BUMPKIN_XP_TABLE.length - 1; i >= 0; i--) {
        if (xp >= BUMPKIN_XP_TABLE[i]) return i + 1;
      }
      return 1;
    }

    function getAllEquippedWearables(farm) {
      // Main bumpkin + all farm hands (additional bumpkins)
      const all = [];
      if (farm.bumpkin?.equipped) all.push(farm.bumpkin.equipped);
      // Farm hands — try common API field names
      const hands = farm.farmHands?.bumpkins || farm.farmHands || {};
      for (const hand of Object.values(hands)) {
        if (hand?.equipped) all.push(hand.equipped);
      }
      return all;
    }

    function isWearableEquipped(farm, name) {
      for (const equipped of getAllEquippedWearables(farm)) {
        if (Object.values(equipped).flat().includes(name)) return true;
      }
      return false;
    }

    // ── flowers.html 14180-14275: sumMergedNodes + detectFarmCapacity ──
    function sumMergedNodes(resourceObj) {
      if (!resourceObj || typeof resourceObj !== "object") return 0;
      let total = 0;
      for (const node of Object.values(resourceObj)) {
        total += node.multiplier || 1; // unmerged nodes have no multiplier field → count as 1
      }
      return total;
    }

    function detectFarmCapacity(farm) {
      // Collect per-animal details (id, type, experience, level)
      const chickenList = [], cowList = [], sheepList = [];

      // Helper to process animal entries
      function processAnimal(id, a) {
        const t = (a.type || "").toLowerCase();
        const xp = parseFloat(a.experience) || 0;
        if (t === "chicken" || t === "") {
          // henHouse animals don't always have type, default to chicken
        }
        if (t === "cow") {
          cowList.push({ id, level: getAnimalLevel("Cow", xp), experience: xp });
        } else if (t === "sheep") {
          sheepList.push({ id, level: getAnimalLevel("Sheep", xp), experience: xp });
        }
      }

      // Hen House: farm.henHouse.animals OR farm.buildings["Hen House"][].animals
      const henAnimals = farm.henHouse?.animals;
      if (henAnimals && typeof henAnimals === "object") {
        for (const [id, a] of Object.entries(henAnimals)) {
          const xp = parseFloat(a.experience) || 0;
          chickenList.push({ id, level: getAnimalLevel("Chicken", xp), experience: xp });
        }
      }
      if (chickenList.length === 0) {
        const henBuildings = farm.buildings?.["Hen House"] || [];
        for (const b of henBuildings) {
          for (const [id, a] of Object.entries(b.animals || {})) {
            const xp = parseFloat(a.experience) || 0;
            chickenList.push({ id, level: getAnimalLevel("Chicken", xp), experience: xp });
          }
        }
      }

      // Barn: farm.barn.animals OR farm.buildings["Barn"][].animals
      const barnAnimals = farm.barn?.animals;
      if (barnAnimals && typeof barnAnimals === "object") {
        for (const [id, a] of Object.entries(barnAnimals)) {
          processAnimal(id, a);
        }
      }
      if (cowList.length === 0 && sheepList.length === 0) {
        const barnBuildings = farm.buildings?.["Barn"] || [];
        for (const b of barnBuildings) {
          for (const [id, a] of Object.entries(b.animals || {})) {
            processAnimal(id, a);
          }
        }
      }

      const chickens = chickenList.length, cows = cowList.length, sheep = sheepList.length;

      // Detect golden animals (free feeding)
      const inventory = farm.inventory || {};
      const goldenAnimals = {};
      for (const [itemName, animalType] of Object.entries(GOLDEN_ANIMALS)) {
        if (findCollectible(farm, itemName).length > 0 || (parseFloat(inventory[itemName]) || 0) > 0) {
          goldenAnimals[animalType] = true;
        }
      }

      console.log("[Power] Animal detection:", { chickens, cows, sheep, goldenAnimals,
        henHouse: !!farm.henHouse, barn: !!farm.barn,
        chickenLevels: chickenList.map(a => a.level),
        cowLevels: cowList.map(a => a.level),
        sheepLevels: sheepList.map(a => a.level) });

      return {
        crops: Object.keys(farm.crops || {}).length,
        fruitPatches: Object.keys(farm.fruitPatches || {}).length,
        greenhouse: Object.keys(farm.greenhouse?.pots || {}).length,
        chickens, cows, sheep,
        animalDetails: { chickens: chickenList, cows: cowList, sheep: sheepList },
        goldenAnimals,
        bees: Object.keys(farm.beehives || {}).length,
        flowers: Object.keys(farm.flowers?.flowerBeds || {}).length,
        stones: sumMergedNodes(farm.stones),
        iron: sumMergedNodes(farm.iron),
        gold: sumMergedNodes(farm.gold),
        crimstones: sumMergedNodes(farm.crimstones),
        lavaPits: Object.keys(farm.lavaPits || {}).length,
        oilReserves: Object.keys(farm.oilReserves || {}).length,
        trees: sumMergedNodes(farm.trees),
      };
    }

    // ── flowers.html 14345-14498: getCycleSec + getCapacityCount + getDefaultProduct + getBaseYield + applyBoosts ──
    function getCycleSec(catId, product) {
      switch (catId) {
        case "crops": return CROP_GROW_DATA[product] || 43200;
        case "fruits": return FRUIT_GROW_DATA[product] || 43200;
        case "greenhouse": return GREENHOUSE_GROW_DATA[product] || 86400;
        case "chickens": return ANIMAL_CYCLE_DATA["Chicken"].cycleSec;
        case "cows": return ANIMAL_CYCLE_DATA["Cow"].cycleSec;
        case "sheep": return ANIMAL_CYCLE_DATA["Sheep"].cycleSec;
        case "bees": return 86400;
        case "stone": return RESOURCE_RESPAWN_DATA["Stone"].respawnSec;
        case "iron": return RESOURCE_RESPAWN_DATA["Iron"].respawnSec;
        case "gold": return RESOURCE_RESPAWN_DATA["Gold"].respawnSec;
        case "crimstone": return RESOURCE_RESPAWN_DATA["Crimstone"].respawnSec;
        case "obsidian": return RESOURCE_RESPAWN_DATA["Obsidian"].respawnSec;
        case "oil": return RESOURCE_RESPAWN_DATA["Oil"].respawnSec;
        case "trees": return RESOURCE_RESPAWN_DATA["Wood"].respawnSec;
        case "flowers": return SEED_DATA[product]?.baseSeconds || 86400;
        default: return 86400;
      }
    }

    function getCapacityCount(catId, capacity) {
      switch (catId) {
        case "crops": return capacity.crops;
        case "fruits": return capacity.fruitPatches;
        case "greenhouse": return capacity.greenhouse;
        case "chickens": return capacity.chickens;
        case "cows": return capacity.cows;
        case "sheep": return capacity.sheep;
        case "bees": return capacity.bees;
        case "flowers": return capacity.flowers;
        case "stone": return capacity.stones;
        case "iron": return capacity.iron;
        case "gold": return capacity.gold;
        case "crimstone": return capacity.crimstones;
        case "obsidian": return capacity.lavaPits;
        case "oil": return capacity.oilReserves;
        case "trees": return capacity.trees;
        default: return 0;
      }
    }

    function getDefaultProduct(catId) {
      switch (catId) {
        case "crops": return "Kale";
        case "fruits": return "Blueberry";
        case "greenhouse": return "Grape";
        case "chickens": return "Egg";
        case "cows": return "Milk";
        case "sheep": return "Wool";
        case "bees": return "Honey";
        case "stone": return "Stone";
        case "iron": return "Iron";
        case "gold": return "Gold";
        case "crimstone": return "Crimstone";
        case "obsidian": return "Obsidian";
        case "oil": return "Oil";
        case "trees": return "Wood";
        case "flowers": return "Sunpetal Seed";
        case "fishing": return "Fish";
        default: return null;
      }
    }

    function getBaseYield(catId) {
      switch (catId) {
        case "stone": return RESOURCE_RESPAWN_DATA["Stone"].yield;
        case "iron": return RESOURCE_RESPAWN_DATA["Iron"].yield;
        case "gold": return RESOURCE_RESPAWN_DATA["Gold"].yield;
        case "crimstone": return RESOURCE_RESPAWN_DATA["Crimstone"].yield;
        case "obsidian": return RESOURCE_RESPAWN_DATA["Obsidian"].yield;
        case "oil": return RESOURCE_RESPAWN_DATA["Oil"].yield;
        case "trees": return RESOURCE_RESPAWN_DATA["Wood"].yield;
        default: return 1;
      }
    }

    // Apply a set of boost effects to calculate boosted production
    // Returns { unitsPerDay, speedMult, yieldMult, yieldFlat, details }
    // Deviation 1 (see header): `farm` param replaces the page's `powerState.farm` global.
    function applyBoosts(catId, product, capacity, boostEffects, farm) {
      const baseCycleSec = getCycleSec(catId, product);
      const baseYield = getBaseYield(catId);
      const n = getCapacityCount(catId, capacity);
      if (n === 0 && catId !== "fishing") return { unitsPerDay: 0, speedMult: 1, yieldMult: 1, yieldFlat: 0 };

      let speedMult = 1; // multiplied to cycle time (< 1 = faster)
      let yieldMult = 1; // multiplied to output
      let yieldFlat = 0; // added per cycle per slot
      let extraHarvest = 0; // extra fruit harvests per seed (Immortal Pear, etc.)

      for (const eff of boostEffects) {
        // Only apply effects that match this category
        if (eff.cat !== catId) continue;
        // For product-specific boosts, check if product matches
        if (eff.product && PRODUCT_TO_CATEGORY[eff.product] === catId) {
          if (eff.product !== product) continue; // all product-specific boosts must match
        }
        // cropTier filtering: "Basic/Medium/Advanced Crop" boosts only apply to crops in that tier
        if (eff.cropTier && catId === "crops") {
          const tierCrops = CROP_TIERS[eff.cropTier];
          if (tierCrops && !tierCrops.includes(product)) continue;
        }

        switch (eff.type) {
          case "speed_pct":
            speedMult *= (1 + eff.value / 100);
            break;
          case "speed_mult":
            speedMult *= eff.value;
            break;
          case "yield_pct":
            yieldMult *= (1 + eff.value / 100);
            break;
          case "yield_flat":
            yieldFlat += eff.value;
            break;
          case "chance":
            // Expected value: pct% chance of +extra per cycle
            yieldFlat += (eff.pct / 100) * eff.extra;
            break;
          case "extra_harvest":
            extraHarvest += eff.value;
            break;
          case "daily_flat":
            yieldFlat += eff.value; // fishing: unitsPerDay = 20 + yieldFlat (per-day), so this lands per-day
            break;
          case "free_tool":
          case "cost_reduction":
          case "fruit_free_chop":
          case "fruit_stump_wood":
          case "feed_reduction":
            // Handled in cost/value calculations, not production yield
            break;
        }
      }

      const effectiveCycle = baseCycleSec * speedMult;
      const cyclesPerDay = catId === "fishing" ? 1 : (effectiveCycle > 0 ? 86400 / effectiveCycle : 0);
      const outputPerCycle = baseYield * yieldMult + yieldFlat;

      let unitsPerDay;
      if (catId === "fishing") {
        unitsPerDay = 20 + yieldFlat; // flat estimate for fishing
      } else if (catId === "bees") {
        unitsPerDay = n * (baseYield * yieldMult + yieldFlat); // simplified for bees
      } else if (RES_FARMKEY[catId] && farm) {
        // Unify with the faithful per-node engine (correct base + tier flats); cycle stays boosted.
        unitsPerDay = gameResYield(farm, catId, boostEffects) * cyclesPerDay;
      } else {
        unitsPerDay = n * cyclesPerDay * outputPerCycle;
      }

      return { unitsPerDay, speedMult, yieldMult, yieldFlat, effectiveCycle, extraHarvest };
    }

    // ── flowers.html 14641-14682: detectStockModifiers + getEffectiveStock ──
    function detectStockModifiers(farm) {
      const buildings = farm.buildings || {};
      const skills = farm.bumpkin?.skills || {};
      const inventory = farm.inventory || {};
      const hasWarehouse = (buildings["Warehouse"] || []).length > 0;
      const hasToolshed = (buildings["Toolshed"] || []).length > 0;
      const moreAxes = skills["More Axes"] !== undefined;
      const morePicks = skills["More Picks"] !== undefined;
      const fellersDiscount = skills["Feller's Discount"] !== undefined; // -20% axe coin cost
      const frugalMiner = skills["Frugal Miner"] !== undefined;         // -20% pickaxe coin cost
      // Free tool collectibles (zero tool cost for category)
      const hasQuarry = findCollectible(farm, "Quarry").length > 0 || getCount(inventory, "Quarry") > 0;
      const hasForeman = findCollectible(farm, "Foreman Beaver").length > 0 || getCount(inventory, "Foreman Beaver") > 0;
      const oilRigActive = skills["Oil Rig"] !== undefined;
      const hasInfernalDrill = isWearableEquipped(farm, "Infernal Drill");
      // Crimstone Spikes Hair: wearable that lets you mine crimstone without Gold Pickaxes.
      // Counted whether equipped OR just owned in wardrobe — the in-game effect applies once
      // it's part of the bumpkin's outfit, but UI-wise we show the savings regardless so the
      // user can immediately see the value before equipping.
      const hasCrimstoneSpikesHair = isWearableEquipped(farm, "Crimstone Spikes Hair")
        || ((farm.wardrobe || {})["Crimstone Spikes Hair"] || 0) > 0;
      const slickSaver = skills["Slick Saver"] !== undefined; // -1 Oil for greenhouse seeds
      const hasKaleMix = skills["Kale Mix"] !== undefined; // Mixed Grain uses 3 Kale instead
      return { hasWarehouse, hasToolshed, moreAxes, morePicks, fellersDiscount, frugalMiner, hasQuarry, hasForeman, oilRigActive, hasInfernalDrill, hasCrimstoneSpikesHair, slickSaver, hasKaleMix };
    }

    // Get effective stock for a seed/tool
    function getEffectiveStock(seedOrTool, stockMods) {
      let base = BASE_STOCK[seedOrTool] || 0;
      if (base === 0) return 0;
      // Warehouse: +20% seeds
      if (seedOrTool.includes("Seed") && stockMods.hasWarehouse) base = Math.floor(base * 1.2);
      // Toolshed: +50% tools
      if (TOOL_COSTS[seedOrTool] && stockMods.hasToolshed) base = Math.floor(base * 1.5);
      // Skill bonuses
      if (seedOrTool === "Axe" && stockMods.moreAxes) base += 50;
      if (seedOrTool === "Pickaxe" && stockMods.morePicks) base += 70;
      if (seedOrTool === "Stone Pickaxe" && stockMods.morePicks) base += 20;
      if (seedOrTool === "Iron Pickaxe" && stockMods.morePicks) base += 7;
      if (seedOrTool === "Gold Pickaxe" && stockMods.morePicks) base += 2;
      return base;
    }

    // ── flowers.html 14733-14829: miningToolsPerDay + calcToolCostPerDay ──
    // Deviation 2 (see header): `farm`/`effects` params replace the page's `powerState.farm`
    // and `roadmapOwnedEffects(catId)` globals; both optional, omitted = during-build behaviour.
    function miningToolsPerDay(catId, capacity, farm, effects) {
      const fkMap = { trees: "trees", stone: "stones", iron: "iron", gold: "gold", crimstone: "crimstones", oil: "oilReserves" };
      const fk = fkMap[catId];
      const pf = farm || null;
      // Tools eaten per mine = node.multiplier for trees/stone/iron/gold (merged tier-N node eats N tools);
      // crimstone & oil always eat exactly 1 tool per mine regardless of multiplier (game: mineCrimstone/oil).
      const oneToolPerNode = (catId === "crimstone" || catId === "oil");
      let toolNodes;
      if (pf && fk) {
        const ns = Object.values(pf[fk] || {});
        toolNodes = oneToolPerNode ? ns.length : ns.reduce((s, n) => s + ((n && n.multiplier) || 1), 0);
      } else { toolNodes = capacity[fk] || 0; }
      let ec = 0;
      try { ec = applyBoosts(catId, getDefaultProduct(catId), capacity, effects, farm).effectiveCycle || 0; } catch {}
      if (!(ec > 0)) { const rk = { trees:"Wood", stone:"Stone", iron:"Iron", gold:"Gold", crimstone:"Crimstone", oil:"Oil" }[catId]; const d = RESOURCE_RESPAWN_DATA[rk]; ec = d ? d.respawnSec : 0; }
      return ec > 0 ? toolNodes * (86400 / ec) : 0;
    }
    // Deviation 3 (see header): optional trailing farm/effects forwarded to miningToolsPerDay.
    function calcToolCostPerDay(catId, capacity, exchangeRates, p2pPrices, stockMods, skipDiscount, farm, effects) {
      const toolName = Object.keys(TOOL_TO_CAT).find(t => TOOL_TO_CAT[t] === catId);
      if (!toolName) return { costPerDay: 0, toolSfl: 0, restockPerDay: 0 };
      const tool = TOOL_COSTS[toolName];
      if (!tool || exchangeRates.coinsPerSFL <= 0) return { costPerDay: 0, toolSfl: 0, restockPerDay: 0 };

      // Free tool check (Quarry = free stone mining, Foreman Beaver = free tree chopping)
      if (!skipDiscount) {
        if (catId === "stone" && stockMods.hasQuarry) {
          // Still compute toolsPerDay for display but cost = 0
          const rKey = "Stone";
          const d = RESOURCE_RESPAWN_DATA[rKey];
          const n = capacity.stones || 0;
          const toolsPerDay = miningToolsPerDay(catId, capacity, farm, effects);
          return { costPerDay: 0, toolSfl: 0, restockPerDay: 0, toolsPerDay, stock: 0, freeTool: true, freeToolSource: "Quarry" };
        }
        if (catId === "trees" && stockMods.hasForeman) {
          const d = RESOURCE_RESPAWN_DATA["Wood"];
          const n = capacity.trees || 0;
          const toolsPerDay = miningToolsPerDay(catId, capacity, farm, effects);
          return { costPerDay: 0, toolSfl: 0, restockPerDay: 0, toolsPerDay, stock: 0, freeTool: true, freeToolSource: "Foreman Beaver" };
        }
        if (catId === "oil" && stockMods.hasInfernalDrill) {
          const d = RESOURCE_RESPAWN_DATA["Oil"];
          const n = capacity.oilReserves || 0;
          const toolsPerDay = miningToolsPerDay(catId, capacity, farm, effects);
          return { costPerDay: 0, toolSfl: 0, restockPerDay: 0, toolsPerDay, stock: 0, freeTool: true, freeToolSource: "Infernal Drill" };
        }
        if (catId === "crimstone" && stockMods.hasCrimstoneSpikesHair) {
          const d = RESOURCE_RESPAWN_DATA["Crimstone"];
          const n = capacity.crimstones || 0;
          const toolsPerDay = miningToolsPerDay(catId, capacity, farm, effects);
          return { costPerDay: 0, toolSfl: 0, restockPerDay: 0, toolsPerDay, stock: 0, freeTool: true, freeToolSource: "Crimstone Spikes Hair" };
        }
      }

      // Apply coin discounts from skills (unless skipDiscount)
      let coinDiscount = 0;
      let discountSource = "";
      if (!skipDiscount) {
        if (toolName === "Axe" && stockMods.fellersDiscount) {
          coinDiscount = 0.2; discountSource = "Feller's Discount";
        } else if (toolName !== "Axe" && toolName !== "Oil Drill" && stockMods.frugalMiner) {
          coinDiscount = 0.2; discountSource = "Frugal Miner";
        }
      }
      const effectiveCoins = tool.coins * (1 - coinDiscount);

      // Oil Rig skill: Oil Drill uses Wool×20 instead of Leather×10
      let effectiveMaterials = tool.materials;
      if (catId === "oil" && stockMods.oilRigActive && tool.materials) {
        effectiveMaterials = { ...tool.materials };
        delete effectiveMaterials["Leather"];
        effectiveMaterials["Wool"] = 20;
      }

      // Tool cost in SFL = coins (after discount) + material costs
      let toolSfl = effectiveCoins / exchangeRates.coinsPerSFL;
      if (effectiveMaterials) {
        for (const [mat, qty] of Object.entries(effectiveMaterials)) {
          toolSfl += (p2pPrices[mat] || 0) * qty;
        }
      }

      const rKey = catId === "stone" ? "Stone" : catId === "iron" ? "Iron" : catId === "gold" ? "Gold" : catId === "crimstone" ? "Crimstone" : catId === "oil" ? "Oil" : "Wood";
      const d = RESOURCE_RESPAWN_DATA[rKey];
      if (!d) return { costPerDay: 0, toolSfl, restockPerDay: 0 };
      const capKey = catId === "stone" ? "stones" : catId === "crimstone" ? "crimstones" : catId === "oil" ? "oilReserves" : catId;
      const n = capacity[capKey] || 0;
      if (n === 0) return { costPerDay: 0, toolSfl, restockPerDay: 0 };
      const cyclesPerDay = 86400 / d.respawnSec;
      const toolsPerDay = miningToolsPerDay(catId, capacity, farm, effects); // physical rocks x boosted cycle
      const costPerDay = toolSfl * toolsPerDay;

      // Stock info (restock cost calculated separately in shared restock system)
      const stock = getEffectiveStock(toolName, stockMods);
      const daysUntilEmpty = toolsPerDay > 0 ? stock / toolsPerDay : Infinity;

      return { costPerDay, toolSfl, restockPerDay: 0, toolsPerDay, stock, daysUntilEmpty, coinDiscount, discountSource, effectiveCoins, baseCoins: tool.coins };
    }

    // ── flowers.html 15382-15384: getEffectsForCategory ──
    function getEffectsForCategory(boostItem, catId) {
      return boostItem.effects.filter(e => e.cat === catId);
    }

    // ── flowers.html 15759-15770: farmWearableEquipped + FACTION_WINGS + FACTION_SHIELDS + RES_FARMKEY ──
    function farmWearableEquipped(farm, name) {
      const eq = (farm.bumpkin && farm.bumpkin.equipped) || {};
      if (Object.values(eq).indexOf(name) >= 0) return true;
      const hands = (farm.farmHands && farm.farmHands.bumpkins) || {};
      for (const h of Object.values(hands)) {
        if (h && h.equipped && Object.values(h.equipped).indexOf(name) >= 0) return true;
      }
      return false;
    }
    const FACTION_WINGS = { bumpkins: "Bumpkin Quiver", goblins: "Goblin Quiver", nightshades: "Nightshade Quiver", sunflorians: "Sunflorian Quiver" };
    const FACTION_SHIELDS = { bumpkins: "Bumpkin Shield", goblins: "Goblin Shield", nightshades: "Nightshade Shield", sunflorians: "Sunflorian Shield" };
    const RES_FARMKEY = { trees: "trees", stone: "stones", iron: "iron", gold: "gold", crimstone: "crimstones" };

    // ── flowers.html 15778-15811: gameResBoostedBase + gameResYield ──
    function gameResBoostedBase(farm, cat, effects) {
      const has = (n) => findCollectible(farm, n).length > 0;
      const faction = (farm.faction && farm.faction.name) || "";
      const shieldEq = FACTION_SHIELDS[faction] && farmWearableEquipped(farm, FACTION_SHIELDS[faction]);
      let mult = 1, add = 0;
      const skills = (farm.bumpkin && farm.bumpkin.skills) || {};
      if (cat === "crimstone") add += 0.4; // crimstone: +2 every 5th dig ~= +0.4 avg streak (its base bonus)
      else if (cat === "trees" || cat === "stone" || cat === "iron" || cat === "gold") add += 0.2; // base "Native" +1 crit (20%) — DEFAULT for everyone, NOT a skill
      if (shieldEq && cat !== "oil") add += 0.25; // faction shield (Nightshade/Goblin/Sunflorian/Bumpkin) — +0.25 to EVERY mined ore, game-only (absent from the NFT API)
      if (cat === "trees") {
        if (has("Lumberjack")) mult *= 1.1;   // collectible — absent from the NFT API
        if (has("Squirrel")) add += 0.1;       // absent from the NFT API
      }
      // Fold the parsed boost effects (API/EXTRA collectibles + skills) for this resource.
      for (const e of (effects || [])) {
        if (e.cat !== cat) continue;
        if (e.type === "yield_flat") add += (e.value || 0);
        else if (e.type === "yield_pct") mult *= (1 + (e.value || 0) / 100);
        else if (e.type === "yield_mult") mult *= (e.value || 1);
      }
      return 1 * mult + add;
    }
    // Total resource units per full harvest-round (all nodes): Sum_node bb x multiplier + tierBonus.
    function gameResYield(farm, cat, effects) {
      const bb = gameResBoostedBase(farm, cat, effects);
      const obj = farm[RES_FARMKEY[cat]] || {};
      let total = 0;
      for (const node of Object.values(obj)) {
        const m = (node && node.multiplier) || 1;
        const tier = (node && node.tier) || (m >= 16 ? 3 : (m >= 4 ? 2 : 1));
        total += bb * m + (tier === 3 ? 2.5 : (tier === 2 ? 0.5 : 0));
      }
      return total;
    }

    // ── flowers.html 15832-15875: gameExtraEffects ──
    function gameExtraEffects(farm) {
      const out = [];
      const skills = (farm.bumpkin && farm.bumpkin.skills) || {};
      const ownsC = (n) => findCollectible(farm, n).length > 0;
      // Faction Quiver — +0.25 to ALL crops if the faction's wings wearable is equipped anywhere.
      const faction = (farm.faction && farm.faction.name) || "";
      const wings = FACTION_WINGS[faction];
      if (wings && farmWearableEquipped(farm, wings)) out.push({ type: "yield_flat", value: 0.25, cat: "crops", raw: "Faction Quiver +0.25 crops" });
      // AOE crop yield collectibles (game uses plot positions; we assume covered, like sfl.world's display).
      if (ownsC("Scary Mike")) out.push({ type: "yield_flat", value: skills["Horror Mike"] ? 0.3 : 0.2, cat: "crops", cropTier: "medium", raw: (skills["Horror Mike"] ? "Horror Mike +0.3" : "Scary Mike +0.2") + " medium crops" });
      if (ownsC("Laurie the Chuckle Crow")) out.push({ type: "yield_flat", value: skills["Laurie's Gains"] ? 0.3 : 0.2, cat: "crops", cropTier: "advanced", raw: (skills["Laurie's Gains"] ? "Laurie's Gains +0.3" : "Laurie +0.2") + " advanced crops" });
      if (ownsC("Sir Goldensnout")) out.push({ type: "yield_flat", value: 0.5, cat: "crops", raw: "Sir Goldensnout +0.5 crops (AOE)" });
      // Global crop additions
      if (farmWearableEquipped(farm, "Infernal Pitchfork")) out.push({ type: "yield_flat", value: 3, cat: "crops", raw: "Infernal Pitchfork +3 crops" });
      if (ownsC("Cabbage Boy")) { out.push({ type: "yield_flat", value: 0.25, cat: "crops", product: "Cabbage", raw: "Cabbage Boy +0.25" }); if (ownsC("Cabbage Girl")) out.push({ type: "yield_flat", value: 0.25, cat: "crops", product: "Cabbage", raw: "Cabbage Girl +0.25" }); }
      else if (ownsC("Karkinos")) out.push({ type: "yield_flat", value: 0.1, cat: "crops", product: "Cabbage", raw: "Karkinos +0.1 Cabbage" });
      if (ownsC("Pablo The Bunny")) out.push({ type: "yield_flat", value: 0.1, cat: "crops", product: "Carrot", raw: "Pablo +0.1 Carrot" });
      if (ownsC("Maximus")) out.push({ type: "yield_flat", value: 1, cat: "crops", product: "Eggplant", raw: "Maximus +1 Eggplant" });
      if (ownsC("Giant Yam")) out.push({ type: "yield_flat", value: 0.5, cat: "crops", product: "Yam", raw: "Giant Yam +0.5" });
      if (ownsC("Giant Kale")) out.push({ type: "yield_flat", value: 2, cat: "crops", product: "Kale", raw: "Giant Kale +2" });
      if (ownsC("Sheaf of Plenty")) out.push({ type: "yield_flat", value: 2, cat: "crops", product: "Barley", raw: "Sheaf of Plenty +2 Barley" });

      // ── FRUITS (game fruitHarvested.ts) ──
      const _wingsEq = wings && farmWearableEquipped(farm, wings);
      if (_wingsEq) out.push({ type: "yield_flat", value: 0.25, cat: "fruits", raw: "Faction Quiver +0.25 fruit" });
      if (ownsC("Macaw")) out.push({ type: "yield_flat", value: skills["Loyal Macaw"] ? 0.2 : 0.1, cat: "fruits", raw: (skills["Loyal Macaw"] ? "Loyal Macaw +0.2" : "Macaw +0.1") + " fruit" });
      if (farmWearableEquipped(farm, "Fruit Picker Apron")) out.push({ type: "yield_flat", value: 0.1, cat: "fruits", raw: "Fruit Picker Apron +0.1 fruit" });
      if (farmWearableEquipped(farm, "Camel Onesie")) out.push({ type: "yield_flat", value: 0.1, cat: "fruits", raw: "Camel Onesie +0.1 fruit" });
      if (ownsC("Black Bearry")) out.push({ type: "yield_flat", value: 1, cat: "fruits", product: "Blueberry", raw: "Black Bearry +1 Blueberry" });
      if (ownsC("Lady Bug")) out.push({ type: "yield_flat", value: 0.25, cat: "fruits", product: "Apple", raw: "Lady Bug +0.25 Apple" });
      if (ownsC("Banana Chicken")) out.push({ type: "yield_flat", value: 0.1, cat: "fruits", product: "Banana", raw: "Banana Chicken +0.1 Banana" });
      if (farmWearableEquipped(farm, "Banana Amulet")) out.push({ type: "yield_flat", value: 0.5, cat: "fruits", product: "Banana", raw: "Banana Amulet +0.5 Banana" });
      if (ownsC("Lemon Shark")) out.push({ type: "yield_flat", value: 0.2, cat: "fruits", product: "Lemon", raw: "Lemon Shark +0.2 Lemon" });
      if (ownsC("Reveling Lemon")) out.push({ type: "yield_flat", value: 0.25, cat: "fruits", product: "Lemon", raw: "Reveling Lemon +0.25 Lemon" });
      if (ownsC("Tomato Bombard")) out.push({ type: "yield_flat", value: 1, cat: "fruits", product: "Tomato", raw: "Tomato Bombard +1 Tomato" });

      // ── GREENHOUSE (game harvestGreenHouse.ts) — collectible/wearable boosts the API omits (skills parsed separately) ──
      if (ownsC("Pharaoh Gnome")) out.push({ type: "yield_flat", value: 2, cat: "greenhouse", raw: "Pharaoh Gnome +2 greenhouse" });
      if (ownsC("Rice Panda")) out.push({ type: "yield_flat", value: 0.25, cat: "greenhouse", product: "Rice", raw: "Rice Panda +0.25 Rice" });
      if (farmWearableEquipped(farm, "Non La Hat")) out.push({ type: "yield_flat", value: 1, cat: "greenhouse", product: "Rice", raw: "Non La Hat +1 Rice" });
      if (farmWearableEquipped(farm, "Olive Shield")) out.push({ type: "yield_flat", value: 1, cat: "greenhouse", product: "Olive", raw: "Olive Shield +1 Olive" });
      if (farmWearableEquipped(farm, "Olive Royalty Shirt")) out.push({ type: "yield_flat", value: 0.25, cat: "greenhouse", product: "Olive", raw: "Olive Royalty Shirt +0.25 Olive" });
      return out;
    }

export {
  SEED_DATA, findCollectible, BUMPKIN_XP_TABLE,
  ANIMAL_CYCLE_DATA, ANIMAL_LEVELS, GOLDEN_ANIMALS, getAnimalLevel, isAnimalCat, getAnimalData,
  ANIMAL_CAT_MAP,
  RESOURCE_RESPAWN_DATA, TOOL_TO_CAT, BASE_STOCK, SKILL_TREE_DATA, CROP_TIERS,
  FACTION_MARK_PRICES, FACTION_KEYWORDS, getFactionMarkCost, marksToSfl,
  calcSkillPointCost, POWER_CATEGORIES, getCount,
  getBumpkinLevel, getAllEquippedWearables, isWearableEquipped,
  sumMergedNodes, detectFarmCapacity,
  getCycleSec, getCapacityCount, getDefaultProduct, getBaseYield, applyBoosts,
  detectStockModifiers, getEffectiveStock, miningToolsPerDay, calcToolCostPerDay,
  getEffectsForCategory, farmWearableEquipped, FACTION_WINGS, FACTION_SHIELDS,
  RES_FARMKEY, gameResBoostedBase, gameResYield, gameExtraEffects,
};
