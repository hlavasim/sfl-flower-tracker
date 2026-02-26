#!/usr/bin/env python3
"""Add compost pricing: Sprout Mix, Fruitful Blend, Rapid Root, Earthworm, Grub, Red Wiggler.
Each compost batch has season-dependent inputs and produces fertilizer + worm.
Cost is split equally across all output units (fertilizer + worm).

Base production (from game source composterDetails):
  Compost Bin:       10 Sprout Mix + 1 Earthworm  (6h)
  Turbo Composter:    3 Fruitful Blend + 1 Grub   (8h)
  Premium Composter: 10 Rapid Root + 1 Red Wiggler (12h)
"""

REAL = r'C:\Users\hlava\AppData\Local\Temp\sfl-flower-tracker\flowers.html'

with open(REAL, 'r', encoding='utf-8') as f:
    html = f.read()

# ═══════════════════════════════════════
# 1. Add COMPOST_RECIPES constant (after FISH_MARKET_RECIPES, before CRAFTED_INGREDIENT_RECIPES)
# ═══════════════════════════════════════
old1 = '''    const CRAFTED_INGREDIENT_RECIPES = {'''
new1 = '''    // Compost recipes: season-dependent inputs, base output amounts (from composterDetails)
    const COMPOST_RECIPES = {
      "Compost Bin": {
        outputs: { "Sprout Mix": 10, "Earthworm": 1 },
        inputs: {
          spring: { "Rhubarb": 10, "Carrot": 5 },
          summer: { "Zucchini": 10, "Pepper": 2 },
          autumn: { "Yam": 15 },
          winter: { "Potato": 10, "Cabbage": 3 },
        },
      },
      "Turbo Composter": {
        outputs: { "Fruitful Blend": 3, "Grub": 1 },
        inputs: {
          spring: { "Soybean": 5, "Corn": 3 },
          summer: { "Cauliflower": 4, "Eggplant": 3 },
          autumn: { "Broccoli": 10, "Artichoke": 2 },
          winter: { "Onion": 5, "Turnip": 2 },
        },
      },
      "Premium Composter": {
        outputs: { "Rapid Root": 10, "Red Wiggler": 1 },
        inputs: {
          spring: { "Blueberry": 8, "Egg": 5 },
          summer: { "Banana": 3, "Egg": 5 },
          autumn: { "Apple": 4, "Tomato": 5 },
          winter: { "Lemon": 3, "Apple": 3 },
        },
      },
    };

    const CRAFTED_INGREDIENT_RECIPES = {'''
assert old1 in html, "CRAFTED_INGREDIENT_RECIPES anchor not found"
html = html.replace(old1, new1, 1)

# ═══════════════════════════════════════
# 2. Add compost pricing to estimateItemSfl (before return 0)
# ═══════════════════════════════════════
old2 = '''      // Fish Market recipes (season-dependent: Crab Stick, Fish Flake, Fish Stick, Fish Oil)
      if (typeof FISH_MARKET_RECIPES !== "undefined" && FISH_MARKET_RECIPES[itemName]) {
        const seasonRecipes = FISH_MARKET_RECIPES[itemName];
        const s = rates?.season || "";
        const recipe = seasonRecipes[s] || Object.values(seasonRecipes)[0];
        if (recipe) {
          let total = 0;
          for (const [ing, qty] of Object.entries(recipe)) {
            total += estimateItemSfl(ing, p2pPrices, visited, rates) * qty;
          }
          if (total > 0) return total;
        }
      }

      return 0;
    }'''
new2 = '''      // Fish Market recipes (season-dependent: Crab Stick, Fish Flake, Fish Stick, Fish Oil)
      if (typeof FISH_MARKET_RECIPES !== "undefined" && FISH_MARKET_RECIPES[itemName]) {
        const seasonRecipes = FISH_MARKET_RECIPES[itemName];
        const s = rates?.season || "";
        const recipe = seasonRecipes[s] || Object.values(seasonRecipes)[0];
        if (recipe) {
          let total = 0;
          for (const [ing, qty] of Object.entries(recipe)) {
            total += estimateItemSfl(ing, p2pPrices, visited, rates) * qty;
          }
          if (total > 0) return total;
        }
      }

      // Compost products (Sprout Mix, Fruitful Blend, Rapid Root, Earthworm, Grub, Red Wiggler)
      if (typeof COMPOST_RECIPES !== "undefined") {
        for (const [composter, data] of Object.entries(COMPOST_RECIPES)) {
          if (data.outputs[itemName] !== undefined) {
            const s = rates?.season || "";
            const inputs = data.inputs[s] || Object.values(data.inputs)[0];
            let batchCost = 0;
            for (const [ing, qty] of Object.entries(inputs)) {
              batchCost += estimateItemSfl(ing, p2pPrices, visited, rates) * qty;
            }
            const totalUnits = Object.values(data.outputs).reduce((sum, q) => sum + q, 0);
            if (batchCost > 0 && totalUnits > 0) return batchCost / totalUnits;
          }
        }
      }

      return 0;
    }'''
assert old2 in html, "estimateItemSfl Fish Market + return 0 anchor not found"
html = html.replace(old2, new2)

# ═══════════════════════════════════════
# 3. Add compost explanation to explainItemSfl (before return null)
# ═══════════════════════════════════════
old3 = '''      // Fish Market recipes (season-dependent)
      if (typeof FISH_MARKET_RECIPES !== "undefined" && FISH_MARKET_RECIPES[itemName]) {
        const seasonRecipes = FISH_MARKET_RECIPES[itemName];
        const s = rates?.season || "";
        const season = s || Object.keys(seasonRecipes)[0];
        const recipe = seasonRecipes[season] || Object.values(seasonRecipes)[0];
        if (recipe) {
          let parts = [], total = 0;
          for (const [ing, qty] of Object.entries(recipe)) {
            const p = estimateItemSfl(ing, p2pPrices, null, rates);
            const src = p2pPrices[ing] ? "P2P" : "derived";
            parts.push(`${qty}\\u00d7 ${ing} (${fNum(p)} ${src})`);
            total += p * qty;
          }
          const seasonLabel = season.charAt(0).toUpperCase() + season.slice(1);
          return { price: total, method: `Fish Market (${seasonLabel})`, detail: parts.join(" + ") + ` = ${fNum(total)}` };
        }
      }

      return null;
    }'''
new3 = '''      // Fish Market recipes (season-dependent)
      if (typeof FISH_MARKET_RECIPES !== "undefined" && FISH_MARKET_RECIPES[itemName]) {
        const seasonRecipes = FISH_MARKET_RECIPES[itemName];
        const s = rates?.season || "";
        const season = s || Object.keys(seasonRecipes)[0];
        const recipe = seasonRecipes[season] || Object.values(seasonRecipes)[0];
        if (recipe) {
          let parts = [], total = 0;
          for (const [ing, qty] of Object.entries(recipe)) {
            const p = estimateItemSfl(ing, p2pPrices, null, rates);
            const src = p2pPrices[ing] ? "P2P" : "derived";
            parts.push(`${qty}\\u00d7 ${ing} (${fNum(p)} ${src})`);
            total += p * qty;
          }
          const seasonLabel = season.charAt(0).toUpperCase() + season.slice(1);
          return { price: total, method: `Fish Market (${seasonLabel})`, detail: parts.join(" + ") + ` = ${fNum(total)}` };
        }
      }

      // Compost products
      if (typeof COMPOST_RECIPES !== "undefined") {
        for (const [composter, data] of Object.entries(COMPOST_RECIPES)) {
          if (data.outputs[itemName] !== undefined) {
            const s = rates?.season || "";
            const season = s || Object.keys(data.inputs)[0];
            const inputs = data.inputs[season] || Object.values(data.inputs)[0];
            let inputParts = [], batchCost = 0;
            for (const [ing, qty] of Object.entries(inputs)) {
              const p = estimateItemSfl(ing, p2pPrices, null, rates);
              const src = p2pPrices[ing] ? "P2P" : "derived";
              inputParts.push(`${qty}\\u00d7 ${ing} (${fNum(p)} ${src})`);
              batchCost += p * qty;
            }
            const totalUnits = Object.values(data.outputs).reduce((sum, q) => sum + q, 0);
            const outputList = Object.entries(data.outputs).map(([n, q]) => `${q}\\u00d7 ${n}`).join(" + ");
            const unitCost = totalUnits > 0 ? batchCost / totalUnits : 0;
            const seasonLabel = season.charAt(0).toUpperCase() + season.slice(1);
            return {
              price: unitCost,
              method: `Compost (${seasonLabel})`,
              detail: `${composter}: ${inputParts.join(" + ")} = batch ${fNum(batchCost)} \\u00f7 ${totalUnits} units (${outputList}) = ${fNum(unitCost)}/unit`
            };
          }
        }
      }

      return null;
    }'''
assert old3 in html, "explainItemSfl Fish Market + return null anchor not found"
html = html.replace(old3, new3)

# ═══════════════════════════════════════
# 4. Add compost items to collectDerivedPriceItems
# ═══════════════════════════════════════
old4 = '''      // Fish Market recipes
      addItems(typeof FISH_MARKET_RECIPES !== "undefined" ? FISH_MARKET_RECIPES : null, "Fish Market");'''
new4 = '''      // Fish Market recipes
      addItems(typeof FISH_MARKET_RECIPES !== "undefined" ? FISH_MARKET_RECIPES : null, "Fish Market");

      // Compost products
      if (typeof COMPOST_RECIPES !== "undefined") {
        for (const data of Object.values(COMPOST_RECIPES)) {
          for (const name of Object.keys(data.outputs)) {
            if (!items.has(name)) items.set(name, "Compost");
          }
        }
      }'''
assert old4 in html, "collectDerivedPriceItems Fish Market anchor not found"
html = html.replace(old4, new4)

# Update catOrder
old5 = '''const catOrder = ["Tools", "Seeds", "Flower seeds", "Flowers", "Food", "Crafted", "Dolls", "Fish/XP", "Fish Market", "Treasures", "Crustaceans", "Giants", "Pets", "Resources", "Special"];'''
new5 = '''const catOrder = ["Tools", "Seeds", "Flower seeds", "Flowers", "Food", "Crafted", "Dolls", "Fish/XP", "Fish Market", "Compost", "Treasures", "Crustaceans", "Giants", "Pets", "Resources", "Special"];'''
assert old5 in html, "catOrder anchor not found"
html = html.replace(old5, new5)

with open(REAL, 'w', encoding='utf-8') as f:
    f.write(html)

print("OK: Compost pricing added (Sprout Mix, Fruitful Blend, Rapid Root, Earthworm, Grub, Red Wiggler)")
print(f"File size: {len(html)} chars")
