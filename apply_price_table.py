#!/usr/bin/env python3
"""Add collapsed pricing explanation table to diff page.
Shows ALL items with derived prices and detailed technical explanation.
Excludes items with direct P2P or NFT prices (those are obvious from API).
"""

REAL = r'C:\Users\hlava\AppData\Local\Temp\sfl-flower-tracker\flowers.html'

with open(REAL, 'r', encoding='utf-8') as f:
    html = f.read()

# ═══════════════════════════════════════
# 1. CSS for pricing table
# ═══════════════════════════════════════
old_css = '''    .diff-bar.positive .diff-bar-val {'''
new_css = '''    .diff-price-explain {
      margin-top: 16px;
    }
    .diff-price-explain summary {
      cursor: pointer;
      color: var(--text-dim);
      font-size: 0.5625rem;
      padding: 8px 12px;
      border: 2px solid #333;
      background: rgba(0,0,0,0.2);
    }
    .diff-price-explain summary:hover {
      color: var(--text);
      border-color: #555;
    }
    .diff-price-explain .pe-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.5rem;
      margin-top: 4px;
    }
    .diff-price-explain .pe-table th {
      text-align: left;
      padding: 4px 6px;
      border-bottom: 2px solid #444;
      color: var(--text-dim);
      font-weight: normal;
      position: sticky;
      top: 0;
      background: var(--bg);
    }
    .diff-price-explain .pe-table td {
      padding: 3px 6px;
      border-bottom: 1px solid #222;
      vertical-align: top;
    }
    .diff-price-explain .pe-table tr:hover td {
      background: rgba(255,255,255,0.03);
    }
    .diff-price-explain .pe-method {
      color: #8b8bcd;
      white-space: nowrap;
      font-size: 0.45rem;
    }
    .diff-price-explain .pe-detail {
      color: var(--text-dim);
      font-size: 0.45rem;
      word-break: break-word;
    }
    .diff-price-explain .pe-cat-hdr td {
      padding-top: 8px;
      font-weight: bold;
      color: var(--text);
      font-size: 0.5rem;
      border-bottom: 1px solid #555;
    }

    .diff-bar.positive .diff-bar-val {'''
assert old_css in html, "CSS anchor not found"
html = html.replace(old_css, new_css)

# ═══════════════════════════════════════
# 2. Add explainItemSfl function after estimateItemSfl
# ═══════════════════════════════════════
old_fn = '''      return 0;
    }

    async function renderDiff(data) {'''
new_fn = r'''      return 0;
    }

    // Returns { price, method, detail } explaining how the price was derived
    // Returns null for items with direct P2P prices (those are from API)
    function explainItemSfl(itemName, p2pPrices, rates) {
      const coinsPerSFL = rates?.coinsPerSFL || 0;
      const sflPerXP = rates?.sflPerXP || 0;
      const fNum = (v) => v < 0.001 ? v.toFixed(6) : v < 1 ? v.toFixed(4) : v.toFixed(2);

      // Skip items with direct P2P prices
      if (p2pPrices[itemName]) return null;

      // Oil (special: localStorage or farm data)
      if (itemName === "Oil") {
        const cached = parseFloat(localStorage.getItem("sfl_oil_price"));
        if (!isNaN(cached) && cached >= 0) {
          return { price: cached, method: "Power page", detail: `toolCostPerDay / boostedYieldPerDay = ${fNum(cached)} (cached from Power page with all NFT boosts)` };
        }
        return { price: 0, method: "Power page", detail: "Visit Power page first to compute Oil price with your boosts" };
      }

      // Crafted ingredient (Cheese = 3 Milk)
      if (typeof CRAFTED_INGREDIENT_RECIPES !== "undefined" && CRAFTED_INGREDIENT_RECIPES[itemName]) {
        const recipe = CRAFTED_INGREDIENT_RECIPES[itemName];
        let parts = [], total = 0;
        for (const [ing, qty] of Object.entries(recipe)) {
          const p = estimateItemSfl(ing, p2pPrices, null, rates);
          parts.push(`${qty}\u00d7 ${ing} (${fNum(p)})`);
          total += p * qty;
        }
        return { price: total, method: "Crafted recipe", detail: parts.join(" + ") + ` = ${fNum(total)}` };
      }

      // Food recipe (RECIPE_INGREDIENTS)
      if (typeof RECIPE_INGREDIENTS !== "undefined" && RECIPE_INGREDIENTS[itemName]) {
        const recipe = RECIPE_INGREDIENTS[itemName];
        let parts = [], total = 0;
        for (const [ing, qty] of Object.entries(recipe)) {
          const p = estimateItemSfl(ing, p2pPrices, null, rates);
          const src = p2pPrices[ing] ? "P2P" : "derived";
          parts.push(`${qty}\u00d7 ${ing} (${fNum(p)} ${src})`);
          total += p * qty;
        }
        return { price: total, method: "Cooking recipe", detail: parts.join(" + ") + ` = ${fNum(total)}` };
      }

      // Barn Delight
      if (itemName === "Barn Delight") {
        const lemon = p2pPrices["Lemon"] || 0;
        const honey = p2pPrices["Honey"] || 0;
        const total = 5 * lemon + 3 * honey;
        return { price: total, method: "Special recipe", detail: `5\u00d7 Lemon (${fNum(lemon)} P2P) + 3\u00d7 Honey (${fNum(honey)} P2P) = ${fNum(total)}` };
      }

      // Doll recipes
      if (typeof DOLL_RECIPES !== "undefined" && DOLL_RECIPES[itemName]) {
        const recipe = DOLL_RECIPES[itemName];
        if (recipe.length === 0) return { price: 0, method: "Doll", detail: "No recipe data" };
        let parts = [], total = 0;
        for (const { item, qty } of recipe) {
          const p = estimateItemSfl(item, p2pPrices, null, rates);
          const src = p2pPrices[item] ? "P2P" : "derived";
          parts.push(`${qty}\u00d7 ${item} (${fNum(p)} ${src})`);
          total += p * qty;
        }
        return { price: total, method: "Doll recipe", detail: parts.join(" + ") + ` = ${fNum(total)}` };
      }

      // Tool costs
      if (typeof TOOL_COSTS !== "undefined" && TOOL_COSTS[itemName] && coinsPerSFL > 0) {
        const tool = TOOL_COSTS[itemName];
        let coinPart = tool.coins / coinsPerSFL;
        let parts = [`${tool.coins}c / ${coinsPerSFL.toFixed(0)} c/SFL = ${fNum(coinPart)}`];
        let total = coinPart;
        if (tool.materials) {
          for (const [mat, qty] of Object.entries(tool.materials)) {
            const p = estimateItemSfl(mat, p2pPrices, null, rates);
            const src = p2pPrices[mat] ? "P2P" : "derived";
            parts.push(`${qty}\u00d7 ${mat} (${fNum(p)} ${src})`);
            total += p * qty;
          }
        }
        return { price: total, method: "Tool cost", detail: parts.join(" + ") + ` = ${fNum(total)}` };
      }

      // Seed costs (crop/fruit seeds)
      if (typeof SEED_COSTS !== "undefined" && coinsPerSFL > 0) {
        const cropName = itemName.endsWith(" Seed") ? itemName.slice(0, -5) : itemName;
        if (SEED_COSTS[cropName]) {
          const coins = SEED_COSTS[cropName];
          const price = coins / coinsPerSFL;
          return { price, method: "Seed (coins)", detail: `${cropName} Seed: ${coins}c / ${coinsPerSFL.toFixed(0)} c/SFL = ${fNum(price)}` };
        }
      }

      // Love Charm
      if (itemName === "Love Charm") {
        return { price: 1/50, method: "Fixed rate", detail: `50 Love Charm = 1 SFL \u2192 1 LC = ${fNum(1/50)}` };
      }

      // Flower seed coin costs
      if (typeof FLOWER_SEED_COIN_COSTS !== "undefined" && FLOWER_SEED_COIN_COSTS[itemName] && coinsPerSFL > 0) {
        const coins = FLOWER_SEED_COIN_COSTS[itemName];
        const price = coins / coinsPerSFL;
        return { price, method: "Flower seed (coins)", detail: `${itemName}: ${coins}c / ${coinsPerSFL.toFixed(0)} c/SFL = ${fNum(price)}` };
      }

      // Flowers -> seed cost
      if (typeof FLOWER_RECIPES !== "undefined" && FLOWER_RECIPES[itemName]) {
        const seedName = FLOWER_RECIPES[itemName].seed;
        if (typeof FLOWER_SEED_COIN_COSTS !== "undefined" && FLOWER_SEED_COIN_COSTS[seedName] && coinsPerSFL > 0) {
          const coins = FLOWER_SEED_COIN_COSTS[seedName];
          const price = coins / coinsPerSFL;
          return { price, method: "Flower (seed cost)", detail: `${itemName} \u2192 ${seedName} (${coins}c) / ${coinsPerSFL.toFixed(0)} c/SFL = ${fNum(price)}` };
        }
      }

      // Treasure sell prices
      if (typeof TREASURE_SELL_PRICES !== "undefined" && TREASURE_SELL_PRICES[itemName] && coinsPerSFL > 0) {
        const coins = TREASURE_SELL_PRICES[itemName];
        const price = coins / coinsPerSFL;
        return { price, method: "Treasure (sell price)", detail: `sell ${coins}c / ${coinsPerSFL.toFixed(0)} c/SFL = ${fNum(price)}` };
      }

      // Fish/food XP pricing
      if (typeof ITEM_XP_VALUES !== "undefined" && ITEM_XP_VALUES[itemName] && sflPerXP > 0) {
        const xp = ITEM_XP_VALUES[itemName];
        const price = xp * sflPerXP;
        return { price, method: "XP value", detail: `${xp} XP \u00d7 ${sflPerXP.toFixed(6)} SFL/XP = ${fNum(price)}` };
      }

      // Giant item coin prices
      if (typeof GIANT_ITEM_COIN_PRICES !== "undefined" && GIANT_ITEM_COIN_PRICES[itemName] && coinsPerSFL > 0) {
        const coins = GIANT_ITEM_COIN_PRICES[itemName];
        const price = coins / coinsPerSFL;
        return { price, method: "Giant (sell price)", detail: `sell ${coins}c / ${coinsPerSFL.toFixed(0)} c/SFL = ${fNum(price)}` };
      }

      // Crustaceans
      if (typeof CRUSTACEAN_RECIPES !== "undefined" && CRUSTACEAN_RECIPES[itemName]) {
        const cr = CRUSTACEAN_RECIPES[itemName];
        const potPrice = estimateItemSfl(cr.pot, p2pPrices, null, rates);
        let parts = [`${cr.pot} (${fNum(potPrice)})`];
        let chumCost = 0;
        if (cr.chum && cr.qty > 0) {
          const chumPrice = estimateItemSfl(cr.chum, p2pPrices, null, rates);
          chumCost = chumPrice * cr.qty;
          let chumDetail = `${cr.qty}\u00d7 ${cr.chum} (${fNum(chumPrice)})`;
          if (cr.alt) {
            const altParts = cr.alt.match(/^(.+?)\s*x(\d+)$/);
            if (altParts) {
              const altItemPrice = estimateItemSfl(altParts[1], p2pPrices, null, rates);
              const altCost = altItemPrice * parseInt(altParts[2]);
              if (altCost > 0 && (chumCost <= 0 || altCost < chumCost)) {
                chumCost = altCost;
                chumDetail = `${altParts[2]}\u00d7 ${altParts[1]} (${fNum(altItemPrice)}) [cheaper alt]`;
              }
            }
          }
          parts.push(chumDetail);
        }
        const total = potPrice + chumCost;
        return { price: total, method: "Crustacean (pot+chum)", detail: parts.join(" + ") + ` = ${fNum(total)}` };
      }

      return null;
    }

    // Collect all items that have derived prices (not from P2P/NFT API)
    function collectDerivedPriceItems(p2pPrices, rates) {
      const items = new Map(); // name -> { method, category }
      const addItems = (source, category) => {
        if (typeof source === "undefined" || !source) return;
        for (const name of Object.keys(source)) {
          if (!items.has(name)) items.set(name, category);
        }
      };

      // Collect from all pricing tables
      addItems(typeof CRAFTED_INGREDIENT_RECIPES !== "undefined" ? CRAFTED_INGREDIENT_RECIPES : null, "Crafted");
      addItems(typeof RECIPE_INGREDIENTS !== "undefined" ? RECIPE_INGREDIENTS : null, "Food");
      addItems(typeof DOLL_RECIPES !== "undefined" ? DOLL_RECIPES : null, "Dolls");
      addItems(typeof TOOL_COSTS !== "undefined" ? TOOL_COSTS : null, "Tools");
      addItems(typeof FLOWER_SEED_COIN_COSTS !== "undefined" ? FLOWER_SEED_COIN_COSTS : null, "Flower seeds");
      addItems(typeof FLOWER_RECIPES !== "undefined" ? FLOWER_RECIPES : null, "Flowers");
      addItems(typeof TREASURE_SELL_PRICES !== "undefined" ? TREASURE_SELL_PRICES : null, "Treasures");
      addItems(typeof ITEM_XP_VALUES !== "undefined" ? ITEM_XP_VALUES : null, "Fish/XP");
      addItems(typeof GIANT_ITEM_COIN_PRICES !== "undefined" ? GIANT_ITEM_COIN_PRICES : null, "Giants");
      addItems(typeof CRUSTACEAN_RECIPES !== "undefined" ? CRUSTACEAN_RECIPES : null, "Crustaceans");

      // Special items
      items.set("Oil", "Resources");
      items.set("Love Charm", "Special");
      items.set("Barn Delight", "Food");

      // Seed items from SEED_COSTS (keyed by crop name, but items appear as "X Seed")
      if (typeof SEED_COSTS !== "undefined") {
        for (const cropName of Object.keys(SEED_COSTS)) {
          const seedName = cropName + " Seed";
          if (!items.has(seedName)) items.set(seedName, "Seeds");
        }
      }

      // Now compute explanations, skip P2P items
      const results = [];
      for (const [name, cat] of items) {
        const ex = explainItemSfl(name, p2pPrices, rates);
        if (ex) results.push({ name, category: cat, ...ex });
      }

      // Sort by category then name
      const catOrder = ["Tools", "Seeds", "Flower seeds", "Flowers", "Food", "Crafted", "Dolls", "Fish/XP", "Treasures", "Crustaceans", "Giants", "Resources", "Special"];
      results.sort((a, b) => {
        const ca = catOrder.indexOf(a.category), cb = catOrder.indexOf(b.category);
        if (ca !== cb) return (ca === -1 ? 99 : ca) - (cb === -1 ? 99 : cb);
        return a.name.localeCompare(b.name);
      });
      return results;
    }

    async function renderDiff(data) {'''
assert old_fn in html, "estimateItemSfl end anchor not found"
html = html.replace(old_fn, new_fn)

# ═══════════════════════════════════════
# 3. Add pricing table rendering in renderContent (before innerHTML assignment)
# ═══════════════════════════════════════
old_render = '''        document.getElementById("diff-content").innerHTML = out;
      }

      // Global handlers'''
new_render = r'''        // Pricing explanation table (collapsed)
        const priceExplanations = collectDerivedPriceItems(p2pPrices, { coinsPerSFL, sflPerXP });
        if (priceExplanations.length > 0) {
          const _cm = getCurMult();
          const _cl = getCurLabel();
          out += `<details class="diff-price-explain pixel-font">`;
          out += `<summary>Pricing methods (${priceExplanations.length} derived items)</summary>`;
          out += `<table class="pe-table"><thead><tr><th>Item</th><th>${_cl} Price</th><th>Method</th><th>Calculation</th></tr></thead><tbody>`;
          let lastCat = "";
          for (const item of priceExplanations) {
            if (item.category !== lastCat) {
              lastCat = item.category;
              out += `<tr class="pe-cat-hdr"><td colspan="4">${escHTML(item.category)}</td></tr>`;
            }
            const priceStr = item.price > 0 ? (item.price * _cm).toFixed(4) : "\u2014";
            out += `<tr>`;
            out += `<td>${escHTML(item.name)}</td>`;
            out += `<td>${priceStr}</td>`;
            out += `<td class="pe-method">${escHTML(item.method)}</td>`;
            out += `<td class="pe-detail">${escHTML(item.detail)}</td>`;
            out += `</tr>`;
          }
          out += `</tbody></table></details>`;
        }

        document.getElementById("diff-content").innerHTML = out;
      }

      // Global handlers'''
assert old_render in html, "renderContent innerHTML anchor not found"
html = html.replace(old_render, new_render)

with open(REAL, 'w', encoding='utf-8') as f:
    f.write(html)

print("OK: Pricing explanation table added to diff page")
print(f"File size: {len(html)} chars")
