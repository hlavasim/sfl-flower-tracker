#!/usr/bin/env python3
"""Fix Oil pricing: use real farm boosts instead of hardcoded /2.
1. Power page saves computed Oil price to localStorage
2. Diff page reads localStorage, fallback to applyBoosts+calcToolCostPerDay from farm data
3. Remove hardcoded Oil Drill/2 from estimateItemSfl
"""

REAL = r'C:\Users\hlava\AppData\Local\Temp\sfl-flower-tracker\flowers.html'

with open(REAL, 'r', encoding='utf-8') as f:
    html = f.read()

# ═══════════════════════════════════════
# 1. Power page: save Oil price to localStorage after computing
# ═══════════════════════════════════════
old1 = '''      if (oilBoostedResult.unitsPerDay > 0 && oilToolInfo.costPerDay > 0) {
        p2pPrices["Oil"] = oilToolInfo.costPerDay / oilBoostedResult.unitsPerDay;
      } else if (oilBoostedResult.unitsPerDay > 0) {
        p2pPrices["Oil"] = 0; // free drilling (Infernal Drill) \u2192 oil is free
      }'''
new1 = '''      if (oilBoostedResult.unitsPerDay > 0 && oilToolInfo.costPerDay > 0) {
        p2pPrices["Oil"] = oilToolInfo.costPerDay / oilBoostedResult.unitsPerDay;
      } else if (oilBoostedResult.unitsPerDay > 0) {
        p2pPrices["Oil"] = 0; // free drilling (Infernal Drill) \u2192 oil is free
      }
      // Cache Oil price for diff page (includes all real boosts)
      if (p2pPrices["Oil"] !== undefined) {
        localStorage.setItem("sfl_oil_price", String(p2pPrices["Oil"]));
      }'''
assert old1 in html, "Power page Oil price anchor not found"
html = html.replace(old1, new1)

# ═══════════════════════════════════════
# 2. Remove hardcoded Oil Drill/2 from estimateItemSfl
# ═══════════════════════════════════════
old2 = '''      // Oil: derived from Oil Drill cost / base yield (~2 oil per drill)
      if (itemName === "Oil") {
        const drillPrice = estimateItemSfl("Oil Drill", p2pPrices, visited, rates);
        if (drillPrice > 0) return drillPrice / 2;
      }

      // Flower seed coin costs'''
new2 = '''      // Flower seed coin costs'''
assert old2 in html, "estimateItemSfl Oil special case not found"
html = html.replace(old2, new2)

# ═══════════════════════════════════════
# 3. Diff page: compute Oil price from farm data + localStorage cache
#    Add right after sflPerXP computation
# ═══════════════════════════════════════
old3 = '''      // Compute SFL per XP for fish/food pricing (from best cooking recipe + boosts)
      try {
        const _sc = calcSkillPointCost(data.farm?.bumpkin, p2pPrices, data.farm);
        sflPerXP = (_sc.bestRecipe && _sc.bestRecipe.boostedXP > 0)
          ? _sc.bestRecipe.cost / _sc.bestRecipe.boostedXP : 0;
      } catch(e) { sflPerXP = 0; }'''
new3 = '''      // Compute SFL per XP for fish/food pricing (from best cooking recipe + boosts)
      try {
        const _sc = calcSkillPointCost(data.farm?.bumpkin, p2pPrices, data.farm);
        sflPerXP = (_sc.bestRecipe && _sc.bestRecipe.boostedXP > 0)
          ? _sc.bestRecipe.cost / _sc.bestRecipe.boostedXP : 0;
      } catch(e) { sflPerXP = 0; }

      // Compute Oil price from farm data (same method as Power page)
      if (!p2pPrices["Oil"]) {
        // Try localStorage cache from Power page (includes all NFT boosts)
        const cachedOil = parseFloat(localStorage.getItem("sfl_oil_price"));
        if (!isNaN(cachedOil) && cachedOil >= 0) {
          p2pPrices["Oil"] = cachedOil;
        } else {
          // Fallback: compute from farm capacity + skills (no NFT boosts)
          try {
            const _cap = detectFarmCapacity(data.farm);
            const _sm = detectStockModifiers(data.farm);
            const _oilYield = applyBoosts("oil", "Oil", _cap, []);
            const _oilCost = calcToolCostPerDay("oil", _cap, { coinsPerSFL }, p2pPrices, _sm);
            if (_oilYield.unitsPerDay > 0 && _oilCost.costPerDay > 0) {
              p2pPrices["Oil"] = _oilCost.costPerDay / _oilYield.unitsPerDay;
            } else if (_oilYield.unitsPerDay > 0) {
              p2pPrices["Oil"] = 0;
            }
          } catch(e) {}
        }
      }'''
assert old3 in html, "sflPerXP computation anchor not found"
html = html.replace(old3, new3)

with open(REAL, 'w', encoding='utf-8') as f:
    f.write(html)

print("OK: Oil pricing from real farm data + localStorage cache")
print(f"File size: {len(html)} chars")
