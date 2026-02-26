#!/usr/bin/env python3
"""1. Add animal feed recipes (Kernel Blend, Hay, NutriBarley, Mixed Grain, Mixed Kale, Omnifeed)
2. Fix treasure pricing to include boosts (Treasure Map +20%, Camel +30%)
"""

REAL = r'C:\Users\hlava\AppData\Local\Temp\sfl-flower-tracker\flowers.html'

with open(REAL, 'r', encoding='utf-8') as f:
    html = f.read()

# ═══════════════════════════════════════
# 1. Add animal feed recipes to CRAFTED_INGREDIENT_RECIPES
# ═══════════════════════════════════════
old1 = '''    const CRAFTED_INGREDIENT_RECIPES = {
      "Cheese": { "Milk": 3 },'''
new1 = '''    const CRAFTED_INGREDIENT_RECIPES = {
      "Cheese": { "Milk": 3 },
      "Kernel Blend": { "Corn": 1 },
      "Hay": { "Wheat": 1 },
      "NutriBarley": { "Barley": 1 },
      "Mixed Grain": { "Corn": 1, "Wheat": 1, "Barley": 1 },
      "Mixed Kale": { "Kale": 3 },'''
assert old1 in html, "CRAFTED_INGREDIENT_RECIPES start anchor not found"
html = html.replace(old1, new1)

# ═══════════════════════════════════════
# 2. Compute treasure boost in diff page and pass via rates
# ═══════════════════════════════════════
old2 = '''      // Detect current season for Fish Market recipes
      const currentSeason = (data.farm?.season?.season || "").toLowerCase();'''
new2 = '''      // Detect current season for Fish Market recipes
      const currentSeason = (data.farm?.season?.season || "").toLowerCase();

      // Detect treasure sell boosts (same as treasury page)
      let treasureBoost = 1;
      if (findCollectible(data.farm, "Treasure Map").length > 0) treasureBoost += 0.2;
      if (getCount(data.farm?.inventory || {}, "Camel") > 0 || findCollectible(data.farm, "Camel").length > 0) treasureBoost += 0.3;'''
assert old2 in html, "currentSeason anchor not found"
html = html.replace(old2, new2)

# Pass treasureBoost in processDiff rates
old2b = 'const price = estimateItemSfl(itemName, p2pPrices, null, { coinsPerSFL, sflPerXP, season: currentSeason });'
new2b = 'const price = estimateItemSfl(itemName, p2pPrices, null, { coinsPerSFL, sflPerXP, season: currentSeason, treasureBoost });'
assert old2b in html, "processDiff rates anchor not found"
html = html.replace(old2b, new2b)

# Pass treasureBoost in pricing table
old2c = 'const priceExplanations = collectDerivedPriceItems(p2pPrices, { coinsPerSFL, sflPerXP, season: currentSeason });'
new2c = 'const priceExplanations = collectDerivedPriceItems(p2pPrices, { coinsPerSFL, sflPerXP, season: currentSeason, treasureBoost });'
assert old2c in html, "collectDerivedPriceItems rates anchor not found"
html = html.replace(old2c, new2c)

# ═══════════════════════════════════════
# 3. Apply treasureBoost in estimateItemSfl
# ═══════════════════════════════════════
old3 = '''      // Treasure sell prices (coins \u2192 SFL)
      if (typeof TREASURE_SELL_PRICES !== "undefined" && TREASURE_SELL_PRICES[itemName] && rates && rates.coinsPerSFL > 0) {
        return TREASURE_SELL_PRICES[itemName] / rates.coinsPerSFL;
      }'''
new3 = '''      // Treasure sell prices (coins \u2192 SFL, with boosts: Treasure Map +20%, Camel +30%)
      if (typeof TREASURE_SELL_PRICES !== "undefined" && TREASURE_SELL_PRICES[itemName] && rates && rates.coinsPerSFL > 0) {
        const tb = rates.treasureBoost || 1;
        return (TREASURE_SELL_PRICES[itemName] * tb) / rates.coinsPerSFL;
      }'''
assert old3 in html, "estimateItemSfl treasure anchor not found"
html = html.replace(old3, new3)

# ═══════════════════════════════════════
# 4. Apply treasureBoost in explainItemSfl
# ═══════════════════════════════════════
old4 = '''      // Treasure sell prices
      if (typeof TREASURE_SELL_PRICES !== "undefined" && TREASURE_SELL_PRICES[itemName] && coinsPerSFL > 0) {
        const coins = TREASURE_SELL_PRICES[itemName];
        const price = coins / coinsPerSFL;
        return { price, method: "Treasure (sell price)", detail: `sell ${coins}c / ${coinsPerSFL.toFixed(0)} c/SFL = ${fNum(price)}` };
      }'''
new4 = r'''      // Treasure sell prices (with boosts)
      if (typeof TREASURE_SELL_PRICES !== "undefined" && TREASURE_SELL_PRICES[itemName] && coinsPerSFL > 0) {
        const baseCoins = TREASURE_SELL_PRICES[itemName];
        const tb = rates?.treasureBoost || 1;
        const boostedCoins = baseCoins * tb;
        const price = boostedCoins / coinsPerSFL;
        const boostNote = tb > 1 ? ` \u00d7${tb.toFixed(1)} boost` : "";
        return { price, method: "Treasure (sell price)", detail: `sell ${baseCoins}c${boostNote} = ${boostedCoins.toFixed(0)}c / ${coinsPerSFL.toFixed(0)} c/SFL = ${fNum(price)}` };
      }'''
assert old4 in html, "explainItemSfl treasure anchor not found"
html = html.replace(old4, new4)

# ═══════════════════════════════════════
# 5. Add Omnifeed pricing (1 Gem) to estimateItemSfl
#    Also add to explainItemSfl + collectDerivedPriceItems
# ═══════════════════════════════════════

# In estimateItemSfl, after Giant items, before Crustaceans
old5 = '''      // Giant item coin sell prices
      if (typeof GIANT_ITEM_COIN_PRICES !== "undefined" && GIANT_ITEM_COIN_PRICES[itemName] && rates && rates.coinsPerSFL > 0) {
        return GIANT_ITEM_COIN_PRICES[itemName] / rates.coinsPerSFL;
      }

      // Crustaceans'''
new5 = '''      // Giant item coin sell prices
      if (typeof GIANT_ITEM_COIN_PRICES !== "undefined" && GIANT_ITEM_COIN_PRICES[itemName] && rates && rates.coinsPerSFL > 0) {
        return GIANT_ITEM_COIN_PRICES[itemName] / rates.coinsPerSFL;
      }

      // Omnifeed: costs 1 Gem
      if (itemName === "Omnifeed") {
        const gemsPerSFL = rates?.gemsPerSFL || 0;
        if (gemsPerSFL > 0) return 1 / gemsPerSFL;
      }

      // Crustaceans'''
assert old5 in html, "estimateItemSfl giant+crustacean anchor not found"
html = html.replace(old5, new5)

# In explainItemSfl, after Giant items explanation
old5b = '''      // Giant item coin prices
      if (typeof GIANT_ITEM_COIN_PRICES !== "undefined" && GIANT_ITEM_COIN_PRICES[itemName] && coinsPerSFL > 0) {
        const coins = GIANT_ITEM_COIN_PRICES[itemName];
        const price = coins / coinsPerSFL;'''
# Need to find the full block to add after
old5c = '''        return { price, method: "Giant (sell price)", detail: `sell ${coins}c / ${coinsPerSFL.toFixed(0)} c/SFL = ${fNum(price)}` };
      }

      // Crustaceans'''
new5c = r'''        return { price, method: "Giant (sell price)", detail: `sell ${coins}c / ${coinsPerSFL.toFixed(0)} c/SFL = ${fNum(price)}` };
      }

      // Omnifeed (1 Gem)
      if (itemName === "Omnifeed") {
        const gemsPerSFL = rates?.gemsPerSFL || 0;
        if (gemsPerSFL > 0) {
          const price = 1 / gemsPerSFL;
          return { price, method: "Gem cost", detail: `1 Gem / ${gemsPerSFL.toFixed(2)} Gems/SFL = ${fNum(price)}` };
        }
        return { price: 0, method: "Gem cost", detail: "1 Gem (exchange rate unknown)" };
      }

      // Crustaceans'''
assert old5c in html, "explainItemSfl giant end + crustacean anchor not found"
html = html.replace(old5c, new5c)

# Add Omnifeed to collectDerivedPriceItems
old5d = '''      items.set("Mark", "Special");
      items.set("Acorn", "Pets");'''
new5d = '''      items.set("Mark", "Special");
      items.set("Acorn", "Pets");
      items.set("Omnifeed", "Feed");'''
assert old5d in html, "collectDerivedPriceItems special items anchor not found"
html = html.replace(old5d, new5d)

# Update catOrder with Feed
old5e = '''const catOrder = ["Tools", "Seeds", "Flower seeds", "Flowers", "Food", "Crafted", "Dolls", "Fish/XP", "Fish Market", "Compost", "Treasures", "Crustaceans", "Giants", "Pets", "Resources", "Special"];'''
new5e = '''const catOrder = ["Tools", "Seeds", "Flower seeds", "Flowers", "Food", "Feed", "Crafted", "Dolls", "Fish/XP", "Fish Market", "Compost", "Treasures", "Crustaceans", "Giants", "Pets", "Resources", "Special"];'''
assert old5e in html, "catOrder anchor not found"
html = html.replace(old5e, new5e)

# ═══════════════════════════════════════
# 6. Pass gemsPerSFL through rates (needed for Omnifeed)
# ═══════════════════════════════════════
old6 = 'const price = estimateItemSfl(itemName, p2pPrices, null, { coinsPerSFL, sflPerXP, season: currentSeason, treasureBoost });'
new6 = 'const price = estimateItemSfl(itemName, p2pPrices, null, { coinsPerSFL, sflPerXP, season: currentSeason, treasureBoost, gemsPerSFL });'
assert old6 in html, "processDiff rates with treasureBoost anchor not found"
html = html.replace(old6, new6)

old6b = 'const priceExplanations = collectDerivedPriceItems(p2pPrices, { coinsPerSFL, sflPerXP, season: currentSeason, treasureBoost });'
new6b = 'const priceExplanations = collectDerivedPriceItems(p2pPrices, { coinsPerSFL, sflPerXP, season: currentSeason, treasureBoost, gemsPerSFL });'
assert old6b in html, "collectDerivedPriceItems rates with treasureBoost anchor not found"
html = html.replace(old6b, new6b)

with open(REAL, 'w', encoding='utf-8') as f:
    f.write(html)

print("OK: Feed recipes + treasure boost fix + Omnifeed gem pricing")
print(f"File size: {len(html)} chars")
