#!/usr/bin/env python3
"""Add missing pricing: crafting recipes, Ammonite Shell, Fish Market (seasonal),
Acorn (pet energy cost), Mark (0.01 SFL), plus explanations for all."""

REAL = r'C:\Users\hlava\AppData\Local\Temp\sfl-flower-tracker\flowers.html'

with open(REAL, 'r', encoding='utf-8') as f:
    html = f.read()

# ═══════════════════════════════════════
# 1. Expand CRAFTED_INGREDIENT_RECIPES with all crafting recipes
# ═══════════════════════════════════════
old1 = '''    const CRAFTED_INGREDIENT_RECIPES = {
      "Cheese": { "Milk": 3 },
    };'''
new1 = '''    const CRAFTED_INGREDIENT_RECIPES = {
      "Cheese": { "Milk": 3 },
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
      "Ocean\\'s Treasure": { "Coral": 5, "Pearl": 2, "Pirate Bounty": 1 },
      "Basic Bed": { "Cushion": 3, "Timber": 5 },
      "Fisher Bed": { "Kelp Fibre": 6, "Basic Bed": 1 },
      "Sturdy Bed": { "Merino Cushion": 3, "Crimsteel": 5, "Basic Bed": 1 },
      "Desert Bed": { "Synthetic Fabric": 8, "Sturdy Bed": 1 },
      "Cow Bed": { "Hardened Leather": 6, "Sturdy Bed": 2 },
      "Pirate Bed": { "Kelp Fibre": 3, "Vase": 2, "Ocean\\'s Treasure": 1, "Sturdy Bed": 3 },
      "Royal Bed": { "Royal Bedding": 3, "Royal Ornament": 3, "Sturdy Bed": 3 },
    };'''
assert old1 in html, "CRAFTED_INGREDIENT_RECIPES anchor not found"
html = html.replace(old1, new1)

# ═══════════════════════════════════════
# 2. Add Ammonite Shell to TREASURE_SELL_PRICES
# ═══════════════════════════════════════
old2 = '''      "Hieroglyph": 300, "Coral": 1800, "Broken Pillar": 240,
      "Coprolite": 240, "Pirate Bounty": 9000,'''
new2 = '''      "Hieroglyph": 300, "Ammonite Shell": 300, "Coral": 1800, "Broken Pillar": 240,
      "Coprolite": 240, "Pirate Bounty": 9000,'''
assert old2 in html, "TREASURE_SELL_PRICES anchor not found"
html = html.replace(old2, new2)

# ═══════════════════════════════════════
# 3. Add FISH_MARKET_RECIPES constant (season-dependent)
# ═══════════════════════════════════════
old3 = '''    const GIANT_ITEM_COIN_PRICES = {
      "Giant Apple": 1500, "Giant Orange": 500, "Giant Banana": 4000,
    };

    const CRAFTED_INGREDIENT_RECIPES'''
new3 = '''    const GIANT_ITEM_COIN_PRICES = {
      "Giant Apple": 1500, "Giant Orange": 500, "Giant Banana": 4000,
    };

    // Fish Market recipes by season (from sfl.world/info/fishing/info)
    const FISH_MARKET_RECIPES = {
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

    const CRAFTED_INGREDIENT_RECIPES'''
assert old3 in html, "GIANT_ITEM_COIN_PRICES -> CRAFTED anchor not found"
html = html.replace(old3, new3)

# ═══════════════════════════════════════
# 4. Add season detection in diff page + pass to rates
# ═══════════════════════════════════════
old4 = '''      const noPrices = Object.keys(p2pPrices).length === 0;'''
new4 = '''      // Detect current season for Fish Market recipes
      const currentSeason = (data.farm?.season?.season || "").toLowerCase();

      const noPrices = Object.keys(p2pPrices).length === 0;'''
assert old4 in html, "noPrices anchor not found"
html = html.replace(old4, new4)

# Pass season in processDiff rates
old4b = 'const price = estimateItemSfl(itemName, p2pPrices, null, { coinsPerSFL, sflPerXP });'
new4b = 'const price = estimateItemSfl(itemName, p2pPrices, null, { coinsPerSFL, sflPerXP, season: currentSeason });'
assert old4b in html, "estimateItemSfl rates anchor not found"
html = html.replace(old4b, new4b)

# Pass season in pricing table
old4c = 'const priceExplanations = collectDerivedPriceItems(p2pPrices, { coinsPerSFL, sflPerXP });'
new4c = 'const priceExplanations = collectDerivedPriceItems(p2pPrices, { coinsPerSFL, sflPerXP, season: currentSeason });'
assert old4c in html, "collectDerivedPriceItems rates anchor not found"
html = html.replace(old4c, new4c)

# ═══════════════════════════════════════
# 5. Add Mark, Acorn, Fish Market to estimateItemSfl
# ═══════════════════════════════════════
old5 = '''      // Crustaceans (pot + chum cost from CRUSTACEAN_RECIPES)
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
new5 = '''      // Crustaceans (pot + chum cost from CRUSTACEAN_RECIPES)
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

      // Mark: fixed 0.01 SFL (from treasury/faction shop)
      if (itemName === "Mark") return 0.01;

      // Acorn: opportunity cost = best pet resource SFL/energy ratio * 100 energy
      if (itemName === "Acorn" && typeof PET_FETCH_DATA !== "undefined") {
        let bestRatio = 0;
        for (const entries of Object.values(PET_FETCH_DATA)) {
          for (const e of entries) {
            if (e.res === "Acorn") continue;
            const p = p2pPrices[e.res] || 0;
            if (p > 0) bestRatio = Math.max(bestRatio, p / e.energy);
          }
        }
        if (bestRatio > 0) return bestRatio * 100;
      }

      // Fish Market recipes (season-dependent: Crab Stick, Fish Flake, Fish Stick, Fish Oil)
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
assert old5 in html, "estimateItemSfl crustacean+return0 anchor not found"
html = html.replace(old5, new5)

# ═══════════════════════════════════════
# 6. Add Mark, Acorn, Fish Market to explainItemSfl
# ═══════════════════════════════════════
old6 = '''      // Crustaceans
      if (typeof CRUSTACEAN_RECIPES !== "undefined" && CRUSTACEAN_RECIPES[itemName]) {'''
# Find the end of the crustacean block in explainItemSfl
# It ends with return { price: total, method: "Crustacean..." }; then }
# Then return null; closes the function

old6_full = '''        return { price: total, method: "Crustacean (pot+chum)", detail: parts.join(" + ") + ` = ${fNum(total)}` };
      }

      return null;
    }'''
new6_full = r'''        return { price: total, method: "Crustacean (pot+chum)", detail: parts.join(" + ") + ` = ${fNum(total)}` };
      }

      // Mark
      if (itemName === "Mark") {
        return { price: 0.01, method: "Fixed rate", detail: "1 Mark = 0.01 SFL (faction shop rate)" };
      }

      // Acorn (pet energy opportunity cost)
      if (itemName === "Acorn" && typeof PET_FETCH_DATA !== "undefined") {
        let bestRatio = 0, bestRes = "";
        for (const entries of Object.values(PET_FETCH_DATA)) {
          for (const e of entries) {
            if (e.res === "Acorn") continue;
            const p = p2pPrices[e.res] || 0;
            if (p > 0 && p / e.energy > bestRatio) { bestRatio = p / e.energy; bestRes = e.res; }
          }
        }
        if (bestRatio > 0) {
          const price = bestRatio * 100;
          return { price, method: "Pet energy cost", detail: `100 energy \u00d7 best ratio ${bestRatio.toFixed(6)} SFL/\u26a1 (${bestRes}) = ${fNum(price)}` };
        }
        return { price: 0, method: "Pet energy cost", detail: "No pet resources with P2P prices" };
      }

      // Fish Market recipes (season-dependent)
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
            parts.push(`${qty}\u00d7 ${ing} (${fNum(p)} ${src})`);
            total += p * qty;
          }
          const seasonLabel = season.charAt(0).toUpperCase() + season.slice(1);
          return { price: total, method: `Fish Market (${seasonLabel})`, detail: parts.join(" + ") + ` = ${fNum(total)}` };
        }
      }

      return null;
    }'''
assert old6_full in html, "explainItemSfl crustacean end anchor not found"
html = html.replace(old6_full, new6_full)

# ═══════════════════════════════════════
# 7. Update collectDerivedPriceItems to include new categories
# ═══════════════════════════════════════
old7 = '''      // Special items
      items.set("Oil", "Resources");
      items.set("Love Charm", "Special");
      items.set("Barn Delight", "Food");'''
new7 = '''      // Fish Market recipes
      addItems(typeof FISH_MARKET_RECIPES !== "undefined" ? FISH_MARKET_RECIPES : null, "Fish Market");

      // Special items
      items.set("Oil", "Resources");
      items.set("Love Charm", "Special");
      items.set("Barn Delight", "Food");
      items.set("Mark", "Special");
      items.set("Acorn", "Pets");'''
assert old7 in html, "collectDerivedPriceItems special items anchor not found"
html = html.replace(old7, new7)

# Update catOrder to include new categories
old7b = '''const catOrder = ["Tools", "Seeds", "Flower seeds", "Flowers", "Food", "Crafted", "Dolls", "Fish/XP", "Treasures", "Crustaceans", "Giants", "Resources", "Special"];'''
new7b = '''const catOrder = ["Tools", "Seeds", "Flower seeds", "Flowers", "Food", "Crafted", "Dolls", "Fish/XP", "Fish Market", "Treasures", "Crustaceans", "Giants", "Pets", "Resources", "Special"];'''
assert old7b in html, "catOrder anchor not found"
html = html.replace(old7b, new7b)

with open(REAL, 'w', encoding='utf-8') as f:
    f.write(html)

print("OK: Added crafting recipes, Ammonite Shell, Fish Market (seasonal), Acorn, Mark pricing")
print(f"File size: {len(html)} chars")
