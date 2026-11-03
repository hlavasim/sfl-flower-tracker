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
 * Every node's next harvest: { kind, id, name, product, readyAt, amount, gains } (amount null +
 * error when the game refused it; gains = every item it added, spent = every item it used up).
 * kind: tree | stone | iron | gold | crimstone | oil | crop | fruit | greenhouse | flower | animal |
 * lava. Only nodes with something growing / a timer are listed.
 */
export async function simulateHarvests(farmJson, farmId, now = Date.now()) {
  const G = await game();
  let state = G.makeGame(farmJson);
  const Dec = state.inventory.Wood ? state.inventory.Wood.constructor : null;
  if (Dec) for (const t of TOOLS) state.inventory[t] = new Dec(1e9);

  const tasks = [];
  // startedAt = the node's own timestamp this harvest counts from (chopped / mined / drilled /
  // planted / last fruit harvest / asleep): a client holding older data can tell the node was
  // harvested since and drop the stale row.
  // again(state) = the node's ready time after a harvest — a seeded instant regrowth (Tree
  // Turnaround, instant mine / drill recoveries) makes it ready at once, and the visit harvests again.
  const add = (kind, id, name, product, readyAt, run, startedAt, again) => {
    if (Number.isFinite(readyAt)) tasks.push({ kind, id, name, product, readyAt, run, startedAt: startedAt ?? null, again: again || null });
  };

  for (const [id, t] of Object.entries(state.trees || {})) {
    if (!placed(t) || !t.wood) continue;
    add("tree", id, t.name || "Tree", "Wood", G.getTreeReadyAt(t, state),
      (s, at) => G.chop({ state: s, action: { type: "timber.chopped", index: id, item: "Axe" }, createdAt: at, farmId }), t.wood.choppedAt,
      (s) => G.getTreeReadyAt(s.trees[id], s));
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
      add(kind, id, r.name || dflt, product, G.getMineReadyAt(r, r.name || dflt, state), (s, at) => run(s, id, at), r.stone.minedAt,
        (s) => G.getMineReadyAt(s[key][id], r.name || dflt, s));
    }
  }
  for (const [id, o] of Object.entries(state.oilReserves || {})) {
    if (!placed(o) || !o.oil) continue;
    add("oil", id, "Oil Reserve", "Oil", G.getOilReserveReadyAt(o, state),
      (s, at) => G.drillOilReserve({ state: s, action: { type: "oilReserve.drilled", id }, createdAt: at, farmId }), o.oil.drilledAt,
      (s) => G.getOilReserveReadyAt(s.oilReserves[id], s));
  }
  for (const [id, plot] of Object.entries(state.crops || {})) {
    const c = plot && plot.crop;
    if (!placed(plot) || !c || !G.CROPS[c.name]) continue;
    add("crop", id, c.name, c.name, G.getCropReadyAt(c, G.CROPS[c.name], state, plot.fertiliser),
      (s, at) => G.harvest({ state: s, action: { type: "crop.harvested", index: id }, createdAt: at, farmId }), c.plantedAt);
  }
  for (const [id, patch] of Object.entries(state.fruitPatches || {})) {
    const f = patch && patch.fruit;
    if (!placed(patch) || !f) continue;
    add("fruit", id, f.name, f.name, G.getFruitReadyAt(f, state, patch.fertiliser),
      (s, at) => G.harvestFruit({ state: s, action: { type: "fruit.harvested", index: id }, createdAt: at, farmId }), f.harvestedAt || f.plantedAt);
  }
  for (const [id, pot] of Object.entries((state.greenhouse && state.greenhouse.pots) || {})) {
    if (!pot || !pot.plant) continue;
    add("greenhouse", id, pot.plant.name, pot.plant.name, G.getGreenhousePotReadyAt(pot, state),
      (s, at) => G.harvestGreenHouse({ state: s, action: { type: "greenhouse.harvested", id: Number(id) }, createdAt: at, farmId }), pot.plant.plantedAt);
  }
  /*
   * Animals: their produce (Egg + Feather, Milk + Leather, Wool + Merino Wool, Truffle) is claimed
   * when they wake; claimProduce wants the "ready" state the feeding put them in, so the copy is
   * marked ready — the yield only depends on the level and the boosts.
   */
  for (const [key, building] of [["henHouse", state.henHouse], ["barn", state.barn], ["pigpen", state.pigpen]]) {
    for (const [id, a] of Object.entries((building && building.animals) || {})) {
      if (!a || !a.type) continue;
      add("animal", id, a.type, null, G.getAnimalReadyAt(a, state), (s, at) => {
        const animal = s[key].animals[id];
        const ready = animal.state === "ready" ? s : { ...s, [key]: { ...s[key], animals: { ...s[key].animals, [id]: { ...animal, state: "ready" } } } };
        return G.claimProduce({ state: ready, action: { type: "produce.claimed", animal: a.type, id }, createdAt: at });
      }, a.asleepAt);
    }
  }
  for (const [id, bed] of Object.entries((state.flowers && state.flowers.flowerBeds) || {})) {
    const f = bed && bed.flower;
    if (!placed(bed) || !f) continue;
    add("flower", id, f.name, f.name, G.getFlowerReadyAt(f, state),
      (s, at) => G.harvestFlower({ state: s, action: { type: "flower.harvested", id }, createdAt: at, farmId }), f.plantedAt);
  }

  /*
   * A power skill that finishes a category sets the start to 1 (skillUsed.ts), so the game's ready
   * time lands in 1970. It has been ready since the skill was used — bumpkin.previousPowerUseAt —
   * not "56 years", and not "now" either (that restarted the count on every refresh).
   */
  const POWER_SKILL = { crop: "Instant Growth", tree: "Tree Blitz", greenhouse: "Greenhouse Guru", oil: "Grease Lightning",
    flower: "Petal Blessed", animal: "Barnyard Rouse" };
  const usedAt = (state.bumpkin && state.bumpkin.previousPowerUseAt) || {};
  for (const t of tasks) {
    if (t.readyAt >= Date.UTC(2021, 0, 1)) continue;
    const used = Number(usedAt[POWER_SKILL[t.kind]]) || 0;
    t.readyAt = used > 0 && used <= now ? used : now;
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
    const before = state.inventory;
    try {
      state = t.run(state, at);
      // Regrew at once: the same visit harvests it again (each roll moves the counter), up to 5×.
      let instant = 0;
      while (t.again && instant < 5) {
        const next = t.again(state);
        if (!(Number.isFinite(next) && next <= at)) break;
        state = t.run(state, at + 1000 * (instant + 1));
        instant++;
      }
      // Everything the visit added (an animal gives two products; a crit can add a bonus item).
      const gains = {};
      for (const [k, v] of Object.entries(state.inventory)) {
        const d = Number(v || 0) - Number(before[k] || 0);
        if (d > 1e-9) gains[k] = +d.toFixed(4);
      }
      // And everything it used up (the Oil Drills a drill takes).
      const spent = {};
      for (const [k, v] of Object.entries(before)) {
        const d = Number(v || 0) - Number(state.inventory[k] || 0);
        if (d > 1e-9) spent[k] = +d.toFixed(4);
      }
      const product = t.product || Object.keys(gains)[0] || null;
      out.push({ kind: t.kind, id: t.id, name: t.name, product, readyAt: t.readyAt, startedAt: t.startedAt,
        amount: product && gains[product] != null ? gains[product] : 0, gains, ...(Object.keys(spent).length ? { spent } : {}), ...(instant ? { instant } : {}) });
    } catch (e) {
      out.push({ kind: t.kind, id: t.id, name: t.name, product: t.product, readyAt: t.readyAt, startedAt: t.startedAt, amount: null, error: String(e && e.message || e) });
    }
  }
  } finally { console.log = log; console.warn = warn; }
  /*
   * Lava pits: collecting rolls nothing, so they are not replayed — the Obsidian is the game's
   * yield, and `spent` is what lighting the pit again costs (the season's requirements, Lava
   * Swimwear included), at its ready time.
   */
  for (const [id, pit] of Object.entries(state.lavaPits || {})) {
    if (!placed(pit) || pit.startedAt === undefined || pit.collectedAt !== undefined) continue;
    const readyAt = pit.readyAt ?? pit.startedAt + G.getLavaPitTime({ game: state }).time;
    const amount = G.getObsidianYield({ game: state }).amount;
    const spent = {};
    for (const [k, v] of Object.entries(G.getLavaPitRequirements(state, Math.max(now, readyAt)).requirements)) spent[k] = Number(v);
    out.push({ kind: "lava", id, name: "Lava Pit", product: "Obsidian", readyAt, startedAt: pit.startedAt, amount, gains: { Obsidian: amount }, spent });
  }
  out.sort((a, b) => a.readyAt - b.readyAt);
  return out;
}

export { DAY };
