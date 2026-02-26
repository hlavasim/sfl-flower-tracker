#!/usr/bin/env python3
"""1. Fix TREASURE_SELL_PRICES base values (were 1.2x inflated — Treasure Map boost was baked in)
2. Add "Banana Plant" handling to seed pricing (strip " Plant" suffix too)
"""

REAL = r'C:\Users\hlava\AppData\Local\Temp\sfl-flower-tracker\flowers.html'

with open(REAL, 'r', encoding='utf-8') as f:
    html = f.read()

# ═══════════════════════════════════════
# 1. Fix TREASURE_SELL_PRICES — divide all by 1.2
# ═══════════════════════════════════════
old1 = '''    const TREASURE_SELL_PRICES = {
      "Crab": 18, "Camel Bone": 12, "Sea Cucumber": 27, "Vase": 60,
      "Starfish": 135, "Sand": 12, "Old Bottle": 27, "Seaweed": 90,
      "Cockle Shell": 120, "Clam Shell": 450, "Iron Compass": 225,
      "Pipi": 225, "Pearl": 4500, "Wooden Compass": 157.5,
      "Hieroglyph": 300, "Ammonite Shell": 300, "Coral": 1800, "Broken Pillar": 240,
      "Coprolite": 240, "Pirate Bounty": 9000,
    };'''
new1 = '''    const TREASURE_SELL_PRICES = {
      "Crab": 15, "Camel Bone": 10, "Sea Cucumber": 22.5, "Vase": 50,
      "Starfish": 112.5, "Sand": 10, "Old Bottle": 22.5, "Seaweed": 75,
      "Cockle Shell": 100, "Clam Shell": 375, "Iron Compass": 187.5,
      "Pipi": 187.5, "Pearl": 3750, "Wooden Compass": 131.25,
      "Hieroglyph": 250, "Ammonite Shell": 250, "Coral": 1500, "Broken Pillar": 200,
      "Coprolite": 200, "Pirate Bounty": 7500,
    };'''
assert old1 in html, "TREASURE_SELL_PRICES anchor not found"
html = html.replace(old1, new1)

# ═══════════════════════════════════════
# 2. Fix seed pricing to also handle " Plant" suffix (for Banana Plant)
# ═══════════════════════════════════════
old2 = '''      // Seed costs (coins only) — SEED_COSTS keyed by crop name, items come as "X Seed"
      if (typeof SEED_COSTS !== "undefined" && rates && rates.coinsPerSFL > 0) {
        const cropName = itemName.endsWith(" Seed") ? itemName.slice(0, -5) : itemName;
        if (SEED_COSTS[cropName]) return SEED_COSTS[cropName] / rates.coinsPerSFL;
      }'''
new2 = '''      // Seed costs (coins only) — SEED_COSTS keyed by crop name, items come as "X Seed" or "X Plant"
      if (typeof SEED_COSTS !== "undefined" && rates && rates.coinsPerSFL > 0) {
        const cropName = itemName.endsWith(" Seed") ? itemName.slice(0, -5) : itemName.endsWith(" Plant") ? itemName.slice(0, -6) : itemName;
        if (SEED_COSTS[cropName]) return SEED_COSTS[cropName] / rates.coinsPerSFL;
      }'''
assert old2 in html, "Seed costs anchor not found"
html = html.replace(old2, new2)

# Also fix in explainItemSfl
# Also fix in explainItemSfl
old2b = '''      // Seed costs (crop/fruit seeds)
      if (typeof SEED_COSTS !== "undefined" && coinsPerSFL > 0) {
        const cropName = itemName.endsWith(" Seed") ? itemName.slice(0, -5) : itemName;
        if (SEED_COSTS[cropName]) {
          const coins = SEED_COSTS[cropName];
          const price = coins / coinsPerSFL;
          return { price, method: "Seed (coins)", detail: `${cropName} Seed: ${coins}c / ${coinsPerSFL.toFixed(0)} c/SFL = ${fNum(price)}` };'''
new2b = '''      // Seed costs (crop/fruit seeds, including "X Plant" like Banana Plant)
      if (typeof SEED_COSTS !== "undefined" && coinsPerSFL > 0) {
        const cropName = itemName.endsWith(" Seed") ? itemName.slice(0, -5) : itemName.endsWith(" Plant") ? itemName.slice(0, -6) : itemName;
        if (SEED_COSTS[cropName]) {
          const coins = SEED_COSTS[cropName];
          const price = coins / coinsPerSFL;
          const seedLabel = itemName.endsWith(" Plant") ? `${cropName} Plant` : `${cropName} Seed`;
          return { price, method: "Seed (coins)", detail: `${seedLabel}: ${coins}c / ${coinsPerSFL.toFixed(0)} c/SFL = ${fNum(price)}` };'''
assert old2b in html, "explainItemSfl seed costs anchor not found"
html = html.replace(old2b, new2b)

with open(REAL, 'w', encoding='utf-8') as f:
    f.write(html)

print("OK: Fixed treasure base prices (÷1.2) + Banana Plant seed pricing")
print(f"File size: {len(html)} chars")
