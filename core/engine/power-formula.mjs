// Power formula panel — buildFormulaHTML extracted VERBATIM from flowers.html
// 15360-15600 for on-demand serving (section=power&formulaFor=…). It produces an HTML
// STRING (pure computation — no DOM access): the page's expandable derivation panel.
// Deviations: powerState reads → _getPowerContext(); sflIcon/escHTML are local copies
// of the page's pure string helpers; activeShrineEffects gets farm explicitly.
import { _getPowerContext } from "./roadmap.mjs";
import {
  getEffectsForCategory, getCapacityCount, getCycleSec, getBaseYield, applyBoosts,
  calcToolCostPerDay, isAnimalCat, TOOL_TO_CAT, ANIMAL_CAT_MAP,
  POWER_CATEGORIES, getDefaultProduct, RESOURCE_RESPAWN_DATA, SEED_DATA,
  getAnimalData,
} from "./power-helpers.mjs";
import {
  unitToSfl, getPriceProduct, getAnimalCatSfl, calcLavaPitCostPerDay,
  calcAnimalFeedCost, calcSicknessCost, activeShrineEffects, getAnimalDropsPerCycle,
} from "./power-costs.mjs";
import { TOOL_COSTS } from "../data/economy.mjs";
import { FRUIT_HARVEST_COUNT, FRUIT_GROW_DATA } from "./power-boosts.mjs";

const SFL_ICON_URL = "https://raw.githubusercontent.com/sunflower-land/sunflower-land/main/src/assets/icons/flower_token.webp";
function sflIcon(size) {
  return `<img src="${SFL_ICON_URL}" class="sfl-icon" alt="SFL"${size ? ` style="height:${size}"` : ""}>`;
}
// page's formatSec (verbatim) — cycle-time formatting used by the panel
    function formatSec(sec) {
      if (sec < 60) return sec + "s";
      if (sec < 3600) return (sec / 60).toFixed(0) + "m";
      if (sec < 86400) return (sec / 3600).toFixed(1) + "h";
      return (sec / 86400).toFixed(1) + "d";
    }
function escHTML(s) {
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

    // ── flowers.html 15360-15600: buildFormulaHTML ──
    function buildFormulaHTML(boostItem, catId, product, capacity, p2pPrices, allCatBoosts) {
      const catEffects = getEffectsForCategory(boostItem, catId);
      const priceProduct = getPriceProduct(catId, product);
      const price = p2pPrices[priceProduct] || 0;
      const n = getCapacityCount(catId, capacity);
      const baseCycleSec = getCycleSec(catId, product);
      const baseYield = getBaseYield(catId);

      const powerState = _getPowerContext(); // deviation
      const { skillCostInfo } = powerState;

      let h = `<div class="power-formula pixel-font">`;
      // Header with type and cost
      if (boostItem.type === "Skill") {
        h += `<div style="margin-bottom:6px"><strong>${escHTML(boostItem.name)}</strong> — Skill (${escHTML(boostItem.skillTree)}, Tier ${boostItem.skillTier}, ${boostItem.skillPoints} point${boostItem.skillPoints > 1 ? "s" : ""})`;
        if (boostItem.floor > 0) h += ` | Est. cost: ~${boostItem.floor.toFixed(0)} ${sflIcon()}`;
        h += `</div>`;
      } else {
        h += `<div style="margin-bottom:6px"><strong>${escHTML(boostItem.name)}</strong> — ${escHTML(boostItem.type)}${boostItem.markCost > 0 ? ` | ${(boostItem.markCost/1000).toFixed(0)}k Marks = ${boostItem.floor.toFixed(0)} ${sflIcon()}` : boostItem.floor > 0 ? ` | Floor: ${boostItem.floor.toFixed(1)} ${sflIcon()}` : ""}</div>`;
      }
      h += `<div style="color:var(--green);margin-bottom:6px">${escHTML(boostItem.boost)}</div>`;

      // Disabled state — superseded by stronger item
      if (boostItem.isDisabled) {
        h += `<div style="color:var(--red);margin:8px 0">⛔ This boost is <strong>DISABLED</strong> — superseded by <strong>${escHTML(boostItem.disabledByName)}</strong> which is active on your farm.</div>`;
        h += `</div>`;
        return h;
      }

      // Skill cost breakdown
      if (boostItem.type === "Skill" && skillCostInfo && skillCostInfo.sflPerPoint > 0) {
        const br = skillCostInfo.bestRecipe;
        h += `<hr style="border-color:var(--border-dark);margin:4px 0">`;
        h += `<div style="margin-bottom:2px;color:var(--lily)"><strong>Skill Cost Calculation:</strong></div>`;
        h += `<div>Bumpkin Level: ${skillCostInfo.level} → Total XP: ${(skillCostInfo.totalXP / 1e6).toFixed(1)}M</div>`;
        h += `<div>Best recipe: ${escHTML(br.name)} (base ${br.xp} XP${br.boostedXP !== br.xp ? ` → ${br.boostedXP} XP boosted` : ""} / ${br.cost.toFixed(4)} ${sflIcon()} = ${br.ratio.toFixed(0)} XP/${sflIcon()})</div>`;
        if (skillCostInfo.xpBoostNames?.length) h += `<div>XP boosts applied: ${escHTML(skillCostInfo.xpBoostNames.join(", "))}</div>`;
        h += `<div>Avg cost per level: ${skillCostInfo.sflPerLevel.toFixed(1)} ${sflIcon()} → <strong>1 skill point ≈ ${skillCostInfo.sflPerPoint.toFixed(1)} ${sflIcon()}</strong></div>`;
        h += `<div style="color:var(--sunpetal)">This skill (${boostItem.skillPoints}pt): <strong>${boostItem.skillPoints} × ${skillCostInfo.sflPerPoint.toFixed(1)} = ~${boostItem.floor.toFixed(0)} ${sflIcon()}</strong></div>`;
      }
      h += `<hr style="border-color:var(--border-dark);margin:4px 0">`;

      // Free tool formula (e.g., Quarry, Foreman Beaver)
      const freeToolEffects = catEffects.filter(e => e.type === "free_tool");
      if (freeToolEffects.length > 0 && ["trees", "stone", "iron", "gold", "crimstone", "oil"].includes(catId)) {
        const { exchangeRates, stockMods } = powerState;
        const baseCost = calcToolCostPerDay(catId, capacity, exchangeRates, p2pPrices, stockMods, true);
        h += `<div style="margin-bottom:4px"><strong>Category:</strong> ${catId.toUpperCase()} — ${n} nodes</div>`;
        h += `<div style="color:var(--green)">🆓 <strong>No tool cost!</strong> (mine/chop without tools)</div>`;
        h += `<div>Base tool cost would be: ${baseCost.toolSfl.toFixed(4)} ${sflIcon()} per use</div>`;
        h += `<div>Would use ${(baseCost.toolsPerDay || 0).toFixed(2)} tools/day</div>`;
        h += `<div style="color:var(--green)"><strong>Cost savings: ${baseCost.costPerDay.toFixed(4)} ${sflIcon()}/day</strong></div>`;
        if (boostItem.floor > 0 && baseCost.costPerDay > 0) {
          h += `<div><strong>ROI:</strong> ${boostItem.floor.toFixed(1)} / ${baseCost.costPerDay.toFixed(4)} = <span style="color:var(--sunpetal)">${(boostItem.floor / baseCost.costPerDay).toFixed(0)} days</span></div>`;
        }
        h += `</div>`;
        return h;
      }

      // Cost reduction formula (e.g., Feller's Discount, Frugal Miner)
      const costRedEffects = catEffects.filter(e => e.type === "cost_reduction");
      if (costRedEffects.length > 0 && ["trees", "stone", "iron", "gold", "crimstone", "oil"].includes(catId)) {
        const { exchangeRates, stockMods } = powerState;
        // Check if free tools already active → cost reduction is redundant
        const hasFreeToolsFormula = allCatBoosts.some(b => b.has && !b.isDisabled &&
          getEffectsForCategory(b, catId).some(e => e.type === "free_tool"));
        if (hasFreeToolsFormula) {
          h += `<div style="color:var(--text-dim);margin:8px 0">🆓 <strong>NO EFFECT</strong> — tools in this category are already free (free tool boost active). A cost discount on a free tool saves nothing.</div>`;
          h += `</div>`;
          return h;
        }
        const eff = costRedEffects[0];
        const toolName = Object.keys(TOOL_TO_CAT).find(t => TOOL_TO_CAT[t] === catId);
        const tool = toolName ? TOOL_COSTS[toolName] : null;
        if (tool && exchangeRates.coinsPerSFL > 0) {
          const baseCost = calcToolCostPerDay(catId, capacity, exchangeRates, p2pPrices, stockMods, true);
          const coinSavings = tool.coins * eff.value;
          const sflSavings = coinSavings / exchangeRates.coinsPerSFL;
          const dailySavings = sflSavings * (baseCost.toolsPerDay || 0);
          h += `<div style="margin-bottom:4px"><strong>Category:</strong> ${catId.toUpperCase()} — ${n} nodes, tool: ${escHTML(toolName)}</div>`;
          h += `<div>Base tool coin cost: ${tool.coins} coins = ${(tool.coins / exchangeRates.coinsPerSFL).toFixed(6)} ${sflIcon()}</div>`;
          h += `<div>Discount: -${(eff.value * 100).toFixed(0)}% coin cost → saves ${coinSavings.toFixed(1)} coins = ${sflSavings.toFixed(6)} ${sflIcon()} per use</div>`;
          h += `<div>Tools/day: ${(baseCost.toolsPerDay || 0).toFixed(2)}</div>`;
          h += `<div style="color:var(--green)"><strong>Cost savings: ${sflSavings.toFixed(6)} × ${(baseCost.toolsPerDay || 0).toFixed(2)} = ⬇${dailySavings.toFixed(4)} ${sflIcon()}/day</strong></div>`;
          if (boostItem.floor > 0 && dailySavings > 0) {
            h += `<div><strong>ROI:</strong> ${boostItem.floor.toFixed(1)} / ${dailySavings.toFixed(4)} = <span style="color:var(--sunpetal)">${(boostItem.floor / dailySavings).toFixed(0)} days</span></div>`;
          }
        }
        h += `</div>`;
        return h;
      }

      // Lava pit cost reduction formula (e.g., Lava Swimwear -50% resources)
      const lavaCostFx = catEffects.filter(e => e.type === "lava_cost_reduction");
      if (lavaCostFx.length > 0 && catId === "obsidian") {
        const { season } = powerState;
        const costMult = lavaCostFx.reduce((acc, e) => acc * (1 - e.value), 1);
        const baseCost = calcLavaPitCostPerDay(capacity, p2pPrices, season);
        const reducedCost = calcLavaPitCostPerDay(capacity, p2pPrices, season, costMult);
        const savings = baseCost.costPerDay - reducedCost.costPerDay;
        const seasonName = (season || "?").charAt(0).toUpperCase() + (season || "?").slice(1);
        h += `<div style="margin-bottom:4px"><strong>Category:</strong> OBSIDIAN — ${n} lava pits, season: ${escHTML(seasonName)}</div>`;
        h += `<div>Resource reduction: -${Math.round((1 - costMult) * 100)}% materials per ignition</div>`;
        h += `<div>Base cost/ignition: ${baseCost.costPerIgnition.toFixed(2)} ${sflIcon()}</div>`;
        h += `<div>Reduced cost/ignition: ${reducedCost.costPerIgnition.toFixed(2)} ${sflIcon()}</div>`;
        h += `<div>Ignitions/day: ${(baseCost.ignitionsPerDay || 0).toFixed(2)}</div>`;
        h += `<div style="color:var(--green)"><strong>Cost savings: (${baseCost.costPerIgnition.toFixed(2)} - ${reducedCost.costPerIgnition.toFixed(2)}) × ${(baseCost.ignitionsPerDay || 0).toFixed(2)} = 🌋⬇${savings.toFixed(4)} ${sflIcon()}/day</strong></div>`;
        if (boostItem.floor > 0 && savings > 0) {
          h += `<div><strong>ROI:</strong> ${boostItem.floor.toFixed(1)} / ${savings.toFixed(4)} = <span style="color:var(--sunpetal)">${(boostItem.floor / savings).toFixed(0)} days</span></div>`;
        }
        h += `</div>`;
        return h;
      }

      // Fruit stump formula (No Axe No Worries, Fruity Woody)
      const fruitStumpWoodFx = catEffects.filter(e => e.type === "fruit_stump_wood");
      const fruitFreeChopFx = catEffects.filter(e => e.type === "fruit_free_chop");
      if ((fruitStumpWoodFx.length > 0 || fruitFreeChopFx.length > 0) && catId === "fruits") {
        const { exchangeRates } = powerState;
        const harvestCount = FRUIT_HARVEST_COUNT[product] || 3;
        const growSec = FRUIT_GROW_DATA[product] || 43200;
        const lifecycleSec = harvestCount * growSec;
        const lifecyclesPerDay = n > 0 ? n * (86400 / lifecycleSec) : 0;
        const woodPrice = p2pPrices["Wood"] || 0;

        h += `<div style="margin-bottom:4px"><strong>Category:</strong> FRUITS — ${n} patches, product: ${escHTML(product)}</div>`;
        h += `<div style="margin-bottom:4px"><strong>Fruit lifecycle:</strong> ${harvestCount} harvests × ${formatSec(growSec)} = ${formatSec(lifecycleSec)} per lifecycle</div>`;
        h += `<div style="margin-bottom:4px"><strong>Lifecycles/day:</strong> ${n} patches × (86400 / ${lifecycleSec}) = ${lifecyclesPerDay.toFixed(2)}/day</div>`;

        let totalValue = 0;
        if (fruitStumpWoodFx.length > 0) {
          for (const eff of fruitStumpWoodFx) {
            const woodVal = lifecyclesPerDay * eff.value * woodPrice;
            totalValue += woodVal;
            h += `<div><strong>Wood from stump:</strong> ${eff.value > 0 ? "+" : ""}${eff.value} × ${lifecyclesPerDay.toFixed(2)}/day × ${woodPrice.toFixed(4)} ${sflIcon()}/wood = <span style="color:var(${woodVal >= 0 ? '--green' : '--red'})">${woodVal >= 0 ? '+' : ''}${woodVal.toFixed(4)} ${sflIcon()}/day</span></div>`;
          }
        }
        if (fruitFreeChopFx.length > 0 && exchangeRates.coinsPerSFL > 0) {
          const axeTool = TOOL_COSTS["Axe"];
          if (axeTool) {
            const axeSfl = axeTool.coins / exchangeRates.coinsPerSFL;
            const savings = lifecyclesPerDay * axeSfl;
            totalValue += savings;
            h += `<div><strong>Axe saved:</strong> ${lifecyclesPerDay.toFixed(2)}/day × ${axeSfl.toFixed(4)} ${sflIcon()}/axe = <span style="color:var(--green)">+${savings.toFixed(4)} ${sflIcon()}/day</span></div>`;
          }
        }
        h += `<div style="margin-top:4px;color:var(${totalValue >= 0 ? '--green' : '--red'})"><strong>Net: ${totalValue >= 0 ? '+' : ''}${totalValue.toFixed(4)} ${sflIcon()}/day</strong></div>`;
        if (boostItem.floor > 0 && totalValue > 0) {
          h += `<div><strong>ROI:</strong> ${boostItem.floor.toFixed(1)} / ${totalValue.toFixed(4)} = <span style="color:var(--sunpetal)">${(boostItem.floor / totalValue).toFixed(0)} days</span></div>`;
        } else if (totalValue < 0 && boostItem.floor > 0) {
          h += `<div style="color:var(--red)"><strong>ROI: LOSS</strong> — net value is negative</div>`;
        }
        h += `</div>`;
        return h;
      }

      if (POWER_CATEGORIES[catId]?.quantifiable && n > 0) {
        if (isAnimalCat(catId)) {
          // Animal multi-product formula
          const animal = getAnimalData(catId);
          h += `<div style="margin-bottom:4px"><strong>Farm:</strong> ${n} ${catId} (${formatSec(animal.cycleSec)} cycle) → ${animal.products.join(" + ")}</div>`;

          const baseInfo = getAnimalCatSfl(catId, capacity, [], p2pPrices);
          h += `<div style="margin-bottom:4px"><strong>Base:</strong> ${baseInfo.totalSfl.toFixed(4)} ${sflIcon()}/day (${baseInfo.breakdown.map(bp => `${bp.product}: ${bp.unitsPerDay.toFixed(1)}/day`).join(", ")})</div>`;

          const soloInfo = getAnimalCatSfl(catId, capacity, catEffects, p2pPrices);
          const soloDelta = soloInfo.totalSfl - baseInfo.totalSfl;
          h += `<div style="margin-bottom:4px"><strong>Solo:</strong> ${soloInfo.totalSfl.toFixed(4)} ${sflIcon()}/day (<span style="color:var(--green)">+${soloDelta.toFixed(4)}</span>)</div>`;

          const ownedEffects = allCatBoosts.filter(b => b.has && !b.isDisabled).flatMap(b => getEffectsForCategory(b, catId)).concat(activeShrineEffects(powerState.farm, catId));
          if (boostItem.has) {
            const allInfo = getAnimalCatSfl(catId, capacity, ownedEffects, p2pPrices);
            const withoutEffects = allCatBoosts.filter(b => b.has && !b.isDisabled && b.name !== boostItem.name).flatMap(b => getEffectsForCategory(b, catId)).concat(activeShrineEffects(powerState.farm, catId));
            const withoutInfo = getAnimalCatSfl(catId, capacity, withoutEffects, p2pPrices);
            const marginal = allInfo.totalSfl - withoutInfo.totalSfl;
            h += `<div style="margin-bottom:4px"><strong>Marginal (${ownedEffects.length} effects):</strong> <span style="color:var(--green)">+${marginal.toFixed(4)} ${sflIcon()}/day</span></div>`;
            if (boostItem.floor > 0 && marginal > 0) {
              h += `<div><strong>ROI:</strong> ${boostItem.floor.toFixed(1)} / ${marginal.toFixed(4)} = <span style="color:var(--sunpetal)">${(boostItem.floor / marginal).toFixed(0)} days</span></div>`;
            }
          } else {
            const withThis = [...ownedEffects, ...catEffects];
            const withInfo = getAnimalCatSfl(catId, capacity, withThis, p2pPrices);
            const ownedInfo = getAnimalCatSfl(catId, capacity, ownedEffects, p2pPrices);
            const synergy = withInfo.totalSfl - ownedInfo.totalSfl;
            h += `<div style="margin-bottom:4px"><strong>Synergy (with your boosts):</strong> <span style="color:var(--green)">+${synergy.toFixed(4)} ${sflIcon()}/day</span></div>`;
            if (boostItem.floor > 0 && synergy > 0) {
              h += `<div><strong>ROI:</strong> ${boostItem.floor.toFixed(1)} / ${synergy.toFixed(4)} = <span style="color:var(--sunpetal)">${(boostItem.floor / synergy).toFixed(0)} days</span></div>`;
            }
          }
        } else {
          // Non-animal formula (original)
          h += `<div style="margin-bottom:4px"><strong>Farm:</strong> ${n} × ${escHTML(product)} (${formatSec(baseCycleSec)} grow | ${price.toFixed(6)} ${sflIcon()})</div>`;

          const baseResult = applyBoosts(catId, product, capacity, []);
          const baseSfl = unitToSfl(baseResult.unitsPerDay, priceProduct, p2pPrices);
          h += `<div style="margin-bottom:4px"><strong>Base:</strong> ${baseResult.unitsPerDay.toFixed(2)} units/day = ${baseSfl.toFixed(4)} ${sflIcon()}/day</div>`;

          const soloResult = applyBoosts(catId, product, capacity, catEffects);
          const soloSfl = unitToSfl(soloResult.unitsPerDay, priceProduct, p2pPrices);
          const soloDelta = soloSfl - baseSfl;
          h += `<div style="margin-bottom:4px"><strong>Solo:</strong>`;
          if (soloResult.speedMult !== 1) h += ` speed ×${soloResult.speedMult.toFixed(2)}`;
          if (soloResult.yieldMult !== 1) h += ` yield ×${soloResult.yieldMult.toFixed(2)}`;
          if (soloResult.yieldFlat) h += ` +${soloResult.yieldFlat.toFixed(2)}/cycle`;
          h += ` → ${soloSfl.toFixed(4)} ${sflIcon()}/day (<span style="color:var(--green)">+${soloDelta.toFixed(4)}</span>)</div>`;

          const ownedEffects = allCatBoosts.filter(b => b.has && !b.isDisabled).flatMap(b => getEffectsForCategory(b, catId)).concat(activeShrineEffects(powerState.farm, catId));
          if (boostItem.has) {
            const allResult = applyBoosts(catId, product, capacity, ownedEffects);
            const withoutEffects = allCatBoosts.filter(b => b.has && !b.isDisabled && b.name !== boostItem.name).flatMap(b => getEffectsForCategory(b, catId)).concat(activeShrineEffects(powerState.farm, catId));
            const withoutResult = applyBoosts(catId, product, capacity, withoutEffects);
            const allSfl = unitToSfl(allResult.unitsPerDay, priceProduct, p2pPrices);
            const withoutSfl = unitToSfl(withoutResult.unitsPerDay, priceProduct, p2pPrices);
            const marginal = allSfl - withoutSfl;
            h += `<div style="margin-bottom:4px"><strong>Marginal (${ownedEffects.length} active effects):</strong> <span style="color:var(--green)">+${marginal.toFixed(4)} ${sflIcon()}/day</span></div>`;
            if (boostItem.floor > 0 && marginal > 0) {
              const roi = boostItem.floor / marginal;
              h += `<div><strong>ROI:</strong> ${boostItem.floor.toFixed(1)} / ${marginal.toFixed(4)} = <span style="color:var(--sunpetal)">${roi.toFixed(0)} days</span></div>`;
            }
          } else {
            const withThis = [...ownedEffects, ...catEffects];
            const withResult = applyBoosts(catId, product, capacity, withThis);
            const ownedResult = applyBoosts(catId, product, capacity, ownedEffects);
            const withSfl = unitToSfl(withResult.unitsPerDay, priceProduct, p2pPrices);
            const ownedSfl = unitToSfl(ownedResult.unitsPerDay, priceProduct, p2pPrices);
            const synergy = withSfl - ownedSfl;
            h += `<div style="margin-bottom:4px"><strong>Synergy (with your boosts):</strong> <span style="color:var(--green)">+${synergy.toFixed(4)} ${sflIcon()}/day</span></div>`;
            if (boostItem.floor > 0 && synergy > 0) {
              const roi = boostItem.floor / synergy;
              h += `<div><strong>ROI:</strong> ${boostItem.floor.toFixed(1)} / ${synergy.toFixed(4)} = <span style="color:var(--sunpetal)">${roi.toFixed(0)} days</span></div>`;
            }
          }
        }
      } else if (n === 0 && POWER_CATEGORIES[catId]?.quantifiable) {
        h += `<div style="color:var(--text-dim)">No capacity detected for this category. Cannot calculate ${sflIcon()}/day.</div>`;
      } else {
        h += `<div style="color:var(--text-dim)">Qualitative boost — cannot calculate ${sflIcon()}/day value.</div>`;
      }

      h += `</div>`;
      return h;
    }

export { buildFormulaHTML };
