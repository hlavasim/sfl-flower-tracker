// ═══════════════════════════════════════
    //  CONSTANTS
    // ═══════════════════════════════════════

    const DEFAULTS = { farm: "", limit: "5" };
    const DONATE_ADDR = "0x5688ee5f0488e1dc96d9aad5715e958914987cfc";
    const IMG_BASE = "https://sfl.world/img/flowers/";
    const PAGES = ["dashboard", "hub", "flowers", "dolls", "crustaceans", "bumpkin", "treasury", "sales", "power", "buds", "pets", "diff", "json"];

    // ═══════════════════════════════════════
    //  SEED DATA
    // ═══════════════════════════════════════

    const SEED_DATA = {
      "Sunpetal Seed":   { baseSeconds: 86400,  color: "#FFD700", label: "Sunpetal", season: null },
      "Bloom Seed":      { baseSeconds: 172800, color: "#FF69B4", label: "Bloom", season: null },
      "Edelweiss Seed":  { baseSeconds: 259200, color: "#87CEEB", label: "Edelweiss", season: "Winter" },
      "Gladiolus Seed":  { baseSeconds: 259200, color: "#FF6347", label: "Gladiolus", season: "Summer" },
      "Lavender Seed":   { baseSeconds: 259200, color: "#C8A2C8", label: "Lavender", season: "Spring" },
      "Clover Seed":     { baseSeconds: 259200, color: "#2ECC71", label: "Clover", season: "Autumn" },
      "Lily Seed":       { baseSeconds: 432000, color: "#B07CD8", label: "Lily", season: null },
    };

    // ═══════════════════════════════════════
    //  FLOWER BOOSTS (auto-detected from API)
    // ═══════════════════════════════════════

    const FLOWER_BOOSTS = [
      { name: "Flower Crown",      type: "wearable",        multiplier: 0.5  },
      { name: "Moth Shrine",       type: "collectible_temp", multiplier: 0.75, durationMs: 7 * 24 * 3600 * 1000 },
      { name: "Flower Fox",        type: "collectible",     multiplier: 0.9  },
      { name: "Blossom Hourglass", type: "collectible_temp", multiplier: 0.75, durationMs: 4 * 3600 * 1000 },
      { name: "Blooming Boost",    type: "skill",           multiplier: 0.9  },
      { name: "Flower Power",      type: "skill",           multiplier: 0.8  },
      { name: "Flowery Abode",     type: "skill",           multiplier: 1.5  },
    ];

    function findCollectible(farm, name) {
      // Collectibles can be on main island or home island
      const main = farm.collectibles?.[name] || [];
      const home = farm.home?.collectibles?.[name] || [];
      return [...main, ...home];
    }

    function detectFlowerBoosts(farm) {
      const active = [];
      for (const boost of FLOWER_BOOSTS) {
        let isActive = false;
        switch (boost.type) {
          case "wearable": {
            const equipped = farm.bumpkin?.equipped || {};
            isActive = Object.values(equipped).flat().includes(boost.name);
            break;
          }
          case "collectible": {
            isActive = findCollectible(farm, boost.name).length > 0;
            break;
          }
          case "collectible_temp": {
            const placements = findCollectible(farm, boost.name);
            if (placements.length > 0) {
              const latest = placements[placements.length - 1];
              const placedAt = toMs(latest.createdAt || latest.readyAt || 0);
              isActive = (Date.now() - placedAt) < boost.durationMs;
            }
            break;
          }
          case "skill": {
            const skills = farm.bumpkin?.skills || {};
            isActive = skills[boost.name] !== undefined;
            break;
          }
        }
        if (isActive) active.push(boost);
      }
      console.log("[Boosts]", active.map(b => `${b.name} ×${b.multiplier}`), "multiplier:", computeFlowerMultiplier(active));
      return active;
    }

    function computeFlowerMultiplier(activeBoosts) {
      return activeBoosts.reduce((m, b) => m * b.multiplier, 1);
    }

    function applyFlowerBoosts(multiplier) {
      for (const sd of Object.values(SEED_DATA)) {
        sd.seconds = sd.baseSeconds * multiplier;
        sd.hours = sd.seconds / 3600;
      }
    }

    // Initialize with no boosts (multiplier = 1)
    applyFlowerBoosts(1);

    const SEED_ORDER = [
      "Sunpetal Seed", "Bloom Seed",
      "Edelweiss Seed", "Gladiolus Seed", "Lavender Seed", "Clover Seed",
      "Lily Seed",
    ];

    // ═══════════════════════════════════════
    //  FLOWER RECIPES
    // ═══════════════════════════════════════

    const FLOWER_RECIPES = {
      "Red Pansy":       { seed: "Sunpetal Seed", input: "Radish" },
      "Yellow Pansy":    { seed: "Sunpetal Seed", input: "Sunflower" },
      "Purple Cosmos":   { seed: "Sunpetal Seed", input: "Beetroot" },
      "Blue Cosmos":     { seed: "Sunpetal Seed", input: "Cauliflower" },
      "Blue Pansy":      { seed: "Sunpetal Seed", input: "Purple Cosmos" },
      "Yellow Cosmos":   { seed: "Sunpetal Seed", input: "Yellow Pansy" },
      "Purple Pansy":    { seed: "Sunpetal Seed", input: "Blue Pansy" },
      "White Pansy":     { seed: "Sunpetal Seed", input: "Yellow Cosmos" },
      "White Cosmos":    { seed: "Sunpetal Seed", input: "Prism Petal" },
      "Prism Petal":     { seed: "Sunpetal Seed", input: "Blue Lotus" },
      "Red Cosmos":      { seed: "Sunpetal Seed", input: "Yellow Daffodil" },

      "Red Balloon Flower":   { seed: "Bloom Seed", input: "Sunflower" },
      "Blue Balloon Flower":  { seed: "Bloom Seed", input: "Cauliflower" },
      "Purple Daffodil":      { seed: "Bloom Seed", input: "Radish" },
      "Red Daffodil":         { seed: "Bloom Seed", input: "Yellow Pansy" },
      "White Daffodil":       { seed: "Bloom Seed", input: "Yellow Cosmos" },
      "Celestial Frostbloom": { seed: "Bloom Seed", input: "White Pansy" },
      "White Balloon Flower": { seed: "Bloom Seed", input: "White Cosmos" },
      "Yellow Daffodil":      { seed: "Bloom Seed", input: "Red Cosmos" },
      "Blue Daffodil":        { seed: "Bloom Seed", input: "Purple Balloon Flower" },
      "Yellow Balloon Flower":{ seed: "Bloom Seed", input: "Yellow Lotus" },
      "Purple Balloon Flower":{ seed: "Bloom Seed", input: "Blue Carnation" },

      "Purple Carnation": { seed: "Lily Seed", input: "Eggplant" },
      "Red Lotus":        { seed: "Lily Seed", input: "Beetroot" },
      "White Lotus":      { seed: "Lily Seed", input: "Cauliflower" },
      "Yellow Carnation": { seed: "Lily Seed", input: "Sunflower" },
      "White Carnation":  { seed: "Lily Seed", input: "Yellow Pansy" },
      "Yellow Lotus":     { seed: "Lily Seed", input: "Red Pansy" },
      "Blue Lotus":       { seed: "Lily Seed", input: "Blue Pansy" },
      "Blue Carnation":   { seed: "Lily Seed", input: "Purple Daffodil" },
      "Red Carnation":    { seed: "Lily Seed", input: "Purple Pansy" },
      "Purple Lotus":     { seed: "Lily Seed", input: "Blue Carnation" },
      "Primula Enigma":   { seed: "Lily Seed", input: "Purple Balloon Flower" },

      "Red Edelweiss":    { seed: "Edelweiss Seed", input: "Artichoke" },
      "Yellow Edelweiss": { seed: "Edelweiss Seed", input: "Onion" },
      "Purple Edelweiss": { seed: "Edelweiss Seed", input: "Rhubarb" },
      "White Edelweiss":  { seed: "Edelweiss Seed", input: "Blue Edelweiss" },
      "Blue Edelweiss":   { seed: "Edelweiss Seed", input: "Purple Edelweiss" },

      "Red Gladiolus":    { seed: "Gladiolus Seed", input: "Yellow Edelweiss" },
      "Yellow Gladiolus": { seed: "Gladiolus Seed", input: "Pepper" },
      "Purple Gladiolus": { seed: "Gladiolus Seed", input: "Artichoke" },
      "White Gladiolus":  { seed: "Gladiolus Seed", input: "White Edelweiss" },
      "Blue Gladiolus":   { seed: "Gladiolus Seed", input: "Rhubarb" },

      "Red Lavender":     { seed: "Lavender Seed", input: "Pepper" },
      "Yellow Lavender":  { seed: "Lavender Seed", input: "Red Gladiolus" },
      "Purple Lavender":  { seed: "Lavender Seed", input: "Blue Lavender" },
      "White Lavender":   { seed: "Lavender Seed", input: "Rhubarb" },
      "Blue Lavender":    { seed: "Lavender Seed", input: "White Edelweiss" },

      "Red Clover":       { seed: "Clover Seed", input: "Red Edelweiss" },
      "Yellow Clover":    { seed: "Clover Seed", input: "Pepper" },
      "Purple Clover":    { seed: "Clover Seed", input: "Red Lavender" },
      "White Clover":     { seed: "Clover Seed", input: "Blue Edelweiss" },
      "Blue Clover":      { seed: "Clover Seed", input: "Rhubarb" },
    };

    const CROPS_AND_FRUITS = new Set([
      "Sunflower","Potato","Pumpkin","Carrot","Cabbage","Soybean",
      "Beetroot","Cauliflower","Parsnip","Eggplant","Corn","Radish",
      "Wheat","Kale","Turnip","Onion","Pepper","Rhubarb","Artichoke",
      "Barley","Zucchini","Yam","Broccoli",
      "Tomato","Lemon","Blueberry","Orange","Apple","Banana",
      "Grape","Rice","Olive",
      "Celestine","Lunara","Duskberry",
    ]);

    // ═══════════════════════════════════════
    //  DOLL RECIPES
    // ═══════════════════════════════════════

    const DOLL_RECIPES = {
      "Doll":           [{ item: "Leather", qty: 4 }, { item: "Wool", qty: 5 }],
      "Angler Doll":    [{ item: "Kelp Fibre", qty: 8 }, { item: "Doll", qty: 1 }],
      "Bloom Doll":     [{ item: "Doll", qty: 1 }, { item: "Prism Petal", qty: 3 }, { item: "Celestial Frostbloom", qty: 2 }, { item: "Primula Enigma", qty: 3 }],
      "Buzz Doll":      [{ item: "Honey", qty: 8 }, { item: "Doll", qty: 1 }],
      "Cluck Doll":     [{ item: "Feather", qty: 8 }, { item: "Doll", qty: 1 }],
      "Crude Doll":     [{ item: "Oil", qty: 8 }, { item: "Doll", qty: 1 }],
      "Ember Doll":     [{ item: "Crimsteel", qty: 8 }, { item: "Doll", qty: 1 }],
      "Gilded Doll":    [{ item: "Gold", qty: 8 }, { item: "Doll", qty: 1 }],
      "Harvest Doll":   [{ item: "Turnip", qty: 8 }, { item: "Doll", qty: 1 }],
      "Juicy Doll":     [{ item: "Tomato", qty: 8 }, { item: "Doll", qty: 1 }],
      "Lumber Doll":    [{ item: "Timber", qty: 8 }, { item: "Doll", qty: 1 }],
      "Lunar Doll":     [{ item: "Lunara", qty: 3 }, { item: "Duskberry", qty: 2 }, { item: "Doll", qty: 1 }, { item: "Celestine", qty: 3 }],
      "Moo Doll":       [{ item: "Leather", qty: 8 }, { item: "Doll", qty: 1 }],
      "Sizzle Doll":    [{ item: "Synthetic Fabric", qty: 8 }, { item: "Doll", qty: 1 }],
      "Wooly Doll":     [{ item: "Merino Wool", qty: 8 }, { item: "Doll", qty: 1 }],
      "Shadow Doll":    [{ item: "Obsidian", qty: 8 }, { item: "Doll", qty: 1 }],
      "Frosty Doll":    [{ item: "Celestial Frostbloom", qty: 8 }, { item: "Harvest Doll", qty: 1 }],
      "Grubby Doll":    [{ item: "Shadow Doll", qty: 1 }, { item: "Ember Doll", qty: 1 }, { item: "Gilded Doll", qty: 1 }],
      "Dune Doll":      [{ item: "Coral", qty: 8 }, { item: "Lumber Doll", qty: 1 }],
      "Solar Doll":     [],
      "Nefari Doll":    [],
      "Cosmo Doll":     [],
      "Bigfin Doll":    [],
    };

    const TRACKED_DOLLS_DEFAULT = {
      "Doll": true, "Angler Doll": true, "Bloom Doll": true, "Buzz Doll": true,
      "Cluck Doll": true, "Crude Doll": true, "Ember Doll": true, "Gilded Doll": true,
      "Harvest Doll": true, "Juicy Doll": true, "Lumber Doll": true, "Lunar Doll": true,
      "Moo Doll": true, "Sizzle Doll": true, "Wooly Doll": true,
      "Solar Doll": false, "Shadow Doll": false, "Nefari Doll": false, "Grubby Doll": false,
      "Frosty Doll": false, "Dune Doll": false, "Cosmo Doll": false, "Bigfin Doll": false,
    };

    function getTrackedDolls() {
      try {
        const saved = localStorage.getItem("sfl_tracked_dolls");
        if (saved) {
          const parsed = JSON.parse(saved);
          // Merge with defaults (in case new dolls were added)
          const result = { ...TRACKED_DOLLS_DEFAULT };
          for (const k of Object.keys(result)) {
            if (parsed[k] !== undefined) result[k] = parsed[k];
          }
          return result;
        }
      } catch (e) {}
      return { ...TRACKED_DOLLS_DEFAULT };
    }

    function saveTrackedDolls(tracked) {
      localStorage.setItem("sfl_tracked_dolls", JSON.stringify(tracked));
    }

    function toggleDollTracked(name) {
      const tracked = getTrackedDolls();
      tracked[name] = !tracked[name];
      saveTrackedDolls(tracked);
      // Re-render dolls page with cached data
      if (cachedFarmData) renderDolls(cachedFarmData);
    }

    // ═══════════════════════════════════════
    //  CRUSTACEAN RECIPES
    // ═══════════════════════════════════════

    const CRUSTACEAN_RECIPES = {
      "Blue Crab":    { pot: "Crab Pot", chum: "Heart Leaf", qty: 3, alt: "Ribbon x3", time: "4h" },
      "Lobster":      { pot: "Crab Pot", chum: "Wild Grass", qty: 3, alt: "Frost Pebble x3", time: "4h" },
      "Hermit Crab":  { pot: "Crab Pot", chum: "Grape", qty: 5, alt: "Rice x5", time: "4h" },
      "Shrimp":       { pot: "Crab Pot", chum: "Crimstone", qty: 2, alt: null, time: "4h" },
      "Mussel":       { pot: "Crab Pot", chum: "Moonfur", qty: 1, alt: null, time: "4h" },
      "Oyster":       { pot: "Crab Pot", chum: "Fish Stick", qty: 2, alt: null, time: "4h" },
      "Anemone":      { pot: "Crab Pot", chum: "Fish Oil", qty: 2, alt: "Crab Stick x2", time: "4h" },
      "Isopod":       { pot: "Crab Pot", chum: null, qty: 0, alt: null, time: "4h" },
      "Sea Slug":     { pot: "Mariner Pot", chum: "Crimstone", qty: 2, alt: null, time: "8h" },
      "Sea Snail":    { pot: "Mariner Pot", chum: "Chewed Bone", qty: 3, alt: "Ruffroot x3", time: "8h" },
      "Garden Eel":   { pot: "Mariner Pot", chum: "Dewberry", qty: 3, alt: "Duskberry x3", time: "8h" },
      "Sea Grapes":   { pot: "Mariner Pot", chum: "Lunara", qty: 3, alt: null, time: "8h" },
      "Octopus":      { pot: "Mariner Pot", chum: "Moonfur", qty: 1, alt: null, time: "8h" },
      "Sea Urchin":   { pot: "Mariner Pot", chum: "Fish Stick", qty: 2, alt: null, time: "8h" },
      "Horseshoe Crab":{ pot: "Mariner Pot", chum: "Crab Stick", qty: 2, alt: null, time: "8h" },
      "Barnacle":     { pot: "Mariner Pot", chum: null, qty: 0, alt: null, time: "8h" },
    };

    // ═══════════════════════════════════════
    //  BUMPKIN XP TABLE (total XP for levels 1-200)
    // ═══════════════════════════════════════

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

    // ═══════════════════════════════════════
    //  COOKING RECIPES (84 foods, 5 buildings)
    // ═══════════════════════════════════════

    const COOKING_RECIPES_DATA = {
      // Fire Pit (18)
      "Mashed Potato":        { building: "Fire Pit",       xp: 3,     cookSec: 30,     usesHoney: false },
      "Rhubarb Tart":         { building: "Fire Pit",       xp: 5,     cookSec: 60,     usesHoney: false },
      "Pumpkin Soup":         { building: "Fire Pit",       xp: 24,    cookSec: 180,    usesHoney: false },
      "Reindeer Carrot":      { building: "Fire Pit",       xp: 36,    cookSec: 300,    usesHoney: false },
      "Mushroom Soup":        { building: "Fire Pit",       xp: 56,    cookSec: 600,    usesHoney: false },
      "Boiled Eggs":          { building: "Fire Pit",       xp: 90,    cookSec: 3600,   usesHoney: false },
      "Bumpkin Broth":        { building: "Fire Pit",       xp: 96,    cookSec: 1200,   usesHoney: false },
      "Popcorn":              { building: "Fire Pit",       xp: 200,   cookSec: 720,    usesHoney: false },
      "Cabbers n Mash":       { building: "Fire Pit",       xp: 250,   cookSec: 2400,   usesHoney: false },
      "Rapid Roast":          { building: "Fire Pit",       xp: 300,   cookSec: 10,     usesHoney: false },
      "Kale Stew":            { building: "Fire Pit",       xp: 400,   cookSec: 7200,   usesHoney: false },
      "Fried Tofu":           { building: "Fire Pit",       xp: 400,   cookSec: 5400,   usesHoney: false },
      "Gumbo":                { building: "Fire Pit",       xp: 600,   cookSec: 14400,  usesHoney: false },
      "Kale Omelette":        { building: "Fire Pit",       xp: 1250,  cookSec: 12600,  usesHoney: false },
      "Rice Bun":             { building: "Fire Pit",       xp: 2600,  cookSec: 18000,  usesHoney: false },
      "Antipasto":            { building: "Fire Pit",       xp: 3000,  cookSec: 10800,  usesHoney: false },
      "Pizza Margherita":     { building: "Fire Pit",       xp: 25000, cookSec: 72000,  usesHoney: false },
      // Kitchen (27)
      "Sunflower Crunch":     { building: "Kitchen",        xp: 50,    cookSec: 600,    usesHoney: false },
      "Club Sandwich":        { building: "Kitchen",        xp: 170,   cookSec: 10800,  usesHoney: false },
      "Roast Veggies":        { building: "Kitchen",        xp: 170,   cookSec: 7200,   usesHoney: false },
      "Fruit Salad":          { building: "Kitchen",        xp: 225,   cookSec: 1800,   usesHoney: false },
      "Mushroom Jacket Potatoes": { building: "Kitchen",    xp: 240,   cookSec: 600,    usesHoney: false },
      "Cauliflower Burger":   { building: "Kitchen",        xp: 255,   cookSec: 10800,  usesHoney: false },
      "Bumpkin Salad":        { building: "Kitchen",        xp: 290,   cookSec: 12600,  usesHoney: false },
      "Goblin's Treat":       { building: "Kitchen",        xp: 500,   cookSec: 21600,  usesHoney: false },
      "Pancakes":             { building: "Kitchen",        xp: 1000,  cookSec: 3600,   usesHoney: true  },
      "Bumpkin ganoush":      { building: "Kitchen",        xp: 1000,  cookSec: 18000,  usesHoney: false },
      "Chowder":              { building: "Kitchen",        xp: 1000,  cookSec: 28800,  usesHoney: false },
      "Tofu Scramble":        { building: "Kitchen",        xp: 1000,  cookSec: 10800,  usesHoney: false },
      "Fish Burger":          { building: "Kitchen",        xp: 1300,  cookSec: 7200,   usesHoney: false },
      "Fish Omelette":        { building: "Kitchen",        xp: 1500,  cookSec: 18000,  usesHoney: false },
      "Fried Calamari":       { building: "Kitchen",        xp: 1500,  cookSec: 18000,  usesHoney: false },
      "Beetroot Blaze":       { building: "Kitchen",        xp: 2000,  cookSec: 30,     usesHoney: false },
      "Sushi Roll":           { building: "Kitchen",        xp: 2000,  cookSec: 3600,   usesHoney: false },
      "Ocean's Olive":        { building: "Kitchen",        xp: 2000,  cookSec: 7200,   usesHoney: false },
      "Fish n Chips":         { building: "Kitchen",        xp: 2000,  cookSec: 14400,  usesHoney: false },
      "Seafood Basket":       { building: "Kitchen",        xp: 2200,  cookSec: 18000,  usesHoney: false },
      "Bumpkin Roast":        { building: "Kitchen",        xp: 2500,  cookSec: 43200,  usesHoney: false },
      "Goblin Brunch":        { building: "Kitchen",        xp: 2500,  cookSec: 43200,  usesHoney: false },
      "Steamed Red Rice":     { building: "Kitchen",        xp: 3000,  cookSec: 14400,  usesHoney: false },
      "Caprese Salad":        { building: "Kitchen",        xp: 6000,  cookSec: 10800,  usesHoney: false },
      "Spaghetti al Limone":  { building: "Kitchen",        xp: 15000, cookSec: 54000,  usesHoney: false },
      // Bakery (17)
      "Sunflower Cake":       { building: "Bakery",         xp: 525,   cookSec: 23400,  usesHoney: false },
      "Cornbread":            { building: "Bakery",         xp: 600,   cookSec: 43200,  usesHoney: false },
      "Pumpkin Cake":         { building: "Bakery",         xp: 625,   cookSec: 37800,  usesHoney: false },
      "Potato Cake":          { building: "Bakery",         xp: 650,   cookSec: 37800,  usesHoney: false },
      "Apple Pie":            { building: "Bakery",         xp: 720,   cookSec: 14400,  usesHoney: false },
      "Kale & Mushroom Pie":  { building: "Bakery",         xp: 720,   cookSec: 14400,  usesHoney: false },
      "Orange Cake":          { building: "Bakery",         xp: 730,   cookSec: 14400,  usesHoney: false },
      "Carrot Cake":          { building: "Bakery",         xp: 750,   cookSec: 46800,  usesHoney: false },
      "Cabbage Cake":         { building: "Bakery",         xp: 860,   cookSec: 54000,  usesHoney: false },
      "Wheat Cake":           { building: "Bakery",         xp: 1100,  cookSec: 86400,  usesHoney: false },
      "Cauliflower Cake":     { building: "Bakery",         xp: 1190,  cookSec: 79200,  usesHoney: false },
      "Radish Cake":          { building: "Bakery",         xp: 1200,  cookSec: 86400,  usesHoney: false },
      "Beetroot Cake":        { building: "Bakery",         xp: 1250,  cookSec: 79200,  usesHoney: false },
      "Parsnip Cake":         { building: "Bakery",         xp: 1300,  cookSec: 86400,  usesHoney: false },
      "Eggplant Cake":        { building: "Bakery",         xp: 1400,  cookSec: 86400,  usesHoney: false },
      "Honey Cake":           { building: "Bakery",         xp: 4000,  cookSec: 28800,  usesHoney: true  },
      "Lemon Cheesecake":     { building: "Bakery",         xp: 30000, cookSec: 108000, usesHoney: false },
      // Deli (9)
      "Cheese":               { building: "Deli",           xp: 1,     cookSec: 1200,   usesHoney: false },
      "Fermented Carrots":    { building: "Deli",           xp: 250,   cookSec: 86400,  usesHoney: false },
      "Blueberry Jam":        { building: "Deli",           xp: 500,   cookSec: 43200,  usesHoney: false },
      "Sauerkraut":           { building: "Deli",           xp: 500,   cookSec: 86400,  usesHoney: false },
      "Fancy Fries":          { building: "Deli",           xp: 1000,  cookSec: 86400,  usesHoney: false },
      "Fermented Fish":       { building: "Deli",           xp: 3000,  cookSec: 86400,  usesHoney: false },
      "Blue Cheese":          { building: "Deli",           xp: 6000,  cookSec: 10800,  usesHoney: false },
      "Shroom Syrup":         { building: "Deli",           xp: 10000, cookSec: 10,     usesHoney: true  },
      "Honey Cheddar":        { building: "Deli",           xp: 15000, cookSec: 43200,  usesHoney: true  },
      // Smoothie Shack (12)
      "Quick Juice":          { building: "Smoothie Shack", xp: 100,   cookSec: 1800,   usesHoney: false },
      "Carrot Juice":         { building: "Smoothie Shack", xp: 200,   cookSec: 3600,   usesHoney: false },
      "Purple Smoothie":      { building: "Smoothie Shack", xp: 310,   cookSec: 1800,   usesHoney: false },
      "Orange Juice":         { building: "Smoothie Shack", xp: 375,   cookSec: 2700,   usesHoney: false },
      "Apple Juice":          { building: "Smoothie Shack", xp: 500,   cookSec: 3600,   usesHoney: false },
      "Power Smoothie":       { building: "Smoothie Shack", xp: 775,   cookSec: 5400,   usesHoney: false },
      "Bumpkin Detox":        { building: "Smoothie Shack", xp: 975,   cookSec: 7200,   usesHoney: false },
      "Sour Shake":           { building: "Smoothie Shack", xp: 1000,  cookSec: 3600,   usesHoney: false },
      "Banana Blast":         { building: "Smoothie Shack", xp: 1200,  cookSec: 10800,  usesHoney: false },
      "The Lot":              { building: "Smoothie Shack", xp: 1500,  cookSec: 12600,  usesHoney: false },
      "Grape Juice":          { building: "Smoothie Shack", xp: 3300,  cookSec: 10800,  usesHoney: false },
      "Slow Juice":           { building: "Smoothie Shack", xp: 7500,  cookSec: 86400,  usesHoney: false },
    };

    const COOKING_BUILDING_NAMES = ["Fire Pit", "Kitchen", "Bakery", "Deli", "Smoothie Shack"];
    const COOKING_BUILDING_EMOJI = { "Fire Pit": "🔥", "Kitchen": "🍳", "Bakery": "🧁", "Deli": "🥩", "Smoothie Shack": "🥤" };

    // ═══════════════════════════════════════
    //  POWER ANALYZER DATA
    // ═══════════════════════════════════════

    // Grow times in seconds (approximate — base values before boosts)
    const CROP_GROW_DATA = {
      "Sunflower": 60, "Potato": 300, "Rhubarb": 600, "Pumpkin": 1800, "Zucchini": 1800,
      "Carrot": 3600, "Yam": 3600, "Cabbage": 7200, "Broccoli": 7200, "Soybean": 10800,
      "Beetroot": 14400, "Pepper": 14400, "Cauliflower": 28800, "Parsnip": 43200,
      "Eggplant": 57600, "Corn": 72000, "Onion": 72000,
      "Radish": 86400, "Wheat": 86400, "Turnip": 86400,
      "Kale": 129600, "Artichoke": 129600, "Barley": 172800,
    };

    const FRUIT_GROW_DATA = {
      "Apple": 43200, "Blueberry": 21600, "Orange": 28800, "Banana": 43200,
      "Lemon": 14400, "Tomato": 7200,
    };
    // Number of harvests before fruit tree becomes a stump (chop for 1 Wood, costs 1 Axe)
    const FRUIT_HARVEST_COUNT = {
      "Tomato": 4, "Lemon": 4, "Blueberry": 4,
      "Orange": 4, "Apple": 4, "Banana": 4,
    };

    const GREENHOUSE_GROW_DATA = {
      "Grape": 43200, "Rice": 115200, "Olive": 158400,
    };

    const ANIMAL_CYCLE_DATA = {
      "Chicken": { cycleSec: 24 * 3600, products: ["Egg", "Feather"], farmKey: "chickens" },
      "Cow":     { cycleSec: 24 * 3600, products: ["Milk", "Leather"], farmKey: "cows" },
      "Sheep":   { cycleSec: 24 * 3600, products: ["Wool", "Merino Wool"], farmKey: "sheep" },
    };
    const ANIMAL_CAT_MAP = { chickens: "Chicken", cows: "Cow", sheep: "Sheep" };
    function isAnimalCat(catId) { return catId in ANIMAL_CAT_MAP; }
    function getAnimalData(catId) { return ANIMAL_CYCLE_DATA[ANIMAL_CAT_MAP[catId]]; }

    // ── Animal Level System ──
    // Cumulative XP thresholds per level (index = level, value = min XP needed)
    const ANIMAL_LEVELS = {
      Chicken: [0,60,120,240,360,480,660,840,1020,1200,1440,1680,1920,2160,2400,2720],
      Cow:     [0,180,360,720,1080,1440,1980,2520,3060,3600,4320,5040,5760,6480,7200,8160],
      Sheep:   [0,120,240,480,720,960,1320,1680,2040,2400,2880,3360,3840,4320,4800,5440],
    };
    // Production per level: [primaryQty, secondaryQty] — products from ANIMAL_CYCLE_DATA
    const ANIMAL_RESOURCE_DROP = {
      Chicken: [[0,0],[1,0],[1,0],[1,1],[2,1],[2,1],[2,1],[2,1],[3,1],[3,2],[3,2],[3,2],[3,2],[4,2],[4,2],[5,3]],
      Cow:     [[0,0],[1,1],[1,1],[1,1],[2,1],[2,1],[2,2],[2,2],[3,2],[3,2],[3,3],[3,3],[3,3],[3,3],[3,3],[4,4]],
      Sheep:   [[0,0],[1,1],[1,1],[1,1],[2,1],[2,1],[2,2],[2,2],[3,2],[3,2],[3,3],[3,3],[3,3],[3,3],[3,3],[4,4]],
    };
    // Feed recipes: ingredients per 1 unit
    const FEED_RECIPES = {
      "Kernel Blend": { Corn: 1 },
      "Hay":          { Wheat: 1 },
      "NutriBarley":  { Barley: 1 },
      "Mixed Grain":  { Wheat: 1, Corn: 1, Barley: 1 },
    };
    // Feed items consumed per animal per feeding
    const FEED_QTY = { Chicken: 1, Cow: 5, Sheep: 3 };
    // XP per food item by level range (same for all animal types)
    const FEED_XP_TABLE = [
      { min: 0,  max: 2,  xp: { "Kernel Blend": 60, "Hay": 10, "NutriBarley": 20, "Mixed Grain": 30 }},
      { min: 3,  max: 5,  xp: { "Kernel Blend": 10, "Hay": 60, "NutriBarley": 20, "Mixed Grain": 30 }},
      { min: 6,  max: 9,  xp: { "Kernel Blend": 10, "Hay": 20, "NutriBarley": 60, "Mixed Grain": 30 }},
      { min: 10, max: 15, xp: { "Kernel Blend": 10, "Hay": 20, "NutriBarley": 30, "Mixed Grain": 80 }},
    ];
    // Golden animals: collectible → free feeding for that animal type
    const GOLDEN_ANIMALS = { "Gold Egg": "Chicken", "Golden Cow": "Cow", "Golden Sheep": "Sheep" };
    // Skill feed effects: skill name → per-cat feed multiplier (negative = reduction, positive = increase)
    const SKILL_FEED_EFFECTS = {
      "Efficient Feeding":    { chickens: -0.05, cows: -0.05, sheep: -0.05 },
      "Clucky Grazing":       { chickens: -0.25, cows: 0.50, sheep: 0.50 },
      "Sheepwise Diet":       { chickens: 0.50, cows: 0.50, sheep: -0.25 },
      "Cow-Smart Nutrition":  { chickens: 0.50, cows: -0.25, sheep: 0.50 },
      "Chonky Feed":          { chickens: 0.50, cows: 0.50, sheep: 0.50 },
    };

    // ── Animal Sickness System ──
    // Sickness check: once per 24h, server-side. Higher level = higher chance.
    // Rates mapped to levels from original proposal (Discussion #4300):
    // +2.5% spread per sick animal in building (not modeled, would be recursive)
    // Index = animal level (0-15). Implementation confirmed level-based.
    const SICKNESS_RATE_BY_LEVEL = [
      0,      // Lv 0  (unused)
      0,      // Lv 1  — new animal
      0,      // Lv 2  — still safe
      0.015,  // Lv 3  — 1.5%
      0.025,  // Lv 4  — 2.5%
      0.035,  // Lv 5  — 3.5%
      0.04,   // Lv 6  — 4%
      0.05,   // Lv 7  — 5%
      0.06,   // Lv 8  — 6%
      0.07,   // Lv 9  — 7%
      0.10,   // Lv 10 — 10%
      0.10,   // Lv 11
      0.10,   // Lv 12
      0.10,   // Lv 13
      0.10,   // Lv 14
      0.10,   // Lv 15
    ];
    const BARN_DELIGHT_RECIPE = { Lemon: 5, Honey: 3 };
    const BARN_DELIGHT_RECIPE_ALT = { Lemon: 4, Honey: 2 }; // with Alternate Medicine skill
    // Items that fully prevent sickness for a specific animal category
    const SICKNESS_PREVENTION = {
      "Frozen Cow": "cows", "Frozen Sheep": "sheep",
      "Summer Chicken": "chickens", "Nurse Sheep": "sheep", "Sleepy Chicken": "chickens",
    };
    // Sickness-reducing skills/items and their effects
    const SICKNESS_EFFECTS = {
      "Healthy Livestock":  { type: "rate_reduction", value: 0.50 },  // -50% sickness chance
      "Oracle Syringe":     { type: "cure_free", value: 1.0 },       // free cure (no Barn Delight)
      "Medic Apron":        { type: "cure_discount", value: 0.50 },  // half Barn Delight cost
      "Alternate Medicine": { type: "recipe_reduction" },             // cheaper recipe
    };

    // Get animal level from XP
    function getAnimalLevel(animalType, experience) {
      const thresholds = ANIMAL_LEVELS[animalType];
      if (!thresholds) return 0;
      for (let i = thresholds.length - 1; i >= 0; i--) {
        if (experience >= thresholds[i]) return i;
      }
      return 0;
    }
    // Get drops per cycle for a single animal at a given level
    function getAnimalDropsPerCycle(animalType, level) {
      const drops = ANIMAL_RESOURCE_DROP[animalType];
      const data = ANIMAL_CYCLE_DATA[animalType];
      if (!drops || !data) return {};
      const row = drops[Math.min(level, 15)] || [0, 0];
      const result = {};
      data.products.forEach((prod, i) => { result[prod] = row[i] || 0; });
      return result;
    }
    // Get level distribution summary from an animal detail list
    function getAnimalLevelDistribution(animals) {
      if (!animals || animals.length === 0) return { levels: {}, avgLevel: 0 };
      const levels = {};
      let sum = 0;
      for (const a of animals) {
        levels[a.level] = (levels[a.level] || 0) + 1;
        sum += a.level;
      }
      return { levels, avgLevel: sum / animals.length };
    }

    const RESOURCE_RESPAWN_DATA = {
      "Stone":     { respawnSec: 14400, yield: 2.2, farmKey: "stones" },  // base 2 + Native (20%×1=+0.2)
      "Iron":      { respawnSec: 28800, yield: 1.2, farmKey: "iron" },    // base 1 + Native (20%×1=+0.2)
      "Gold":      { respawnSec: 86400, yield: 1.2, farmKey: "gold" },    // base 1 + Native (20%×1=+0.2)
      "Crimstone": { respawnSec: 86400, yield: 1.4, farmKey: "crimstones" }, // native +2 every 5th dig = +0.4 avg
      "Wood":      { respawnSec: 7200,  yield: 3, farmKey: "trees" },
      "Obsidian":  { respawnSec: 259200, yield: 1, farmKey: "lavaPits" }, // 3 days
      "Oil":       { respawnSec: 72000, yield: 16.67, farmKey: "oilReserves" }, // 20h, avg yield (10+10+30)/3
    };

    // ── Lava Pit seasonal requirements (cost per ignition) ──
    const LAVA_PIT_REQUIREMENTS = {
      autumn: [
        { item: "Artichoke", qty: 30 },
        { item: "Broccoli", qty: 750 },
        { item: "Yam", qty: 1000 },
        { item: "Gold", qty: 5 },
        { item: "Crimstone", qty: 6 },
      ],
      winter: [
        { item: "Merino Wool", qty: 150 },
        { item: "Onion", qty: 400 },
        { item: "Turnip", qty: 200 },
        { item: "Crimstone", qty: 5 },
      ],
      spring: [
        { item: "Celestine", qty: 2 },
        { item: "Lunara", qty: 2 },
        { item: "Duskberry", qty: 2 },
        { item: "Rhubarb", qty: 2000 },
        { item: "Crimstone", qty: 10 },
      ],
      summer: [
        { item: "Oil", qty: 70 },
        { item: "Pepper", qty: 750 },
        { item: "Zucchini", qty: 1000 },
        { item: "Crimstone", qty: 4 },
      ],
    };

    // ── Seed costs (coins per seed) ──
    const SEED_COSTS = {
      "Sunflower": 0.01, "Potato": 0.10, "Rhubarb": 0.15, "Pumpkin": 0.20,
      "Carrot": 0.50, "Cabbage": 1.0, "Soybean": 0.50, "Beetroot": 2.0,
      "Cauliflower": 3.0, "Parsnip": 4.0, "Eggplant": 3.0, "Corn": 2.5,
      "Radish": 4.0, "Wheat": 2.0, "Kale": 7.0, "Turnip": 2.0,
      "Onion": 3.0, "Pepper": 1.0, "Zucchini": 0.10, "Yam": 0.50,
      "Broccoli": 0.50, "Artichoke": 4.0, "Barley": 10.0,
      // Fruits
      "Tomato": 5, "Blueberry": 30, "Orange": 50, "Apple": 70,
      "Banana": 70, "Lemon": 20,
      // Greenhouse
      "Grape": 160, "Rice": 240, "Olive": 320,
    };

    // ── Greenhouse oil costs per seed ──
    const GREENHOUSE_OIL_COSTS = { "Grape": 3, "Rice": 4, "Olive": 5 };

    // ── Tool costs (coins + optional materials per tool) ──
    const TOOL_COSTS = {
      "Axe":            { coins: 20 },
      "Pickaxe":        { coins: 20, materials: { Wood: 3 } },
      "Stone Pickaxe":  { coins: 20, materials: { Wood: 3, Stone: 5 } },
      "Iron Pickaxe":   { coins: 80, materials: { Wood: 3, Iron: 5 } },
      "Gold Pickaxe":   { coins: 100, materials: { Wood: 3, Gold: 3 } },
      "Oil Drill":      { coins: 100, materials: { Wood: 20, Iron: 9, Leather: 10 } },
    };

    // ── Tool → resource category mapping ──
    const TOOL_TO_CAT = {
      "Axe": "trees", "Pickaxe": "stone", "Stone Pickaxe": "iron",
      "Iron Pickaxe": "gold", "Gold Pickaxe": "crimstone", "Oil Drill": "oil",
    };

    // ── Restock gem costs ──
    const RESTOCK_GEM_COSTS = { seeds: 15, tools: 10, both: 20 };

    // ── Base stock quantities (from INITIAL_STOCK) ──
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

    // Full skill tree data from sfl.world/tools/skills
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
    };

    // Recipe ingredients for skill cost calculation — verified from sfl.world/info/cooking
    // XP values come from COOKING_RECIPES_DATA at runtime
    // Only recipes with P2P-tradeable ingredients (+ Cheese derived from Milk)
    const RECIPE_INGREDIENTS = {
      // Fire Pit
      "Pumpkin Soup":        { Pumpkin: 10 },
      "Bumpkin Broth":       { Carrot: 10, Cabbage: 5 },
      "Boiled Eggs":         { Egg: 10 },
      "Popcorn":             { Sunflower: 100, Corn: 5 },
      "Kale Stew":           { Kale: 10 },
      "Fried Tofu":          { Soybean: 15, Sunflower: 200 },
      "Kale Omelette":       { Egg: 40, Kale: 5 },
      "Rice Bun":            { Rice: 2, Wheat: 50 },
      "Antipasto":           { Olive: 2, Grape: 2 },
      "Pizza Margherita":    { Tomato: 30, Cheese: 5, Wheat: 20 },
      "Rhubarb Tart":        { Rhubarb: 3 },
      "Mashed Potato":       { Potato: 8 },
      // Kitchen
      "Sunflower Crunch":    { Sunflower: 300 },
      "Cauliflower Burger":  { Cauliflower: 15, Wheat: 5 },
      "Pancakes":            { Wheat: 10, Egg: 10, Honey: 6 },
      "Roast Veggies":       { Cauliflower: 15, Carrot: 10 },
      "Goblin's Treat":      { Pumpkin: 10, Radish: 20, Cabbage: 10 },
      "Club Sandwich":       { Sunflower: 100, Carrot: 25, Wheat: 5 },
      "Spaghetti al Limone": { Wheat: 10, Lemon: 15, Cheese: 3 },
      "Caprese Salad":       { Cheese: 1, Tomato: 25, Kale: 20 },
      "Steamed Red Rice":    { Rice: 3, Beetroot: 50 },
      "Tofu Scramble":       { Soybean: 20, Egg: 20, Cauliflower: 10 },
      "Bumpkin Salad":       { Beetroot: 20, Parsnip: 10 },
      "Fruit Salad":         { Apple: 1, Orange: 1, Blueberry: 1 },
      // Bakery
      "Lemon Cheesecake":    { Lemon: 20, Cheese: 5, Egg: 40 },
      "Honey Cake":          { Honey: 10, Wheat: 10, Egg: 20 },
      "Apple Pie":           { Apple: 5, Wheat: 10, Egg: 20 },
      "Orange Cake":         { Orange: 5, Egg: 30, Wheat: 10 },
      "Cornbread":           { Corn: 15, Wheat: 5, Egg: 10 },
      "Sunflower Cake":      { Sunflower: 1000, Wheat: 10, Egg: 30 },
      "Potato Cake":         { Potato: 500, Wheat: 10, Egg: 30 },
      "Pumpkin Cake":        { Pumpkin: 130, Wheat: 10, Egg: 30 },
      "Carrot Cake":         { Carrot: 120, Wheat: 10, Egg: 30 },
      "Cabbage Cake":        { Cabbage: 90, Wheat: 10, Egg: 30 },
      "Wheat Cake":          { Wheat: 35, Egg: 30 },
      "Cauliflower Cake":    { Cauliflower: 60, Wheat: 10, Egg: 30 },
      "Beetroot Cake":       { Beetroot: 100, Wheat: 10, Egg: 30 },
      "Parsnip Cake":        { Parsnip: 45, Wheat: 10, Egg: 30 },
      "Radish Cake":         { Radish: 25, Wheat: 10, Egg: 30 },
      "Eggplant Cake":       { Eggplant: 30, Wheat: 10, Egg: 30 },
      // Deli
      "Honey Cheddar":       { Cheese: 3, Honey: 5 },
      "Blue Cheese":         { Cheese: 2, Blueberry: 10 },
      "Blueberry Jam":       { Blueberry: 5 },
      "Sauerkraut":          { Cabbage: 20 },
      "Fermented Carrots":   { Carrot: 20 },
      "Fancy Fries":         { Sunflower: 500, Potato: 500 },
      // Smoothie Shack
      "Grape Juice":         { Grape: 5, Radish: 20 },
      "Slow Juice":          { Grape: 10, Kale: 100 },
      "Sour Shake":          { Lemon: 20 },
      "Purple Smoothie":     { Blueberry: 5, Cabbage: 10 },
      "Power Smoothie":      { Blueberry: 10, Kale: 5 },
      "Orange Juice":        { Orange: 5 },
      "Apple Juice":         { Apple: 5 },
      "Bumpkin Detox":       { Apple: 5, Orange: 5, Carrot: 10 },
      "The Lot":             { Blueberry: 1, Orange: 1, Grape: 1, Apple: 1, Banana: 1 },
      "Banana Blast":        { Banana: 10, Egg: 10 },
      "Carrot Juice":        { Carrot: 30 },
      "Quick Juice":         { Sunflower: 50, Pumpkin: 40 },
    };

    // Crop tier classification for "Basic/Medium/Advanced Crop" skill boosts
    const CROP_TIERS = {
      basic:    ["Sunflower", "Potato", "Rhubarb", "Pumpkin", "Zucchini"],
      medium:   ["Carrot", "Yam", "Cabbage", "Broccoli", "Soybean", "Beetroot", "Pepper", "Cauliflower", "Parsnip"],
      advanced: ["Eggplant", "Corn", "Onion", "Radish", "Wheat", "Turnip", "Kale", "Artichoke", "Barley"],
    };

    // ── Bud boost data (from game source) ──
    const BUD_TYPE_BOOSTS = {
      "Plaza":     [{ cats: ["crops"], cropTier: "basic", value: 0.3, type: "yield_flat" }],
      "Castle":    [{ cats: ["crops"], cropTier: "medium", value: 0.3, type: "yield_flat" }],
      "Snow":      [{ cats: ["crops"], cropTier: "advanced", value: 0.3, type: "yield_flat" }],
      "Woodlands": [{ cats: ["trees"], value: 0.2, type: "yield_flat" }],
      "Cave":      [{ cats: ["stone", "iron", "gold", "crimstone"], value: 0.2, type: "yield_flat" }],
      "Retreat":   [{ cats: ["chickens", "cows", "sheep"], value: 0.2, type: "yield_flat" }],
      "Beach":     [{ cats: ["fruits"], value: 0.2, type: "yield_flat" }],
      "Saphiro":   [{ cats: ["crops"], value: -10, type: "speed_pct" }],
      "Sea":       [{ cats: ["fishing"], pct: 10, extra: 1, type: "chance" }],
      "Port":      [], // +10% Fish XP only (non-monetary)
    };
    const BUD_STEM_BOOSTS = {
      "3 Leaf Clover":  [{ cats: ["crops"], value: 0.5, type: "yield_flat" }],
      "Acorn Hat":      [{ cats: ["trees"], value: 0.1, type: "yield_flat" }],
      "Apple Head":     [{ cats: ["fruits"], value: 0.2, type: "yield_flat" }],
      "Banana":         [{ cats: ["fruits"], value: 0.2, type: "yield_flat" }],
      "Basic Leaf":     [{ cats: ["crops"], cropTier: "basic", value: 0.2, type: "yield_flat" }],
      "Carrot Head":    [{ cats: ["crops"], product: "Carrot", value: 0.3, type: "yield_flat" }],
      "Diamond Gem":    [{ cats: ["stone", "iron", "gold", "crimstone"], value: 0.2, type: "yield_flat" }],
      "Egg Head":       [{ cats: ["chickens"], product: "Egg", value: 0.2, type: "yield_flat" }],
      "Fish Hat":       [{ cats: ["fishing"], pct: 10, extra: 1, type: "chance" }],
      "Gold Gem":       [{ cats: ["gold"], value: 0.2, type: "yield_flat" }],
      "Magic Mushroom": [{ cats: ["mushrooms"], value: 0.2, type: "yield_flat" }],
      "Miner Hat":      [{ cats: ["iron"], value: 0.2, type: "yield_flat" }],
      "Mushroom":       [{ cats: ["mushrooms"], value: 0.3, type: "yield_flat" }],
      "Ruby Gem":       [{ cats: ["stone"], value: 0.2, type: "yield_flat" }],
      "Sunflower Hat":  [{ cats: ["crops"], product: "Sunflower", value: 0.5, type: "yield_flat" }],
      "Tree Hat":       [{ cats: ["trees"], value: 0.2, type: "yield_flat" }],
    };
    const BUD_AURA_MULTIPLIERS = { "No Aura": 1, "Basic": 1.05, "Green": 1.2, "Rare": 2, "Mythical": 5 };

    // ── Hardcoded bud data (2,621 NFTs, never changes) ──
    const BUD_COUNT = 2621;
    const BUD_TYPE_NAMES = ["Beach","Castle","Cave","Plaza","Port","Retreat","Saphiro","Sea","Snow","Woodlands"];
    const BUD_STEM_NAMES = ["3 Leaf Clover","Acorn Hat","Apple Head","Axe Head","Banana","Basic Leaf","Carrot Head","Diamond Gem","Egg Head","Fish Hat","Gold Gem","Hibiscus","Magic Mushroom","Miner Hat","Mushroom","Rainbow Horn","Red Bow","Ruby Gem","Seashell","Silver Horn","Sunflower Hat","Sunflower Headband","Sunshield Foliage","Tender Coral","Tree Hat"];
    const BUD_AURA_NAMES = ["No Aura","Basic","Green","Rare","Mythical"];
    const BUD_TYPES_ENC = "66437663288399648642954165595695238181989364964338308918839080720217921906361312374745302734796685535964198940123885797739080989377504891438453746781274152788794581745850855822811844494297502621612841188079966519558341393927440901161925384124071975504230076556543868255410706573658265137126366483954451844240985066268217235027237343368282690597790796108852142387212419443398222568049324317739491399959331962911342411552504704468092880210708925172194970567608704346316238674298295421449667765652581736985864385749043736605646721188178796663799939759403109069299911076400912397942849785036701857800924136961697052701016851622871919588797420435485837724874237415468269312618077015374761447810338752613913748309778113670930819947375930362976254828338025771556314263136269004620764149895524892198427896942621067197685088650600821374900707927681241634793295162828178657288485297746093043267416956069248907206414972540126169322722226701224104880237578082114353649556247022845215644842439874481810269742121650383270172040119654897966002600465556443683369129799557207230595491835564189596193815907772052448219902571121606088479955721607454817456093321824765063446256143324660755532283616374382405804081810496665413685277868099943942063707472733712152536798892347045320162139695201780516785109689920388670863905086312946979124970400526044240191385945760143629929788522854181571055639557861110051346240259858680073065357867089742486621407483561599017952874516637337759972518179600603688882494325026044243556643714372504647001729637464484802197716393440338971759228690510642252602837154719163029109762308393479234287117565251932582554595519553209473829899747271112289549526026583660918482436961356620842045168112082021975320333227481058121366598754467693464520083847705788179017235050242189817415686034190486036745248354729565961758653194782092459616024845657566485873198056933445394513395621305679100111552536845752304222934807074641661950357820866435308406936450429766916566335412305299111313933548896505319717881322005765619966906347819231716971107629764904441059932246148063315740783580680425086116313421368541523190560675387981279423123510901377477275651577193624205374204101530958075005503869907045930901013060620969267716363943089895326138834789861190165999686278284245534803020037005499494867893226252657511361096850754329803169705386773414966779898111937265845748640880479611523366579555004739624128998664490164445121551940890759624541748553980578880580386414258583037659989959290944530052153034360056068935651703480758471308445330447593342330911756633023509235798954391302853545766067608245615927640565105260311509220940673";
    const BUD_STEMS_ENC = "mf2odlinjl53jfiaffojglnll7e5ggdlgon2blgj3dm3j2njil0nl2oh44hdk7job8bb4iblolfjo3ffbajbjbl3fonlil3gi4l3i8gl35njgegcnfnn8lnn4dam1be6l9j4bfmkbf1f3ib22g5bb3cml33cjffhnhjbg0db3oibjijjkddi8cglbggn0335bl3mnf3lm8jf1fdmbj2jj4nnlbjonllkkjid6g1o2kgmjjoibfblic8lll469iha6hf2c1i8j88b8f83ff8ig3con6m3mi5n2g3m4lhnjlgfjlfll3lglgg4k24gmo3fj1b17dfofg63fo28ndlchmb9labniei6efi8gnbg473h1f2j1jnib2b9odjn4l3fioei32m8mlgaom434d5g1m1h285nm4fj4gja1jfnnb5i2879fliigc4k32njniib17f0a3nm8fo8gn7no34nicbjoogflmij5jdi4oei2ni4ogofb3eecn3l3bbbiboj7kjbjj7lnn559oi62kdf8fafgjamfn2j2lii33fmlmh28bkmofkf2boc62lj33j8n4ii06f33fainbif1fge8fje1g3jinfiffhkb9fljieninmh4m2ggm1f4a0bmo1lin99n533dlilnibbb3nf9ib68mdc1mjiglni2ajabbjabd3a4n4n33blnk3inagblll7gbonnmngbnm7f4lff37bai8bkjg868eg2noil8gl3hlnl89333bblfg94g0jjkmjfbj4jc1jiccfjbl4hn2egd6bnjiff8ecbbci1glgbnjab2bj440g9mocag1fjjmi08mnijcmbolmmgc4li8jajildjajlmb3l17bgml4fa858b6cn42ik7ajn1l7nhmjf8if4fbgi3o6ibg1j6kbblgink0ggfelfb88lobbml3iib6ge66jejkgngilljmfaiffai3m8mb0l3fogmnc1nj8nhbjk21d8ii5nmbgljfmmh5mjf8e7mo351effgjlmjf2dohgn6b6m4m83c84n8jgjjeb1j8lffjn3mna4fb68mnn5njjgnj2lfo6eb3mllndglghibgm3ll63igneoo22f48e3enib1onf5bbnofbk22g1f33fi1jf3fgnin2mi2omon634b32dllne2b3n1lng78bn0ll3mfgimjbgdnlkcnjifbfdof0mofojll45cfinfi8gnem4jnlmb0jhmo4n2gj87emffhgablifmon3lnh4n55fd3fh4c3igb42mje3fnl8bmodbheobfnjijgclf4fa1k4nodilind4nmi44oc2i3eknj39g376ddimj02ibgfl3aii38nij6i1mi0ginlof2lk9jfmi11nhg83442b3c3n0g68bgb7ghbl8nfmlb3hlkfono73le4d4g4ijj2fo68hinlo7g3f9ggmngo3ii12ioikj2g4ldg3m4b2gll2c6f7oknk84fibmj3d4mi3bh2inojj78a3584n3cf38mj4ffef2jfb3g5no6ij13nnclfb33imenjdn3fnbfmlngeg1n5ibkbkf8al3cfhbki8gb5mfj8jl1ngkfj13onlc24n5glbbflnbf42fjllbi832kbdmobin3f4lbho5gl4blm2mi834mnff4iggoni4lnh3f680ib34jie12bgl23nf184bolnjfm37ink33jgin56ig3gg8j9mg8dmkl2m7fg8198blgffeifgfnjingjjfglff4jgjl35no2fbg3bfmgm7l3hijmgilginmgl2m6jlmjikbem36i3jo1i7g2g7jm30418nnff255bnjf08g0nhlm3lamjf32jbm1b98330i2j97dobdm1g2omii2kd83em22jn8lb9if2jf8fgb5bi3j7li3i2e0ihiijn6mjl12fe641coil8ai1doohnjnfnglo1m4fjmg6mf3fl8oninm7gbmdb6nl3b5gbkikcibnnb2ci41b3ocmejbhja6j8gkmbmf7kln2oiif6hfhg6lijfog8ilmmflb8hfg3834i2ifg379lobml9loba3ibdii5mo37fgbjme3l5h4hodlemfjj97kndmndjf8clbb6n1bjolm5mib9an3lgkb7lg6mo7b88j1m2735nh6lfna4m76ea3ol2njhn25l3f24dll24g5jo6814abif4jjj9jblbdfnci8jd248n79gnj7n7dge2i3ggmjdi6gigj31m1f742g6nf66gf4anaomgfoho8nbaf25bbjjo3lnilhbjffik3jgb4l9lij2gcln4cbgfgie4efmj4i6bnmnniih51lfnn8ko7n2162hjd89ggb3fjl6lnk338hggooljb6dmangjn4j8l26jmhmd322nbb592o2b321g13jlo6m85khgj3mbi18oighi9janijf7mii0lbmjfng8mlgojbcli0g57n3b3f36nflomkigkekh5giilgm43jghki4abc3gml4bl8bblj893lkfaf0b8jlfm3gi8jm71n2gi1g2fmo4llf77ono24eoiingifn7ffj1llfj34n6gfiin3dkm3iam1ff";
    const BUD_AURAS_ENC = "10001110010001101104110200102000100124021100111011003000000000111141010000110201100110303011111110310201300010101001010110110200100110003010010100101011420033003200200132110110101000000412000202104110211111102202101110101210100010100001121103031100230210000001113012100101103010010031231001110100000212101011011100022100101000111110220000100101201110001010113100103300012100120021022100100000103000010001100101000100011011310112004101100100200000110000000000000210100121200011000012021111111112010112010011102120100010030000001000112000200221111000021021111201000002000021331110130101120020110110011101211110100000111001211104011103000101111010001110210112000110101001000212201200203020000010101120413000111001011101333100001200210110200320100200000000000200201100111200010120001110011100100000011110310102100201210001001012010101011120000201301113001000100113001002000001242110111101100000100000010100201101303031004111112220010113010030000021101110120100010003101121112000000220020000201131020000200202310100010101001100110101131001021100000341110000000300001111013121111111011100002100001221110111110000003020010012010003100221000112000200000140124110030000110301001002120010103200120021001110001021104011020132101010100111102100030112101103000023200010000111000111102101000111010133011020210110110120020000111000011111000101110000002010113010000001110021110020001020122011102010300210201111010001002011101000102000110200100010100000010022021200010100230021120101013000001000010100001001010110000200102111010100211122202121011201111021010100100111001112101211323000123111000010010000110101101100003321400100120001111020201010001010101110001110001000020100331011011010111012000100310100011031221001211110412200102100111111020001204001011000122012000110102303112421220020011010011010011100100001011010101104101000010111201000120311001000001111000001010410011001000102111010111201000001001001002111000100033010001201000100021010001003010210000100210001020101100010110100001120303130200110002110103111000103021111100004101020241001110000101201011000111013142210002122210300100103000110011020101000012100221012100200310110010220000003000221100001130000000000130011120100004112022120011000000100100111102010121300200000002200440312113002021011010003011100010200102001011021110000011122011011014000110120000301101101001210321101041111100003030401112000000211000020112010000000101011112101001000021000001000110100131010000003110001001010200131001000100100001113000121101040002012110120031030101120001100010010000100113000021000101000102201021100000001200010010110000011110241100421021200000121102001000101100000011211021200101";
    function decodeBud(id) {
      if (id < 1 || id > BUD_COUNT) return null;
      const i = id - 1;
      const typeIdx = parseInt(BUD_TYPES_ENC[i], 10);
      const sc = BUD_STEMS_ENC[i];
      const stemIdx = sc >= "0" && sc <= "9" ? parseInt(sc) : sc.charCodeAt(0) - 97 + 10;
      const auraIdx = parseInt(BUD_AURAS_ENC[i], 10);
      return { id, type: BUD_TYPE_NAMES[typeIdx], stem: BUD_STEM_NAMES[stemIdx], aura: BUD_AURA_NAMES[auraIdx] };
    }

    // Faction shop items priced in Marks (from factionShop.ts)
    // 100 Marks = 1 SFL (1 Mark = 0.01 SFL)
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

    // Crafted ingredient recipes — derive price from sub-ingredients
    const CRAFTED_INGREDIENT_RECIPES = {
      "Cheese": { "Milk": 3 },
    };

    // Calculate the SFL cost per skill point for current bumpkin
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

    // Power category definitions
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
      cooking:    { label: "COOKING / XP",  emoji: "🍳", selector: null, quantifiable: false },
      coins:      { label: "COINS / SFL",   emoji: "🪙", selector: null, quantifiable: false },
      protection: { label: "PROTECTION",    emoji: "🛡️", selector: null, quantifiable: false },
      other:      { label: "OTHER",         emoji: "❓", selector: null, quantifiable: false },
    };

    // Map product names → category IDs
    const PRODUCT_TO_CATEGORY = {};
    Object.keys(CROP_GROW_DATA).forEach(k => PRODUCT_TO_CATEGORY[k] = "crops");
    Object.keys(FRUIT_GROW_DATA).forEach(k => PRODUCT_TO_CATEGORY[k] = "fruits");
    Object.keys(GREENHOUSE_GROW_DATA).forEach(k => PRODUCT_TO_CATEGORY[k] = "greenhouse");
    ["Egg", "Feather"].forEach(k => PRODUCT_TO_CATEGORY[k] = "chickens");
    ["Milk", "Leather"].forEach(k => PRODUCT_TO_CATEGORY[k] = "cows");
    ["Wool", "Merino Wool"].forEach(k => PRODUCT_TO_CATEGORY[k] = "sheep");
    PRODUCT_TO_CATEGORY["Honey"] = "bees";
    PRODUCT_TO_CATEGORY["Stone"] = "stone";
    PRODUCT_TO_CATEGORY["Iron"] = "iron";
    PRODUCT_TO_CATEGORY["Gold"] = "gold";
    PRODUCT_TO_CATEGORY["Crimstone"] = "crimstone";
    PRODUCT_TO_CATEGORY["Obsidian"] = "obsidian";
    PRODUCT_TO_CATEGORY["Oil"] = "oil";
    PRODUCT_TO_CATEGORY["Wood"] = "trees";
    PRODUCT_TO_CATEGORY["Fish"] = "fishing";
    PRODUCT_TO_CATEGORY["Wild Mushroom"] = "mushrooms";
    PRODUCT_TO_CATEGORY["Red Pepper"] = "crops"; // alias for Pepper

    // Build dynamic product regex alternation (longest first to prevent partial match)
    const ALL_PRODUCTS_SORTED = Object.keys(PRODUCT_TO_CATEGORY).sort((a,b) => b.length - a.length);
    const PROD_ALT = ALL_PRODUCTS_SORTED.join("|");
    const PROD_ALT_RX = new RegExp(`^([+-]?\\d+\\.?\\d*)%\\s+(${PROD_ALT})\\b`, 'i');
    const PROD_FLAT_RX = new RegExp(`^([+-]?\\d+\\.?\\d*)\\s+(${PROD_ALT})\\b`, 'i');

    // Boost text parser rules (ordered by priority)
    // Item-name-based effect overrides (when buff text can't be regex-parsed reliably)
    const BOOST_EFFECT_OVERRIDES = {
      "Green Amulet": [
        { type: "chance", pct: 10, extra: 10, cat: "crops", raw: "10% chance +10 Crop yield" },
        { type: "chance", pct: 10, extra: 10, cat: "greenhouse", product: "Rice", raw: "10% chance +10 Rice (greenhouse)" },
        { type: "chance", pct: 10, extra: 10, cat: "greenhouse", product: "Olive", raw: "10% chance +10 Olive (greenhouse)" },
      ],
      "Oracle Syringe": [
        { type: "sickness_reduction", value: 1.0, cat: "chickens", raw: "Free cure for sick animals" },
        { type: "sickness_reduction", value: 1.0, cat: "cows", raw: "Free cure for sick animals" },
        { type: "sickness_reduction", value: 1.0, cat: "sheep", raw: "Free cure for sick animals" },
      ],
      "Medic Apron": [
        { type: "sickness_reduction", value: 0.5, cat: "chickens", raw: "-50% Barn Delight cost" },
        { type: "sickness_reduction", value: 0.5, cat: "cows", raw: "-50% Barn Delight cost" },
        { type: "sickness_reduction", value: 0.5, cat: "sheep", raw: "-50% Barn Delight cost" },
      ],
      "Frozen Cow": [
        { type: "sickness_prevention", value: 1.0, cat: "cows", raw: "Prevents cow sickness" },
      ],
      "Frozen Sheep": [
        { type: "sickness_prevention", value: 1.0, cat: "sheep", raw: "Prevents sheep sickness" },
      ],
      "Summer Chicken": [
        { type: "sickness_prevention", value: 1.0, cat: "chickens", raw: "Prevents chicken sickness" },
      ],
      "Nurse Sheep": [
        { type: "sickness_prevention", value: 1.0, cat: "sheep", raw: "Prevents sheep sickness" },
      ],
      "Sleepy Chicken": [
        { type: "sickness_prevention", value: 1.0, cat: "chickens", raw: "Prevents chicken sickness" },
      ],
      "Gold Beetle": [
        { type: "yield_flat", value: 0.1, cat: "gold", raw: "+0.1 Gold" },
      ],
      "Stone Beetle": [
        { type: "yield_flat", value: 0.1, cat: "stone", raw: "+0.1 Stone" },
      ],
      "Iron Beetle": [
        { type: "yield_flat", value: 0.1, cat: "iron", raw: "+0.1 Iron" },
      ],
      "Gilded Swordfish": [
        { type: "yield_flat", value: 0.1, cat: "gold", raw: "+0.1 Gold" },
      ],
      "Volcano Gnome": [
        { type: "yield_flat", value: 0.1, cat: "stone", raw: "+0.1 Stone (Volcano Island)" },
        { type: "yield_flat", value: 0.1, cat: "iron", raw: "+0.1 Iron (Volcano Island)" },
        { type: "yield_flat", value: 0.1, cat: "gold", raw: "+0.1 Gold (Volcano Island)" },
      ],
    };

    // IMPORTANT: Specific category rules (Crop, Flower, Fruit, Tree, Animal, Greenhouse)
    // must come BEFORE the generic product-name rules (PROD_ALT_RX, PROD_FLAT_RX).
    // Chance rules must come BEFORE flat yield rules to prevent "X% Chance +N Product"
    // being captured as "+N Product" flat yield.
    const BOOST_PARSE_RULES = [
      // ── EXCLUSION RULES (match first, return qualitative to prevent misparse) ──
      // "Oil in Crop Machine" / "oil tank" → crop machine oil consumption, NOT oil reserve yield
      { rx: /Oil\s+in\s+Crop\s+Machine/i,
        fn: m => ({ type: "qualitative", cat: "other", raw: m[0] }) },
      { rx: /oil\s+tank\s+in\s+crop/i,
        fn: m => ({ type: "qualitative", cat: "other", raw: m[0] }) },
      // "seed stock" / "seed cost" → not yield (e.g. "+10 Tomato and Lemon seed stock")
      { rx: /\bseed\s+stock\b/i,
        fn: m => ({ type: "qualitative", cat: "other", raw: m[0] }) },
      // "requires N Product" / "instead" → recipe change, not yield
      { rx: /\brequires?\b.*\d+/i,
        fn: m => ({ type: "qualitative", cat: "other", raw: m[0] }) },
      // Sickness reduction: "-50% chance of sickness" etc.
      { rx: /([+-]?\d+)%\s+(?:chance\s+of\s+)?sickness/i,
        fn: m => [
          { type: "sickness_reduction", value: Math.abs(parseInt(m[1])) / 100, cat: "chickens", raw: m[0] },
          { type: "sickness_reduction", value: Math.abs(parseInt(m[1])) / 100, cat: "cows", raw: m[0] },
          { type: "sickness_reduction", value: Math.abs(parseInt(m[1])) / 100, cat: "sheep", raw: m[0] },
        ]},
      // "instead" in context of recipe substitution
      { rx: /\binstead\b/i,
        fn: m => ({ type: "qualitative", cat: "other", raw: m[0] }) },
      // "XP" as the goal — route to correct category based on context
      { rx: /([+-]?\d+\.?\d*)%?\s+([\w\s]*?)\bXP\b/i,
        fn: m => {
          const ctx = (m[2] || "").trim().toLowerCase();
          let cat = "other";
          if (/\bcow\b/.test(ctx)) cat = "cows";
          else if (/\bchicken\b/.test(ctx)) cat = "chickens";
          else if (/\bsheep\b/.test(ctx)) cat = "sheep";
          else if (/\banimal\b/.test(ctx)) cat = "chickens";
          else if (/\bfish\b/.test(ctx)) cat = "fishing";
          else if (/\b(?:cook|food|kitchen|bake)\b/.test(ctx)) cat = "cooking";
          const result = { type: "qualitative", cat, raw: m[0] };
          if (cat === "chickens" && /\banimal\b/.test(ctx)) {
            result.alsoApply = ["cows", "sheep"];
          }
          return result;
        }},
      // "N% Onion Seed Coin cost" → cost reduction, not yield
      { rx: /\d+%\s+[\w\s]+(?:Seed\s+)?Coin\s+cost/i,
        fn: m => ({ type: "qualitative", cat: "other", raw: m[0] }) },
      // "N% rod cost" / "N% seeds cost" → qualitative cost reduction
      { rx: /\d+%\s+(?:rod|seeds?|flower\s+seeds?)\s+cost/i,
        fn: m => ({ type: "qualitative", cat: "other", raw: m[0] }) },

      // ── DISABLED IF (superseded by stronger item) ──
      // "Disabled if Apprentice Beaver or Foreman Beaver Active"
      { rx: /disabled\s+if\s+(.+?)\s+active$/i,
        fn: m => {
          const names = m[1].split(/\s+or\s+/i).map(n => n.trim()).filter(Boolean);
          return { type: "disabled_by", names };
        }},

      // ── FRUIT STUMP WOOD ──
      // "Chop fruit without axes" (No Axe No Worries) → saves axe cost per fruit lifecycle
      { rx: /chop\s+fruit\s+without\s+axes?/i,
        fn: m => ({ type: "fruit_free_chop", cat: "fruits" }) },
      // "±N Wood from fruit" → wood yield per fruit stump chop
      { rx: /^([+-]?\d+\.?\d*)\s+Wood\s+from\s+fruit/i,
        fn: m => ({ type: "fruit_stump_wood", value: parseFloat(m[1]), cat: "fruits" }) },

      // ── FREE TOOL (zero tool cost for a category) ──
      // "Mine stone without pickaxes" (Quarry) → tool cost = 0 for stone
      { rx: /mine\s+\w+\s+without\s+pickaxes?/i,
        fn: m => ({ type: "free_tool", cat: "stone" }) },
      // "Chop Trees without Axes" (Foreman Beaver) → tool cost = 0 for trees
      { rx: /chop\s+\w+\s+without\s+axes?/i,
        fn: m => ({ type: "free_tool", cat: "trees" }) },

      // ── CONDITIONAL YIELD (5th mine, 3rd drill, chance x3) ──
      // "+N Product on 3rd drill" → effective yield = N/3 (Stag Shrine oil bonus)
      { rx: /\+(\d+\.?\d*)\s+([\w\s]+?)\s+on\s+3rd/i,
        fn: m => {
          const prod = m[2].trim();
          const cat = PRODUCT_TO_CATEGORY[prod] || "other";
          return { type: "yield_flat", value: parseFloat(m[1]) / 3, cat, product: prod, conditional: "3rd drill" };
        }},
      // "+N Product on 5th mine/consecutive" → effective yield = N/5
      { rx: /\+(\d+\.?\d*)\s+([\w\s]+?)\s+on\s+5th/i,
        fn: m => {
          const prod = m[2].trim();
          const cat = PRODUCT_TO_CATEGORY[prod] || "other";
          return { type: "yield_flat", value: parseFloat(m[1]) / 5, cat, product: prod, conditional: "5th mine" };
        }},
      // "N% chance x3 Product yield" → effective = (pct/100) * (3-1) = pct/100 * 2 extra
      { rx: /(\d+\.?\d*)%\s+chance\s+x(\d+)\s+(\w+)/i,
        fn: m => {
          const prod = m[3].trim();
          const cat = PRODUCT_TO_CATEGORY[prod] || "other";
          const pct = parseFloat(m[1]);
          const mult = parseFloat(m[2]);
          // Effective extra yield = pct% × (mult - 1) × baseYield (use 1 as proxy)
          return { type: "yield_flat", value: pct / 100 * (mult - 1), cat, product: prod, conditional: `${pct}% x${mult}` };
        }},
      // "1/N chance +X Product" → effective = X / N (e.g., Golden Sunflower: "1/700 chance +0.35 Gold")
      { rx: /1\/(\d+)\s+chance\s+\+?(\d+\.?\d*)\s+([\w\s]+?)$/i,
        fn: m => {
          const n = parseInt(m[1]);
          const extra = parseFloat(m[2]);
          const prodRaw = m[3].trim();
          const cat = PRODUCT_TO_CATEGORY[prodRaw] || "other";
          return { type: "yield_flat", value: extra / n, cat, product: prodRaw, conditional: `1/${n} chance` };
        }},
      // "+N fish, X% chance +N" → combined fishing yield (Frenzied Fish)
      { rx: /\+(\d+\.?\d*)\s+fish.*?(\d+\.?\d*)%\s+chance\s+\+(\d+\.?\d*)/i,
        fn: m => {
          const flat = parseFloat(m[1]);
          const pct = parseFloat(m[2]);
          const extra = parseFloat(m[3]);
          return { type: "yield_flat", value: flat + (pct / 100) * extra, cat: "fishing", conditional: `+${flat} + ${pct}% ×${extra}` };
        }},

      // ── OIL SPECIFIC (before generic speed rules) ──
      // "Drill oil without Oil Drills" (Infernal Drill) → free tool for oil
      { rx: /drill\s+oil\s+without/i,
        fn: m => ({ type: "free_tool", cat: "oil" }) },
      // "-20% Oil refill time" (Oil Be Back skill), "-50% Oil recovery time" (Dev Wrench)
      { rx: /([+-]?\d+\.?\d*)%\s+Oil\s+(?:refill|recovery|respawn)\s+time/i,
        fn: m => ({ type: "speed_pct", value: parseFloat(m[1]), cat: "oil" }) },
      // "×0.5 Oil recovery time" (Dev Wrench multiplier form)
      { rx: /[×x](\d+\.?\d*)\s+Oil\s+(?:refill|recovery|respawn)\s+time/i,
        fn: m => ({ type: "speed_mult", value: parseFloat(m[1]), cat: "oil" }) },
      // "Oil Drill uses Wool instead of Leather" (Oil Rig skill) → qualitative
      { rx: /Oil\s+Drill\s+uses\s+Wool/i,
        fn: m => ({ type: "qualitative", cat: "oil", raw: m[0] }) },
      // "-1 Oil for greenhouse" (Slick Saver) → handled via stockMods, not yield
      { rx: /Oil\s+for\s+greenhouse/i,
        fn: m => ({ type: "qualitative", cat: "greenhouse", raw: m[0] }) },

      // ── LAVA PIT SPECIFIC (before generic speed rules) ──
      // "-50% Lava Pit Time" (Obsidian Necklace, Magma Stone) → speed for obsidian
      { rx: /([+-]?\d+\.?\d*)%\s+Lava\s+Pit\s+Time/i,
        fn: m => ({ type: "speed_pct", value: parseFloat(m[1]), cat: "obsidian" }) },
      // "-50% Lava Pit resources" (Lava Swimwear) → cost reduction for obsidian
      { rx: /([+-]?\d+\.?\d*)%\s+Lava\s+Pit\s+resources?/i,
        fn: m => ({ type: "lava_cost_reduction", value: Math.abs(parseFloat(m[1])) / 100, cat: "obsidian" }) },

      // ── CATEGORY-LEVEL SPEED RULES (before generic product rule) ──
      // Basic/Medium/Advanced Crop growth time: "-10% Advanced Crop Growth Time"
      { rx: /([+-]?\d+\.?\d*)%\s+(Basic|Medium|Advanced)\s+Crop\s+(?:Growth|Growing|Cooldown|Production)\s+Time/i,
        fn: m => ({ type: "speed_pct", value: parseFloat(m[1]), cat: "crops", cropTier: m[2].toLowerCase() }) },
      // Generic crop growth: "-10% Crop Growth Time"
      { rx: /([+-]?\d+\.?\d*)%\s+Crop\s+(?:Growth|Growing|Cooldown|Production)\s+Time/i,
        fn: m => ({ type: "speed_pct", value: parseFloat(m[1]), cat: "crops" }) },
      // "+1 Extra Fruit Harvest" (Immortal Pear, Pear Turbocharge) → more harvests per seed
      { rx: /\+(\d+)\s+Extra\s+Fruit\s+Harvest/i,
        fn: m => ({ type: "extra_harvest", value: parseInt(m[1]), cat: "fruits" }) },
      // Fruit growth: "-10% Fruit Growth Time", "-20% Fruit Patch Growth Time"
      { rx: /([+-]?\d+\.?\d*)%\s+Fruit\s*(?:Patch\s+)?(?:Growth|Growing|Cooldown|Production)\s+Time/i,
        fn: m => ({ type: "speed_pct", value: parseFloat(m[1]), cat: "fruits" }) },
      // Flower growth %: "-10% Flower Growth Time"
      { rx: /([+-]?\d+\.?\d*)%\s+Flower\s+(?:Growth|Growing|Cooldown|Production)\s+Time/i,
        fn: m => ({ type: "speed_pct", value: parseFloat(m[1]), cat: "flowers" }) },
      // Flower growth multiplier: ×0.9 Flower Growing Time
      { rx: /[×x](\d+\.?\d*)\s+Flower\s+(?:Growth|Growing)\s+Time/i,
        fn: m => ({ type: "speed_mult", value: parseFloat(m[1]), cat: "flowers" }) },
      // Tree recovery: "-10% Tree Recovery Time"
      { rx: /([+-]?\d+\.?\d*)%\s+Tree\s+(?:Recovery|Respawn)\s+Time/i,
        fn: m => ({ type: "speed_pct", value: parseFloat(m[1]), cat: "trees" }) },
      // Greenhouse growth time: "-5% Greenhouse Growth Time"
      { rx: /([+-]?\d+\.?\d*)%\s+Greenhouse\s+(?:Growth|Growing|Production)\s+Time/i,
        fn: m => ({ type: "speed_pct", value: parseFloat(m[1]), cat: "greenhouse" }) },
      // Generic animal time / sleep: "-10% Animal sleep time"
      { rx: /([+-]?\d+\.?\d*)%\s+Animal\s+(?:sleep\s+|production\s+)?time/i,
        fn: m => ({ type: "speed_pct", value: parseFloat(m[1]), cat: "chickens", alsoApply: ["cows", "sheep"] }) },
      // Specific animal time: "-10% Chicken Time", "-25% Sheep Production Time"
      { rx: /([+-]?\d+\.?\d*)%\s+(Chicken|Cow|Sheep)\s+.*(?:Time|time)/i,
        fn: m => {
          const key = m[2].charAt(0).toUpperCase() + m[2].slice(1).toLowerCase();
          const animalCats = { "Chicken": "chickens", "Cow": "cows", "Sheep": "sheep" };
          return { type: "speed_pct", value: parseFloat(m[1]), cat: animalCats[key] || "other" };
        }},
      // Specific product growth/cooldown time: "-20% Pumpkin Growth Time", "-20% Crimstone Cooldown Time"
      // ONLY matches if product is in PRODUCT_TO_CATEGORY — unknown products fall through
      { rx: /([+-]?\d+\.?\d*)%\s+([\w\s]+?)\s+(?:Growth|Growing|Cooldown|Recovery|Respawn|Production|Sleep)\s+Time/i,
        fn: m => {
          const prod = m[2].trim();
          const cat = PRODUCT_TO_CATEGORY[prod];
          if (cat) return { type: "speed_pct", value: parseFloat(m[1]), cat, product: prod };
          // Try animal name
          const animalCats = { chicken: "chickens", cow: "cows", sheep: "sheep" };
          const aCat = animalCats[prod.toLowerCase()];
          if (aCat) return { type: "speed_pct", value: parseFloat(m[1]), cat: aCat };
          // Unknown product → return null to let next rule try
          return null;
        }},

      // ── CHANCE RULES (BEFORE yield rules to prevent "X% chance +N Fruit yield" being caught as flat yield) ──
      // "N% chance +N food from Building" (cooking-related chance) — BEFORE generic
      { rx: /(\d+\.?\d*)%\s+chance\s+\+(\d+\.?\d*)\s+food/i,
        fn: m => ({ type: "chance", pct: parseFloat(m[1]), extra: parseFloat(m[2]), cat: "cooking", product: "food" }) },
      // "20% Chance +1 Egg", "3% Chance of +10 Potato", "10% chance for +1 Flower", "20% chance +1 Fruit yield"
      { rx: /(\d+\.?\d*)%\s+[Cc]hance.*?\+(\d+\.?\d*)\s+([\w\s]+?)(?:\s+yield)?$/i,
        fn: m => {
          const prodRaw = m[3].trim();
          const prodClean = prodRaw.replace(/\s+from\s+.+$/i, '').trim();
          const CHANCE_CAT_MAP = {
            "flower": "flowers", "fruit": "fruits", "greenhouse": "greenhouse",
            "greenhouse produce": "greenhouse",
            "basic fish": "fishing", "advanced fish": "fishing", "expert fish": "fishing",
            "basic": "fishing", "advanced": "fishing", "expert": "fishing",
            "fish": "fishing", "crop": "crops", "food": "cooking",
          };
          let cat = PRODUCT_TO_CATEGORY[prodRaw] || PRODUCT_TO_CATEGORY[prodClean];
          if (!cat) cat = CHANCE_CAT_MAP[prodRaw.toLowerCase()] || CHANCE_CAT_MAP[prodClean.toLowerCase()];
          if (!cat) cat = "other";
          return { type: "chance", pct: parseFloat(m[1]), extra: parseFloat(m[2]), cat, product: prodClean };
        }},

      // ── CATEGORY-LEVEL YIELD RULES (all anchored with ^ to prevent partial match) ──
      // Crop yield %: "+20% Crop Yield"
      { rx: /^([+-]?\d+\.?\d*)%\s+Crop\s+Yield/i,
        fn: m => ({ type: "yield_pct", value: parseFloat(m[1]), cat: "crops" }) },
      // Basic/Medium/Advanced Crop yield flat: "+0.1 Basic Crop yield"
      { rx: /^([+-]?\d+\.?\d*)\s+(Basic|Medium|Advanced)\s+Crop\s+yield/i,
        fn: m => ({ type: "yield_flat", value: parseFloat(m[1]), cat: "crops", cropTier: m[2].toLowerCase() }) },
      // Conditional crop yield: "+0.1 Crop yield after pollination" (Pollen Power Up)
      { rx: /^([+-]?\d+\.?\d*)\s+Crop\s+yield\s+after\s+pollination/i,
        fn: m => ({ type: "yield_flat", value: parseFloat(m[1]), cat: "crops", conditional: "after pollination" }) },
      // Generic crop yield flat: "+0.5 crop yield", "+3 Crops"
      { rx: /^([+-]?\d+\.?\d*)\s+[Cc]rops?\s*(?:yield)?/i,
        fn: m => ({ type: "yield_flat", value: parseFloat(m[1]), cat: "crops" }) },
      // Fruit yield %: "+10% Fruit Yield"
      { rx: /^([+-]?\d+\.?\d*)%\s+Fruit\s+Yield/i,
        fn: m => ({ type: "yield_pct", value: parseFloat(m[1]), cat: "fruits" }) },
      // Fruit yield flat: "+0.1 Fruit yield", "+0.1 Fruit Patch Yield"
      { rx: /^([+-]?\d+\.?\d*)\s+Fruit\s*(?:Patch\s+)?[Yy]ield/i,
        fn: m => ({ type: "yield_flat", value: parseFloat(m[1]), cat: "fruits" }) },
      // Greenhouse yield flat: "+0.1 Greenhouse yield", "+2 Greenhouse Produce"
      { rx: /^([+-]?\d+\.?\d*)\s+Greenhouse\s+(?:yield|[Pp]roduce)/i,
        fn: m => ({ type: "yield_flat", value: parseFloat(m[1]), cat: "greenhouse" }) },
      // Animal yield %: "+10% Animal Yield"
      { rx: /^([+-]?\d+\.?\d*)%\s+Animal\s+Yield/i,
        fn: m => ({ type: "yield_pct", value: parseFloat(m[1]), cat: "chickens", alsoApply: ["cows", "sheep"] }) },
      // Animal produce flat: "+0.25 Animal Produce"
      { rx: /^([+-]?\d+\.?\d*)\s+Animal\s+[Pp]roduce/i,
        fn: m => ({ type: "yield_flat", value: parseFloat(m[1]), cat: "chickens", alsoApply: ["cows", "sheep"] }) },

      // ── SPECIFIC PRODUCT YIELD (dynamic product list, already ^ anchored) ──
      // Specific product yield %: "+10% Egg Yield", "+20% Pumpkin", "+10% Sunflower"
      { rx: PROD_ALT_RX,
        fn: m => {
          const cat = PRODUCT_TO_CATEGORY[m[2]] || "other";
          return { type: "yield_pct", value: parseFloat(m[1]), cat, product: m[2] };
        }},
      // Flat yield: "+0.1 Stone", "+1 Egg", "+0.1 Crimstone" (dynamic product list, longest first)
      { rx: PROD_FLAT_RX,
        fn: m => {
          const cat = PRODUCT_TO_CATEGORY[m[2]] || "other";
          return { type: "yield_flat", value: parseFloat(m[1]), cat, product: m[2] };
        }},

      // ── FISHING ──
      { rx: /(\d+)\s+daily/i,
        fn: m => ({ type: "daily_flat", value: parseFloat(m[1]), cat: "fishing" }) },
      // ── XP boosts ──
      { rx: /([+-]?\d+\.?\d*)%?\s*(Cook|Bake|Food|Meal|Dish|Kitchen|Delivery)\b/i,
        fn: m => ({ type: "qualitative", cat: "cooking", raw: m[0] }) },
      // ── Coin / SFL boosts ──
      { rx: /(Coin|SFL|Sell\s+Price|Revenue)/i,
        fn: m => ({ type: "qualitative", cat: "coins", raw: m[0] }) },
      // ── Protection ──
      { rx: /(Protect|Guard|Shield|Disaster|Repel)/i,
        fn: m => ({ type: "qualitative", cat: "protection", raw: m[0] }) },
      // ── Bee/Honey-specific ──
      { rx: /([+-]?\d+\.?\d*)%?\s*Honey/i,
        fn: m => {
          const v = parseFloat(m[1]);
          if (isNaN(v)) return { type: "qualitative", cat: "bees", raw: m[0] };
          return m[0].includes("%") ? { type: "yield_pct", value: v, cat: "bees" }
                                     : { type: "yield_flat", value: v, cat: "bees", product: "Honey" };
        }},
      // ── Cost reduction: "-20% axe cost", "-20% pickaxe cost" ──
      { rx: /([+-]?\d+\.?\d*)%\s+(axe|pickaxe)\s+cost/i,
        fn: m => {
          const val = Math.abs(parseFloat(m[1])) / 100;
          const tool = m[2].toLowerCase();
          if (tool === "axe") {
            return { type: "cost_reduction", value: val, cat: "trees", tool: "Axe" };
          } else {
            return { type: "cost_reduction", value: val, cat: "stone", tool: "Pickaxe", alsoApply: ["iron", "gold", "crimstone"] };
          }
        }},
      // ── Feed reduction (collectibles: Fat Chicken, Cluckulator, Infernal Bullwhip, etc.) ──
      // Multi-animal: "-50% feed for Sheep and Cow"
      { rx: /(\d+\.?\d*)%\s+(?:less\s+)?feed(?:ing)?\s+(?:cost\s+)?(?:for\s+|to\s+feed\s+(?:a\s+)?)?(\w+)\s+and\s+(\w+)/i,
        fn: m => {
          const pct = Math.abs(parseFloat(m[1]));
          const catMap = { chicken: "chickens", chickens: "chickens", cow: "cows", cows: "cows", sheep: "sheep" };
          const cat1 = catMap[m[2].toLowerCase()], cat2 = catMap[m[3].toLowerCase()];
          if (cat1) return { type: "feed_reduction", value: -pct / 100, cat: cat1, alsoApply: cat2 ? [cat2] : [] };
          return { type: "qualitative", cat: "other", raw: m[0] };
        }},
      // Single animal: "-10% feed for Chicken"
      { rx: /(\d+\.?\d*)%\s+(?:less\s+)?feed(?:ing)?\s+(?:cost\s+)?(?:for\s+|to\s+feed\s+(?:a\s+)?)?(\w+)/i,
        fn: m => {
          const pct = Math.abs(parseFloat(m[1]));
          const target = m[2].toLowerCase();
          const catMap = { chicken: "chickens", chickens: "chickens", cow: "cows", cows: "cows", sheep: "sheep" };
          const cat = catMap[target];
          if (!cat) return { type: "qualitative", cat: "other", raw: m[0] };
          return { type: "feed_reduction", value: -pct / 100, cat };
        }},
      // ── Mushroom-specific ──
      { rx: /^([+-]?\d+\.?\d*)\s+Wild\s+Mushroom/i,
        fn: m => ({ type: "yield_flat", value: parseFloat(m[1]), cat: "mushrooms", product: "Wild Mushroom" }) },
    ];

    // ═══════════════════════════════════════
    //  GLOBALS
    // ═══════════════════════════════════════

    let FARM_ID, LIMIT, FLOWER_BEDS, TRAP_COUNT;
    let lastInventory = null, lastInProgress = null;
    let cachedFarmData = null;
    let configExpanded = false;
    let growingTimerInterval = null;
    let pbTimerInterval = null;

    // ═══════════════════════════════════════
    //  ROUTER
    // ═══════════════════════════════════════

    function getPage() {
      const p = new URLSearchParams(window.location.search);
      const page = p.get("page");
      if (page && PAGES.includes(page)) return page;
      const cfg = getConfig();
      return cfg.farm ? "dashboard" : "hub";
    }

    function navigateTo(page) {
      const url = new URL(window.location);
      url.searchParams.set("page", page);
      history.pushState(null, "", url);
      configExpanded = false;
      main();
    }

    window.addEventListener("popstate", () => main());

    // ═══════════════════════════════════════
    //  CONFIG (localStorage + URL)
    // ═══════════════════════════════════════

    function migrateApiKey() {
      const p = new URLSearchParams(window.location.search);
      let changed = false;
      // Clean up legacy URL params
      for (const legacy of ["key", "sunpetal"]) {
        if (p.has(legacy)) { p.delete(legacy); changed = true; }
      }
      // Clean up localStorage key (no longer needed)
      localStorage.removeItem("sfl_api_key");
      if (changed) {
        const newUrl = window.location.pathname + (p.toString() ? "?" + p.toString() : "");
        history.replaceState(null, "", newUrl);
      }
    }

    function getConfig() {
      const p = new URLSearchParams(window.location.search);
      const urlFarm = p.get("farm");
      const storedFarm = localStorage.getItem("sfl_farm_id") || "";
      const farm = urlFarm || storedFarm || DEFAULTS.farm;
      if (urlFarm) localStorage.setItem("sfl_farm_id", urlFarm);
      const urlLimit = p.get("limit");
      const storedLimit = localStorage.getItem("sfl_limit") || "";
      const limit = parseInt(urlLimit || storedLimit || DEFAULTS.limit, 10) || 5;
      if (urlLimit) localStorage.setItem("sfl_limit", urlLimit);
      return { farm, limit };
    }

    function saveConfig(farm, limit) {
      const p = new URLSearchParams(window.location.search);
      if (farm) { p.set("farm", farm); localStorage.setItem("sfl_farm_id", farm); }
      else { p.delete("farm"); localStorage.removeItem("sfl_farm_id"); }
      if (limit) { p.set("limit", limit); localStorage.setItem("sfl_limit", limit); }
      // Clean up legacy params
      p.delete("sunpetal");
      p.delete("key");
      // Preserve page param
      const page = p.get("page");
      if (!page) p.set("page", getPage());
      const newURL = window.location.pathname + "?" + p.toString();
      history.replaceState(null, "", newURL);
    }

    function applyConfig() {
      const farm = document.getElementById("cfg-farm").value.trim();
      const limit = document.getElementById("cfg-limit").value.trim();
      if (!farm) return;
      saveConfig(farm, limit);
      cachedFarmData = null;
      configExpanded = false;
      main();
    }

    // ═══════════════════════════════════════
    //  NAV BAR
    // ═══════════════════════════════════════

    function renderNavBar(page) {
      const primary = [
        { id: "dashboard", label: "DASH" },
        { id: "hub", label: "HUB" },
        { id: "flowers", label: "FLOWERS" },
        { id: "dolls", label: "DOLLS" },
        { id: "crustaceans", label: "CRABS" },
        { id: "bumpkin", label: "BUMPKIN" },
        { id: "treasury", label: "TREASURY" },
        { id: "sales", label: "SALES" },
      ];
      const overflow = [
        { id: "power", label: "POWER" },
        { id: "buds", label: "BUDS" },
        { id: "pets", label: "PETS" },
        { id: "json", label: "JSON" },
      ];
      if (["155498", "1260204733777858"].includes(FARM_ID)) overflow.push({ id: "diff", label: "DIFF" });
      let html = '<div class="nav-bar pixel-panel">';
      for (const l of primary) {
        const cls = page === l.id ? " active" : "";
        html += `<button class="nav-link${cls}" onclick="navigateTo('${l.id}')">${l.label}</button>`;
      }
      const moreActive = overflow.some(l => l.id === page);
      html += `<div class="nav-more-wrap">`;
      html += `<button class="nav-more-btn${moreActive ? " active" : ""}" onclick="toggleNavMore(event)">MORE \u25be</button>`;
      html += `<div class="nav-more-menu" id="nav-more-menu">`;
      for (const l of overflow) {
        const cls = page === l.id ? " active" : "";
        html += `<button class="nav-link${cls}" onclick="navigateTo('${l.id}')">${l.label}</button>`;
      }
      html += `</div></div>`;
      html += '<div class="nav-zoom">';
      html += '<button class="zoom-btn" onclick="changeZoom(-1)" title="Zmenšit text">A-</button>';
      html += '<button class="zoom-btn" onclick="changeZoom(1)" title="Zvětšit text">A+</button>';
      html += '</div>';
      html += '<button class="nav-link help-btn" onclick="openHelp()">?</button>';
      html += '</div>';
      document.getElementById("nav-bar").innerHTML = html;
    }

    function toggleNavMore(e) {
      e.stopPropagation();
      const menu = document.getElementById("nav-more-menu");
      if (!menu) return;
      menu.classList.toggle("open");
      if (menu.classList.contains("open")) {
        const close = (ev) => {
          if (!menu.contains(ev.target)) {
            menu.classList.remove("open");
            document.removeEventListener("click", close);
          }
        };
        setTimeout(() => document.addEventListener("click", close), 0);
      }
    }

    // ═══════════════════════════════════════
    //  TEXT ZOOM (localStorage)
    // ═══════════════════════════════════════

    const ZOOM_STEPS = [75, 85, 100, 115, 130, 150];
    function getZoom() {
      const stored = parseInt(localStorage.getItem("sfl_zoom") || "100", 10);
      return ZOOM_STEPS.includes(stored) ? stored : 100;
    }
    function applyZoom(pct) {
      document.documentElement.style.fontSize = pct + "%";
    }
    function changeZoom(dir) {
      const cur = getZoom();
      const idx = ZOOM_STEPS.indexOf(cur);
      const next = ZOOM_STEPS[Math.max(0, Math.min(ZOOM_STEPS.length - 1, idx + dir))];
      localStorage.setItem("sfl_zoom", String(next));
      applyZoom(next);
    }
    applyZoom(getZoom());

    // ═══════════════════════════════════════
    //  CONFIG BAR
    // ═══════════════════════════════════════

    function renderConfigBar(page) {
      const cfg = getConfig();
      const el = document.getElementById("config-bar");
      const isHub = page === "hub";

      if (!isHub && !configExpanded && cfg.farm) {
        el.innerHTML = `<div class="config-collapsed pixel-panel pixel-font" onclick="expandConfig()">
          <span>Farm #${escHTML(cfg.farm)}</span>
          <span>Limit: ${cfg.limit}</span>
          <span class="config-toggle">EDIT &#9660;</span>
        </div>`;
        return;
      }

      el.innerHTML = `
        <div class="config-bar pixel-panel">
          <div class="config-field">
            <label class="pixel-font">FARM ID</label>
            <input id="cfg-farm" type="text" value="${escHTML(cfg.farm)}" placeholder="e.g. 155498">
          </div>
          <div class="config-field small">
            <label class="pixel-font">LIMIT</label>
            <input id="cfg-limit" type="number" min="1" max="99" value="${cfg.limit}">
          </div>
          <button class="config-go" onclick="applyConfig()">LOAD</button>
        </div>`;
    }

    function expandConfig() {
      configExpanded = true;
      renderConfigBar(getPage());
    }

    // ═══════════════════════════════════════
    //  DONATE
    // ═══════════════════════════════════════

    function renderDonate() {
      const qrURL = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(DONATE_ADDR)}&bgcolor=ffffff&color=2c1810`;
      document.getElementById("donate-section").innerHTML = `
        <div class="donate-section pixel-panel pixel-font">
          <h3>SUPPORT THE PROJECT</h3>
          <p>If this tool helped you, consider sending<br>a flower or some ETH</p>
          <div class="donate-qr">
            <img src="${qrURL}" alt="Donate QR">
          </div>
          <br>
          <div class="donate-addr-wrap">
            <span class="donate-addr">${DONATE_ADDR}</span>
            <button class="donate-copy" onclick="copyAddr()">COPY</button>
          </div>
          <div class="donate-chain-label">ETH / Polygon / Base / Arbitrum</div>
          <div style="margin-top:16px;padding-top:12px;border-top:2px solid rgba(92,58,30,0.4);font-size: 0.625rem;color:var(--text-dim)">
            Created by 0xStableFarmer - #155498<br>
            Based on data from <a href="https://sfl.world" target="_blank" style="color:var(--sunpetal);text-decoration:none">sfl.world</a><br>
            <span class="changelog-toggle" onclick="toggleChangelog()"><span id="changelog-arrow">▶</span> v2.3</span>
            <div id="changelog-content" class="changelog-content" style="display:none">
              ${renderChangelog()}
            </div>
          </div>
        </div>`;
    }

    function copyAddr() {
      navigator.clipboard.writeText(DONATE_ADDR).then(() => {
        const btn = document.querySelector(".donate-copy");
        btn.textContent = "COPIED!";
        setTimeout(() => btn.textContent = "COPY", 2000);
      });
    }

    function toggleChangelog() {
      const el = document.getElementById("changelog-content");
      const arrow = document.getElementById("changelog-arrow");
      if (!el) return;
      const show = el.style.display === "none";
      el.style.display = show ? "block" : "none";
      arrow.textContent = show ? "▼" : "▶";
    }

    function renderChangelog() {
      const log = [
        { ver: "v2.3", items: [
          { t: "new", text: "Dashboard page — all pending actions at a glance (crops, resources, cooking, animals, dailies, trades, and more)" },
          { t: "new", text: "Dashboard is now the default landing page" },
          { t: "new", text: "34 action categories: crops, fruits, trees, stones, iron, gold, flowers, beehives, animals, cooking, composters, pets, powers, dailies, trades, and more" },
          { t: "new", text: "Three sections: Ready Now, Coming Soon, Idle — with live countdown timers" },
        ]},
        { ver: "v2.2", items: [
          { t: "new", text: "JSON Explorer page — interactive collapsible tree view of full API response" },
          { t: "new", text: "Game item icons inline, color-coded values, dot-notation path copy" },
          { t: "new", text: "Search across all keys & values with auto-expand to matches" },
        ]},
        { ver: "v2.1", items: [
          { t: "new", text: "Farm Changelog (Diff) page — SFL value change per snapshot" },
          { t: "new", text: "Bar chart timeline with running total overlay" },
          { t: "new", text: "Crafted item value estimation from ingredient prices" },
          { t: "new", text: "Toggle for zero-price items, clickable snapshot details" },
        ]},
        { ver: "v2.0", items: [
          { t: "new", text: "Pet Advisor page — fetch resource recommendations with SFL/energy ratios" },
          { t: "new", text: "Per-pet cards with unlocked/locked resources, best fetch highlighted" },
          { t: "new", text: "Resource market overview table sorted by SFL/energy efficiency" },
          { t: "new", text: "Nav bar MORE dropdown — overflow pages in collapsible menu" },
        ]},
        { ver: "v1.9", items: [
          { t: "new", text: "Beehive Honey Tracker on flowers page — countdown timers for each hive" },
          { t: "new", text: "Honey progress %, stalled detection, Bee Swarm alerts" },
        ]},
        { ver: "v1.8", items: [
          { t: "new", text: "Power Analyzer v2 — full boost ROI calculator" },
          { t: "new", text: "120+ skills from complete skill tree (11 categories)" },
          { t: "new", text: "Skill cost estimation from bumpkin level + best cooking recipe" },
          { t: "new", text: "Per-category product selectors (crop/fruit/flower dropdown)" },
          { t: "new", text: "Solo + synergy SFL/day calculations for every boost" },
          { t: "new", text: "Expandable formula details with full calculation breakdown" },
          { t: "new", text: "Top 10 Best Buys section — missing boosts sorted by ROI" },
          { t: "new", text: "Quantifiable (12) + qualitative (4) boost categories" },
          { t: "new", text: "Grow Planner on flowers page — schedule until next Petal Blessed" },
          { t: "new", text: "Sales Tracker — active listings/offers with P2P price comparison" },
          { t: "new", text: "API caching via Upstash Redis (5min TTL)" },
          { t: "new", text: "PWA support — installable app with offline caching" },
          { t: "new", text: "Treasury: coin mode toggle, Betty sell prices, Treasures category" },
        ]},
        { ver: "v1.7", items: [
          { t: "new", text: "Treasury page — farm value visualizer" },
          { t: "new", text: "5 value categories: Resources, Treasures, Collectibles, Wearables, Liquid" },
          { t: "new", text: "Treasure sell prices with Treasure Map (+20%) and Camel (+30%) boosts" },
          { t: "new", text: "NFT collectible & wearable valuations from sfl.world" },
          { t: "new", text: "SFL/USD/BTC conversion with live exchange rates" },
          { t: "new", text: "Pie chart breakdown + collapsible detail tables" },
          { t: "new", text: "Gems + coins liquid balance with best-tier conversion" },
          { t: "new", text: "Expandable version changelog in footer" },
        ]},
        { ver: "v1.6", items: [
          { t: "new", text: "Bumpkin XP Calculator page" },
          { t: "new", text: "Current level/XP with progress bar to target level" },
          { t: "new", text: "Building cards with recipe selectors (sorted by XP/hour)" },
          { t: "new", text: "Auto-detect cooking boosts (skills + collectibles)" },
          { t: "new", text: "Combined XP/day + days to target level calculation" },
          { t: "new", text: "Food in inventory XP breakdown" },
          { t: "new", text: "Pet streak detection with weekly status" },
        ]},
        { ver: "v1.5", items: [
          { t: "new", text: "Usage stats tracking (anonymous)" },
          { t: "fix", text: "Unified colors: green = have, red = don't have" },
          { t: "new", text: "Season detection — IN SEASON / OFF SEASON badges" },
          { t: "new", text: "Current season shown in flower tracker header" },
          { t: "new", text: "Vercel Web Analytics" },
        ]},
        { ver: "v1.4", items: [
          { t: "new", text: "Multi-page app with nav bar (HUB | FLOWERS | DOLLS | CRABS)" },
          { t: "new", text: "Auto-detected flower boosts (7 boosts, multiplicative)" },
          { t: "new", text: "Dolls tracker with configurable tracking + ingredient breakdown" },
          { t: "new", text: "Crustaceans tracker — Crab Pot / Mariner Pot sections" },
          { t: "new", text: "Help modal with usage instructions" },
          { t: "new", text: "No API key needed — just enter your Farm ID" },
        ]},
        { ver: "v1.3", items: [
          { t: "new", text: "Auto-detect flower beds from API" },
          { t: "new", text: "Currently growing section with live timers" },
          { t: "new", text: "Clickable flower rows with dependency chain details" },
          { t: "new", text: "Favicon" },
        ]},
        { ver: "v1.2", items: [
          { t: "fix", text: "Proxy: use Node.js res API for Vercel compatibility" },
        ]},
        { ver: "v1.1", items: [
          { t: "new", text: "Vercel deployment with API proxy (CORS fix)" },
          { t: "new", text: "Custom domain: sunflower.sajmonium.quest" },
        ]},
        { ver: "v1.0", items: [
          { t: "new", text: "Initial release — flower collection tracker" },
          { t: "new", text: "Progress bars, dependency chains, time estimates" },
          { t: "new", text: "Petal Blessed optimizer" },
        ]},
      ];
      return log.map(v =>
        `<div class="changelog-ver">${v.ver}</div>` +
        v.items.map(i =>
          `<div class="changelog-item"><span class="changelog-${i.t}">${i.t === "new" ? "NEW" : "FIX"}</span> ${escHTML(i.text)}</div>`
        ).join("")
      ).join("");
    }

    // ═══════════════════════════════════════
    //  HELP MODAL
    // ═══════════════════════════════════════

    function openHelp() {
      const el = document.getElementById("help-modal");
      el.style.display = "flex";
      el.innerHTML = `<div class="modal-content pixel-panel pixel-font">
        <h2>HOW TO USE</h2>
        <h3>1. GET YOUR FARM ID</h3>
        <p>In the game: <b>Settings &gt; Farm ID</b></p>
        <h3>2. ENTER YOUR FARM ID</h3>
        <p><b>Farm ID</b> - your farm number (e.g. 155498)<br>
        <b>Limit</b> - target count per item (default: 5)</p>
        <h3>FLOWER BOOSTS</h3>
        <p>Flower grow time boosts are <b>auto-detected</b> from your farm data:<br>
        Flower Crown, Moth Shrine, Flower Fox,<br>
        Blossom Hourglass, Blooming Boost,<br>
        Flower Power, Flowery Abode</p>
        <h3>3. BOOKMARK THIS PAGE</h3>
        <p>Your Farm ID and settings are saved in the URL.<br>
        Bookmark this page for quick access!</p>
        <h3>TRACKERS</h3>
        <p><b>FLOWERS</b> - All flower types with dependency chains and Petal Blessed planning<br>
        <b>DOLLS</b> - Doll crafting with ingredient requirements<br>
        <b>CRABS</b> - Crab/Mariner pot catches with chum needs</p>
        <h3>BUGS &amp; FEEDBACK</h3>
        <p><a href="https://github.com/hlavasim/sfl-flower-tracker/issues" target="_blank">github.com/hlavasim/sfl-flower-tracker/issues</a></p>
        <button class="modal-close" onclick="closeHelp()">CLOSE</button>
      </div>`;
    }

    function closeHelp() {
      document.getElementById("help-modal").style.display = "none";
    }

    document.addEventListener("click", (e) => {
      const modal = document.getElementById("help-modal");
      if (e.target === modal) closeHelp();
    });

    // ═══════════════════════════════════════
    //  HELPERS
    // ═══════════════════════════════════════

    function getCount(inv, name) {
      const v = inv[name];
      if (v === undefined || v === null) return 0;
      return Math.floor(parseFloat(v));
    }

    function formatHours(h) {
      if (h <= 0) return "Done";
      const totalMin = Math.round(h * 60);
      const d = Math.floor(totalMin / 1440);
      const hrs = Math.floor((totalMin % 1440) / 60);
      const min = totalMin % 60;
      if (d > 0 && hrs > 0) return `${d}d ${hrs}h`;
      if (d > 0) return `${d}d`;
      if (hrs > 0 && min > 0) return `${hrs}h ${min}m`;
      if (hrs > 0) return `${hrs}h`;
      return `${min}m`;
    }

    function flowerColorCSS(name) {
      if (name.startsWith("Red")) return "#e74c3c";
      if (name.startsWith("Yellow")) return "#f1c40f";
      if (name.startsWith("Purple")) return "#9b59b6";
      if (name.startsWith("Blue")) return "#3498db";
      if (name.startsWith("White")) return "#ecf0f1";
      if (name === "Prism Petal") return "linear-gradient(135deg,#e74c3c,#f1c40f,#3498db,#9b59b6)";
      if (name === "Celestial Frostbloom") return "#a8d8ea";
      if (name === "Primula Enigma") return "#d5a6e6";
      return "#bdc3c7";
    }

    function barClass(pct) {
      return pct >= 100 ? "bar-green" : "bar-red";
    }

    function escHTML(s) {
      return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
    }

    // ═══════════════════════════════════════
    //  BUMPKIN HELPERS
    // ═══════════════════════════════════════

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

    function detectCookingBoosts(farm) {
      const skills = farm.bumpkin?.skills || {};
      const xpBoosts = [];
      const timeBoosts = [];

      // Check collectible OR wearable (handles both cases)
      function hasItem(name) {
        return findCollectible(farm, name).length > 0 || isWearableEquipped(farm, name);
      }
      // Try multiple name variants
      function hasAny(...names) {
        return names.some(n => hasItem(n));
      }

      // Debug: log all available items so user can spot missing boosts
      console.log("[Cooking Boosts] Collectibles:", Object.keys(farm.collectibles || {}));
      console.log("[Cooking Boosts] Home collectibles:", Object.keys(farm.home?.collectibles || {}));
      const allEquipped = getAllEquippedWearables(farm);
      console.log("[Cooking Boosts] Main bumpkin equipped:", allEquipped[0]);
      console.log("[Cooking Boosts] Farm hands equipped:", allEquipped.slice(1));
      console.log("[Cooking Boosts] farmHands raw:", farm.farmHands);
      console.log("[Cooking Boosts] Skills:", Object.keys(skills));

      // === XP BOOSTS ===
      // Skills
      if (skills["Munching Mastery"]) xpBoosts.push({ name: "Munching Mastery", multiplier: 1.05 });
      if (skills["Juicy Boost"]) xpBoosts.push({ name: "Juicy Boost", multiplier: 1.1, buildings: ["Smoothie Shack"] });
      if (skills["Drive-Through Deli"]) xpBoosts.push({ name: "Drive-Through Deli", multiplier: 1.15, buildings: ["Deli"] });
      if (skills["Buzzworthy Treats"]) xpBoosts.push({ name: "Buzzworthy Treats", multiplier: 1.1, honeyOnly: true });
      // Items (check both collectibles + wearables)
      if (hasItem("Golden Spatula")) xpBoosts.push({ name: "Golden Spatula", multiplier: 1.1 });
      if (hasItem("Observatory")) xpBoosts.push({ name: "Observatory", multiplier: 1.05 });
      if (hasItem("Blossombeard")) xpBoosts.push({ name: "Blossombeard", multiplier: 1.1 });
      if (hasItem("Grain Grinder")) xpBoosts.push({ name: "Grain Grinder", multiplier: 1.2, buildings: ["Bakery"] });
      if (hasItem("Lifetime Farmer Banner")) xpBoosts.push({ name: "Lifetime Farmer Banner", multiplier: 1.1 });

      // === PET STREAK (auto-detect from faction) ===
      const faction = farm.faction || {};
      const factionHistory = faction.history || {};
      const sortedWeeks = Object.keys(factionHistory).sort();
      const currentWeekKey = sortedWeeks[sortedWeeks.length - 1] || "";
      const prevWeekKey = sortedWeeks[sortedWeeks.length - 2] || "";
      const currentWeekData = factionHistory[currentWeekKey] || {};
      const prevWeekData = factionHistory[prevWeekKey] || {};
      const petStreak = currentWeekData.collectivePet?.streak || 0;
      const streakMultiplier = petStreak >= 8 ? 1.5 : petStreak >= 6 ? 1.3 : petStreak >= 4 ? 1.2 : petStreak >= 2 ? 1.1 : 1.0;
      const weeksToMax = petStreak >= 8 ? 0 : 8 - petStreak;
      // This week: boost active if player fed pet LAST week (petXP > 0)
      const thisWeekActive = (prevWeekData.petXP || 0) > 0 && streakMultiplier > 1;
      // Next week: qualifiesForBoost = player fed pet THIS week
      const nextWeekQualified = faction.pet?.qualifiesForBoost === true;
      const manualPetStreak = localStorage.getItem("sfl_pet_streak") === "1";

      if (thisWeekActive) {
        xpBoosts.push({ name: "Pet's Streak", multiplier: streakMultiplier, petStreak: true });
      } else if (manualPetStreak) {
        xpBoosts.push({ name: "Pet's Streak (simulate)", multiplier: 1.5, petStreak: true, manual: true });
      }

      const petStreakInfo = { streak: petStreak, multiplier: streakMultiplier, thisWeekActive, nextWeekQualified, weeksToMax, manualOverride: manualPetStreak };

      // === TIME BOOSTS ===
      // Skills
      if (skills["Double Nom"]) timeBoosts.push({ name: "Double Nom", multiplier: 0.5 });
      if (skills["Fast Feasts"]) timeBoosts.push({ name: "Fast Feasts", multiplier: 0.9, buildings: ["Fire Pit", "Kitchen"] });
      if (skills["Frosted Cakes"]) timeBoosts.push({ name: "Frosted Cakes", multiplier: 0.9, buildings: ["Bakery"] });
      // Items
      if (hasItem("Luna's Hat")) timeBoosts.push({ name: "Luna's Hat", multiplier: 0.5 });
      if (hasItem("Desert Gnome")) timeBoosts.push({ name: "Desert Gnome", multiplier: 0.9 });
      if (hasAny("Nightshade Medallion")) timeBoosts.push({ name: "Nightshade Medallion", multiplier: 0.75 });
      if (hasAny("Master Chefs Cleaver", "Master Chef's Cleaver")) timeBoosts.push({ name: "Master Chefs Cleaver", multiplier: 0.85 });

      console.log("[Cooking Boosts] Detected XP:", xpBoosts.map(b => b.name));
      console.log("[Cooking Boosts] Detected Time:", timeBoosts.map(b => b.name));
      console.log("[Cooking Boosts] Pet Streak:", petStreakInfo);

      return { xpBoosts, timeBoosts, petStreakInfo };
    }

    function computeFoodXP(foodName, food, buildingName, boosts) {
      let xp = food.xp;
      for (const b of boosts.xpBoosts) {
        if (b.buildings && !b.buildings.includes(buildingName)) continue;
        if (b.honeyOnly && !food.usesHoney) continue;
        xp *= b.multiplier;
      }
      return xp;
    }

    function computeCookTime(baseSec, buildingName, boosts) {
      let time = baseSec;
      for (const b of boosts.timeBoosts) {
        if (b.buildings && !b.buildings.includes(buildingName)) continue;
        time *= b.multiplier;
      }
      return time;
    }

    function formatCookTime(seconds) {
      if (seconds <= 0) return "Instant";
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      const s = Math.floor(seconds % 60);
      if (h >= 24) { const d = Math.floor(h / 24); const rh = h % 24; return rh > 0 ? `${d}d ${rh}h` : `${d}d`; }
      if (h > 0 && m > 0) return `${h}h ${m}m`;
      if (h > 0) return `${h}h`;
      if (m > 0 && s > 0) return `${m}m ${s}s`;
      if (m > 0) return `${m}m`;
      return `${s}s`;
    }

    const BUMPKIN_DEFAULT_RECIPES = {
      "Fire Pit": "Pizza Margherita",
      "Kitchen": "Spaghetti al Limone",
      "Bakery": "Lemon Cheesecake",
      "Deli": "Honey Cheddar",
      "Smoothie Shack": "Sour Shake",
    };

    function getSavedBumpkinRecipes() {
      try {
        const saved = localStorage.getItem("sfl_bumpkin_recipes");
        return saved ? JSON.parse(saved) : {};
      } catch (e) { return {}; }
    }

    function selectBumpkinRecipe(building, recipe) {
      const saved = getSavedBumpkinRecipes();
      saved[building] = recipe;
      localStorage.setItem("sfl_bumpkin_recipes", JSON.stringify(saved));
      if (cachedFarmData) renderBumpkin(cachedFarmData);
    }

    function togglePetStreak() {
      const on = localStorage.getItem("sfl_pet_streak") === "1";
      localStorage.setItem("sfl_pet_streak", on ? "0" : "1");
      if (cachedFarmData) renderBumpkin(cachedFarmData);
    }

    function toggleFoodInventory() {
      const el = document.getElementById("food-inv-list");
      if (el) el.style.display = el.style.display === "none" ? "block" : "none";
      const arrow = document.getElementById("food-inv-arrow");
      if (arrow) arrow.textContent = el.style.display === "none" ? "▶" : "▼";
    }

    function setBumpkinTargetLevel(val) {
      localStorage.setItem("sfl_bumpkin_target", val);
      if (cachedFarmData) renderBumpkin(cachedFarmData);
    }

    // ═══════════════════════════════════════
    //  DEPENDENCY COMPUTATION (flowers)
    // ═══════════════════════════════════════

    function isFlowerInput(inputName) {
      return FLOWER_RECIPES[inputName] !== undefined;
    }

    function buildDependencyGraph() {
      const dependents = {};
      for (const [name, recipe] of Object.entries(FLOWER_RECIPES)) {
        if (isFlowerInput(recipe.input)) {
          if (!dependents[recipe.input]) dependents[recipe.input] = [];
          dependents[recipe.input].push(name);
        }
      }
      return dependents;
    }

    function computeAllTotalNeeded(inventory, inProgress) {
      const dependents = buildDependencyGraph();
      const memo = {};
      const visiting = new Set();

      function compute(name) {
        if (memo[name] !== undefined) return memo[name];
        if (visiting.has(name)) return LIMIT;
        visiting.add(name);
        let total = LIMIT;
        const deps = dependents[name] || [];
        for (const dep of deps) {
          const depNeeded = compute(dep);
          const depHave = getCount(inventory, dep) + (inProgress[dep] || 0);
          total += Math.max(0, depNeeded - depHave);
        }
        visiting.delete(name);
        memo[name] = total;
        return total;
      }

      const result = {};
      for (const name of Object.keys(FLOWER_RECIPES)) {
        result[name] = compute(name);
      }
      return { totalNeeded: result, dependents };
    }

    // ═══════════════════════════════════════
    //  API FETCH
    // ═══════════════════════════════════════

    function extractInProgress(farm) {
      const pending = {};
      const add = (name, qty) => { pending[name] = (pending[name] || 0) + qty; };

      // Flowers
      const beds = farm.flowers?.flowerBeds || {};
      for (const bed of Object.values(beds)) {
        if (bed.flower?.name) {
          const crits = bed.flower.criticalHit || {};
          const bonus = Object.values(crits).reduce((s, c) => s + c, 0);
          add(bed.flower.name, 1 + bonus);
        }
      }

      // Dolls: craftingBox
      const cb = farm.craftingBox;
      if (cb && cb.status === "crafting" && cb.item?.collectible) {
        add(cb.item.collectible, 1);
      }

      // Crustaceans: crabTraps (only count if trap is ready)
      const traps = farm.crabTraps?.trapSpots || {};
      const nowMs = Date.now();
      for (const spot of Object.values(traps)) {
        const wt = spot.waterTrap;
        if (!wt) continue;
        const readyAt = toMs(wt.readyAt || 0);
        if (readyAt > nowMs) continue; // trap not ready yet
        const caught = wt.caught || {};
        for (const [name, qty] of Object.entries(caught)) {
          add(name, qty);
        }
      }

      return pending;
    }

    function toMs(ts) {
      // SFL API timestamps may be in seconds or milliseconds
      return ts < 1e12 ? ts * 1000 : ts;
    }

    function extractBedDetails(flowerBeds) {
      const beds = [];
      for (const [id, bed] of Object.entries(flowerBeds)) {
        if (bed.flower?.name) {
          const name = bed.flower.name;
          const recipe = FLOWER_RECIPES[name];
          const seedType = recipe ? recipe.seed : "Unknown";
          const baseSeconds = recipe ? SEED_DATA[seedType].baseSeconds : 86400;
          const plantedAt = toMs(bed.flower.plantedAt);
          const crits = bed.flower.criticalHit || {};
          const bonus = Object.values(crits).reduce((s, c) => s + c, 0);
          const totalYield = 1 + bonus;
          const readyAt = plantedAt + baseSeconds * 1000;
          beds.push({ id, name, plantedAt, seedType, bonus, totalYield, readyAt });
        } else {
          beds.push({ id, name: null, empty: true });
        }
      }
      beds.sort((a, b) => {
        if (a.empty && !b.empty) return 1;
        if (!a.empty && b.empty) return -1;
        if (a.empty && b.empty) return 0;
        return a.readyAt - b.readyAt;
      });
      return beds;
    }

    const DEFAULT_HONEY_PRODUCTION_TIME = 24 * 60 * 60 * 1000; // 24h in ms

    function extractBeehiveDetails(beehives) {
      if (!beehives) return [];
      const hives = [];
      const now = Date.now();

      for (const [id, hive] of Object.entries(beehives)) {
        if (!hive.honey || hive.honey.updatedAt === undefined) {
          hives.push({ id, empty: true });
          continue;
        }

        const honeyProducedMs = hive.honey.produced || 0;
        const honeyUpdatedAtMs = toMs(hive.honey.updatedAt);
        const flowers = (hive.flowers || []).slice().sort((a, b) => (a.attachedAt || 0) - (b.attachedAt || 0));

        // Calculate current honey produced (past production)
        const currentProducedMs = flowers.reduce((produced, flower) => {
          const start = Math.max(honeyUpdatedAtMs, toMs(flower.attachedAt || 0));
          const end = Math.min(now, toMs(flower.attachedUntil || 0));
          const rate = flower.rate ?? 1;
          if (end > start) return produced + (end - start) * rate;
          return produced;
        }, honeyProducedMs);

        const progressPct = Math.min(100, (currentProducedMs / DEFAULT_HONEY_PRODUCTION_TIME) * 100);
        const honeyLeftMs = Math.max(0, DEFAULT_HONEY_PRODUCTION_TIME - currentProducedMs);
        let readyAt = now;

        // Current production speed
        const currentSpeed = flowers.reduce((acc, flower) => {
          const rate = flower.rate ?? 1;
          return acc + ((toMs(flower.attachedAt || 0) <= now && toMs(flower.attachedUntil || 0) > now) ? rate : 0);
        }, 0);

        if (honeyLeftMs > 0) {
          if (currentSpeed > 0) {
            // Optimistic ETA: assumes continuous production at current rate
            readyAt = now + honeyLeftMs / currentSpeed;
          } else {
            readyAt = undefined; // no active flowers → idle
          }
        }

        hives.push({
          id,
          readyAt: honeyLeftMs <= 0 ? now : readyAt,
          progressPct,
          hasSwarm: hive.swarm || false,
          idle: readyAt === undefined,
        });
      }

      hives.sort((a, b) => {
        if (a.empty && !b.empty) return 1;
        if (!a.empty && b.empty) return -1;
        if (a.readyAt === undefined) return 1;
        if (b.readyAt === undefined) return -1;
        return a.readyAt - b.readyAt;
      });
      return hives;
    }

    const PETAL_BLESSED_COOLDOWN = 96 * 60 * 60;

    function extractPetalBlessed(farm) {
      const powers = farm.bumpkin?.previousPowerUseAt;
      if (!powers || powers["Petal Blessed"] === undefined) {
        return { status: "unavailable" };
      }
      const hasLunas = farm.wardrobe?.["Luna's Crescent"] > 0;
      const cooldownMs = PETAL_BLESSED_COOLDOWN * (hasLunas ? 0.5 : 1) * 1000;
      const lastUsed = toMs(powers["Petal Blessed"]);
      const nextAt = lastUsed + cooldownMs;
      if (Date.now() >= nextAt) {
        return { status: "ready" };
      }
      return { status: "cooldown", nextAt };
    }

    async function fetchFarmData() {
      if (!FARM_ID) {
        throw new Error("Enter your Farm ID, then click LOAD");
      }

      const apiUrl = `https://api.sunflower-land.com/community/farms/${FARM_ID}`;
      const proxyUrl = `/api/proxy?url=${encodeURIComponent(apiUrl)}`;

      let data, lastErr;

      try {
        const resp = await fetch(proxyUrl);
        if (!resp.ok) throw new Error(`Proxy ${resp.status}`);
        data = await resp.json();
      } catch (proxyErr) {
        lastErr = proxyErr;
        console.warn("Proxy fetch failed:", proxyErr);
      }

      if (!data) throw lastErr || new Error("Failed to load farm data");

      const farm = data.farm || {};
      const inventory = farm.inventory || {};
      const flowerBeds = farm.flowers?.flowerBeds || {};
      const craftingBox = farm.craftingBox || null;
      const trapSpots = farm.crabTraps?.trapSpots || {};
      const inProgress = extractInProgress(farm);
      const petalBlessed = extractPetalBlessed(farm);
      const activeBoosts = detectFlowerBoosts(farm);
      const flowerMultiplier = computeFlowerMultiplier(activeBoosts);
      const season = farm.season?.season || null;
      const trades = farm.trades || {};
      return { inventory, inProgress, petalBlessed, flowerBeds, craftingBox, trapSpots, activeBoosts, flowerMultiplier, season, bumpkin: farm.bumpkin, buildings: farm.buildings, trades, farm };
    }

    // ═══════════════════════════════════════
    //  TIMERS
    // ═══════════════════════════════════════

    function startGrowingTimers() {
      if (growingTimerInterval) clearInterval(growingTimerInterval);
      growingTimerInterval = setInterval(() => {
        const els = document.querySelectorAll(".growing-bed-time[data-ready]");
        if (els.length === 0) { clearInterval(growingTimerInterval); return; }
        const now = Date.now();
        els.forEach(el => {
          const readyAt = parseInt(el.dataset.ready, 10);
          const diff = readyAt - now;
          if (diff <= 0) {
            el.textContent = "Ready!";
            el.classList.remove("growing");
            el.classList.add("ready");
          } else {
            const h = Math.floor(diff / 3600000);
            const m = Math.floor((diff % 3600000) / 60000);
            const s = Math.floor((diff % 60000) / 1000);
            el.textContent = h > 0
              ? `${h}h ${String(m).padStart(2,"0")}m`
              : `${m}m ${String(s).padStart(2,"0")}s`;
          }
        });
      }, 1000);
    }

    function startPBTimer() {
      if (pbTimerInterval) clearInterval(pbTimerInterval);
      const el = document.getElementById("pb-timer");
      if (!el) return;
      const nextAt = parseInt(el.dataset.next, 10);

      function tick() {
        const el = document.getElementById("pb-timer");
        if (!el) { clearInterval(pbTimerInterval); return; }
        const diff = nextAt - Date.now();
        if (diff <= 0) {
          clearInterval(pbTimerInterval);
          refresh();
          return;
        }
        const h = Math.floor(diff / 3600000);
        const m = Math.floor((diff % 3600000) / 60000);
        const s = Math.floor((diff % 60000) / 1000);
        el.textContent = `${h}h ${String(m).padStart(2,"0")}m ${String(s).padStart(2,"0")}s`;
      }

      tick();
      pbTimerInterval = setInterval(tick, 1000);
    }

    // ═══════════════════════════════════════
    //  CHAIN DETAILS (clickable expand)
    // ═══════════════════════════════════════

    function buildChainHTML(name, inventory, inProgress, visited) {
      if (!visited) visited = new Set();
      if (visited.has(name)) return `<div class="chain-step"><span class="chain-flower">${escHTML(name)}</span> (circular ref)</div>`;
      visited.add(name);

      const recipe = FLOWER_RECIPES[name];
      if (!recipe) return "";

      const sd = SEED_DATA[recipe.seed];
      const have = getCount(inventory, name) + (inProgress[name] || 0);
      const haveClass = have > 0 ? "chain-have" : "chain-need";

      let html = `<div class="chain-step">`;
      html += `<img class="inline-icon" src="${getItemIcon(name)}" onerror="this.style.display='none'" alt=""><span class="${haveClass}">${escHTML(name)}</span>`;
      html += ` <span style="color:var(--text-dim)">(have: ${have})</span>`;
      html += ` = <img class="inline-icon" src="${getItemIcon(sd.label + ' Seed')}" onerror="this.style.display='none'" alt=""><span class="chain-seed">${sd.label} Seed</span>`;

      if (isFlowerInput(recipe.input)) {
        html += ` + <img class="inline-icon" src="${getItemIcon(recipe.input)}" onerror="this.style.display='none'" alt=""><span class="chain-flower">${escHTML(recipe.input)}</span>`;
        html += buildChainHTML(recipe.input, inventory, inProgress, visited);
      } else {
        html += ` + <img class="inline-icon" src="${getItemIcon(recipe.input)}" onerror="this.style.display='none'" alt=""><span class="chain-crop">${escHTML(recipe.input)}</span> <span style="color:var(--text-dim)">(crop)</span>`;
      }
      html += `</div>`;
      return html;
    }

    function toggleChain(el) {
      const row = el.closest(".flower-row");
      const existing = row.nextElementSibling;
      if (existing && existing.classList.contains("chain-detail")) {
        existing.remove();
        return;
      }
      document.querySelectorAll(".chain-detail").forEach(d => d.remove());

      const name = row.dataset.flower;
      if (!name || !lastInventory) return;

      const recipe = FLOWER_RECIPES[name];
      if (!recipe) return;

      const sd = SEED_DATA[recipe.seed];
      let html = `<strong>Recipe:</strong> <img class="inline-icon" src="${getItemIcon(sd.label + ' Seed')}" onerror="this.style.display='none'" alt=""><span class="chain-seed">${sd.label} Seed</span> + `;

      if (isFlowerInput(recipe.input)) {
        html += `<img class="inline-icon" src="${getItemIcon(recipe.input)}" onerror="this.style.display='none'" alt=""><span class="chain-flower">${escHTML(recipe.input)}</span>`;
        html += buildChainHTML(recipe.input, lastInventory, lastInProgress || {});
      } else {
        html += `<img class="inline-icon" src="${getItemIcon(recipe.input)}" onerror="this.style.display='none'" alt=""><span class="chain-crop">${escHTML(recipe.input)}</span> <span style="color:var(--text-dim)">(crop)</span>`;
      }

      const detail = document.createElement("div");
      detail.className = "chain-detail";
      detail.innerHTML = html;
      row.after(detail);
    }

    function toggleDollChain(el) {
      const row = el.closest(".flower-row");
      const existing = row.nextElementSibling;
      if (existing && existing.classList.contains("chain-detail")) {
        existing.remove();
        return;
      }
      document.querySelectorAll(".chain-detail").forEach(d => d.remove());

      const name = row.dataset.doll;
      if (!name || !lastInventory) return;

      const ingredients = DOLL_RECIPES[name];
      if (!ingredients || ingredients.length === 0) {
        const detail = document.createElement("div");
        detail.className = "chain-detail";
        detail.innerHTML = `<span style="color:var(--text-dim)">Recipe unknown</span>`;
        row.after(detail);
        return;
      }

      let html = `<strong>Ingredients per craft:</strong>`;
      for (const ing of ingredients) {
        const have = getCount(lastInventory, ing.item);
        const ok = have >= ing.qty;
        html += `<div class="chain-step">
          <img class="inline-icon" src="${getItemIcon(ing.item)}" onerror="this.style.display='none'" alt=""><span class="${ok ? "chain-have" : "chain-need"}">${escHTML(ing.item)}</span>
          x${ing.qty} <span style="color:var(--text-dim)">(have: ${have})</span>
          ${ok ? '<span style="color:var(--green)">OK</span>' : `<span style="color:var(--red)">need ${Math.max(0, ing.qty - have)} more</span>`}
        </div>`;
      }

      const detail = document.createElement("div");
      detail.className = "chain-detail";
      detail.innerHTML = html;
      row.after(detail);
    }

    function toggleCrustChain(el) {
      const row = el.closest(".flower-row");
      const existing = row.nextElementSibling;
      if (existing && existing.classList.contains("chain-detail")) {
        existing.remove();
        return;
      }
      document.querySelectorAll(".chain-detail").forEach(d => d.remove());

      const name = row.dataset.crust;
      if (!name || !lastInventory) return;

      const recipe = CRUSTACEAN_RECIPES[name];
      if (!recipe) return;

      let html = `<strong>Pot:</strong> ${escHTML(recipe.pot)} (${recipe.time})`;

      if (recipe.chum) {
        const chumHave = getCount(lastInventory, recipe.chum);
        const ok = chumHave >= recipe.qty;
        html += `<div class="chain-step">
          <strong>Chum:</strong> <img class="inline-icon" src="${getItemIcon(recipe.chum)}" onerror="this.style.display='none'" alt=""><span class="${ok ? "chain-have" : "chain-need"}">${escHTML(recipe.chum)}</span>
          x${recipe.qty} <span style="color:var(--text-dim)">(have: ${chumHave})</span>
          ${ok ? '<span style="color:var(--green)">OK</span>' : `<span style="color:var(--red)">need ${Math.max(0, recipe.qty - chumHave)} more</span>`}
        </div>`;
      } else {
        html += `<div class="chain-step"><span style="color:var(--text-dim)">No chum required</span></div>`;
      }

      if (recipe.alt) {
        html += `<div class="chain-step"><strong>Alt chum:</strong> <span style="color:var(--text-secondary)">${escHTML(recipe.alt)}</span></div>`;
      }

      const detail = document.createElement("div");
      detail.className = "chain-detail";
      detail.innerHTML = html;
      row.after(detail);
    }

    function togglePlannerChain(el) {
      const row = el.closest(".planner-row");
      const existing = row.nextElementSibling;
      if (existing && existing.classList.contains("chain-detail")) {
        existing.remove();
        return;
      }
      document.querySelectorAll(".planner-row + .chain-detail").forEach(d => d.remove());

      const name = row.dataset.flower;
      if (!name || !lastInventory) return;

      const recipe = FLOWER_RECIPES[name];
      if (!recipe) return;

      const sd = SEED_DATA[recipe.seed];
      let html = `<strong>Recipe:</strong> <img class="inline-icon" src="${getItemIcon(sd.label + ' Seed')}" onerror="this.style.display='none'" alt=""><span class="chain-seed">${sd.label} Seed</span> + `;

      if (isFlowerInput(recipe.input)) {
        html += `<img class="inline-icon" src="${getItemIcon(recipe.input)}" onerror="this.style.display='none'" alt=""><span class="chain-flower">${escHTML(recipe.input)}</span>`;
        html += buildChainHTML(recipe.input, lastInventory, lastInProgress || {});
      } else {
        const cropHave = getCount(lastInventory, recipe.input);
        html += `<img class="inline-icon" src="${getItemIcon(recipe.input)}" onerror="this.style.display='none'" alt=""><span class="chain-crop">${escHTML(recipe.input)}</span> <span style="color:var(--text-dim)">(have: ${cropHave})</span>`;
      }

      const detail = document.createElement("div");
      detail.className = "chain-detail";
      detail.innerHTML = html;
      row.after(detail);
    }

    // ═══════════════════════════════════════
    //  PETAL BLESSED
    // ═══════════════════════════════════════

    function getPetalBlessedRecommendation(inventory, inProgress) {
      const { totalNeeded } = computeAllTotalNeeded(inventory, inProgress);
      const candidates = [];
      for (const [name, needed] of Object.entries(totalNeeded)) {
        const have = getCount(inventory, name);
        const pend = inProgress[name] || 0;
        const remaining = Math.max(0, needed - have - pend);
        if (remaining <= 0) continue;
        const recipe = FLOWER_RECIPES[name];
        const seedHours = SEED_DATA[recipe.seed].hours;
        const inputIsFlower = isFlowerInput(recipe.input);
        let inputReady = true;
        if (inputIsFlower) {
          const inputHave = getCount(inventory, recipe.input) + (inProgress[recipe.input] || 0);
          if (inputHave <= 0) inputReady = false;
        }
        candidates.push({ name, remaining, seedHours, seed: recipe.seed, input: recipe.input, inputIsFlower, inputReady });
      }
      candidates.sort((a, b) => {
        if (b.seedHours !== a.seedHours) return b.seedHours - a.seedHours;
        if (a.inputReady !== b.inputReady) return a.inputReady ? -1 : 1;
        return b.remaining - a.remaining;
      });
      const picks = [];
      const used = {};
      for (const c of candidates) {
        if (picks.length >= FLOWER_BEDS) break;
        const canUse = Math.min(c.remaining - (used[c.name] || 0), FLOWER_BEDS - picks.length);
        for (let i = 0; i < canUse; i++) {
          picks.push(c);
          used[c.name] = (used[c.name] || 0) + 1;
        }
      }
      return picks;
    }

    function togglePetalBlessed() {
      const container = document.getElementById("petal-blessed-container");
      if (container.innerHTML) {
        container.innerHTML = "";
        return;
      }
      if (!lastInventory) return;

      const picks = getPetalBlessedRecommendation(lastInventory, lastInProgress);
      if (picks.length === 0) {
        container.innerHTML = `<div class="petal-blessed-panel pixel-font">
          <h3>PETAL BLESSED</h3>
          <p class="pb-subtitle">All flowers are complete! Nothing to grow.</p>
        </div>`;
        return;
      }

      const totalSaved = picks.reduce((s, p) => s + p.seedHours, 0);
      let bedsHTML = "";
      picks.forEach((p, i) => {
        const sd = SEED_DATA[p.seed];
        const inputLabel = p.inputIsFlower
          ? `${sd.label} Seed + <span style="color:var(--yellow)">${escHTML(p.input)}</span>${p.inputReady ? "" : " <span style='color:var(--red)'>(!)</span>"}`
          : `${sd.label} Seed + ${escHTML(p.input)}`;
        bedsHTML += `<div class="pb-bed">
          <div class="pb-bed-num">${i + 1}</div>
          <img class="pb-bed-img" src="${getItemIcon(p.name)}" onerror="this.style.display='none'" alt="">
          <div class="pb-bed-info">
            <div class="pb-bed-name">${escHTML(p.name)}</div>
            <div class="pb-bed-recipe">${inputLabel}</div>
          </div>
          <div class="pb-bed-time">${formatHours(p.seedHours)}<div class="saved">saved</div></div>
        </div>`;
      });

      container.innerHTML = `<div class="petal-blessed-panel pixel-font">
        <h3>PETAL BLESSED</h3>
        <div class="pb-subtitle">Plant these ${picks.length} flowers, then use instant grow — saves ${formatHours(totalSaved)}</div>
        ${bedsHTML}
        <button class="pb-close" onclick="togglePetalBlessed()">CLOSE</button>
      </div>`;
    }

    // ═══════════════════════════════════════
    //  GROW PLANNER
    // ═══════════════════════════════════════

    function getSleepSchedule() {
      try {
        const s = localStorage.getItem("sfl_sleep_schedule");
        if (s) return JSON.parse(s);
      } catch(e) {}
      return { start: 23, end: 7 };
    }

    function saveSleepSchedule(s) {
      localStorage.setItem("sfl_sleep_schedule", JSON.stringify(s));
    }

    function isHourDuringSleep(hour, sleep) {
      const s = sleep.start, e = sleep.end;
      return s < e ? (hour >= s && hour < e) : (hour >= s || hour < e);
    }

    function formatTimeShort(ms) {
      const d = new Date(ms);
      const days = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
      return `${days[d.getDay()]} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
    }

    function buildGrowPlan(flowerData, beds, petalBlessed, sleep) {
      const now = Date.now();
      let pbTime = null, pbReady = false;
      if (petalBlessed.status === "ready") { pbTime = now; pbReady = true; }
      else if (petalBlessed.status === "cooldown") { pbTime = petalBlessed.nextAt; }

      // Collect plantable incomplete flowers sorted by grow time desc
      const incomplete = [];
      for (const [name, f] of Object.entries(flowerData)) {
        if (f.isComplete || f.remaining <= 0) continue;
        const growH = SEED_DATA[f.seed].hours;
        let inputOk = !f.inputIsFlower;
        if (f.inputIsFlower) {
          const id = flowerData[f.input];
          inputOk = id && id.have > 0;
        }
        incomplete.push({ name, seed: f.seed, growH, growMs: growH * 3600000, inputOk, remaining: f.remaining });
      }
      incomplete.sort((a, b) => b.growH !== a.growH ? b.growH - a.growH : b.remaining - a.remaining);

      const alloc = {};
      const canA = f => (alloc[f.name] || 0) < f.remaining;
      const doA = f => { alloc[f.name] = (alloc[f.name] || 0) + 1; };

      const bedFree = beds.map(b => b.empty ? now : Math.max(now, b.readyAt));
      const steps = [];

      if (!pbReady) {
        for (let i = 0; i < bedFree.length; i++) {
          let t = bedFree[i];
          const limit = pbTime || (t + 30 * 24 * 3600000);
          let safety = 10;
          while (safety-- > 0 && t < limit) {
            const rem = limit - t;
            let best = null;
            for (const f of incomplete) {
              if (!f.inputOk || !canA(f)) continue;
              if (pbTime && f.growMs > rem) continue;
              best = f;
              break;
            }
            if (!best) break;
            const fin = t + best.growMs;
            const fH = new Date(fin).getHours();
            steps.push({
              flower: best.name, seed: best.seed, growH: best.growH,
              startAt: t, finishAt: fin,
              sleepWaste: isHourDuringSleep(fH, sleep),
              bedIdx: i,
            });
            doA(best);
            t = fin;
            if (!pbTime) break;
          }
        }
      }

      // PB flowers: always longest incomplete
      const pbFlowers = [];
      if (pbTime) {
        for (const f of incomplete) {
          if (pbFlowers.length >= beds.length) break;
          if (!f.inputOk || !canA(f)) continue;
          pbFlowers.push({ name: f.name, seed: f.seed, growH: f.growH });
          doA(f);
        }
      }

      // Idle before PB
      let idleH = 0;
      if (pbTime && !pbReady) {
        const lastFin = steps.length > 0 ? Math.max(...steps.map(s => s.finishAt)) : Math.min(...bedFree);
        idleH = Math.max(0, (pbTime - lastFin) / 3600000);
      }

      return { steps, pbFlowers, pbTime, pbReady, idleH };
    }

    function renderGrowPlanner(flowerData, beds, petalBlessed) {
      if (Object.values(flowerData).every(f => f.isComplete)) return "";

      const sleep = getSleepSchedule();
      const plan = buildGrowPlan(flowerData, beds, petalBlessed, sleep);
      const now = Date.now();

      let html = `<div class="planner-section">`;

      // Header
      html += `<div class="planner-header" onclick="document.getElementById('planner-body').style.display=document.getElementById('planner-body').style.display==='none'?'block':'none'">
        <span class="pixel-font" style="font-size: 0.6875rem">📋 GROW PLANNER</span>
        <span style="display:flex;align-items:center;gap:10px;font-size: 0.5625rem">`;
      if (plan.pbTime && !plan.pbReady) {
        const d = plan.pbTime - now;
        html += `<span class="pixel-font" style="color:var(--lily)">⚡ PB ${Math.floor(d/3600000)}h ${Math.floor((d%3600000)/60000)}m</span>`;
      } else if (plan.pbReady) {
        html += `<span class="pixel-font" style="color:var(--green)">⚡ PB READY</span>`;
      }
      html += `<span class="pixel-font" style="color:var(--text-dim)">💤 ${String(sleep.start).padStart(2,"0")}-${String(sleep.end).padStart(2,"0")}</span>`;
      html += `</span></div>`;

      html += `<div id="planner-body">`;

      if (plan.pbReady && plan.pbFlowers.length > 0) {
        // PB ready NOW
        html += `<div class="planner-body"><div class="planner-batch planner-pb-box">
          <div class="planner-batch-label pixel-font" style="color:var(--lily)">⚡ USE PETAL BLESSED NOW</div>`;
        for (const f of plan.pbFlowers) {
          html += `<div class="planner-row" data-flower="${escHTML(f.name)}" onclick="togglePlannerChain(this)">
            <img src="${getItemIcon(f.name)}" onerror="this.style.display='none'" alt="">
            <div class="planner-row-info"><div class="planner-row-name">${escHTML(f.name)}</div>
            <div class="planner-row-detail">${SEED_DATA[f.seed]?.label || "?"} · saves ${formatHours(f.growH)}</div></div>
          </div>`;
        }
        const saved = plan.pbFlowers.reduce((s, f) => s + f.growH, 0);
        html += `<div class="planner-pb-saved pixel-font">Total saved: ${formatHours(saved)}</div>`;
        html += `</div></div>`;
      } else {
        html += `<div class="planner-body">`;

        // Group regular steps by approximate start time into batches
        if (plan.steps.length > 0) {
          const batches = [];
          const sorted = [...plan.steps].sort((a, b) => a.startAt - b.startAt);
          let cur = null;
          for (const s of sorted) {
            if (!cur || s.startAt - cur.t > 3600000) {
              cur = { t: s.startAt, items: [] };
              batches.push(cur);
            }
            cur.items.push(s);
          }

          for (const batch of batches) {
            const isNow = batch.t <= now + 60000;
            html += `<div class="planner-batch">
              <div class="planner-batch-label pixel-font">▸ ${isNow ? "PLANT NOW" : "PLANT " + formatTimeShort(batch.t)}</div>`;
            for (const s of batch.items) {
              const cls = s.sleepWaste ? "planner-row-time sleep" : "planner-row-time";
              html += `<div class="planner-row" data-flower="${escHTML(s.flower)}" onclick="togglePlannerChain(this)">
                <img src="${getItemIcon(s.flower)}" onerror="this.style.display='none'" alt="">
                <div class="planner-row-info"><div class="planner-row-name">${escHTML(s.flower)}</div>
                <div class="planner-row-detail">${SEED_DATA[s.seed]?.label || "?"} · ${formatHours(s.growH)}</div></div>
                <div class="${cls}">→ ${formatTimeShort(s.finishAt)}${s.sleepWaste ? " 💤" : ""}</div>
              </div>`;
            }
            html += `</div>`;
          }

          if (plan.idleH > 0.5 && plan.pbTime) {
            html += `<div class="planner-idle">⏳ ${Math.round(plan.idleH * 10) / 10}h idle before Petal Blessed</div>`;
          }
        } else if (!plan.pbTime) {
          html += `<div class="planner-idle">No Petal Blessed data · plant highest priority flowers</div>`;
        } else {
          html += `<div class="planner-idle">⏳ No flowers fit before Petal Blessed — wait for PB</div>`;
        }

        // PB batch (future)
        if (plan.pbFlowers.length > 0 && plan.pbTime && !plan.pbReady) {
          html += `<div class="planner-batch planner-pb-box">
            <div class="planner-batch-label pixel-font"><span style="color:var(--lily)">⚡ PETAL BLESSED</span> <span style="color:var(--text-dim)">${formatTimeShort(plan.pbTime)}</span></div>`;
          for (const f of plan.pbFlowers) {
            html += `<div class="planner-row" data-flower="${escHTML(f.name)}" onclick="togglePlannerChain(this)">
              <img src="${getItemIcon(f.name)}" onerror="this.style.display='none'" alt="">
              <div class="planner-row-info"><div class="planner-row-name">${escHTML(f.name)}</div>
              <div class="planner-row-detail">${SEED_DATA[f.seed]?.label || "?"} · saves ${formatHours(f.growH)}</div></div>
            </div>`;
          }
          const saved = plan.pbFlowers.reduce((s, f) => s + f.growH, 0);
          html += `<div class="planner-pb-saved pixel-font">Total saved: ${formatHours(saved)}</div>`;
          html += `</div>`;
        }

        html += `</div>`;
      }

      // Sleep config
      html += `<div class="planner-sleep-cfg">
        💤 Sleep:
        <input type="number" min="0" max="23" value="${sleep.start}" onchange="updateSleepSchedule(this,'start')">:00 —
        <input type="number" min="0" max="23" value="${sleep.end}" onchange="updateSleepSchedule(this,'end')">:00
      </div>`;

      html += `</div></div>`;
      return html;
    }

    function updateSleepSchedule(input, field) {
      const s = getSleepSchedule();
      s[field] = Math.max(0, Math.min(23, parseInt(input.value) || 0));
      saveSleepSchedule(s);
      if (cachedFarmData) renderFlowers(cachedFarmData);
    }

    // ═══════════════════════════════════════
    //  RENDER: HUB
    // ═══════════════════════════════════════


    // ═══════════════════════════════════════
    //  DASHBOARD — Reference Data
    // ═══════════════════════════════════════

    const CROP_HARVEST_SECONDS = {
      "Sunflower":60,"Potato":300,"Pumpkin":1800,"Carrot":3600,"Cabbage":7200,
      "Soybean":10800,"Beetroot":14400,"Cauliflower":28800,"Parsnip":43200,
      "Eggplant":57600,"Corn":72000,"Radish":86400,"Wheat":86400,"Kale":129600,
      "Barley":172800,"Rice":259200,"Olive":302400,"Grape":259200,"Tomato":7200
    };
    const FRUIT_HARVEST_SECONDS = {
      "Apple":43200,"Blueberry":43200,"Orange":43200,"Banana":43200,
      "Tomato":7200,"Lemon":86400
    };
    const GREENHOUSE_HARVEST_SECONDS = {
      "Rice":115200,"Olive":158400,"Grape":43200
    };
    const RESOURCE_RECOVERY_MS = {
      "Tree":2*3600000,"Stone":4*3600000,"Iron":8*3600000,
      "Gold":24*3600000,"Crimstone":24*3600000,"Sunstone":72*3600000,"Oil":20*3600000
    };
    const COMPOSTER_NAMES = ["Compost Bin","Turbo Composter","Premium Composter"];

    // ═══════════════════════════════════════
    //  DASHBOARD — Sub-parsers
    // ═══════════════════════════════════════

    function dashParseCrops(farm) {
      const actions = [];
      const now = Date.now();
      const crops = farm.crops || {};
      for (const [id, plot] of Object.entries(crops)) {
        if (!plot.crop) {
          actions.push({ category:"Crops", icon:"🌾", label:"Empty plot", detail:"Plant something!", status:"empty", readyAt:0, priority:90 });
          continue;
        }
        const c = plot.crop;
        const name = c.name || "Crop";
        const harvestSec = CROP_HARVEST_SECONDS[name] || 86400;
        const plantedAt = toMs(c.plantedAt || 0);
        const readyAt = plantedAt + harvestSec * 1000;
        if (readyAt <= now) {
          const ago = now - readyAt;
          actions.push({ category:"Crops", icon:"🌾", label:name, detail:dashAgoText(ago), status:"ready", readyAt, priority:10 });
        } else {
          actions.push({ category:"Crops", icon:"🌾", label:name, detail:"", status:"upcoming", readyAt, priority:50 });
        }
      }
      return dashCollapseItems(actions);
    }

    function dashParseFruits(farm) {
      const actions = [];
      const now = Date.now();
      const patches = farm.fruitPatches || {};
      for (const [id, patch] of Object.entries(patches)) {
        if (!patch.fruit) continue;
        const f = patch.fruit;
        const name = f.name || "Fruit";
        const harvestSec = FRUIT_HARVEST_SECONDS[name] || CROP_HARVEST_SECONDS[name] || 43200;
        const harvestedAt = toMs(f.harvestedAt || f.plantedAt || 0);
        const readyAt = harvestedAt + harvestSec * 1000;
        if (readyAt <= now) {
          actions.push({ category:"Fruits", icon:"🍎", label:name, detail:dashAgoText(now - readyAt), status:"ready", readyAt, priority:10 });
        } else {
          actions.push({ category:"Fruits", icon:"🍎", label:name, detail:"", status:"upcoming", readyAt, priority:50 });
        }
      }
      return dashCollapseItems(actions);
    }

    function dashParseResources(farm) {
      const actions = [];
      const now = Date.now();
      const types = [
        { key:"trees", sub:"wood", field:"choppedAt", name:"Tree", icon:"🌳", ms:RESOURCE_RECOVERY_MS["Tree"] },
        { key:"stones", sub:"stone", field:"minedAt", name:"Stone", icon:"⛏️", ms:RESOURCE_RECOVERY_MS["Stone"] },
        { key:"iron", sub:"stone", field:"minedAt", name:"Iron", icon:"⛏️", ms:RESOURCE_RECOVERY_MS["Iron"] },
        { key:"gold", sub:"stone", field:"minedAt", name:"Gold", icon:"✨", ms:RESOURCE_RECOVERY_MS["Gold"] },
        { key:"crimstones", sub:"stone", field:"minedAt", name:"Crimstone", icon:"💎", ms:RESOURCE_RECOVERY_MS["Crimstone"] },
        { key:"sunstones", sub:"stone", field:"minedAt", name:"Sunstone", icon:"☀️", ms:RESOURCE_RECOVERY_MS["Sunstone"] },
        { key:"oilReserves", sub:"oil", field:"drilledAt", name:"Oil", icon:"🛢️", ms:RESOURCE_RECOVERY_MS["Oil"] },
      ];
      for (const t of types) {
        const nodes = farm[t.key] || {};
        const items = [];
        for (const [id, node] of Object.entries(nodes)) {
          const inner = node[t.sub];
          if (!inner) continue;
          const ts = toMs(inner[t.field] || 0);
          if (ts === 0) continue;
          const readyAt = ts + t.ms;
          if (readyAt <= now) {
            items.push({ category:t.name, icon:t.icon, label:t.name, detail:dashAgoText(now - readyAt), status:"ready", readyAt, priority:10 });
          } else {
            items.push({ category:t.name, icon:t.icon, label:t.name, detail:"", status:"upcoming", readyAt, priority:50 });
          }
        }
        actions.push(...dashCollapseItems(items));
      }
      return actions;
    }

    function dashGetFlowerSuggestions(inventory, inProgress, count) {
      // Reuse the same logic as getPetalBlessedRecommendation
      const { totalNeeded } = computeAllTotalNeeded(inventory, inProgress);
      const candidates = [];
      for (const [name, needed] of Object.entries(totalNeeded)) {
        const have = getCount(inventory, name) + (inProgress[name] || 0);
        const remaining = Math.max(0, needed - have);
        if (remaining <= 0) continue;
        const recipe = FLOWER_RECIPES[name];
        if (!recipe) continue;
        const sd = SEED_DATA[recipe.seed];
        if (!sd) continue;
        let inputReady = true;
        if (isFlowerInput(recipe.input)) {
          inputReady = (getCount(inventory, recipe.input) + (inProgress[recipe.input] || 0)) > 0;
        }
        candidates.push({ name, remaining, seedHours: sd.hours, seed: recipe.seed, inputReady });
      }
      // Sort: longest grow time first, then input-ready, then most remaining
      candidates.sort((a, b) => {
        if (b.seedHours !== a.seedHours) return b.seedHours - a.seedHours;
        if (a.inputReady !== b.inputReady) return a.inputReady ? -1 : 1;
        return b.remaining - a.remaining;
      });
      const picks = [];
      const used = {};
      for (const c of candidates) {
        if (picks.length >= count) break;
        const canUse = Math.min(c.remaining - (used[c.name] || 0), count - picks.length);
        for (let i = 0; i < canUse; i++) {
          picks.push(c);
          used[c.name] = (used[c.name] || 0) + 1;
        }
      }
      return picks;
    }

    function dashParseFlowers(farm, inventory, inProgress) {
      const actions = [];
      const now = Date.now();
      const beds = farm.flowers?.flowerBeds || {};
      let readyCount = 0, emptyCount = 0;

      for (const [id, bed] of Object.entries(beds)) {
        if (!bed.flower) {
          emptyCount++;
          continue;
        }
        const fl = bed.flower;
        const name = fl.name || "Flower";
        const plantedAt = toMs(fl.plantedAt || 0);
        const recipe = FLOWER_RECIPES[name];
        let growMs = 86400000;
        if (recipe) {
          const sd = SEED_DATA[recipe.seed];
          if (sd) growMs = sd.baseSeconds * 1000;
        }
        const readyAt = plantedAt + growMs;
        if (readyAt <= now) {
          readyCount++;
          actions.push({ category:"Flowers", icon:"🌸", label:name, detail:dashAgoText(now - readyAt), status:"ready", readyAt, priority:10 });
        } else {
          actions.push({ category:"Flowers", icon:"🌸", label:name, detail:"", status:"upcoming", readyAt, priority:50 });
        }
      }

      // For ready/empty beds, show what to plant next
      const freeBeds = readyCount + emptyCount;
      if (freeBeds > 0) {
        const suggestions = dashGetFlowerSuggestions(inventory, inProgress, freeBeds);
        if (suggestions.length > 0) {
          // Group suggestions by name
          const grouped = {};
          for (const s of suggestions) {
            if (!grouped[s.name]) grouped[s.name] = { ...s, count: 0 };
            grouped[s.name].count++;
          }
          for (const s of Object.values(grouped)) {
            const prefix = s.count > 1 ? s.count + "x " : "";
            const warn = s.inputReady ? "" : " (need input!)";
            actions.push({ category:"Flowers", icon:"🌸", label:"➡ Plant: " + prefix + s.name + warn, detail:s.seedHours + "h grow (" + s.remaining + " left)", status:"ready", readyAt:0, priority:11 });
          }
        }
      }

      return actions;
    }

    function dashParseAnimals(farm) {
      const actions = [];
      const now = Date.now();
      const sources = [
        { key:"henHouse", icon:"🐔", name:"Chicken" },
        { key:"barn", icon:"🐄", name:"Barn animal" },
      ];
      for (const src of sources) {
        const building = farm[src.key];
        if (!building || !building.animals) continue;
        for (const [id, animal] of Object.entries(building.animals)) {
          const name = animal.type || src.name;
          const icon = name === "Chicken" ? "🐔" : name === "Cow" ? "🐄" : name === "Sheep" ? "🐑" : src.icon;
          if (animal.state === "sick") {
            actions.push({ category:"Animals", icon, label:name + " (SICK)", detail:"Needs cure!", status:"ready", readyAt:0, priority:1 });
            continue;
          }
          const awakeAt = toMs(animal.awakeAt || 0);
          if (awakeAt > 0 && awakeAt <= now) {
            actions.push({ category:"Animals", icon, label:name, detail:dashAgoText(now - awakeAt), status:"ready", readyAt:awakeAt, priority:10 });
          } else if (awakeAt > now) {
            actions.push({ category:"Animals", icon, label:name, detail:"", status:"upcoming", readyAt:awakeAt, priority:50 });
          }
        }
      }
      return dashCollapseItems(actions);
    }

    function dashParseCooking(farm) {
      const actions = [];
      const now = Date.now();
      const buildings = farm.buildings || {};
      // Cooking buildings: crafting is an array of items
      for (const bName of COOKING_BUILDING_NAMES) {
        const instances = buildings[bName] || [];
        for (const inst of instances) {
          const craftingArr = inst.crafting;
          if (!craftingArr || !Array.isArray(craftingArr) || craftingArr.length === 0) continue;
          for (const craft of craftingArr) {
            if (!craft.readyAt || !craft.name) continue;
            const readyAt = toMs(craft.readyAt);
            if (readyAt <= now) {
              actions.push({ category:"Cooking", icon:"🍳", label:craft.name + " (" + bName + ")", detail:dashAgoText(now - readyAt), status:"ready", readyAt, priority:10 });
            } else {
              actions.push({ category:"Cooking", icon:"🍳", label:craft.name + " (" + bName + ")", detail:"", status:"upcoming", readyAt, priority:50 });
            }
          }
        }
      }
      // Fish Market: processing is an array
      const fishMarkets = buildings["Fish Market"] || [];
      for (const inst of fishMarkets) {
        const processing = inst.processing;
        if (!processing || !Array.isArray(processing)) continue;
        for (const item of processing) {
          if (!item.readyAt || !item.name) continue;
          const readyAt = toMs(item.readyAt);
          if (readyAt <= now) {
            actions.push({ category:"Cooking", icon:"🍳", label:item.name + " (Fish Market)", detail:dashAgoText(now - readyAt), status:"ready", readyAt, priority:10 });
          } else {
            actions.push({ category:"Cooking", icon:"🍳", label:item.name + " (Fish Market)", detail:"", status:"upcoming", readyAt, priority:50 });
          }
        }
      }
      return actions;
    }

    function dashParseComposters(farm) {
      const actions = [];
      const now = Date.now();
      const buildings = farm.buildings || {};
      for (const cName of COMPOSTER_NAMES) {
        const instances = buildings[cName] || [];
        for (const inst of instances) {
          const producing = inst.producing;
          if (!producing) {
            actions.push({ category:"Composters", icon:"♻️", label:cName + " idle", detail:"Start composting!", status:"empty", readyAt:0, priority:90 });
            continue;
          }
          const readyAt = toMs(producing.readyAt || 0);
          if (readyAt <= now) {
            actions.push({ category:"Composters", icon:"♻️", label:cName, detail:dashAgoText(now - readyAt), status:"ready", readyAt, priority:10 });
          } else {
            actions.push({ category:"Composters", icon:"♻️", label:cName, detail:"", status:"upcoming", readyAt, priority:50 });
          }
        }
      }
      return actions;
    }

    function dashParseGreenhouse(farm) {
      const actions = [];
      const now = Date.now();
      const pots = farm.greenhouse?.pots || {};
      for (const [id, pot] of Object.entries(pots)) {
        if (!pot.plant) continue;
        const p = pot.plant;
        const name = p.name || "Greenhouse crop";
        const plantedAt = toMs(p.plantedAt || 0);
        const harvestSec = GREENHOUSE_HARVEST_SECONDS[name] || CROP_HARVEST_SECONDS[name] || 86400;
        const readyAt = plantedAt + harvestSec * 1000;
        if (readyAt <= now) {
          actions.push({ category:"Greenhouse", icon:"🏠", label:name, detail:dashAgoText(now - readyAt), status:"ready", readyAt, priority:10 });
        } else {
          actions.push({ category:"Greenhouse", icon:"🏠", label:name, detail:"", status:"upcoming", readyAt, priority:50 });
        }
      }
      return dashCollapseItems(actions);
    }

    function dashParseBeehives(farm) {
      // Reuse existing extractBeehiveDetails which does proper flower-rate calculation
      const hiveDetails = farm.beehives ? extractBeehiveDetails(farm.beehives) : [];
      const actions = [];
      const now = Date.now();
      for (const hive of hiveDetails) {
        if (hive.empty) continue;
        const pct = Math.round(hive.progressPct || 0);
        if (hive.progressPct >= 100 || (hive.readyAt && hive.readyAt <= now)) {
          actions.push({ category:"Beehives", icon:"🐝", label:"Beehive" + (hive.hasSwarm ? " 🐝!" : ""), detail:"Full!", status:"ready", readyAt:hive.readyAt || now, priority:10 });
        } else if (hive.readyAt) {
          actions.push({ category:"Beehives", icon:"🐝", label:"Beehive (" + pct + "%)" + (hive.hasSwarm ? " 🐝!" : ""), detail:"", status:"upcoming", readyAt:hive.readyAt, priority:50 });
        } else {
          // Stalled — no active flowers
          actions.push({ category:"Beehives", icon:"🐝", label:"Beehive (" + pct + "%) stalled", detail:"No flowers!", status:"empty", readyAt:0, priority:80 });
        }
      }
      return actions;
    }

    function dashParseCraftingBox(farm, inventory, inProgress) {
      const actions = [];
      const now = Date.now();
      const cb = farm.craftingBox;
      if (!cb) return actions;
      if (cb.status === "crafting" && cb.readyAt) {
        const readyAt = toMs(cb.readyAt);
        const itemName = cb.item?.collectible || "Item";
        if (readyAt <= now) {
          actions.push({ category:"Crafting Box", icon:"🔨", label:itemName + " ready!", detail:dashAgoText(now - readyAt), status:"ready", readyAt, priority:5 });
        } else {
          actions.push({ category:"Crafting Box", icon:"🔨", label:"Crafting: " + itemName, detail:"", status:"upcoming", readyAt, priority:50 });
        }
      }
      // Show missing dolls when idle OR just finished (player needs to pick next)
      const isIdle = !cb.status || cb.status !== "crafting" || (cb.readyAt && toMs(cb.readyAt) <= now);
      if (isIdle) {
        const tracked = getTrackedDolls();
        for (const [name, on] of Object.entries(tracked)) {
          if (!on) continue;
          const have = getCount(inventory, name) + (inProgress[name] || 0);
          if (have >= LIMIT) continue;
          const recipe = DOLL_RECIPES[name];
          if (!recipe || recipe.length === 0) continue;
          const ingredients = recipe.map(r => r.qty + "x " + r.item).join(", ");
          actions.push({ category:"Crafting Box", icon:"🔨", label:"➡ Craft: " + name + " (" + have + "/" + LIMIT + ")", detail:ingredients, status:"empty", readyAt:0, priority:86 });
        }
      }
      return actions;
    }

    function dashParseCrabTraps(farm, inventory, inProgress) {
      const actions = [];
      const now = Date.now();
      const spots = farm.crabTraps?.trapSpots || {};
      let readyTraps = 0, emptyTraps = 0;

      for (const [id, spot] of Object.entries(spots)) {
        if (spot.waterTrap) {
          const readyAt = toMs(spot.waterTrap.readyAt || 0);
          if (readyAt <= now) {
            readyTraps++;
            actions.push({ category:"Crab Traps", icon:"🦀", label:"Trap ready", detail:dashAgoText(now - readyAt), status:"ready", readyAt, priority:10 });
          } else {
            actions.push({ category:"Crab Traps", icon:"🦀", label:"Trap active", detail:"", status:"upcoming", readyAt, priority:50 });
          }
        } else {
          emptyTraps++;
        }
      }

      // Show missing crustaceans when traps are ready or empty
      const freeTraps = readyTraps + emptyTraps;
      if (freeTraps > 0) {
        for (const [name, recipe] of Object.entries(CRUSTACEAN_RECIPES)) {
          const have = getCount(inventory, name) + (inProgress[name] || 0);
          if (have >= LIMIT) continue;
          const chum = recipe.chum ? recipe.qty + "x " + recipe.chum : "No chum";
          const pot = recipe.pot;
          actions.push({ category:"Crab Traps", icon:"🦀", label:"➡ Catch: " + name + " (" + have + "/" + LIMIT + ")", detail:pot + " • " + chum, status:"empty", readyAt:0, priority:89 });
        }
      }

      return actions;
    }

    function dashParsePets(farm) {
      const actions = [];
      const now = Date.now();
      const todayStartUTC = dashGetTodayStartUTC();
      const pets = farm.pets || {};

      function processPet(name, pet, isNFT) {
        const icon = isNFT ? "🐶" : "🐱";
        // Caress: pettedAt + 2h
        const pettedAt = toMs(pet.pettedAt || 0);
        const napFinishedAt = pettedAt + 2 * 3600000;
        if (napFinishedAt <= now) {
          actions.push({ category:"Pets", icon, label:"Pet " + name + " 💕", detail:"Caress ready", status:"ready", readyAt:napFinishedAt, priority:15 });
        } else if (pettedAt > 0) {
          actions.push({ category:"Pets", icon, label:"Pet " + name + " 💕", detail:"", status:"upcoming", readyAt:napFinishedAt, priority:55 });
        }
        // Feed: requests.fedAt is a direct field (not array)
        const fedAt = toMs(pet.requests?.fedAt || 0);
        if (fedAt < todayStartUTC) {
          actions.push({ category:"Pets", icon, label:"Feed " + name + " 🍖", detail:"Hungry!", status:"ready", readyAt:0, priority:12 });
        }
      }

      // NFT pets
      for (const [petId, pet] of Object.entries(pets.nfts || {})) {
        processPet(pet.name || "Pet #" + petId, pet, true);
      }
      // Common pets
      for (const [petName, pet] of Object.entries(pets.common || {})) {
        processPet(petName, pet, false);
      }

      return dashCollapseItems(actions);
    }

    function dashParseFaction(farm) {
      const actions = [];
      const faction = farm.faction;
      if (!faction) return actions;

      const history = faction.history || {};
      const sortedWeeks = Object.keys(history).sort();
      const currentWeekKey = sortedWeeks[sortedWeeks.length - 1] || "";
      const prevWeekKey = sortedWeeks[sortedWeeks.length - 2] || "";
      const currentWeekData = history[currentWeekKey] || {};
      const prevWeekData = history[prevWeekKey] || {};

      // Debug: log faction data to help understand kitchen structure
      if (faction.kitchen) console.log("[Dashboard] faction.kitchen:", JSON.stringify(faction.kitchen));

      // \u2500\u2500 Faction Pet \u2500\u2500
      const petStreak = currentWeekData.collectivePet?.streak || 0;
      const streakMult = petStreak >= 8 ? 1.5 : petStreak >= 6 ? 1.3 : petStreak >= 4 ? 1.2 : petStreak >= 2 ? 1.1 : 1.0;
      const fedThisWeek = faction.pet?.qualifiesForBoost === true;
      const lastWeekFed = (prevWeekData.petXP || 0) > 0;
      const boostActiveNow = lastWeekFed && streakMult > 1;
      // Next week's mult (assumes streak continues if fed)
      const nextStreak = petStreak + (fedThisWeek ? 0 : 1);
      const nextMult = nextStreak >= 8 ? 1.5 : nextStreak >= 6 ? 1.3 : nextStreak >= 4 ? 1.2 : nextStreak >= 2 ? 1.1 : 1.0;

      if (!fedThisWeek) {
        if (petStreak >= 8) {
          // URGENT: streak 8+ means \u00d71.5 boost — don't lose it!
          let detail = "Streak " + petStreak + " (\u00d7" + streakMult + ")";
          if (boostActiveNow) detail += " | \u00d7" + streakMult + " active now";
          detail += " | FEED to keep boost!";
          actions.push({ category:"Faction", icon:"\u2764\ufe0f", label:"Feed faction pet!", detail, status:"ready", readyAt:0, priority:2 });
        } else {
          // Not urgent — just info
          let detail = "Not fed yet | Streak " + petStreak;
          if (boostActiveNow) detail += " | \u00d7" + streakMult + " active now";
          if (petStreak > 0) detail += " | Next: \u00d7" + nextMult;
          actions.push({ category:"Faction", icon:"\u2764\ufe0f", label:"Faction pet", detail, status:"upcoming", readyAt:Infinity, priority:99 });
        }
      } else {
        // Fed this week
        let detail = "Fed \u2714 | Streak " + petStreak;
        if (boostActiveNow) detail += " | \u00d7" + streakMult + " active now";
        detail += " | Next week: \u00d7" + nextMult;
        actions.push({ category:"Faction", icon:"\u2764\ufe0f", label:"Faction pet", detail, status:"upcoming", readyAt:Infinity, priority:99 });
      }

      // \u2500\u2500 Faction Kitchen/Chef \u2500\u2500
      const kitchen = faction.kitchen || {};
      const todayStartUTC = dashGetTodayStartUTC();
      const kitchenFedAt = toMs(kitchen.dailyFedAt || kitchen.contributedAt || kitchen.lastFedAt || kitchen.fedAt || 0);
      const kitchenFedToday = kitchenFedAt >= todayStartUTC;

      if (kitchen && Object.keys(kitchen).length > 0) {
        // Try to parse cost from various possible structures
        let costPer1 = "";
        let costPer10 = "";
        let contributed = "";
        try {
          // kitchen.requests / kitchen.currentRequest — the weekly ingredient cost
          const req = kitchen.requests || kitchen.currentRequest || kitchen.week?.requests || null;
          if (req) {
            let ingredients = [];
            if (Array.isArray(req)) {
              // Array of {item, amount} or similar
              for (const r of req) {
                if (typeof r === "string") { ingredients.push({ name: r, qty: 1 }); continue; }
                const name = r.item || r.name || r.resource || Object.keys(r).find(k => typeof r[k] === "string" && k !== "amount" && k !== "qty") || "?";
                const qty = r.amount || r.qty || r.quantity || 1;
                ingredients.push({ name: typeof name === "string" ? name : String(name), qty });
              }
            } else if (typeof req === "object") {
              for (const [k, v] of Object.entries(req)) {
                if (typeof v === "number") { ingredients.push({ name: k, qty: v }); continue; }
                if (typeof v === "object" && v !== null) {
                  const name = v.item || v.name || k;
                  const qty = v.amount || v.qty || 1;
                  ingredients.push({ name, qty });
                }
              }
            }
            if (ingredients.length > 0) {
              costPer1 = "1x: " + ingredients.map(i => i.qty + " " + i.name).join(", ");
              costPer10 = "10x: " + ingredients.map(i => (i.qty * 10) + " " + i.name).join(", ");
            }
          }

          // Try to find contribution count
          const pts = kitchen.points || kitchen.score || kitchen.contributions || kitchen.totalContributions || kitchen.week?.contributions || null;
          if (typeof pts === "number") contributed = "Given: " + pts + "x";
        } catch(e) {}

        if (!kitchenFedToday) {
          let parts = [];
          if (costPer1) parts.push(costPer1);
          if (costPer10) parts.push(costPer10);
          if (contributed) parts.push(contributed);
          const detail = parts.length > 0 ? parts.join(" | ") : "Feed the chef!";
          actions.push({ category:"Faction", icon:"👨‍🍳", label:"Feed faction chef", detail, status:"ready", readyAt:0, priority:6 });
        } else {
          let parts = ["Done today \u2714"];
          if (contributed) parts.push(contributed);
          const detail = parts.join(" | ");
          actions.push({ category:"Faction", icon:"👨‍🍳", label:"Faction chef", detail, status:"upcoming", readyAt:Infinity, priority:99 });
        }
      }

      return actions;
    }

    const DASH_POWER_COOLDOWNS = {
      "Instant Growth": 72*3600, "Tree Blitz": 24*3600, "Barnyard Rouse": 120*3600,
      "Greenhouse Guru": 96*3600, "Instant Gratification": 96*3600,
      "Petal Blessed": 96*3600, "Grease Lightning": 96*3600,
    };

    function dashParsePowers(farm) {
      const actions = [];
      const now = Date.now();
      const powers = farm.bumpkin?.previousPowerUseAt;
      if (!powers) return actions;
      const hasLuna = (farm.wardrobe?.["Luna's Crescent"] || 0) > 0;
      for (const [name, lastUsed] of Object.entries(powers)) {
        const baseCooldown = DASH_POWER_COOLDOWNS[name];
        if (!baseCooldown) continue;
        const cooldownSec = baseCooldown * (hasLuna ? 0.5 : 1);
        const nextAt = toMs(lastUsed) + cooldownSec * 1000;
        if (nextAt <= now) {
          actions.push({ category:"Powers", icon:"⚡", label:name, detail:dashAgoText(now - nextAt), status:"ready", readyAt:nextAt, priority:15 });
        } else {
          actions.push({ category:"Powers", icon:"⚡", label:name, detail:"", status:"upcoming", readyAt:nextAt, priority:50 });
        }
      }
      return actions;
    }

    function dashGetTodayStartUTC() {
      const now = new Date();
      now.setUTCHours(0,0,0,0);
      return now.getTime();
    }

    // Bud Box type rotation (from sfl.js)
    const DASH_BUD_ORDER = ["Plaza","Woodlands","Cave","Sea","Castle","Port","Retreat","Saphiro","Snow","Beach"];
    function dashGetDailyBudBoxType(ms) {
      const daysSinceEpoch = Math.floor(ms / (1000 * 60 * 60 * 24)) + 2;
      return DASH_BUD_ORDER[daysSinceEpoch % DASH_BUD_ORDER.length];
    }

    function dashParseDailies(farm) {
      const actions = [];
      const ts = dashGetTodayStartUTC();

      // Desert Dig — collectedAt is in digging.streak.collectedAt OR digging.collectedAt
      try {
        const digging = farm.desert?.digging;
        if (digging) {
          const collected = toMs(
            (digging.streak && digging.streak.collectedAt) ? digging.streak.collectedAt
            : (digging.collectedAt || 0)
          );
          if (collected < ts) {
            actions.push({ category:"Dailies", icon:"⛏️", label:"Desert Dig", detail:"Uncollected!", status:"ready", readyAt:0, priority:5 });
          }
        }
      } catch(e) {}

      // Shipments
      try {
        const ship = farm.shipments;
        if (ship && ship.restockedAt) {
          const restocked = toMs(ship.restockedAt);
          if (restocked < ts) {
            actions.push({ category:"Dailies", icon:"📦", label:"Shipments", detail:"Restock available!", status:"ready", readyAt:0, priority:5 });
          }
        }
      } catch(e) {}

      // Daily Rewards
      try {
        const dr = farm.dailyRewards?.chest;
        if (dr && dr.collectedAt) {
          const collected = toMs(dr.collectedAt);
          if (collected < ts) {
            actions.push({ category:"Dailies", icon:"🎁", label:"Daily Reward", detail:"Uncollected!", status:"ready", readyAt:0, priority:5 });
          }
        }
      } catch(e) {}

      // Maneki Neko — check both farm.collectibles AND farm.home.collectibles
      try {
        let mn = (farm.collectibles?.["Maneki Neko"] || [])[0];
        if (!mn) mn = (farm.home?.collectibles?.["Maneki Neko"] || [])[0];
        if (mn && mn.shakenAt) {
          const shaken = toMs(mn.shakenAt);
          if (shaken < ts) {
            actions.push({ category:"Dailies", icon:"🐱", label:"Maneki Neko", detail:"Shake it!", status:"ready", readyAt:0, priority:5 });
          }
        }
      } catch(e) {}

      // Pirate Chest
      try {
        const pc = farm.pumpkinPlaza?.pirateChest;
        if (pc && pc.openedAt) {
          const opened = toMs(pc.openedAt);
          if (opened < ts) {
            actions.push({ category:"Dailies", icon:"☠️", label:"Pirate Chest", detail:"Unopened!", status:"ready", readyAt:0, priority:5 });
          }
        }
      } catch(e) {}

      // Bud Box — only show if player owns a bud of today's type
      try {
        const bb = farm.pumpkinPlaza?.budBox;
        const buds = farm.buds || {};
        const playerBudTypes = Object.values(buds).map(b => b.type).filter(Boolean);
        const todayType = dashGetDailyBudBoxType(Date.now());
        if (playerBudTypes.includes(todayType)) {
          const opened = toMs(bb?.openedAt || 0);
          if (opened < ts) {
            actions.push({ category:"Dailies", icon:"🌱", label:"Bud Box: " + todayType, detail:"Unopened!", status:"ready", readyAt:0, priority:5 });
          }
        }
      } catch(e) {}

      // Floating Island — check schedule + petalPuzzleSolvedAt
      try {
        const fi = farm.floatingIsland;
        if (fi) {
          const solvedAt = toMs(fi.petalPuzzleSolvedAt || 0);
          if (solvedAt < ts) {
            const schedule = fi.schedule || [];
            const now = Date.now();
            const isActive = schedule.some(p => now >= p.startAt && now <= p.endAt);
            if (isActive) {
              actions.push({ category:"Dailies", icon:"🏝️", label:"Floating Island", detail:"Puzzle unsolved!", status:"ready", readyAt:0, priority:5 });
            }
          }
        }
      } catch(e) {}

      return actions;
    }

    function dashParseTrades(farm) {
      const actions = [];
      const trades = farm.trades || {};

      // Fulfilled listings (sold, needs collection)
      const listings = trades.listings || {};
      for (const [id, listing] of Object.entries(listings)) {
        if (listing.fulfilledAt) {
          actions.push({ category:"Trades", icon:"💰", label:"Sale complete", detail:"Collect proceeds!", status:"ready", readyAt:0, priority:3 });
        }
      }

      // Fulfilled offers (bought, needs collection)
      const offers = trades.offers || {};
      for (const [id, offer] of Object.entries(offers)) {
        if (offer.fulfilledAt) {
          actions.push({ category:"Trades", icon:"📥", label:"Purchase complete", detail:"Collect item!", status:"ready", readyAt:0, priority:3 });
        }
      }

      return actions;
    }

    function dashGetLavaPitDurationSeconds(farm) {
      let time = 72 * 3600; // 72h base
      if (farm.boostsUsedAt?.["Obsidian Necklace"]) time = time / 2;
      if (farm.boostsUsedAt?.["Magma Stone"]) time = time * 0.85;
      return time;
    }

    function dashParseLavaPits(farm) {
      const actions = [];
      const now = Date.now();
      const pits = farm.lavaPits || {};
      const durationSec = dashGetLavaPitDurationSeconds(farm);
      for (const [id, pit] of Object.entries(pits)) {
        const startedAt = toMs(pit.startedAt || pit.createdAt || 0);
        const removedAt = pit.removedAt || pit.collectedAt || null;
        if (removedAt) continue; // already collected
        if (!startedAt) continue;
        const readyAt = startedAt + durationSec * 1000;
        if (readyAt <= now) {
          actions.push({ category:"Lava Pits", icon:"🌋", label:"Lava Pit", detail:dashAgoText(now - readyAt), status:"ready", readyAt, priority:10 });
        } else {
          actions.push({ category:"Lava Pits", icon:"🌋", label:"Lava Pit", detail:"", status:"upcoming", readyAt, priority:50 });
        }
      }
      return dashCollapseItems(actions);
    }

    function dashParseCropMachine(farm) {
      const actions = [];
      const now = Date.now();
      const machines = (farm.buildings || {})["Crop Machine"] || [];
      for (const m of machines) {
        const queue = m.queue || [];
        for (const item of queue) {
          if (!item.crop) continue;
          let readyAtMs = toMs(item.readyAt || item.growsUntil || 0);
          if (readyAtMs <= 0) continue;
          const cropName = item.crop;
          const seeds = item.seeds || item.amount || 1;
          if (readyAtMs <= now) {
            actions.push({ category:"Crop Machine", icon:"⚙️", label:seeds + "x " + cropName, detail:dashAgoText(now - readyAtMs), status:"ready", readyAt:readyAtMs, priority:10 });
          } else {
            actions.push({ category:"Crop Machine", icon:"⚙️", label:seeds + "x " + cropName, detail:"", status:"upcoming", readyAt:readyAtMs, priority:50 });
          }
        }
      }
      return actions;
    }

    function dashParseMushrooms(farm) {
      const actions = [];
      const now = Date.now();
      const mushData = farm.mushrooms;
      if (!mushData) return actions;
      const uncollected = mushData.mushrooms || {};
      // Wild mushrooms
      if (mushData.spawnedAt) {
        let hasWild = Object.values(uncollected).some(m => m.name === "Wild Mushroom");
        if (hasWild) {
          const count = Object.values(uncollected).filter(m => m.name === "Wild Mushroom").length;
          actions.push({ category:"Mushrooms", icon:"🍄", label:count + "x Wild Mushroom", detail:"Collect!", status:"ready", readyAt:toMs(mushData.spawnedAt), priority:8 });
        } else {
          // Spawning countdown
          const spawnedAt = toMs(mushData.spawnedAt);
          const readyAt = spawnedAt + 16 * 3600000;
          if (readyAt > now) {
            actions.push({ category:"Mushrooms", icon:"🍄", label:"Mushroom", detail:"", status:"upcoming", readyAt, priority:50 });
          }
        }
      }
      // Magic mushrooms
      if (mushData.magicSpawnedAt) {
        let hasMagic = Object.values(uncollected).some(m => m.name === "Magic Mushroom");
        if (hasMagic) {
          actions.push({ category:"Mushrooms", icon:"🍄", label:"Magic Mushroom", detail:"Collect!", status:"ready", readyAt:toMs(mushData.magicSpawnedAt), priority:8 });
        } else {
          const islandType = farm.island?.type || "basic";
          const times = { basic:48*3600, petal_paradise:36*3600, desert:24*3600, volcano:22*3600 };
          const harvestSec = times[islandType] || 48*3600;
          const spawnedAt = toMs(mushData.magicSpawnedAt);
          const readyAt = spawnedAt + harvestSec * 1000;
          if (readyAt > now) {
            actions.push({ category:"Mushrooms", icon:"🍄", label:"Magic Mushroom", detail:"", status:"upcoming", readyAt, priority:50 });
          } else {
            actions.push({ category:"Mushrooms", icon:"🍄", label:"Magic Mushroom", detail:dashAgoText(now - readyAt), status:"ready", readyAt, priority:8 });
          }
        }
      }
      return actions;
    }

    function dashParseDeliveryOrders(farm) {
      const actions = [];
      try {
        const orders = farm.delivery?.orders || [];
        const flowerNames = new Set(Object.keys(FLOWER_RECIPES));
        for (const order of orders) {
          if (order.completedAt) continue;
          const from = order.from || "Unknown";
          const items = order.items || {};
          // Skip orders that require flowers
          const itemKeys = Object.keys(items);
          const hasFlower = itemKeys.some(name => flowerNames.has(name));
          if (hasFlower) continue;
          // Build reward text
          const rewards = [];
          if (order.reward?.sfl) rewards.push("+" + (+order.reward.sfl).toFixed(1) + " SFL");
          if (order.reward?.coins) rewards.push("+" + order.reward.coins + " coins");
          if (order.reward?.items) {
            for (const [rName, rQty] of Object.entries(order.reward.items)) {
              rewards.push("+" + rQty + " " + rName);
            }
          }
          const rewardText = rewards.length > 0 ? rewards.join(", ") : "";
          const itemDesc = Object.entries(items).map(([n, q]) => q + "x " + n).join(", ");
          actions.push({ category:"Deliveries", icon:"📋", label:from + ": " + itemDesc, detail:rewardText, status:"ready", readyAt:0, priority:20 });
        }
      } catch(e) {}
      return actions;
    }

    // ═══════════════════════════════════════
    //  DASHBOARD — Helpers
    // ═══════════════════════════════════════

    function dashAgoText(ms) {
      if (ms < 60000) return "just now";
      if (ms < 3600000) return Math.floor(ms / 60000) + "m ago";
      if (ms < 86400000) return Math.floor(ms / 3600000) + "h " + Math.floor((ms % 3600000) / 60000) + "m ago";
      return Math.floor(ms / 86400000) + "d ago";
    }

    function dashFormatCountdown(ms) {
      if (ms <= 0) return "Ready!";
      if (ms < 60000) return Math.ceil(ms / 1000) + "s";
      if (ms < 3600000) return Math.floor(ms / 60000) + "m " + Math.floor((ms % 60000) / 1000) + "s";
      const h = Math.floor(ms / 3600000);
      const m = Math.floor((ms % 3600000) / 60000);
      return h + "h " + String(m).padStart(2, "0") + "m";
    }

    function dashCollapseItems(items) {
      // Group identical category+status+label items into "Nx Label"
      const groups = {};
      for (const item of items) {
        const key = item.category + "|" + item.status + "|" + item.label;
        if (!groups[key]) {
          groups[key] = { ...item, count: 1, maxReadyAt: item.readyAt, minReadyAt: item.readyAt };
        } else {
          groups[key].count++;
          if (item.readyAt > groups[key].maxReadyAt) groups[key].maxReadyAt = item.readyAt;
          if (item.readyAt < groups[key].minReadyAt) groups[key].minReadyAt = item.readyAt;
        }
      }
      return Object.values(groups).map(g => {
        if (g.count > 1) {
          g.label = g.count + "× " + g.label;
          // For upcoming, use the soonest one for countdown
          if (g.status === "upcoming") g.readyAt = g.minReadyAt;
        }
        return g;
      });
    }

    // ═══════════════════════════════════════
    //  DASHBOARD — Main Render
    // ═══════════════════════════════════════

    function parseDashboardActions(farm) {
      const inventory = farm.inventory || {};
      const inProgress = extractInProgress(farm);
      const actions = [];

      actions.push(...dashParseCrops(farm));
      actions.push(...dashParseFruits(farm));
      actions.push(...dashParseResources(farm));
      actions.push(...dashParseFlowers(farm, inventory, inProgress));
      actions.push(...dashParseAnimals(farm));
      actions.push(...dashParseCooking(farm));
      actions.push(...dashParseComposters(farm));
      actions.push(...dashParseGreenhouse(farm));
      actions.push(...dashParseBeehives(farm));
      actions.push(...dashParseCraftingBox(farm, inventory, inProgress));
      actions.push(...dashParseCrabTraps(farm, inventory, inProgress));
      actions.push(...dashParsePets(farm));
      actions.push(...dashParseFaction(farm));
      actions.push(...dashParsePowers(farm));
      actions.push(...dashParseDailies(farm));
      actions.push(...dashParseTrades(farm));
      actions.push(...dashParseLavaPits(farm));
      actions.push(...dashParseCropMachine(farm));
      actions.push(...dashParseMushrooms(farm));
      actions.push(...dashParseDeliveryOrders(farm));

      return actions;
    }

    function renderDashboard(data) {
      const app = document.getElementById("app");
      if (!data || !data.farm) {
        app.innerHTML = `<div class="header pixel-panel pixel-font">
          <h1>DASHBOARD</h1>
          <div class="farm-id">Load your farm to see pending actions</div>
        </div>`;
        return;
      }

      const farm = data.farm;
      const actions = parseDashboardActions(farm);
      const now = Date.now();

      const ready = actions.filter(a => a.status === "ready");
      const upcoming = actions.filter(a => a.status === "upcoming");
      const idle = actions.filter(a => a.status === "empty");

      // Sort: ready by most overdue first, upcoming by soonest, idle by priority
      ready.sort((a, b) => a.readyAt - b.readyAt);
      upcoming.sort((a, b) => a.readyAt - b.readyAt);
      idle.sort((a, b) => a.priority - b.priority);

      let html = `<div class="header pixel-panel pixel-font">
        <h1>DASHBOARD</h1>
        <div class="farm-id">Farm #${escHTML(FARM_ID)}</div>
        <div class="dash-summary">
          ${ready.length ? `<span class="dash-summary-badge ready">${ready.length} ready</span>` : ""}
          ${upcoming.length ? `<span class="dash-summary-badge upcoming">${upcoming.length} upcoming</span>` : ""}
          ${idle.length ? `<span class="dash-summary-badge idle">${idle.length} idle</span>` : ""}
        </div>
      </div>`;

      if (ready.length === 0 && upcoming.length === 0 && idle.length === 0) {
        html += `<div class="dash-all-done pixel-panel pixel-font">
          <div class="icon">✅</div>
          All caught up! Nothing to do right now.
        </div>`;
        app.innerHTML = html;
        return;
      }

      // Group by category within each status
      function groupByCategory(items) {
        const cats = {};
        for (const item of items) {
          if (!cats[item.category]) cats[item.category] = [];
          cats[item.category].push(item);
        }
        return cats;
      }

      function renderItem(item) {
        const cls = item.status === "ready" ? "ready" : item.status === "upcoming" ? "upcoming" : "empty";
        let timeHtml = "";
        if (item.status === "ready") {
          timeHtml = `<span class="dash-ready-badge green">READY</span>`;
        } else if (item.status === "upcoming") {
          const diff = item.readyAt - now;
          timeHtml = `<span class="dash-time growing-bed-time" data-ready="${item.readyAt}">${dashFormatCountdown(diff)}</span>`;
        } else if (item.status === "empty") {
          timeHtml = `<span class="dash-ready-badge blue">IDLE</span>`;
        }
        const detailHtml = item.detail ? `<div class="dash-detail">${escHTML(item.detail)}</div>` : "";
        return `<div class="dash-item ${cls}">
          <span>${item.icon}</span>
          <div class="dash-item-label">${escHTML(item.label)}${detailHtml}</div>
          ${timeHtml}
        </div>`;
      }

      function renderSection(catName, items, badgeCls) {
        const icon = items[0]?.icon || "";
        return `<div class="dash-section pixel-panel pixel-font">
          <div class="dash-section-title">
            <span>${icon}</span> ${escHTML(catName)}
            <span class="dash-count ${badgeCls}">${items.length}</span>
          </div>
          ${items.map(renderItem).join("")}
        </div>`;
      }

      // READY NOW
      if (ready.length > 0) {
        html += `<div class="dash-group-title pixel-font">🚨 READY NOW</div>`;
        const cats = groupByCategory(ready);
        for (const [cat, items] of Object.entries(cats)) {
          html += renderSection(cat, items, "");
        }
      }

      // COMING SOON
      if (upcoming.length > 0) {
        html += `<div class="dash-group-title pixel-font">⏳ COMING SOON</div>`;
        const cats = groupByCategory(upcoming);
        for (const [cat, items] of Object.entries(cats)) {
          html += renderSection(cat, items, "upcoming");
        }
      }

      // IDLE
      if (idle.length > 0) {
        html += `<div class="dash-group-title pixel-font">💤 IDLE</div>`;
        const cats = groupByCategory(idle);
        for (const [cat, items] of Object.entries(cats)) {
          html += renderSection(cat, items, "idle");
        }
      }

      app.innerHTML = html;
    }

    function renderHub(data) {
      const app = document.getElementById("app");
      const flowerTotal = Object.keys(FLOWER_RECIPES).length;
      const trackedDolls = getTrackedDolls();
      const dollTotal = Object.entries(trackedDolls).filter(([,v]) => v).length;
      const crustTotal = Object.keys(CRUSTACEAN_RECIPES).length;

      let flowerProgress = "", dollProgress = "", crustProgress = "", bumpkinProgress = "";

      if (data) {
        const { inventory, inProgress } = data;
        const { totalNeeded } = computeAllTotalNeeded(inventory, inProgress);

        let fc = 0;
        for (const [name, needed] of Object.entries(totalNeeded)) {
          if (getCount(inventory, name) + (inProgress[name] || 0) >= needed) fc++;
        }
        flowerProgress = `<div class="hub-card-progress pixel-font">${fc}/${flowerTotal} complete</div>`;

        let dc = 0;
        for (const [name, tracked] of Object.entries(trackedDolls)) {
          if (!tracked) continue;
          if (getCount(inventory, name) + (inProgress[name] || 0) >= LIMIT) dc++;
        }
        dollProgress = `<div class="hub-card-progress pixel-font">${dc}/${dollTotal} complete</div>`;

        let cc = 0;
        for (const name of Object.keys(CRUSTACEAN_RECIPES)) {
          if (getCount(inventory, name) + (inProgress[name] || 0) >= LIMIT) cc++;
        }
        crustProgress = `<div class="hub-card-progress pixel-font">${cc}/${crustTotal} complete</div>`;

        if (data.bumpkin) {
          const bxp = parseFloat(data.bumpkin.experience || 0);
          const blvl = getBumpkinLevel(bxp);
          bumpkinProgress = `<div class="hub-card-progress pixel-font">Level ${blvl}/200</div>`;
        }
      }

      let html = `<div class="header pixel-panel pixel-font">
        <h1>SFL COLLECTION TRACKER</h1>
        ${FARM_ID ? `<div class="farm-id">Farm #${escHTML(FARM_ID)} | Target: ${LIMIT} of each</div>` : `<div class="farm-id">Enter your Farm ID to get started</div>`}
      </div>`;

      html += `<div class="hub-cards">
        <div class="hub-card pixel-panel" onclick="navigateTo('flowers')">
          <div class="hub-card-icon">🌸</div>
          <h3 class="pixel-font">FLOWERS</h3>
          <div class="hub-card-count pixel-font">${flowerTotal} types</div>
          ${flowerProgress}
        </div>
        <div class="hub-card pixel-panel" onclick="navigateTo('dolls')">
          <div class="hub-card-icon">🪆</div>
          <h3 class="pixel-font">DOLLS</h3>
          <div class="hub-card-count pixel-font">${dollTotal} tracked</div>
          ${dollProgress}
        </div>
        <div class="hub-card pixel-panel" onclick="navigateTo('crustaceans')">
          <div class="hub-card-icon">🦀</div>
          <h3 class="pixel-font">CRUSTACEANS</h3>
          <div class="hub-card-count pixel-font">${crustTotal} types</div>
          ${crustProgress}
        </div>
        <div class="hub-card pixel-panel" onclick="navigateTo('bumpkin')">
          <div class="hub-card-icon">👨‍🍳</div>
          <h3 class="pixel-font">BUMPKIN</h3>
          <div class="hub-card-count pixel-font">XP Calculator</div>
          ${bumpkinProgress}
        </div>
        <div class="hub-card pixel-panel" onclick="navigateTo('treasury')">
          <div class="hub-card-icon">💰</div>
          <h3 class="pixel-font">TREASURY</h3>
          <div class="hub-card-count pixel-font">Farm Value</div>
        </div>
        <div class="hub-card pixel-panel" onclick="navigateTo('sales')">
          <div class="hub-card-icon">📤</div>
          <h3 class="pixel-font">SALES</h3>
          <div class="hub-card-count pixel-font">Marketplace</div>
        </div>
        <div class="hub-card pixel-panel" onclick="navigateTo('power')">
          <div class="hub-card-icon">⚡</div>
          <h3 class="pixel-font">POWER</h3>
          <div class="hub-card-count pixel-font">Boost ROI Analyzer</div>
        </div>
        <div class="hub-card pixel-panel" onclick="navigateTo('buds')">
          <div class="hub-card-icon">🌱</div>
          <h3 class="pixel-font">BUDS</h3>
          <div class="hub-card-count pixel-font">${BUD_COUNT} NFTs</div>
        </div>
      </div>`;

      app.innerHTML = html;
    }

    // ═══════════════════════════════════════
    //  RENDER: FLOWERS
    // ═══════════════════════════════════════

    function renderFlowers(data) {
      const { inventory, inProgress, petalBlessed, flowerBeds, activeBoosts, flowerMultiplier, season } = data;
      lastInventory = inventory;
      lastInProgress = inProgress;

      const { totalNeeded, dependents } = computeAllTotalNeeded(inventory, inProgress);
      const app = document.getElementById("app");

      const groups = {};
      for (const seed of SEED_ORDER) groups[seed] = [];
      for (const [name, recipe] of Object.entries(FLOWER_RECIPES)) {
        groups[recipe.seed].push(name);
      }

      const flowerData = {};
      let totalComplete = 0, totalAll = 0, grandRemaining = 0;

      for (const [name, needed] of Object.entries(totalNeeded)) {
        const have = getCount(inventory, name);
        const pend = inProgress[name] || 0;
        const remaining = Math.max(0, needed - have - pend);
        const isComplete = remaining === 0;
        if (isComplete) totalComplete++;
        totalAll++;
        grandRemaining += remaining;
        const recipe = FLOWER_RECIPES[name];
        flowerData[name] = {
          name, needed, have, pend, remaining, isComplete,
          seed: recipe.seed, input: recipe.input,
          inputIsFlower: isFlowerInput(recipe.input),
          consumedBy: dependents[name] || [],
          ownNeed: LIMIT, depNeed: needed - LIMIT,
        };
      }

      const seedStats = {};
      for (const seed of SEED_ORDER) {
        const flowers = groups[seed];
        let rem = 0, complete = 0;
        for (const f of flowers) {
          rem += flowerData[f].remaining;
          if (flowerData[f].isComplete) complete++;
        }
        const batches = Math.ceil(rem / FLOWER_BEDS);
        const hours = batches * SEED_DATA[seed].hours;
        seedStats[seed] = { remaining: rem, complete, total: flowers.length, batches, hours };
      }

      const grandHours = Object.values(seedStats).reduce((s, x) => s + x.hours, 0);
      const pctComplete = totalAll > 0 ? Math.round((totalComplete / totalAll) * 100) : 0;

      let html = "";

      html += `<div class="header pixel-panel pixel-font">
        <h1>FLOWER TRACKER</h1>
        <div class="farm-id">Farm #${escHTML(FARM_ID)} | Target: ${LIMIT} of each${season ? ` | Season: ${escHTML(season)}` : ""}</div>
      </div>`;

      html += `<div class="summary-bar pixel-panel pixel-font">
        <div class="summary-stat"><div class="label">COMPLETE</div><div class="value complete">${totalComplete} / ${totalAll}</div></div>
        <div class="summary-stat"><div class="label">REMAINING</div><div class="value pending">${grandRemaining} grows</div></div>
        <div class="summary-stat"><div class="label">BEDS</div><div class="value" style="color:var(--sunpetal)">${FLOWER_BEDS}</div></div>
        <div class="summary-stat"><div class="label">EST. TIME</div><div class="value time">${formatHours(grandHours)}</div></div>
      </div>`;

      if (activeBoosts && activeBoosts.length > 0) {
        const pctStr = Math.round(Math.abs(1 - flowerMultiplier) * 100);
        const sign = flowerMultiplier <= 1 ? "-" : "+";
        const color = flowerMultiplier <= 1 ? "var(--green)" : "var(--red)";
        html += `<div class="boost-bar pixel-panel pixel-font" style="padding:8px 12px;display:flex;flex-wrap:wrap;align-items:center;gap:6px 12px;font-size: 0.5625rem">
          <span style="color:${color}">BOOSTS ${sign}${pctStr}%</span>
          ${activeBoosts.map(b => `<span style="color:var(--text-secondary)">${escHTML(b.name)} <span style="color:var(--text-dim)">&times;${b.multiplier}</span></span>`).join("")}
          <span style="color:var(--text-dim);margin-left:auto">Sunpetal: ${formatHours(SEED_DATA["Sunpetal Seed"].hours)}</span>
        </div>`;
      }

      html += `<div class="progress-overview pixel-panel">
        <div class="progress-label pixel-font"><span>Progress</span><span>${pctComplete}%</span></div>
        <div class="progress-bar-outer"><div class="progress-bar-fill green" style="width:${pctComplete}%"></div></div>
      </div>`;

      // Currently Growing
      const plannerBeds = flowerBeds ? extractBedDetails(flowerBeds) : [];
      if (plannerBeds.length > 0) {
        html += `<div class="growing-section pixel-panel pixel-font">
          <div class="growing-title">CURRENTLY GROWING</div>
          <div class="growing-grid">`;
        const now = Date.now();
        for (const bed of plannerBeds) {
          if (bed.empty) {
            html += `<div class="growing-bed empty-bed">
              <div style="width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size: 1.125rem;opacity:0.3">🌱</div>
              <div class="growing-bed-info"><div class="growing-bed-name" style="color:var(--text-dim)">Empty</div></div>
            </div>`;
          } else {
            const diff = bed.readyAt - now;
            const isReady = diff <= 0;
            let timeStr;
            if (isReady) { timeStr = "Ready!"; }
            else { const h = Math.floor(diff/3600000); const m = Math.floor((diff%3600000)/60000); timeStr = h > 0 ? `${h}h ${String(m).padStart(2,"0")}m` : `${m}m`; }
            const sdLabel = SEED_DATA[bed.seedType]?.label || "?";
            html += `<div class="growing-bed">
              <img class="growing-bed-img" src="${getItemIcon(bed.name)}" onerror="this.style.display='none'" alt="">
              <div class="growing-bed-info">
                <div class="growing-bed-name">${escHTML(bed.name)}</div>
                <div class="growing-bed-detail">${sdLabel} | yield: ${bed.totalYield}${bed.bonus > 0 ? ` (1+${bed.bonus})` : ""}</div>
              </div>
              <div class="growing-bed-time ${isReady ? "ready" : "growing"}" data-ready="${bed.readyAt}">${timeStr}</div>
            </div>`;
          }
        }
        html += `</div></div>`;
      }

      // Beehives
      const beehives = data.farm?.beehives ? extractBeehiveDetails(data.farm.beehives) : [];
      if (beehives.length > 0) {
        const swarmActive = beehives.some(h => h.hasSwarm);
        const now = Date.now();
        html += `<div class="growing-section pixel-panel pixel-font">
          <div class="growing-title">BEEHIVES${swarmActive ? ' <span style="color:var(--yellow)">BEE SWARM!</span>' : ''}</div>
          <div class="growing-grid">`;

        for (const hive of beehives) {
          if (hive.empty) {
            html += `<div class="growing-bed empty-bed">
              <div style="width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:1.125rem;opacity:0.3">🍯</div>
              <div class="growing-bed-info"><div class="growing-bed-name" style="color:var(--text-dim)">Empty</div></div>
            </div>`;
          } else if (hive.idle) {
            html += `<div class="growing-bed">
              <img class="growing-bed-img" src="${getItemIcon("Honey")}" onerror="this.style.display='none'" alt="">
              <div class="growing-bed-info">
                <div class="growing-bed-name">Hive #${hive.id.slice(-3)}</div>
                <div class="growing-bed-detail">${Math.round(hive.progressPct)}% full${hive.hasSwarm ? ' · SWARM' : ''}</div>
              </div>
              <div class="growing-bed-time" style="color:var(--text-dim)">No flower</div>
            </div>`;
          } else {
            const diff = hive.readyAt - now;
            const isReady = diff <= 0;
            let timeStr;
            if (isReady) { timeStr = "Ready!"; }
            else { const h = Math.floor(diff/3600000); const m = Math.floor((diff%3600000)/60000); timeStr = h > 0 ? `${h}h ${String(m).padStart(2,"0")}m` : `${m}m`; }
            html += `<div class="growing-bed">
              <img class="growing-bed-img" src="${getItemIcon("Honey")}" onerror="this.style.display='none'" alt="">
              <div class="growing-bed-info">
                <div class="growing-bed-name">Hive #${hive.id.slice(-3)}</div>
                <div class="growing-bed-detail">${Math.round(hive.progressPct)}% full${hive.hasSwarm ? ' · SWARM' : ''}</div>
              </div>
              <div class="growing-bed-time ${isReady ? "ready" : "growing"}" data-ready="${hive.readyAt}">${timeStr}</div>
            </div>`;
          }
        }
        html += `</div></div>`;

        if (swarmActive) {
          html += `<div class="growing-section pixel-panel pixel-font" style="text-align:center;padding:10px 16px;color:var(--yellow);font-size:0.625rem">
            🐝 BEE SWARM active — collecting honey now adds +0.2 yield to all growing crops!
          </div>`;
        }
      }

      // Petal Blessed
      if (petalBlessed.status === "ready") {
        html += `<button class="petal-blessed-btn" onclick="togglePetalBlessed()">Petal Blessed READY — tap to plan!</button>`;
      } else if (petalBlessed.status === "cooldown") {
        html += `<div class="petal-blessed-btn pb-cooldown" style="cursor:default;opacity:0.7;background:linear-gradient(180deg,#3b1768,#2a1050,#1e0a3c)">Petal Blessed in <span id="pb-timer" data-next="${petalBlessed.nextAt}">--:--:--</span></div>`;
      }
      html += `<div id="petal-blessed-container"></div>`;

      // Grow Planner
      html += renderGrowPlanner(flowerData, plannerBeds, petalBlessed);

      // Seed sections
      for (const seed of SEED_ORDER) {
        const sd = SEED_DATA[seed];
        const ss = seedStats[seed];
        const flowers = groups[seed];
        if (flowers.length === 0) continue;

        html += `<div class="seed-section">`;
        html += `<div class="seed-header pixel-font">
          <img class="seed-icon" src="${getItemIcon(seed)}" onerror="this.style.display='none'" alt="">
          <h2 style="color:${sd.color}">${sd.label}</h2>
          ${sd.season ? (() => { const inSeason = sd.season.toLowerCase() === (season || "").toLowerCase(); return `<span class="seed-badge" style="border-color:${inSeason ? 'var(--green)' : 'var(--text-dim)'};color:${inSeason ? 'var(--green)' : 'var(--text-dim)'};${inSeason ? '' : 'opacity:0.5;text-decoration:line-through'}">${sd.season}</span>`; })() : ""}
          <div class="seed-meta">
            <span>${formatHours(sd.hours)} / grow</span>
            <span>${ss.complete}/${ss.total} done</span>
            <span>${ss.remaining > 0 ? `~${ss.batches} batches = ${formatHours(ss.hours)}` : "All complete!"}</span>
          </div>
        </div>`;

        html += `<div class="flower-grid">`;

        const sorted = [...flowers].sort((a, b) => {
          const fa = flowerData[a], fb = flowerData[b];
          if (fa.isComplete !== fb.isComplete) return fa.isComplete ? 1 : -1;
          return fb.remaining - fa.remaining;
        });

        for (const fname of sorted) {
          const f = flowerData[fname];
          const pct = f.needed > 0 ? Math.min(100, Math.round(((f.have + f.pend) / f.needed) * 100)) : 100;
          const color = flowerColorCSS(fname);
          const isGradient = color.includes("gradient");

          let chainHTML = "";
          if (f.inputIsFlower) {
            const inputData = flowerData[f.input];
            const avail = inputData ? inputData.have + inputData.pend : 0;
            const inputOk = avail > 0;
            chainHTML += `<span style="color:${inputOk ? 'var(--green)' : 'var(--red)'}"><img class="inline-icon" src="${getItemIcon(f.input)}" onerror="this.style.display='none'" alt="">${escHTML(f.input)}</span>`;
            chainHTML += ` (${avail} avail)`;
          } else {
            const cropHave = getCount(inventory, f.input);
            const cropOk = cropHave > 0;
            chainHTML += `<span style="color:${cropOk ? 'var(--green)' : 'var(--red)'}"><img class="inline-icon" src="${getItemIcon(f.input)}" onerror="this.style.display='none'" alt="">${escHTML(f.input)}</span> (${cropHave} avail)`;
          }
          if (f.consumedBy.length > 0) {
            const tags = f.consumedBy.map(c => {
              const cd = flowerData[c];
              return `<span class="consumed-tag"><img class="inline-icon" src="${getItemIcon(c)}" onerror="this.style.display='none'" alt="">${escHTML(c)} (x${cd ? cd.needed : "?"})</span>`;
            }).join("");
            chainHTML += ` <span class="consumed-by">used in</span>${tags}`;
          }

          html += `<div class="flower-row ${f.isComplete ? "complete" : ""}" data-flower="${escHTML(fname)}" onclick="toggleChain(this)">
            <div class="flower-img-wrap">
              <img class="flower-img" src="${getItemIcon(fname)}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'" alt="">
              <div class="flower-color-dot" style="display:none;${isGradient ? "background:" + color : "background-color:" + color}"></div>
            </div>
            <div class="flower-info">
              <div class="flower-name">${escHTML(fname)}</div>
              <div class="flower-chain">${chainHTML}</div>
            </div>
            <div class="flower-progress">
              <div class="flower-bar-outer"><div class="flower-bar-fill ${barClass(pct)}" style="width:${pct}%"></div></div>
              <div class="flower-count">
                <span class="have">${f.have}${f.pend > 0 ? `<span class="pending">+${f.pend}</span>` : ""} / ${f.needed}</span>
                ${f.depNeed > 0 ? `<span style="color:var(--text-dim);font-size: 0.5625rem">(${f.ownNeed}+${f.depNeed})</span>` : ""}
              </div>
            </div>
            <div class="flower-time">
              ${f.isComplete
                ? `<div class="done pixel-font">DONE</div>`
                : `<div class="remaining-count pixel-font">-${f.remaining}</div><div class="remaining-time">${formatHours(f.remaining * sd.hours)}</div>`}
            </div>
          </div>`;
        }

        html += `</div></div>`;
      }

      html += `<div class="footer">
        <button class="refresh-btn" onclick="refresh()">REFRESH</button>
        <div class="timestamp pixel-font">Updated: ${new Date().toLocaleTimeString("cs-CZ")}</div>
      </div>`;

      app.innerHTML = html;
    }

    // ═══════════════════════════════════════
    //  RENDER: DOLLS
    // ═══════════════════════════════════════

    function renderDolls(data) {
      const { inventory, inProgress, craftingBox } = data;
      lastInventory = inventory;
      lastInProgress = inProgress;
      const app = document.getElementById("app");

      const trackedDolls = getTrackedDolls();
      const dollList = [];
      let totalComplete = 0, totalAll = 0, grandRemaining = 0;

      for (const [name, tracked] of Object.entries(trackedDolls)) {
        if (!tracked) continue;
        totalAll++;
        const have = getCount(inventory, name);
        const pend = inProgress[name] || 0;
        const remaining = Math.max(0, LIMIT - have - pend);
        const isComplete = remaining === 0;
        if (isComplete) totalComplete++;
        grandRemaining += remaining;
        dollList.push({ name, have, pend, remaining, isComplete, ingredients: DOLL_RECIPES[name] || [], needed: LIMIT });
      }

      const pctComplete = totalAll > 0 ? Math.round((totalComplete / totalAll) * 100) : 0;

      let html = `<div class="header pixel-panel pixel-font">
        <h1>DOLL TRACKER</h1>
        <div class="farm-id">Farm #${escHTML(FARM_ID)} | Target: ${LIMIT} of each</div>
      </div>`;

      // Tracked dolls toggle
      const allDollNames = Object.keys(DOLL_RECIPES);
      const trackedCount = Object.values(trackedDolls).filter(v => v).length;
      html += `<div class="config-collapsed pixel-panel pixel-font" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'block':'none'" style="cursor:pointer">
        <span>Tracking ${trackedCount}/${allDollNames.length} dolls</span>
        <span class="config-toggle">CONFIGURE &#9660;</span>
      </div>
      <div style="display:none;margin-bottom:16px;padding:12px 16px;background:var(--bg-dark);border:4px solid var(--border-brown);box-shadow:0 0 0 3px #000">
        <div style="display:flex;flex-wrap:wrap;gap:6px">
          ${allDollNames.map(name => {
            const on = trackedDolls[name];
            return `<button onclick="event.stopPropagation();toggleDollTracked('${escHTML(name)}')" style="font-family:'Press Start 2P',cursive;font-size: 0.5rem;padding:6px 8px;border:2px solid ${on ? 'var(--green)' : 'var(--border-brown)'};background:${on ? 'rgba(48,209,88,0.15)' : 'var(--bg-card)'};color:${on ? 'var(--green)' : 'var(--text-dim)'};cursor:pointer;white-space:nowrap">${escHTML(name.replace(' Doll',''))}</button>`;
          }).join("")}
        </div>
      </div>`;

      html += `<div class="summary-bar pixel-panel pixel-font">
        <div class="summary-stat"><div class="label">COMPLETE</div><div class="value complete">${totalComplete} / ${totalAll}</div></div>
        <div class="summary-stat"><div class="label">REMAINING</div><div class="value pending">${grandRemaining} crafts</div></div>
      </div>`;

      html += `<div class="progress-overview pixel-panel">
        <div class="progress-label pixel-font"><span>Progress</span><span>${pctComplete}%</span></div>
        <div class="progress-bar-outer"><div class="progress-bar-fill green" style="width:${pctComplete}%"></div></div>
      </div>`;

      // Currently Crafting
      if (craftingBox && craftingBox.status === "crafting" && craftingBox.item?.collectible) {
        const readyAttr = craftingBox.readyAt ? ` data-ready="${craftingBox.readyAt}"` : "";
        html += `<div class="growing-section pixel-panel pixel-font">
          <div class="growing-title">CURRENTLY CRAFTING</div>
          <div class="growing-grid">
            <div class="growing-bed">
              <div style="font-size: 1.5rem;flex-shrink:0">🪆</div>
              <div class="growing-bed-info">
                <div class="growing-bed-name">${escHTML(craftingBox.item.collectible)}</div>
                <div class="growing-bed-detail">Crafting Box</div>
              </div>
              <div class="growing-bed-time growing"${readyAttr}>Crafting...</div>
            </div>
          </div>
        </div>`;
      }

      // Doll list
      const sorted = dollList.sort((a, b) => {
        if (a.isComplete !== b.isComplete) return a.isComplete ? 1 : -1;
        return b.remaining - a.remaining;
      });

      html += `<div class="flower-grid" style="border:3px solid var(--border-dark)">`;
      for (const d of sorted) {
        const pct = d.needed > 0 ? Math.min(100, Math.round(((d.have + d.pend) / d.needed) * 100)) : 100;

        let ingredientHTML = "";
        if (d.ingredients.length === 0) {
          ingredientHTML = `<span style="color:var(--text-dim)">Recipe unknown</span>`;
        } else {
          ingredientHTML = d.ingredients.map(ing => {
            const have = getCount(inventory, ing.item);
            const ok = have >= ing.qty;
            return `<span style="color:${ok ? 'var(--green)' : 'var(--red)'}"><img class="inline-icon" src="${getItemIcon(ing.item)}" onerror="this.style.display='none'" alt="">${escHTML(ing.item)} x${ing.qty}</span>`;
          }).join(", ");
        }

        html += `<div class="flower-row ${d.isComplete ? 'complete' : ''}" data-doll="${escHTML(d.name)}" onclick="toggleDollChain(this)">
          <div class="flower-img-wrap"><img class="flower-img" src="${getItemIcon(d.name)}" onerror="this.style.display='none'" alt=""></div>
          <div class="flower-info">
            <div class="flower-name">${escHTML(d.name)}</div>
            <div class="flower-chain">${ingredientHTML}</div>
          </div>
          <div class="flower-progress">
            <div class="flower-bar-outer"><div class="flower-bar-fill ${barClass(pct)}" style="width:${pct}%"></div></div>
            <div class="flower-count">
              <span class="have">${d.have}${d.pend > 0 ? `<span class="pending">+${d.pend}</span>` : ""} / ${d.needed}</span>
            </div>
          </div>
          <div class="flower-time">
            ${d.isComplete
              ? `<div class="done pixel-font">DONE</div>`
              : `<div class="remaining-count pixel-font">-${d.remaining}</div>`}
          </div>
        </div>`;
      }
      html += `</div>`;

      html += `<div class="footer">
        <button class="refresh-btn" onclick="refresh()">REFRESH</button>
        <div class="timestamp pixel-font">Updated: ${new Date().toLocaleTimeString("cs-CZ")}</div>
      </div>`;

      app.innerHTML = html;
    }

    // ═══════════════════════════════════════
    //  RENDER: CRUSTACEANS
    // ═══════════════════════════════════════

    function renderCrustaceans(data) {
      const { inventory, inProgress, trapSpots } = data;
      lastInventory = inventory;
      lastInProgress = inProgress;
      const app = document.getElementById("app");

      TRAP_COUNT = Math.max(1, Object.keys(trapSpots).length);

      let totalComplete = 0, totalAll = 0, grandRemaining = 0;
      const crustData = {};

      for (const [name, recipe] of Object.entries(CRUSTACEAN_RECIPES)) {
        totalAll++;
        const have = getCount(inventory, name);
        const pend = inProgress[name] || 0;
        const remaining = Math.max(0, LIMIT - have - pend);
        const isComplete = remaining === 0;
        if (isComplete) totalComplete++;
        grandRemaining += remaining;
        crustData[name] = { name, have, pend, remaining, isComplete, ...recipe, needed: LIMIT };
      }

      const pctComplete = totalAll > 0 ? Math.round((totalComplete / totalAll) * 100) : 0;

      let html = `<div class="header pixel-panel pixel-font">
        <h1>CRUSTACEAN TRACKER</h1>
        <div class="farm-id">Farm #${escHTML(FARM_ID)} | Target: ${LIMIT} of each</div>
      </div>`;

      html += `<div class="summary-bar pixel-panel pixel-font">
        <div class="summary-stat"><div class="label">COMPLETE</div><div class="value complete">${totalComplete} / ${totalAll}</div></div>
        <div class="summary-stat"><div class="label">REMAINING</div><div class="value pending">${grandRemaining} traps</div></div>
        <div class="summary-stat"><div class="label">TRAPS</div><div class="value" style="color:var(--sunpetal)">${TRAP_COUNT}</div></div>
      </div>`;

      html += `<div class="progress-overview pixel-panel">
        <div class="progress-label pixel-font"><span>Progress</span><span>${pctComplete}%</span></div>
        <div class="progress-bar-outer"><div class="progress-bar-fill green" style="width:${pctComplete}%"></div></div>
      </div>`;

      // Currently Trapping — show ready + in-progress
      const readyItems = [];
      const trappingItems = [];
      const nowMs = Date.now();
      for (const [id, spot] of Object.entries(trapSpots)) {
        const wt = spot.waterTrap;
        if (!wt) continue;
        const readyAt = toMs(wt.readyAt || 0);
        const caught = wt.caught || {};
        const names = Object.entries(caught);
        if (names.length === 0) continue;
        if (readyAt <= nowMs) {
          for (const [name, qty] of names) readyItems.push({ id, name, qty });
        } else {
          for (const [name, qty] of names) trappingItems.push({ id, name, qty, readyAt });
        }
      }

      if (trappingItems.length > 0) {
        html += `<div class="growing-section pixel-panel pixel-font">
          <div class="growing-title">TRAPPING</div>
          <div class="growing-grid">`;
        for (const c of trappingItems) {
          const diff = c.readyAt - nowMs;
          const timeStr = diff > 3600000 ? `${(diff / 3600000).toFixed(1)}h` : `${Math.ceil(diff / 60000)}m`;
          html += `<div class="growing-bed">
            <img class="growing-bed-img" src="${getItemIcon(c.name)}" onerror="this.style.display='none'" alt="">
            <div class="growing-bed-info">
              <div class="growing-bed-name">${escHTML(c.name)}</div>
              <div class="growing-bed-detail">x${c.qty}</div>
            </div>
            <div class="growing-bed-time growing" data-ready="${c.readyAt}">${timeStr}</div>
          </div>`;
        }
        html += `</div></div>`;
      }

      if (readyItems.length > 0) {
        html += `<div class="growing-section pixel-panel pixel-font">
          <div class="growing-title">READY TO COLLECT</div>
          <div class="growing-grid">`;
        for (const c of readyItems) {
          html += `<div class="growing-bed">
            <img class="growing-bed-img" src="${getItemIcon(c.name)}" onerror="this.style.display='none'" alt="">
            <div class="growing-bed-info">
              <div class="growing-bed-name">${escHTML(c.name)}</div>
              <div class="growing-bed-detail">x${c.qty}</div>
            </div>
            <div class="growing-bed-time ready">Collect!</div>
          </div>`;
        }
        html += `</div></div>`;
      }

      // Pot sections
      const potGroups = {
        "Crab Pot": { label: "CRAB POT", time: "4h", emoji: "🦀", items: [] },
        "Mariner Pot": { label: "MARINER POT", time: "8h", emoji: "🐟", items: [] },
      };

      for (const [name, d] of Object.entries(crustData)) {
        potGroups[d.pot].items.push(d);
      }

      for (const [potType, group] of Object.entries(potGroups)) {
        const sorted = [...group.items].sort((a, b) => {
          if (a.isComplete !== b.isComplete) return a.isComplete ? 1 : -1;
          return b.remaining - a.remaining;
        });

        const complete = sorted.filter(d => d.isComplete).length;

        html += `<div class="seed-section">
          <div class="seed-header pixel-font">
            <div style="font-size: 1.375rem">${group.emoji}</div>
            <h2 style="color:var(--blue)">${group.label}</h2>
            <div class="seed-meta">
              <span>${group.time} / trap</span>
              <span>${complete}/${sorted.length} done</span>
            </div>
          </div>
          <div class="flower-grid">`;

        for (const d of sorted) {
          const pct = d.needed > 0 ? Math.min(100, Math.round(((d.have + d.pend) / d.needed) * 100)) : 100;

          let chumHTML = "";
          if (d.chum) {
            const chumHave = getCount(inventory, d.chum);
            const ok = chumHave >= d.qty;
            chumHTML = `<span style="color:${ok ? 'var(--green)' : 'var(--red)'}"><img class="inline-icon" src="${getItemIcon(d.chum)}" onerror="this.style.display='none'" alt="">${escHTML(d.chum)} x${d.qty}</span>`;
            if (d.alt) {
              const altMatch = d.alt.match(/^(.+?)\s*x(\d+)$/);
              const altIcon = altMatch ? `<img class="inline-icon" src="${getItemIcon(altMatch[1])}" onerror="this.style.display='none'" alt="">` : "";
              chumHTML += ` <span style="color:var(--text-dim);font-size: 0.625rem">alt: ${altIcon}${escHTML(d.alt)}</span>`;
            }
          } else {
            chumHTML = `<span style="color:var(--text-dim)">No chum needed</span>`;
          }

          html += `<div class="flower-row ${d.isComplete ? 'complete' : ''}" data-crust="${escHTML(d.name)}" onclick="toggleCrustChain(this)">
            <div class="flower-img-wrap"><img class="flower-img" src="${getItemIcon(d.name)}" onerror="this.style.display='none'" alt=""></div>
            <div class="flower-info">
              <div class="flower-name">${escHTML(d.name)}</div>
              <div class="flower-chain">${chumHTML}</div>
            </div>
            <div class="flower-progress">
              <div class="flower-bar-outer"><div class="flower-bar-fill ${barClass(pct)}" style="width:${pct}%"></div></div>
              <div class="flower-count">
                <span class="have">${d.have}${d.pend > 0 ? `<span class="pending">+${d.pend}</span>` : ""} / ${d.needed}</span>
              </div>
            </div>
            <div class="flower-time">
              ${d.isComplete
                ? `<div class="done pixel-font">DONE</div>`
                : `<div class="remaining-count pixel-font">-${d.remaining}</div>`}
            </div>
          </div>`;
        }

        html += `</div></div>`;
      }

      html += `<div class="footer">
        <button class="refresh-btn" onclick="refresh()">REFRESH</button>
        <div class="timestamp pixel-font">Updated: ${new Date().toLocaleTimeString("cs-CZ")}</div>
      </div>`;

      app.innerHTML = html;
    }

    // ═══════════════════════════════════════
    //  RENDER: BUMPKIN
    // ═══════════════════════════════════════

    function renderBumpkin(data) {
      const { bumpkin, buildings, farm } = data;
      const app = document.getElementById("app");

      if (!bumpkin) {
        app.innerHTML = `<div class="error-screen pixel-panel pixel-font">
          <div class="icon">⚠️</div>
          <h2>No bumpkin data found</h2>
          <p>Make sure your Farm ID is correct.</p>
        </div>`;
        return;
      }

      const currentXP = parseFloat(bumpkin.experience || 0);
      const currentLevel = getBumpkinLevel(currentXP);
      const maxXP = BUMPKIN_XP_TABLE[199];

      // Target level (user-adjustable)
      const savedTarget = parseInt(localStorage.getItem("sfl_bumpkin_target") || "200");
      const targetLevel = Math.max(currentLevel + 1, Math.min(200, savedTarget));
      const targetXP = BUMPKIN_XP_TABLE[targetLevel - 1];
      const xpRemaining = Math.max(0, targetXP - currentXP);
      const xpPctTotal = Math.min(100, (currentXP / maxXP) * 100);
      const xpPctTarget = Math.min(100, (currentXP / targetXP) * 100);

      // Level progress within current level
      const nextLevelXP = currentLevel < 200 ? BUMPKIN_XP_TABLE[currentLevel] : maxXP;
      const prevLevelXP = BUMPKIN_XP_TABLE[currentLevel - 1];
      const levelProgress = currentLevel >= 200 ? 100 :
        Math.round(((currentXP - prevLevelXP) / (nextLevelXP - prevLevelXP)) * 100);

      // Detect owned cooking buildings
      const ownedBuildings = {};
      for (const name of COOKING_BUILDING_NAMES) {
        const count = (buildings?.[name] || []).length;
        if (count > 0) ownedBuildings[name] = count;
      }

      // Detect cooking boosts
      const boosts = detectCookingBoosts(farm);
      const savedRecipes = getSavedBumpkinRecipes();

      // Calculate XP banked in food inventory
      const inventory = data.inventory || {};
      const foodInInventory = [];
      let bankedXP = 0;
      for (const [foodName, recipe] of Object.entries(COOKING_RECIPES_DATA)) {
        const qty = getCount(inventory, foodName);
        if (qty > 0) {
          const xpEach = computeFoodXP(foodName, recipe, recipe.building, boosts);
          const totalFoodXP = xpEach * qty;
          bankedXP += totalFoodXP;
          foodInInventory.push({ name: foodName, qty, xpEach, totalFoodXP });
        }
      }
      foodInInventory.sort((a, b) => b.totalFoodXP - a.totalFoodXP);
      const xpAfterFood = Math.max(0, xpRemaining - bankedXP);

      let html = "";

      // Header
      html += `<div class="header pixel-panel pixel-font">
        <h1>BUMPKIN XP CALCULATOR</h1>
        <div class="farm-id">Farm #${escHTML(FARM_ID)}</div>
      </div>`;

      // Level section
      html += `<div class="bumpkin-xp-section pixel-panel pixel-font">
        <div class="bumpkin-level-big">LVL ${currentLevel}</div>
        <div class="bumpkin-xp-info">
          ${Math.floor(currentXP).toLocaleString()} XP${xpRemaining > 0 ? ` — ${Math.ceil(xpRemaining).toLocaleString()} XP to level ${targetLevel}` : " — MAX LEVEL!"}
        </div>
        <div style="display:flex;align-items:center;gap:8px;margin:8px 0 4px">
          <span style="font-size: 0.5625rem;color:var(--text-dim);white-space:nowrap">Target LVL</span>
          <input type="range" min="${currentLevel + 1}" max="200" value="${targetLevel}" oninput="document.getElementById('target-val').textContent=this.value" onchange="setBumpkinTargetLevel(this.value)" style="flex:1;accent-color:var(--sunpetal);cursor:pointer">
          <span id="target-val" style="font-size: 0.6875rem;color:var(--sunpetal);min-width:24px;text-align:right">${targetLevel}</span>
        </div>
        <div class="progress-bar-outer"><div class="progress-bar-fill green" style="width:${xpPctTarget.toFixed(2)}%"></div></div>
        <div style="font-size: 0.5625rem;color:var(--text-dim);margin-top:2px">${xpPctTarget.toFixed(1)}% to level ${targetLevel}</div>
        ${currentLevel < 200 ? `<div style="margin-top:6px;font-size: 0.5625rem;color:var(--text-dim)">Level ${currentLevel} → ${currentLevel + 1}: ${levelProgress}%</div>` : ""}
      </div>`;

      // Food in inventory
      if (bankedXP > 0) {
        const fmtXP = (v) => v % 1 === 0 ? v.toLocaleString() : v.toLocaleString(undefined, { maximumFractionDigits: 0 });
        const xpAfterEating = currentXP + bankedXP;
        const levelAfterFood = getBumpkinLevel(xpAfterEating);
        const levelsGained = levelAfterFood - currentLevel;
        const afterFoodNextXP = levelAfterFood < 200 ? BUMPKIN_XP_TABLE[levelAfterFood] : maxXP;
        const afterFoodPrevXP = BUMPKIN_XP_TABLE[levelAfterFood - 1];
        const afterFoodPct = levelAfterFood >= 200 ? 100 :
          Math.round(((xpAfterEating - afterFoodPrevXP) / (afterFoodNextXP - afterFoodPrevXP)) * 100);
        html += `<div class="bumpkin-boosts pixel-panel pixel-font" style="display:block">
          <div style="text-align:center;margin-bottom:8px;padding-bottom:8px;border-bottom:2px solid rgba(92,58,30,0.4)">
            <div style="font-size: 0.5625rem;color:var(--text-dim);margin-bottom:2px">AFTER EATING ALL FOOD</div>
            <div style="font-size: 1.5rem;color:var(--green);font-weight:bold">LVL ${levelAfterFood}</div>
            ${levelsGained > 0 ? `<div style="font-size: 0.625rem;color:var(--sunpetal)">+${levelsGained} level${levelsGained > 1 ? "s" : ""} (${fmtXP(Math.floor(xpAfterEating))} XP total${levelAfterFood < 200 ? `, ${afterFoodPct}% to ${levelAfterFood + 1}` : ""})</div>` : `<div style="font-size: 0.625rem;color:var(--text-dim)">Same level (${afterFoodPct}% to ${currentLevel + 1})</div>`}
          </div>
          <h4 style="color:var(--sunpetal);margin-bottom:6px;padding-bottom:4px;border-bottom:2px solid rgba(92,58,30,0.4);font-size: 0.625rem;cursor:pointer" onclick="toggleFoodInventory()">
            <span id="food-inv-arrow">▶</span> FOOD IN INVENTORY — ${fmtXP(bankedXP)} XP (${foodInInventory.length} items)
          </h4>
          <div id="food-inv-list" style="display:none">
            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:2px 16px">
              ${foodInInventory.map(f => `<div class="boost-row"><span>${f.qty}× ${escHTML(f.name)}</span><span class="boost-val" style="color:var(--green)">${fmtXP(f.totalFoodXP)} XP</span></div>`).join("")}
            </div>
          </div>
          ${xpAfterFood > 0 ? `<div style="margin-top:6px;padding-top:4px;border-top:2px solid rgba(92,58,30,0.4);color:var(--text-secondary)">After eating: <span style="color:var(--yellow)">${fmtXP(xpAfterFood)}</span> XP still needed to target LVL ${targetLevel}</div>` : `<div style="margin-top:6px;padding-top:4px;border-top:2px solid rgba(92,58,30,0.4);color:var(--green)">Eating all food would reach level ${targetLevel}!</div>`}
        </div>`;
      }

      // Boosts section — always show both columns
      {
        const ps = boosts.petStreakInfo;
        const xpLabel = (b) => {
          let tag = "";
          if (b.buildings) tag = ` (${b.buildings.join(", ")})`;
          if (b.honeyOnly) tag = " (honey)";
          return tag;
        };
        // Pet streak section
        let petStreakHTML = `<div style="margin-top:8px;padding-top:8px;border-top:1px solid rgba(92,58,30,0.3)">`;
        // This week status
        if (ps.thisWeekActive) {
          petStreakHTML += `<div class="boost-row"><span>Pet's Streak (${ps.streak}w)</span><span class="boost-val" style="color:var(--green)">×${ps.multiplier}</span></div>`;
        } else {
          petStreakHTML += `<div class="boost-row" style="color:var(--text-dim)"><span>Pet's Streak (${ps.streak}w) — inactive</span><span class="boost-val">×${ps.multiplier}</span></div>`;
        }
        // Next week status
        if (!ps.nextWeekQualified) {
          petStreakHTML += `<div style="font-size: 0.5625rem;color:#c0392b;margin:2px 0">Feed pet to qualify for next week!</div>`;
        } else {
          petStreakHTML += `<div style="font-size: 0.5625rem;color:var(--green);margin:2px 0">Qualified for next week</div>`;
        }
        if (ps.weeksToMax > 0) {
          petStreakHTML += `<div style="font-size: 0.5625rem;color:var(--text-dim)">${ps.weeksToMax}w to max ×1.5</div>`;
        }
        petStreakHTML += `<div class="boost-row" style="margin-top:4px">
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;color:${ps.manualOverride ? "var(--green)" : "var(--text-dim)"}">
            <input type="checkbox" ${ps.manualOverride ? "checked" : ""} onchange="togglePetStreak()" style="cursor:pointer;accent-color:var(--green)">
            Simulate ×1.5
          </label>
          <span class="boost-val" style="color:${ps.manualOverride ? "var(--green)" : "var(--text-dim)"}">×1.5</span>
        </div></div>`;

        html += `<div class="bumpkin-boosts pixel-panel pixel-font">
          <div class="bumpkin-boosts-col">
            <h4 style="color:var(--green)">XP BOOSTS</h4>
            ${boosts.xpBoosts.filter(b => !b.petStreak).map(b => `<div class="boost-row"><span>${escHTML(b.name)}${xpLabel(b)}</span><span class="boost-val">×${b.multiplier}</span></div>`).join("") || '<div style="color:var(--text-dim)">None detected</div>'}
            ${petStreakHTML}
          </div>
          <div class="bumpkin-boosts-col">
            <h4 style="color:var(--blue)">TIME BOOSTS</h4>
            ${boosts.timeBoosts.length > 0 ? boosts.timeBoosts.map(b => `<div class="boost-row"><span>${escHTML(b.name)}${b.buildings ? " (" + b.buildings.join(", ") + ")" : ""}</span><span class="boost-val">×${b.multiplier}</span></div>`).join("") : '<div style="color:var(--text-dim)">None detected</div>'}
          </div>
        </div>`;
      }

      // Building cards
      const buildingEntries = Object.entries(ownedBuildings);
      if (buildingEntries.length === 0) {
        html += `<div class="bumpkin-summary pixel-panel pixel-font">
          <div style="font-size: 0.6875rem;color:var(--text-dim)">No cooking buildings detected.</div>
        </div>`;
      } else {
        html += `<div class="bumpkin-buildings-grid">`;

        let totalXPPerDay = 0;
        const buildingStats = [];

        for (const [buildingName, count] of buildingEntries) {
          const recipes = Object.entries(COOKING_RECIPES_DATA)
            .filter(([, r]) => r.building === buildingName && r.cookSec > 0)
            .map(([name, r]) => {
              const xp = computeFoodXP(name, r, buildingName, boosts);
              const time = computeCookTime(r.cookSec, buildingName, boosts);
              const xpPerHour = time > 0 ? (xp / time) * 3600 : 0;
              return { name, xp, time, xpPerHour };
            })
            .sort((a, b) => b.xpPerHour - a.xpPerHour);

          const selectedName = savedRecipes[buildingName] !== undefined ? savedRecipes[buildingName] : (BUMPKIN_DEFAULT_RECIPES[buildingName] || "");
          const selected = selectedName ? recipes.find(r => r.name === selectedName) : null;

          let xpPerDay = 0, cooksPerDay = 0, daysNeeded = Infinity;

          if (selected && selected.time > 0) {
            cooksPerDay = (86400 / selected.time) * count;
            xpPerDay = selected.xp * cooksPerDay;
            totalXPPerDay += xpPerDay;
            daysNeeded = xpAfterFood > 0 ? Math.ceil(xpAfterFood / xpPerDay) : 0;
          }

          buildingStats.push({ buildingName, xpPerDay, count });

          const emoji = COOKING_BUILDING_EMOJI[buildingName] || "🏠";
          const fmtXP = (v) => v % 1 === 0 ? v.toLocaleString() : v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

          html += `<div class="bumpkin-building-card pixel-panel">
            <div class="bumpkin-building-header pixel-font">
              <span style="font-size: 1.25rem">${emoji}</span>
              <span class="bumpkin-building-name">${escHTML(buildingName)}</span>
              ${count > 1 ? `<span class="bumpkin-building-count">×${count}</span>` : ""}
            </div>
            <select class="bumpkin-recipe-select" onchange="selectBumpkinRecipe('${escHTML(buildingName)}', this.value)">
              <option value="" ${!selectedName ? "selected" : ""}>-- None --</option>
              ${recipes.map(r => `<option value="${escHTML(r.name)}" ${r.name === selectedName ? "selected" : ""}>${escHTML(r.name)} (${Math.round(r.xpPerHour).toLocaleString()} XP/h)</option>`).join("")}
            </select>
            ${selected ? `<div class="bumpkin-recipe-stats">
              XP per cook: <span style="color:var(--green)">${fmtXP(selected.xp)}</span><br>
              Cook time: <span style="color:var(--blue)">${formatCookTime(selected.time)}</span><br>
              XP/hour: <span style="color:var(--sunpetal)">${fmtXP(selected.xpPerHour)}</span><br>
              XP/day${count > 1 ? " (×" + count + ")" : ""}: <span style="color:var(--green)">${fmtXP(xpPerDay)}</span><br>
              ${xpRemaining > 0 ? `Solo days to ${targetLevel}: <span style="color:var(--text-dim)">${daysNeeded.toLocaleString()}d</span>` : ""}
            </div>` : `<div style="font-size: 0.625rem;color:var(--text-dim)">${recipes.length > 0 ? "Not cooking" : "No recipes available"}</div>`}
          </div>`;
        }

        html += `</div>`;

        // Summary
        const totalDays = totalXPPerDay > 0 && xpAfterFood > 0 ? Math.ceil(xpAfterFood / totalXPPerDay) : 0;

        html += `<div class="bumpkin-summary pixel-panel pixel-font">
          <div style="font-size: 0.6875rem;color:var(--text-secondary);margin-bottom:4px">ALL BUILDINGS COMBINED</div>
          <div style="font-size: 0.8125rem;color:var(--sunpetal);margin-bottom:8px">${Math.round(totalXPPerDay).toLocaleString()} XP / day</div>
          ${xpAfterFood > 0 ? `
            <div class="bumpkin-days-big">${totalDays.toLocaleString()} days</div>
            <div style="font-size: 0.625rem;color:var(--text-dim)">to reach level ${targetLevel}${bankedXP > 0 ? " (after eating food)" : ""}</div>
          ` : `<div class="bumpkin-days-big" style="color:var(--green)">${currentLevel >= targetLevel ? "TARGET REACHED!" : "Food covers it!"}</div>`}
          ${buildingStats.length > 1 ? `<div style="margin-top:12px;font-size: 0.5625rem;color:var(--text-dim);line-height:2">
            ${buildingStats.map(b => `${COOKING_BUILDING_EMOJI[b.buildingName] || ""} ${escHTML(b.buildingName)}${b.count > 1 ? " ×" + b.count : ""}: ${Math.round(b.xpPerDay).toLocaleString()} XP/day`).join("<br>")}
          </div>` : ""}
        </div>`;
      }

      // Footer
      html += `<div class="footer">
        <button class="refresh-btn" onclick="refresh()">REFRESH</button>
        <div class="timestamp pixel-font">Updated: ${new Date().toLocaleTimeString("cs-CZ")}</div>
      </div>`;

      app.innerHTML = html;
    }

    // ═══════════════════════════════════════
    //  TREASURY
    // ═══════════════════════════════════════

    const TREASURY_CAT_COLORS = {
      resources: "#2ECC71",
      treasures: "#F1C40F",
      collectibles: "#E67E22",
      wearables: "#9B59B6",
      liquid: "#3498DB",
    };

    // Treasure sell prices in COINS (base, no boosts)
    const TREASURE_SELL_PRICES = {
      "Crab": 18, "Camel Bone": 12, "Sea Cucumber": 27, "Vase": 60,
      "Starfish": 135, "Sand": 12, "Old Bottle": 27, "Seaweed": 90,
      "Cockle Shell": 120, "Clam Shell": 450, "Iron Compass": 225,
      "Pipi": 225, "Pearl": 4500, "Wooden Compass": 157.5,
      "Hieroglyph": 300, "Coral": 1800, "Broken Pillar": 240,
      "Coprolite": 240, "Pirate Bounty": 9000,
    };

    // Betty sell prices in COINS (from game source crops.ts / fruits.ts)
    const BETTY_SELL_PRICES = {
      "Sunflower": 0.02, "Potato": 0.14, "Rhubarb": 0.24, "Pumpkin": 0.4,
      "Zucchini": 0.4, "Carrot": 0.8, "Yam": 0.8, "Cabbage": 1.5,
      "Broccoli": 1.5, "Soybean": 2.3, "Beetroot": 2.8, "Pepper": 3,
      "Cauliflower": 4.25, "Parsnip": 6.5, "Eggplant": 8, "Corn": 9,
      "Onion": 10, "Radish": 9.5, "Wheat": 7, "Turnip": 8,
      "Kale": 10, "Artichoke": 12, "Barley": 12,
      "Tomato": 2, "Lemon": 6, "Blueberry": 12, "Orange": 18,
      "Apple": 25, "Banana": 25, "Celestine": 200, "Lunara": 500,
      "Duskberry": 1000, "Grape": 240, "Rice": 320, "Olive": 400,
    };

    function computeBettyRate(p2pPrices) {
      let bestRate = 0, bestItem = "";
      for (const [name, sellCoins] of Object.entries(BETTY_SELL_PRICES)) {
        const p2p = p2pPrices[name];
        if (!p2p || p2p <= 0) continue;
        const rate = sellCoins / p2p;
        if (rate > bestRate) { bestRate = rate; bestItem = name; }
      }
      return { rate: bestRate, item: bestItem };
    }

    const SFL_ICON_URL = "https://raw.githubusercontent.com/sunflower-land/sunflower-land/main/src/assets/icons/flower_token.webp";
    function sflIcon(size) {
      return `<img src="${SFL_ICON_URL}" class="sfl-icon" alt="SFL"${size ? ` style="height:${size}"` : ""}>`;
    }
    const ITEM_ICON_BASE = "https://sfl.world/img/source/";
    const GITHUB_ASSETS = "https://raw.githubusercontent.com/sunflower-land/sunflower-land/main/src/assets";
    let ITEM_IMAGE_MAP = {};
    // Lazy-loaded from data/image-map.json (was 1142 inline entries)
    async function loadImageMap() {
      try {
        const resp = await fetch('./data/image-map.json');
        const map = await resp.json();
        // Expand relative paths to full GitHub URLs
        for (const [k, v] of Object.entries(map)) {
          ITEM_IMAGE_MAP[k] = GITHUB_ASSETS + v;
        }
        console.log('[ImageMap] Loaded', Object.keys(ITEM_IMAGE_MAP).length, 'entries');
      } catch (e) {
        console.warn('[ImageMap] Failed to load, using fallback', e);
      }
    }
    function getItemIcon(name) {
      return ITEM_IMAGE_MAP[name] || (ITEM_ICON_BASE + encodeURIComponent(name) + ".png");
    }
    function formatSFL(v) {
      if (v >= 1e6) return (v / 1e6).toFixed(2) + "M";
      if (v >= 1e4) return Math.round(v).toLocaleString();
      if (v >= 100) return v.toFixed(1);
      if (v >= 1) return v.toFixed(2);
      return v.toFixed(4);
    }
    function formatUSD(v) {
      return "$" + v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    function formatBTC(v) {
      if (v >= 0.01) return "₿" + v.toFixed(4);
      return "₿" + v.toFixed(8);
    }

    async function fetchTreasuryData() {
      const proxyFetch = async (url) => {
        try {
          const resp = await fetch(`/api/proxy?url=${encodeURIComponent(url)}`);
          if (resp.ok) return resp.json();
        } catch {}
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`Fetch ${url} failed: ${resp.status}`);
        return resp.json();
      };

      const [nftData, priceData, exchangeData, btcData] = await Promise.all([
        proxyFetch("https://sfl.world/api/v1/nfts"),
        proxyFetch("https://sfl.world/api/v1/prices"),
        proxyFetch("https://sfl.world/api/v1.1/exchange"),
        proxyFetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd"),
      ]);

      const nftCollectibles = {};
      for (const c of (nftData.collectibles || [])) {
        nftCollectibles[c.name] = c;
      }
      const nftWearables = {};
      for (const w of (nftData.wearables || [])) {
        nftWearables[w.name] = w;
      }

      const p2pPrices = priceData?.data?.p2p || {};
      const sflUsd = exchangeData?.sfl?.usd || 0;
      const btcUsd = btcData?.bitcoin?.usd || 0;

      // Coins: API rate (best tier) + Betty rate (best crop to sell)
      const coinTiers = Object.values(exchangeData?.coins || {});
      const bestCoinTier = coinTiers.reduce((best, t) => (!best || (t.coin / t.sfl) > (best.coin / best.sfl)) ? t : best, null);
      const coinsPerSFL_api = bestCoinTier ? (bestCoinTier.coin / bestCoinTier.sfl) : 320;
      const betty = computeBettyRate(p2pPrices);
      const coinsPerSFL_betty = betty.rate;

      // Gems: best-value tier with -30% pack discount applied
      const gemTiers = Object.values(exchangeData?.gems || {});
      const bestGemTier = gemTiers.reduce((best, t) => (!best || (t.gem / t.sfl) > (best.gem / best.sfl)) ? t : best, null);
      const gemsPerSFL = bestGemTier ? (bestGemTier.gem / (bestGemTier.sfl * 0.7)) : 0;

      return { nftCollectibles, nftWearables, p2pPrices, sflUsd, coinsPerSFL_api, coinsPerSFL_betty, bettyItem: betty.item, gemsPerSFL, btcUsd };
    }

    function computeFarmValue(farm, td, coinMode) {
      const { nftCollectibles, nftWearables, p2pPrices, sflUsd, coinsPerSFL_api, coinsPerSFL_betty, bettyItem, gemsPerSFL, btcUsd } = td;
      const coinsPerSFL = coinMode === "api" ? coinsPerSFL_api : coinMode === "betty" ? coinsPerSFL_betty : 0;
      const inventory = farm.inventory || {};
      const wardrobe = farm.wardrobe || {};
      const MIN_VALUE = 0.01;

      // Debug: log farm keys to help find gems path
      console.log("[Treasury] farm keys:", Object.keys(farm));
      console.log("[Treasury] farm.gems:", farm.gems, "| farm.bank:", farm.bank, "| inventory Gem:", inventory["Gem"]);

      // --- Resources: inventory items with P2P prices ---
      const resources = [];
      for (const [name, price] of Object.entries(p2pPrices)) {
        const qty = getCount(inventory, name);
        if (qty <= 0) continue;
        const total = qty * price;
        if (total < MIN_VALUE) continue;
        resources.push({ name, qty, unitPrice: price, total });
      }
      resources.sort((a, b) => b.total - a.total);

      // --- Treasures: inventory items with coin sell prices ---
      const treasures = [];
      // Detect treasure sell boosts
      let treasureBoost = 1;
      if (findCollectible(farm, "Treasure Map").length > 0) treasureBoost += 0.2;
      // Camel: check inventory (might not be placed)
      if (getCount(inventory, "Camel") > 0 || findCollectible(farm, "Camel").length > 0) treasureBoost += 0.3;

      for (const [name, baseCoins] of Object.entries(TREASURE_SELL_PRICES)) {
        const qty = getCount(inventory, name);
        if (qty <= 0) continue;
        const boostedCoins = baseCoins * treasureBoost;
        const sflValue = coinsPerSFL > 0 ? boostedCoins / coinsPerSFL : 0;
        const total = qty * sflValue;
        if (total < MIN_VALUE) continue;
        treasures.push({ name, qty, unitPrice: sflValue, unitCoins: boostedCoins, total });
      }
      treasures.sort((a, b) => b.total - a.total);

      // --- Collectibles: inventory NFT collectibles (inventory includes placed) ---
      const collectibles = [];
      const countedCollectibles = new Set();

      for (const name of Object.keys(nftCollectibles)) {
        const nft = nftCollectibles[name];
        const floor = parseFloat(nft.floor) || 0;
        if (floor <= 0) continue;

        const qty = getCount(inventory, name);
        if (qty <= 0) continue;
        const total = qty * floor;
        if (total < MIN_VALUE) continue;
        collectibles.push({ name, qty, unitPrice: floor, total });
        countedCollectibles.add(name);
      }
      collectibles.sort((a, b) => b.total - a.total);

      // --- Wearables: wardrobe matched against NFT wearables ---
      const wearables = [];
      for (const [name, qty] of Object.entries(wardrobe)) {
        if (!qty || qty <= 0) continue;
        const nft = nftWearables[name];
        if (!nft) continue;
        const price = parseFloat(nft.lastSalePrice) || parseFloat(nft.floor) || 0;
        if (price <= 0) continue;
        const total = qty * price;
        if (total < MIN_VALUE) continue;
        wearables.push({ name, qty, unitPrice: price, total });
      }
      wearables.sort((a, b) => b.total - a.total);

      // --- Liquid: SFL balance + coins + gems ---
      const sflBalance = parseFloat(farm.balance) || 0;
      const coinBalance = parseFloat(farm.coins) || 0;
      // Try multiple paths for gems
      const gemBalance = parseFloat(farm.gems) || parseFloat(farm.bank?.gems) || getCount(inventory, "Gem") || 0;
      const coinsAsSFL = coinsPerSFL > 0 ? coinBalance / coinsPerSFL : 0;
      const gemsAsSFL = gemsPerSFL > 0 ? gemBalance / gemsPerSFL : 0;
      const liquidTotal = sflBalance + coinsAsSFL + gemsAsSFL;

      const resourcesTotal = resources.reduce((s, r) => s + r.total, 0);
      const treasuresTotal = treasures.reduce((s, t) => s + t.total, 0);
      const collectiblesTotal = collectibles.reduce((s, c) => s + c.total, 0);
      const wearablesTotal = wearables.reduce((s, w) => s + w.total, 0);
      const grandTotal = resourcesTotal + treasuresTotal + collectiblesTotal + wearablesTotal + liquidTotal;

      return {
        resources, treasures, collectibles, wearables,
        liquid: { sflBalance, coinBalance, gemBalance, coinsAsSFL, gemsAsSFL, total: liquidTotal },
        treasureBoost,
        totals: {
          resources: resourcesTotal,
          treasures: treasuresTotal,
          collectibles: collectiblesTotal,
          wearables: wearablesTotal,
          liquid: liquidTotal,
          grand: grandTotal,
        },
        rates: { sflUsd, btcUsd, coinsPerSFL, coinsPerSFL_api, coinsPerSFL_betty, bettyItem },
      };
    }

    let treasuryDetailOpen = {};
    let treasuryCoinMode = localStorage.getItem("sfl_coin_mode") || "betty";
    let cachedTreasuryData = null;

    function setCoinMode(mode) {
      treasuryCoinMode = mode;
      localStorage.setItem("sfl_coin_mode", mode);
      if (cachedTreasuryData && cachedFarmData) {
        renderTreasuryWithData(cachedFarmData, cachedTreasuryData);
      }
    }

    function toggleTreasuryDetail(cat) {
      treasuryDetailOpen[cat] = !treasuryDetailOpen[cat];
      const grid = document.getElementById("treasury-detail-" + cat);
      const arrow = document.getElementById("treasury-arrow-" + cat);
      if (grid) grid.style.display = treasuryDetailOpen[cat] ? "block" : "none";
      if (arrow) arrow.textContent = treasuryDetailOpen[cat] ? "▼" : "▶";
    }

    function renderPieChart(totals) {
      const cats = [
        { key: "resources", label: "Resources", color: TREASURY_CAT_COLORS.resources },
        { key: "treasures", label: "Treasures", color: TREASURY_CAT_COLORS.treasures },
        { key: "collectibles", label: "Collectibles", color: TREASURY_CAT_COLORS.collectibles },
        { key: "wearables", label: "Wearables", color: TREASURY_CAT_COLORS.wearables },
        { key: "liquid", label: "Liquid", color: TREASURY_CAT_COLORS.liquid },
      ];
      const grand = totals.grand || 1;
      let gradParts = [];
      let cumPct = 0;
      for (const c of cats) {
        const pct = (totals[c.key] / grand) * 100;
        if (pct < 0.1) continue;
        gradParts.push(`${c.color} ${cumPct}% ${cumPct + pct}%`);
        cumPct += pct;
      }
      if (gradParts.length === 0) gradParts.push("#333 0% 100%");
      const gradient = `conic-gradient(${gradParts.join(", ")})`;

      let legendHTML = "";
      for (const c of cats) {
        const pct = ((totals[c.key] / grand) * 100).toFixed(1);
        legendHTML += `<div><span class="treasury-pie-swatch" style="background:${c.color}"></span>${c.label}: ${pct}%</div>`;
      }

      return `<div class="treasury-pie-wrap pixel-panel">
        <div class="treasury-pie" style="background:${gradient}"></div>
        <div class="treasury-pie-legend pixel-font">${legendHTML}</div>
      </div>`;
    }

    function renderTreasuryItemRows(items) {
      if (items.length === 0) return '<div style="padding:12px;text-align:center;font-size: 0.625rem;color:var(--text-dim)">No items found</div>';
      return items.map(item => {
        const imgUrl = getItemIcon(item.name);
        return `<div class="treasury-item-row">
          <img class="treasury-item-img" src="${imgUrl}" onerror="this.style.display='none'" alt="">
          <div class="treasury-item-name" title="${escHTML(item.name)}">${escHTML(item.name)}</div>
          <div class="treasury-item-qty">×${item.qty}</div>
          <div class="treasury-item-unit">${formatSFL(item.unitPrice)}</div>
          <div class="treasury-item-total">${formatSFL(item.total)}</div>
        </div>`;
      }).join("");
    }

    function renderCategoryCard(key, icon, label, total, grandTotal, items) {
      const pct = grandTotal > 0 ? ((total / grandTotal) * 100) : 0;
      const color = TREASURY_CAT_COLORS[key];
      const top5 = items.slice(0, 5);
      let topHTML = "";
      for (const item of top5) {
        const imgUrl = getItemIcon(item.name);
        topHTML += `<div class="treasury-cat-top-item">
          <img src="${imgUrl}" onerror="this.style.display='none'" alt="" style="width:16px;height:16px;object-fit:contain;image-rendering:pixelated">
          <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHTML(item.name)}</span>
          <span style="color:var(--sunpetal)">${formatSFL(item.total)}</span>
        </div>`;
      }
      return `<div class="treasury-cat-card pixel-panel" onclick="toggleTreasuryDetail('${key}')">
        <div class="treasury-cat-header">
          <span class="treasury-cat-icon">${icon}</span>
          <span class="treasury-cat-name pixel-font">${label}</span>
        </div>
        <div class="treasury-cat-value pixel-font">${formatSFL(total)} ${sflIcon()}</div>
        <div class="treasury-cat-pct pixel-font">${pct.toFixed(1)}%</div>
        <div class="treasury-cat-bar"><div class="treasury-cat-bar-fill" style="width:${pct.toFixed(1)}%;background:${color}"></div></div>
        <div class="treasury-cat-top">${topHTML}</div>
      </div>`;
    }

    function renderTreasuryWithData(data, td) {
      const app = document.getElementById("app");
      const farm = data.farm;
      const val = computeFarmValue(farm, td, treasuryCoinMode);
      const { totals, rates, resources, treasures, collectibles, wearables, liquid, treasureBoost } = val;

      const usdTotal = totals.grand * rates.sflUsd;
      const btcTotal = rates.btcUsd > 0 ? usdTotal / rates.btcUsd : 0;

      const coinModeLabel = treasuryCoinMode === "betty"
        ? `Betty (${escHTML(rates.bettyItem)}: ${Math.round(rates.coinsPerSFL_betty)}/${sflIcon()})`
        : treasuryCoinMode === "api"
          ? `Exchange API (${Math.round(rates.coinsPerSFL_api)}/${sflIcon()})`
          : "0 (no value)";

      let html = `<div class="bumpkin-dev-banner pixel-panel pixel-font">⚠ UNDER DEVELOPMENT — might show incorrect data</div>
      <div class="treasury-header pixel-panel pixel-font">
        <h1>TREASURY</h1>
        <div class="farm-id">Farm #${escHTML(FARM_ID)}</div>
        <div class="treasury-total">
          ${sflIcon('1.5em')}
          ${formatSFL(totals.grand)} ${sflIcon()}
        </div>
        <div class="treasury-secondary">${formatUSD(usdTotal)} &nbsp;|&nbsp; ${formatBTC(btcTotal)}</div>
        <div class="treasury-rates">1 ${sflIcon()} = ${rates.sflUsd.toFixed(4)} USD &nbsp;|&nbsp; 1 BTC = ${formatUSD(rates.btcUsd)}</div>
        <div style="margin-top:8px;font-size: 0.5625rem">
          <span style="color:var(--text-dim)">Coin rate:</span>
          <select onchange="setCoinMode(this.value)" style="font-family:'Courier New',monospace;font-size: 0.5625rem;background:#111;color:var(--text-primary);border:2px solid var(--border-brown);padding:2px 4px">
            <option value="betty" ${treasuryCoinMode === "betty" ? "selected" : ""}>Betty (${escHTML(rates.bettyItem)} ${Math.round(rates.coinsPerSFL_betty)}/SFL)</option>
            <option value="api" ${treasuryCoinMode === "api" ? "selected" : ""}>Exchange API (${Math.round(rates.coinsPerSFL_api)}/SFL)</option>
            <option value="zero" ${treasuryCoinMode === "zero" ? "selected" : ""}>0 (no real value)</option>
          </select>
        </div>
      </div>`;

      // Pie chart
      html += renderPieChart(totals);

      // Category cards
      html += '<div class="treasury-categories">';
      html += renderCategoryCard("resources", "⛏️", "RESOURCES", totals.resources, totals.grand, resources);
      html += renderCategoryCard("treasures", "🏴‍☠️", "TREASURES", totals.treasures, totals.grand, treasures);
      html += renderCategoryCard("collectibles", "🏆", "COLLECTIBLES", totals.collectibles, totals.grand, collectibles);
      html += renderCategoryCard("wearables", "👕", "WEARABLES", totals.wearables, totals.grand, wearables);

      // Liquid card
      const liqPct = totals.grand > 0 ? ((totals.liquid / totals.grand) * 100) : 0;
      html += `<div class="treasury-cat-card pixel-panel">
        <div class="treasury-cat-header">
          <span class="treasury-cat-icon">💧</span>
          <span class="treasury-cat-name pixel-font">LIQUID</span>
        </div>
        <div class="treasury-cat-value pixel-font">${formatSFL(totals.liquid)} ${sflIcon()}</div>
        <div class="treasury-cat-pct pixel-font">${liqPct.toFixed(1)}%</div>
        <div class="treasury-cat-bar"><div class="treasury-cat-bar-fill" style="width:${liqPct.toFixed(1)}%;background:${TREASURY_CAT_COLORS.liquid}"></div></div>
        <div class="treasury-cat-top" style="line-height:2.2">
          <div>${sflIcon()} Balance: <span style="color:var(--sunpetal)">${formatSFL(liquid.sflBalance)}</span></div>
          <div>Coins: <span style="color:var(--text-secondary)">${Math.floor(liquid.coinBalance).toLocaleString()}</span> <span style="color:var(--text-dim)">(≈ ${formatSFL(liquid.coinsAsSFL)} ${sflIcon()})</span></div>
          <div>Gems: <span style="color:var(--text-secondary)">${Math.floor(liquid.gemBalance).toLocaleString()}</span> <span style="color:var(--text-dim)">(≈ ${formatSFL(liquid.gemsAsSFL)} ${sflIcon()})</span></div>
        </div>
      </div>`;
      html += '</div>';

      // Detail sections
      const boostLabel = treasureBoost > 1 ? ` (×${treasureBoost.toFixed(1)} boost)` : "";
      const sections = [
        { key: "resources", icon: "⛏️", label: "Resources", items: resources },
        { key: "treasures", icon: "🏴‍☠️", label: `Treasures${boostLabel}`, items: treasures },
        { key: "collectibles", icon: "🏆", label: "Collectibles", items: collectibles },
        { key: "wearables", icon: "👕", label: "Wearables", items: wearables },
      ];
      for (const sec of sections) {
        const isOpen = treasuryDetailOpen[sec.key];
        html += `<div class="treasury-detail-section">
          <div class="treasury-detail-header pixel-panel pixel-font" onclick="toggleTreasuryDetail('${sec.key}')">
            <span>${sec.icon}</span>
            <h3>${sec.label} (${sec.items.length})</h3>
            <span class="treasury-detail-arrow" id="treasury-arrow-${sec.key}">${isOpen ? "▼" : "▶"}</span>
          </div>
          <div class="treasury-detail-grid" id="treasury-detail-${sec.key}" style="display:${isOpen ? "block" : "none"}">
            ${renderTreasuryItemRows(sec.items)}
          </div>
        </div>`;
      }

      app.innerHTML = html;
    }

    async function renderTreasury(data) {
      const app = document.getElementById("app");

      app.innerHTML = `<div class="bumpkin-dev-banner pixel-panel pixel-font">⚠ UNDER DEVELOPMENT — might show incorrect data</div>
      <div class="header pixel-panel pixel-font">
        <h1>TREASURY</h1>
        <div class="farm-id">Farm #${escHTML(FARM_ID)}</div>
      </div>
      <div class="loading-screen pixel-font" style="min-height:30vh">
        <div class="loading-flower">💰</div>
        <div class="loading-text">Fetching market data...</div>
      </div>`;

      try {
        cachedTreasuryData = await fetchTreasuryData();
        renderTreasuryWithData(data, cachedTreasuryData);
      } catch (err) {
        console.error("Treasury error:", err);
        app.innerHTML = `<div class="header pixel-panel pixel-font">
          <h1>TREASURY</h1>
          <div class="farm-id">Farm #${escHTML(FARM_ID)}</div>
        </div>
        <div class="error-screen pixel-panel pixel-font">
          <div class="icon">⚠️</div>
          <h2>Failed to load market data</h2>
          <p>${escHTML(err.message)}</p>
          <button class="refresh-btn" onclick="refresh()">RETRY</button>
        </div>`;
      }
    }

    // ═══════════════════════════════════════
    //  RENDER: SALES
    // ═══════════════════════════════════════

    async function fetchMarketPrices() {
      const proxyFetch = async (url) => {
        try {
          const resp = await fetch(`/api/proxy?url=${encodeURIComponent(url)}`);
          if (resp.ok) return resp.json();
        } catch {}
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`Fetch failed: ${resp.status}`);
        return resp.json();
      };

      const [nftData, priceData] = await Promise.all([
        proxyFetch("https://sfl.world/api/v1/nfts"),
        proxyFetch("https://sfl.world/api/v1/prices"),
      ]);

      const nfts = {};
      for (const c of (nftData.collectibles || [])) {
        if (c.name) nfts[c.name] = { floor: parseFloat(c.floor) || 0, lastSale: parseFloat(c.lastSalePrice) || 0, type: "collectible" };
      }
      for (const w of (nftData.wearables || [])) {
        if (w.name) nfts[w.name] = { floor: parseFloat(w.floor) || 0, lastSale: parseFloat(w.lastSalePrice) || 0, type: "wearable" };
      }

      const p2p = priceData?.data?.p2p || {};
      return { nfts, p2p };
    }

    function formatAge(ms) {
      const h = Math.floor(ms / 3600000);
      if (h < 24) return `${h}h`;
      const d = Math.floor(h / 24);
      if (d < 7) return `${d}d`;
      const w = Math.floor(d / 7);
      return `${w}w`;
    }

    // ── Price History fetch helpers ──

    async function fetchP2PLatest() {
      const resp = await fetch("/api/price-history?latest=1");
      if (!resp.ok) throw new Error("P2P prices fetch failed");
      const data = await resp.json();
      return data.prices || [];
    }

    async function fetchP2PHistory(itemName) {
      const from = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
      const resp = await fetch(`/api/price-history?item=${encodeURIComponent(itemName)}&from=${from}`);
      if (!resp.ok) throw new Error("P2P history fetch failed");
      const data = await resp.json();
      return data.changes || [];
    }

    async function fetchNftLatest(collection) {
      const resp = await fetch(`/api/nft-history?latest=1&collection=${encodeURIComponent(collection)}`);
      if (!resp.ok) throw new Error("NFT fetch failed");
      const data = await resp.json();
      return data.values || [];
    }

    async function fetchNftItemHistory(nftId, field) {
      const resp = await fetch(`/api/nft-history?nft_id=${nftId}&field=${encodeURIComponent(field || "floor")}`);
      if (!resp.ok) throw new Error("NFT history fetch failed");
      const data = await resp.json();
      return data.changes || [];
    }

    // ── Shared price timeline bar chart ──

    let _chartCounter = 0;
    function renderPriceTimeline(changes, label) {
      if (!changes || changes.length === 0) {
        return `<div class="ph-empty">Tracking started recently — no history yet</div>`;
      }
      const chartId = `lw-chart-${++_chartCounter}`;
      // Schedule chart creation after DOM insert
      setTimeout(() => _createLWChart(chartId, changes, label), 0);
      return `<div class="ph-detail-title">${escHTML(label)} — last ${changes.length} changes</div>
        <div id="${chartId}" style="height:220px;width:100%;border-radius:4px;overflow:hidden"></div>`;
    }

    function _createLWChart(containerId, changes, label) {
      const container = document.getElementById(containerId);
      if (!container || typeof LightweightCharts === "undefined") return;

      const sorted = [...changes].sort((a, b) => new Date(a.captured_at) - new Date(b.captured_at));
      const data = sorted.map(c => {
        const d = new Date(c.captured_at);
        return {
          time: Math.floor(d.getTime() / 1000),
          value: c.price ?? c.value ?? 0,
        };
      });

      // Detect if first value > last (price dropped) for color
      const first = data.length > 0 ? data[0].value : 0;
      const last = data.length > 0 ? data[data.length - 1].value : 0;
      const trendColor = last >= first ? "#22c55e" : "#ef4444";

      const chart = LightweightCharts.createChart(container, {
        height: 220,
        layout: {
          background: { color: "transparent" },
          textColor: "#9ca3af",
          fontFamily: "'Press Start 2P', monospace",
          fontSize: 9,
        },
        grid: {
          vertLines: { color: "rgba(92,58,30,0.15)" },
          horzLines: { color: "rgba(92,58,30,0.15)" },
        },
        crosshair: {
          mode: 0,
          vertLine: { color: "rgba(255,215,0,0.3)", width: 1, style: 2 },
          horzLine: { color: "rgba(255,215,0,0.3)", width: 1, style: 2 },
        },
        rightPriceScale: {
          borderColor: "rgba(92,58,30,0.3)",
        },
        timeScale: {
          borderColor: "rgba(92,58,30,0.3)",
          timeVisible: true,
          secondsVisible: false,
        },
        handleScroll: { mouseWheel: true, pressedMouseMove: true },
        handleScale: { mouseWheel: true, pinch: true },
      });

      const areaSeries = chart.addAreaSeries({
        topColor: trendColor + "40",
        bottomColor: trendColor + "08",
        lineColor: trendColor,
        lineWidth: 2,
        crosshairMarkerVisible: true,
        crosshairMarkerRadius: 4,
        priceFormat: { type: "price", precision: 4, minMove: 0.0001 },
      });

      areaSeries.setData(data);
      chart.timeScale().fitContent();

      // Resize observer
      const ro = new ResizeObserver(() => {
        chart.applyOptions({ width: container.clientWidth });
      });
      ro.observe(container);
    }

    // ── P2P History toggle detail ──

    async function toggleP2PDetail(el, itemName) {
      const row = el.closest(".ph-row");
      if (row.nextElementSibling && row.nextElementSibling.classList.contains("ph-detail")) {
        row.nextElementSibling.remove();
        return;
      }
      row.closest(".sales-section-body")?.querySelectorAll(".ph-detail").forEach(d => d.remove());
      const detail = document.createElement("div");
      detail.className = "ph-detail";
      detail.innerHTML = `<div class="ph-empty">Loading history...</div>`;
      row.after(detail);
      try {
        const changes = await fetchP2PHistory(itemName);
        detail.innerHTML = renderPriceTimeline(changes, itemName);
      } catch (e) {
        detail.innerHTML = `<div class="ph-empty">Failed to load history</div>`;
      }
    }

    // ── NFT History toggle detail ──

    async function toggleNftDetail(el, nftId, nftName) {
      const row = el.closest(".ph-row");
      if (row.nextElementSibling && row.nextElementSibling.classList.contains("ph-detail")) {
        row.nextElementSibling.remove();
        return;
      }
      row.closest(".sales-section-body")?.querySelectorAll(".ph-detail").forEach(d => d.remove());
      const detail = document.createElement("div");
      detail.className = "ph-detail";
      detail.innerHTML = `<div class="ph-empty">Loading history...</div>`;
      row.after(detail);
      try {
        const changes = await fetchNftItemHistory(nftId, "floor");
        detail.innerHTML = renderPriceTimeline(changes, nftName + " (floor)");
      } catch (e) {
        detail.innerHTML = `<div class="ph-empty">Failed to load history</div>`;
      }
    }

    // ── Filter helper ──

    function filterPHRows(input, containerId) {
      const q = input.value.toLowerCase();
      const rows = document.querySelectorAll(`#${containerId} .ph-row`);
      rows.forEach(r => {
        const name = r.dataset.name || "";
        r.style.display = name.toLowerCase().includes(q) ? "" : "none";
      });
    }

    // ── NFT tab switch ──

    const _nftCache = {};
    let _nftShowCount = {};

    async function switchNftTab(collection) {
      const tabBtns = document.querySelectorAll("#nft-history-tabs .ph-tab");
      tabBtns.forEach(b => b.classList.toggle("active", b.dataset.col === collection));
      const body = document.getElementById("nft-history-body");
      body.innerHTML = `<div class="ph-empty">Loading ${collection}...</div>`;

      try {
        if (!_nftCache[collection]) {
          const rows = await fetchNftLatest(collection);
          const map = {};
          for (const r of rows) {
            if (!map[r.nft_id]) map[r.nft_id] = { nft_id: r.nft_id, name: r.nft_name, collection: r.collection };
            map[r.nft_id][r.field] = r.value;
          }
          _nftCache[collection] = Object.values(map).sort((a, b) => (b.floor || 0) - (a.floor || 0));
        }
        _nftShowCount[collection] = 50;
        renderNftItems(collection);
      } catch (e) {
        body.innerHTML = `<div class="ph-empty">Failed to load ${collection}: ${escHTML(e.message)}</div>`;
      }
    }

    function renderNftItems(collection) {
      const items = _nftCache[collection] || [];
      const body = document.getElementById("nft-history-body");
      const searchVal = document.getElementById("nft-history-search")?.value?.toLowerCase() || "";
      const filtered = searchVal ? items.filter(i => (i.name || "").toLowerCase().includes(searchVal)) : items;
      const limit = _nftShowCount[collection] || 50;
      const visible = filtered.slice(0, limit);

      if (visible.length === 0) {
        body.innerHTML = `<div class="ph-empty">${searchVal ? "No matches" : "No NFT data yet"}</div>`;
        return;
      }

      let html = "";
      for (const item of visible) {
        const imgUrl = getItemIcon(item.name || "");
        const floor = item.floor || 0;
        const lastSale = item.lastSalePrice || 0;
        const supply = item.supply;
        const safeName = (item.name || "").replace(/'/g, "\\'");
        html += `<div class="ph-row" data-name="${escHTML(item.name || "")}" onclick="toggleNftDetail(this,${item.nft_id},'${safeName}')">
          <img class="ph-row-img" src="${imgUrl}" onerror="this.style.display='none'" alt="">
          <div>
            <div class="ph-row-name">${escHTML(item.name || '#' + item.nft_id)}</div>
            <div class="ph-row-sub">Floor: ${formatSFL(floor)} ${sflIcon()}${lastSale > 0 ? ' \u00b7 Last: ' + formatSFL(lastSale) : ""}</div>
          </div>
          <div style="text-align:right">
            <div style="color:var(--sunpetal);font-weight:bold">${formatSFL(floor)} ${sflIcon()}</div>
            ${supply != null ? '<span class="ph-supply">' + Math.round(supply) + ' supply</span>' : ""}
          </div>
        </div>`;
      }
      if (filtered.length > limit) {
        html += `<button class="ph-load-more" onclick="_nftShowCount['${collection}']+=50;renderNftItems('${collection}')">LOAD MORE (${filtered.length - limit} remaining)</button>`;
      }
      body.innerHTML = html;
    }

    // ── Render P2P history section ──

    function renderP2PHistorySection(prices) {
      const sorted = [...prices].sort((a, b) => (b.price || 0) - (a.price || 0));
      let rowsHTML = "";
      for (const p of sorted) {
        const imgUrl = getItemIcon(p.item_name);
        const price = parseFloat(p.price) || 0;
        const safeName = p.item_name.replace(/'/g, "\\'");
        rowsHTML += `<div class="ph-row" data-name="${escHTML(p.item_name)}" onclick="toggleP2PDetail(this,'${safeName}')">
          <img class="ph-row-img" src="${imgUrl}" onerror="this.style.display='none'" alt="">
          <div>
            <div class="ph-row-name">${escHTML(p.item_name)}</div>
          </div>
          <div style="text-align:right">
            <div style="color:var(--sunpetal);font-weight:bold">${formatSFL(price)} ${sflIcon()}</div>
          </div>
        </div>`;
      }

      return `<div style="margin-bottom:16px">
        <div class="sales-section-header pixel-font" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'block':'none'">
          <h3>\ud83d\udcc8 P2P PRICE TRACKER</h3>
          <span class="sales-section-count">${sorted.length} items</span>
        </div>
        <div class="sales-section-body" style="display:none" id="p2p-history-section">
          <input class="ph-search" type="text" placeholder="Search items..." oninput="filterPHRows(this,'p2p-history-section')">
          ${rowsHTML || '<div class="ph-empty">Tracking started recently \u2014 no prices yet</div>'}
        </div>
      </div>`;
    }

    // ── Render NFT history section (lazy) ──

    function renderNftHistorySection() {
      return `<div style="margin-bottom:16px">
        <div class="sales-section-header pixel-font" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'block':'none'; if(this.nextElementSibling.style.display!=='none' && !this.dataset.loaded){this.dataset.loaded='1';switchNftTab('collectibles')}">
          <h3>\ud83c\udfa8 NFT PRICE TRACKER</h3>
          <span class="sales-section-count">click to load</span>
        </div>
        <div class="sales-section-body" style="display:none">
          <div class="ph-tabs" id="nft-history-tabs">
            <button class="ph-tab active" data-col="collectibles" onclick="switchNftTab('collectibles')">COLLECTIBLES</button>
            <button class="ph-tab" data-col="wearables" onclick="switchNftTab('wearables')">WEARABLES</button>
          </div>
          <input class="ph-search" type="text" id="nft-history-search" placeholder="Search NFTs..." oninput="renderNftItems(document.querySelector('#nft-history-tabs .ph-tab.active')?.dataset.col||'collectibles')">
          <div id="nft-history-body">
            <div class="ph-empty">Expand to load NFT price data</div>
          </div>
        </div>
      </div>`;
    }

    async function renderSales(data) {
      const app = document.getElementById("app");
      const { trades } = data;
      const listings = trades.listings || {};
      const offers = trades.offers || {};

      let html = `<div class="header pixel-panel pixel-font">
        <h1>SALES TRACKER</h1>
        <div class="farm-id">Farm #${escHTML(FARM_ID)}</div>
      </div>`;

      html += `<div class="under-dev-banner pixel-font" style="background:linear-gradient(180deg,#3b1768,#2a1050);padding:8px 12px;border:3px solid #000;margin-bottom:16px;text-align:center;font-size: 0.5625rem;color:var(--lily)">
        ⚠️ UNDER DEVELOPMENT ⚠️
      </div>`;

      // Show loading while fetching market data
      html += `<div id="sales-content"><div class="loading-screen pixel-font" style="padding:20px"><div class="loading-text">Loading market prices...</div></div></div>`;
      app.innerHTML = html;

      // Fetch market data + P2P history in parallel
      let market, p2pPrices = [];
      try {
        [market, p2pPrices] = await Promise.all([
          fetchMarketPrices(),
          fetchP2PLatest().catch(() => []),
        ]);
      } catch (err) {
        document.getElementById("sales-content").innerHTML = `<div class="error-screen pixel-panel pixel-font"><p>Failed to load prices: ${escHTML(err.message)}</p></div>`;
        return;
      }

      const now = Date.now();

      // Process listings
      const activeListings = [];
      const soldListings = [];

      for (const [id, listing] of Object.entries(listings)) {
        const items = Object.entries(listing.items || {});
        if (items.length === 0) continue;
        const [itemName, qty] = items[0];
        const priceSFL = listing.sfl || 0;
        const unitPrice = qty > 0 ? priceSFL / qty : priceSFL;
        const createdAt = toMs(listing.createdAt || 0);
        const age = now - createdAt;
        const collection = listing.collection || "unknown";

        // Get market price
        let marketPrice = 0;
        let priceSource = "";
        if (market.p2p[itemName]) {
          marketPrice = market.p2p[itemName];
          priceSource = "P2P";
        } else if (market.nfts[itemName]) {
          marketPrice = market.nfts[itemName].floor;
          priceSource = "Floor";
        }

        const delta = marketPrice > 0 ? ((unitPrice - marketPrice) / marketPrice) * 100 : 0;

        const entry = {
          id, itemName, qty, priceSFL, unitPrice, createdAt, age,
          marketPrice, priceSource, delta, collection,
          tradeType: listing.tradeType || "onchain",
        };

        if (listing.fulfilledAt || listing.boughtAt) {
          entry.soldAt = toMs(listing.fulfilledAt || listing.boughtAt);
          soldListings.push(entry);
        } else {
          activeListings.push(entry);
        }
      }

      // Process offers (buy orders)
      const activeOffers = [];
      for (const [id, offer] of Object.entries(offers)) {
        const items = Object.entries(offer.items || {});
        if (items.length === 0) continue;
        const [itemName, qty] = items[0];
        const priceSFL = offer.sfl || 0;
        const unitPrice = qty > 0 ? priceSFL / qty : priceSFL;
        const createdAt = toMs(offer.createdAt || 0);
        const age = now - createdAt;

        let marketPrice = 0;
        let priceSource = "";
        if (market.p2p[itemName]) {
          marketPrice = market.p2p[itemName];
          priceSource = "P2P";
        } else if (market.nfts[itemName]) {
          marketPrice = market.nfts[itemName].floor;
          priceSource = "Floor";
        }

        const delta = marketPrice > 0 ? ((unitPrice - marketPrice) / marketPrice) * 100 : 0;

        if (!offer.fulfilledAt) {
          activeOffers.push({
            id, itemName, qty, priceSFL, unitPrice, createdAt, age,
            marketPrice, priceSource, delta, collection: offer.collection || "unknown",
          });
        }
      }

      // Sort: most overpriced first (for listings), cheapest first (for offers)
      activeListings.sort((a, b) => b.delta - a.delta);
      activeOffers.sort((a, b) => a.delta - b.delta);
      soldListings.sort((a, b) => (b.soldAt || 0) - (a.soldAt || 0));

      // Summary stats
      const totalListedSFL = activeListings.reduce((s, l) => s + l.priceSFL, 0);
      const totalOfferSFL = activeOffers.reduce((s, o) => s + o.priceSFL, 0);
      const overpricedCount = activeListings.filter(l => l.delta > 20).length;
      const staleCount = activeListings.filter(l => l.age > 7 * 24 * 3600000).length;

      let content = "";

      // Summary
      content += `<div class="sales-summary-grid pixel-font">
        <div class="sales-stat"><div class="sales-stat-label">ACTIVE LISTINGS</div><div class="sales-stat-value">${activeListings.length}</div></div>
        <div class="sales-stat"><div class="sales-stat-label">TOTAL LISTED</div><div class="sales-stat-value">${totalListedSFL.toFixed(1)} ${sflIcon()}</div></div>
        <div class="sales-stat"><div class="sales-stat-label">OVERPRICED</div><div class="sales-stat-value" style="color:${overpricedCount > 0 ? 'var(--red)' : 'var(--green)'}">${overpricedCount}</div></div>
        <div class="sales-stat"><div class="sales-stat-label">STALE (>7d)</div><div class="sales-stat-value" style="color:${staleCount > 0 ? 'var(--yellow)' : 'var(--green)'}">${staleCount}</div></div>
        <div class="sales-stat"><div class="sales-stat-label">ACTIVE OFFERS</div><div class="sales-stat-value">${activeOffers.length}</div></div>
        <div class="sales-stat"><div class="sales-stat-label">TOTAL OFFERED</div><div class="sales-stat-value">${totalOfferSFL.toFixed(1)} ${sflIcon()}</div></div>
        ${trades.tradePoints ? `<div class="sales-stat"><div class="sales-stat-label">TRADE POINTS</div><div class="sales-stat-value">${Math.round(trades.tradePoints)}</div></div>` : ""}
      </div>`;

      // Smart number formatting: integers stay clean, floats get max 2 decimals
      const fmtQty = n => Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, "");
      const fmtSfl = n => n >= 100 ? n.toFixed(1) : n >= 1 ? n.toFixed(2) : n.toFixed(3);

      // Render listing rows helper
      const renderListingRow = (l, isSell) => {
        const imgUrl = getItemIcon(l.itemName);
        const badges = [];
        if (isSell && l.delta > 20) badges.push(`<span class="sales-badge overpriced">+${Math.round(l.delta)}%</span>`);
        else if (isSell && l.delta < -10) badges.push(`<span class="sales-badge good">${Math.round(l.delta)}%</span>`);
        if (l.age > 7 * 24 * 3600000) badges.push(`<span class="sales-badge stale">STALE</span>`);
        if (l.soldAt) badges.push(`<span class="sales-badge sold">SOLD</span>`);

        return `<div class="sales-listing">
          <img class="sales-listing-img" src="${imgUrl}" onerror="this.style.display='none'" alt="">
          <div class="sales-listing-info">
            <div class="sales-listing-name">${escHTML(l.itemName)}${l.qty > 1 ? ` x${fmtQty(l.qty)}` : ""} ${badges.join("")}</div>
            <div class="sales-listing-detail">${formatAge(l.age)} ago · ${l.tradeType || l.collection}${l.marketPrice > 0 ? ` · market: ${fmtSfl(l.marketPrice)} ${sflIcon()}/${l.priceSource}` : ""}</div>
          </div>
          <div class="sales-listing-prices">
            <div class="sales-price-yours">${fmtSfl(l.priceSFL)} ${sflIcon()}</div>
            ${l.marketPrice > 0 && l.qty > 0 ? `<div class="sales-price-market">${fmtSfl(l.unitPrice)}/ea vs ${fmtSfl(l.marketPrice)}</div>` : ""}
          </div>
        </div>`;
      };

      // Active Listings section
      content += `<div style="margin-bottom:16px">
        <div class="sales-section-header pixel-font" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'block':'none'">
          <h3>📤 ACTIVE LISTINGS</h3>
          <span class="sales-section-count">${activeListings.length} items</span>
        </div>
        <div class="sales-section-body">`;
      if (activeListings.length === 0) {
        content += `<div style="padding:16px;text-align:center;font-size: 0.625rem;color:var(--text-dim)">No active listings</div>`;
      } else {
        for (const l of activeListings) content += renderListingRow(l, true);
      }
      content += `</div></div>`;

      // Active Offers section
      if (activeOffers.length > 0) {
        content += `<div style="margin-bottom:16px">
          <div class="sales-section-header pixel-font" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'block':'none'">
            <h3>📥 ACTIVE OFFERS</h3>
            <span class="sales-section-count">${activeOffers.length} items</span>
          </div>
          <div class="sales-section-body">`;
        for (const o of activeOffers) content += renderListingRow(o, false);
        content += `</div></div>`;
      }

      // Sold / Fulfilled section
      if (soldListings.length > 0) {
        content += `<div style="margin-bottom:16px">
          <div class="sales-section-header pixel-font" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'block':'none'">
            <h3>✅ SOLD</h3>
            <span class="sales-section-count">${soldListings.length} items</span>
          </div>
          <div class="sales-section-body" style="display:none">`;
        for (const l of soldListings) content += renderListingRow(l, true);
        content += `</div></div>`;
      }

      // Weekly stats
      const weeklySales = trades.weeklySales || {};
      const weeklyPurchases = trades.weeklyPurchases || {};
      const weekKeys = [...new Set([...Object.keys(weeklySales), ...Object.keys(weeklyPurchases)])].sort().reverse();

      if (weekKeys.length > 0) {
        content += `<div style="margin-bottom:16px">
          <div class="sales-section-header pixel-font" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'block':'none'">
            <h3>📊 WEEKLY HISTORY</h3>
            <span class="sales-section-count">${weekKeys.length} weeks</span>
          </div>
          <div class="sales-section-body" style="display:none;padding:10px 14px">`;

        for (const week of weekKeys.slice(0, 8)) {
          const sales = weeklySales[week] || {};
          const purchases = weeklyPurchases[week] || {};
          const saleItems = Object.entries(sales).map(([n, q]) => `${n} x${fmtQty(q)}`).join(", ");
          const purchItems = Object.entries(purchases).map(([n, q]) => `${n} x${fmtQty(q)}`).join(", ");
          const weekDate = new Date(parseInt(week)).toLocaleDateString("en-GB");

          content += `<div style="margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid rgba(92,58,30,0.2)">
            <div style="font-size: 0.625rem;color:var(--text-secondary);margin-bottom:3px">${weekDate}</div>
            ${saleItems ? `<div style="font-size: 0.5625rem;color:var(--green)">Sold: ${escHTML(saleItems)}</div>` : ""}
            ${purchItems ? `<div style="font-size: 0.5625rem;color:var(--blue)">Bought: ${escHTML(purchItems)}</div>` : ""}
            ${!saleItems && !purchItems ? `<div style="font-size: 0.5625rem;color:var(--text-dim)">No activity</div>` : ""}
          </div>`;
        }

        content += `</div></div>`;
      }

      // Debug: log raw trade data
      console.log("[Sales] trades:", trades);
      console.log("[Sales] listings:", Object.keys(listings).length, "offers:", Object.keys(offers).length);

      // ── Price History sections ──
      content += renderP2PHistorySection(p2pPrices);
      content += renderNftHistorySection();

      content += `<div class="footer">
        <button class="refresh-btn" onclick="refresh()">REFRESH</button>
        <div class="timestamp pixel-font">Updated: ${new Date().toLocaleTimeString("cs-CZ")}</div>
      </div>`;

      document.getElementById("sales-content").innerHTML = content;
    }

    // ═══════════════════════════════════════
    //  POWER ANALYZER: PARSER & CALC ENGINE
    // ═══════════════════════════════════════

    // Normalize common plurals in boost text
    const PLURAL_FIXES = {
      "Crimstones":"Crimstone", "Feathers":"Feather", "Leathers":"Leather",
      "Artichokes":"Artichoke", "Onions":"Onion", "Yams":"Yam",
      "Lemons":"Lemon", "Bananas":"Banana", "Grapes":"Grape",
      "Potatoes":"Potato", "Pumpkins":"Pumpkin", "Carrots":"Carrot",
      "Cabbages":"Cabbage", "Soybeans":"Soybean", "Beetroots":"Beetroot",
      "Cauliflowers":"Cauliflower", "Parsnips":"Parsnip", "Eggplants":"Eggplant",
      "Radishes":"Radish", "Turnips":"Turnip", "Peppers":"Pepper",
      "Zucchinis":"Zucchini", "Apples":"Apple", "Blueberries":"Blueberry",
      "Oranges":"Orange", "Tomatoes":"Tomato", "Olives":"Olive",
      "Sunflowers":"Sunflower", "Eggs":"Egg",
    };
    function normalizeBoostLine(line) {
      for (const [p, s] of Object.entries(PLURAL_FIXES))
        line = line.replace(new RegExp(`\\b${p}\\b`, 'g'), s);
      return line;
    }

    // Expand comma/and/&-separated product lines into individual lines
    // e.g. "+0.2 Egg, Wool and Milk yield" → ["+0.2 Egg yield", "+0.2 Wool yield", "+0.2 Milk yield"]
    // e.g. "+0.5 Wheat, Radish, Kale, Rice, Barley" → ["+0.5 Wheat", "+0.5 Radish", ...]
    function expandMultiProductLines(lines) {
      const out = [];
      for (const line of lines) {
        // Handle "+X Basic and Medium Crop yield" — MUST be before generic yield split
        const m2 = line.match(/^([+-]?\d+\.?\d*)\s+(.+?)\s+(?:and|&)\s+(.+?)\s+(Crop\s+yield)$/i);
        if (m2) { out.push(`${m2[1]} ${m2[2]} ${m2[4]}`); out.push(`${m2[1]} ${m2[3]} ${m2[4]}`); continue; }
        // Match: "+0.2 Egg, Wool and Milk yield" or "-0.35 Leather & Merino Wool yield"
        const m = line.match(/^([+-]?\d+\.?\d*)\s+(.+?)\s+(yield)$/i);
        if (m) {
          const prods = m[2].split(/\s*(?:,\s*(?:and\s+)?|\s+and\s+|\s*&\s*)\s*/);
          if (prods.length > 1) {
            for (const p of prods) out.push(`${m[1]} ${p.trim()} ${m[3]}`);
            continue;
          }
        }
        // Handle "+0.5 Wheat, Radish, Kale, Rice, Barley" (no trailing "yield")
        // and "+0.5 Stone, Iron, Gold (AOE 3x3)" — strip parenthetical first
        const cleaned = line.replace(/\s*\([^)]*\)\s*/g, '');
        const m3 = cleaned.match(/^([+-]?\d+\.?\d*)\s+(.+)$/);
        if (m3) {
          const prods = m3[2].split(/\s*(?:,\s*(?:and\s+)?|\s+and\s+|\s*&\s*)\s*/);
          if (prods.length > 1) {
            // Verify at least 2 parts look like product names (in PRODUCT_TO_CATEGORY)
            const known = prods.filter(p => PRODUCT_TO_CATEGORY[p.trim()]);
            if (known.length >= 2) {
              for (const p of prods) out.push(`${m3[1]} ${p.trim()}`);
              continue;
            }
          }
        }
        // Handle "-50% Apple and Banana Growth Time" → split into two lines
        const m4 = line.match(/^([+-]?\d+\.?\d*%?)\s+(.+?)\s+(?:and|&)\s+(.+?)\s+((?:Growth|Growing|Cooldown|Recovery|Respawn|Production)\s+Time.*)$/i);
        if (m4) {
          const p1 = m4[2].trim(), p2 = m4[3].trim();
          if (PRODUCT_TO_CATEGORY[p1] && PRODUCT_TO_CATEGORY[p2]) {
            out.push(`${m4[1]} ${p1} ${m4[4]}`);
            out.push(`${m4[1]} ${p2} ${m4[4]}`);
            continue;
          }
        }
        out.push(line);
      }
      return out;
    }

    function parseBoostEffects(boostText, itemName) {
      if (!boostText) return [];
      if (itemName && BOOST_EFFECT_OVERRIDES[itemName]) return BOOST_EFFECT_OVERRIDES[itemName].map(e => ({ ...e }));
      const effects = [];
      let lines = boostText.split("\n").map(l => l.trim()).filter(Boolean);
      lines = lines.map(normalizeBoostLine);
      lines = expandMultiProductLines(lines);
      for (const line of lines) {
        let matched = false;
        for (const rule of BOOST_PARSE_RULES) {
          const m = line.match(rule.rx);
          if (m) {
            const eff = rule.fn(m);
            if (eff) {
              eff.raw = line;
              effects.push(eff);
              // If alsoApply, duplicate for other categories
              if (eff.alsoApply) {
                for (const extraCat of eff.alsoApply) {
                  effects.push({ ...eff, cat: extraCat, alsoApply: undefined });
                }
              }
              matched = true;
              break;
            }
            // If fn returned null, continue to next rule (product not recognized)
          }
        }
        if (!matched) {
          effects.push({ type: "qualitative", cat: "other", raw: line });
        }
      }
      return effects;
    }

    function classifyToCategories(effects) {
      const cats = new Set();
      for (const e of effects) {
        if (e.cat) cats.add(e.cat);
      }
      if (cats.size === 0) cats.add("other");
      return [...cats];
    }

    // Sum effective base nodes accounting for merged nodes (tier/multiplier)
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

    // Get base production per day (units, not SFL) for a category + selected product
    function getBaseProductionPerDay(catId, product, capacity) {
      switch (catId) {
        case "crops": {
          const growSec = CROP_GROW_DATA[product];
          if (!growSec) return 0;
          const n = capacity.crops || 0;
          return n * (86400 / growSec) * 1; // yield=1 per harvest
        }
        case "fruits": {
          const growSec = FRUIT_GROW_DATA[product];
          if (!growSec) return 0;
          const n = capacity.fruitPatches || 0;
          return n * (86400 / growSec) * 1;
        }
        case "greenhouse": {
          const growSec = GREENHOUSE_GROW_DATA[product];
          if (!growSec) return 0;
          const n = capacity.greenhouse || 0;
          return n * (86400 / growSec) * 1;
        }
        case "chickens": {
          const d = ANIMAL_CYCLE_DATA["Chicken"];
          return (capacity.chickens || 0) * (86400 / d.cycleSec) * 1;
        }
        case "cows": {
          const d = ANIMAL_CYCLE_DATA["Cow"];
          return (capacity.cows || 0) * (86400 / d.cycleSec) * 1;
        }
        case "sheep": {
          const d = ANIMAL_CYCLE_DATA["Sheep"];
          return (capacity.sheep || 0) * (86400 / d.cycleSec) * 1;
        }
        case "bees": {
          return (capacity.bees || 0) * 1; // ~1 honey/day per hive
        }
        case "obsidian": {
          const d = RESOURCE_RESPAWN_DATA["Obsidian"];
          const n = capacity.lavaPits || 0;
          return n * (86400 / d.respawnSec) * d.yield;
        }
        case "oil": {
          const d = RESOURCE_RESPAWN_DATA["Oil"];
          const n = capacity.oilReserves || 0;
          return n * (86400 / d.respawnSec) * d.yield;
        }
        case "stone": case "iron": case "gold": case "crimstone": {
          const rKey = catId === "stone" ? "Stone" : catId === "iron" ? "Iron" : catId === "gold" ? "Gold" : "Crimstone";
          const d = RESOURCE_RESPAWN_DATA[rKey];
          const capKey = catId === "stone" ? "stones" : catId === "crimstone" ? "crimstones" : catId;
          const n = capacity[capKey] || 0;
          return n * (86400 / d.respawnSec) * d.yield;
        }
        case "trees": {
          const d = RESOURCE_RESPAWN_DATA["Wood"];
          return (capacity.trees || 0) * (86400 / d.respawnSec) * d.yield;
        }
        case "flowers": {
          const growSec = SEED_DATA[product]?.baseSeconds || 86400;
          const n = capacity.flowers || 0;
          return n * (86400 / growSec) * 1;
        }
        case "fishing": return 20; // ~20 catches/day estimate
        default: return 0;
      }
    }

    // Get the grow/cycle seconds for a category's selected product
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
    function applyBoosts(catId, product, capacity, boostEffects) {
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
      } else {
        unitsPerDay = n * cyclesPerDay * outputPerCycle;
      }

      return { unitsPerDay, speedMult, yieldMult, yieldFlat, effectiveCycle, extraHarvest };
    }

    // Calculate SFL/day from units/day
    function unitToSfl(unitsPerDay, product, p2pPrices) {
      const price = p2pPrices[product] || 0;
      return unitsPerDay * price;
    }

    // ── Bud boost calculation ──
    function budEffectApplies(eff, catId, product) {
      if (!eff.cats.includes(catId)) return false;
      if (eff.cropTier && catId === "crops") {
        const tierCrops = CROP_TIERS[eff.cropTier];
        if (tierCrops && !tierCrops.includes(product)) return false;
      }
      if (eff.product && eff.product !== product) return false;
      return true;
    }

    function calcBudSflPerDay(bud, capacity, p2pPrices, savedProducts) {
      const typeEffects = BUD_TYPE_BOOSTS[bud.type] || [];
      const stemEffects = BUD_STEM_BOOSTS[bud.stem] || [];
      const aura = BUD_AURA_MULTIPLIERS[bud.aura] || 1;
      const allEffects = [...typeEffects, ...stemEffects];
      let totalSfl = 0;
      const breakdown = [];

      for (const [catId, catDef] of Object.entries(POWER_CATEGORIES)) {
        if (!catDef.quantifiable) continue;

        // Animals: iterate over all products (Egg+Feather, Milk+Leather, etc.)
        if (isAnimalCat(catId)) {
          const animal = getAnimalData(catId);
          if (!animal) continue;
          let catSfl = 0;
          for (const prod of animal.products) {
            const yieldVals = [];
            for (const eff of allEffects) {
              if (!budEffectApplies(eff, catId, prod)) continue;
              if (eff.type === "yield_flat") yieldVals.push(eff.value);
            }
            const bestYield = yieldVals.length > 0 ? Math.max(...yieldVals) * aura : 0;
            if (bestYield > 0) {
              const n = getCapacityCount(catId, capacity);
              const cycleSec = getCycleSec(catId, prod);
              const price = p2pPrices[prod] || 0;
              catSfl += bestYield * (86400 / cycleSec) * n * price;
            }
          }
          if (catSfl > 0) {
            totalSfl += catSfl;
            breakdown.push({ catId, sflPerDay: catSfl });
          }
          continue;
        }

        const product = savedProducts[catId] || getDefaultProduct(catId);
        const n = getCapacityCount(catId, capacity);
        if (n === 0 && catId !== "fishing") continue;

        const yieldVals = [], speedVals = [], chanceVals = [];
        for (const eff of allEffects) {
          if (!budEffectApplies(eff, catId, product)) continue;
          if (eff.type === "yield_flat") yieldVals.push(eff.value);
          else if (eff.type === "speed_pct") speedVals.push(eff.value);
          else if (eff.type === "chance") chanceVals.push(eff);
        }

        const bestYield = yieldVals.length > 0 ? Math.max(...yieldVals) * aura : 0;
        const bestSpeed = speedVals.length > 0 ? Math.min(...speedVals) * aura : 0;
        const bestChance = chanceVals.length > 0
          ? chanceVals.reduce((a, b) => (a.pct * a.extra > b.pct * b.extra) ? a : b) : null;

        const cycleSec = getCycleSec(catId, product);
        const priceProduct = getPriceProduct(catId, product);
        const price = p2pPrices[priceProduct] || 0;
        let extraSfl = 0;

        if (bestYield > 0) {
          if (catId === "fishing") extraSfl += bestYield * price;
          else if (catId === "bees") extraSfl += bestYield * n * price;
          else extraSfl += bestYield * (86400 / cycleSec) * n * price;
        }

        if (bestSpeed !== 0) {
          const newCycle = cycleSec * (1 + bestSpeed / 100);
          if (newCycle > 0) {
            const baseY = getBaseYield(catId);
            extraSfl += ((86400 / newCycle) - (86400 / cycleSec)) * n * baseY * price;
          }
        }

        if (bestChance) {
          const effPct = bestChance.pct * aura;
          const catches = catId === "fishing" ? 20 : (86400 / cycleSec) * n;
          extraSfl += (effPct / 100) * bestChance.extra * catches * price;
        }

        if (extraSfl > 0) {
          totalSfl += extraSfl;
          breakdown.push({ catId, sflPerDay: extraSfl, product: priceProduct });
        }
      }

      return { totalSfl, breakdown };
    }

    const CAT_ICON_ITEM = {
      crops: "Wheat", fruits: "Apple", greenhouse: "Grape", chickens: "Egg", cows: "Milk",
      sheep: "Wool", flowers: "Red Pansy", stone: "Stone", iron: "Iron", gold: "Gold",
      crimstone: "Crimstone", trees: "Wood", fishing: "Anchovy", bees: "Honey",
      mushrooms: "Wild Mushroom", cooking: "Cake",
    };
    function catIcon(catId, size) {
      const item = CAT_ICON_ITEM[catId];
      if (!item) return "";
      const s = size || "1em";
      return `<img src="${getItemIcon(item)}" alt="${catId}" style="height:${s};vertical-align:-0.15em" loading="lazy">`;
    }

    function describeBudBoosts(bud) {
      const typeEffects = BUD_TYPE_BOOSTS[bud.type] || [];
      const stemEffects = BUD_STEM_BOOSTS[bud.stem] || [];
      const aura = BUD_AURA_MULTIPLIERS[bud.aura] || 1;
      const descs = [];
      const descEff = (eff) => {
        const icons = eff.cats.map(c => catIcon(c, "1.1em")).filter(Boolean);
        const iconStr = icons.length ? icons.join("") + " " : "";
        const label = eff.product ? eff.product
          : ((eff.cropTier ? eff.cropTier[0].toUpperCase() + eff.cropTier.slice(1) + " " : "")
            + eff.cats.map(c => POWER_CATEGORIES[c]?.label || c).join("/"));
        if (eff.type === "yield_flat") descs.push(`${iconStr}+${(eff.value * aura).toFixed(2)} ${label}`);
        else if (eff.type === "speed_pct") descs.push(`${iconStr}${(eff.value * aura).toFixed(1)}% ${label} Time`);
        else if (eff.type === "chance") descs.push(`${iconStr}${(eff.pct * aura).toFixed(0)}% +${eff.extra} ${label}`);
      };
      for (const eff of typeEffects) descEff(eff);
      for (const eff of stemEffects) descEff(eff);
      return descs;
    }

    // ── Cost calculation helpers ──

    // Detect stock modifiers from farm buildings/skills
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
      const slickSaver = skills["Slick Saver"] !== undefined; // -1 Oil for greenhouse seeds
      const hasKaleMix = skills["Kale Mix"] !== undefined; // Mixed Grain uses 3 Kale instead
      return { hasWarehouse, hasToolshed, moreAxes, morePicks, fellersDiscount, frugalMiner, hasQuarry, hasForeman, oilRigActive, hasInfernalDrill, slickSaver, hasKaleMix };
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

    // Calculate seed cost per day for a crop/fruit/greenhouse category
    function calcSeedCostPerDay(catId, product, capacity, exchangeRates, stockMods, boostEffects, p2pPrices) {
      const coinCost = SEED_COSTS[product];
      if (!coinCost || exchangeRates.coinsPerSFL <= 0) return { costPerDay: 0, seedSfl: 0, restockPerDay: 0 };
      const seedSfl = coinCost / exchangeRates.coinsPerSFL;
      const n = getCapacityCount(catId, capacity);
      if (n === 0) return { costPerDay: 0, seedSfl, restockPerDay: 0 };

      // Apply speed boosts to get effective cycles/day
      const result = applyBoosts(catId, product, capacity, boostEffects);
      const effectiveCycle = result.effectiveCycle || getCycleSec(catId, product);
      const cyclesPerDay = effectiveCycle > 0 ? 86400 / effectiveCycle : 0;

      // Fruit harvest count: one seed produces multiple harvests
      let effectiveHarvests = 1;
      if (catId === "fruits") {
        const baseHarvests = FRUIT_HARVEST_COUNT[product] || 4;
        effectiveHarvests = baseHarvests + (result.extraHarvest || 0);
      }

      // Seed consumption: for fruits, 1 seed per (harvestCount × growCycle)
      const seedsPerDay = cyclesPerDay * n / effectiveHarvests;
      let costPerDay = seedSfl * seedsPerDay;

      // Greenhouse oil cost per seed
      let oilPerSeed = 0, oilSflPerSeed = 0, oilCostPerDay = 0;
      if (catId === "greenhouse" && GREENHOUSE_OIL_COSTS[product]) {
        oilPerSeed = GREENHOUSE_OIL_COSTS[product];
        if (stockMods.slickSaver) oilPerSeed = Math.max(0, oilPerSeed - 1);
        oilSflPerSeed = oilPerSeed * ((p2pPrices && p2pPrices["Oil"]) || 0);
        oilCostPerDay = oilSflPerSeed * seedsPerDay;
        costPerDay += oilCostPerDay;
      }

      // Stock info (restock cost calculated separately in shared restock system)
      const seedName = product + " Seed";
      const stock = getEffectiveStock(seedName, stockMods);
      const daysUntilEmpty = seedsPerDay > 0 ? stock / seedsPerDay : Infinity;

      return { costPerDay, seedSfl, restockPerDay: 0, cyclesPerDay, seedsPerDay, stock, daysUntilEmpty, oilPerSeed, oilSflPerSeed, oilCostPerDay, effectiveHarvests };
    }

    // Calculate tool cost per day for a resource category
    // skipDiscount: if true, ignore coin discounts (for base cost calculation)
    function calcToolCostPerDay(catId, capacity, exchangeRates, p2pPrices, stockMods, skipDiscount) {
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
          const toolsPerDay = d ? n * (86400 / d.respawnSec) : 0;
          return { costPerDay: 0, toolSfl: 0, restockPerDay: 0, toolsPerDay, stock: 0, freeTool: true, freeToolSource: "Quarry" };
        }
        if (catId === "trees" && stockMods.hasForeman) {
          const d = RESOURCE_RESPAWN_DATA["Wood"];
          const n = capacity.trees || 0;
          const toolsPerDay = d ? n * (86400 / d.respawnSec) : 0;
          return { costPerDay: 0, toolSfl: 0, restockPerDay: 0, toolsPerDay, stock: 0, freeTool: true, freeToolSource: "Foreman Beaver" };
        }
        if (catId === "oil" && stockMods.hasInfernalDrill) {
          const d = RESOURCE_RESPAWN_DATA["Oil"];
          const n = capacity.oilReserves || 0;
          const toolsPerDay = d ? n * (86400 / d.respawnSec) : 0;
          return { costPerDay: 0, toolSfl: 0, restockPerDay: 0, toolsPerDay, stock: 0, freeTool: true, freeToolSource: "Infernal Drill" };
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
      const toolsPerDay = n * cyclesPerDay; // 1 tool per node per cycle
      const costPerDay = toolSfl * toolsPerDay;

      // Stock info (restock cost calculated separately in shared restock system)
      const stock = getEffectiveStock(toolName, stockMods);
      const daysUntilEmpty = toolsPerDay > 0 ? stock / toolsPerDay : Infinity;

      return { costPerDay, toolSfl, restockPerDay: 0, toolsPerDay, stock, daysUntilEmpty, coinDiscount, discountSource, effectiveCoins, baseCoins: tool.coins };
    }

    // ── Animal Feed Cost Functions ──

    // Get preferred feed (highest XP) for a given level. Returns null at max level (use cheapest).
    function getPreferredFeed(level) {
      if (level >= 15) return null;
      for (const row of FEED_XP_TABLE) {
        if (level >= row.min && level <= row.max) {
          let best = null, bestXP = 0;
          for (const [food, xp] of Object.entries(row.xp)) {
            if (xp > bestXP) { bestXP = xp; best = food; }
          }
          return best;
        }
      }
      return "Mixed Grain";
    }

    // Get cheapest feed by P2P ingredient cost
    function getCheapestFeed(p2pPrices, stockMods) {
      let cheapest = null, cheapestCost = Infinity;
      for (const [food, ingredients] of Object.entries(FEED_RECIPES)) {
        let cost = 0;
        if (food === "Mixed Grain" && stockMods?.hasKaleMix) {
          cost = (p2pPrices["Kale"] || 0) * 3;
        } else {
          for (const [item, qty] of Object.entries(ingredients)) {
            cost += (p2pPrices[item] || 0) * qty;
          }
        }
        if (cost < cheapestCost) { cheapestCost = cost; cheapest = food; }
      }
      return { food: cheapest, costPerUnit: cheapestCost };
    }

    // Get cost per 1 unit of a specific feed
    function getFeedCostPerUnit(foodName, p2pPrices, stockMods) {
      if (foodName === "Mixed Grain" && stockMods?.hasKaleMix) {
        return (p2pPrices["Kale"] || 0) * 3;
      }
      const recipe = FEED_RECIPES[foodName];
      if (!recipe) return 0;
      let cost = 0;
      for (const [item, qty] of Object.entries(recipe)) {
        cost += (p2pPrices[item] || 0) * qty;
      }
      return cost;
    }

    // Compute feed reduction multiplier from boost effects for a specific animal category
    function getFeedReductionMult(catId, boostEffects) {
      let mult = 1;
      for (const eff of boostEffects) {
        if (eff.type === "feed_reduction" && eff.cat === catId) {
          mult *= (1 + eff.value); // value is negative for reductions (e.g. -0.25)
        }
      }
      return Math.max(0, mult);
    }

    // Main animal feed cost function (analogous to calcSeedCostPerDay / calcToolCostPerDay)
    function calcAnimalFeedCost(catId, capacity, p2pPrices, boostEffects, stockMods) {
      const animalType = ANIMAL_CAT_MAP[catId];
      if (!animalType) return { costPerDay: 0 };

      const animals = capacity.animalDetails?.[catId] || [];
      if (animals.length === 0) return { costPerDay: 0, animalCount: 0 };

      // Check golden animal → free feeding
      if (capacity.goldenAnimals?.[animalType]) {
        const goldenItem = Object.keys(GOLDEN_ANIMALS).find(k => GOLDEN_ANIMALS[k] === animalType);
        return { costPerDay: 0, isGolden: true, goldenItem, animalCount: animals.length };
      }

      // Speed multiplier affects feeding frequency
      let speedMult = 1;
      for (const eff of boostEffects) {
        if (eff.cat !== catId) continue;
        if (eff.type === "speed_pct") speedMult *= (1 + eff.value / 100);
        else if (eff.type === "speed_mult") speedMult *= eff.value;
      }
      const cycleSec = ANIMAL_CYCLE_DATA[animalType].cycleSec * speedMult;
      const cyclesPerDay = cycleSec > 0 ? 86400 / cycleSec : 0;

      // Feed reduction from boosts
      const feedReductionMult = getFeedReductionMult(catId, boostEffects);
      const baseFeedQty = FEED_QTY[animalType] || 1;
      const effectiveFeedQty = baseFeedQty * feedReductionMult;

      const cheapest = getCheapestFeed(p2pPrices, stockMods);
      const levelDist = getAnimalLevelDistribution(animals);

      // Compute per-animal feed cost
      let totalCostPerCycle = 0;
      const feedBreakdown = {}; // { foodName: { count, costPerUnit, totalUnits } }

      for (const animal of animals) {
        const preferred = getPreferredFeed(animal.level);
        const foodName = preferred || cheapest.food;
        const costPerUnit = getFeedCostPerUnit(foodName, p2pPrices, stockMods);
        const costPerAnimal = effectiveFeedQty * costPerUnit;
        totalCostPerCycle += costPerAnimal;

        if (!feedBreakdown[foodName]) feedBreakdown[foodName] = { count: 0, costPerUnit, totalUnits: 0 };
        feedBreakdown[foodName].count++;
        feedBreakdown[foodName].totalUnits += effectiveFeedQty;
      }

      const costPerDay = totalCostPerCycle * cyclesPerDay;

      return {
        costPerDay,
        feedBreakdown,
        feedReductionMult,
        animalCount: animals.length,
        cyclesPerDay,
        baseFeedQty,
        effectiveFeedQty,
        levelDist,
        speedMult,
      };
    }

    // ── Animal Sickness Cost ──
    // Expected daily sickness cost = numAnimals * sicknessRate * barnDelightCostSfl
    // Reduced by: Healthy Livestock (-50% rate), Oracle Syringe (free cure),
    //   Medic Apron (-50% cost), Alternate Medicine (cheaper recipe),
    //   Prevention items (0% for specific type)
    function calcSicknessCost(catId, capacity, p2pPrices, boostItems, skills) {
      const animals = capacity.animalDetails?.[catId] || [];
      if (animals.length === 0) return { costPerDay: 0, avgRate: 0, barnDelightSfl: 0, reductions: [], perLevel: [] };

      const reductions = [];

      // Base Barn Delight cost in SFL
      const hasAltMedicine = !!(skills && skills["Alternate Medicine"]);
      const recipe = hasAltMedicine ? BARN_DELIGHT_RECIPE_ALT : BARN_DELIGHT_RECIPE;
      if (hasAltMedicine) reductions.push({ name: "Alternate Medicine", desc: "Recipe: -1 Lemon & Honey" });
      const lemonPrice = p2pPrices["Lemon"] || 0;
      const honeyPrice = p2pPrices["Honey"] || 0;
      const barnDelightSfl = (recipe.Lemon * lemonPrice) + (recipe.Honey * honeyPrice);

      // Check prevention items (full immunity for this category)
      let prevented = false;
      if (boostItems) {
        for (const item of boostItems) {
          if (!item.has) continue;
          const prevCat = SICKNESS_PREVENTION[item.name];
          if (prevCat === catId) {
            prevented = true;
            reductions.push({ name: item.name, desc: "Full prevention" });
            break;
          }
        }
      }
      if (prevented) return { costPerDay: 0, avgRate: 0, barnDelightSfl, prevented: true, reductions, perLevel: [] };

      // Rate multiplier from Healthy Livestock
      let rateMult = 1;
      const hasHealthyLivestock = !!(skills && skills["Healthy Livestock"]);
      if (hasHealthyLivestock) {
        rateMult = 0.5;
        reductions.push({ name: "Healthy Livestock", desc: "-50% sickness rate" });
      }

      // Cure cost modifiers
      let cureCostMult = 1;
      const hasOracleSyringe = boostItems && boostItems.some(b => b.name === "Oracle Syringe" && b.has);
      if (hasOracleSyringe) {
        cureCostMult = 0;
        reductions.push({ name: "Oracle Syringe", desc: "Free cure" });
      }
      if (cureCostMult > 0) {
        const hasMedicApron = boostItems && boostItems.some(b => b.name === "Medic Apron" && b.has);
        if (hasMedicApron) {
          cureCostMult *= 0.5;
          reductions.push({ name: "Medic Apron", desc: "-50% Barn Delight cost" });
        }
      }

      // Per-animal level-based sickness rate
      let totalExpectedSick = 0;
      const perLevel = {};  // { level: { count, rate, cost } }
      for (const animal of animals) {
        const lvl = Math.min(animal.level || 1, SICKNESS_RATE_BY_LEVEL.length - 1);
        const baseRate = SICKNESS_RATE_BY_LEVEL[lvl] || 0;
        const effectiveRate = baseRate * rateMult;
        totalExpectedSick += effectiveRate;

        if (!perLevel[lvl]) perLevel[lvl] = { count: 0, rate: effectiveRate, baseRate };
        perLevel[lvl].count++;
      }

      const costPerDay = totalExpectedSick * barnDelightSfl * cureCostMult;
      const avgRate = animals.length > 0 ? totalExpectedSick / animals.length : 0;

      return { costPerDay, avgRate, totalExpectedSick, barnDelightSfl, cureCostMult, rateMult, reductions, animalCount: animals.length, perLevel };
    }

    // Calculate sickness cost savings from a specific boost item
    function calcSicknessBoostSavings(boostItem, catId, capacity, p2pPrices, allBoostItems, skills) {
      const animals = capacity.animalDetails?.[catId] || [];
      if (animals.length === 0) return 0;

      // Base cost without this item
      const itemsWithout = (allBoostItems || []).filter(b => b.name !== boostItem.name);
      const baseCost = calcSicknessCost(catId, capacity, p2pPrices, itemsWithout, skills);

      // Cost with this item (simulate ownership)
      const itemsWith = (allBoostItems || []).map(b => b.name === boostItem.name ? { ...b, has: true } : b);
      const withCost = calcSicknessCost(catId, capacity, p2pPrices, itemsWith, skills);

      return baseCost.costPerDay - withCost.costPerDay;
    }

    // ── Shared Restock System ──
    // Restock buys ALL seeds (15 gems) or ALL tools (10 gems) or both (20 gems) at once.
    // Cost is based on how often the fastest-depleting "trigger" queue runs out.

    const RESTOCK_QUEUE_DEFS = {
      // Seed queues (one per seed category — all plots/patches/pots share)
      crops:      { group: "seeds", label: "Crops", getProduct: sp => sp.crops || getDefaultProduct("crops") },
      fruits:     { group: "seeds", label: "Fruits", getProduct: sp => sp.fruits || getDefaultProduct("fruits") },
      greenhouse: { group: "seeds", label: "Greenhouse", getProduct: sp => sp.greenhouse || getDefaultProduct("greenhouse") },
      // Tool queues (independent — one per tool type)
      Axe:            { group: "tools", label: "Axe (trees)",     catId: "trees" },
      Pickaxe:        { group: "tools", label: "Pickaxe (stone)",  catId: "stone" },
      "Stone Pickaxe": { group: "tools", label: "Stone Pick (iron)", catId: "iron" },
      "Iron Pickaxe":  { group: "tools", label: "Iron Pick (gold)",  catId: "gold" },
      "Gold Pickaxe":  { group: "tools", label: "Gold Pick (crimstone)", catId: "crimstone" },
      "Oil Drill":     { group: "tools", label: "Oil Drill (oil)", catId: "oil" },
    };

    function getRestockSettings() {
      try { return JSON.parse(localStorage.getItem("sfl_restock_settings") || "null"); }
      catch { return null; }
    }
    function saveRestockSettings(settings) {
      localStorage.setItem("sfl_restock_settings", JSON.stringify(settings));
    }
    function getDefaultRestockSettings() {
      return {
        mode: "off",
        activeQueues: Object.keys(RESTOCK_QUEUE_DEFS),
        trigger: "crops",
      };
    }

    // Build queue data: stock, usePerDay, daysUntilEmpty for each queue
    function buildQueueData(savedProducts, capacity, exchangeRates, stockMods, catBoosts, p2pPrices) {
      const queues = {};
      for (const [qId, qDef] of Object.entries(RESTOCK_QUEUE_DEFS)) {
        if (qDef.group === "seeds") {
          const catId = qId; // crops, fruits, greenhouse
          const product = qDef.getProduct(savedProducts);
          const n = getCapacityCount(catId, capacity);
          const ownedEffects = (catBoosts[catId] || []).filter(b => b.has && !b.isDisabled).flatMap(b => getEffectsForCategory(b, catId));
          const result = applyBoosts(catId, product, capacity, ownedEffects);
          const effectiveCycle = result.effectiveCycle || getCycleSec(catId, product);
          const cyclesPerDay = effectiveCycle > 0 ? 86400 / effectiveCycle : 0;
          let effectiveHarvests = 1;
          if (catId === "fruits") {
            const baseH = FRUIT_HARVEST_COUNT[product] || 4;
            effectiveHarvests = baseH + (result.extraHarvest || 0);
          }
          const seedsPerDay = cyclesPerDay * n / effectiveHarvests;
          const seedName = product + " Seed";
          const stock = getEffectiveStock(seedName, stockMods);
          const daysUntilEmpty = seedsPerDay > 0 ? stock / seedsPerDay : Infinity;
          queues[qId] = { stock, usePerDay: seedsPerDay, daysUntilEmpty, product, group: "seeds", label: `${qDef.label} (${product})`, capacity: n };
        } else {
          // Tool queue
          const toolName = qId;
          const catId = qDef.catId;
          const n = getCapacityCount(catId, capacity);
          const d = RESOURCE_RESPAWN_DATA[Object.keys(PRODUCT_TO_CATEGORY).find(p => PRODUCT_TO_CATEGORY[p] === catId)];
          const ownedEffects = (catBoosts[catId] || []).filter(b => b.has && !b.isDisabled).flatMap(b => getEffectsForCategory(b, catId));
          const result = applyBoosts(catId, catId === "oil" ? "Oil" : Object.keys(PRODUCT_TO_CATEGORY).find(p => PRODUCT_TO_CATEGORY[p] === catId), capacity, ownedEffects);
          const effectiveCycle = result.effectiveCycle || (d ? d.respawnSec : 0);
          const toolsPerDay = effectiveCycle > 0 ? (86400 / effectiveCycle) * n : 0;
          const stock = getEffectiveStock(toolName, stockMods);
          // Check for free tool sources
          let freeTool = false;
          if (catId === "stone" && stockMods.hasQuarry) freeTool = true;
          if (catId === "trees" && stockMods.hasForeman) freeTool = true;
          if (catId === "oil" && stockMods.hasInfernalDrill) freeTool = true;
          const effectiveUse = freeTool ? 0 : toolsPerDay;
          const daysUntilEmpty = effectiveUse > 0 ? stock / effectiveUse : Infinity;
          queues[qId] = { stock, usePerDay: effectiveUse, daysUntilEmpty, toolName, group: "tools", label: qDef.label, capacity: n, freeTool };
        }
      }
      return queues;
    }

    // Calculate shared restock cost
    function calcRestockCost(restockSettings, queueData, exchangeRates) {
      if (!restockSettings || restockSettings.mode === "off") {
        return { restockPerDay: 0, restockFrequencyDays: Infinity, triggerQueue: null, gemCost: 0, restockSfl: 0 };
      }
      const mode = restockSettings.mode;
      const gemCost = mode === "seeds" ? RESTOCK_GEM_COSTS.seeds : mode === "tools" ? RESTOCK_GEM_COSTS.tools : RESTOCK_GEM_COSTS.both;
      let trigger = restockSettings.trigger;
      const tq = queueData[trigger];
      // Validate trigger group matches mode
      if (tq && mode !== "both") {
        const expectedGroup = mode; // "seeds" or "tools"
        if (tq.group !== expectedGroup) {
          return { restockPerDay: 0, restockFrequencyDays: Infinity, triggerQueue: trigger, gemCost, restockSfl: 0 };
        }
      }
      if (!tq || tq.daysUntilEmpty === Infinity || tq.usePerDay === 0) {
        return { restockPerDay: 0, restockFrequencyDays: Infinity, triggerQueue: trigger, gemCost, restockSfl: 0 };
      }
      const restockFrequencyDays = tq.daysUntilEmpty;
      const restockSfl = exchangeRates.gemsPerSFL > 0 ? gemCost / exchangeRates.gemsPerSFL : 0;
      const restockPerDay = restockFrequencyDays > 0 ? restockSfl / restockFrequencyDays : 0;
      return { restockPerDay, restockFrequencyDays, triggerQueue: trigger, gemCost, restockSfl };
    }

    // Lava Pit cost: seasonal material requirements → P2P cost per ignition
    function calcLavaPitCostPerDay(capacity, p2pPrices, season, costMult) {
      const n = capacity.lavaPits || 0;
      if (n === 0 || !season) return { costPerDay: 0, costPerIgnition: 0, requirements: [], season };
      const reqs = LAVA_PIT_REQUIREMENTS[season];
      if (!reqs) return { costPerDay: 0, costPerIgnition: 0, requirements: [], season };

      const mult = costMult !== undefined ? costMult : 1;
      let costPerIgnition = 0;
      const breakdown = [];
      for (const r of reqs) {
        const price = p2pPrices[r.item] || 0;
        const effectiveQty = r.qty * mult;
        const cost = price * effectiveQty;
        costPerIgnition += cost;
        breakdown.push({ item: r.item, qty: effectiveQty, baseQty: r.qty, price, cost });
      }

      const d = RESOURCE_RESPAWN_DATA["Obsidian"];
      const cyclesPerDay = 86400 / d.respawnSec;
      const ignitionsPerDay = n * cyclesPerDay;
      const costPerDay = costPerIgnition * ignitionsPerDay;

      return { costPerDay, costPerIgnition, ignitionsPerDay, requirements: breakdown, season, costMult: mult };
    }

    // Compute total SFL/day across all products for an animal category
    function getAnimalCatSfl(catId, capacity, boostEffects, p2pPrices) {
      const animalType = ANIMAL_CAT_MAP[catId];
      const animal = getAnimalData(catId);
      if (!animal) return { totalSfl: 0, breakdown: [] };

      const animals = capacity.animalDetails?.[catId];
      // If we have per-animal level data, use level-based drops
      if (animals && animals.length > 0) {
        // Extract speed multiplier from boosts (same for all products)
        let speedMult = 1;
        for (const eff of boostEffects) {
          if (eff.cat !== catId) continue;
          if (eff.type === "speed_pct") speedMult *= (1 + eff.value / 100);
          else if (eff.type === "speed_mult") speedMult *= eff.value;
        }
        const effectiveCycle = animal.cycleSec * speedMult;
        const cyclesPerDay = effectiveCycle > 0 ? 86400 / effectiveCycle : 0;

        let totalSfl = 0;
        const breakdown = [];
        for (const prod of animal.products) {
          // Collect yield modifiers for this specific product
          let yieldMult = 1, yieldFlat = 0;
          for (const eff of boostEffects) {
            if (eff.cat !== catId) continue;
            if (eff.product && PRODUCT_TO_CATEGORY[eff.product] === catId && eff.product !== prod) continue;
            if (eff.type === "yield_pct") yieldMult *= (1 + eff.value / 100);
            else if (eff.type === "yield_flat") yieldFlat += eff.value;
            else if (eff.type === "chance") yieldFlat += (eff.pct / 100) * eff.extra;
          }
          // Sum production across all animals at their individual levels
          let totalUnits = 0;
          for (const a of animals) {
            const drops = getAnimalDropsPerCycle(animalType, a.level);
            const baseDrop = drops[prod] || 0;
            totalUnits += (baseDrop * yieldMult + yieldFlat) * cyclesPerDay;
          }
          const price = p2pPrices[prod] || 0;
          const sfl = totalUnits * price;
          totalSfl += sfl;
          breakdown.push({ product: prod, unitsPerDay: totalUnits, sfl, speedMult, yieldMult, yieldFlat, effectiveCycle });
        }
        return { totalSfl, breakdown };
      }

      // Fallback: no per-animal data — use old flat yield=1 path
      let totalSfl = 0;
      const breakdown = [];
      for (const prod of animal.products) {
        const result = applyBoosts(catId, prod, capacity, boostEffects);
        const sfl = unitToSfl(result.unitsPerDay, prod, p2pPrices);
        totalSfl += sfl;
        breakdown.push({ product: prod, unitsPerDay: result.unitsPerDay, sfl, ...result });
      }
      return { totalSfl, breakdown };
    }

    // Format seconds to human-readable time
    function fmtSec(s) {
      if (s >= 86400) return (s / 86400).toFixed(1) + "d";
      if (s >= 3600) return (s / 3600).toFixed(1) + "h";
      if (s >= 60) return (s / 60).toFixed(0) + "m";
      return s + "s";
    }

    // Build detailed production breakdown HTML for a category
    function buildProductionBreakdown(catId, product, capacity, p2pPrices, catBoosts) {
      const n = getCapacityCount(catId, capacity);
      const ownedEffects = catBoosts.filter(b => b.has && !b.isDisabled).flatMap(b => getEffectsForCategory(b, catId));

      if (n === 0 && catId !== "fishing") {
        return `<div style="padding:8px 12px;font-size: 0.625rem;color:var(--text-dim)">No capacity detected on farm.</div>`;
      }

      const unitLabels = {
        crops: "plots", fruits: "patches", greenhouse: "pots", chickens: "chickens", cows: "cows",
        sheep: "sheep", bees: "hives", flowers: "beds", stone: "rocks",
        iron: "nodes", gold: "nodes", crimstone: "nodes", obsidian: "pits", oil: "reserves", trees: "trees", fishing: "reels"
      };
      const unitLabel = unitLabels[catId] || catId;

      let h = `<div style="padding:8px 12px;font-size: 0.5625rem;color:var(--text-secondary);line-height:1.8;border-bottom:1px solid var(--border-dark)">`;

      // Animal categories: show per-product breakdown with level-based drops
      if (isAnimalCat(catId)) {
        const animalType = ANIMAL_CAT_MAP[catId];
        const animal = getAnimalData(catId);
        const baseCycleSec = animal.cycleSec;
        const cyclesPerDay = 86400 / baseCycleSec;
        const animals = capacity.animalDetails?.[catId] || [];
        const levelDist = getAnimalLevelDistribution(animals);

        // Level distribution
        if (animals.length > 0) {
          const levelParts = Object.entries(levelDist.levels).sort((a,b) => parseInt(a[0]) - parseInt(b[0])).map(([lvl, cnt]) => `L${lvl}: ${cnt}`);
          h += `<div style="color:var(--text-dim);margin-bottom:4px">📊 ${n} ${unitLabel} — ${levelParts.join(" · ")} (avg L${levelDist.avgLevel.toFixed(1)})</div>`;
          // Show drops by level group
          const levelGroups = {};
          for (const a of animals) {
            if (!levelGroups[a.level]) levelGroups[a.level] = 0;
            levelGroups[a.level]++;
          }
          for (const [lvl, cnt] of Object.entries(levelGroups).sort((a,b) => parseInt(a[0]) - parseInt(b[0]))) {
            const drops = getAnimalDropsPerCycle(animalType, parseInt(lvl));
            const dropStr = animal.products.map(p => `${drops[p] || 0} ${p}`).join(" + ");
            h += `<div style="padding-left:8px;color:var(--text-dim)">${cnt}× L${lvl}: ${dropStr} per cycle</div>`;
          }
        }

        // BASE
        h += `<div style="color:var(--lily);font-size: 0.625rem;margin-top:4px;margin-bottom:2px"><strong>📊 BASE PRODUCTION</strong></div>`;
        h += `<div>${n} ${unitLabel} × ${fmtSec(baseCycleSec)} cycle = <strong>${cyclesPerDay.toFixed(2)} cycles/day</strong></div>`;
        const baseInfo = getAnimalCatSfl(catId, capacity, [], p2pPrices);
        for (const bp of baseInfo.breakdown) {
          const price = p2pPrices[bp.product] || 0;
          h += `<div style="padding-left:8px">${bp.product}: ${bp.unitsPerDay.toFixed(2)}/day × ${price.toFixed(6)} = <strong>${bp.sfl.toFixed(4)} ${sflIcon()}/day</strong></div>`;
        }
        h += `<div>TOTAL: <strong style="color:var(--sunpetal)">${baseInfo.totalSfl.toFixed(4)} ${sflIcon()}/day</strong></div>`;

        // BOOSTED
        if (ownedEffects.length > 0) {
          const boostedInfo = getAnimalCatSfl(catId, capacity, ownedEffects, p2pPrices);
          const delta = boostedInfo.totalSfl - baseInfo.totalSfl;
          h += `<div style="color:var(--lily);font-size: 0.625rem;margin-top:6px;margin-bottom:2px"><strong>⚡ BOOSTED PRODUCTION</strong></div>`;
          for (const bp of boostedInfo.breakdown) {
            const price = p2pPrices[bp.product] || 0;
            const bCyclesPerDay = bp.effectiveCycle > 0 ? 86400 / bp.effectiveCycle : 0;
            h += `<div style="padding-left:8px">${bp.product}: ×${bp.speedMult.toFixed(3)} speed → ${fmtSec(bp.effectiveCycle)} (${bCyclesPerDay.toFixed(2)}/day) | yield ×${bp.yieldMult.toFixed(3)}${bp.yieldFlat ? ` +${bp.yieldFlat.toFixed(2)}` : ""} → ${bp.unitsPerDay.toFixed(2)}/day × ${price.toFixed(6)} = <strong>${bp.sfl.toFixed(4)} ${sflIcon()}/day</strong></div>`;
          }
          h += `<div>TOTAL: <strong style="color:var(--green)">${boostedInfo.totalSfl.toFixed(4)} ${sflIcon()}/day</strong>`;
          h += ` <span style="color:var(--sunpetal)">(+${delta.toFixed(4)} | +${baseInfo.totalSfl > 0 ? ((delta / baseInfo.totalSfl) * 100).toFixed(0) : "∞"}%)</span></div>`;
        }
      } else {
        // Non-animal: original single-product breakdown
        const priceProduct = getPriceProduct(catId, product);
        const price = p2pPrices[priceProduct] || 0;
        const baseCycleSec = getCycleSec(catId, product);
        const baseYield = getBaseYield(catId);
        const baseResult = applyBoosts(catId, product, capacity, []);
        const baseSfl = unitToSfl(baseResult.unitsPerDay, priceProduct, p2pPrices);

        const boostedResult = applyBoosts(catId, product, capacity, ownedEffects);
        const boostedSfl = unitToSfl(boostedResult.unitsPerDay, priceProduct, p2pPrices);
        const delta = boostedSfl - baseSfl;

        const cyclesPerDay = baseCycleSec > 0 ? 86400 / baseCycleSec : 0;
        h += `<div style="color:var(--lily);font-size: 0.625rem;margin-bottom:2px"><strong>📊 BASE PRODUCTION</strong></div>`;
        h += `<div>${n} ${unitLabel} × ${fmtSec(baseCycleSec)} cycle = <strong>${cyclesPerDay.toFixed(2)} cycles/day</strong></div>`;
        h += `<div>${cyclesPerDay.toFixed(2)} cycles × ${baseYield} yield × ${n} ${unitLabel} = <strong>${baseResult.unitsPerDay.toFixed(2)} ${priceProduct}/day</strong></div>`;
        h += `<div>P2P price: ${price.toFixed(6)} ${sflIcon()}/${priceProduct}</div>`;
        h += `<div>${baseResult.unitsPerDay.toFixed(2)} × ${price.toFixed(6)} = <strong style="color:var(--sunpetal)">${baseSfl.toFixed(4)} ${sflIcon()}/day</strong></div>`;

        if (ownedEffects.length > 0) {
          const bCyclesPerDay = boostedResult.effectiveCycle > 0 ? 86400 / boostedResult.effectiveCycle : 0;
          const bOutputPerCycle = baseYield * boostedResult.yieldMult + boostedResult.yieldFlat;
          h += `<div style="color:var(--lily);font-size: 0.625rem;margin-top:6px;margin-bottom:2px"><strong>⚡ BOOSTED PRODUCTION</strong></div>`;
          h += `<div>Speed: ×${boostedResult.speedMult.toFixed(3)} → ${fmtSec(boostedResult.effectiveCycle)} cycle → <strong>${bCyclesPerDay.toFixed(2)} cycles/day</strong></div>`;
          h += `<div>Yield: ×${boostedResult.yieldMult.toFixed(3)} ${boostedResult.yieldFlat !== 0 ? `+ ${boostedResult.yieldFlat.toFixed(2)} flat` : ""} → <strong>${bOutputPerCycle.toFixed(2)} per cycle</strong></div>`;
          h += `<div>${bCyclesPerDay.toFixed(2)} × ${bOutputPerCycle.toFixed(2)} × ${n} = <strong>${boostedResult.unitsPerDay.toFixed(2)} ${priceProduct}/day</strong></div>`;
          h += `<div>${boostedResult.unitsPerDay.toFixed(2)} × ${price.toFixed(6)} = <strong style="color:var(--green)">${boostedSfl.toFixed(4)} ${sflIcon()}/day</strong>`;
          h += ` <span style="color:var(--sunpetal)">(+${delta.toFixed(4)} | +${baseSfl > 0 ? ((delta / baseSfl) * 100).toFixed(0) : "∞"}%)</span></div>`;
        }
      }

      h += `</div>`;
      return h;
    }

    // Get all effects for a specific boost item relevant to a category
    function getEffectsForCategory(boostItem, catId) {
      return boostItem.effects.filter(e => e.cat === catId);
    }

    // Calculate solo + synergy SFL/day for a boost within a category
    function calcBoostValue(boostItem, catId, product, capacity, p2pPrices, allCatBoosts, isOwned) {
      const catEffects = getEffectsForCategory(boostItem, catId);
      if (catEffects.length === 0) return { solo: 0, synergy: 0, roi: Infinity };

      // If this boost is disabled by a stronger owned item, it contributes nothing
      if (boostItem.isDisabled) {
        return { solo: 0, synergy: 0, roi: Infinity, disabled: true, disabledByName: boostItem.disabledByName };
      }

      // Handle free_tool effects (Quarry, Foreman Beaver — zero tool cost)
      const freeToolEffects = catEffects.filter(e => e.type === "free_tool");
      if (freeToolEffects.length > 0) {
        const { exchangeRates, stockMods } = powerState;
        if (["trees", "stone", "iron", "gold", "crimstone", "oil"].includes(catId)) {
          // Savings = entire base tool cost per day (100% reduction)
          const baseCost = calcToolCostPerDay(catId, capacity, exchangeRates, p2pPrices, stockMods, true);
          const solo = baseCost.costPerDay;
          const roi = (boostItem.floor > 0 && solo > 0) ? boostItem.floor / solo : Infinity;
          return { solo, synergy: solo, roi, isFreeTool: true };
        }
        return { solo: 0, synergy: 0, roi: Infinity };
      }

      // Handle cost_reduction effects (e.g., Feller's Discount, Frugal Miner)
      const costEffects = catEffects.filter(e => e.type === "cost_reduction");
      if (costEffects.length > 0) {
        // Cost reduction value = base cost - discounted cost for this category
        const { exchangeRates, stockMods } = powerState;
        if (["trees", "stone", "iron", "gold", "crimstone", "oil"].includes(catId)) {
          // If category already has free tools, cost reduction has no effect
          const hasFreeTools = allCatBoosts.some(b => b.has && !b.isDisabled &&
            getEffectsForCategory(b, catId).some(e => e.type === "free_tool"));
          if (hasFreeTools) {
            return { solo: 0, synergy: 0, roi: Infinity, redundantFreeTool: true };
          }
          const baseCost = calcToolCostPerDay(catId, capacity, exchangeRates, p2pPrices, stockMods, true);
          // Apply only THIS boost's discount
          const discountValue = costEffects[0].value || 0.2;
          const savings = baseCost.costPerDay * discountValue; // 20% of base coin cost portion
          // More precisely: savings = (baseCoins * discountValue / coinsPerSFL) * toolsPerDay
          const toolName = Object.keys(TOOL_TO_CAT).find(t => TOOL_TO_CAT[t] === catId);
          const tool = toolName ? TOOL_COSTS[toolName] : null;
          let solo = 0;
          if (tool && baseCost.toolsPerDay > 0 && exchangeRates.coinsPerSFL > 0) {
            const coinSavingsPerUse = tool.coins * discountValue / exchangeRates.coinsPerSFL;
            solo = coinSavingsPerUse * baseCost.toolsPerDay;
          }
          const roi = (boostItem.floor > 0 && solo > 0) ? boostItem.floor / solo : Infinity;
          return { solo, synergy: solo, roi, isCostReduction: true };
        }
        return { solo: 0, synergy: 0, roi: Infinity };
      }

      // Handle lava_cost_reduction effects (Lava Swimwear — reduce lava pit material cost)
      const lavaCostEffects = catEffects.filter(e => e.type === "lava_cost_reduction");
      if (lavaCostEffects.length > 0 && catId === "obsidian") {
        const { season } = powerState;
        const costMult = lavaCostEffects.reduce((acc, e) => acc * (1 - e.value), 1);
        const baseCost = calcLavaPitCostPerDay(capacity, p2pPrices, season);
        const reducedCost = calcLavaPitCostPerDay(capacity, p2pPrices, season, costMult);
        const savings = baseCost.costPerDay - reducedCost.costPerDay;
        const roi = (boostItem.floor > 0 && savings > 0) ? boostItem.floor / savings : Infinity;
        return { solo: savings, synergy: savings, roi, isLavaCostReduction: true };
      }

      // Handle fruit stump effects (No Axe No Worries, Fruity Woody)
      // Fruit trees: plant → harvest N times → chop stump (1 Axe, yields 1 Wood) → replant
      const fruitStumpWood = catEffects.filter(e => e.type === "fruit_stump_wood");
      const fruitFreeChop = catEffects.filter(e => e.type === "fruit_free_chop");
      if ((fruitStumpWood.length > 0 || fruitFreeChop.length > 0) && catId === "fruits") {
        const { exchangeRates } = powerState;
        const harvestCount = FRUIT_HARVEST_COUNT[product] || 3;
        const growSec = FRUIT_GROW_DATA[product] || 43200;
        const lifecycleSec = harvestCount * growSec;
        const n = getCapacityCount("fruits", capacity);
        const lifecyclesPerDay = n * (86400 / lifecycleSec);
        let stumpValue = 0;
        // Wood gain/loss from stumps
        const woodPrice = p2pPrices["Wood"] || 0;
        for (const eff of fruitStumpWood) {
          stumpValue += lifecyclesPerDay * eff.value * woodPrice;
        }
        // Free chop = saves 1 axe per stump
        if (fruitFreeChop.length > 0 && exchangeRates.coinsPerSFL > 0) {
          const axeTool = TOOL_COSTS["Axe"];
          if (axeTool) {
            const axeSfl = axeTool.coins / exchangeRates.coinsPerSFL;
            stumpValue += lifecyclesPerDay * axeSfl;
          }
        }
        const roi = (boostItem.floor > 0 && stumpValue > 0) ? boostItem.floor / stumpValue : Infinity;
        return { solo: stumpValue, synergy: stumpValue, roi, isFruitStump: true };
      }

      // For animals, sum across all products (including sickness cost savings)
      if (isAnimalCat(catId)) {
        const baseInfo = getAnimalCatSfl(catId, capacity, [], p2pPrices);
        const soloInfo = getAnimalCatSfl(catId, capacity, catEffects, p2pPrices);
        let solo = soloInfo.totalSfl - baseInfo.totalSfl;

        // Add sickness cost savings for sickness-related items
        const hasSicknessEffect = catEffects.some(e => e.type === "sickness_reduction" || e.type === "sickness_prevention");
        if (hasSicknessEffect) {
          const skills = powerState?.farm?.bumpkin?.skills || {};
          const sicknessValue = calcSicknessBoostSavings(boostItem, catId, capacity, p2pPrices, powerState?.boostItems || [], skills);
          solo += sicknessValue;
        }

        const allEffects = [];
        const allEffectsWithout = [];
        for (const b of allCatBoosts) {
          const eff = getEffectsForCategory(b, catId);
          if (b.has && !b.isDisabled) {
            allEffects.push(...eff);
            if (b.name !== boostItem.name) allEffectsWithout.push(...eff);
          }
        }

        let synergy;
        if (isOwned) {
          const withAll = getAnimalCatSfl(catId, capacity, allEffects, p2pPrices);
          const without = getAnimalCatSfl(catId, capacity, allEffectsWithout, p2pPrices);
          synergy = withAll.totalSfl - without.totalSfl;
        } else {
          const ownedEffects = allCatBoosts.filter(b => b.has && !b.isDisabled).flatMap(b => getEffectsForCategory(b, catId));
          const withThis = [...ownedEffects, ...catEffects];
          const withResult = getAnimalCatSfl(catId, capacity, withThis, p2pPrices);
          const ownedResult = getAnimalCatSfl(catId, capacity, ownedEffects, p2pPrices);
          synergy = withResult.totalSfl - ownedResult.totalSfl;
        }

        // Add sickness cost savings to synergy for sickness items
        if (hasSicknessEffect) {
          const skills = powerState?.farm?.bumpkin?.skills || {};
          const sicknessValue = calcSicknessBoostSavings(boostItem, catId, capacity, p2pPrices, powerState?.boostItems || [], skills);
          synergy += sicknessValue;
        }

        const roi = (boostItem.floor > 0 && synergy > 0) ? boostItem.floor / synergy : Infinity;
        return { solo, synergy, roi };
      }

      // Non-animal categories: original logic
      const priceProduct = getPriceProduct(catId, product);
      const baseResult = applyBoosts(catId, product, capacity, []);
      const baseSfl = unitToSfl(baseResult.unitsPerDay, priceProduct, p2pPrices);

      // Solo: just this boost
      const soloResult = applyBoosts(catId, product, capacity, catEffects);
      const soloSfl = unitToSfl(soloResult.unitsPerDay, priceProduct, p2pPrices);
      const solo = soloSfl - baseSfl;

      // Synergy: all owned boosts ± this one
      const allEffects = [];
      const allEffectsWithout = [];
      for (const b of allCatBoosts) {
        const eff = getEffectsForCategory(b, catId);
        if (b.has) {
          allEffects.push(...eff);
          if (b.name !== boostItem.name) allEffectsWithout.push(...eff);
        } else if (b.name === boostItem.name) {
          // For missing boost: add it to "with" set
        }
      }

      let synergy;
      if (isOwned) {
        // Marginal: allOwned - allOwned\this
        const withAll = applyBoosts(catId, product, capacity, allEffects);
        const without = applyBoosts(catId, product, capacity, allEffectsWithout);
        synergy = unitToSfl(withAll.unitsPerDay, priceProduct, p2pPrices) - unitToSfl(without.unitsPerDay, priceProduct, p2pPrices);
      } else {
        // For missing: allOwned∪this - allOwned
        const ownedEffects = allCatBoosts.filter(b => b.has && !b.isDisabled).flatMap(b => getEffectsForCategory(b, catId));
        const withThis = [...ownedEffects, ...catEffects];
        const withResult = applyBoosts(catId, product, capacity, withThis);
        const ownedResult = applyBoosts(catId, product, capacity, ownedEffects);
        synergy = unitToSfl(withResult.unitsPerDay, priceProduct, p2pPrices) - unitToSfl(ownedResult.unitsPerDay, priceProduct, p2pPrices);
      }

      const roi = (boostItem.floor > 0 && synergy > 0) ? boostItem.floor / synergy : Infinity;

      return { solo, synergy, roi };
    }

    // Get the product name used for P2P price lookup
    function getPriceProduct(catId, product) {
      // For flowers, use the seed label
      if (catId === "flowers") {
        const sd = SEED_DATA[product];
        return sd ? sd.label : "Sunpetal";
      }
      return product;
    }

    // localStorage persistence for product selections
    function getSavedPowerProducts() {
      try { return JSON.parse(localStorage.getItem("sfl_power_products") || "{}"); } catch { return {}; }
    }
    function savePowerProduct(catId, product) {
      const saved = getSavedPowerProducts();
      saved[catId] = product;
      localStorage.setItem("sfl_power_products", JSON.stringify(saved));
    }

    // Build formula HTML for expandable detail
    function buildFormulaHTML(boostItem, catId, product, capacity, p2pPrices, allCatBoosts) {
      const catEffects = getEffectsForCategory(boostItem, catId);
      const priceProduct = getPriceProduct(catId, product);
      const price = p2pPrices[priceProduct] || 0;
      const n = getCapacityCount(catId, capacity);
      const baseCycleSec = getCycleSec(catId, product);
      const baseYield = getBaseYield(catId);

      const { skillCostInfo } = powerState;

      let h = `<div class="power-formula pixel-font">`;
      // Header with type and cost
      if (boostItem.type === "Skill") {
        h += `<div style="margin-bottom:6px"><strong>${escHTML(boostItem.name)}</strong> — Skill (${escHTML(boostItem.skillTree)}, Tier ${boostItem.skillTier}, ${boostItem.skillPoints} point${boostItem.skillPoints > 1 ? "s" : ""})`;
        if (boostItem.floor > 0) h += ` | Est. cost: ~${boostItem.floor.toFixed(0)} ${sflIcon()}`;
        h += `</div>`;
      } else {
        h += `<div style="margin-bottom:6px"><strong>${escHTML(boostItem.name)}</strong> — ${escHTML(boostItem.type)}${boostItem.markCost > 0 ? ` | ${(boostItem.markCost/1000).toFixed(0)}k Marks = ${boostItem.floor.toFixed(0)} ${sflIcon()}` : boostItem.floor > 0 ? ` | Floor: ${boostItem.floor.toFixed(1)} ${sflIcon()}` : ""}</div>`;
      }
      h += `<div style="color:var(--green);margin-bottom:6px">${escHTML(boostItem.boost)}</div>`;

      // Disabled state — superseded by stronger item
      if (boostItem.isDisabled) {
        h += `<div style="color:var(--red);margin:8px 0">⛔ This boost is <strong>DISABLED</strong> — superseded by <strong>${escHTML(boostItem.disabledByName)}</strong> which is active on your farm.</div>`;
        h += `</div>`;
        return h;
      }

      // Skill cost breakdown
      if (boostItem.type === "Skill" && skillCostInfo && skillCostInfo.sflPerPoint > 0) {
        const br = skillCostInfo.bestRecipe;
        h += `<hr style="border-color:var(--border-dark);margin:4px 0">`;
        h += `<div style="margin-bottom:2px;color:var(--lily)"><strong>Skill Cost Calculation:</strong></div>`;
        h += `<div>Bumpkin Level: ${skillCostInfo.level} → Total XP: ${(skillCostInfo.totalXP / 1e6).toFixed(1)}M</div>`;
        h += `<div>Best recipe: ${escHTML(br.name)} (base ${br.xp} XP${br.boostedXP !== br.xp ? ` → ${br.boostedXP} XP boosted` : ""} / ${br.cost.toFixed(4)} ${sflIcon()} = ${br.ratio.toFixed(0)} XP/${sflIcon()})</div>`;
        if (skillCostInfo.xpBoostNames?.length) h += `<div>XP boosts applied: ${escHTML(skillCostInfo.xpBoostNames.join(", "))}</div>`;
        h += `<div>Avg cost per level: ${skillCostInfo.sflPerLevel.toFixed(1)} ${sflIcon()} → <strong>1 skill point ≈ ${skillCostInfo.sflPerPoint.toFixed(1)} ${sflIcon()}</strong></div>`;
        h += `<div style="color:var(--sunpetal)">This skill (${boostItem.skillPoints}pt): <strong>${boostItem.skillPoints} × ${skillCostInfo.sflPerPoint.toFixed(1)} = ~${boostItem.floor.toFixed(0)} ${sflIcon()}</strong></div>`;
      }
      h += `<hr style="border-color:var(--border-dark);margin:4px 0">`;

      // Free tool formula (e.g., Quarry, Foreman Beaver)
      const freeToolEffects = catEffects.filter(e => e.type === "free_tool");
      if (freeToolEffects.length > 0 && ["trees", "stone", "iron", "gold", "crimstone", "oil"].includes(catId)) {
        const { exchangeRates, stockMods } = powerState;
        const baseCost = calcToolCostPerDay(catId, capacity, exchangeRates, p2pPrices, stockMods, true);
        h += `<div style="margin-bottom:4px"><strong>Category:</strong> ${catId.toUpperCase()} — ${n} nodes</div>`;
        h += `<div style="color:var(--green)">🆓 <strong>No tool cost!</strong> (mine/chop without tools)</div>`;
        h += `<div>Base tool cost would be: ${baseCost.toolSfl.toFixed(4)} ${sflIcon()} per use</div>`;
        h += `<div>Would use ${(baseCost.toolsPerDay || 0).toFixed(2)} tools/day</div>`;
        h += `<div style="color:var(--green)"><strong>Cost savings: ${baseCost.costPerDay.toFixed(4)} ${sflIcon()}/day</strong></div>`;
        if (boostItem.floor > 0 && baseCost.costPerDay > 0) {
          h += `<div><strong>ROI:</strong> ${boostItem.floor.toFixed(1)} / ${baseCost.costPerDay.toFixed(4)} = <span style="color:var(--sunpetal)">${(boostItem.floor / baseCost.costPerDay).toFixed(0)} days</span></div>`;
        }
        h += `</div>`;
        return h;
      }

      // Cost reduction formula (e.g., Feller's Discount, Frugal Miner)
      const costRedEffects = catEffects.filter(e => e.type === "cost_reduction");
      if (costRedEffects.length > 0 && ["trees", "stone", "iron", "gold", "crimstone", "oil"].includes(catId)) {
        const { exchangeRates, stockMods } = powerState;
        // Check if free tools already active → cost reduction is redundant
        const hasFreeToolsFormula = allCatBoosts.some(b => b.has && !b.isDisabled &&
          getEffectsForCategory(b, catId).some(e => e.type === "free_tool"));
        if (hasFreeToolsFormula) {
          h += `<div style="color:var(--text-dim);margin:8px 0">🆓 <strong>NO EFFECT</strong> — tools in this category are already free (free tool boost active). A cost discount on a free tool saves nothing.</div>`;
          h += `</div>`;
          return h;
        }
        const eff = costRedEffects[0];
        const toolName = Object.keys(TOOL_TO_CAT).find(t => TOOL_TO_CAT[t] === catId);
        const tool = toolName ? TOOL_COSTS[toolName] : null;
        if (tool && exchangeRates.coinsPerSFL > 0) {
          const baseCost = calcToolCostPerDay(catId, capacity, exchangeRates, p2pPrices, stockMods, true);
          const coinSavings = tool.coins * eff.value;
          const sflSavings = coinSavings / exchangeRates.coinsPerSFL;
          const dailySavings = sflSavings * (baseCost.toolsPerDay || 0);
          h += `<div style="margin-bottom:4px"><strong>Category:</strong> ${catId.toUpperCase()} — ${n} nodes, tool: ${escHTML(toolName)}</div>`;
          h += `<div>Base tool coin cost: ${tool.coins} coins = ${(tool.coins / exchangeRates.coinsPerSFL).toFixed(6)} ${sflIcon()}</div>`;
          h += `<div>Discount: -${(eff.value * 100).toFixed(0)}% coin cost → saves ${coinSavings.toFixed(1)} coins = ${sflSavings.toFixed(6)} ${sflIcon()} per use</div>`;
          h += `<div>Tools/day: ${(baseCost.toolsPerDay || 0).toFixed(2)}</div>`;
          h += `<div style="color:var(--green)"><strong>Cost savings: ${sflSavings.toFixed(6)} × ${(baseCost.toolsPerDay || 0).toFixed(2)} = ⬇${dailySavings.toFixed(4)} ${sflIcon()}/day</strong></div>`;
          if (boostItem.floor > 0 && dailySavings > 0) {
            h += `<div><strong>ROI:</strong> ${boostItem.floor.toFixed(1)} / ${dailySavings.toFixed(4)} = <span style="color:var(--sunpetal)">${(boostItem.floor / dailySavings).toFixed(0)} days</span></div>`;
          }
        }
        h += `</div>`;
        return h;
      }

      // Lava pit cost reduction formula (e.g., Lava Swimwear -50% resources)
      const lavaCostFx = catEffects.filter(e => e.type === "lava_cost_reduction");
      if (lavaCostFx.length > 0 && catId === "obsidian") {
        const { season } = powerState;
        const costMult = lavaCostFx.reduce((acc, e) => acc * (1 - e.value), 1);
        const baseCost = calcLavaPitCostPerDay(capacity, p2pPrices, season);
        const reducedCost = calcLavaPitCostPerDay(capacity, p2pPrices, season, costMult);
        const savings = baseCost.costPerDay - reducedCost.costPerDay;
        const seasonName = (season || "?").charAt(0).toUpperCase() + (season || "?").slice(1);
        h += `<div style="margin-bottom:4px"><strong>Category:</strong> OBSIDIAN — ${n} lava pits, season: ${escHTML(seasonName)}</div>`;
        h += `<div>Resource reduction: -${Math.round((1 - costMult) * 100)}% materials per ignition</div>`;
        h += `<div>Base cost/ignition: ${baseCost.costPerIgnition.toFixed(2)} ${sflIcon()}</div>`;
        h += `<div>Reduced cost/ignition: ${reducedCost.costPerIgnition.toFixed(2)} ${sflIcon()}</div>`;
        h += `<div>Ignitions/day: ${(baseCost.ignitionsPerDay || 0).toFixed(2)}</div>`;
        h += `<div style="color:var(--green)"><strong>Cost savings: (${baseCost.costPerIgnition.toFixed(2)} - ${reducedCost.costPerIgnition.toFixed(2)}) × ${(baseCost.ignitionsPerDay || 0).toFixed(2)} = 🌋⬇${savings.toFixed(4)} ${sflIcon()}/day</strong></div>`;
        if (boostItem.floor > 0 && savings > 0) {
          h += `<div><strong>ROI:</strong> ${boostItem.floor.toFixed(1)} / ${savings.toFixed(4)} = <span style="color:var(--sunpetal)">${(boostItem.floor / savings).toFixed(0)} days</span></div>`;
        }
        h += `</div>`;
        return h;
      }

      // Fruit stump formula (No Axe No Worries, Fruity Woody)
      const fruitStumpWoodFx = catEffects.filter(e => e.type === "fruit_stump_wood");
      const fruitFreeChopFx = catEffects.filter(e => e.type === "fruit_free_chop");
      if ((fruitStumpWoodFx.length > 0 || fruitFreeChopFx.length > 0) && catId === "fruits") {
        const { exchangeRates } = powerState;
        const harvestCount = FRUIT_HARVEST_COUNT[product] || 3;
        const growSec = FRUIT_GROW_DATA[product] || 43200;
        const lifecycleSec = harvestCount * growSec;
        const lifecyclesPerDay = n > 0 ? n * (86400 / lifecycleSec) : 0;
        const woodPrice = p2pPrices["Wood"] || 0;

        h += `<div style="margin-bottom:4px"><strong>Category:</strong> FRUITS — ${n} patches, product: ${escHTML(product)}</div>`;
        h += `<div style="margin-bottom:4px"><strong>Fruit lifecycle:</strong> ${harvestCount} harvests × ${formatSec(growSec)} = ${formatSec(lifecycleSec)} per lifecycle</div>`;
        h += `<div style="margin-bottom:4px"><strong>Lifecycles/day:</strong> ${n} patches × (86400 / ${lifecycleSec}) = ${lifecyclesPerDay.toFixed(2)}/day</div>`;

        let totalValue = 0;
        if (fruitStumpWoodFx.length > 0) {
          for (const eff of fruitStumpWoodFx) {
            const woodVal = lifecyclesPerDay * eff.value * woodPrice;
            totalValue += woodVal;
            h += `<div><strong>Wood from stump:</strong> ${eff.value > 0 ? "+" : ""}${eff.value} × ${lifecyclesPerDay.toFixed(2)}/day × ${woodPrice.toFixed(4)} ${sflIcon()}/wood = <span style="color:var(${woodVal >= 0 ? '--green' : '--red'})">${woodVal >= 0 ? '+' : ''}${woodVal.toFixed(4)} ${sflIcon()}/day</span></div>`;
          }
        }
        if (fruitFreeChopFx.length > 0 && exchangeRates.coinsPerSFL > 0) {
          const axeTool = TOOL_COSTS["Axe"];
          if (axeTool) {
            const axeSfl = axeTool.coins / exchangeRates.coinsPerSFL;
            const savings = lifecyclesPerDay * axeSfl;
            totalValue += savings;
            h += `<div><strong>Axe saved:</strong> ${lifecyclesPerDay.toFixed(2)}/day × ${axeSfl.toFixed(4)} ${sflIcon()}/axe = <span style="color:var(--green)">+${savings.toFixed(4)} ${sflIcon()}/day</span></div>`;
          }
        }
        h += `<div style="margin-top:4px;color:var(${totalValue >= 0 ? '--green' : '--red'})"><strong>Net: ${totalValue >= 0 ? '+' : ''}${totalValue.toFixed(4)} ${sflIcon()}/day</strong></div>`;
        if (boostItem.floor > 0 && totalValue > 0) {
          h += `<div><strong>ROI:</strong> ${boostItem.floor.toFixed(1)} / ${totalValue.toFixed(4)} = <span style="color:var(--sunpetal)">${(boostItem.floor / totalValue).toFixed(0)} days</span></div>`;
        } else if (totalValue < 0 && boostItem.floor > 0) {
          h += `<div style="color:var(--red)"><strong>ROI: LOSS</strong> — net value is negative</div>`;
        }
        h += `</div>`;
        return h;
      }

      if (POWER_CATEGORIES[catId]?.quantifiable && n > 0) {
        if (isAnimalCat(catId)) {
          // Animal multi-product formula
          const animal = getAnimalData(catId);
          h += `<div style="margin-bottom:4px"><strong>Farm:</strong> ${n} ${catId} (${formatSec(animal.cycleSec)} cycle) → ${animal.products.join(" + ")}</div>`;

          const baseInfo = getAnimalCatSfl(catId, capacity, [], p2pPrices);
          h += `<div style="margin-bottom:4px"><strong>Base:</strong> ${baseInfo.totalSfl.toFixed(4)} ${sflIcon()}/day (${baseInfo.breakdown.map(bp => `${bp.product}: ${bp.unitsPerDay.toFixed(1)}/day`).join(", ")})</div>`;

          const soloInfo = getAnimalCatSfl(catId, capacity, catEffects, p2pPrices);
          const soloDelta = soloInfo.totalSfl - baseInfo.totalSfl;
          h += `<div style="margin-bottom:4px"><strong>Solo:</strong> ${soloInfo.totalSfl.toFixed(4)} ${sflIcon()}/day (<span style="color:var(--green)">+${soloDelta.toFixed(4)}</span>)</div>`;

          const ownedEffects = allCatBoosts.filter(b => b.has && !b.isDisabled).flatMap(b => getEffectsForCategory(b, catId));
          if (boostItem.has) {
            const allInfo = getAnimalCatSfl(catId, capacity, ownedEffects, p2pPrices);
            const withoutEffects = allCatBoosts.filter(b => b.has && !b.isDisabled && b.name !== boostItem.name).flatMap(b => getEffectsForCategory(b, catId));
            const withoutInfo = getAnimalCatSfl(catId, capacity, withoutEffects, p2pPrices);
            const marginal = allInfo.totalSfl - withoutInfo.totalSfl;
            h += `<div style="margin-bottom:4px"><strong>Marginal (${ownedEffects.length} effects):</strong> <span style="color:var(--green)">+${marginal.toFixed(4)} ${sflIcon()}/day</span></div>`;
            if (boostItem.floor > 0 && marginal > 0) {
              h += `<div><strong>ROI:</strong> ${boostItem.floor.toFixed(1)} / ${marginal.toFixed(4)} = <span style="color:var(--sunpetal)">${(boostItem.floor / marginal).toFixed(0)} days</span></div>`;
            }
          } else {
            const withThis = [...ownedEffects, ...catEffects];
            const withInfo = getAnimalCatSfl(catId, capacity, withThis, p2pPrices);
            const ownedInfo = getAnimalCatSfl(catId, capacity, ownedEffects, p2pPrices);
            const synergy = withInfo.totalSfl - ownedInfo.totalSfl;
            h += `<div style="margin-bottom:4px"><strong>Synergy (with your boosts):</strong> <span style="color:var(--green)">+${synergy.toFixed(4)} ${sflIcon()}/day</span></div>`;
            if (boostItem.floor > 0 && synergy > 0) {
              h += `<div><strong>ROI:</strong> ${boostItem.floor.toFixed(1)} / ${synergy.toFixed(4)} = <span style="color:var(--sunpetal)">${(boostItem.floor / synergy).toFixed(0)} days</span></div>`;
            }
          }
        } else {
          // Non-animal formula (original)
          h += `<div style="margin-bottom:4px"><strong>Farm:</strong> ${n} × ${escHTML(product)} (${formatSec(baseCycleSec)} grow | ${price.toFixed(6)} ${sflIcon()})</div>`;

          const baseResult = applyBoosts(catId, product, capacity, []);
          const baseSfl = unitToSfl(baseResult.unitsPerDay, priceProduct, p2pPrices);
          h += `<div style="margin-bottom:4px"><strong>Base:</strong> ${baseResult.unitsPerDay.toFixed(2)} units/day = ${baseSfl.toFixed(4)} ${sflIcon()}/day</div>`;

          const soloResult = applyBoosts(catId, product, capacity, catEffects);
          const soloSfl = unitToSfl(soloResult.unitsPerDay, priceProduct, p2pPrices);
          const soloDelta = soloSfl - baseSfl;
          h += `<div style="margin-bottom:4px"><strong>Solo:</strong>`;
          if (soloResult.speedMult !== 1) h += ` speed ×${soloResult.speedMult.toFixed(2)}`;
          if (soloResult.yieldMult !== 1) h += ` yield ×${soloResult.yieldMult.toFixed(2)}`;
          if (soloResult.yieldFlat) h += ` +${soloResult.yieldFlat.toFixed(2)}/cycle`;
          h += ` → ${soloSfl.toFixed(4)} ${sflIcon()}/day (<span style="color:var(--green)">+${soloDelta.toFixed(4)}</span>)</div>`;

          const ownedEffects = allCatBoosts.filter(b => b.has && !b.isDisabled).flatMap(b => getEffectsForCategory(b, catId));
          if (boostItem.has) {
            const allResult = applyBoosts(catId, product, capacity, ownedEffects);
            const withoutEffects = allCatBoosts.filter(b => b.has && !b.isDisabled && b.name !== boostItem.name).flatMap(b => getEffectsForCategory(b, catId));
            const withoutResult = applyBoosts(catId, product, capacity, withoutEffects);
            const allSfl = unitToSfl(allResult.unitsPerDay, priceProduct, p2pPrices);
            const withoutSfl = unitToSfl(withoutResult.unitsPerDay, priceProduct, p2pPrices);
            const marginal = allSfl - withoutSfl;
            h += `<div style="margin-bottom:4px"><strong>Marginal (${ownedEffects.length} active effects):</strong> <span style="color:var(--green)">+${marginal.toFixed(4)} ${sflIcon()}/day</span></div>`;
            if (boostItem.floor > 0 && marginal > 0) {
              const roi = boostItem.floor / marginal;
              h += `<div><strong>ROI:</strong> ${boostItem.floor.toFixed(1)} / ${marginal.toFixed(4)} = <span style="color:var(--sunpetal)">${roi.toFixed(0)} days</span></div>`;
            }
          } else {
            const withThis = [...ownedEffects, ...catEffects];
            const withResult = applyBoosts(catId, product, capacity, withThis);
            const ownedResult = applyBoosts(catId, product, capacity, ownedEffects);
            const withSfl = unitToSfl(withResult.unitsPerDay, priceProduct, p2pPrices);
            const ownedSfl = unitToSfl(ownedResult.unitsPerDay, priceProduct, p2pPrices);
            const synergy = withSfl - ownedSfl;
            h += `<div style="margin-bottom:4px"><strong>Synergy (with your boosts):</strong> <span style="color:var(--green)">+${synergy.toFixed(4)} ${sflIcon()}/day</span></div>`;
            if (boostItem.floor > 0 && synergy > 0) {
              const roi = boostItem.floor / synergy;
              h += `<div><strong>ROI:</strong> ${boostItem.floor.toFixed(1)} / ${synergy.toFixed(4)} = <span style="color:var(--sunpetal)">${roi.toFixed(0)} days</span></div>`;
            }
          }
        }
      } else if (n === 0 && POWER_CATEGORIES[catId]?.quantifiable) {
        h += `<div style="color:var(--text-dim)">No capacity detected for this category. Cannot calculate ${sflIcon()}/day.</div>`;
      } else {
        h += `<div style="color:var(--text-dim)">Qualitative boost — cannot calculate ${sflIcon()}/day value.</div>`;
      }

      h += `</div>`;
      return h;
    }

    function formatSec(sec) {
      if (sec < 60) return sec + "s";
      if (sec < 3600) return (sec / 60).toFixed(0) + "m";
      if (sec < 86400) return (sec / 3600).toFixed(1) + "h";
      return (sec / 86400).toFixed(1) + "d";
    }

    // ═══════════════════════════════════════
    //  RENDER: POWER
    // ═══════════════════════════════════════

    // Global state for power page
    let powerState = null;

    async function renderPower(data) {
      const app = document.getElementById("app");
      const { inventory, farm } = data;
      const wardrobe = farm.wardrobe || {};
      const skills = farm.bumpkin?.skills || {};

      let html = `<div class="header pixel-panel pixel-font">
        <h1>POWER ANALYZER</h1>
        <div class="farm-id">Farm #${escHTML(FARM_ID)}</div>
      </div>`;

      html += `<div class="under-dev-banner pixel-font" style="background:linear-gradient(180deg,#3b1768,#2a1050);padding:8px 12px;border:3px solid #000;margin-bottom:16px;text-align:center;font-size: 0.5625rem;color:var(--lily)">
        ⚠️ UNDER DEVELOPMENT ⚠️
        <div style="margin-top:6px;font-size: 0.5rem;color:var(--text-secondary);line-height:1.5">
          All NFT collectibles, wearables & bumpkin skills with production boosts.<br>
          Shows ${sflIcon()}/day value, synergy with your other boosts, ROI payback time, and expandable formulas.<br>
          Organized by category (Crops, Animals, Mining, etc.) with product selectors and Best Buys ranking.
        </div>
      </div>`;

      html += `<div id="power-content"><div class="loading-screen pixel-font" style="padding:20px"><div class="loading-text">Loading boost data...</div></div></div>`;
      app.innerHTML = html;

      // Fetch NFT data + P2P prices + exchange rates in parallel
      let nftData, p2pPrices = {}, exchangeRates = { coinsPerSFL: 320, gemsPerSFL: 0 };
      try {
        const proxyFetch = async (url) => {
          try {
            const resp = await fetch(`/api/proxy?url=${encodeURIComponent(url)}`);
            if (resp.ok) return resp.json();
          } catch {}
          return (await fetch(url)).json();
        };
        const [nftResp, priceResp, rateResp] = await Promise.all([
          proxyFetch("https://sfl.world/api/v1/nfts"),
          proxyFetch("https://sfl.world/api/v1/prices"),
          proxyFetch("https://sfl.world/api/v1.1/exchange").catch(() => null),
        ]);
        nftData = nftResp;
        const priceData = priceResp?.data?.p2p || priceResp?.p2p || {};
        for (const [k, v] of Object.entries(priceData)) {
          p2pPrices[k] = parseFloat(v) || 0;
        }
        // Extract exchange rates for cost calculations
        // Use Betty rate for coins→SFL (more accurate than API exchange rate)
        const betty = computeBettyRate(p2pPrices);
        if (betty.rate > 0) {
          exchangeRates.coinsPerSFL = betty.rate;
          exchangeRates.bettyItem = betty.item;
        }
        if (rateResp) {
          const coinTiers = Object.values(rateResp?.coins || rateResp?.data?.coins || {});
          const gemTiers = Object.values(rateResp?.gems || rateResp?.data?.gems || {});
          // Fallback to API rate if Betty rate failed
          if (!betty.rate && coinTiers.length > 0) {
            const best = coinTiers.reduce((a, b) => (b.coin / b.sfl) > (a.coin / a.sfl) ? b : a);
            exchangeRates.coinsPerSFL = best.coin / best.sfl;
          }
          if (gemTiers.length > 0) {
            const best = gemTiers.reduce((a, b) => (b.gem / (b.sfl * 0.7)) > (a.gem / (a.sfl * 0.7)) ? b : a);
            exchangeRates.gemsPerSFL = best.gem / (best.sfl * 0.7);
          }
        }
      } catch (err) {
        document.getElementById("power-content").innerHTML = `<div class="error-screen pixel-panel pixel-font"><p>Failed to load: ${escHTML(err.message)}</p></div>`;
        return;
      }

      // Detect farm capacity
      const capacity = detectFarmCapacity(farm);

      // Build boost items with parsed effects
      const boostItems = [];

      for (const item of (nftData.collectibles || [])) {
        if (!item.have_boost || !item.name || !item.boost_text) continue;
        const has = getCount(inventory, item.name) > 0 || findCollectible(farm, item.name).length > 0;
        const effects = parseBoostEffects(item.boost_text, item.name);
        const categories = classifyToCategories(effects);
        let floor = parseFloat(item.floor) || 0;
        const markCost = getFactionMarkCost(item.name);
        if (markCost > 0) floor = marksToSfl(markCost);
        boostItems.push({
          name: item.name, type: "Collectible", boost: item.boost_text,
          floor, supply: item.supply || 0,
          has, effects, categories, markCost,
        });
      }

      for (const item of (nftData.wearables || [])) {
        if (!item.have_boost || !item.name || !item.boost_text) continue;
        const has = (wardrobe[item.name] || 0) > 0;
        const effects = parseBoostEffects(item.boost_text, item.name);
        const categories = classifyToCategories(effects);
        let floor = parseFloat(item.floor) || 0;
        const markCost = getFactionMarkCost(item.name);
        if (markCost > 0) floor = marksToSfl(markCost);
        boostItems.push({
          name: item.name, type: "Wearable", boost: item.boost_text,
          floor, supply: item.supply || 0,
          has, effects, categories, markCost,
        });
      }

      // Inject non-NFT boost items (Helios Blacksmith, event decorations, etc.)
      // cost: { coins, materials } → converted to SFL as floor price
      const EXTRA_BOOST_ITEMS = [
        { name: "Gold Beetle", boost: "+0.1 Gold", type: "Collectible", cost: { coins: 10000, materials: { Gold: 20 } } },
        { name: "Stone Beetle", boost: "+0.1 Stone", type: "Collectible", cost: { coins: 1000, materials: { Stone: 20 } } },
        { name: "Iron Beetle", boost: "+0.1 Iron", type: "Collectible", cost: { coins: 2000, materials: { Iron: 20 } } },
        { name: "Gilded Swordfish", boost: "+0.1 Gold", type: "Collectible", cost: null }, // fishing reward, no craft cost
        { name: "Volcano Gnome", boost: "+0.1 Stone, Iron & Gold (Volcano Island)", type: "Collectible", cost: null }, // free (Volcano Island reward)
      ];
      for (const extra of EXTRA_BOOST_ITEMS) {
        if (boostItems.some(b => b.name === extra.name)) continue;
        const has = getCount(inventory, extra.name) > 0 || findCollectible(farm, extra.name).length > 0;
        const effects = parseBoostEffects(extra.boost, extra.name);
        const categories = classifyToCategories(effects);
        // Calculate craft cost in SFL
        let floor = 0;
        if (extra.cost && exchangeRates.coinsPerSFL > 0) {
          floor = (extra.cost.coins || 0) / exchangeRates.coinsPerSFL;
          if (extra.cost.materials) {
            for (const [mat, qty] of Object.entries(extra.cost.materials)) {
              floor += (p2pPrices[mat] || 0) * qty;
            }
          }
        }
        boostItems.push({
          name: extra.name, type: extra.type, boost: extra.boost,
          floor, supply: 0, has, effects, categories, markCost: 0,
        });
      }

      // Add skill boosts from full skill tree
      const skillCostInfo = calcSkillPointCost(farm.bumpkin, p2pPrices, farm);
      for (const [skillName, skill] of Object.entries(SKILL_TREE_DATA)) {
        const has = skills[skillName] !== undefined;
        const boostText = skill.buff + (skill.debuff ? "\n" + skill.debuff : "");
        const effects = parseBoostEffects(boostText);
        // Inject feed reduction effects for named animal skills
        if (SKILL_FEED_EFFECTS[skillName]) {
          for (const [cat, value] of Object.entries(SKILL_FEED_EFFECTS[skillName])) {
            effects.push({ type: "feed_reduction", value, cat });
          }
        }
        const categories = classifyToCategories(effects);
        // Add tree-based categories ONLY for skills the parser couldn't classify (ended up as "other" only)
        const hasOnlyOther = categories.length === 1 && categories[0] === "other";
        if (hasOnlyOther) {
          const TREE_TO_CATS = {
            "Animals": ["chickens", "cows", "sheep"],
            "Crops": ["crops"],
            "Fruit Patch": ["fruits"],
            "Greenhouse": ["greenhouse"],
            "Fishing": ["fishing"],
            "Mining": ["stone", "iron", "gold", "crimstone"],
            "Trees": ["trees"],
            "Bees & Flowers": ["bees", "flowers"],
            "Cooking": ["cooking"],
          };
          const treeCats = TREE_TO_CATS[skill.tree];
          if (treeCats) {
            categories.length = 0; // clear "other"
            categories.push(...treeCats);
          }
        }
        // Skill cost = skill points × SFL per skill point
        const skillFloor = skillCostInfo.sflPerPoint > 0 ? skill.points * skillCostInfo.sflPerPoint : 0;
        boostItems.push({
          name: skillName, type: "Skill", boost: boostText,
          floor: skillFloor, supply: 0, has, effects, categories,
          skillPoints: skill.points, skillTree: skill.tree, skillTier: skill.tier,
          isPower: skill.power || false,
        });
      }

      // Process "Disabled if X Active" — mark items superseded by stronger owned items
      for (const b of boostItems) {
        const disabledByEffects = b.effects.filter(e => e.type === "disabled_by");
        if (disabledByEffects.length > 0) {
          b.disabledBy = disabledByEffects.flatMap(e => e.names);
          b.effects = b.effects.filter(e => e.type !== "disabled_by"); // remove meta-effects
          // Check if any superseding item is active on this farm
          const activeSuperseder = b.disabledBy.find(name =>
            getCount(inventory, name) > 0 || findCollectible(farm, name).length > 0
            || (wardrobe[name] || 0) > 0 || skills[name] !== undefined
          );
          if (activeSuperseder) {
            b.isDisabled = true;
            b.disabledByName = activeSuperseder;
          }
        }
      }

      // Load saved product selections
      const savedProducts = getSavedPowerProducts();

      // Build category → boosts mapping
      const catBoosts = {};
      for (const catId of Object.keys(POWER_CATEGORIES)) {
        catBoosts[catId] = boostItems.filter(b => b.categories.includes(catId));
      }

      // Detect stock modifiers for cost calculations
      const stockMods = detectStockModifiers(farm);

      // Detect current season
      const season = (farm.season?.season || "").toLowerCase();

      // Store state for interactive updates
      powerState = { boostItems, catBoosts, capacity, p2pPrices, savedProducts, farm, skillCostInfo, exchangeRates, stockMods, season };

      // Render
      renderPowerContent();
    }

    // Restock UI event handlers (called from inline onclick/onchange)
    window._setRestockMode = function(mode) {
      const s = getRestockSettings() || getDefaultRestockSettings();
      s.mode = mode;
      // Ensure trigger is valid for the mode
      if (mode === "seeds" && RESTOCK_QUEUE_DEFS[s.trigger]?.group !== "seeds") {
        s.trigger = "crops";
      } else if (mode === "tools" && RESTOCK_QUEUE_DEFS[s.trigger]?.group !== "tools") {
        s.trigger = "Axe";
      }
      saveRestockSettings(s);
      renderPowerContent();
    };
    window._toggleRestockQueue = function(qId, checked) {
      const s = getRestockSettings() || getDefaultRestockSettings();
      if (checked && !s.activeQueues.includes(qId)) s.activeQueues.push(qId);
      if (!checked) s.activeQueues = s.activeQueues.filter(q => q !== qId);
      // If unchecked queue was the trigger, pick first remaining active queue
      if (!checked && s.trigger === qId) {
        s.trigger = s.activeQueues[0] || "crops";
      }
      saveRestockSettings(s);
      renderPowerContent();
    };
    window._setRestockTrigger = function(qId) {
      const s = getRestockSettings() || getDefaultRestockSettings();
      s.trigger = qId;
      // Also ensure the trigger queue is active
      if (!s.activeQueues.includes(qId)) s.activeQueues.push(qId);
      saveRestockSettings(s);
      renderPowerContent();
    };

    function renderPowerContent() {
      const { boostItems, catBoosts, capacity, p2pPrices, savedProducts, exchangeRates, stockMods, season } = powerState;

      const ownedCount = boostItems.filter(b => b.has).length;
      const totalCount = boostItems.length;

      // Derive Oil unit cost from actual drill cost / actual boosted yield
      // Uses farm's real boosts (Infernal Drill = free, yield boosts, speed boosts)
      const oilOwnedEffects = (catBoosts["oil"] || []).filter(b => b.has && !b.isDisabled).flatMap(b => getEffectsForCategory(b, "oil"));
      const oilBoostedResult = applyBoosts("oil", "Oil", capacity, oilOwnedEffects);
      const oilToolInfo = calcToolCostPerDay("oil", capacity, exchangeRates, p2pPrices, stockMods);
      if (oilBoostedResult.unitsPerDay > 0 && oilToolInfo.costPerDay > 0) {
        p2pPrices["Oil"] = oilToolInfo.costPerDay / oilBoostedResult.unitsPerDay;
      } else if (oilBoostedResult.unitsPerDay > 0) {
        p2pPrices["Oil"] = 0; // free drilling (Infernal Drill) → oil is free
      }

      // Calculate total boost value + costs across all quantifiable categories
      let totalBaseSfl = 0, totalBoostedSfl = 0, totalCostSfl = 0;
      const catSummaries = {};
      for (const [catId, catDef] of Object.entries(POWER_CATEGORIES)) {
        if (!catDef.quantifiable) continue;
        const product = savedProducts[catId] || getDefaultProduct(catId);
        const ownedEffects = catBoosts[catId].filter(b => b.has && !b.isDisabled).flatMap(b => getEffectsForCategory(b, catId));

        let baseSfl, boostedSfl, boostedUnitsPerDay = 0;
        let animalBreakdown = null;
        if (isAnimalCat(catId)) {
          const baseInfo = getAnimalCatSfl(catId, capacity, [], p2pPrices);
          const boostedInfo = getAnimalCatSfl(catId, capacity, ownedEffects, p2pPrices);
          baseSfl = baseInfo.totalSfl;
          boostedSfl = boostedInfo.totalSfl;
          animalBreakdown = boostedInfo.breakdown;
        } else {
          const priceProduct = getPriceProduct(catId, product);
          const baseResult = applyBoosts(catId, product, capacity, []);
          baseSfl = unitToSfl(baseResult.unitsPerDay, priceProduct, p2pPrices);
          const boostedResult = applyBoosts(catId, product, capacity, ownedEffects);
          boostedSfl = unitToSfl(boostedResult.unitsPerDay, priceProduct, p2pPrices);
          boostedUnitsPerDay = boostedResult.unitsPerDay;
        }

        // Calculate production costs (with and without discounts)
        let costPerDay = 0, restockPerDay = 0, costDetails = null;
        let baseCostPerDay = 0; // cost WITHOUT skill discounts
        if (catId === "crops" || catId === "fruits" || catId === "greenhouse") {
          const c = calcSeedCostPerDay(catId, product, capacity, exchangeRates, stockMods, ownedEffects, p2pPrices);
          costPerDay = c.costPerDay;
          baseCostPerDay = c.costPerDay; // seeds have no skill discount
          restockPerDay = c.restockPerDay;
          costDetails = c;
        } else if (catId === "obsidian") {
          // Check for lava cost reduction effects (e.g., Lava Swimwear -50%)
          const lavaCostMult = ownedEffects
            .filter(e => e.type === "lava_cost_reduction")
            .reduce((acc, e) => acc * (1 - e.value), 1);
          const c = calcLavaPitCostPerDay(capacity, p2pPrices, season, lavaCostMult);
          const cBase = calcLavaPitCostPerDay(capacity, p2pPrices, season);
          costPerDay = c.costPerDay;
          baseCostPerDay = cBase.costPerDay;
          costDetails = c;
        } else if (["trees", "stone", "iron", "gold", "crimstone", "oil"].includes(catId)) {
          const c = calcToolCostPerDay(catId, capacity, exchangeRates, p2pPrices, stockMods);
          const cBase = calcToolCostPerDay(catId, capacity, exchangeRates, p2pPrices, stockMods, true);
          costPerDay = c.costPerDay;
          baseCostPerDay = cBase.costPerDay;
          restockPerDay = c.restockPerDay;
          costDetails = c;
          costDetails.baseCostPerDay = cBase.costPerDay;
          costDetails.baseToolSfl = cBase.toolSfl;
        } else if (isAnimalCat(catId)) {
          const c = calcAnimalFeedCost(catId, capacity, p2pPrices, ownedEffects, stockMods);
          const cBase = calcAnimalFeedCost(catId, capacity, p2pPrices, [], stockMods);
          // Add sickness cost
          const skills = powerState?.farm?.bumpkin?.skills || {};
          const sc = calcSicknessCost(catId, capacity, p2pPrices, powerState?.boostItems || [], skills);
          const scBase = calcSicknessCost(catId, capacity, p2pPrices, [], {});
          costPerDay = c.costPerDay + sc.costPerDay;
          baseCostPerDay = cBase.costPerDay + scBase.costPerDay;
          costDetails = c;
          costDetails.sicknessCost = sc;
          costDetails.sicknessBaseCost = scBase;
        }
        const totalCatCost = costPerDay + restockPerDay;
        const totalCatBaseCost = baseCostPerDay + restockPerDay;
        totalCostSfl += totalCatCost;

        totalBaseSfl += baseSfl;
        totalBoostedSfl += boostedSfl;
        catSummaries[catId] = { baseSfl, boostedSfl, delta: boostedSfl - baseSfl, product, boostedUnitsPerDay, animalBreakdown, costPerDay: totalCatCost, baseCostPerDay: totalCatBaseCost, costSavings: totalCatBaseCost - totalCatCost, costDetails };
      }

      // ── Shared Restock Calculation ──
      const restockSettings = getRestockSettings() || getDefaultRestockSettings();
      const queueData = buildQueueData(savedProducts, capacity, exchangeRates, stockMods, catBoosts, p2pPrices);
      const restockResult = calcRestockCost(restockSettings, queueData, exchangeRates);
      totalCostSfl += restockResult.restockPerDay;

      const totalDelta = totalBoostedSfl - totalBaseSfl;
      const boostPct = totalBaseSfl > 0 ? ((totalDelta / totalBaseSfl) * 100).toFixed(0) : 0;
      const netBoostedSfl = totalBoostedSfl - totalCostSfl;

      let content = "";

      // Summary
      const { skillCostInfo } = powerState;

      content += `<div class="power-summary pixel-font">
        <div class="power-summary-stat"><div class="power-summary-label">OWNED</div><div class="power-summary-value" style="color:var(--green)">${ownedCount} / ${totalCount}</div></div>
        <div class="power-summary-stat"><div class="power-summary-label">GROSS REVENUE</div><div class="power-summary-value" style="color:var(--sunpetal)">${totalBoostedSfl.toFixed(2)} ${sflIcon()}/day</div></div>
        <div class="power-summary-stat"><div class="power-summary-label">COSTS</div><div class="power-summary-value" style="color:var(--red)">-${totalCostSfl.toFixed(2)} ${sflIcon()}/day</div>${restockResult.restockPerDay > 0 ? `<div style="font-size:0.5rem;color:var(--text-dim)">(incl. restock ${restockResult.restockPerDay.toFixed(4)} — every ${restockResult.restockFrequencyDays.toFixed(1)}d, ${restockResult.gemCost}💎)</div>` : ''}</div>
        <div class="power-summary-stat"><div class="power-summary-label">NET PROFIT</div><div class="power-summary-value" style="color:${netBoostedSfl >= 0 ? 'var(--green)' : 'var(--red)'}">${netBoostedSfl.toFixed(2)} ${sflIcon()}/day</div></div>
        <div class="power-summary-stat"><div class="power-summary-label">BOOST VALUE</div><div class="power-summary-value" style="color:var(--text-secondary)">+${totalDelta.toFixed(2)} ${sflIcon()}/day (+${boostPct}%)</div></div>
      </div>`;

      // Skill cost info panel
      if (skillCostInfo && skillCostInfo.sflPerPoint > 0) {
        const br = skillCostInfo.bestRecipe;
        const hasXpBoosts = skillCostInfo.xpBoostNames && skillCostInfo.xpBoostNames.length > 0;
        content += `<div class="pixel-panel" style="padding:8px 12px;margin-bottom:16px;font-size: 0.5625rem;border:2px solid var(--border-dark)">
          <div class="pixel-font" style="font-size: 0.625rem;color:var(--lily);margin-bottom:6px">🧠 SKILL POINT COST ESTIMATE</div>
          <div style="color:var(--text-secondary);line-height:1.6">
            Bumpkin Lvl <strong>${skillCostInfo.level}</strong> → ${(skillCostInfo.totalXP / 1e6).toFixed(1)}M XP total<br>
            Best recipe: <strong>${escHTML(br.name)}</strong> (${escHTML(br.building)})
            — base ${br.xp} XP${hasXpBoosts ? ` → <span style="color:var(--green)">${br.boostedXP} XP</span> with boosts` : ""}<br>
            ${hasXpBoosts ? `XP boosts: ${escHTML(skillCostInfo.xpBoostNames.join(", "))}<br>` : ""}
            Ingredients: ${Object.entries(br.ingredients).map(([k, v]) => `${v}× ${escHTML(k)}`).join(", ")} = ${br.cost.toFixed(4)} ${sflIcon()}<br>
            Efficiency: <strong>${br.ratio.toFixed(0)} XP/${sflIcon()}</strong> | Total to lvl ${skillCostInfo.level}: ~${(skillCostInfo.totalSFL).toFixed(0)} ${sflIcon()}<br>
            <span style="color:var(--sunpetal);font-weight:bold">1 skill point ≈ ${skillCostInfo.sflPerPoint.toFixed(1)} ${sflIcon()}</span>
            <span style="color:var(--text-dim)"> (${skillCostInfo.sflPerLevel.toFixed(1)} ${sflIcon()}/level avg)</span>
          </div>
        </div>`;
      }

      // Faction Marks info panel
      const marksItems = boostItems.filter(b => b.markCost > 0);
      if (marksItems.length > 0) {
        content += `<div class="pixel-panel" style="padding:8px 12px;margin-bottom:16px;font-size: 0.5625rem;border:2px solid var(--border-dark)">
          <div class="pixel-font" style="font-size: 0.625rem;color:var(--yellow);margin-bottom:6px">⚔️ FACTION MARKS PRICING</div>
          <div style="color:var(--text-secondary);line-height:1.6">
            100 Marks = 1 ${sflIcon()} · ${marksItems.length} faction items detected<br>
            <span style="color:var(--text-dim)">Faction shop items use Marks-derived cost instead of NFT floor price for ROI calculations.</span>
          </div>
        </div>`;
      }

      // Best Buys: top 10 missing boosts by ROI
      const bestBuys = [];
      for (const [catId, catDef] of Object.entries(POWER_CATEGORIES)) {
        if (!catDef.quantifiable) continue;
        const product = savedProducts[catId] || getDefaultProduct(catId);
        const missingInCat = catBoosts[catId].filter(b => !b.has && !b.isDisabled && b.floor > 0);
        for (const b of missingInCat) {
          const val = calcBoostValue(b, catId, product, capacity, p2pPrices, catBoosts[catId], false);
          if (val.synergy > 0.0001) {
            bestBuys.push({ boost: b, catId, catLabel: catDef.label, synergy: val.synergy, roi: val.roi, floor: b.floor });
          }
        }
      }
      bestBuys.sort((a, b) => a.roi - b.roi);
      const top10 = bestBuys.slice(0, 10);

      if (top10.length > 0) {
        content += `<div class="power-best-buys pixel-panel">
          <div class="power-section-header pixel-font" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'block':'none'">
            <span>🏆 TOP 10 BEST BUYS (by ROI)</span>
            <span class="power-toggle-arrow">▼</span>
          </div>
          <div class="power-section-body">`;
        for (let i = 0; i < top10.length; i++) {
          const bb = top10[i];
          const imgUrl = bb.boost.type !== "Skill" ? getItemIcon(bb.boost.name) : "";
          content += `<div class="power-bb-row">
            <span class="power-bb-rank">${i + 1}.</span>
            ${imgUrl ? `<img class="power-bb-img" src="${imgUrl}" onerror="this.style.display='none'" alt="">` : `<span style="width:20px"></span>`}
            <span class="power-bb-name">${escHTML(bb.boost.name)}</span>
            <span class="power-bb-cat">${escHTML(bb.catLabel)}</span>
            <span class="power-bb-sfl">+${bb.synergy.toFixed(2)}/day</span>
            <span class="power-bb-floor">${bb.floor.toFixed(0)} ${sflIcon()}</span>
            <span class="power-bb-roi">${bb.roi.toFixed(0)}d ROI</span>
          </div>`;
        }
        content += `</div></div>`;
      }

      // Quantifiable categories
      content += `<div class="pixel-font" style="font-size: 0.6875rem;color:var(--text-secondary);margin:16px 0 8px;border-bottom:2px solid var(--border-dark);padding-bottom:4px">═══ QUANTIFIABLE CATEGORIES ═══</div>`;

      for (const [catId, catDef] of Object.entries(POWER_CATEGORIES)) {
        if (!catDef.quantifiable) continue;
        const items = catBoosts[catId];
        if (items.length === 0) continue;

        const product = savedProducts[catId] || getDefaultProduct(catId);
        const summary = catSummaries[catId] || { baseSfl: 0, boostedSfl: 0, delta: 0 };
        const n = getCapacityCount(catId, capacity);
        const owned = items.filter(b => b.has);
        const missing = items.filter(b => !b.has);

        content += `<div class="power-category pixel-panel" id="power-cat-${catId}">`;
        // 24h production with product icon
        const prodPerDay = summary.boostedUnitsPerDay || 0;
        // For flowers use seed name for icon; for others use priceProduct
        const iconItem = catId === "flowers" ? product : (!isAnimalCat(catId) ? getPriceProduct(catId, product) : null);
        const mkIcon = (name, size) => `<img src="${getItemIcon(name)}" style="height:${size || '1.4em'};vertical-align:-0.3em" onerror="this.style.display='none'" alt="${name}">`;
        content += `<div class="power-cat-header pixel-font" onclick="togglePowerCategory('${catId}')">
          <span>${catDef.emoji} ${catDef.label}</span>`;

        // Product selector
        if (catDef.selector === "crop") {
          content += `<select class="power-product-select" onchange="selectPowerProduct('${catId}',this.value)" onclick="event.stopPropagation()">`;
          for (const crop of Object.keys(CROP_GROW_DATA)) {
            content += `<option value="${crop}"${crop === product ? " selected" : ""}>${crop}</option>`;
          }
          content += `</select>`;
        } else if (catDef.selector === "fruit") {
          content += `<select class="power-product-select" onchange="selectPowerProduct('${catId}',this.value)" onclick="event.stopPropagation()">`;
          for (const fruit of Object.keys(FRUIT_GROW_DATA)) {
            content += `<option value="${fruit}"${fruit === product ? " selected" : ""}>${fruit}</option>`;
          }
          content += `</select>`;
        } else if (catDef.selector === "greenhouse") {
          content += `<select class="power-product-select" onchange="selectPowerProduct('${catId}',this.value)" onclick="event.stopPropagation()">`;
          for (const item of Object.keys(GREENHOUSE_GROW_DATA)) {
            content += `<option value="${item}"${item === product ? " selected" : ""}>${item}</option>`;
          }
          content += `</select>`;
        } else if (catDef.selector === "flower") {
          content += `<select class="power-product-select" onchange="selectPowerProduct('${catId}',this.value)" onclick="event.stopPropagation()">`;
          for (const seed of Object.keys(SEED_DATA)) {
            content += `<option value="${seed}"${seed === product ? " selected" : ""}>${SEED_DATA[seed].label}</option>`;
          }
          content += `</select>`;
        }

        const catNet = summary.boostedSfl - (summary.costPerDay || 0);
        // Two-line display: line1 = units with product icons, line2 = net SFL/day
        let unitsLine = "";
        if (isAnimalCat(catId) && summary.animalBreakdown && summary.animalBreakdown.length > 0) {
          const parts = summary.animalBreakdown
            .filter(b => b.unitsPerDay > 0)
            .map(b => {
              const u = b.unitsPerDay;
              return `${u % 1 < 0.01 ? u.toFixed(0) : u.toFixed(1)} ${mkIcon(b.product)}`;
            });
          if (parts.length > 0) {
            unitsLine = `<div style="color:var(--sunpetal);font-size:0.5rem">${parts.join(' + ')}</div>`;
          }
        } else if (!isAnimalCat(catId) && catId !== "fishing" && prodPerDay > 0 && iconItem) {
          unitsLine = `<div style="color:var(--sunpetal);font-size:0.5rem">${prodPerDay % 1 < 0.01 ? prodPerDay.toFixed(0) : prodPerDay.toFixed(1)} ${mkIcon(iconItem)}</div>`;
        }
        const sflLine = `<div style="color:${catNet >= 0 ? 'var(--green)' : 'var(--red)'};font-size:0.5rem">${catNet >= 0 ? "+" : ""}${catNet.toFixed(2)}${sflIcon()}/day</div>`;
        content += `<span class="power-cat-sfl">${unitsLine}${sflLine}</span>
          <span class="power-toggle-arrow">▶</span>
        </div>`;

        content += `<div class="power-cat-body">`;
        content += buildProductionBreakdown(catId, product, capacity, p2pPrices, items);

        // Cost breakdown
        if (summary.costDetails && (summary.costPerDay > 0 || summary.costDetails.freeTool || summary.costDetails.isGolden || summary.costSavings > 0)) {
          const cd = summary.costDetails;
          content += `<div style="padding:6px 12px;font-size: 0.5625rem;color:var(--text-secondary);line-height:1.8;border-bottom:1px solid var(--border-dark)">`;
          content += `<div style="color:var(--red);font-size: 0.625rem;margin-bottom:2px"><strong>💰 PRODUCTION COSTS</strong></div>`;
          if (cd.seedSfl !== undefined) {
            const bettyNote = exchangeRates.bettyItem ? ` via Betty/${exchangeRates.bettyItem}` : "";
            const coinCostPerDay = cd.seedSfl * (cd.cyclesPerDay || 0) * getCapacityCount(catId, capacity);
            content += `<div>Seed cost: ${(SEED_COSTS[product] || 0).toFixed(2)} coins = ${cd.seedSfl.toFixed(6)} ${sflIcon()} (${Math.round(exchangeRates.coinsPerSFL)} coins/${sflIcon()}${bettyNote})</div>`;
            content += `<div>Coin cost/day: ${cd.seedSfl.toFixed(6)} × ${(cd.cyclesPerDay || 0).toFixed(2)} cycles × ${getCapacityCount(catId, capacity)} = <strong style="color:var(--red)">${coinCostPerDay.toFixed(4)} ${sflIcon()}/day</strong></div>`;
            if (cd.oilPerSeed > 0) {
              const baseOil = GREENHOUSE_OIL_COSTS[product] || 0;
              const slickNote = stockMods.slickSaver ? ` <span style="color:var(--green)">(Slick Saver: ${baseOil} → ${cd.oilPerSeed})</span>` : "";
              content += `<div>Oil cost: ${cd.oilPerSeed} Oil/seed${slickNote} × ${(p2pPrices["Oil"] || 0).toFixed(6)} ${sflIcon()}/Oil = ${cd.oilSflPerSeed.toFixed(6)} ${sflIcon()}</div>`;
              content += `<div>Oil cost/day: ${cd.oilSflPerSeed.toFixed(6)} × ${(cd.cyclesPerDay || 0).toFixed(2)} × ${getCapacityCount(catId, capacity)} = <strong style="color:var(--red)">${cd.oilCostPerDay.toFixed(4)} ${sflIcon()}/day</strong></div>`;
              content += `<div>Total seed+oil cost/day: <strong style="color:var(--red)">${(cd.costPerDay || 0).toFixed(4)} ${sflIcon()}/day</strong></div>`;
            } else {
              content += `<div>Seed cost/day: <strong style="color:var(--red)">${(cd.costPerDay || 0).toFixed(4)} ${sflIcon()}/day</strong></div>`;
            }
            if (cd.stock > 0) content += `<div>Stock: ${cd.stock} seeds${stockMods.hasWarehouse ? " (Warehouse ×1.2)" : ""} — lasts ${cd.daysUntilEmpty === Infinity ? "∞" : cd.daysUntilEmpty.toFixed(1)} days</div>`;
            if (cd.effectiveHarvests > 1) content += `<div style="color:var(--green)">🍎 Fruit harvests: ${cd.effectiveHarvests}× per seed (1 seed lasts ${cd.effectiveHarvests} cycles)</div>`;
          } else if (cd.freeTool) {
            // Free tool (Quarry / Foreman Beaver) → no tool cost
            content += `<div style="color:var(--green)">🆓 <strong>${cd.freeToolSource}</strong>: No tool cost! (${(cd.toolsPerDay || 0).toFixed(2)} uses/day for free)</div>`;
            if (cd.baseCostPerDay > 0) {
              content += `<div style="color:var(--green)">Saving <strong>${(cd.baseCostPerDay || 0).toFixed(4)} ${sflIcon()}/day</strong> vs base tool cost</div>`;
            }
          } else if (cd.requirements !== undefined) {
            // Lava Pit seasonal material cost
            const seasonName = (cd.season || "?").charAt(0).toUpperCase() + (cd.season || "?").slice(1);
            content += `<div style="margin-bottom:4px">🌋 <strong>Lava Pit</strong> — Season: <strong>${escHTML(seasonName)}</strong>${cd.costMult < 1 ? ` <span style="color:var(--green)">(${Math.round((1 - cd.costMult) * 100)}% resource discount)</span>` : ""}</div>`;
            content += `<div>Cost per ignition: <strong style="color:var(--red)">${cd.costPerIgnition.toFixed(2)} ${sflIcon()}</strong></div>`;
            for (const r of cd.requirements) {
              const qtyLabel = r.baseQty && r.baseQty !== r.qty ? `<s>${r.baseQty}</s> → ${r.qty}` : `${r.qty}`;
              content += `<div style="padding-left:12px">${qtyLabel}× ${escHTML(r.item)} @ ${r.price.toFixed(4)} ${sflIcon()} = ${r.cost.toFixed(4)} ${sflIcon()}</div>`;
            }
            content += `<div>Ignitions/day: ${(cd.ignitionsPerDay || 0).toFixed(2)} (${getCapacityCount("obsidian", capacity)} pits × ${formatSec(RESOURCE_RESPAWN_DATA["Obsidian"].respawnSec)} cycle)</div>`;
            content += `<div>Material cost/day: ${cd.costPerIgnition.toFixed(2)} × ${(cd.ignitionsPerDay || 0).toFixed(2)} = <strong style="color:var(--red)">${(cd.costPerDay || 0).toFixed(4)} ${sflIcon()}/day</strong></div>`;
          } else if (cd.toolSfl !== undefined) {
            // Show BASE cost first, then BOOSTED cost if discount applies
            if (cd.discountSource && cd.baseToolSfl !== undefined) {
              content += `<div>Base tool cost: ${cd.baseToolSfl.toFixed(4)} ${sflIcon()} per use (${cd.baseCoins} coins)</div>`;
              content += `<div>Base cost/day: ${cd.baseToolSfl.toFixed(4)} × ${(cd.toolsPerDay || 0).toFixed(2)} = <strong>${(cd.baseCostPerDay || 0).toFixed(4)} ${sflIcon()}/day</strong></div>`;
              content += `<div style="color:var(--green)">⬇ ${cd.discountSource}: -20% coin cost (<s>${cd.baseCoins}</s> → ${cd.effectiveCoins} coins)</div>`;
              content += `<div>Boosted tool cost: ${cd.toolSfl.toFixed(4)} ${sflIcon()} per use</div>`;
              content += `<div>Boosted cost/day: ${cd.toolSfl.toFixed(4)} × ${(cd.toolsPerDay || 0).toFixed(2)} = <strong style="color:var(--green)">${(cd.costPerDay || 0).toFixed(4)} ${sflIcon()}/day</strong>`;
              const savings = (cd.baseCostPerDay || 0) - (cd.costPerDay || 0);
              if (savings > 0) content += ` <span style="color:var(--green)">(saving ${savings.toFixed(4)} ${sflIcon()}/day)</span>`;
              content += `</div>`;
            } else {
              content += `<div>Tool cost: ${cd.toolSfl.toFixed(4)} ${sflIcon()} per use (${cd.baseCoins} coins)</div>`;
              content += `<div>Tool cost/day: ${cd.toolSfl.toFixed(4)} × ${(cd.toolsPerDay || 0).toFixed(2)} = <strong style="color:var(--red)">${(cd.costPerDay || 0).toFixed(4)} ${sflIcon()}/day</strong></div>`;
            }
            if (cd.stock > 0) content += `<div>Stock: ${cd.stock} tools${stockMods.hasToolshed ? " (Toolshed ×1.5)" : ""} — lasts ${cd.daysUntilEmpty === Infinity ? "∞" : cd.daysUntilEmpty.toFixed(1)} days</div>`;
          } else if (cd.feedBreakdown !== undefined || cd.isGolden) {
            // Animal feed cost display
            if (cd.isGolden) {
              content += `<div style="color:var(--green)">🆓 <strong>${escHTML(cd.goldenItem || "Golden Animal")}</strong>: Animals feed for free!</div>`;
            } else {
              // Level distribution
              if (cd.levelDist) {
                const dist = cd.levelDist;
                const levelParts = Object.entries(dist.levels).sort((a,b) => parseInt(a[0]) - parseInt(b[0])).map(([lvl, cnt]) => `L${lvl}: ${cnt}`);
                content += `<div>Levels: ${levelParts.join(" · ")} (avg L${dist.avgLevel.toFixed(1)})</div>`;
              }
              // Feed breakdown
              const feedItems = Object.entries(cd.feedBreakdown || {});
              for (const [foodName, info] of feedItems) {
                content += `<div style="padding-left:8px">${info.count}× ${escHTML(foodName)}: ${info.totalUnits.toFixed(1)} units × ${info.costPerUnit.toFixed(6)} ${sflIcon()} = ${(info.totalUnits * info.costPerUnit).toFixed(4)} ${sflIcon()}/cycle</div>`;
              }
              if (cd.feedReductionMult !== undefined && cd.feedReductionMult !== 1) {
                const pct = Math.round((1 - cd.feedReductionMult) * 100);
                content += `<div style="color:var(--green)">Feed reduction: ×${cd.feedReductionMult.toFixed(2)} (${pct > 0 ? '-' : '+'}${Math.abs(pct)}%)</div>`;
              }
              content += `<div>Feed cost/day: <strong style="color:var(--red)">${(cd.costPerDay || 0).toFixed(4)} ${sflIcon()}/day</strong> (${cd.animalCount} animals × ${(cd.cyclesPerDay || 0).toFixed(2)} cycles/day)</div>`;
            }
            // Sickness cost display
            if (cd.sicknessCost) {
              const sc = cd.sicknessCost;
              const scBase = cd.sicknessBaseCost;
              content += `<div style="margin-top:6px;padding-top:4px;border-top:1px dashed rgba(92,58,30,0.3)">`;
              if (sc.prevented) {
                content += `<div style="color:var(--green)">\u{1F6E1}\uFE0F Sickness: <strong>PREVENTED</strong> by ${sc.reductions.map(r => escHTML(r.name)).join(", ")}</div>`;
              } else {
                const avgPct = (sc.avgRate * 100).toFixed(1);
                const expectedSick = (sc.totalExpectedSick || 0).toFixed(2);
                content += `<div>\u{1F489} Avg sickness rate: ~${avgPct}%/day (${expectedSick} expected sick/day)</div>`;
                // Per-level breakdown
                const lvlParts = Object.entries(sc.perLevel || {}).sort((a,b) => parseInt(a[0]) - parseInt(b[0])).map(([lvl, d]) => {
                  const pct = (d.baseRate * 100).toFixed(1);
                  return `L${lvl}: ${d.count}\u00d7${pct}%`;
                });
                if (lvlParts.length > 0) {
                  content += `<div style="font-size:0.4375rem;color:var(--text-dim)">${lvlParts.join(" \u00b7 ")}${sc.rateMult < 1 ? ' (\u00d7' + sc.rateMult + ' Healthy Livestock)' : ''}</div>`;
                }
                content += `<div>Barn Delight cost: ${sc.barnDelightSfl.toFixed(4)} ${sflIcon()} (${sc.cureCostMult < 1 ? 'reduced \u00d7' + sc.cureCostMult.toFixed(2) : 'full price'})</div>`;
                content += `<div>Sickness cost/day: <strong style="color:var(--red)">${sc.costPerDay.toFixed(4)} ${sflIcon()}/day</strong></div>`;
                if (sc.reductions.length > 0) {
                  content += `<div style="color:var(--green);font-size:0.4375rem">Active: ${sc.reductions.map(r => r.name + ' (' + r.desc + ')').join(', ')}</div>`;
                }
                if (scBase && scBase.costPerDay > sc.costPerDay) {
                  const saved = scBase.costPerDay - sc.costPerDay;
                  content += `<div style="color:var(--green)">Saving ${saved.toFixed(4)} ${sflIcon()}/day vs no protection</div>`;
                }
              }
              content += `</div>`;
            }
          }
          const netCat = summary.boostedSfl - summary.costPerDay;
          content += `<div style="margin-top:4px"><strong>Net profit: <span style="color:${netCat >= 0 ? 'var(--green)' : 'var(--red)'}">${netCat.toFixed(4)} ${sflIcon()}/day</span></strong> (revenue ${summary.boostedSfl.toFixed(4)} - costs ${summary.costPerDay.toFixed(4)})</div>`;
          content += `</div>`;
        }

        // Owned boosts
        if (owned.length > 0) {
          content += `<div class="power-subsection-label">✅ OWNED (${owned.length})</div>`;
          for (const b of owned) {
            const val = calcBoostValue(b, catId, product, capacity, p2pPrices, items, true);
            content += renderPowerBoostRow(b, catId, product, val, true);
          }
        }

        // Missing boosts
        if (missing.length > 0) {
          const missingWithVal = missing.map(b => {
            const val = calcBoostValue(b, catId, product, capacity, p2pPrices, items, false);
            return { b, val };
          }).sort((a, b) => a.val.roi - b.val.roi);

          content += `<div class="power-subsection-label">❌ MISSING (${missing.length})</div>`;
          for (const { b, val } of missingWithVal) {
            content += renderPowerBoostRow(b, catId, product, val, false);
          }
        }

        content += `</div></div>`; // cat-body, power-category
      }

      // Qualitative categories
      content += `<div class="pixel-font" style="font-size: 0.6875rem;color:var(--text-secondary);margin:16px 0 8px;border-bottom:2px solid var(--border-dark);padding-bottom:4px">═══ QUALITATIVE BOOSTS ═══</div>`;

      for (const [catId, catDef] of Object.entries(POWER_CATEGORIES)) {
        if (catDef.quantifiable) continue;
        const items = catBoosts[catId];
        if (items.length === 0) continue;

        const owned = items.filter(b => b.has);
        const missing = items.filter(b => !b.has);

        content += `<div class="power-category pixel-panel" id="power-cat-${catId}">`;
        content += `<div class="power-cat-header pixel-font" onclick="togglePowerCategory('${catId}')">
          <span>${catDef.emoji} ${catDef.label}</span>
          <span class="power-cat-count">${owned.length}/${items.length} owned</span>
          <span class="power-toggle-arrow">▶</span>
        </div>`;
        content += `<div class="power-cat-body">`;

        if (owned.length > 0) {
          content += `<div class="power-subsection-label">✅ OWNED (${owned.length})</div>`;
          for (const b of owned) {
            content += renderPowerQualRow(b, true);
          }
        }
        if (missing.length > 0) {
          content += `<div class="power-subsection-label">❌ MISSING (${missing.length})</div>`;
          for (const b of missing.sort((a, b) => a.floor - b.floor)) {
            content += renderPowerQualRow(b, false);
          }
        }

        content += `</div></div>`;
      }

      // ── Cost Verification Tables ──
      if (totalCostSfl > 0) {
        content += `<div style="margin-top:16px">
          <div class="pixel-font" style="font-size: 0.6875rem;color:var(--text-secondary);margin-bottom:8px;border-bottom:2px solid var(--border-dark);padding-bottom:4px;cursor:pointer" onclick="document.getElementById('power-cost-tables').style.display=document.getElementById('power-cost-tables').style.display==='none'?'block':'none'">
            ═══ 💰 COST BREAKDOWN TABLES ═══ <span style="font-size: 0.5625rem;color:var(--text-dim)">click to toggle</span>
          </div>
          <div id="power-cost-tables" style="display:none;overflow-x:auto">`;

        // Seed cost table
        const seedCats = ["crops", "fruits", "greenhouse"];
        const seedRows = [];
        for (const catId of seedCats) {
          const product = savedProducts[catId] || getDefaultProduct(catId);
          const growData = catId === "crops" ? CROP_GROW_DATA : catId === "fruits" ? FRUIT_GROW_DATA : GREENHOUSE_GROW_DATA;
          for (const [name, growSec] of Object.entries(growData)) {
            const coinCost = SEED_COSTS[name] || 0;
            const sflCost = exchangeRates.coinsPerSFL > 0 ? coinCost / exchangeRates.coinsPerSFL : 0;
            const seedName = name + " Seed";
            const stock = getEffectiveStock(seedName, stockMods);
            let oilCost = GREENHOUSE_OIL_COSTS[name] || 0;
            if (oilCost > 0 && stockMods.slickSaver) oilCost = Math.max(0, oilCost - 1);
            let harvests = 1;
            if (catId === "fruits") harvests = FRUIT_HARVEST_COUNT[name] || 4;
            seedRows.push({ name, catId, coinCost, sflCost, stock, growSec, oilCost, harvests });
          }
        }

        const bettyLabel = exchangeRates.bettyItem ? ` via ${exchangeRates.bettyItem}` : "";
        content += `<div style="margin-bottom:12px"><div class="pixel-font" style="font-size: 0.5625rem;color:var(--lily);margin-bottom:4px">🌱 SEED COSTS (${Math.round(exchangeRates.coinsPerSFL)} coins/${sflIcon()}${bettyLabel})</div>
          <table style="width:100%;border-collapse:collapse;font-size: 0.5rem;color:var(--text-secondary)">
            <thead><tr style="background:rgba(92,58,30,0.3);text-align:left">
              <th style="padding:3px 6px;border:1px solid var(--border-dark)"></th>
              <th style="padding:3px 6px;border:1px solid var(--border-dark)">Crop</th>
              <th style="padding:3px 6px;border:1px solid var(--border-dark)">Cat</th>
              <th style="padding:3px 6px;border:1px solid var(--border-dark)">Coins</th>
              <th style="padding:3px 6px;border:1px solid var(--border-dark)">Oil</th>
              <th style="padding:3px 6px;border:1px solid var(--border-dark)">${sflIcon()}</th>
              <th style="padding:3px 6px;border:1px solid var(--border-dark)">Stock</th>
              <th style="padding:3px 6px;border:1px solid var(--border-dark)">Grow</th>
              <th style="padding:3px 6px;border:1px solid var(--border-dark)">Harvests</th>
            </tr></thead><tbody>`;
        for (const r of seedRows) {
          const oilCell = r.oilCost > 0 ? `${r.oilCost} 🛢️` : `<span style="color:var(--text-dim)">—</span>`;
          content += `<tr style="border-bottom:1px solid rgba(92,58,30,0.15)">
            <td style="padding:2px 4px;border:1px solid var(--border-dark);text-align:center"><img src="${getItemIcon(r.name)}" style="height:1.2em;vertical-align:-0.2em" loading="lazy"></td>
            <td style="padding:2px 6px;border:1px solid var(--border-dark)">${escHTML(r.name)}</td>
            <td style="padding:2px 6px;border:1px solid var(--border-dark)">${catIcon(r.catId, "1em")}</td>
            <td style="padding:2px 6px;border:1px solid var(--border-dark)">${r.coinCost}</td>
            <td style="padding:2px 6px;border:1px solid var(--border-dark)">${oilCell}</td>
            <td style="padding:2px 6px;border:1px solid var(--border-dark)">${r.sflCost.toFixed(6)}</td>
            <td style="padding:2px 6px;border:1px solid var(--border-dark)">${r.stock}</td>
            <td style="padding:2px 6px;border:1px solid var(--border-dark)">${fmtSec(r.growSec)}</td>
            <td style="padding:2px 6px;border:1px solid var(--border-dark)">${r.harvests > 1 ? r.harvests : `<span style="color:var(--text-dim)">—</span>`}</td>
          </tr>`;
        }
        content += `</tbody></table></div>`;

        // Tool cost table
        content += `<div style="margin-bottom:12px"><div class="pixel-font" style="font-size: 0.5625rem;color:var(--lily);margin-bottom:4px">⛏️ TOOL COSTS</div>
          <table style="width:100%;border-collapse:collapse;font-size: 0.5rem;color:var(--text-secondary)">
            <thead><tr style="background:rgba(92,58,30,0.3);text-align:left">
              <th style="padding:3px 6px;border:1px solid var(--border-dark)"></th>
              <th style="padding:3px 6px;border:1px solid var(--border-dark)">Tool</th>
              <th style="padding:3px 6px;border:1px solid var(--border-dark)">For</th>
              <th style="padding:3px 6px;border:1px solid var(--border-dark)">Coins</th>
              <th style="padding:3px 6px;border:1px solid var(--border-dark)">Discount</th>
              <th style="padding:3px 6px;border:1px solid var(--border-dark)">Materials</th>
              <th style="padding:3px 6px;border:1px solid var(--border-dark)">Total ${sflIcon()}</th>
              <th style="padding:3px 6px;border:1px solid var(--border-dark)">Stock</th>
            </tr></thead><tbody>`;
        for (const [toolName, tool] of Object.entries(TOOL_COSTS)) {
          const catId = TOOL_TO_CAT[toolName] || "—";
          // Apply coin discounts
          let coinDiscount = 0, discountLabel = "";
          if (toolName === "Axe" && stockMods.fellersDiscount) {
            coinDiscount = 0.2; discountLabel = "-20% Feller's Discount";
          } else if (toolName !== "Axe" && toolName !== "Oil Drill" && stockMods.frugalMiner) {
            coinDiscount = 0.2; discountLabel = "-20% Frugal Miner";
          }
          const effectiveCoins = tool.coins * (1 - coinDiscount);
          let toolSfl = exchangeRates.coinsPerSFL > 0 ? effectiveCoins / exchangeRates.coinsPerSFL : 0;
          const mats = [];
          // Oil Rig skill: Oil Drill uses Wool×20 instead of Leather×10
          let effectiveMats = tool.materials;
          if (toolName === "Oil Drill" && stockMods.oilRigActive && tool.materials) {
            effectiveMats = { ...tool.materials };
            delete effectiveMats["Leather"];
            effectiveMats["Wool"] = 20;
            discountLabel = discountLabel || "Oil Rig (Wool)";
          }
          if (effectiveMats) {
            for (const [mat, qty] of Object.entries(effectiveMats)) {
              const matSfl = (p2pPrices[mat] || 0) * qty;
              toolSfl += matSfl;
              mats.push(`${qty}× <img src="${getItemIcon(mat)}" style="height:1em;vertical-align:-0.15em" loading="lazy"> ${mat}`);
            }
          }
          const stock = getEffectiveStock(toolName, stockMods);
          const coinsCell = coinDiscount > 0
            ? `<s style="color:var(--text-dim)">${tool.coins}</s> → ${effectiveCoins}`
            : `${tool.coins}`;
          const discountCell = discountLabel
            ? `<span style="color:var(--green);font-size:0.4375rem">${discountLabel}</span>`
            : `<span style="color:var(--text-dim)">—</span>`;
          content += `<tr style="border-bottom:1px solid rgba(92,58,30,0.15)">
            <td style="padding:2px 4px;border:1px solid var(--border-dark);text-align:center"><img src="${getItemIcon(toolName)}" style="height:1.2em;vertical-align:-0.2em" loading="lazy"></td>
            <td style="padding:2px 6px;border:1px solid var(--border-dark)">${escHTML(toolName)}</td>
            <td style="padding:2px 6px;border:1px solid var(--border-dark)">${typeof catId === "string" && catId !== "—" ? catIcon(catId, "1em") : "—"}</td>
            <td style="padding:2px 6px;border:1px solid var(--border-dark)">${coinsCell}</td>
            <td style="padding:2px 6px;border:1px solid var(--border-dark)">${discountCell}</td>
            <td style="padding:2px 6px;border:1px solid var(--border-dark)">${mats.join(", ") || "—"}</td>
            <td style="padding:2px 6px;border:1px solid var(--border-dark)">${toolSfl.toFixed(4)}</td>
            <td style="padding:2px 6px;border:1px solid var(--border-dark)">${stock}</td>
          </tr>`;
        }
        content += `</tbody></table></div>`;

        // Lava Pit requirements table
        if (capacity.lavaPits > 0) {
          const seasonName = season ? season.charAt(0).toUpperCase() + season.slice(1) : "Unknown";
          content += `<div style="margin-bottom:12px"><div class="pixel-font" style="font-size: 0.5625rem;color:var(--lily);margin-bottom:4px">🌋 LAVA PIT REQUIREMENTS — ${escHTML(seasonName)} Season (${capacity.lavaPits} pits)</div>
            <table style="width:100%;border-collapse:collapse;font-size: 0.5rem;color:var(--text-secondary)">
              <thead><tr style="background:rgba(92,58,30,0.3);text-align:left">
                <th style="padding:3px 6px;border:1px solid var(--border-dark)">Season</th>
                <th style="padding:3px 6px;border:1px solid var(--border-dark)">Material</th>
                <th style="padding:3px 6px;border:1px solid var(--border-dark)">Qty</th>
                <th style="padding:3px 6px;border:1px solid var(--border-dark)">P2P Price</th>
                <th style="padding:3px 6px;border:1px solid var(--border-dark)">Cost</th>
              </tr></thead><tbody>`;
          for (const [szn, reqs] of Object.entries(LAVA_PIT_REQUIREMENTS)) {
            const isCurrent = szn === season;
            let sznTotal = 0;
            for (let i = 0; i < reqs.length; i++) {
              const r = reqs[i];
              const price = p2pPrices[r.item] || 0;
              const cost = price * r.qty;
              sznTotal += cost;
              content += `<tr style="border-bottom:1px solid rgba(92,58,30,0.15);${isCurrent ? 'background:rgba(46,204,113,0.08)' : ''}">
                ${i === 0 ? `<td style="padding:2px 6px;border:1px solid var(--border-dark);font-weight:bold;vertical-align:top" rowspan="${reqs.length + 1}">${szn.charAt(0).toUpperCase() + szn.slice(1)}${isCurrent ? ' 🔥' : ''}</td>` : ''}
                <td style="padding:2px 6px;border:1px solid var(--border-dark)"><img src="${getItemIcon(r.item)}" style="height:1.2em;vertical-align:-0.2em" loading="lazy"> ${escHTML(r.item)}</td>
                <td style="padding:2px 6px;border:1px solid var(--border-dark);text-align:right">${r.qty}</td>
                <td style="padding:2px 6px;border:1px solid var(--border-dark);text-align:right">${price.toFixed(4)}</td>
                <td style="padding:2px 6px;border:1px solid var(--border-dark);text-align:right">${cost.toFixed(4)}</td>
              </tr>`;
            }
            content += `<tr style="border-bottom:2px solid var(--border-dark);${isCurrent ? 'background:rgba(46,204,113,0.08)' : ''}">
              <td colspan="3" style="padding:2px 6px;border:1px solid var(--border-dark);text-align:right;font-weight:bold">Total per ignition:</td>
              <td style="padding:2px 6px;border:1px solid var(--border-dark);text-align:right;font-weight:bold;color:${isCurrent ? 'var(--green)' : 'var(--text-secondary)'}">${sznTotal.toFixed(2)} ${sflIcon()}</td>
            </tr>`;
          }
          content += `</tbody></table></div>`;
        }

        // ── Animal Feed Cost Table ──
        const animalCats = ["chickens", "cows", "sheep"];
        const animalFeedRows = animalCats.filter(c => (capacity.animalDetails?.[c] || []).length > 0);
        if (animalFeedRows.length > 0) {
          content += `<div style="margin-bottom:12px"><div class="pixel-font" style="font-size: 0.5625rem;color:var(--lily);margin-bottom:4px">🐾 ANIMAL FEED COSTS</div>
            <table style="width:100%;border-collapse:collapse;font-size: 0.5rem;color:var(--text-secondary)">
              <thead><tr style="background:rgba(92,58,30,0.3);text-align:left">
                <th style="padding:3px 6px;border:1px solid var(--border-dark)"></th>
                <th style="padding:3px 6px;border:1px solid var(--border-dark)">Animal</th>
                <th style="padding:3px 6px;border:1px solid var(--border-dark)">Qty</th>
                <th style="padding:3px 6px;border:1px solid var(--border-dark)">Avg Lvl</th>
                <th style="padding:3px 6px;border:1px solid var(--border-dark)">Feed/animal</th>
                <th style="padding:3px 6px;border:1px solid var(--border-dark)">Cost/feed</th>
                <th style="padding:3px 6px;border:1px solid var(--border-dark)">Feed ${sflIcon()}/d</th>
                <th style="padding:3px 6px;border:1px solid var(--border-dark)">\u{1F489} Sick ${sflIcon()}/d</th>
                <th style="padding:3px 6px;border:1px solid var(--border-dark)">Total ${sflIcon()}/d</th>
              </tr></thead><tbody>`;
          const animalEmoji = { chickens: "🐔", cows: "🐄", sheep: "🐑" };
          for (const catId of animalFeedRows) {
            const animalType = ANIMAL_CAT_MAP[catId];
            const animals = capacity.animalDetails[catId];
            const dist = getAnimalLevelDistribution(animals);
            const ownedEffects = (catBoosts[catId] || []).filter(b => b.has && !b.isDisabled).flatMap(b => getEffectsForCategory(b, catId));
            const fc = calcAnimalFeedCost(catId, capacity, p2pPrices, ownedEffects, stockMods);
            const isGolden = fc.isGolden;
            const feedNames = Object.keys(fc.feedBreakdown || {}).join(", ") || "—";
            const avgCostPerFeed = fc.feedBreakdown ? Object.values(fc.feedBreakdown).reduce((s, f) => s + f.costPerUnit * f.totalUnits, 0) / Math.max(1, animals.length) : 0;
            content += `<tr style="border-bottom:1px solid rgba(92,58,30,0.15)">
              <td style="padding:2px 4px;border:1px solid var(--border-dark);text-align:center">${animalEmoji[catId] || ""}</td>
              <td style="padding:2px 6px;border:1px solid var(--border-dark)">${escHTML(animalType)}</td>
              <td style="padding:2px 6px;border:1px solid var(--border-dark)">${animals.length}</td>
              <td style="padding:2px 6px;border:1px solid var(--border-dark)">L${dist.avgLevel.toFixed(1)}</td>
              <td style="padding:2px 6px;border:1px solid var(--border-dark)">${isGolden ? `<span style="color:var(--green)">FREE</span>` : `${fc.baseFeedQty || 0}× ${feedNames}`}</td>
              <td style="padding:2px 6px;border:1px solid var(--border-dark)">${isGolden ? "—" : avgCostPerFeed.toFixed(4)}</td>
              <td style="padding:2px 6px;border:1px solid var(--border-dark)">${fc.costPerDay.toFixed(4)}</td>`;
            // Sickness cost column
            const skills_t = powerState?.farm?.bumpkin?.skills || {};
            const sc_t = calcSicknessCost(catId, capacity, p2pPrices, powerState?.boostItems || [], skills_t);
            const totalAnimalCost = fc.costPerDay + sc_t.costPerDay;
            if (sc_t.prevented) {
              content += `<td style="padding:2px 6px;border:1px solid var(--border-dark);color:var(--green)">\u{1F6E1}\uFE0F 0</td>`;
            } else {
              content += `<td style="padding:2px 6px;border:1px solid var(--border-dark);color:var(--red)">${sc_t.costPerDay.toFixed(4)}</td>`;
            }
            content += `<td style="padding:2px 6px;border:1px solid var(--border-dark);font-weight:bold;color:var(--red)">${totalAnimalCost.toFixed(4)}</td>
            </tr>`;
          }
          content += `</tbody></table></div>`;
        }

        // ── Restock Settings UI ──
        content += `<div style="margin-top:12px;margin-bottom:12px">
          <div class="pixel-font" style="font-size: 0.625rem;color:var(--lily);margin-bottom:6px">⚙️ RESTOCK SETTINGS</div>
          <div style="margin-bottom:8px;display:flex;gap:4px;flex-wrap:wrap">`;
        const modes = [
          { id: "off", label: "Off", cost: "" },
          { id: "seeds", label: "Seeds", cost: `${RESTOCK_GEM_COSTS.seeds}💎` },
          { id: "tools", label: "Tools", cost: `${RESTOCK_GEM_COSTS.tools}💎` },
          { id: "both", label: "Both", cost: `${RESTOCK_GEM_COSTS.both}💎` },
        ];
        for (const m of modes) {
          const active = restockSettings.mode === m.id;
          content += `<button onclick="window._setRestockMode('${m.id}')" class="pixel-font" style="padding:3px 10px;font-size:0.5rem;border:2px solid ${active ? 'var(--sunpetal)' : 'var(--border-dark)'};background:${active ? 'rgba(255,200,50,0.2)' : 'rgba(92,58,30,0.15)'};color:${active ? 'var(--sunpetal)' : 'var(--text-secondary)'};border-radius:4px;cursor:pointer">${m.label}${m.cost ? ' ' + m.cost : ''}</button>`;
        }
        content += `</div>`;

        if (restockSettings.mode !== "off") {
          content += `<div style="font-size:0.4375rem;color:var(--text-dim);margin-bottom:8px;line-height:1.5;max-width:500px">
            ℹ️ Restock buys <strong>ALL</strong> seeds (${RESTOCK_GEM_COSTS.seeds}💎) or ALL tools (${RESTOCK_GEM_COSTS.tools}💎) at once — you can't restock individual items.
            Pick which items you use, and which one triggers the restock.
            When the trigger runs out → restock everything in that group.
            Unused queues get restocked for free as a side effect.
          </div>`;

          // Seed queues table
          const seedQueueIds = Object.keys(RESTOCK_QUEUE_DEFS).filter(q => RESTOCK_QUEUE_DEFS[q].group === "seeds");
          const toolQueueIds = Object.keys(RESTOCK_QUEUE_DEFS).filter(q => RESTOCK_QUEUE_DEFS[q].group === "tools");
          const showSeeds = restockSettings.mode === "seeds" || restockSettings.mode === "both";
          const showTools = restockSettings.mode === "tools" || restockSettings.mode === "both";

          if (showSeeds) {
            content += `<div class="pixel-font" style="font-size:0.5rem;color:var(--lily);margin-bottom:4px">🌱 SEED QUEUES</div>
              <table style="width:100%;border-collapse:collapse;font-size:0.5rem;color:var(--text-secondary);margin-bottom:8px">
                <thead><tr style="background:rgba(92,58,30,0.3);text-align:left">
                  <th style="padding:2px 4px;border:1px solid var(--border-dark)">Use</th>
                  <th style="padding:2px 6px;border:1px solid var(--border-dark)">Queue</th>
                  <th style="padding:2px 6px;border:1px solid var(--border-dark)">Stock</th>
                  <th style="padding:2px 6px;border:1px solid var(--border-dark)">Use/day</th>
                  <th style="padding:2px 6px;border:1px solid var(--border-dark)">Days</th>
                  <th style="padding:2px 4px;border:1px solid var(--border-dark)">Trigger</th>
                </tr></thead><tbody>`;
            for (const qId of seedQueueIds) {
              const q = queueData[qId];
              const isActive = restockSettings.activeQueues.includes(qId);
              const isTrigger = restockSettings.trigger === qId;
              const daysStr = q.daysUntilEmpty === Infinity ? "∞" : q.daysUntilEmpty.toFixed(1);
              const daysStyle = isTrigger ? "color:var(--sunpetal);font-weight:bold" : "";
              const dimStyle = !isActive ? "opacity:0.4" : "";
              content += `<tr style="border-bottom:1px solid rgba(92,58,30,0.15);${dimStyle}">
                <td style="padding:2px 4px;border:1px solid var(--border-dark);text-align:center"><input type="checkbox" ${isActive ? "checked" : ""} onchange="window._toggleRestockQueue('${qId}', this.checked)"></td>
                <td style="padding:2px 6px;border:1px solid var(--border-dark)">${escHTML(q.label)}</td>
                <td style="padding:2px 6px;border:1px solid var(--border-dark)">${q.stock}</td>
                <td style="padding:2px 6px;border:1px solid var(--border-dark)">${q.usePerDay.toFixed(2)}</td>
                <td style="padding:2px 6px;border:1px solid var(--border-dark);${daysStyle}">${daysStr}</td>
                <td style="padding:2px 4px;border:1px solid var(--border-dark);text-align:center"><input type="radio" name="restock-trigger" ${isTrigger ? "checked" : ""} onchange="window._setRestockTrigger('${qId}')"></td>
              </tr>`;
            }
            content += `</tbody></table>`;
          }

          if (showTools) {
            content += `<div class="pixel-font" style="font-size:0.5rem;color:var(--lily);margin-bottom:4px">⛏️ TOOL QUEUES</div>
              <table style="width:100%;border-collapse:collapse;font-size:0.5rem;color:var(--text-secondary);margin-bottom:8px">
                <thead><tr style="background:rgba(92,58,30,0.3);text-align:left">
                  <th style="padding:2px 4px;border:1px solid var(--border-dark)">Use</th>
                  <th style="padding:2px 6px;border:1px solid var(--border-dark)">Queue</th>
                  <th style="padding:2px 6px;border:1px solid var(--border-dark)">Stock</th>
                  <th style="padding:2px 6px;border:1px solid var(--border-dark)">Use/day</th>
                  <th style="padding:2px 6px;border:1px solid var(--border-dark)">Days</th>
                  <th style="padding:2px 4px;border:1px solid var(--border-dark)">Trigger</th>
                </tr></thead><tbody>`;
            for (const qId of toolQueueIds) {
              const q = queueData[qId];
              const isActive = restockSettings.activeQueues.includes(qId);
              const isTrigger = restockSettings.trigger === qId;
              const daysStr = q.daysUntilEmpty === Infinity ? "∞" : q.daysUntilEmpty.toFixed(1);
              const daysStyle = isTrigger ? "color:var(--sunpetal);font-weight:bold" : "";
              const dimStyle = !isActive ? "opacity:0.4" : "";
              const freeNote = q.freeTool ? ` <span style="color:var(--green);font-size:0.4375rem">(free)</span>` : "";
              content += `<tr style="border-bottom:1px solid rgba(92,58,30,0.15);${dimStyle}">
                <td style="padding:2px 4px;border:1px solid var(--border-dark);text-align:center"><input type="checkbox" ${isActive ? "checked" : ""} onchange="window._toggleRestockQueue('${qId}', this.checked)"></td>
                <td style="padding:2px 6px;border:1px solid var(--border-dark)">${escHTML(q.label)}${freeNote}</td>
                <td style="padding:2px 6px;border:1px solid var(--border-dark)">${q.stock}</td>
                <td style="padding:2px 6px;border:1px solid var(--border-dark)">${q.usePerDay.toFixed(2)}</td>
                <td style="padding:2px 6px;border:1px solid var(--border-dark);${daysStyle}">${daysStr}</td>
                <td style="padding:2px 4px;border:1px solid var(--border-dark);text-align:center"><input type="radio" name="restock-trigger" ${isTrigger ? "checked" : ""} onchange="window._setRestockTrigger('${qId}')"></td>
              </tr>`;
            }
            content += `</tbody></table>`;
          }

          // Restock summary line
          if (restockResult.restockPerDay > 0) {
            content += `<div class="pixel-font" style="font-size:0.5rem;color:var(--sunpetal);margin-bottom:4px">
              Restock every <strong>${restockResult.restockFrequencyDays.toFixed(1)} days</strong> (${escHTML(restockResult.triggerQueue)} trigger) → <strong>${restockResult.restockPerDay.toFixed(4)} ${sflIcon()}/day</strong> (${restockResult.gemCost}💎 = ${restockResult.restockSfl.toFixed(4)} ${sflIcon()})
            </div>`;
          } else {
            content += `<div class="pixel-font" style="font-size:0.5rem;color:var(--text-dim);margin-bottom:4px">
              No restock cost — trigger queue has infinite duration or no consumption.
            </div>`;
          }
        }

        content += `</div>`;

        // Skill discounts + stock modifiers info
        content += `<div class="pixel-font" style="font-size: 0.5rem;color:var(--text-dim);line-height:1.6">
          ${stockMods.hasWarehouse ? "✅ Warehouse (+20% seed stock)" : "❌ No Warehouse"} ·
          ${stockMods.hasToolshed ? "✅ Toolshed (+50% tool stock)" : "❌ No Toolshed"} ·
          ${stockMods.moreAxes ? "✅ More Axes" : ""} ${stockMods.morePicks ? "✅ More Picks" : ""}<br>
          ${stockMods.fellersDiscount ? "✅ Feller's Discount (-20% axe coin cost)" : "❌ No Feller's Discount"} ·
          ${stockMods.frugalMiner ? "✅ Frugal Miner (-20% pickaxe coin cost)" : "❌ No Frugal Miner"}
        </div>`;

        content += `</div></div>`;
      }

      // ── BUDS SECTION ──
      // ── DEBUG: All Boosts Mapping Table ──
      content += `<div style="margin-top:16px">
        <div class="pixel-font" style="font-size: 0.6875rem;color:var(--text-secondary);margin-bottom:8px;border-bottom:2px solid var(--border-dark);padding-bottom:4px;cursor:pointer" onclick="document.getElementById('power-debug-table').style.display=document.getElementById('power-debug-table').style.display==='none'?'block':'none'">
          ═══ 🔍 ALL BOOSTS DEBUG TABLE (${boostItems.length}) ═══ <span style="font-size: 0.5625rem;color:var(--text-dim)">click to toggle</span>
        </div>
        <div id="power-debug-table" style="display:none;overflow-x:auto">
          <table style="width:100%;border-collapse:collapse;font-size: 0.5rem;color:var(--text-secondary)">
            <thead>
              <tr style="background:rgba(92,58,30,0.3);text-align:left">
                <th style="padding:4px 6px;border:1px solid var(--border-dark);min-width:100px">Name</th>
                <th style="padding:4px 6px;border:1px solid var(--border-dark);min-width:55px">Type</th>
                <th style="padding:4px 6px;border:1px solid var(--border-dark)">Own</th>
                <th style="padding:4px 6px;border:1px solid var(--border-dark);min-width:140px">Boost Text</th>
                <th style="padding:4px 6px;border:1px solid var(--border-dark);min-width:65px">Categories</th>
                <th style="padding:4px 6px;border:1px solid var(--border-dark);min-width:180px">Parsed Effects</th>
              </tr>
            </thead>
            <tbody>`;

      const sortedBoosts = [...boostItems].sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));
      for (const b of sortedBoosts) {
        const ownIcon = b.has ? "✅" : "❌";
        const effectsDesc = b.effects.map(e => {
          if (e.type === "qualitative") return `<span style="color:var(--text-dim)">qualitative: ${escHTML(e.raw || "?")}</span>`;
          let desc = `<span style="color:var(--lily)">${e.type}</span>`;
          if (e.value !== undefined) desc += ` <strong>${e.value > 0 ? "+" : ""}${e.value}</strong>`;
          if (e.pct !== undefined) desc += ` ${e.pct}%`;
          if (e.extra !== undefined) desc += ` +${e.extra}`;
          if (e.product) desc += ` <span style="color:var(--sunpetal)">${escHTML(e.product)}</span>`;
          if (e.cropTier) desc += ` <span style="color:var(--text-dim)">[${e.cropTier}]</span>`;
          if (e.conditional) desc += ` <span style="color:var(--text-dim)">(${escHTML(e.conditional)})</span>`;
          if (e.tool) desc += ` <span style="color:var(--text-dim)">[tool:${escHTML(e.tool)}]</span>`;
          desc += ` → <span style="color:var(--green)">${e.cat || "?"}</span>`;
          return desc;
        }).join("<br>");
        const catBadges = b.categories.map(c => `<span style="background:rgba(92,58,30,0.3);padding:1px 4px;border-radius:3px;margin:1px">${c}</span>`).join(" ");

        content += `<tr style="border-bottom:1px solid rgba(92,58,30,0.15)">
          <td style="padding:3px 6px;border:1px solid var(--border-dark);font-weight:bold">${escHTML(b.name)}</td>
          <td style="padding:3px 6px;border:1px solid var(--border-dark)">${b.type}${b.skillTree ? ` (${b.skillTree})` : ""}</td>
          <td style="padding:3px 6px;border:1px solid var(--border-dark);text-align:center">${ownIcon}</td>
          <td style="padding:3px 6px;border:1px solid var(--border-dark);white-space:pre-wrap">${escHTML(b.boost)}</td>
          <td style="padding:3px 6px;border:1px solid var(--border-dark)">${catBadges}</td>
          <td style="padding:3px 6px;border:1px solid var(--border-dark)">${effectsDesc || "<em>none</em>"}</td>
        </tr>`;
      }

      content += `</tbody></table></div></div>`;

      content += `<div class="footer" style="margin-top:16px">
        <button class="refresh-btn" onclick="refresh()">REFRESH</button>
        <div class="timestamp pixel-font">Updated: ${new Date().toLocaleTimeString("cs-CZ")}</div>
      </div>`;

      // Save open/closed state of collapsible sections before re-render
      const openCats = new Set();
      document.querySelectorAll(".power-category").forEach(cat => {
        const body = cat.querySelector(".power-cat-body");
        if (body && body.style.display === "block") {
          const id = cat.id?.replace("power-cat-", "");
          if (id) openCats.add(id);
        }
      });
      const costTablesOpen = document.getElementById("power-cost-tables")?.style.display === "block";
      const debugTableOpen = document.getElementById("power-debug-table")?.style.display === "block";
      const bestBuysBody = document.querySelector(".power-best-buys .power-section-body");
      const bestBuysOpen = bestBuysBody?.style.display === "block";

      document.getElementById("power-content").innerHTML = content;

      // Restore open/closed state after re-render
      openCats.forEach(catId => {
        const cat = document.getElementById("power-cat-" + catId);
        if (!cat) return;
        const body = cat.querySelector(".power-cat-body");
        const arrow = cat.querySelector(".power-toggle-arrow");
        if (body) body.style.display = "block";
        if (arrow) arrow.textContent = "▼";
      });
      if (costTablesOpen) {
        const el = document.getElementById("power-cost-tables");
        if (el) el.style.display = "block";
      }
      if (debugTableOpen) {
        const el = document.getElementById("power-debug-table");
        if (el) el.style.display = "block";
      }
      if (bestBuysOpen) {
        const el = document.querySelector(".power-best-buys .power-section-body");
        if (el) el.style.display = "block";
      }
    }

    function renderPowerBoostRow(b, catId, product, val, isOwned) {
      const imgUrl = b.type !== "Skill" ? getItemIcon(b.name) : "";
      let sflText;
      if (val.disabled) {
        sflText = `<span style="color:var(--text-dim)">DISABLED</span>`;
      } else if (val.redundantFreeTool) {
        sflText = `<span style="color:var(--text-dim)">NO EFFECT</span>`;
      } else if (val.synergy !== 0) {
        sflText = val.isFreeTool ? `🆓⬇${val.synergy.toFixed(2)}/day`
          : val.isCostReduction ? `⬇${val.synergy.toFixed(2)}/day`
          : val.isLavaCostReduction ? `🌋⬇${val.synergy.toFixed(2)}/day`
          : val.isFruitStump ? `🪵${val.synergy > 0 ? "+" : ""}${val.synergy.toFixed(2)}/day`
          : `${val.synergy > 0 ? "+" : ""}${val.synergy.toFixed(2)}/day`;
      } else {
        sflText = "—";
      }
      let roiText = "";
      if (val.disabled || val.redundantFreeTool) {
        roiText = "";
      } else if (val.roi < Infinity && val.roi > 0) {
        roiText = `${val.roi.toFixed(0)}d`;
      } else if (val.synergy < 0 && b.floor > 0) {
        roiText = "LOSS";
      }
      const typeLabel = b.type === "Skill" ? `Skill (${b.skillTree}, ${b.skillPoints}pt)` : b.type;
      let costLabel;
      if (b.type === "Skill" && b.floor > 0) {
        costLabel = `~${b.floor.toFixed(0)} ${sflIcon()} (${b.skillPoints}pt)`;
      } else if (b.markCost > 0) {
        costLabel = `${b.floor.toFixed(0)} ${sflIcon()} (${(b.markCost/1000).toFixed(0)}k⚔️)`;
      } else if (b.floor > 0) {
        costLabel = `${b.floor.toFixed(0)} ${sflIcon()}`;
      } else {
        costLabel = "";
      }
      const disabledNote = val.disabled ? `<div style="color:var(--red);font-size:0.5rem">⛔ Superseded by ${escHTML(val.disabledByName || "stronger item")}</div>`
        : val.redundantFreeTool ? `<div style="color:var(--text-dim);font-size:0.5rem">🆓 No effect — tools already free</div>` : "";

      const dimmed = val.disabled || val.redundantFreeTool;
      return `<div class="power-boost-row ${isOwned ? "has-it" : "missing"}${dimmed ? " disabled-boost" : ""}" onclick="togglePowerDetail(this,'${escHTML(b.name).replace(/'/g, "\\'")}','${catId}')" style="${dimmed ? 'opacity:0.5' : ''}">
        ${imgUrl ? `<img class="power-boost-img" src="${imgUrl}" onerror="this.style.display='none'" alt="">` : `<span class="power-boost-icon">🧠</span>`}
        <div class="power-boost-info">
          <div class="power-boost-name">${escHTML(b.name)} <span class="power-boost-type">${escHTML(typeLabel)}</span></div>
          <div class="power-boost-text">${escHTML(b.boost)}</div>
          ${disabledNote}
        </div>
        <div class="power-boost-value">
          <div class="power-boost-sfl">${sflText}</div>
          ${roiText ? `<div class="power-boost-roi" style="${roiText === 'LOSS' ? 'color:var(--red)' : ''}">${roiText}${roiText === 'LOSS' ? '' : ' ROI'}</div>` : ""}
          ${costLabel ? `<div class="power-boost-floor">${costLabel}</div>` : ""}
        </div>
      </div>`;
    }

    function renderPowerQualRow(b, isOwned) {
      const imgUrl = b.type !== "Skill" ? getItemIcon(b.name) : "";
      const typeLabel = b.type === "Skill" ? `Skill (${b.skillTree}, ${b.skillPoints}pt)` : b.type;
      let costLabel;
      if (b.type === "Skill" && b.floor > 0) {
        costLabel = `~${b.floor.toFixed(0)} ${sflIcon()} (${b.skillPoints}pt)`;
      } else if (b.markCost > 0) {
        costLabel = `${b.floor.toFixed(0)} ${sflIcon()} (${(b.markCost/1000).toFixed(0)}k⚔️)`;
      } else if (b.floor > 0) {
        costLabel = `${b.floor.toFixed(0)} ${sflIcon()}`;
      } else {
        costLabel = "";
      }
      return `<div class="power-boost-row ${isOwned ? "has-it" : "missing"}" onclick="togglePowerDetail(this,'${escHTML(b.name).replace(/'/g, "\\'")}','qual')">
        ${imgUrl ? `<img class="power-boost-img" src="${imgUrl}" onerror="this.style.display='none'" alt="">` : `<span class="power-boost-icon">🧠</span>`}
        <div class="power-boost-info">
          <div class="power-boost-name">${escHTML(b.name)} <span class="power-boost-type">${escHTML(typeLabel)}</span></div>
          <div class="power-boost-text">${escHTML(b.boost)}</div>
        </div>
        <div class="power-boost-value">
          ${!isOwned && costLabel ? `<div class="power-boost-floor">${costLabel}</div>` : ""}
        </div>
      </div>`;
    }

    function togglePowerCategory(catId) {
      const cat = document.getElementById("power-cat-" + catId);
      if (!cat) return;
      const body = cat.querySelector(".power-cat-body");
      const arrow = cat.querySelector(".power-toggle-arrow");
      if (body.style.display === "none") {
        body.style.display = "block";
        if (arrow) arrow.textContent = "▼";
      } else {
        body.style.display = "none";
        if (arrow) arrow.textContent = "▶";
      }
    }

    function togglePowerDetail(el, boostName, catId) {
      const row = el.closest ? el : el.parentElement;
      // If next sibling is a detail, remove it (toggle off)
      if (row.nextElementSibling && row.nextElementSibling.classList.contains("power-detail")) {
        row.nextElementSibling.remove();
        return;
      }
      // Remove any other open details nearby
      const parentCat = row.closest(".power-category");
      if (parentCat) parentCat.querySelectorAll(".power-detail").forEach(d => d.remove());

      // Find the boost item across all categories
      const { catBoosts, boostItems, capacity, p2pPrices, savedProducts } = powerState;
      let boostItem, effectiveCatId = catId;
      if (catId === "qual") {
        // Qualitative — find item in all boosts
        boostItem = boostItems.find(b => b.name === boostName);
        effectiveCatId = boostItem?.categories?.[0] || "other";
      } else {
        const items = catBoosts[catId] || [];
        boostItem = items.find(b => b.name === boostName);
      }
      if (!boostItem) return;

      const product = savedProducts[effectiveCatId] || getDefaultProduct(effectiveCatId);
      const items = catBoosts[effectiveCatId] || [];
      const detailHTML = buildFormulaHTML(boostItem, effectiveCatId, product, capacity, p2pPrices, items);
      const detail = document.createElement("div");
      detail.className = "power-detail";
      detail.innerHTML = detailHTML;
      row.after(detail);
    }

    function selectPowerProduct(catId, product) {
      savePowerProduct(catId, product);
      powerState.savedProducts[catId] = product;
      const scrollY = window.scrollY;
      renderPowerContent();
      window.scrollTo(0, scrollY);
    }

    // ═══════════════════════════════════════
    //  MAIN
    // ═══════════════════════════════════════

    // ═══════════════════════════════════════
    //  BUDS PAGE
    // ═══════════════════════════════════════

    async function renderBuds(data) {
      const app = document.getElementById("app");
      const { farm } = data;
      const capacity = detectFarmCapacity(farm);
      const savedProducts = getSavedPowerProducts();

      let html = `<div class="header pixel-panel pixel-font">
        <h1>BUD EXPLORER</h1>
        <div class="farm-id">Farm #${escHTML(FARM_ID)}</div>
      </div>`;

      html += `<div class="under-dev-banner pixel-font" style="background:linear-gradient(180deg,#3b1768,#2a1050);padding:8px 12px;border:3px solid #000;margin-bottom:16px;text-align:center;font-size:0.5625rem;color:var(--lily)">
        ⚠️ UNDER DEVELOPMENT ⚠️
        <div style="margin-top:6px;font-size:0.5rem;color:var(--text-secondary);line-height:1.5">
          All ${BUD_COUNT} bud NFTs with boost calculations (hardcoded data).<br>
          ${sflIcon()}/day based on YOUR farm capacity. Same-resource boosts: best wins (no stacking). Owned buds shown first.
        </div>
      </div>`;

      html += `<div id="buds-content"><div class="loading-screen pixel-font" style="padding:20px"><div class="loading-text">Loading prices...</div></div></div>`;
      app.innerHTML = html;

      // Fetch P2P prices only (bud data is hardcoded)
      let p2pPrices = {};
      try {
        const resp = await fetch(`/api/proxy?url=${encodeURIComponent("https://sfl.world/api/v1/prices")}`);
        if (resp.ok) {
          const priceResp = await resp.json();
          const priceData = priceResp?.data?.p2p || priceResp?.p2p || {};
          for (const [k, v] of Object.entries(priceData)) p2pPrices[k] = parseFloat(v) || 0;
        }
      } catch {}

      // Check which buds the user owns
      const ownedBudIds = new Set();
      const farmBuds = farm.buds || {};
      for (const [budId] of Object.entries(farmBuds)) ownedBudIds.add(parseInt(budId));

      // Build all bud data from hardcoded encoded strings
      const budRows = [];
      for (let id = 1; id <= BUD_COUNT; id++) {
        const bud = decodeBud(id);
        if (!bud) continue;
        const result = calcBudSflPerDay(bud, capacity, p2pPrices, savedProducts);
        const boostDescs = describeBudBoosts(bud);
        const owned = ownedBudIds.has(id);
        const breakdownDesc = result.breakdown.map(b => {
          const cat = POWER_CATEGORIES[b.catId];
          return `${catIcon(b.catId, "1em")} ${b.sflPerDay.toFixed(4)}`;
        }).join(" · ");
        budRows.push({ id, type: bud.type, stem: bud.stem, aura: bud.aura,
          boostDescs, breakdownDesc, sflPerDay: result.totalSfl, sflPerYear: result.totalSfl * 365, owned });
      }

      // Sort: owned first, then by SFL/day descending
      budRows.sort((a, b) => {
        if (a.owned !== b.owned) return a.owned ? -1 : 1;
        return b.sflPerDay - a.sflPerDay;
      });

      const totalOwned = budRows.filter(b => b.owned).length;
      const withBoost = budRows.filter(b => b.sflPerDay > 0).length;

      let content = `<div class="pixel-font" style="font-size:0.5625rem;color:var(--text-secondary);margin-bottom:12px">
        <strong>${budRows.length}</strong> buds total ·
        <strong style="color:var(--green)">${totalOwned} owned</strong> ·
        ${withBoost} with calculable boost ·
        Capacity: ${capacity.crops} plots, ${capacity.fruitPatches} fruit, ${capacity.greenhouse || 0} greenhouse, ${capacity.lavaPits || 0} lava pits, ${capacity.oilReserves || 0} oil reserves, ${capacity.trees} trees
      </div>`;

      // Filters
      content += `<div style="margin-bottom:10px;display:flex;gap:8px;flex-wrap:wrap;align-items:center" class="pixel-font">
        <label style="font-size:0.5rem;color:var(--text-secondary)">Type:
          <select id="bud-filter-type" onchange="filterBudTable()" style="font-size:0.5rem;background:var(--bg-input);color:var(--text-primary);border:1px solid var(--border-dark);padding:2px 4px">
            <option value="">All</option>
            ${BUD_TYPE_NAMES.map(t => `<option value="${t}">${t}</option>`).join("")}
          </select>
        </label>
        <label style="font-size:0.5rem;color:var(--text-secondary)">Aura:
          <select id="bud-filter-aura" onchange="filterBudTable()" style="font-size:0.5rem;background:var(--bg-input);color:var(--text-primary);border:1px solid var(--border-dark);padding:2px 4px">
            <option value="">All</option>
            ${BUD_AURA_NAMES.map(a => `<option value="${a}">${a}</option>`).join("")}
          </select>
        </label>
        <label style="font-size:0.5rem;color:var(--text-secondary)">
          <input type="checkbox" id="bud-filter-owned" onchange="filterBudTable()"> Owned only
        </label>
      </div>`;

      content += `<div style="overflow-x:auto">
      <table id="bud-table" style="width:100%;border-collapse:collapse;font-size:0.5rem;color:var(--text-secondary)">
        <thead>
          <tr style="background:rgba(92,58,30,0.3);text-align:left;position:sticky;top:0">
            <th style="padding:4px 6px;border:1px solid var(--border-dark)">ID</th>
            <th style="padding:4px 6px;border:1px solid var(--border-dark)">Type</th>
            <th style="padding:4px 6px;border:1px solid var(--border-dark)">Stem</th>
            <th style="padding:4px 6px;border:1px solid var(--border-dark)">Aura</th>
            <th style="padding:4px 6px;border:1px solid var(--border-dark);min-width:140px">Boosts (after aura)</th>
            <th style="padding:4px 6px;border:1px solid var(--border-dark);min-width:80px">Breakdown</th>
            <th style="padding:4px 6px;border:1px solid var(--border-dark);text-align:right">${sflIcon()}/day</th>
            <th style="padding:4px 6px;border:1px solid var(--border-dark);text-align:right">${sflIcon()}/year</th>
          </tr>
        </thead>
        <tbody>`;

      for (const bud of budRows) {
        const auraStyle = bud.aura === "Mythical" ? "color:#ff66ff;font-weight:bold" :
                          bud.aura === "Rare" ? "color:#ff8800;font-weight:bold" :
                          bud.aura === "Green" ? "color:var(--green)" :
                          bud.aura === "Basic" ? "color:var(--lily)" : "color:var(--text-dim)";
        const auraLabel = bud.aura !== "No Aura"
          ? `${bud.aura} (${((BUD_AURA_MULTIPLIERS[bud.aura] - 1) * 100).toFixed(0)}%)` : "—";
        const sflColor = bud.sflPerDay > 0 ? "var(--green)" : "var(--text-dim)";
        const ownedBg = bud.owned ? "background:rgba(34,139,34,0.15);" : "";

        content += `<tr data-type="${escHTML(bud.type)}" data-aura="${escHTML(bud.aura)}" data-owned="${bud.owned ? 1 : 0}" style="border-bottom:1px solid rgba(92,58,30,0.15);${ownedBg}">
          <td style="padding:3px 6px;border:1px solid var(--border-dark);font-weight:bold">${bud.owned ? "✅ " : ""}${bud.id}</td>
          <td style="padding:3px 6px;border:1px solid var(--border-dark)">${escHTML(bud.type)}</td>
          <td style="padding:3px 6px;border:1px solid var(--border-dark)">${escHTML(bud.stem)}</td>
          <td style="padding:3px 6px;border:1px solid var(--border-dark);${auraStyle}">${escHTML(auraLabel)}</td>
          <td style="padding:3px 6px;border:1px solid var(--border-dark)">${bud.boostDescs.join("<br>") || '<em style="color:var(--text-dim)">—</em>'}</td>
          <td style="padding:3px 6px;border:1px solid var(--border-dark);font-size:0.4375rem">${bud.breakdownDesc || "—"}</td>
          <td style="padding:3px 6px;border:1px solid var(--border-dark);text-align:right;color:${sflColor};font-weight:bold">+${bud.sflPerDay.toFixed(4)}</td>
          <td style="padding:3px 6px;border:1px solid var(--border-dark);text-align:right;color:${sflColor}">+${bud.sflPerYear.toFixed(2)}</td>
        </tr>`;
      }

      content += `</tbody></table></div>`;

      content += `<div class="footer" style="margin-top:16px">
        <button class="refresh-btn" onclick="refresh()">REFRESH</button>
        <div class="timestamp pixel-font">Updated: ${new Date().toLocaleTimeString("cs-CZ")}</div>
      </div>`;

      document.getElementById("buds-content").innerHTML = content;
    }

    function filterBudTable() {
      const type = document.getElementById("bud-filter-type")?.value || "";
      const aura = document.getElementById("bud-filter-aura")?.value || "";
      const ownedOnly = document.getElementById("bud-filter-owned")?.checked || false;
      const rows = document.querySelectorAll("#bud-table tbody tr");
      for (const row of rows) {
        const show = (!type || row.dataset.type === type)
          && (!aura || row.dataset.aura === aura)
          && (!ownedOnly || row.dataset.owned === "1");
        row.style.display = show ? "" : "none";
      }
    }

    // ═══════════════════════════════════════
    //  PETS PAGE
    // ═══════════════════════════════════════

    // Map common pet names → species (same species = same fetch resources)
    const PET_NAME_SPECIES = {
      "Barkley":"Dog","Biscuit":"Dog","Cloudy":"Dog",
      "Meowchi":"Cat","Butters":"Cat","Smokey":"Cat",
      "Twizzle":"Owl","Flicker":"Owl","Pippin":"Owl",
      "Burro":"Horse","Pinto":"Horse","Roan":"Horse","Stallion":"Horse",
      "Mudhorn":"Bull","Bison":"Bull","Oxen":"Bull",
      "Nibbles":"Hamster","Peanuts":"Hamster",
      "Waddles":"Penguin","Pip":"Penguin","Skipper":"Penguin",
    };

    // Fetch resources per species/type: { res, level, energy }
    // Energy: Acorn=100, Moonfur=1000, Fossil Shell=300, all others=200
    const PET_FETCH_DATA = {
      // Common species (4 resources, Lv 1/3/7/20)
      "Dog":     [{res:"Acorn",level:1,energy:100},{res:"Chewed Bone",level:3,energy:200},{res:"Ribbon",level:7,energy:200},{res:"Fossil Shell",level:20,energy:300}],
      "Cat":     [{res:"Acorn",level:1,energy:100},{res:"Ribbon",level:3,energy:200},{res:"Heart Leaf",level:7,energy:200},{res:"Fossil Shell",level:20,energy:300}],
      "Owl":     [{res:"Acorn",level:1,energy:100},{res:"Heart Leaf",level:3,energy:200},{res:"Dewberry",level:7,energy:200},{res:"Fossil Shell",level:20,energy:300}],
      "Horse":   [{res:"Acorn",level:1,energy:100},{res:"Ruffroot",level:3,energy:200},{res:"Wild Grass",level:7,energy:200},{res:"Fossil Shell",level:20,energy:300}],
      "Bull":    [{res:"Acorn",level:1,energy:100},{res:"Wild Grass",level:3,energy:200},{res:"Frost Pebble",level:7,energy:200},{res:"Fossil Shell",level:20,energy:300}],
      "Hamster": [{res:"Acorn",level:1,energy:100},{res:"Dewberry",level:3,energy:200},{res:"Chewed Bone",level:7,energy:200},{res:"Fossil Shell",level:20,energy:300}],
      "Penguin": [{res:"Acorn",level:1,energy:100},{res:"Frost Pebble",level:3,energy:200},{res:"Ruffroot",level:7,energy:200},{res:"Fossil Shell",level:20,energy:300}],
      // NFT types (6 resources, Lv 1/3/7/12/20/25)
      "Dragon":  [{res:"Acorn",level:1,energy:100},{res:"Frost Pebble",level:3,energy:200},{res:"Chewed Bone",level:7,energy:200},{res:"Moonfur",level:12,energy:1000},{res:"Fossil Shell",level:20,energy:300},{res:"Ruffroot",level:25,energy:200}],
      "Phoenix": [{res:"Acorn",level:1,energy:100},{res:"Heart Leaf",level:3,energy:200},{res:"Wild Grass",level:7,energy:200},{res:"Moonfur",level:12,energy:1000},{res:"Fossil Shell",level:20,energy:300},{res:"Chewed Bone",level:25,energy:200}],
      "Griffin": [{res:"Acorn",level:1,energy:100},{res:"Ruffroot",level:3,energy:200},{res:"Dewberry",level:7,energy:200},{res:"Moonfur",level:12,energy:1000},{res:"Fossil Shell",level:20,energy:300},{res:"Wild Grass",level:25,energy:200}],
      "Ram":     [{res:"Acorn",level:1,energy:100},{res:"Ribbon",level:3,energy:200},{res:"Ruffroot",level:7,energy:200},{res:"Moonfur",level:12,energy:1000},{res:"Fossil Shell",level:20,energy:300},{res:"Heart Leaf",level:25,energy:200}],
      "Warthog": [{res:"Acorn",level:1,energy:100},{res:"Wild Grass",level:3,energy:200},{res:"Frost Pebble",level:7,energy:200},{res:"Moonfur",level:12,energy:1000},{res:"Fossil Shell",level:20,energy:300},{res:"Ribbon",level:25,energy:200}],
      "Wolf":    [{res:"Acorn",level:1,energy:100},{res:"Chewed Bone",level:3,energy:200},{res:"Ribbon",level:7,energy:200},{res:"Moonfur",level:12,energy:1000},{res:"Fossil Shell",level:20,energy:300},{res:"Dewberry",level:25,energy:200}],
      "Bear":    [{res:"Acorn",level:1,energy:100},{res:"Dewberry",level:3,energy:200},{res:"Heart Leaf",level:7,energy:200},{res:"Moonfur",level:12,energy:1000},{res:"Fossil Shell",level:20,energy:300},{res:"Frost Pebble",level:25,energy:200}],
    };

    // Cumulative XP thresholds: index 0 = Lv 1, index 29 = Lv 30
    const PET_XP_TABLE = [
      0, 10, 25, 50, 100, 175, 280, 420, 600, 830,
      1120, 1480, 1920, 2450, 3100, 3880, 4800, 5900, 7200, 8750,
      10600, 12800, 15400, 18500, 22200, 26600, 31800, 38000, 45300, 54000,
    ];

    function petLevel(xp) {
      for (let i = PET_XP_TABLE.length - 1; i >= 0; i--) {
        if (xp >= PET_XP_TABLE[i]) return i + 1;
      }
      return 1;
    }

    async function renderPets(data) {
      const app = document.getElementById("app");
      const { farm } = data;

      let html = `<div class="header pixel-panel pixel-font">
        <h1>PET ADVISOR</h1>
        <div class="farm-id">Farm #${escHTML(FARM_ID)}</div>
      </div>`;

      html += `<div class="under-dev-banner pixel-font" style="background:linear-gradient(180deg,#3b1768,#2a1050);padding:8px 12px;border:3px solid #000;margin-bottom:16px;text-align:center;font-size:0.5625rem;color:var(--lily)">
        &#x26A0;&#xFE0F; UNDER DEVELOPMENT &#x26A0;&#xFE0F;
        <div style="margin-top:6px;font-size:0.5rem;color:var(--text-secondary);line-height:1.5">
          Pet fetch resource advisor. Prices from sfl.world P2P market.<br>
          Shows optimal fetch targets based on ${sflIcon()}/energy efficiency.
        </div>
      </div>`;

      html += `<div id="pets-content"><div class="loading-screen pixel-font" style="padding:20px"><div class="loading-text">Loading prices...</div></div></div>`;
      app.innerHTML = html;

      // Fetch P2P prices
      let p2pPrices = {};
      try {
        const resp = await fetch(`/api/proxy?url=${encodeURIComponent("https://sfl.world/api/v1/prices")}`);
        if (resp.ok) {
          const priceResp = await resp.json();
          const priceData = priceResp?.data?.p2p || priceResp?.p2p || {};
          for (const [k, v] of Object.entries(priceData)) p2pPrices[k] = parseFloat(v) || 0;
        }
      } catch {}

      // Parse pets from farm data
      const pets = [];
      const commonPets = farm.pets?.common || {};
      for (const [name, pet] of Object.entries(commonPets)) {
        const xp = pet.experience || 0;
        const level = petLevel(xp);
        const energy = pet.energy || 0;
        const foods = pet.requests?.food || [];
        const species = PET_NAME_SPECIES[name] || null;
        pets.push({ name, petType: species, species, level, xp, energy, foods, isNft: false, nftId: null });
      }
      const nftPets = farm.pets?.nfts || {};
      for (const [id, pet] of Object.entries(nftPets)) {
        const xp = pet.experience || 0;
        const level = petLevel(xp);
        const energy = pet.energy || 0;
        const foods = pet.requests?.food || [];
        const petType = pet.traits?.type || "Unknown";
        pets.push({ name: `Pet #${id}`, petType, species: petType, level, xp, energy, foods, isNft: true, nftId: id });
      }

      // Sort: NFT first, then common; within each group by level desc
      pets.sort((a, b) => {
        if (a.isNft !== b.isNft) return a.isNft ? -1 : 1;
        return b.level - a.level;
      });

      // Empty state
      if (pets.length === 0) {
        document.getElementById("pets-content").innerHTML = `
          <div class="pixel-panel" style="padding:24px;text-align:center;font-size:0.75rem;color:var(--text-secondary)">
            No pets found on this farm.<br><br>
            <a href="https://sfl.world/info/pets" target="_blank" style="color:var(--sunpetal)">Learn about pets &#x2192;</a>
          </div>`;
        return;
      }

      let content = '';

      // Summary bar
      const totalEnergy = pets.reduce((s, p) => s + p.energy, 0);
      const nftCount = pets.filter(p => p.isNft).length;
      const commonCount = pets.filter(p => !p.isNft).length;
      content += `<div class="summary-bar pixel-panel">
        <div class="summary-stat">
          <div class="label pixel-font">TOTAL PETS</div>
          <div class="value">${pets.length}</div>
        </div>
        <div class="summary-stat">
          <div class="label pixel-font">COMMON</div>
          <div class="value">${commonCount}</div>
        </div>
        <div class="summary-stat">
          <div class="label pixel-font">NFT</div>
          <div class="value" style="color:var(--lily)">${nftCount}</div>
        </div>
        <div class="summary-stat">
          <div class="label pixel-font">TOTAL ENERGY</div>
          <div class="value time">${totalEnergy.toLocaleString()} &#x26A1;</div>
        </div>
      </div>`;

      // Collect all unique fetchable resources with prices
      const resMap = new Map();
      for (const entries of Object.values(PET_FETCH_DATA)) {
        for (const e of entries) {
          if (!resMap.has(e.res)) {
            const price = p2pPrices[e.res] || 0;
            const ratio = price > 0 ? price / e.energy : 0;
            resMap.set(e.res, { res: e.res, price, energy: e.energy, ratio });
          }
        }
      }
      const sortedRes = [...resMap.values()].sort((a, b) => b.ratio - a.ratio);

      // Resource market overview
      content += `<div class="pixel-panel" style="padding:12px 14px;margin-bottom:16px">
        <div style="font-size:0.6875rem;color:var(--sunpetal);margin-bottom:8px;font-weight:bold" class="pixel-font">RESOURCE MARKET</div>
        <table class="pet-resource-table">
          <tr><th>RESOURCE</th><th>${sflIcon("1em")} PRICE</th><th>&#x26A1; COST</th><th>${sflIcon("1em")}/&#x26A1;</th></tr>`;
      for (const r of sortedRes) {
        const priceStr = r.price > 0 ? r.price.toFixed(2) : "&#x2014;";
        const ratioStr = r.ratio > 0 ? r.ratio.toFixed(4) : "&#x2014;";
        const style = r.ratio > 0 ? "" : ' style="color:var(--text-dim)"';
        content += `<tr${style}><td>${escHTML(r.res)}</td><td>${priceStr}</td><td>${r.energy}</td><td>${ratioStr}</td></tr>`;
      }
      content += `</table></div>`;

      // Per-pet cards
      let grandTotalSfl = 0;
      let grandTotalCards = [];

      for (const pet of pets) {
        const fetchData = PET_FETCH_DATA[pet.petType] || [];
        const speciesLabel = pet.species ? ` (${escHTML(pet.species)})` : "";
        const nftBadge = pet.isNft ? ' <span style="color:var(--lily);font-size:0.5625rem;font-weight:normal">NFT</span>' : "";

        content += `<div class="pet-card pixel-panel">
          <div class="pet-header">
            <span class="pet-name">${escHTML(pet.name)}${speciesLabel}${nftBadge}</span>
            <span class="pet-level pixel-font">Lv ${pet.level} &#xB7; ${pet.energy.toLocaleString()} &#x26A1;</span>
          </div>`;

        if (fetchData.length > 0 && pet.energy > 0) {
          const unlocked = fetchData.filter(f => pet.level >= f.level);
          const locked = fetchData.filter(f => pet.level < f.level);

          // Calculate fetch counts, total SFL, and ratio for unlocked
          const withCalc = unlocked.map(f => {
            const price = p2pPrices[f.res] || 0;
            const fetches = Math.floor(pet.energy / f.energy);
            const totalSfl = fetches * price;
            const ratio = price > 0 ? price / f.energy : 0;
            return { ...f, price, ratio, fetches, totalSfl };
          }).sort((a, b) => b.totalSfl - a.totalSfl);

          // Best recommendation
          const best = withCalc.find(f => f.totalSfl > 0);
          if (best) {
            grandTotalSfl += best.totalSfl;
            grandTotalCards.push({ name: pet.name, res: best.res, fetches: best.fetches, totalSfl: best.totalSfl });
            content += `<div style="background:rgba(48,209,88,0.12);border:2px solid var(--green);padding:8px 10px;margin-bottom:6px;font-size:0.6875rem;display:flex;align-items:center;gap:6px;flex-wrap:wrap">
              <span style="color:var(--green);font-weight:bold">&#x2192;</span>
              <span>Fetch <b>${escHTML(best.res)}</b> &#xD7;${best.fetches}</span>
              <span style="color:var(--green);font-weight:bold">= ${best.totalSfl.toFixed(2)} ${sflIcon("0.85em")}</span>
              <span style="color:var(--text-dim);font-size:0.5625rem">(${best.energy} &#x26A1; each)</span>
            </div>`;
          }

          content += `<div class="pet-section-title pixel-font">ALL FETCHES</div>`;

          for (let i = 0; i < withCalc.length; i++) {
            const f = withCalc[i];
            const isBest = i === 0 && f.totalSfl > 0;
            const cls = isBest ? "pet-fetch-row pet-best" : "pet-fetch-row";
            const star = isBest ? "&#x2605; " : "";
            const priceStr = f.price > 0 ? `${f.price.toFixed(2)} ${sflIcon("0.85em")}` : "&#x2014;";
            const fetchStr = f.fetches > 0 ? `&#xD7;${f.fetches}` : "&#xD7;0";
            const totalStr = f.totalSfl > 0 ? `<b style="color:var(--green)">${f.totalSfl.toFixed(2)}</b>` : "&#x2014;";
            content += `<div class="${cls}">
              <span>${star}${escHTML(f.res)}</span>
              <span>${priceStr}</span>
              <span>${f.energy} &#x26A1;</span>
              <span>${fetchStr}</span>
              <span>${totalStr}</span>
            </div>`;
          }

          for (const f of locked) {
            content += `<div class="pet-fetch-row pet-locked">
              <span>&#x1F512; ${escHTML(f.res)}</span>
              <span>(Lv ${f.level})</span>
            </div>`;
          }
        } else if (fetchData.length > 0 && pet.energy === 0) {
          content += `<div style="padding:8px;color:var(--text-dim);font-size:0.6875rem">No energy &#x2014; pet needs to recharge</div>`;
        } else {
          content += `<div style="padding:8px;color:var(--text-dim);font-size:0.6875rem">Unknown pet type &#x2014; no fetch data available</div>`;
        }

        // Food requests
        if (pet.foods.length > 0) {
          content += `<div class="pet-section-title pixel-font">FOOD REQUESTS</div>`;
          content += `<div class="pet-food-list">${pet.foods.map(f => escHTML(f)).join(" &#xB7; ")}</div>`;
        }

        content += `</div>`;
      }

      // Grand total summary (if any pet has earnings)
      if (grandTotalSfl > 0) {
        let totalHtml = `<div class="pixel-panel" style="padding:12px 14px;margin-bottom:16px;border-color:var(--green)">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:8px">
            <span class="pixel-font" style="font-size:0.6875rem;color:var(--green);font-weight:bold">OPTIMAL EARNINGS</span>
            <span style="font-size:1rem;font-weight:bold;color:var(--green)">${grandTotalSfl.toFixed(2)} ${sflIcon("1em")} total</span>
          </div>
          <div style="font-size:0.6875rem;color:var(--text-secondary);line-height:1.6">`;
        for (const c of grandTotalCards) {
          totalHtml += `${escHTML(c.name)}: ${escHTML(c.res)} &#xD7;${c.fetches} = ${c.totalSfl.toFixed(2)} ${sflIcon("0.85em")}<br>`;
        }
        totalHtml += `</div></div>`;
        // Insert between summary bar and resource market
        const marketAnchor = '<div class="pixel-panel" style="padding:12px 14px;margin-bottom:16px">';
        const mIdx = content.indexOf(marketAnchor);
        if (mIdx >= 0) {
          content = content.substring(0, mIdx) + totalHtml + content.substring(mIdx);
        }
      }

      document.getElementById("pets-content").innerHTML = content;
    }

    function refresh() {
      cachedFarmData = null;
      main();
    }

    async function main() {
      await loadImageMap();
      const cfg = getConfig();
      const page = getPage();

      FARM_ID = cfg.farm;
      LIMIT = cfg.limit;
      FLOWER_BEDS = 4;

      renderNavBar(page);
      renderDonate();

      if (!FARM_ID) {
        renderConfigBar("hub");
        renderHub(null);
        return;
      }

      renderConfigBar(page);

      const app = document.getElementById("app");

      if (!cachedFarmData) {
        app.innerHTML = `<div class="loading-screen pixel-font">
          <div class="loading-flower">🌻</div>
          <div class="loading-text">Loading farm data...</div>
        </div>`;
      }

      try {
        if (!cachedFarmData) {
          cachedFarmData = await fetchFarmData();
        }
        const data = cachedFarmData;

        // Auto-detect bed/trap counts and apply boosts
        FLOWER_BEDS = Math.max(1, Object.keys(data.flowerBeds).length);
        applyFlowerBoosts(data.flowerMultiplier);


    // ═══════════════════════════════════════
    //  DIFF PAGE (farm 155498 only)
    // ═══════════════════════════════════════

    function estimateItemSfl(itemName, p2pPrices, _visited, rates) {
      // Direct P2P price
      if (p2pPrices[itemName]) return p2pPrices[itemName];

      // Prevent infinite recursion
      const visited = _visited || new Set();
      if (visited.has(itemName)) return 0;
      visited.add(itemName);

      // Crafted ingredient (e.g., Cheese = 3 Milk)
      const craftedRecipe = CRAFTED_INGREDIENT_RECIPES[itemName];
      if (craftedRecipe) {
        let total = 0;
        for (const [ing, qty] of Object.entries(craftedRecipe)) {
          const ingPrice = estimateItemSfl(ing, p2pPrices, visited, rates);
          if (ingPrice <= 0) return 0;
          total += ingPrice * qty;
        }
        return total;
      }

      // Food recipe
      const foodRecipe = RECIPE_INGREDIENTS[itemName];
      if (foodRecipe) {
        let total = 0;
        for (const [ing, qty] of Object.entries(foodRecipe)) {
          const ingPrice = estimateItemSfl(ing, p2pPrices, visited, rates);
          if (ingPrice <= 0) return 0;
          total += ingPrice * qty;
        }
        return total;
      }

      // Barn Delight
      if (itemName === "Barn Delight") {
        const lemon = p2pPrices["Lemon"] || 0;
        const honey = p2pPrices["Honey"] || 0;
        if (lemon > 0 && honey > 0) return 5 * lemon + 3 * honey;
        return 0;
      }

      // Doll recipes
      if (typeof DOLL_RECIPES !== "undefined" && DOLL_RECIPES[itemName]) {
        const recipe = DOLL_RECIPES[itemName];
        if (recipe.length === 0) return 0;
        let total = 0;
        for (const { item, qty } of recipe) {
          const ingPrice = estimateItemSfl(item, p2pPrices, visited, rates);
          if (ingPrice <= 0) return 0;
          total += ingPrice * qty;
        }
        return total;
      }

      // Tool costs (coins + materials)
      if (typeof TOOL_COSTS !== "undefined" && TOOL_COSTS[itemName] && rates && rates.coinsPerSFL > 0) {
        const tool = TOOL_COSTS[itemName];
        let total = tool.coins / rates.coinsPerSFL;
        if (tool.materials) {
          for (const [mat, qty] of Object.entries(tool.materials)) {
            const matPrice = estimateItemSfl(mat, p2pPrices, visited, rates);
            total += matPrice * qty;
          }
        }
        return total;
      }

      // Seed costs (coins only) — SEED_COSTS keyed by crop name, items come as "X Seed"
      if (typeof SEED_COSTS !== "undefined" && rates && rates.coinsPerSFL > 0) {
        const cropName = itemName.endsWith(" Seed") ? itemName.slice(0, -5) : itemName;
        if (SEED_COSTS[cropName]) return SEED_COSTS[cropName] / rates.coinsPerSFL;
      }

      return 0;
    }

    async function renderDiff(data) {
      const app = document.getElementById("app");

      let html = `<div class="header pixel-panel pixel-font">
        <h1>FARM CHANGELOG</h1>
        <div class="farm-id">Farm #${escHTML(FARM_ID)}</div>
      </div>`;

      html += `<div class="under-dev-banner pixel-font" style="background:linear-gradient(180deg,#1a1a2e,#16213e);padding:8px 12px;border:3px solid #000;margin-bottom:16px;text-align:center;font-size:0.5625rem;color:#e94560">
        &#x1F50D; FARM DIFF VIEWER &#x1F50D;
        <div style="margin-top:6px;font-size:0.5rem;color:var(--text-secondary);line-height:1.5">
          Last 50 snapshots (every 5 min). SFL values from P2P prices + Betty coins + gem exchange.<br>
          Crafted items valued by ingredient costs.
        </div>
      </div>`;

      html += `<div id="diff-content"><div class="loading-screen pixel-font" style="padding:20px"><div class="loading-text">Loading snapshots...</div></div></div>`;
      app.innerHTML = html;

      // Fetch with retry (up to 2 retries on 5xx / network error)
      const fetchRetry = async (url, label, retries = 2) => {
        for (let i = 0; i <= retries; i++) {
          try {
            const resp = await fetch(url);
            if (resp.ok) return { ok: true, data: await resp.json(), label };
            if (resp.status >= 500 && i < retries) { await new Promise(r => setTimeout(r, 1000 * (i + 1))); continue; }
            return { ok: false, label, error: `${resp.status} ${resp.statusText}` };
          } catch (e) {
            if (i < retries) { await new Promise(r => setTimeout(r, 1000 * (i + 1))); continue; }
            return { ok: false, label, error: e.message };
          }
        }
      };

      let p2pPrices = {};
      let snapshots = [];
      let coinsPerSFL = 0;
      let gemsPerSFL = 0;
      const warnings = [];

      const proxyUrl = (u) => `/api/proxy?url=${encodeURIComponent(u)}`;
      const [priceRes, exchangeRes, histRes] = await Promise.all([
        fetchRetry(proxyUrl("https://sfl.world/api/v1/prices"), "P2P prices"),
        fetchRetry(proxyUrl("https://sfl.world/api/v1.1/exchange"), "Exchange rates"),
        fetchRetry(`/api/farm-history?farm=${FARM_ID}&latest=50`, "Farm history"),
      ]);

      if (priceRes.ok) {
        const raw = priceRes.data?.data?.p2p || priceRes.data?.p2p || {};
        for (const [k, v] of Object.entries(raw)) p2pPrices[k] = parseFloat(v) || 0;
      } else { warnings.push(`P2P prices: ${priceRes.error}`); }

      if (exchangeRes.ok) {
        const ed = exchangeRes.data;
        const betty = computeBettyRate(p2pPrices);
        coinsPerSFL = betty.rate || 320;
        const gemTiers = Object.values(ed?.gems || {});
        const bestGemTier = gemTiers.reduce((best, t) => (!best || (t.gem / t.sfl) > (best.gem / best.sfl)) ? t : best, null);
        gemsPerSFL = bestGemTier ? (bestGemTier.gem / (bestGemTier.sfl * 0.7)) : 0;
      } else { warnings.push(`Exchange rates: ${exchangeRes.error}`); }

      if (histRes.ok) {
        snapshots = (histRes.data.snapshots || []).reverse();
      } else {
        document.getElementById("diff-content").innerHTML = `<div class="pixel-panel pixel-font" style="padding:20px;text-align:center;color:var(--red)">Failed to load snapshots: ${escHTML(histRes.error)}<br><button class="pixel-font" style="margin-top:10px;padding:8px 16px;cursor:pointer" onclick="renderDiff(cachedFarmData)">Retry</button></div>`;
        return;
      }

      if (snapshots.length === 0) {
        document.getElementById("diff-content").innerHTML = `<div class="pixel-panel pixel-font" style="padding:20px;text-align:center;color:var(--text-secondary)">No snapshots found for this farm.</div>`;
        return;
      }

      const noPrices = Object.keys(p2pPrices).length === 0;

      // Process each snapshot diff
      const processed = [];
      for (const snap of snapshots) {
        const diff = snap.diff || {};
        const time = new Date(snap.captured_at);
        let netSfl = 0;
        const items = [];

        for (const [key, delta] of Object.entries(diff)) {
          if (typeof delta !== "number") continue;

          let category = "other";
          let itemName = key;
          let sflValue = 0;

          if (key === "balance") {
            category = "sfl";
            itemName = "SFL Balance";
            sflValue = delta;
          } else if (key === "coins") {
            category = "coins";
            itemName = "Coins";
            sflValue = coinsPerSFL > 0 ? delta / coinsPerSFL : 0;
          } else if (key === "gems") {
            category = "gems";
            itemName = "Gems";
            sflValue = gemsPerSFL > 0 ? delta / gemsPerSFL : 0;
          } else if (key === "inventory.Gem") {
            category = "gems";
            itemName = "Gem";
            sflValue = gemsPerSFL > 0 ? delta / gemsPerSFL : 0;
          } else if (key.startsWith("inventory.")) {
            itemName = key.substring(10);
            category = "inventory";
            const price = estimateItemSfl(itemName, p2pPrices, null, { coinsPerSFL });
            sflValue = delta * price;
          } else if (key.startsWith("wardrobe.")) {
            itemName = key.substring(9);
            category = "wardrobe";
          } else if (key.startsWith("stock.")) {
            continue; // skip stock changes
          }

          items.push({ key, itemName, category, delta, sflValue, hasPrice: sflValue !== 0 || category === "sfl" || category === "coins" || category === "gems" });
          netSfl += sflValue;
        }

        // Sort: by absolute SFL value desc, then by name
        items.sort((a, b) => Math.abs(b.sflValue) - Math.abs(a.sflValue) || a.itemName.localeCompare(b.itemName));
        processed.push({ time, netSfl, items, id: snap.id });
      }

      // Compute stats
      const totalNet = processed.reduce((s, p) => s + p.netSfl, 0);
      const totalGain = processed.reduce((s, p) => s + (p.netSfl > 0 ? p.netSfl : 0), 0);
      const totalLoss = processed.reduce((s, p) => s + (p.netSfl < 0 ? p.netSfl : 0), 0);
      const maxAbs = Math.max(...processed.map(p => Math.abs(p.netSfl)), 0.01);



      // State
      let showZeroPrice = true;
      let selectedIdx = processed.length - 1; // latest

      function renderContent() {
        let out = "";

        // Warnings banner
        if (warnings.length > 0) {
          out += `<div class="pixel-panel pixel-font" style="padding:8px 12px;margin-bottom:12px;border-color:var(--red);font-size:0.5rem;color:var(--text-secondary)">
            ${noPrices ? '<span style="color:var(--red)">Price data unavailable</span> — SFL values will be missing. ' : '<span style="color:var(--yellow)">Partial data</span> — '}
            ${warnings.map(w => escHTML(w)).join("; ")}
            <button class="pixel-font" style="margin-left:8px;padding:2px 8px;cursor:pointer;font-size:0.4375rem" onclick="renderDiff(cachedFarmData)">Retry</button>
          </div>`;
        }

        // Stat cards
        const timeSpan = processed.length >= 2
          ? Math.round((processed[processed.length - 1].time - processed[0].time) / 60000)
          : 0;
        const timeStr = timeSpan >= 60 ? `${(timeSpan / 60).toFixed(1)}h` : `${timeSpan}m`;

        out += `<div class="diff-stat-cards">
          <div class="pixel-panel diff-stat-card">
            <div class="diff-stat-label">NET CHANGE</div>
            <div class="diff-stat-value ${totalNet >= 0 ? 'pos' : 'neg'}" style="color:${totalNet >= 0 ? 'var(--green)' : 'var(--red)'}">${totalNet >= 0 ? '+' : ''}${totalNet.toFixed(2)} ${sflIcon("0.85em")}</div>
          </div>
          <div class="pixel-panel diff-stat-card">
            <div class="diff-stat-label">GAINS</div>
            <div class="diff-stat-value" style="color:var(--green)">+${totalGain.toFixed(2)} ${sflIcon("0.85em")}</div>
          </div>
          <div class="pixel-panel diff-stat-card">
            <div class="diff-stat-label">LOSSES</div>
            <div class="diff-stat-value" style="color:var(--red)">${totalLoss.toFixed(2)} ${sflIcon("0.85em")}</div>
          </div>
          <div class="pixel-panel diff-stat-card">
            <div class="diff-stat-label">SNAPSHOTS</div>
            <div class="diff-stat-value" style="color:var(--text-primary)">${processed.length} <span style="font-size:0.5rem;color:var(--text-dim)">(${timeStr})</span></div>
          </div>
        </div>`;

        // Bar chart + running total overlay
        out += `<div class="pixel-panel diff-timeline" style="padding:10px 8px">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:8px;padding:0 6px">
            <span class="pixel-font" style="font-size:0.5625rem;color:var(--text-dim)">SFL VALUE CHANGE PER SNAPSHOT</span>
            <div class="diff-toggle-wrap">
              <label class="diff-toggle"><input type="checkbox" id="diff-zero-toggle" ${showZeroPrice ? 'checked' : ''} onchange="window._diffToggleZero(this.checked)"> Show zero-price items</label>
            </div>
          </div>
          <div class="diff-chart-wrap" style="position:relative">
            <div class="diff-chart">`;

        // Add zero-line in the middle
        out += `<div class="diff-zero-line" style="top:50%"></div>`;

        for (let i = 0; i < processed.length; i++) {
          const p = processed[i];
          const pct = Math.min(Math.max(Math.abs(p.netSfl) / maxAbs * 90, 2), 90);
          const cls = p.netSfl > 0.001 ? "positive" : p.netSfl < -0.001 ? "negative" : "zero";
          const sel = i === selectedIdx ? " selected" : "";
          const timeLabel = p.time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
          const isPositive = p.netSfl >= 0;
          out += `<div class="diff-bar-wrap${sel}" onclick="window._diffSelect(${i})" title="${timeLabel}: ${p.netSfl >= 0 ? '+' : ''}${p.netSfl.toFixed(2)} SFL">
            <div class="diff-bar-top">${isPositive ? `<div class="diff-bar positive" style="height:${pct}%"></div>` : ''}</div>
            <div class="diff-bar-bot">${!isPositive ? `<div class="diff-bar negative" style="height:${pct}%"></div>` : ''}</div>
          </div>`;
        }

        out += `</div></div></div>`;

        // Selected snapshot detail
        if (selectedIdx >= 0 && selectedIdx < processed.length) {
          const p = processed[selectedIdx];
          const prev = selectedIdx > 0 ? processed[selectedIdx - 1] : null;
          const timeFmt = p.time.toLocaleString();

          const visibleItems = showZeroPrice ? p.items : p.items.filter(it => it.hasPrice);

          out += `<div class="pixel-panel diff-detail">
            <div class="diff-detail-header">
              <div>
                <div class="diff-detail-time">${escHTML(timeFmt)}</div>
                <div style="font-size:0.5rem;color:var(--text-dim)">${p.items.length} changes${!showZeroPrice && p.items.length !== visibleItems.length ? ` (${p.items.length - visibleItems.length} hidden)` : ''}</div>
              </div>
              <div class="diff-detail-net" style="color:${p.netSfl >= 0 ? 'var(--green)' : 'var(--red)'}">
                ${p.netSfl >= 0 ? '+' : ''}${p.netSfl.toFixed(4)} ${sflIcon("0.85em")}
              </div>
            </div>`;

          if (visibleItems.length > 0) {
            out += `<table class="diff-item-table">
              <thead><tr><th>Item</th><th>Change</th><th>Unit Price</th><th>SFL Value</th></tr></thead><tbody>`;
            for (const it of visibleItems) {
              const rowCls = it.sflValue > 0.0001 ? "gain" : it.sflValue < -0.0001 ? "loss" : "neutral";
              const unitPrice = it.category === "sfl" ? "1.0000" :
                it.delta !== 0 && it.sflValue !== 0 ? Math.abs(it.sflValue / it.delta).toFixed(4) : "\u2014";
              const deltaStr = it.category === "sfl" ? (it.delta >= 0 ? "+" : "") + it.delta.toFixed(4) :
                (it.delta >= 0 ? "+" : "") + (Number.isInteger(it.delta) ? it.delta.toString() : it.delta.toFixed(2));
              const valStr = it.sflValue !== 0 ? (it.sflValue >= 0 ? "+" : "") + it.sflValue.toFixed(4) : "\u2014";
              // Icon: SFL icon for balance, item image for everything else
              const iconName = it.category === "sfl" ? null : it.category === "coins" ? "Coins" : it.itemName;
              const iconHtml = it.category === "sfl"
                ? `${sflIcon("14px")} `
                : iconName ? `<img src="${getItemIcon(iconName)}" style="height:14px;vertical-align:middle;margin-right:3px" onerror="this.style.display='none'">` : '';
              out += `<tr class="${rowCls}"><td>${iconHtml}${escHTML(it.itemName)}</td><td>${deltaStr}</td><td>${unitPrice}</td><td>${valStr}</td></tr>`;
            }
            out += `</tbody></table>`;
          } else {
            out += `<div style="text-align:center;color:var(--text-dim);font-size:0.6875rem;padding:12px 0">No priced items in this snapshot</div>`;
          }
          out += `</div>`;
        }

        document.getElementById("diff-content").innerHTML = out;
      }

      // Global handlers
      window._diffSelect = function(idx) {
        selectedIdx = idx;
        renderContent();
      };
      window._diffToggleZero = function(checked) {
        showZeroPrice = checked;
        renderContent();
      };

      renderContent();
    }


    // ═══════════════════════════════════════
    //  JSON EXPLORER
    // ═══════════════════════════════════════

    let _jsonSearchTimer = null;
    let _jsonRawData = null;

    function renderJsonExplorer(data) {
      _jsonRawData = data.farm || data;
      const app = document.getElementById("app");
      let html = `<div class="page-section">`;
      html += `<h2 class="section-title" style="text-align:center">JSON EXPLORER</h2>`;
      html += `<div style="text-align:center;margin-bottom:8px;font-size:0.75rem;color:var(--text-dim)">Farm #${FARM_ID}</div>`;
      html += `<div style="background:rgba(46,125,50,0.12);border:2px solid rgba(46,125,50,0.3);border-radius:6px;padding:8px 12px;margin-bottom:12px;font-size:0.7rem;color:var(--text-primary);text-align:center">`;
      html += `Browse the full API response. Click arrows to expand, hover for copy path button.</div>`;
      html += `<div class="json-search-bar">`;
      html += `<input type="text" id="json-search-input" placeholder="Search keys & values..." autocomplete="off">`;
      html += `<span class="json-match-count" id="json-match-count"></span>`;
      html += `</div>`;
      html += `<div class="json-tree" id="json-tree"></div>`;
      html += `</div>`;
      html += `<div class="json-copied-toast" id="json-toast"></div>`;
      app.innerHTML = html;

      // Build root
      const tree = document.getElementById("json-tree");
      const rootNode = jsonBuildNode("farm", _jsonRawData, "farm", 0, false);
      tree.appendChild(rootNode);

      // Auto-expand root to depth 1
      jsonExpandNode(rootNode);

      // Event delegation
      tree.addEventListener("click", function(e) {
        const toggle = e.target.closest(".json-toggle");
        if (toggle) {
          const node = toggle.closest(".json-node");
          if (node) jsonToggleNode(node);
          return;
        }
        const key = e.target.closest(".json-key, .json-key-arr");
        if (key) {
          const node = key.closest(".json-node");
          if (node && node.querySelector(".json-children")) jsonToggleNode(node);
          return;
        }
        const copyBtn = e.target.closest(".json-path-btn");
        if (copyBtn) {
          jsonCopyPath(copyBtn.dataset.path);
          return;
        }
      });

      // Search
      const searchInput = document.getElementById("json-search-input");
      searchInput.addEventListener("input", function() {
        clearTimeout(_jsonSearchTimer);
        _jsonSearchTimer = setTimeout(() => jsonSearch(this.value.trim()), 200);
      });
    }

    function jsonBuildNode(key, value, path, depth, parentIsArray) {
      const node = document.createElement("div");
      node.className = "json-node";
      node._jsonValue = value;
      node._jsonPath = path;
      node._jsonDepth = depth;

      const line = document.createElement("div");
      line.className = "json-line";

      const isObj = value !== null && typeof value === "object" && !Array.isArray(value);
      const isArr = Array.isArray(value);
      const isExpandable = isObj || isArr;

      // Toggle arrow
      const toggle = document.createElement("span");
      if (isExpandable) {
        toggle.className = "json-toggle";
        toggle.textContent = "\u25B6";
      } else {
        toggle.style.width = "16px";
        toggle.style.display = "inline-block";
        toggle.style.flexShrink = "0";
      }
      line.appendChild(toggle);

      // Icon (try for game items)
      const iconUrl = jsonDetectIcon(key);
      if (iconUrl) {
        const icon = document.createElement("img");
        icon.className = "json-icon";
        icon.src = iconUrl;
        icon.onerror = function() { this.style.display = "none"; };
        line.appendChild(icon);
      }

      // Key label
      const keySpan = document.createElement("span");
      if (parentIsArray) {
        keySpan.className = "json-key-arr";
        keySpan.textContent = `[${key}]`;
      } else {
        keySpan.className = "json-key";
        keySpan.textContent = key;
      }
      line.appendChild(keySpan);

      // Colon
      const colon = document.createTextNode(": ");
      line.appendChild(colon);

      // Badge or value
      if (isObj) {
        const keys = Object.keys(value);
        const badge = document.createElement("span");
        badge.className = "json-badge";
        badge.textContent = `{${keys.length} key${keys.length !== 1 ? "s" : ""}}`;
        line.appendChild(badge);
      } else if (isArr) {
        const badge = document.createElement("span");
        badge.className = "json-badge";
        badge.textContent = `[${value.length} item${value.length !== 1 ? "s" : ""}]`;
        line.appendChild(badge);
      } else {
        const valSpan = document.createElement("span");
        if (value === null) {
          valSpan.className = "json-val-null";
          valSpan.textContent = "null";
        } else if (typeof value === "boolean") {
          valSpan.className = "json-val-boolean";
          valSpan.textContent = String(value);
        } else if (typeof value === "number") {
          valSpan.className = "json-val-number";
          valSpan.textContent = String(value);
        } else {
          valSpan.className = "json-val-string";
          const str = String(value);
          valSpan.textContent = '"' + (str.length > 120 ? str.slice(0, 120) + "..." : str) + '"';
        }
        line.appendChild(valSpan);
      }

      // Copy path button
      const copyBtn = document.createElement("button");
      copyBtn.className = "json-path-btn";
      copyBtn.textContent = "\u{1F4CB}";
      copyBtn.title = "Copy path: " + path;
      copyBtn.dataset.path = path;
      line.appendChild(copyBtn);

      node.appendChild(line);

      // Children container (lazy)
      if (isExpandable) {
        const children = document.createElement("div");
        children.className = "json-children";
        children.dataset.rendered = "false";
        node.appendChild(children);
      }

      return node;
    }

    function jsonDetectIcon(key) {
      if (typeof key !== "string") return null;
      if (ITEM_IMAGE_MAP[key]) return ITEM_IMAGE_MAP[key];
      // Heuristic: capitalized multi-word keys are likely game items
      if (/^[A-Z][a-z]/.test(key) && /\s/.test(key)) {
        return ITEM_ICON_BASE + encodeURIComponent(key) + ".png";
      }
      return null;
    }

    function jsonExpandNode(nodeEl) {
      const children = nodeEl.querySelector(":scope > .json-children");
      if (!children) return;
      const toggle = nodeEl.querySelector(":scope > .json-line > .json-toggle");

      // Lazy render children
      if (children.dataset.rendered === "false") {
        const value = nodeEl._jsonValue;
        const path = nodeEl._jsonPath;
        const depth = nodeEl._jsonDepth;
        const frag = document.createDocumentFragment();

        const isArr = Array.isArray(value);
        const entries = isArr ? value.map((v, i) => [i, v]) : Object.entries(value);
        const MAX_CHILDREN = 500;
        const limited = entries.length > MAX_CHILDREN;
        const toRender = limited ? entries.slice(0, MAX_CHILDREN) : entries;

        for (const [k, v] of toRender) {
          const childPath = isArr ? `${path}[${k}]` : `${path}.${k}`;
          frag.appendChild(jsonBuildNode(String(k), v, childPath, depth + 1, isArr));
        }

        if (limited) {
          const more = document.createElement("div");
          more.className = "json-more-indicator";
          more.textContent = `... ${entries.length - MAX_CHILDREN} more items (${entries.length} total)`;
          frag.appendChild(more);
        }

        children.appendChild(frag);
        children.dataset.rendered = "true";
      }

      children.classList.add("open");
      if (toggle) toggle.textContent = "\u25BC";
    }

    function jsonCollapseNode(nodeEl) {
      const children = nodeEl.querySelector(":scope > .json-children");
      if (!children) return;
      const toggle = nodeEl.querySelector(":scope > .json-line > .json-toggle");
      children.classList.remove("open");
      if (toggle) toggle.textContent = "\u25B6";
    }

    function jsonToggleNode(nodeEl) {
      const children = nodeEl.querySelector(":scope > .json-children");
      if (!children) return;
      if (children.classList.contains("open")) {
        jsonCollapseNode(nodeEl);
      } else {
        jsonExpandNode(nodeEl);
      }
    }

    function jsonSearch(query) {
      const tree = document.getElementById("json-tree");
      const countEl = document.getElementById("json-match-count");
      if (!tree || !countEl) return;

      // Clear previous highlights
      tree.querySelectorAll(".json-match").forEach(el => el.classList.remove("json-match"));

      if (!query || query.length < 2) {
        countEl.textContent = "";
        return;
      }

      const lowerQ = query.toLowerCase();
      const matches = [];
      const MAX_MATCHES = 200;
      const MAX_DEPTH = 20;

      // Walk raw JSON to find matching paths
      function walk(obj, path, depth) {
        if (matches.length >= MAX_MATCHES || depth > MAX_DEPTH) return;
        if (obj === null || typeof obj !== "object") return;

        const entries = Array.isArray(obj) ? obj.map((v, i) => [String(i), v]) : Object.entries(obj);
        for (const [k, v] of entries) {
          if (matches.length >= MAX_MATCHES) break;
          const childPath = Array.isArray(obj) ? `${path}[${k}]` : `${path}.${k}`;
          const keyMatch = k.toLowerCase().includes(lowerQ);
          let valMatch = false;
          if (v !== null && typeof v !== "object") {
            valMatch = String(v).toLowerCase().includes(lowerQ);
          }
          if (keyMatch || valMatch) {
            matches.push(childPath);
          }
          if (typeof v === "object" && v !== null) {
            walk(v, childPath, depth + 1);
          }
        }
      }

      walk(_jsonRawData, "farm", 0);

      // Expand paths and highlight
      for (const matchPath of matches) {
        const segments = jsonParsePath(matchPath);
        const lineEl = jsonExpandToPath(tree, segments);
        if (lineEl) {
          lineEl.classList.add("json-match");
        }
      }

      countEl.textContent = matches.length >= MAX_MATCHES
        ? `${MAX_MATCHES}+ matches`
        : `${matches.length} match${matches.length !== 1 ? "es" : ""}`;

      // Scroll to first match
      const first = tree.querySelector(".json-match");
      if (first) first.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    function jsonParsePath(path) {
      // "farm.inventory.Wood" → ["farm", "inventory", "Wood"]
      // "farm.buildings.Fire Pit[0].createdAt" → ["farm", "buildings", "Fire Pit", "0", "createdAt"]
      const segments = [];
      let current = "";
      let i = 0;
      while (i < path.length) {
        if (path[i] === ".") {
          if (current) segments.push(current);
          current = "";
          i++;
        } else if (path[i] === "[") {
          if (current) segments.push(current);
          current = "";
          i++;
          while (i < path.length && path[i] !== "]") {
            current += path[i];
            i++;
          }
          if (current) segments.push(current);
          current = "";
          i++; // skip ]
        } else {
          current += path[i];
          i++;
        }
      }
      if (current) segments.push(current);
      return segments;
    }

    function jsonExpandToPath(tree, segments) {
      // Walk DOM nodes, expanding along the path
      let currentNode = tree.querySelector(":scope > .json-node"); // root "farm" node
      if (!currentNode || segments.length === 0) return null;

      // First segment is "farm" (root) — expand it
      jsonExpandNode(currentNode);

      for (let i = 1; i < segments.length; i++) {
        const seg = segments[i];
        const children = currentNode.querySelector(":scope > .json-children");
        if (!children) return currentNode.querySelector(":scope > .json-line");

        // Ensure rendered
        if (children.dataset.rendered === "false") {
          jsonExpandNode(currentNode);
        }

        // Find child with matching key
        let found = null;
        for (const child of children.querySelectorAll(":scope > .json-node")) {
          const keyEl = child.querySelector(":scope > .json-line > .json-key, :scope > .json-line > .json-key-arr");
          if (!keyEl) continue;
          const keyText = keyEl.textContent.replace(/^\[|\]$/g, "");
          if (keyText === seg) {
            found = child;
            break;
          }
        }

        if (!found) return currentNode.querySelector(":scope > .json-line");
        jsonExpandNode(found);
        currentNode = found;
      }

      return currentNode.querySelector(":scope > .json-line");
    }

    function jsonCopyPath(path) {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(path).then(() => jsonShowToast(path));
      } else {
        prompt("Copy path:", path);
      }
    }

    function jsonShowToast(path) {
      const toast = document.getElementById("json-toast");
      if (!toast) return;
      toast.textContent = "Copied: " + path;
      toast.classList.add("show");
      setTimeout(() => toast.classList.remove("show"), 1500);
    }

        switch (page) {
          case "dashboard": renderDashboard(data); break;
          case "hub": renderHub(data); break;
          case "flowers": renderFlowers(data); break;
          case "dolls": renderDolls(data); break;
          case "crustaceans": renderCrustaceans(data); break;
          case "bumpkin": renderBumpkin(data); break;
          case "treasury": renderTreasury(data); break;
          case "sales": renderSales(data); break;
          case "power": renderPower(data); break;
          case "buds": renderBuds(data); break;
          case "pets": renderPets(data); break;
          case "diff": renderDiff(data); break;
          case "json": renderJsonExplorer(data); break;
          default: renderDashboard(data);
        }

        if (page === "dashboard") {
          startGrowingTimers();
        }
        if (page === "flowers") {
          startPBTimer();
          startGrowingTimers();
        }
        if (page === "dolls" && data.craftingBox?.readyAt) {
          startGrowingTimers();
        }

        fetch(`/api/track?farm=${FARM_ID}&page=${page}`).catch(() => {});
      } catch (err) {
        console.error(err);
        const needsConfig = !FARM_ID;
        app.innerHTML = `<div class="error-screen pixel-panel pixel-font">
          <div class="icon">${needsConfig ? "👆" : "⚠️"}</div>
          <h2>${needsConfig ? "Enter your Farm ID above" : "Failed to load data"}</h2>
          <p>${escHTML(err.message)}</p>
          ${needsConfig ? `<p style="font-size: 0.625rem;color:var(--text-dim)">
            Enter your farm number to get started.<br>
            Your settings will be saved in the URL for bookmarking.
          </p>` : ""}
          <button class="refresh-btn" onclick="refresh()">RETRY</button>
        </div>`;
      }
    }

    // Enter key in config inputs triggers load
    document.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && e.target.closest(".config-bar")) applyConfig();
    });

    // Init
    migrateApiKey();
    main();

    // Register service worker for PWA
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }