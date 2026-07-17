// ── Seed costs (coins per seed) ──
export const SEED_COSTS = {
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

// Eins (Potion House) buy price in Potion Tickets — from SFL collectibles.ts
// POTION_HOUSE_EXOTIC_CROPS. This is the *acquisition* cost (player → NPC,
// you pay tickets to GET the item), which is what matters when valuing what
// you'd give to a bounty. The sellPrice (NPC → player) from beans.ts
// EXOTIC_CROPS would be the wrong direction — what you'd get if you JUST
// sold, not what it cost to acquire.
export const POTION_TICKET_COIN_VALUE = 15;   // 1 Potion Ticket ≈ 15 coins
export const EXOTIC_CROPS_TICKET_COST = {
  "Black Magic":         8000,
  "Golden Helios":       4000,
  "Chiogga":             2000,
  "Purple Cauliflower":  800,
  "Adirondack Potato":   600,
  "Warty Goblin Pumpkin":400,
  "White Carrot":        200,
};
// Giant fruits aren't sold at Eins — they're a random chance from growing
// fruit trees. Use sellPrice as the closest proxy for "value to a farmer".
export const GIANT_FRUIT_SELL_PRICES = {
  "Giant Orange": 800,
  "Giant Apple":  2000,
  "Giant Banana": 5000,
};

export const TOOL_COSTS = {
  "Axe":            { coins: 20 },
  "Pickaxe":        { coins: 20, materials: { Wood: 3 } },
  "Stone Pickaxe":  { coins: 20, materials: { Wood: 3, Stone: 5 } },
  "Iron Pickaxe":   { coins: 80, materials: { Wood: 3, Iron: 5 } },
  "Gold Pickaxe":   { coins: 100, materials: { Wood: 3, Gold: 3 } },
  "Oil Drill":      { coins: 100, materials: { Wood: 20, Iron: 9, Leather: 10 } },
  "Rod":            { coins: 20, materials: { Wood: 3, Stone: 1 } },
  "Crab Pot":       { coins: 250, materials: { Feather: 5, Wool: 3 } },
  "Mariner Pot":    { coins: 500, materials: { Feather: 10, "Merino Wool": 10 } },
  "Sand Shovel":    { coins: 20, materials: { Wood: 2, Stone: 1 } },
  "Sand Drill":     { coins: 40, materials: { Oil: 1, Crimstone: 1, Wood: 3, Leather: 1 } },
};

export const FLOWER_SEED_COIN_COSTS = {
  "Sunpetal Seed": 240, "Bloom Seed": 480, "Lily Seed": 1200,
  "Celestine Seed": 720, "Clover Seed": 720, "Edelweiss Seed": 720,
  "Lavender Seed": 720, "Gladiolus Seed": 720,
};

// ── Fish/food XP values (for XP-based pricing) ──
export const ITEM_XP_VALUES = {
  // Fish (base XP from sfl.world/info/fish-xp)
  "Anchovy": 60, "Butterflyfish": 70, "Blowfish": 80, "Clownfish": 90,
  "Sea Bass": 100, "Sea Horse": 110, "Horse Mackerel": 120, "Halibut": 100,
  "Squid": 130, "Porgy": 100, "Muskellunge": 100,
  "Red Snapper": 140, "Moray Eel": 150, "Olive Flounder": 160,
  "Napoleanfish": 170, "Surgeonfish": 180, "Angelfish": 100,
  "Zebra Turkeyfish": 190, "Ray": 200, "Hammerhead Shark": 210,
  "Barred Knifejaw": 220, "Walleye": 100, "Rock Blackfish": 100,
  "Tilapia": 100, "Tuna": 230, "Mahi Mahi": 240, "Blue Marlin": 250,
  "Oarfish": 300, "Football Fish": 350, "Sunfish": 400,
  "Coelacanth": 700, "Parrotfish": 100, "Whale Shark": 750,
  "Saw Shark": 800, "White Shark": 1000, "Cobia": 100,
  "Trout": 100, "Weakfish": 100,
  // Cakes/foods not in COOKING_RECIPES_DATA
  "Pirate Cake": 3000,
};

// ── Giant item coin sell prices ──
export const GIANT_ITEM_COIN_PRICES = {
  "Giant Apple": 1500, "Giant Orange": 500, "Giant Banana": 4000,
};
