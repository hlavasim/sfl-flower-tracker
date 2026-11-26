// 🎯 Do limitu: what is still missing to hold N of each item in one category — dolls, crustaceans,
// flowers, or a pick of dishes. One widget type, pinned as often as wanted; every copy keeps its own
// category, limit, "hide what is done" and dish pick (settings.opts).
import { FLOWER_RECIPES, DOLL_RECIPES } from "../core/data/recipes.mjs";
import { CRUSTACEAN_RECIPES } from "../core/data/crafting.mjs";
import { COOKING_RECIPES_DATA, COOKING_INGREDIENTS, COOKING_BUILDING_EMOJI } from "../core/data/cooking.mjs";
import { bar, kpis, bigBar } from "../ui/viz.mjs";
import { PET_REQUEST_FOODS } from "../core/engine/pet-requests.mjs";

// Whole lists of dishes the game keeps asking for (the user picks the list, not each dish).
const LISTS = {
  "pets-easy": ["🐾 Pet requests · easy", PET_REQUEST_FOODS.easy],
  "pets-medium": ["🐾 Pet requests · medium", PET_REQUEST_FOODS.medium],
  "pets-hard": ["🐾 Pet requests · hard", PET_REQUEST_FOODS.hard],
};

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const count = (inv, name) => { const v = parseFloat(inv[name]); return Number.isFinite(v) ? Math.floor(v) : 0; };

const CATS = [["dolls", "Dolls"], ["crabs", "Crustaceans"], ["flowers", "Flowers"], ["foods", "Dishes"]];
const CAT_LABEL = Object.fromEntries(CATS);

// Flowers grown from another flower: that one also needs what they still miss (the FLOWERS page's
// chain rule, with this widget's limit as the own demand; a cycle stops at the own demand).
function flowerNeeds(limit, have) {
  const dependents = {};
  for (const [name, r] of Object.entries(FLOWER_RECIPES)) {
    if (FLOWER_RECIPES[r.input]) (dependents[r.input] = dependents[r.input] || []).push(name);
  }
  const memo = {}, visiting = new Set();
  const need = (name) => {
    if (memo[name] !== undefined) return memo[name];
    if (visiting.has(name)) return limit;
    visiting.add(name);
    let total = limit;
    for (const dep of dependents[name] || []) total += Math.max(0, need(dep) - have(dep));
    visiting.delete(name);
    return (memo[name] = total);
  };
  return need;
}

// The recipe, as text (ic = () => "") or as HTML with every item's icon (ic = ctx.icon).
function recipeOf(cat, name, ic = () => "") {
  const it = (n) => `${ic(n)}${ic === NO_ICON ? n : esc(n)}`;
  if (cat === "dolls") return (DOLL_RECIPES[name] || []).map((x) => `${x.qty}× ${it(x.item)}`).join(", ");
  if (cat === "crabs") {
    const r = CRUSTACEAN_RECIPES[name];
    return `${it(r.pot)} · ${r.chum ? `${r.qty}× ${it(r.chum)}` : "no bait"}${r.alt ? ` (or ${ic === NO_ICON ? r.alt : esc(r.alt)})` : ""}`;
  }
  if (cat === "flowers") { const r = FLOWER_RECIPES[name]; return `${it(r.seed)} + ${it(r.input)}`; }
  const b = (COOKING_RECIPES_DATA[name] || {}).building || "";
  const ing = Object.entries(COOKING_INGREDIENTS[name] || {}).map(([k, q]) => `${q}× ${it(k)}`).join(", ");
  return `${COOKING_BUILDING_EMOJI[b] || ""} ${ic === NO_ICON ? b : esc(b)} · ${ing}`.trim();
}
const NO_ICON = () => "";

export const targetList = {
  type: "target-list",
  title: "🎯 To the limit",
  titleFor: (o) => `🎯 ${CAT_LABEL[o.cat] || "To the limit"} to ${o.limit ?? "?"}`,
  page: "board",
  needs: (farmId) => ({ farm: { res: "farm", farm: farmId } }),
  optionsLabel: "Target",
  options: [
    { key: "cat", label: "Category", kind: "select", choices: CATS },
    { key: "limit", label: "Limit (of each item)", kind: "number", min: 1, max: 9999 },
    { key: "hideDone", label: "Hide done", kind: "bool" },
    { key: "lists", label: "Lists", kind: "checklist", choices: (o) => (o.cat === "foods"
      ? Object.entries(LISTS).map(([k, [label, foods]]) => [k, `${label} (${foods.length})`]) : []) },
    { key: "foods", label: "Dishes", kind: "checklist", choices: (o) => (o.cat === "foods"
      ? Object.entries(COOKING_RECIPES_DATA).map(([n, r]) => [n, `${COOKING_BUILDING_EMOJI[r.building] || ""} ${n}`]) : []) },
  ],
  defaults: { opts: { cat: "dolls", limit: 5, hideDone: true, lists: [], foods: [] }, sort: { key: "missing", dir: "desc" } },
  rowKey: (r) => r.name,
  rowLabel: (r) => r.name,
  rowClass: (r) => (r.done ? "w-st-done" : ""),
  columns: [
    // icon, name and the recipe under it
    { key: "name", label: "item", fmt: (v, r) => `<div class="v-name">${r.iconHtml || ""}<div><b>${esc(v)}</b><small>${r.recipeHtml || esc(r.recipe)}</small></div></div>` },
    { key: "progress", label: "progress", get: (r) => (r.need ? ((r.have + r.pend) / r.need) * 100 : 100), fmt: (v) => bar(v) },
    { key: "have", label: "have / target", align: "right", title: "have + on the way (blooming / crafting / in traps) / target; for flowers the target includes what other flowers' recipes use up",
      fmt: (v, r) => `<span class="v-count">${esc(v)}${r.pend ? `<em>+${esc(r.pend)}</em>` : ""} / ${esc(r.need)}</span>` },
    { key: "missing", label: "missing", align: "right", fmt: (v) => (v ? `<span class="v-miss">−${esc(v)}</span>` : `<span class="v-done">✓</span>`) },
    { key: "pend", label: "on the way", align: "right", extra: true, fmt: (v) => (v ? esc(v) : "") },
    { key: "recipe", label: "recipe", extra: true },
  ],

  // data: { farm }; ctx: { inProgress(farm) → {name: qty}, icon(name) → HTML, tracked? {doll: bool} }; opts: the copy's options
  build({ farm } = {}, ctx = {}, opts = {}) {
    if (!farm) return { rows: [], footer: "", empty: "No farm data." };
    const cat = CAT_LABEL[opts.cat] ? opts.cat : "dolls";
    const limit = Math.max(1, Math.round(Number(opts.limit)) || 1);
    const inv = farm.inventory || {};
    const pend = typeof ctx.inProgress === "function" ? ctx.inProgress(farm) || {} : {};
    // dolls: those with a recipe; the DOLLS page's tracked ones only, when the page hands them over
    const tracked = ctx.tracked && typeof ctx.tracked === "object" ? ctx.tracked : null;
    const names = cat === "dolls" ? Object.keys(DOLL_RECIPES).filter((n) => DOLL_RECIPES[n].length && (!tracked || tracked[n]))
      : cat === "crabs" ? Object.keys(CRUSTACEAN_RECIPES)
      : cat === "flowers" ? Object.keys(FLOWER_RECIPES)
      // the picked lists, then the single picks, each dish once
      : [...new Set([...(Array.isArray(opts.lists) ? opts.lists : []).flatMap((k) => (LISTS[k] ? LISTS[k][1] : [])),
        ...(Array.isArray(opts.foods) ? opts.foods : [])])].filter((n) => COOKING_RECIPES_DATA[n]);
    if (cat === "foods" && !names.length) return { rows: [], footer: "", empty: "Pick lists or dishes in ⚙ → Target." };
    const held = (n) => count(inv, n) + (pend[n] || 0);
    const needOf = cat === "flowers" ? flowerNeeds(limit, held) : () => limit;
    const all = names.map((name) => {
      const have = count(inv, name), p = pend[name] || 0, need = needOf(name);
      const missing = Math.max(0, need - have - p);
      return { name, have, pend: p, need, missing, done: missing === 0, recipe: recipeOf(cat, name, NO_ICON),
        recipeHtml: typeof ctx.icon === "function" ? recipeOf(cat, name, ctx.icon) : "",
        iconHtml: typeof ctx.icon === "function" ? ctx.icon(name) : "" };
    });
    const done = all.filter((r) => r.done).length;
    const rows = opts.hideDone ? all.filter((r) => !r.done) : all;
    const left = all.reduce((a, r) => a + r.missing, 0);
    const summary = kpis([{ v: `${done} / ${all.length}`, l: "at the limit" }, { v: left, l: "missing in total" }])
      + bigBar(all.length ? (done / all.length) * 100 : 100);
    return { rows, summary, footer: "", empty: `✓ All at the limit (${all.length}).` };
  },
};
