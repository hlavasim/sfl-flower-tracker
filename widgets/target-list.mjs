// 🎯 Do limitu: what is still missing to hold N of each item in one category — dolls, crustaceans,
// flowers, or a pick of dishes. One widget type, pinned as often as wanted; every copy keeps its own
// category, limit, "hide what is done" and dish pick (settings.opts).
import { FLOWER_RECIPES, DOLL_RECIPES } from "../core/data/recipes.mjs";
import { CRUSTACEAN_RECIPES } from "../core/data/crafting.mjs";
import { COOKING_RECIPES_DATA, COOKING_INGREDIENTS, COOKING_BUILDING_EMOJI } from "../core/data/cooking.mjs";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const count = (inv, name) => { const v = parseFloat(inv[name]); return Number.isFinite(v) ? Math.floor(v) : 0; };

const CATS = [["dolls", "Panenky"], ["crabs", "Korýši"], ["flowers", "Květiny"], ["foods", "Jídla"]];
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

function recipeOf(cat, name) {
  if (cat === "dolls") return (DOLL_RECIPES[name] || []).map((x) => `${x.qty}× ${x.item}`).join(", ");
  if (cat === "crabs") {
    const r = CRUSTACEAN_RECIPES[name];
    return `${r.pot} · ${r.chum ? `${r.qty}× ${r.chum}` : "bez návnady"}${r.alt ? ` (nebo ${r.alt})` : ""}`;
  }
  if (cat === "flowers") { const r = FLOWER_RECIPES[name]; return `${r.seed} + ${r.input}`; }
  const b = (COOKING_RECIPES_DATA[name] || {}).building || "";
  const ing = Object.entries(COOKING_INGREDIENTS[name] || {}).map(([k, q]) => `${q}× ${k}`).join(", ");
  return `${COOKING_BUILDING_EMOJI[b] || ""} ${b} · ${ing}`.trim();
}

export const targetList = {
  type: "target-list",
  title: "🎯 Do limitu",
  titleFor: (o) => `🎯 ${CAT_LABEL[o.cat] || "Do limitu"} do ${o.limit ?? "?"}`,
  page: "board",
  needs: (farmId) => ({ farm: { res: "farm", farm: farmId } }),
  optionsLabel: "Cíl",
  options: [
    { key: "cat", label: "Kategorie", kind: "select", choices: CATS },
    { key: "limit", label: "Limit (kusů od každého)", kind: "number", min: 1, max: 9999 },
    { key: "hideDone", label: "Skrýt hotové", kind: "bool" },
    { key: "foods", label: "Jídla", kind: "checklist", choices: (o) => (o.cat === "foods"
      ? Object.entries(COOKING_RECIPES_DATA).map(([n, r]) => [n, `${COOKING_BUILDING_EMOJI[r.building] || ""} ${n}`]) : []) },
  ],
  defaults: { opts: { cat: "dolls", limit: 10, hideDone: true, foods: [] }, sort: { key: "missing", dir: "desc" } },
  rowKey: (r) => r.name,
  rowLabel: (r) => r.name,
  rowClass: (r) => (r.done ? "w-st-ready" : ""),
  columns: [
    { key: "name", label: "položka", fmt: (v, r) => `<span style="white-space:nowrap">${r.iconHtml || ""}${esc(v)}</span>` },
    { key: "have", label: "máš", align: "right" },
    { key: "pend", label: "běží", align: "right", title: "rozkvétá / vyrábí se / v pastích", fmt: (v) => (v ? esc(v) : "") },
    { key: "need", label: "cíl", align: "right", title: "u květin i to, co spotřebují recepty dalších květin" },
    { key: "missing", label: "chybí", align: "right", fmt: (v) => (v ? `<b>${esc(v)}</b>` : "✓") },
    { key: "recipe", label: "recept" },
  ],

  // data: { farm }; ctx: { inProgress(farm) → {name: qty}, icon(name) → HTML }; opts: the copy's options
  build({ farm } = {}, ctx = {}, opts = {}) {
    if (!farm) return { rows: [], footer: "", empty: "Chybí data farmy." };
    const cat = CAT_LABEL[opts.cat] ? opts.cat : "dolls";
    const limit = Math.max(1, Math.round(Number(opts.limit)) || 1);
    const inv = farm.inventory || {};
    const pend = typeof ctx.inProgress === "function" ? ctx.inProgress(farm) || {} : {};
    const names = cat === "dolls" ? Object.keys(DOLL_RECIPES).filter((n) => DOLL_RECIPES[n].length)
      : cat === "crabs" ? Object.keys(CRUSTACEAN_RECIPES)
      : cat === "flowers" ? Object.keys(FLOWER_RECIPES)
      : (Array.isArray(opts.foods) ? opts.foods : []).filter((n) => COOKING_RECIPES_DATA[n]);
    if (cat === "foods" && !names.length) return { rows: [], footer: "", empty: "Vyber jídla v ⚙ → Cíl." };
    const held = (n) => count(inv, n) + (pend[n] || 0);
    const needOf = cat === "flowers" ? flowerNeeds(limit, held) : () => limit;
    const all = names.map((name) => {
      const have = count(inv, name), p = pend[name] || 0, need = needOf(name);
      const missing = Math.max(0, need - have - p);
      return { name, have, pend: p, need, missing, done: missing === 0, recipe: recipeOf(cat, name),
        iconHtml: typeof ctx.icon === "function" ? ctx.icon(name) : "" };
    });
    const done = all.filter((r) => r.done).length;
    const rows = opts.hideDone ? all.filter((r) => !r.done) : all;
    const left = all.reduce((a, r) => a + r.missing, 0);
    const footer = `<div style="color:var(--text-dim)">${done} / ${all.length} na limitu · chybí celkem ${left}</div>`;
    return { rows, footer, empty: `✓ Vše na limitu (${all.length}).` };
  },
};
