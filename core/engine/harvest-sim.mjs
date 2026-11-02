/*
 * HARVEST SIMULATION — what each node's next harvest gives, exactly as the game will give it.
 *
 * The game rolls every harvest from a seeded PRNG (farm id + the farm's activity counter for that
 * node type + the critical hit's name), so the next chop / mine / harvest is fixed before it
 * happens. Instead of re-implementing ~10 yield formulas with all their boosts, this runs the
 * game's own reducers (core/game-sim/game.bundle.mjs, scripts/gen-game-sim.mjs) on a copy of the
 * farm: every placed node is harvested once, in the order it becomes ready, at its ready time, and
 * the yield is what landed in the inventory. Harvesting in that order matters — each harvest moves
 * the counter the next one rolls with.
 *
 * Tools never change a yield, so the copy gets plenty of them (a reducer refuses without).
 */

const DAY = 86400000;
const TOOLS = ["Axe", "Pickaxe", "Stone Pickaxe", "Iron Pickaxe", "Gold Pickaxe", "Oil Drill"];

let _game = null;
async function game() {
  if (!_game) _game = await import("../game-sim/game.bundle.mjs");
  return _game;
}

const placed = (n) => n && n.x !== undefined && n.y !== undefined;

/**
 * Every node's next harvest: { kind, id, name, product, readyAt, amount } (amount null + error when
 * the game refused it). kind: tree | stone | iron | gold | crimstone | oil | crop | fruit |
 * greenhouse | flower. Only nodes with something growing / a timer are listed.
 */
export async function simulateHarvests(farmJson, farmId, now = Date.now()) {
  const G = await game();
  let state = G.makeGame(farmJson);
  const Dec = state.inventory.Wood ? state.inventory.Wood.constructor : null;
  if (Dec) for (const t of TOOLS) state.inventory[t] = new Dec(1e9);

  const tasks = [];
  const add = (kind, id, name, product, readyAt, run) => {
    if (Number.isFinite(readyAt)) tasks.push({ kind, id, name, product, readyAt, run });
  };

  for (const [id, t] of Object.entries(state.trees || {})) {
    if (!placed(t) || !t.wood) continue;
    add("tree", id, t.name || "Tree", "Wood", G.getTreeReadyAt(t, state),
      (s, at) => G.chop({ state: s, action: { type: "timber.chopped", index: id, item: "Axe" }, createdAt: at, farmId }));
  }
  const rocks = [
    ["stone", "stones", "Stone Rock", "Stone", (s, id, at) => G.mineStone({ state: s, action: { type: "stoneRock.mined", index: id }, createdAt: at, farmId })],
    ["iron", "iron", "Iron Rock", "Iron", (s, id, at) => G.mineIron({ state: s, action: { type: "ironRock.mined", index: id }, createdAt: at, farmId })],
    ["gold", "gold", "Gold Rock", "Gold", (s, id, at) => G.mineGold({ state: s, action: { type: "goldRock.mined", index: id }, createdAt: at, farmId })],
    ["crimstone", "crimstones", "Crimstone Rock", "Crimstone", (s, id, at) => G.mineCrimstone({ state: s, action: { type: "crimstoneRock.mined", index: id }, createdAt: at, farmId })],
  ];
  for (const [kind, key, dflt, product, run] of rocks) {
    for (const [id, r] of Object.entries(state[key] || {})) {
      if (!placed(r) || !r.stone) continue;
      add(kind, id, r.name || dflt, product, G.getMineReadyAt(r, r.name || dflt, state), (s, at) => run(s, id, at));
    }
  }
  for (const [id, o] of Object.entries(state.oilReserves || {})) {
    if (!placed(o) || !o.oil) continue;
    add("oil", id, "Oil Reserve", "Oil", G.getOilReserveReadyAt(o, state),
      (s, at) => G.drillOilReserve({ state: s, action: { type: "oilReserve.drilled", id }, createdAt: at, farmId }));
  }
  for (const [id, plot] of Object.entries(state.crops || {})) {
    const c = plot && plot.crop;
    if (!placed(plot) || !c || !G.CROPS[c.name]) continue;
    add("crop", id, c.name, c.name, G.getCropReadyAt(c, G.CROPS[c.name], state, plot.fertiliser),
      (s, at) => G.harvest({ state: s, action: { type: "crop.harvested", index: id }, createdAt: at, farmId }));
  }
  for (const [id, patch] of Object.entries(state.fruitPatches || {})) {
    const f = patch && patch.fruit;
    if (!placed(patch) || !f) continue;
    add("fruit", id, f.name, f.name, G.getFruitReadyAt(f, state, patch.fertiliser),
      (s, at) => G.harvestFruit({ state: s, action: { type: "fruit.harvested", index: id }, createdAt: at, farmId }));
  }
  for (const [id, pot] of Object.entries((state.greenhouse && state.greenhouse.pots) || {})) {
    if (!pot || !pot.plant) continue;
    add("greenhouse", id, pot.plant.name, pot.plant.name, G.getGreenhousePotReadyAt(pot, state),
      (s, at) => G.harvestGreenHouse({ state: s, action: { type: "greenhouse.harvested", id: Number(id) }, createdAt: at, farmId }));
  }
  for (const [id, bed] of Object.entries((state.flowers && state.flowers.flowerBeds) || {})) {
    const f = bed && bed.flower;
    if (!placed(bed) || !f) continue;
    add("flower", id, f.name, f.name, G.getFlowerReadyAt(f, state),
      (s, at) => G.harvestFlower({ state: s, action: { type: "flower.harvested", id }, createdAt: at, farmId }));
  }

  tasks.sort((a, b) => a.readyAt - b.readyAt);
  const out = [];
  // The game's analytics complain on every harvest ("[MoonForge] call … init()") — not ours to fix.
  const log = console.log, warn = console.warn;
  const quiet = (f) => (...a) => { if (!String(a[0]).includes("[MoonForge]")) f(...a); };
  console.log = quiet(log); console.warn = quiet(warn);
  try {
  for (const t of tasks) {
    // A harvest happens when its node is ready (never in the past); a minute's margin past the edge.
    const at = Math.max(now, t.readyAt) + 60000;
    const before = Number(state.inventory[t.product] || 0);
    try {
      state = t.run(state, at);
      out.push({ kind: t.kind, id: t.id, name: t.name, product: t.product, readyAt: t.readyAt,
        amount: +(Number(state.inventory[t.product] || 0) - before).toFixed(4) });
    } catch (e) {
      out.push({ kind: t.kind, id: t.id, name: t.name, product: t.product, readyAt: t.readyAt, amount: null, error: String(e && e.message || e) });
    }
  }
  } finally { console.log = log; console.warn = warn; }
  return out;
}

export { DAY };
