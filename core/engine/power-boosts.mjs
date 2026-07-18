// Boost-text parsing subsystem — extracted VERBATIM from flowers.html for the power
// section. Data tables (grow-data, boost rules) are duplicated in core here; the inline
// copies stay until their other consumers migrate. DOM-free.

    export const CROP_GROW_DATA = {
      "Sunflower": 60, "Potato": 300, "Rhubarb": 600, "Pumpkin": 1800, "Zucchini": 1800,
      "Carrot": 3600, "Yam": 3600, "Cabbage": 7200, "Broccoli": 7200, "Soybean": 10800,
      "Beetroot": 14400, "Pepper": 14400, "Cauliflower": 28800, "Parsnip": 43200,
      "Eggplant": 57600, "Corn": 72000, "Onion": 72000,
      "Radish": 86400, "Wheat": 86400, "Turnip": 86400,
      "Kale": 129600, "Artichoke": 129600, "Barley": 172800,
    };

    export const FRUIT_GROW_DATA = {
      "Apple": 43200, "Blueberry": 21600, "Orange": 28800, "Banana": 43200,
      "Lemon": 14400, "Tomato": 7200,
    };
    // Number of harvests before fruit tree becomes a stump (chop for 1 Wood, costs 1 Axe)
    const FRUIT_HARVEST_COUNT = {
      "Tomato": 4, "Lemon": 4, "Blueberry": 4,
      "Orange": 4, "Apple": 4, "Banana": 4,
    };

    export const GREENHOUSE_GROW_DATA = {
      "Grape": 43200, "Rice": 115200, "Olive": 158400,
    };

    export const SKILL_FEED_EFFECTS = {
      "Efficient Feeding":    { chickens: -0.05, cows: -0.05, sheep: -0.05 },
      "Clucky Grazing":       { chickens: -0.25, cows: 0.50, sheep: 0.50 },
      "Sheepwise Diet":       { chickens: 0.50, cows: 0.50, sheep: -0.25 },
      "Cow-Smart Nutrition":  { chickens: 0.50, cows: -0.25, sheep: 0.50 },
      "Chonky Feed":          { chickens: -0.25, cows: -0.25, sheep: -0.25 }, // net of +50% food x 2x XP (half feedings) = x0.75
    };

    export const PRODUCT_TO_CATEGORY = {};
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
      // Golden animals — free feeding for their species (capacity.goldenAnimals already detects ownership,
      // but parser routing keeps them in their proper category & exposes the savings as a free_feed effect
      // so the ROI page can scenario-toggle the goldenAnimals flag.
      "Gold Egg": [
        { type: "free_feed", cat: "chickens", raw: "Feed Chickens for free" },
      ],
      "Golden Cow": [
        { type: "free_feed", cat: "cows", raw: "Feed Cows for free" },
      ],
      "Golden Sheep": [
        { type: "free_feed", cat: "sheep", raw: "Feed Sheep for free" },
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
      // "+N% Oil consumption" (Greasy Plants) → greenhouse burns more oil per seed = a COST penalty, not oil yield
      { rx: /([+-]?\d+)%\s+Oil\s+consumption/i,
        fn: m => ({ type: "oil_consumption_pct", value: parseInt(m[1]), cat: "greenhouse", raw: m[0] }) },
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
          if (/\bpet\b/.test(ctx)) cat = "pets";
          else if (/\bcow\b/.test(ctx)) cat = "cows";
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
      // "Mine stone without pickaxes" (Quarry), "Mine crimstone without Gold Pickaxes" (Crimstone Spikes Hair)
      // → tool cost = 0 for the named resource. Capture resource name and map to category.
      { rx: /mine\s+(stone|iron|gold|crimstone)s?\s+without\s+(?:[\w\s]+\s+)?pickaxes?/i,
        fn: m => {
          const r = (m[1] || '').toLowerCase();
          const catMap = { stone: "stone", iron: "iron", gold: "gold", crimstone: "crimstone" };
          return { type: "free_tool", cat: catMap[r] || "stone" };
        }},
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
      // Hour-based animal sleep time: "-2h Chicken Sleep Time" (El Pollo Veloz)
      // Animal cycle is 24h → convert hours to equivalent speed_pct.
      { rx: /([+-]?\d+\.?\d*)\s*h(?:ours?)?\s+(Chicken|Cow|Sheep)\s+(?:Sleep|Production)\s+Time/i,
        fn: m => {
          const hours = parseFloat(m[1]);
          const key = m[2].charAt(0).toUpperCase() + m[2].slice(1).toLowerCase();
          const animalCats = { "Chicken": "chickens", "Cow": "cows", "Sheep": "sheep" };
          return { type: "speed_pct", value: (hours / 24) * 100, cat: animalCats[key] || "other" };
        }},
      // Animal feed reduction NFTs: "-10% Feed to Chicken" (Fat Chicken), "-5% Sheep Feed" (Mermaid Sheep)
      // feed_reduction value follows SKILL_FEED_EFFECTS convention (negative = reduction).
      { rx: /([+-]?\d+\.?\d*)%\s+(?:Feed\s+to\s+(Chicken|Cow|Sheep)|(Chicken|Cow|Sheep)\s+Feed)\b/i,
        fn: m => {
          const pct = parseFloat(m[1]);
          const animal = m[2] || m[3];
          const key = animal.charAt(0).toUpperCase() + animal.slice(1).toLowerCase();
          const animalCats = { "Chicken": "chickens", "Cow": "cows", "Sheep": "sheep" };
          return { type: "feed_reduction", value: -Math.abs(pct) / 100, cat: animalCats[key] || "other" };
        }},
      // Specific animal time: "-10% Chicken Time", "-25% Sheep Production Time"
      { rx: /([+-]?\d+\.?\d*)%\s+(Chicken|Cow|Sheep)\s+.*(?:Time|time)/i,
        fn: m => {
          const key = m[2].charAt(0).toUpperCase() + m[2].slice(1).toLowerCase();
          const animalCats = { "Chicken": "chickens", "Cow": "cows", "Sheep": "sheep" };
          return { type: "speed_pct", value: parseFloat(m[1]), cat: animalCats[key] || "other" };
        }},
      // Crop Machine boosts: "-50% Growth Time in Crop Machine" (Groovy Gramophone) — qualitative for crops
      { rx: /Growth\s+Time\s+in\s+Crop\s+Machine|Crop\s+Machine\s+(?:Growth|Production)/i,
        fn: m => ({ type: "qualitative", cat: "crops", raw: m[0] }) },
      // Fishing minigame / fishing-treasure qualitative: surfaces in FISHING row
      { rx: /fishing\s+minigame|treasure\s+when\s+fishing/i,
        fn: m => ({ type: "qualitative", cat: "fishing", raw: m[0] }) },
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
          const prodClean = prodRaw.replace(/\s+(from|per|when|while|on)\s+.+$/i, '').trim();
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
      // ── Pet boosts (qualitative — pets system: feeding, XP, satiation) ──
      // Match before generic XP rule (which would route "Pet XP" to "other").
      { rx: /\bpet\s+(?:xp|energy|satiation|food|bowl|level)|feed\s+pets?\s+for\s+free|feeding\s+pets?\s+fully|next\s+reset\s+is\s+free/i,
        fn: m => ({ type: "qualitative", cat: "pets", raw: m[0] }) },
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

export function parseBoostEffects(boostText, itemName) {
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

export function classifyToCategories(effects) {
      const cats = new Set();
      for (const e of effects) {
        if (e.cat) cats.add(e.cat);
      }
      if (cats.size === 0) cats.add("other");
      return [...cats];
    }
