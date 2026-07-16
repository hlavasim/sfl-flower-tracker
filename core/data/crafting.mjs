export const CRUSTACEAN_RECIPES = {
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

// Compost recipes: season-dependent inputs, base output amounts (from composterDetails)
export const COMPOST_RECIPES = {
  "Compost Bin": {
    outputs: { "Sprout Mix": 10, "Earthworm": 6 },
    inputs: {
      spring: { "Rhubarb": 10, "Carrot": 5 },
      summer: { "Zucchini": 10, "Pepper": 2 },
      autumn: { "Yam": 15 },
      winter: { "Potato": 10, "Cabbage": 3 },
    },
  },
  "Turbo Composter": {
    outputs: { "Fruitful Blend": 3, "Grub": 4 },
    inputs: {
      spring: { "Soybean": 5, "Corn": 3 },
      summer: { "Cauliflower": 4, "Eggplant": 3 },
      autumn: { "Broccoli": 10, "Artichoke": 2 },
      winter: { "Onion": 5, "Turnip": 2 },
    },
  },
  "Premium Composter": {
    outputs: { "Rapid Root": 10, "Red Wiggler": 3 },
    inputs: {
      spring: { "Blueberry": 8, "Egg": 5 },
      summer: { "Banana": 3, "Egg": 5 },
      autumn: { "Apple": 4, "Tomato": 5 },
      winter: { "Lemon": 3, "Apple": 3 },
    },
  },
};

export const CRAFTED_INGREDIENT_RECIPES = {
  "Cheese": { "Milk": 3 },
  "Kernel Blend": { "Corn": 1 },
  "Hay": { "Wheat": 1 },
  "NutriBarley": { "Barley": 1 },
  "Mixed Grain": { "Corn": 1, "Wheat": 1, "Barley": 1 },
  "Mixed Kale": { "Kale": 3 },
  "Kelp Fibre": { "Seaweed": 9 },
  "Timber": { "Wood": 9 },
  "Crimsteel": { "Crimstone": 3, "Iron": 3 },
  "Hardened Leather": { "Leather": 9 },
  "Synthetic Fabric": { "Oil": 6, "Wool": 3 },
  "Cushion": { "Feather": 9 },
  "Merino Cushion": { "Merino Wool": 9 },
  "Bee Box": { "Honey": 8 },
  "Royal Bedding": { "Merino Cushion": 5, "Synthetic Fabric": 4 },
  "Royal Ornament": { "Gold": 4, "Crimstone": 4 },
  "Ocean\'s Treasure": { "Coral": 5, "Pearl": 2, "Pirate Bounty": 1 },
  "Basic Bed": { "Cushion": 3, "Timber": 5 },
  "Fisher Bed": { "Kelp Fibre": 6, "Basic Bed": 1 },
  "Sturdy Bed": { "Merino Cushion": 3, "Crimsteel": 5, "Basic Bed": 1 },
  "Desert Bed": { "Synthetic Fabric": 8, "Sturdy Bed": 1 },
  "Cow Bed": { "Hardened Leather": 6, "Sturdy Bed": 2 },
  "Pirate Bed": { "Kelp Fibre": 3, "Vase": 2, "Ocean\'s Treasure": 1, "Sturdy Bed": 3 },
  "Royal Bed": { "Royal Bedding": 3, "Royal Ornament": 3, "Sturdy Bed": 3 },
};

export const TREASURE_SELL_PRICES = {
  "Crab": 15, "Camel Bone": 10, "Sea Cucumber": 22.5, "Vase": 50,
  "Starfish": 112.5, "Sand": 10, "Old Bottle": 22.5, "Seaweed": 75,
  "Cockle Shell": 100, "Clam Shell": 375, "Iron Compass": 187.5,
  "Pipi": 187.5, "Pearl": 3750, "Wooden Compass": 131.25,
  "Hieroglyph": 250, "Ammonite Shell": 250, "Coral": 1500, "Broken Pillar": 200,
  "Coprolite": 200, "Pirate Bounty": 7500,
};
