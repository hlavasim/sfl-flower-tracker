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
  "Barred Knifejaw":"expert","Parrotfish":"expert",
  "Whale Shark":"expert","Saw Shark":"expert","White Shark":"expert"
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

/*
 * What each Fish Market bait GUARANTEES, from the game's GUARANTEED_BAIT_CATCH (fishing.ts).
 *
 * These four are bait, not chum: they replace the worm, and you then pick the fish yourself out
 * of the bait's list — no odds involved. That is the whole reason to craft one, and it is what
 * makes a rare fish costable at all: a Barred Knifejaw at p=0.0001 is ten thousand casts at
 * random and one cast with a Fish Oil.
 *
 * Spelling follows the GAME here ("Hammerhead shark", "Football fish"), which differs from the
 * consumables record used by FISH_BASE_XP / FISH_TIER_MAP — look these up case-insensitively.
 */
export const FISH_BAIT_CATCH = {
  "Fish Flake": ["Anchovy", "Butterflyfish", "Halibut", "Blowfish", "Porgy", "Clownfish", "Sea Bass", "Sea Horse", "Muskellunge", "Horse Mackerel", "Squid", "Moray Eel", "Olive Flounder", "Tilapia", "Napoleanfish", "Surgeonfish", "Zebra Turkeyfish", "Walleye", "Angelfish", "Ray"],
  "Fish Stick": ["Rock Blackfish", "Hammerhead shark", "Tuna", "Mahi Mahi", "Blue Marlin", "Weakfish", "Oarfish", "Football fish", "Sunfish", "Cobia"],
  "Fish Oil": ["Barred Knifejaw", "Trout", "Coelacanth", "Saw Shark"],
  "Crab Stick": ["Barred Knifejaw", "Whale Shark", "White Shark", "Parrotfish"],
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

/**
 * Community catch counts per worm (107k casts), pooled over the seasons each fish swims in.
 * Copied from flowers.html (FISHING page). Which worms and seasons each fish takes was checked
 * against the game's FISH record (fishing.ts) on 2026-11-25: all 38 match. The SHARES are a
 * community sample — the game draws the catch server-side, so there is no table to check them against.
 */
export const FISH_COMMUNITY_CATCH = {
  "Anchovy": { s: "wpsa", b: { Earthworm: 23153 } },
  "Angelfish": { s: "ws", b: { Grub: 423, "Fishing Lure": 237 } },
  "Barred Knifejaw": { s: "ps", b: { Grub: 240, "Fishing Lure": 19 } },
  "Blowfish": { s: "w", b: { Earthworm: 2002 } },
  "Blue Marlin": { s: "ws", b: { "Red Wiggler": 2456, "Fishing Lure": 712, Grub: 316 } },
  "Butterflyfish": { s: "sa", b: { Earthworm: 3235 } },
  "Clownfish": { s: "ws", b: { Earthworm: 2322 } },
  "Cobia": { s: "s", b: { "Red Wiggler": 1013 } },
  "Coelacanth": { s: "wp", b: { "Red Wiggler": 349, "Fishing Lure": 38 } },
  "Football fish": { s: "w", b: { "Red Wiggler": 736, "Fishing Lure": 149 } },
  "Halibut": { s: "pa", b: { Earthworm: 3271 } },
  "Hammerhead shark": { s: "sa", b: { "Fishing Lure": 123, Grub: 96 } },
  "Horse Mackerel": { s: "ws", b: { Earthworm: 371 } },
  "Mahi Mahi": { s: "sa", b: { "Red Wiggler": 2107, Grub: 738, "Fishing Lure": 301 } },
  "Moray Eel": { s: "sa", b: { Grub: 2816, Earthworm: 1667, "Fishing Lure": 1444 } },
  "Muskellunge": { s: "a", b: { Earthworm: 827 } },
  "Napoleanfish": { s: "sa", b: { Grub: 1533, "Fishing Lure": 593 } },
  "Oarfish": { s: "wp", b: { "Red Wiggler": 1596, "Fishing Lure": 498 } },
  "Olive Flounder": { s: "pa", b: { Grub: 1787, Earthworm: 1213, "Fishing Lure": 640 } },
  "Parrotfish": { s: "ps", b: { "Red Wiggler": 401, "Fishing Lure": 58 } },
  "Porgy": { s: "p", b: { Earthworm: 1408 } },
  "Ray": { s: "ps", b: { Grub: 264, "Fishing Lure": 117 } },
  "Red Snapper": { s: "wpsa", b: { Grub: 6211, "Red Wiggler": 2976, "Fishing Lure": 2226 } },
  "Rock Blackfish": { s: "a", b: { Grub: 709 } },
  "Saw Shark": { s: "ps", b: { "Red Wiggler": 69, "Fishing Lure": 16 } },
  "Sea Bass": { s: "pa", b: { Earthworm: 2299 } },
  "Sea Horse": { s: "ps", b: { Earthworm: 1192 } },
  "Squid": { s: "wp", b: { Earthworm: 1491 } },
  "Sunfish": { s: "sa", b: { "Red Wiggler": 1593, "Fishing Lure": 573 } },
  "Surgeonfish": { s: "sa", b: { Grub: 1426, "Fishing Lure": 594 } },
  "Tilapia": { s: "s", b: { Grub: 846 } },
  "Trout": { s: "w", b: { "Red Wiggler": 724 } },
  "Tuna": { s: "wpsa", b: { Grub: 9638, "Red Wiggler": 5785, "Fishing Lure": 2162 } },
  "Walleye": { s: "w", b: { Grub: 801 } },
  "Weakfish": { s: "p", b: { "Red Wiggler": 975 } },
  "Whale Shark": { s: "ws", b: { "Red Wiggler": 101, "Fishing Lure": 24 } },
  "White Shark": { s: "ws", b: { "Red Wiggler": 54, "Fishing Lure": 9 } },
  "Zebra Turkeyfish": { s: "ps", b: { Grub: 1622, "Fishing Lure": 556 } },
};
