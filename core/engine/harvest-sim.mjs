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

const ANIMAL_PRODUCT = { Chicken: "Egg", Cow: "Milk", Sheep: "Wool", Pig: "Truffle" };
const placed = (n) => n && n.x !== undefined && n.y !== undefined;

/**
 * Every node's next harvest: { kind, id, name, product, readyAt, amount, gains } (amount null +
 * error when the game refused it; gains = every item it added, spent = every item it used up).
 * kind: tree | stone | iron | gold | crimstone | oil | crop | fruit | greenhouse | flower | animal |
 * lava. Only nodes with something growing / a timer are listed.
 */
export async function simulateHarvests(farmJson, farmId, now = Date.now(), { kinds } = {}) {
  // `kinds`: replay only these (see HARVEST_KINDS) — each kind rolls on its own counters, so a
  // subset gives the same rows as the full replay (tests/core/harvest-sim.test.mjs).
  const want = kinds ? new Set(kinds) : null;
  const G = await game();
  let state = G.makeGame(farmJson);
  // The game's Decimal, taken from any inventory entry (a farm without Wood got no tools before).
  const anyDec = Object.values(state.inventory || {}).find((v) => v && typeof v.add === "function");
  const Dec = anyDec ? anyDec.constructor : null;
  if (Dec) for (const t of TOOLS) state.inventory[t] = new Dec(1e9);

  const tasks = [];
  // startedAt = the node's own timestamp this harvest counts from (chopped / mined / drilled /
  // planted / last fruit harvest / asleep): a client holding older data can tell the node was
  // harvested since and drop the stale row.
  // again(state) = the node's ready time after a harvest — a seeded instant regrowth (Tree
  // Turnaround, instant mine / drill recoveries) makes it ready at once, and the visit harvests again.
  const add = (kind, id, name, product, readyAt, run, startedAt, again) => {
    if (want && !want.has(kind)) return;
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
      // The main product is fixed per animal (it was the first new inventory key, so a Cow read
      // Milk or Leather depending on the inventory's order).
      add("animal", id, a.type, ANIMAL_PRODUCT[a.type] || null, G.getAnimalReadyAt(a, state), (s, at) => {
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
  for (const [id, pit] of Object.entries(want && !want.has("lava") ? {} : state.lavaPits || {})) {
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

/*
 * CACHING A KIND. A kind's rows depend on its own nodes (each harvest rewrites the node it took, so
 * the node state also stands for the counter the next roll uses) and on what boosts every kind:
 * placed collectibles (used / readyAt / createdAt included), the bumpkin's and farmhands' outfits,
 * skills and power-skill uses, buds, pets, the calendar, season, island, VIP and faction. The
 * inputs below are that, per kind, as strings: equal strings → the replay would give the same rows
 * at the same harvest times. The time is the other input: a node not ready yet is replayed at its
 * own ready time, one ready already at "now" — so a kind is only reused until its first node is
 * ready, and a ready one for a few minutes (harvestCacheValidUntil).
 */
export const HARVEST_KINDS = ["tree", "stone", "iron", "gold", "crimstone", "oil", "crop", "fruit", "greenhouse", "flower", "animal", "lava"];
// A kind's own state: its nodes, plus what else its reducer reads — the area-of-effect record
// (lib/aoe.ts: scarecrows and the like on crops and rocks), the beehives a flower harvest updates,
// and the buildings a harvest needs placed — animal buildings, the Greenhouse (coordinates, not
// their queues).
const placedBuildings = (f, names) => names.map((n) => ((f.buildings || {})[n] || []).map((b) => b && b.coordinates));
const KIND_STATE = {
  tree: (f) => [f.trees], stone: (f) => [f.stones, f.aoe], iron: (f) => [f.iron, f.aoe], gold: (f) => [f.gold, f.aoe],
  crimstone: (f) => [f.crimstones], oil: (f) => [f.oilReserves], crop: (f) => [f.crops, f.aoe],
  fruit: (f) => [f.fruitPatches], greenhouse: (f) => [f.greenhouse, placedBuildings(f, ["Greenhouse"])], flower: (f) => [f.flowers, f.beehives],
  animal: (f) => [f.henHouse, f.barn, f.pigpen, placedBuildings(f, ["Hen House", "Barn", "Pigpen"])], lava: (f) => [f.lavaPits],
};
/*
 * Left out because they churn without touching a yield: farm.pets (energy, food requests, XP — the
 * game reads it only for monuments), the calendar's list of coming days and its "seen" stamps
 * (reducers read only an event's startedAt / protected), and power-skill uses, which only date the
 * ready time of their own kind (POWER_SKILL above), so each kind keys on its own.
 */
const KIND_POWER = { crop: "Instant Growth", tree: "Tree Blitz", greenhouse: "Greenhouse Guru", oil: "Grease Lightning",
  flower: "Petal Blessed", animal: "Barnyard Rouse" };
export function harvestCacheInputs(farm) {
  const b = farm.bumpkin || {};
  const calendar = Object.fromEntries(Object.entries(farm.calendar || {}).filter(([k]) => k !== "dates")
    .map(([k, v]) => [k, v && typeof v === "object" ? { ...v, acknowledgedAt: undefined } : v]));
  const shared = JSON.stringify([
    farm.collectibles, farm.home && farm.home.collectibles, farm.interior,
    b.equipped, b.skills, farm.farmHands, farm.buds, farm.petHouse,
    calendar, farm.season, farm.island, farm.vip, farm.faction && farm.faction.name,
    farm.buffs, farm.boostHistory, // Power Hour, sunshowers, Guardians (lib/boostWindows.ts)
  ]);
  const used = b.previousPowerUseAt || {};
  return Object.fromEntries(HARVEST_KINDS.map((k) => [k,
    shared + "|" + JSON.stringify(KIND_STATE[k](farm)) + "|" + (KIND_POWER[k] ? used[KIND_POWER[k]] ?? "" : "")]));
}
// A node ready already is replayed at "now", and a boost window can close meanwhile (a crop read
// 2.6 then 2.4 ten minutes later): shorter than the widget's own 10-minute cache, so a ready kind is
// in effect recomputed on every widget refresh, as before.
export const READY_TTL_MS = 5 * 60000;
// Bump when the replay's output changes, so rows cached by older code are not served.
export const HARVEST_SIM_VERSION = 2;
export function harvestCacheValidUntil(rows, now, idleMs = 6 * 3600000) {
  let until = now + idleMs;
  for (const r of rows) until = Math.min(until, r.readyAt > now ? r.readyAt : now + READY_TTL_MS);
  return until;
}

export { DAY };
