// ── Fishing data (rod cost + per-fish probability model) ──
// Source: sunflower-land game repo (fishing.ts, tools.ts)
// Rod is consumed per cast: 20 coins + 3 Wood + 1 Stone (Reel Deal skill -50%)
export const FISHING_ROD_COST = { coins: 20, materials: { Wood: 3, Stone: 1 } };

// Fish tier (per game source FISH definition) — used for +1 fish boosts that target a tier
export const FISH_TIER_MAP = {
  // Basic
  "Anchovy":"basic","Butterflyfish":"basic","Blowfish":"basic","Clownfish":"basic",
  "Sea Bass":"basic","Sea Horse":"basic","Horse Mackerel":"basic","Halibut":"basic",
  "Squid":"basic","Porgy":"basic","Muskellunge":"basic","Tilapia":"basic",
  // Advanced
  "Red Snapper":"advanced","Moray Eel":"advanced","Olive Flounder":"advanced",
  "Napoleanfish":"advanced","Surgeonfish":"advanced","Angelfish":"advanced",
  "Zebra Turkeyfish":"advanced","Ray":"advanced","Hammerhead Shark":"advanced",
  // Expert
  "Tuna":"expert","Mahi Mahi":"expert","Blue Marlin":"expert","Oarfish":"expert",
  "Football Fish":"expert","Sunfish":"expert","Coelacanth":"expert","Trout":"expert",
  "Walleye":"expert","Weakfish":"expert","Rock Blackfish":"expert","Cobia":"expert",
  "Barred Knifejaw":"expert","Parrotfish":"expert"
};

// Worm-bait: avg yield per composter cycle (game roll: 2-4 / 2-3 / 1-3)
export const BAIT_WORM_YIELD = { "Earthworm": 3.0, "Grub": 2.4, "Red Wiggler": 1.83 };

// Per-fish best-bait + best-chum + estimated catch probability with chum
// Tier-based prob estimate: basic ~0.30, advanced ~0.18, expert ~0.10
// Without chum drops ~3x. Source: sunflower-land FISH constants + estimation.
export const FISH_DATA = {
  // Each fish has 1-2 paths: cost = min(noChum, guaranteed). Picks cheapest at runtime.
  // Source: sfl.world/info/fishing/bait empirical data (24h+ samples) + fishing.ts likes
  "Anchovy":         { paths: [{ bait: "Earthworm",  prob: 0.244 }, { bait: "Earthworm",  chum: "Egg",       chumQty: 5  }] },
  "Butterflyfish":   { paths: [{ bait: "Earthworm",  prob: 0.079 }, { bait: "Earthworm",  chum: "Sunflower", chumQty: 50 }] },
  "Blowfish":        { paths: [{ bait: "Earthworm",  prob: 0.054 }, { bait: "Earthworm",  chum: "Yam",       chumQty: 20 }] },
  "Clownfish":       { paths: [{ bait: "Earthworm",  prob: 0.066 }, { bait: "Earthworm",  chum: "Cabbage",   chumQty: 10 }] },
  "Sea Bass":        { paths: [{ bait: "Earthworm",  prob: 0.058 }] },
  "Sea Horse":       { paths: [{ bait: "Earthworm",  prob: 0.032 }, { bait: "Earthworm",  chum: "Seaweed",   chumQty: 1  }] },
  "Horse Mackerel":  { paths: [{ bait: "Earthworm",  chum: "Blueberry", chumQty: 3 }] },
  "Halibut":         { paths: [{ bait: "Earthworm",  prob: 0.091 }] },
  "Squid":           { paths: [{ bait: "Earthworm",  prob: 0.0002}, { bait: "Earthworm",  chum: "Eggplant",  chumQty: 5  }] },
  "Porgy":           { paths: [{ bait: "Earthworm",  prob: 0.037 }, { bait: "Earthworm",  chum: "Yam",       chumQty: 20 }] },
  "Muskellunge":     { paths: [{ bait: "Earthworm",  prob: 0.022 }, { bait: "Earthworm",  chum: "Turnip",    chumQty: 5  }] },
  "Red Snapper":     { paths: [{ bait: "Grub",       prob: 0.248 }, { bait: "Red Wiggler",chum: "Honey",     chumQty: 1  }] },
  "Moray Eel":       { paths: [{ bait: "Earthworm",  prob: 0.051 }, { bait: "Earthworm",  chum: "Gold",      chumQty: 1  }] },
  "Olive Flounder":  { paths: [{ bait: "Earthworm",  prob: 0.030 }, { bait: "Earthworm",  chum: "Rhubarb",   chumQty: 20 }] },
  "Napoleanfish":    { paths: [{ bait: "Grub",       prob: 0.046 }, { bait: "Grub",       chum: "Carrot",    chumQty: 10 }] },
  "Surgeonfish":     { paths: [{ bait: "Grub",       prob: 0.051 }, { bait: "Grub",       chum: "Orange",    chumQty: 3  }] },
  "Angelfish":       { paths: [{ bait: "Grub",       prob: 0.005 }, { bait: "Grub",       chum: "Banana",    chumQty: 3  }] },
  "Zebra Turkeyfish":{ paths: [{ bait: "Grub",       prob: 0.057 }, { bait: "Grub",       chum: "Beetroot",  chumQty: 10 }] },
  "Ray":             { paths: [{ bait: "Grub",       prob: 0.005 }] },
  "Hammerhead Shark":{ paths: [{ bait: "Grub",       chum: "Iron",      chumQty: 5  }] },
  "Barred Knifejaw": { paths: [{ bait: "Grub",       prob: 0.0001}] },
  "Walleye":         { paths: [{ bait: "Grub",       prob: 0.037 }, { bait: "Grub",       chum: "Broccoli",  chumQty: 10 }] },
  "Rock Blackfish":  { paths: [{ bait: "Grub",       prob: 0.023 }, { bait: "Grub",       chum: "Onion",     chumQty: 5  }] },
  "Tilapia":         { paths: [{ bait: "Grub",       prob: 0.024 }, { bait: "Grub",       chum: "Zucchini",  chumQty: 20 }] },
  "Tuna":            { paths: [{ bait: "Red Wiggler",prob: 0.273 }, { bait: "Grub",       chum: "Wild Mushroom", chumQty: 1 }] },
  "Mahi Mahi":       { paths: [{ bait: "Grub",       prob: 0.024 }, { bait: "Grub",       chum: "Corn",      chumQty: 5  }] },
  "Blue Marlin":     { paths: [{ bait: "Grub",       prob: 0.012 }, { bait: "Grub",       chum: "Wheat",     chumQty: 5  }] },
  "Oarfish":         { paths: [{ bait: "Red Wiggler",prob: 0.071 }, { bait: "Red Wiggler",chum: "Kale",      chumQty: 5  }] },
  "Football Fish":   { paths: [{ bait: "Red Wiggler",chum: "Sunflower", chumQty: 50 }] },
  "Sunfish":         { paths: [{ bait: "Red Wiggler",prob: 0.074 }] },
  "Coelacanth":      { paths: [{ bait: "Red Wiggler",prob: 0.002 }, { bait: "Red Wiggler",chum: "Cabbage",   chumQty: 10 }] },
  "Parrotfish":      { paths: [{ bait: "Red Wiggler",prob: 0.003 }, { bait: "Red Wiggler",chum: "Seaweed",   chumQty: 1  }] },
  "Cobia":           { paths: [{ bait: "Red Wiggler",prob: 0.030 }, { bait: "Red Wiggler",chum: "Broccoli",  chumQty: 10 }] },
  "Trout":           { paths: [{ bait: "Red Wiggler",prob: 0.029 }, { bait: "Red Wiggler",chum: "Pepper",    chumQty: 10 }] },
  "Weakfish":        { paths: [{ bait: "Red Wiggler",prob: 0.043 }, { bait: "Red Wiggler",chum: "Artichoke", chumQty: 3  }] },

};

export const FISH_MARKET_RECIPES = {
  "Fish Flake": {
    autumn: { "Anchovy": 4, "Halibut": 2, "Muskellunge": 2 },
    winter: { "Anchovy": 4, "Blowfish": 2, "Clownfish": 2 },
    spring: { "Anchovy": 4, "Porgy": 2, "Sea Bass": 2 },
    summer: { "Anchovy": 4, "Butterflyfish": 2, "Sea Horse": 2 },
  },
  "Fish Stick": {
    autumn: { "Red Snapper": 6, "Moray Eel": 2, "Napoleanfish": 2 },
    winter: { "Red Snapper": 6, "Walleye": 2, "Angelfish": 2 },
    spring: { "Red Snapper": 6, "Olive Flounder": 2, "Zebra Turkeyfish": 2 },
    summer: { "Red Snapper": 6, "Surgeonfish": 2, "Tilapia": 2 },
  },
  "Crab Stick": {
    autumn: { "Crab": 1, "Shrimp": 1, "Lobster": 1, "Barnacle": 1 },
    winter: { "Crab": 1, "Oyster": 1, "Isopod": 1, "Garden Eel": 1 },
    spring: { "Crab": 1, "Blue Crab": 1, "Hermit Crab": 1, "Sea Slug": 1 },
    summer: { "Crab": 1, "Mussel": 1, "Isopod": 1, "Sea Snail": 1 },
  },
  "Fish Oil": {
    autumn: { "Tuna": 8, "Mahi Mahi": 4, "Crab": 2 },
    winter: { "Tuna": 8, "Blue Marlin": 2, "Football Fish": 2 },
    spring: { "Tuna": 8, "Weakfish": 2, "Oarfish": 2 },
    summer: { "Tuna": 8, "Cobia": 2, "Sunfish": 2 },
  },
};
