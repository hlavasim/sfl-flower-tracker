// BUMPKIN as widgets. The cooking numbers come from the engine (/api/compute?section=cooking, the
// same query the page sends); these only shape them, exactly as the page did:
//   🧑‍🌾 Bumpkin XP: the level, the XP, the way to the target level (or, ascended, the band and its
//      expansion gates at the cooking pace)
//   🍲 Banked food: the cooked food in the inventory and the level after eating it
//   ⚡ Cooking boosts: XP / time / amount boosts and the pet streak
//   🍳 Kitchens: per building the chosen recipe and what it makes (on the page the recipe is picked here)
//   📈 Leveling plan: all kitchens together, days and ingredient cost to the target, per level
import { BUMPKIN_XP_TABLE, getTotalBumpkinLevel, _ascBaseline, _ascBandXp, _withinAscensionLevel } from "../core/engine/power-helpers.mjs";
import { SWAMP_EXPANSION_LEVELS, ascensionXpFor } from "../core/engine/ascension.mjs";
import { getUncappedTotalLevel, xpRemainingToNextLevel } from "../core/engine/bumpkin-xp.mjs";
import { COOKING_BUILDING_EMOJI, BUMPKIN_DEFAULT_RECIPES } from "../core/data/cooking.mjs";
import { bar, kpis, bigBar, pill } from "../ui/viz.mjs";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const icon = (ctx, n) => (typeof ctx.icon === "function" ? ctx.icon(n) : "");
const num = (v) => Math.round(v).toLocaleString();
// the page's formatters when it hands them over, else plain ones (a board without the page)
const sfl = (ctx, v) => (typeof ctx.sfl === "function" ? ctx.sfl(v) : (+v).toFixed(2));
const cookTime = (ctx, s) => (typeof ctx.cookTime === "function" ? ctx.cookTime(s) : `${Math.round(s / 60)}m`);
const fmtXP = (v) => (v % 1 === 0 ? v.toLocaleString() : v.toLocaleString(undefined, { maximumFractionDigits: 0 }));
const fmtXP2 = (v) => (v % 1 === 0 ? v.toLocaleString() : v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const fmtSfl = (v) => (v == null ? "—" : v < 0.01 ? "<0.01" : v < 100 ? v.toFixed(2) : Math.round(v).toLocaleString());

export const SORTS = [["xpPerHour", "XP/hour"], ["xpPerSfl", "XP per SFL"], ["sflPerCook", "SFL/cook"]];

// The page's saved settings (localStorage), read where the widget runs.
function readLs(key, d) {
  try { const ls = globalThis.localStorage; const v = ls && ls.getItem(key); return v == null ? d : v; } catch { return d; }
}
export function savedRecipes() {
  try { return JSON.parse(readLs("sfl_bumpkin_recipes", "") || "{}") || {}; } catch { return {}; }
}
export function pageBumpkin() {
  return { target: parseInt(readLs("sfl_bumpkin_target", "200")), recipes: savedRecipes(), sort: readLs("sfl_bumpkin_sort", "xpPerHour") };
}

// The section=cooking query the page sends (pet streak simulation, recipe pick, fish by reels).
export function cookingQuery(farmId) {
  return { res: "compute", farm: farmId, section: "cooking", q: {
    petSimulate: readLs("sfl_pet_streak", "0") === "1" ? "1" : "0",
    recipes: JSON.stringify(savedRecipes()),
    fishReels: readLs("sfl_fish_reels", "0") === "1" ? "1" : "0",
    explain: "1",
  } };
}
const needs = (farmId) => ({ farm: { res: "farm", farm: farmId }, cook: cookingQuery(farmId) });

const page = (ctx) => (typeof ctx.page === "function" ? ctx.page() || {} : pageBumpkin());
const targetOpt = (opts) => (opts.target !== undefined && opts.target !== null && opts.target !== "" && Number.isFinite(Number(opts.target)) ? Number(opts.target) : null);

// Everything the page computed from the farm and the cooking payload, in one place.
export function bumpkinPlan(farm, cook, { target = 200, recipes = {}, sort = "xpPerHour" } = {}) {
  const bumpkin = farm.bumpkin || {};
  const currentXP = parseFloat(bumpkin.experience || 0);
  const ascLevel = (farm.island && farm.island.ascensionLevel) || 0;
  const ascended = ascLevel >= 1;
  const currentLevel = getTotalBumpkinLevel(currentXP, ascLevel);
  const maxXP = BUMPKIN_XP_TABLE[199];
  const targetLevel = Math.max(Math.min(currentLevel, 199) + 1, Math.min(200, Number.isFinite(target) ? target : 200));
  const targetXP = BUMPKIN_XP_TABLE[targetLevel - 1] || maxXP;
  const xpRemaining = Math.max(0, targetXP - currentXP);
  const xpPctTarget = targetXP > 0 ? Math.min(100, (currentXP / targetXP) * 100) : 100;
  const nextLevelXP = currentLevel < 200 ? BUMPKIN_XP_TABLE[currentLevel] : maxXP;
  const prevLevelXP = BUMPKIN_XP_TABLE[Math.min(currentLevel, 200) - 1] || 0;
  const levelProgress = currentLevel >= 200 ? 100 : Math.round(((currentXP - prevLevelXP) / (nextLevelXP - prevLevelXP)) * 100);

  // Ascended: XP keeps accumulating past a band's cap; only the LEVEL freezes until you ascend.
  // workBand = the ascension the XP is actually filling now.
  const uncappedLevel = ascended ? getUncappedTotalLevel(currentXP, ascLevel) : currentLevel;
  let workBand = ascLevel, workBandLevel = 0, xpToBandDone = 0, ascProgressPct = 100;
  if (ascended) {
    while (currentXP >= _ascBaseline(workBand) + _ascBandXp(workBand)) workBand++;
    workBandLevel = _withinAscensionLevel(currentXP, workBand);
    const wbBase = _ascBaseline(workBand), wbBand = _ascBandXp(workBand);
    xpToBandDone = Math.max(0, wbBase + wbBand - currentXP);
    ascProgressPct = wbBand > 0 ? Math.min(100, Math.max(0, ((currentXP - wbBase) / wbBand) * 100)) : 0;
  }
  const xpPerDayCook = (cook && cook.totalXpPerDay) || 0;
  // Expansion level-gates of the working band: pure XP milestones (1 level ⇒ 1 skill point ⇒ 1 unlock).
  const gates = [];
  if (ascended) {
    for (let e = 1; e <= 12; e++) {
      const g = SWAMP_EXPANSION_LEVELS[e];
      gates.push({ e, band: g, reached: workBandLevel >= g, xpToGate: Math.max(0, ascensionXpFor(workBand, g) - currentXP) });
    }
  }
  const out = { currentXP, ascLevel, ascended, currentLevel, targetLevel, xpRemaining, xpPctTarget, levelProgress,
    uncappedLevel, workBand, workBandLevel, xpToBandDone, ascProgressPct, gates, xpPerDayCook, cook: !!cook };
  if (!cook) return out;

  // ── what the cooking payload adds ──
  const bankedXP = cook.bankedFood.totalXp;
  const food = (cook.bankedFood.items || []).slice().sort((a, b) => b.totalFoodXP - a.totalFoodXP);
  const xpAfterFood = Math.max(0, xpRemaining - bankedXP);
  const xpAfterEating = currentXP + bankedXP;
  // uncapped once ascended: eating counts toward the next ascension even past the cap
  const levelAfterFoodU = getUncappedTotalLevel(xpAfterEating, ascLevel);
  const afterFoodNextXP = levelAfterFoodU < 200 ? BUMPKIN_XP_TABLE[levelAfterFoodU] : maxXP;
  const afterFoodPrevXP = BUMPKIN_XP_TABLE[Math.min(levelAfterFoodU, 200) - 1] || 0;
  const afterFoodPct = levelAfterFoodU >= 200 ? 100 : Math.round(((xpAfterEating - afterFoodPrevXP) / (afterFoodNextXP - afterFoodPrevXP)) * 100);

  let totalXPPerDay = 0, totalCostPerDay = 0;
  const buildings = Object.entries(cook.buildings || {}).map(([name, bStats]) => {
    const count = bStats.buildingCount;
    const list = (bStats.recipes || []).slice();
    if (sort === "xpPerSfl") list.sort((a, b) => b.xpPerSfl - a.xpPerSfl);
    else if (sort === "sflPerCook") list.sort((a, b) => (a.cost == null ? Infinity : a.cost) - (b.cost == null ? Infinity : b.cost));
    else list.sort((a, b) => b.xpPerHour - a.xpPerHour);
    const selectedName = recipes[name] !== undefined ? recipes[name] : (BUMPKIN_DEFAULT_RECIPES[name] || "");
    const selected = selectedName ? list.find((r) => r.name === selectedName) || null : null;
    let xpPerDay = 0, cooksPerDay = 0, daysNeeded = Infinity;
    if (selected && selected.time > 0) {
      cooksPerDay = (86400 / selected.time) * count;
      xpPerDay = bStats.xpPerDay;
      totalXPPerDay += xpPerDay;
      daysNeeded = xpAfterFood > 0 ? Math.ceil(xpAfterFood / xpPerDay) : 0;
    }
    const recipeCost = selected && selected.items ? { total: selected.cost || 0, items: selected.items, hasUnpriced: selected.hasUnpriced } : null;
    const costPerCook = recipeCost ? recipeCost.total : 0;
    const costPerDay = costPerCook * cooksPerDay;
    totalCostPerDay += costPerDay;
    return { name, count, recipes: list, selectedName, selected, xpPerDay, cooksPerDay, daysNeeded, recipeCost, costPerCook, costPerDay,
      trace: cook.cookingTrace ? cook.cookingTrace[name] || null : null, costTrace: cook.costTrace ? cook.costTrace[name] || null : null };
  });

  const totalDays = totalXPPerDay > 0 && xpAfterFood > 0 ? Math.ceil(xpAfterFood / totalXPPerDay) : 0;
  // costs run from the level after eating the banked food
  const levelAfterFood = getTotalBumpkinLevel(xpAfterEating, ascLevel);
  const nextLvlAfterFood = Math.min(levelAfterFood + 1, 200);
  const xpToNextFromFood = xpRemainingToNextLevel(xpAfterEating, ascLevel);
  const daysToNextLevel = totalXPPerDay > 0 && xpToNextFromFood > 0 ? xpToNextFromFood / totalXPPerDay : 0;
  const ladder = [];
  if (levelAfterFood < targetLevel) {
    let cum = 0, prevXP = xpAfterEating;
    for (let lvl = nextLvlAfterFood; lvl <= targetLevel; lvl++) {
      const lvlXP = BUMPKIN_XP_TABLE[lvl - 1];
      const delta = Math.max(0, lvlXP - prevXP);
      const days = totalXPPerDay > 0 ? delta / totalXPPerDay : 0;
      const cost = totalCostPerDay * days;
      cum += cost;
      prevXP = lvlXP;
      ladder.push({ level: lvl, xp: delta, days, cost, cum });
    }
  }
  return { ...out, bankedXP, food, xpAfterFood, xpAfterEating, levelAfterFoodU, levelsGained: levelAfterFoodU - uncappedLevel, afterFoodPct,
    buildings, totalXPPerDay, totalCostPerDay, totalDays, levelAfterFood, nextLvlAfterFood, daysToNextLevel,
    costToNextLevel: totalCostPerDay * daysToNextLevel, costToTarget: totalCostPerDay * totalDays, ladder };
}

const noFarm = (farm) => (!farm ? "No farm data." : !farm.bumpkin ? "No bumpkin data found — check the Farm ID." : "");
const planOf = (farm, cook, ctx, opts = {}) => {
  const p = page(ctx);
  const t = targetOpt(opts);
  return bumpkinPlan(farm, cook || null, { target: t ?? p.target, recipes: p.recipes || {}, sort: SORTS.some(([k]) => k === opts.sort) ? opts.sort : p.sort });
};
const TARGET_OPT = { key: "target", label: "Target level (blank = same as the page)", kind: "number", min: 2, max: 200 };

// ── 🧑‍🌾 Bumpkin XP ──
export const bumpkinXp = {
  type: "bumpkin-xp",
  title: "🧑‍🌾 Bumpkin XP",
  page: "bumpkin",
  needs,
  optional: ["cook"],
  options: [TARGET_OPT],
  defaults: { opts: { target: "" } },

  view({ farm, cook } = {}, ctx = {}, opts = {}) {
    if (noFarm(farm)) return { empty: noFarm(farm) };
    const p = planOf(farm, cook, ctx, opts);
    const capNote = p.ascended && p.uncappedLevel > p.currentLevel;
    const tiles = [{ v: `LVL ${p.currentLevel}`, l: capNote ? `XP worth L${p.uncappedLevel}` : "level" }, { v: `${Math.floor(p.currentXP).toLocaleString()}`, l: "XP" }];
    let h = "";
    if (p.ascended) {
      tiles.push({ v: `A${p.ascLevel}`, l: "ascension" }, { v: `${p.workBandLevel}/50`, l: `band A${p.workBand}` });
      const daysNote = (xp) => (p.xpPerDayCook > 0 ? ` · ~${Math.ceil(xp / p.xpPerDayCook).toLocaleString()} d` : "");
      h += kpis(tiles) + bigBar(p.ascProgressPct);
      if (capNote) h += `<div class="v-dim">Level capped at ${p.currentLevel}; your XP is already worth <b>level ${p.uncappedLevel}</b> (A${p.workBand} L${p.workBandLevel}) once you ascend.</div>`;
      h += `<div class="v-bumpkin-line">${p.xpToBandDone > 0
        ? `${Math.ceil(p.xpToBandDone).toLocaleString()} XP to complete Ascension A${p.workBand}${daysNote(p.xpToBandDone)} → ready for A${p.workBand + 1}`
        : `${pill(`✦ A${p.workBand} XP complete`, "ok")} ready to ascend`}</div>`;
      if (p.workBand > p.ascLevel) h += `<div class="v-dim">A${p.ascLevel} is done — your XP is already filling A${p.workBand} (band ${p.workBandLevel}/50). You still perform the ascension itself on the ASCENSION page.</div>`;
      h += `<div class="v-bumpkin-sub">Expansion gates · A${p.workBand}${p.xpPerDayCook > 0 ? " (XP · days at your pace)" : " (XP to unlock)"}</div><div class="v-bumpkin-gates">` +
        p.gates.map((g) => `<div class="v-bumpkin-gate${g.reached ? " ok" : ""}"><span>${g.reached ? "✅" : "🔒"} expansion #${g.e} <span class="v-dim">· band L${g.band}</span></span>` +
          `${bar((Math.min(p.workBandLevel, g.band) / g.band) * 100)}<span>${g.reached ? pill("reached", "ok") : `+${Math.ceil(g.xpToGate).toLocaleString()} XP${daysNote(g.xpToGate)}`}</span></div>`).join("") + `</div>` +
        `<div class="v-dim v-bumpkin-note">Pure leveling view: 1 level ⇒ 1 skill point ⇒ 1 expansion unlock. ✅ your XP reaches this gate · 🔒 XP (and days at your cooking rate) still needed. The game freezes the level at the finished band (${p.currentLevel}) until you ascend; XP keeps counting — uncapped that's level ${p.uncappedLevel}.</div>`;
    } else {
      tiles.push({ v: p.xpRemaining > 0 ? Math.ceil(p.xpRemaining).toLocaleString() : "MAX", l: p.xpRemaining > 0 ? `XP to level ${p.targetLevel}` : "max level" });
      h += kpis(tiles) + bigBar(p.xpPctTarget) +
        `<div class="v-bumpkin-line">${p.xpPctTarget.toFixed(1)}% to level ${p.targetLevel}</div>` +
        (p.currentLevel < 200 ? `<div class="v-bumpkin-line">Level ${p.currentLevel} → ${p.currentLevel + 1}: ${p.levelProgress}% ${bar(p.levelProgress)}</div>` : "");
    }
    return { html: `<div class="v-bumpkin">${h}</div>` };
  },
};

// ── 🍲 Banked food ──
export const bumpkinFood = {
  type: "bumpkin-food",
  title: "🍲 Banked food",
  page: "bumpkin",
  needs,
  options: [TARGET_OPT],
  defaults: { opts: { target: "" }, sort: { key: "xp", dir: "desc" } },
  rowKey: (r) => r.name,
  rowLabel: (r) => r.name,
  columns: [
    { key: "name", label: "food", fmt: (v, r) => `<div class="v-name">${r.iconHtml || ""}<div><b>${esc(v)}</b></div></div>` },
    { key: "qty", label: "qty", align: "right", fmt: (v) => `${esc(v)}×` },
    { key: "share", label: "share", get: (r) => r.share, fmt: (v) => bar(v, "ok") },
    { key: "xp", label: "XP", align: "right", fmt: (v) => `<span class="v-done">${esc(fmtXP(v))}</span>` },
  ],

  build({ farm, cook } = {}, ctx = {}, opts = {}) {
    if (noFarm(farm)) return { rows: [], footer: "", empty: noFarm(farm) };
    if (!cook) return { rows: [], footer: "", empty: "Loading cooking data…" };
    const p = planOf(farm, cook, ctx, opts);
    if (!(p.bankedXP > 0)) return { rows: [], footer: "", empty: "No cooked food in the inventory." };
    const rows = p.food.map((f) => ({ name: f.name, qty: f.qty, xp: f.totalFoodXP, share: (f.totalFoodXP / p.bankedXP) * 100, iconHtml: icon(ctx, f.name) }));
    const gained = p.levelsGained > 0
      ? `+${p.levelsGained} level${p.levelsGained > 1 ? "s" : ""} (${fmtXP(Math.floor(p.xpAfterEating))} XP total${!p.ascended && p.levelAfterFoodU < 200 ? `, ${p.afterFoodPct}% to ${p.levelAfterFoodU + 1}` : ""})`
      : `Same level${p.ascended ? "" : ` (${p.afterFoodPct}% to ${p.currentLevel + 1})`}`;
    const summary = kpis([{ v: `LVL ${p.levelAfterFoodU}`, l: `after eating all food${p.ascended ? " (uncapped)" : ""}` },
      { v: fmtXP(p.bankedXP), l: `XP in ${rows.length} items` }]) + `<div class="v-bumpkin-line">${gained}</div>`;
    const footer = p.xpAfterFood > 0
      ? `<div class="v-bumpkin-line">After eating: <b class="v-bumpkin-warn">${fmtXP(p.xpAfterFood)}</b> XP still needed to target LVL ${p.targetLevel}</div>`
      : `<div class="v-bumpkin-line v-done">Eating all food would reach level ${p.targetLevel}!</div>`;
    return { rows, summary, footer, empty: "" };
  },
};

// ── ⚡ Cooking boosts ──
const tagOf = (b) => {
  let tag = "";
  if (b.buildings) tag = ` (${b.buildings.join(", ")})`;
  if (b.honeyOnly) tag = " (honey)";
  if (b.fishOnly) tag = " (fish)";
  if (b.foods) tag = b.foods.length === 1 ? ` (${b.foods[0]})` : ` (${b.foods.length} recipes)`;
  return tag;
};
const boostRow = (name, val, cls = "", ic = "") => `<div class="v-bumpkin-boost${cls}"><span>${ic}${name}</span><b>${val}</b></div>`;
export const bumpkinBoosts = {
  type: "bumpkin-boosts",
  title: "⚡ Cooking boosts",
  page: "bumpkin",
  needs,

  view({ farm, cook } = {}, ctx = {}) {
    if (noFarm(farm)) return { empty: noFarm(farm) };
    if (!cook) return { empty: "Loading cooking data…" };
    const boosts = cook.boosts || {};
    const ps = boosts.petStreakInfo || {};
    const none = `<div class="v-dim">None detected</div>`;
    const xp = (boosts.xpBoosts || []).filter((b) => !b.petStreak)
      .map((b) => boostRow(esc(b.name + tagOf(b)), b.add ? "+" + b.add : "×" + b.multiplier, "", icon(ctx, b.name))).join("") || none;
    const pet = boostRow(`Pet's Streak (${esc(ps.streak)}w)${ps.thisWeekActive ? "" : " — inactive"}`, `×${esc(ps.multiplier)}`, ps.thisWeekActive ? " ok" : " off") +
      `<div>${ps.nextWeekQualified ? pill("qualified for next week", "ok") : pill("feed your pet to qualify for next week!", "bad")}` +
      `${ps.weeksToMax > 0 ? ` <span class="v-dim">${esc(ps.weeksToMax)}w to max ×1.5</span>` : ""}${ps.manualOverride ? ` ${pill("simulating ×1.5", "idle")}` : ""}</div>`;
    const time = (boosts.timeBoosts || []).length
      ? boosts.timeBoosts.map((b) => boostRow(esc(b.name + (b.buildings ? ` (${b.buildings.join(", ")})` : b.foods ? " (cakes)" : "")), `×${esc(b.multiplier)}`, "", icon(ctx, b.name))).join("") : none;
    const amount = (boosts.amountBoosts || []).map((b) => boostRow(esc(b.name + (b.buildings ? ` (${b.buildings.join(", ")})` : "")), `+${esc(b.extra)} food`, "", icon(ctx, b.name))).join("");
    return { html: `<div class="v-bumpkin-cols"><div><div class="v-bumpkin-sub v-done">XP boosts</div>${xp}<div class="v-bumpkin-pet">${pet}</div></div>` +
      `<div><div class="v-bumpkin-sub v-bumpkin-blue">Time boosts</div>${time}${amount}</div></div>` };
  },
};

// ── 🍳 Kitchens ──
function optionLabel(r, sort) {
  const xph = Math.round(r.xpPerHour).toLocaleString();
  const cost = r.cost == null ? "—" : fmtSfl(r.cost);
  const xps = r.cost && r.cost > 0 ? Math.round(r.xpPerSfl).toLocaleString() : "—";
  const xpStr = Math.round(r.xp).toLocaleString();
  if (r.isInstant) {
    if (sort === "xpPerSfl") return `${r.name} (${xps} XP/SFL, INSTANT ${xpStr} XP)`;
    if (sort === "sflPerCook") return `${r.name} (${cost} SFL/cook, INSTANT ${xpStr} XP)`;
    return `${r.name} (INSTANT ${xpStr} XP, ${cost} SFL/cook)`;
  }
  if (sort === "xpPerSfl") return `${r.name} (${xps} XP/SFL, ${xph} XP/h)`;
  if (sort === "sflPerCook") return `${r.name} (${cost} SFL/cook, ${xpStr} XP)`;
  return `${r.name} (${xph} XP/h, ${cost} SFL/cook)`;
}
// For a fish the engine prices it as it is actually got (fished at the odds, forced with bait, or
// plain reels) and divides by what a cast yields; both halves are shown.
function fishLines(b, ctx) {
  const it_ = (n) => `${icon(ctx, n)}${esc(n)}`;
  if (!b.selected || !b.recipeCost) return [];
  const out = [];
  for (const it of b.recipeCost.items) {
    if (it.source !== "fish" && it.source !== "fish-bait" && it.source !== "fish-reel") continue;
    let path = "";
    if (it.source === "fish-reel") path = `just reels: rod + <b>${it_(it.via || "Earthworm")}</b>, whatever bites`;
    else if (it.source === "fish-bait" && it.via) path = `forced with <b>${it_(it.via)}</b> (1 cast, no luck)`;
    else if (it.fc) {
      const fd = it.fc.fd;
      path = it.fc.useChum ? `${it_(fd.bait)} + ${fd.chumQty}× ${it_(fd.chum)} chum` : `${it_(fd.bait)} only, ${(it.fc.prob * 100).toFixed(1)}% a cast`;
    } else continue;
    const per = it.yieldPerCast && it.yieldPerCast !== 1 && it.castPrice ? ` — ${fmtSfl(it.castPrice)} a cast ÷ ${it.yieldPerCast} fish per cast` : "";
    out.push(`🐟 <b>${it_(it.name)}</b>: ${path}${per} → ${fmtSfl(it.price)} SFL/fish`);
  }
  return out;
}
const blank = (r, v) => (r.selected ? v : "");
export const bumpkinKitchens = {
  type: "bumpkin-kitchens",
  title: "🍳 Kitchens",
  page: "bumpkin",
  needs,
  optionsLabel: "Recipes",
  options: [{ key: "sort", label: "Order recipes by", kind: "select", choices: [["", "same as the BUMPKIN page"], ...SORTS] }, TARGET_OPT],
  defaults: { opts: { sort: "", target: "" } },
  rowKey: (r) => r.name,
  rowLabel: (r) => r.name,
  rowClass: (r) => (r.selected ? "" : "w-st-done"),
  columns: [
    { key: "name", label: "kitchen", fmt: (v, r) => `<div class="v-name"><span class="v-bumpkin-emoji">${r.emoji}</span><div><b>${esc(v)}</b>` +
      `${r.countText ? ` <span class="v-dim">${esc(r.countText)}</span>` : ""}<small>${r.recipeHtml}</small>${r.ingredients ? `<small class="v-bumpkin-ing">${r.ingredients}</small>` : ""}${r.fish.map((f) => `<small class="v-bumpkin-fish">${f}</small>`).join("")}${r.traceHtml}</div></div>` },
    { key: "xp", label: "XP/cook", align: "right", get: (r) => (r.selected ? r.selected.xp : null), fmt: (v, r) => blank(r, `<span class="v-done">${esc(fmtXP2(v))}</span>`) },
    { key: "time", label: "time", align: "right", get: (r) => (r.selected ? r.selected.time : null),
      fmt: (v, r) => blank(r, r.selected && r.selected.isInstant ? pill("INSTANT", "run") : `<span class="v-bumpkin-blue">${esc(r.timeText)}</span>`) },
    { key: "xpPerHour", label: "XP/hour", align: "right", get: (r) => (r.selected && !r.selected.isInstant ? r.selected.xpPerHour : null), fmt: (v) => (v == null ? "" : esc(fmtXP2(v))) },
    { key: "xpPerDay", label: "XP/day", align: "right", title: "all slots of the building", get: (r) => (r.selected && !r.selected.isInstant ? r.xpPerDay : null),
      fmt: (v, r) => (v == null ? "" : `<b>${esc(fmtXP2(v))}</b>${bar(r.dayShare, "ok")}`) },
    { key: "costPerCook", label: "SFL/cook", align: "right", get: (r) => (r.costPerCook > 0 ? r.costPerCook : null),
      fmt: (v, r) => (v == null ? "" : `<span class="v-bumpkin-warn" title="${esc(r.costTip)}">${esc(r.sflCook)}</span>${r.recipeCost.hasUnpriced ? ' <span class="v-dim">+self</span>' : ""}`) },
    { key: "costPerDay", label: "SFL/day", align: "right", get: (r) => (r.costPerCook > 0 ? r.costPerDay : null), fmt: (v, r) => (v == null ? "" : `<span class="v-bumpkin-warn">${esc(r.sflDay)}</span>`) },
    { key: "xpPerSfl", label: "XP/SFL", align: "right", get: (r) => (r.costPerCook > 0 && r.selected.xpPerSfl > 0 ? r.selected.xpPerSfl : null), fmt: (v) => (v == null ? "" : esc(Math.round(v).toLocaleString())) },
    { key: "days", label: "solo days", align: "right", title: "days to the target level with this kitchen alone (after eating the food)",
      get: (r) => (r.selected && r.showDays ? r.daysNeeded : null), fmt: (v) => (v == null ? "" : `<span class="v-dim">${esc(v.toLocaleString())}d</span>`) },
  ],

  // ctx: { page() → {target, recipes, sort}, editable (the BUMPKIN page: a recipe picker per row), sfl(v), cookTime(s), trace(node) → HTML }
  build({ farm, cook } = {}, ctx = {}, opts = {}) {
    if (noFarm(farm)) return { rows: [], footer: "", empty: noFarm(farm) };
    if (!cook) return { rows: [], footer: "", empty: "Loading cooking data…" };
    const p = planOf(farm, cook, ctx, opts);
    const sort = SORTS.some(([k]) => k === opts.sort) ? opts.sort : page(ctx).sort;
    const maxDay = Math.max(0, ...p.buildings.map((b) => b.xpPerDay));
    const rows = p.buildings.map((b) => {
      const s = b.selected;
      const recipeHtml = ctx.editable
        ? `${s ? icon(ctx, s.name) : ""}<select class="v-bumpkin-select" onchange="selectBumpkinRecipe('${esc(b.name)}', this.value)"><option value=""${!b.selectedName ? " selected" : ""}>-- None --</option>` +
          b.recipes.map((r) => `<option value="${esc(r.name)}"${r.name === b.selectedName ? " selected" : ""}>${esc(optionLabel(r, sort))}</option>`).join("") + `</select>`
        : s ? `${icon(ctx, s.name)}${esc(s.name)}` : (b.recipes.length ? "Not cooking" : "No recipes available");
      const tr = b.trace && typeof ctx.trace === "function"
        ? `<details class="v-bumpkin-trace"><summary>Show calculation</summary><div><div class="v-done"><b>XP/day</b></div>${ctx.trace(b.trace)}` +
          `${b.costTrace ? `<div class="v-bumpkin-warn"><b>Cost/cook</b></div>${ctx.trace(b.costTrace)}` : ""}</div></details>` : "";
      return { ...b, emoji: COOKING_BUILDING_EMOJI[b.name] || "🏠",
        countText: b.name === "Aging Shed" ? `L${b.count} (×${b.count} slots)` : b.count > 1 ? `×${b.count}` : "",
        recipeHtml: ctx.editable && !s ? recipeHtml + `<span class="v-dim"> ${b.recipes.length ? "Not cooking" : "No recipes available"}</span>` : recipeHtml,
        traceHtml: tr, timeText: s && !s.isInstant ? cookTime(ctx, s.time) : "",
        sflCook: b.costPerCook > 0 ? `${sfl(ctx, b.costPerCook)}` : "", sflDay: b.costPerCook > 0 ? `${sfl(ctx, b.costPerDay)}` : "",
        costTip: b.recipeCost ? b.recipeCost.items.map((i) => `${i.qty}× ${i.name}${i.price > 0 ? ` = ${sfl(ctx, i.cost)} SFL` : " (self)"}`).join("\n") : "",
        dayShare: maxDay > 0 ? (b.xpPerDay / maxDay) * 100 : 0, showDays: p.xpRemaining > 0, fish: fishLines(b, ctx),
        ingredients: b.recipeCost ? b.recipeCost.items.map((i) => `${esc(i.qty)}× ${icon(ctx, i.name)}${esc(i.name)}`).join(", ") : "" };
    });
    const cooking = rows.filter((r) => r.selected).length;
    return { rows, footer: `<div class="v-dim">${cooking} of ${rows.length} kitchens cooking</div>`, empty: "No cooking buildings detected." };
  },
};

// ── 📈 Leveling plan ──
export const bumpkinPlanWidget = {
  type: "bumpkin-plan",
  title: "📈 Leveling plan",
  page: "bumpkin",
  needs,
  options: [TARGET_OPT],
  defaults: { opts: { target: "" } },
  rowKey: (r) => String(r.level),
  rowLabel: (r) => `Level ${r.level}`,
  columns: [
    { key: "level", label: "level", fmt: (v) => `<b class="v-bumpkin-lvl">${esc(v)}</b>` },
    { key: "xp", label: "XP needed", align: "right", fmt: (v) => esc(Math.ceil(v).toLocaleString()) },
    { key: "days", label: "days", align: "right", fmt: (v) => esc(v < 1 ? v.toFixed(1) : Math.ceil(v).toLocaleString()) },
    { key: "cost", label: "cost", align: "right", fmt: (v, r) => `<span class="v-bumpkin-warn">${esc(r.costText)}</span>` },
    { key: "cum", label: "cumulative", align: "right", fmt: (v, r) => `<b class="v-bumpkin-warn">${esc(r.cumText)}</b>` },
  ],

  build({ farm, cook } = {}, ctx = {}, opts = {}) {
    if (noFarm(farm)) return { rows: [], footer: "", empty: noFarm(farm) };
    if (!cook) return { rows: [], footer: "", empty: "Loading cooking data…" };
    const p = planOf(farm, cook, ctx, opts);
    if (!p.buildings.length) return { rows: [], footer: "", empty: "No cooking buildings detected." };
    const tiles = [{ v: `${num(p.totalXPPerDay)}`, l: "XP / day, all kitchens" }];
    if (p.xpAfterFood > 0) tiles.push({ v: `${p.totalDays.toLocaleString()} days`, l: `to level ${p.targetLevel}${p.bankedXP > 0 ? " (after eating food)" : ""}` });
    else tiles.push({ v: p.currentLevel >= p.targetLevel ? "TARGET REACHED!" : "Food covers it!", l: `level ${p.targetLevel}` });
    if (p.totalCostPerDay > 0) {
      tiles.push({ v: `${sfl(ctx, p.totalCostPerDay)} SFL`, l: "ingredient cost / day (P2P)" });
      if (p.levelAfterFood < 200) tiles.push({ v: `${sfl(ctx, p.costToNextLevel)} SFL`, l: `to level ${p.nextLvlAfterFood}${p.levelAfterFood > p.currentLevel ? " (after food)" : ""} · ${Math.ceil(p.daysToNextLevel)}d` });
      if (p.targetLevel > p.currentLevel + 1) tiles.push({ v: `${sfl(ctx, p.costToTarget)} SFL`, l: `to level ${p.targetLevel} · ${p.totalDays}d` });
    }
    const per = p.buildings.length > 1 ? `<div class="v-bumpkin-per">` + p.buildings.map((b) =>
      `<div><span>${COOKING_BUILDING_EMOJI[b.name] || ""} ${esc(b.name)}${b.count > 1 ? ` ×${b.count}` : ""}</span>` +
      `${bar(p.totalXPPerDay > 0 ? (b.xpPerDay / p.totalXPPerDay) * 100 : 0, "ok")}<span>${num(b.xpPerDay)} XP/day${b.costPerDay > 0 ? ` · ${sfl(ctx, b.costPerDay)} SFL/day` : ""}</span></div>`).join("") + `</div>` : "";
    const rows = p.ladder.map((r) => ({ ...r, costText: sfl(ctx, r.cost), cumText: sfl(ctx, r.cum) }));
    const note = p.totalCostPerDay > 0 ? `<div class="v-dim">Cost per level ${p.nextLvlAfterFood} → ${p.targetLevel}. Based on P2P market prices; self-produced items (eggs, milk, honey, fish) = free.</div>` : "";
    return { rows, summary: kpis(tiles) + per, footer: note,
      empty: p.levelAfterFood >= p.targetLevel ? `✓ Level ${p.targetLevel} is reached after eating the food.` : "Nothing to plan." };
  },
};
