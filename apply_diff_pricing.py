#!/usr/bin/env python3
"""Add comprehensive item pricing to diff page:
- Flower seeds (coin cost)
- Flowers (seed cost via FLOWER_RECIPES)
- Treasures (TREASURE_SELL_PRICES coin cost)
- Fish/food (XP-based pricing from bumpkin calc)
- Giant items (coin sell price)
- Crustaceans (pot + chum cost from CRUSTACEAN_RECIPES)
- Tools (Rod, Crab Pot, Mariner Pot, Sand Shovel, Sand Drill)
- Oil (derived from Oil Drill cost / base yield)
"""

REAL = r'C:\Users\hlava\AppData\Local\Temp\sfl-flower-tracker\flowers.html'

with open(REAL, 'r', encoding='utf-8') as f:
    html = f.read()

# ═══════════════════════════════════════
# 1. Extend TOOL_COSTS with new tools
# ═══════════════════════════════════════
old = '''      "Oil Drill":      { coins: 100, materials: { Wood: 20, Iron: 9, Leather: 10 } },
    };

    // \u2500\u2500 Tool \u2192 resource category mapping \u2500\u2500'''
new = '''      "Oil Drill":      { coins: 100, materials: { Wood: 20, Iron: 9, Leather: 10 } },
      "Rod":            { coins: 20, materials: { Wood: 3, Stone: 1 } },
      "Crab Pot":       { coins: 250, materials: { Feather: 5, Wool: 3 } },
      "Mariner Pot":    { coins: 500, materials: { Feather: 10, "Merino Wool": 10 } },
      "Sand Shovel":    { coins: 20, materials: { Wood: 2, Stone: 1 } },
      "Sand Drill":     { coins: 40, materials: { Oil: 1, Crimstone: 1, Wood: 3, Leather: 1 } },
    };

    // \u2500\u2500 Tool \u2192 resource category mapping \u2500\u2500'''
assert old in html, "TOOL_COSTS extension anchor not found"
html = html.replace(old, new)

# ═══════════════════════════════════════
# 2. Add new pricing constants
# ═══════════════════════════════════════
old2 = '''    const CRAFTED_INGREDIENT_RECIPES = {
      "Cheese": { "Milk": 3 },
    };'''
new2 = '''    // \u2500\u2500 Flower seed coin costs \u2500\u2500
    const FLOWER_SEED_COIN_COSTS = {
      "Sunpetal Seed": 240, "Bloom Seed": 480, "Lily Seed": 1200,
      "Celestine Seed": 720, "Clover Seed": 720, "Edelweiss Seed": 720,
      "Lavender Seed": 720, "Gladiolus Seed": 720,
    };

    // \u2500\u2500 Fish/food XP values (for XP-based pricing) \u2500\u2500
    const ITEM_XP_VALUES = {
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

    // \u2500\u2500 Giant item coin sell prices \u2500\u2500
    const GIANT_ITEM_COIN_PRICES = {
      "Giant Apple": 1500, "Giant Orange": 500, "Giant Banana": 4000,
    };

    const CRAFTED_INGREDIENT_RECIPES = {
      "Cheese": { "Milk": 3 },
    };'''
assert old2 in html, "CRAFTED_INGREDIENT_RECIPES anchor not found"
html = html.replace(old2, new2)

# ═══════════════════════════════════════
# 3. Add sflPerXP variable to diff page state
# ═══════════════════════════════════════
old3 = '''      let sflToUsd = 0;
      let usdToCzk = 0;
      let sflPerXP = 0;'''

# Check if already added from previous currency patch
if old3 not in html:
    old3b = '''      let sflToUsd = 0;
      let usdToCzk = 0;
      const warnings = [];'''
    new3b = '''      let sflToUsd = 0;
      let usdToCzk = 0;
      let sflPerXP = 0;
      const warnings = [];'''
    assert old3b in html, "sflPerXP variable anchor not found"
    html = html.replace(old3b, new3b)
else:
    # Already has sflPerXP from a prior edit; add warnings line check
    pass

# In case sflPerXP is already there but without the warnings line included:
if 'let sflPerXP = 0;' not in html:
    old3c = '''      let usdToCzk = 0;
      const warnings = [];'''
    new3c = '''      let usdToCzk = 0;
      let sflPerXP = 0;
      const warnings = [];'''
    assert old3c in html, "sflPerXP fallback anchor not found"
    html = html.replace(old3c, new3c)

# ═══════════════════════════════════════
# 4. Compute sflPerXP after exchange rates loaded
# ═══════════════════════════════════════
old4 = '''      if (czkRes.ok) {
        usdToCzk = czkRes.data?.usd?.czk || 0;
      }'''
new4 = '''      if (czkRes.ok) {
        usdToCzk = czkRes.data?.usd?.czk || 0;
      }

      // Compute SFL per XP for fish/food pricing (from best cooking recipe + boosts)
      try {
        const _sc = calcSkillPointCost(data.farm?.bumpkin, p2pPrices, data.farm);
        sflPerXP = (_sc.bestRecipe && _sc.bestRecipe.boostedXP > 0)
          ? _sc.bestRecipe.cost / _sc.bestRecipe.boostedXP : 0;
      } catch(e) { sflPerXP = 0; }'''
assert old4 in html, "czkRes processing anchor not found"
html = html.replace(old4, new4)

# ═══════════════════════════════════════
# 5. Pass sflPerXP through rates in processDiff
# ═══════════════════════════════════════
old5 = 'const price = estimateItemSfl(itemName, p2pPrices, null, { coinsPerSFL });'
new5 = 'const price = estimateItemSfl(itemName, p2pPrices, null, { coinsPerSFL, sflPerXP });'
assert old5 in html, "estimateItemSfl call anchor not found"
html = html.replace(old5, new5)

# ═══════════════════════════════════════
# 6. Extend estimateItemSfl with new pricing categories
# ═══════════════════════════════════════
old6 = '''      // Love Charm: 50 LC = 1 SFL
      if (itemName === "Love Charm") return 1 / 50;

      return 0;
    }'''
new6 = '''      // Love Charm: 50 LC = 1 SFL
      if (itemName === "Love Charm") return 1 / 50;

      // Oil: derived from Oil Drill cost / base yield (~2 oil per drill)
      if (itemName === "Oil") {
        const drillPrice = estimateItemSfl("Oil Drill", p2pPrices, visited, rates);
        if (drillPrice > 0) return drillPrice / 2;
      }

      // Flower seed coin costs
      if (typeof FLOWER_SEED_COIN_COSTS !== "undefined" && FLOWER_SEED_COIN_COSTS[itemName] && rates && rates.coinsPerSFL > 0) {
        return FLOWER_SEED_COIN_COSTS[itemName] / rates.coinsPerSFL;
      }

      // Flowers \u2192 seed cost (via FLOWER_RECIPES; input flower not counted as it appears separately in diff)
      if (typeof FLOWER_RECIPES !== "undefined" && FLOWER_RECIPES[itemName]) {
        const seedName = FLOWER_RECIPES[itemName].seed;
        if (typeof FLOWER_SEED_COIN_COSTS !== "undefined" && FLOWER_SEED_COIN_COSTS[seedName] && rates && rates.coinsPerSFL > 0) {
          return FLOWER_SEED_COIN_COSTS[seedName] / rates.coinsPerSFL;
        }
      }

      // Treasure sell prices (coins \u2192 SFL)
      if (typeof TREASURE_SELL_PRICES !== "undefined" && TREASURE_SELL_PRICES[itemName] && rates && rates.coinsPerSFL > 0) {
        return TREASURE_SELL_PRICES[itemName] / rates.coinsPerSFL;
      }

      // Fish/food XP-based pricing (sflPerXP from bumpkin best cooking recipe)
      if (typeof ITEM_XP_VALUES !== "undefined" && ITEM_XP_VALUES[itemName] && rates && rates.sflPerXP > 0) {
        return ITEM_XP_VALUES[itemName] * rates.sflPerXP;
      }

      // Giant item coin sell prices
      if (typeof GIANT_ITEM_COIN_PRICES !== "undefined" && GIANT_ITEM_COIN_PRICES[itemName] && rates && rates.coinsPerSFL > 0) {
        return GIANT_ITEM_COIN_PRICES[itemName] / rates.coinsPerSFL;
      }

      // Crustaceans (pot + chum cost from CRUSTACEAN_RECIPES)
      if (typeof CRUSTACEAN_RECIPES !== "undefined" && CRUSTACEAN_RECIPES[itemName]) {
        const cr = CRUSTACEAN_RECIPES[itemName];
        const potPrice = estimateItemSfl(cr.pot, p2pPrices, visited, rates);
        let chumCost = 0;
        if (cr.chum && cr.qty > 0) {
          chumCost = estimateItemSfl(cr.chum, p2pPrices, visited, rates) * cr.qty;
          if (cr.alt) {
            const altParts = cr.alt.match(/^(.+?)\\s*x(\\d+)$/);
            if (altParts) {
              const altCost = estimateItemSfl(altParts[1], p2pPrices, visited, rates) * parseInt(altParts[2]);
              if (altCost > 0 && (chumCost <= 0 || altCost < chumCost)) chumCost = altCost;
            }
          }
        }
        if (potPrice > 0) return potPrice + chumCost;
      }

      return 0;
    }'''
assert old6 in html, "estimateItemSfl return 0 anchor not found"
html = html.replace(old6, new6)

with open(REAL, 'w', encoding='utf-8') as f:
    f.write(html)

print("OK: Comprehensive item pricing added to diff page")
print(f"File size: {len(html)} chars")
