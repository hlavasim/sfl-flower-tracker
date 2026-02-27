/**
 * Flatten a nested object at a given root path into dot-notation keys.
 */
function flattenPath(obj, prefix) {
  const result = {};
  const root = prefix.split(".").reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), obj);
  if (root === undefined || root === null) return result;

  if (typeof root !== "object") {
    result[prefix] = root;
    return result;
  }

  const stack = [[prefix, root]];
  while (stack.length > 0) {
    const [path, val] = stack.pop();
    if (val === null || val === undefined) {
      result[path] = val;
    } else if (typeof val === "object" && !Array.isArray(val)) {
      for (const [k, v] of Object.entries(val)) {
        stack.push([`${path}.${k}`, v]);
      }
    } else {
      result[path] = val;
    }
  }
  return result;
}

const SKIP_PATTERN = /(plantedAt|harvestedAt|readyAt|createdAt|swarmActivatedAt|fertilisedAt|lastFed|awpikeAt)/;
const TRACK_PATHS = ["inventory", "balance", "coins", "gems", "stock", "wardrobe"];

/* ── Node state tracking ─────────────────────────────────────── */

const NODE_CONFIG = {
  trees:        { stateKey: "wood",      tsField: "choppedAt",  baseDurMs: 7200000 },
  stones:       { stateKey: "stone",     tsField: "minedAt",    baseDurMs: 14400000 },
  iron:         { stateKey: "stone",     tsField: "minedAt",    baseDurMs: 28800000 },
  gold:         { stateKey: "stone",     tsField: "minedAt",    baseDurMs: 86400000 },
  crimstones:   { stateKey: "stone",     tsField: "minedAt",    baseDurMs: 86400000 },
  oilReserves:  { stateKey: "oil",       tsField: "drilledAt",  baseDurMs: 72000000 },
  lavaPits:     { topLevel: true,        tsField: "startedAt",  baseDurMs: 259200000 },
  crops:        { stateKey: "crop",      tsField: "plantedAt",  plantable: true },
  fruitPatches: { stateKey: "fruit",     tsField: "harvestedAt",plantable: true },
  flowerBeds:   { stateKey: "flower",    tsField: "plantedAt",  plantable: true,
                  farmPath: "flowers.flowerBeds" },
  greenhouse:   { stateKey: "plant",     tsField: "plantedAt",  plantable: true,
                  farmPath: "greenhouse.pots" },
  crabTraps:    { stateKey: "waterTrap", tsField: "readyAt",    plantable: true,
                  farmPath: "crabTraps.trapSpots" },
};

function toMs(ts) {
  if (!ts) return 0;
  const n = typeof ts === "string" ? parseFloat(ts) : ts;
  return n < 1e12 ? n * 1000 : n;
}

function getNodes(data, farmKey, cfg) {
  if (cfg.farmPath) {
    return cfg.farmPath.split(".").reduce((o, k) => (o && o[k]) || {}, data);
  }
  return data[farmKey] || {};
}

function getTs(node, cfg) {
  if (cfg.topLevel) return toMs(node[cfg.tsField]);
  const sub = node[cfg.stateKey];
  return sub ? toMs(sub[cfg.tsField]) : 0;
}

function getDuration(node, cfg) {
  if (cfg.topLevel) return cfg.baseDurMs;
  const sub = node[cfg.stateKey];
  if (sub && sub.boostedTime) return sub.boostedTime;
  return cfg.baseDurMs;
}

function countWeighted(nodes, cfg, wantActive) {
  let count = 0;
  for (const node of Object.values(nodes)) {
    const mult = node.multiplier || 1;
    const hasSub = node[cfg.stateKey] != null;
    if (wantActive && hasSub) count += mult;
    if (!wantActive && !hasSub) count += mult;
  }
  return count;
}

function computeNodeSummaries(oldData, newData, now) {
  const result = {};

  for (const [farmKey, cfg] of Object.entries(NODE_CONFIG)) {
    const newNodes = getNodes(newData, farmKey, cfg);
    const oldNodes = getNodes(oldData, farmKey, cfg);
    const nodeIds = Object.keys(newNodes);

    if (nodeIds.length === 0) continue;

    if (cfg.plantable) {
      let total = 0, active = 0, empty = 0, harvested = 0;

      for (const id of nodeIds) {
        const node = newNodes[id];
        const oldNode = oldNodes[id];
        const mult = node.multiplier || 1;
        total += mult;

        const hasSub = node[cfg.stateKey] != null;
        const hadSub = oldNode && oldNode[cfg.stateKey] != null;

        if (hasSub) active += mult; else empty += mult;

        if (hadSub && !hasSub) {
          harvested += mult;
        } else if (hadSub && hasSub) {
          const oldTs = toMs(oldNode[cfg.stateKey][cfg.tsField]);
          const newTs = toMs(node[cfg.stateKey][cfg.tsField]);
          if (newTs !== oldTs && oldTs > 0) harvested += mult;
          if (cfg.tsField !== "harvestedAt" && cfg.stateKey === "fruit") {
            const oldH = toMs(oldNode[cfg.stateKey].harvestedAt);
            const newH = toMs(node[cfg.stateKey].harvestedAt);
            if (newH !== oldH && oldH > 0) harvested += mult;
          }
        }
      }

      for (const id of Object.keys(oldNodes)) {
        if (!(id in newNodes)) {
          const oldNode = oldNodes[id];
          const mult = oldNode.multiplier || 1;
          if (oldNode[cfg.stateKey] != null) harvested += mult;
        }
      }

      if (harvested > 0 || active !== countWeighted(oldNodes, cfg, true) ||
          empty !== countWeighted(oldNodes, cfg, false)) {
        result[farmKey] = { total, active, empty, harvested };
      }
    } else {
      let total = 0, recovering = 0, ready = 0, harvested = 0;

      for (const id of nodeIds) {
        const node = newNodes[id];
        const oldNode = oldNodes[id];
        const mult = node.multiplier || 1;
        total += mult;

        const ts = getTs(node, cfg);
        const dur = getDuration(node, cfg);

        if (ts > 0 && (now - ts) < dur) recovering += mult; else ready += mult;

        if (oldNode) {
          const oldTs = getTs(oldNode, cfg);
          if (ts > 0 && ts !== oldTs) harvested += mult;
        }
      }

      let oldRecovering = 0, oldReady = 0;
      for (const id of Object.keys(oldNodes)) {
        const oldNode = oldNodes[id];
        const mult = oldNode.multiplier || 1;
        const ts = getTs(oldNode, cfg);
        const dur = getDuration(oldNode, cfg);
        if (ts > 0 && (now - ts) < dur) oldRecovering += mult; else oldReady += mult;
      }

      if (harvested > 0 || recovering !== oldRecovering || ready !== oldReady) {
        result[farmKey] = { total, recovering, ready, harvested };
      }
    }
  }

  return result;
}

/* ── Animal tracking ─────────────────────────────────────────── */

function computeAnimalSummaries(oldData, newData, now) {
  const result = {};

  function processBuilding(key, typeFilter) {
    const newAnimals = newData[key]?.animals || {};
    const oldAnimals = oldData[key]?.animals || {};
    const counts = {};  // { type: { total, fed, sick, cured } }

    for (const [id, animal] of Object.entries(newAnimals)) {
      const type = typeFilter || (animal.type || "chicken").toLowerCase();
      if (!counts[type]) counts[type] = { total: 0, fed: 0, sick: 0, cured: 0 };
      const c = counts[type];
      c.total++;

      const oldAnimal = oldAnimals[id];

      // Fed: XP increased
      if (oldAnimal) {
        const oldXp = parseFloat(oldAnimal.experience) || 0;
        const newXp = parseFloat(animal.experience) || 0;
        if (newXp > oldXp) c.fed++;
      }

      // Sick: current state
      if (animal.state === "sick") c.sick++;

      // Cured: was sick, now not sick
      if (oldAnimal && oldAnimal.state === "sick" && animal.state !== "sick") c.cured++;
    }

    // Old totals + sick counts for change detection
    const oldCounts = {};
    const oldSick = {};
    for (const a of Object.values(oldAnimals)) {
      const type = typeFilter || (a.type || "chicken").toLowerCase();
      oldCounts[type] = (oldCounts[type] || 0) + 1;
      if (a.state === "sick") oldSick[type] = (oldSick[type] || 0) + 1;
    }

    for (const [type, c] of Object.entries(counts)) {
      const oldTotal = oldCounts[type] || 0;
      const oldSickCount = oldSick[type] || 0;
      // Only include if something actually changed
      if (c.fed > 0 || c.cured > 0 || c.total !== oldTotal || c.sick !== oldSickCount) {
        result[type + "s"] = c;  // chickens, cows, sheeps → fix sheep below
      }
    }
  }

  processBuilding("henHouse", "chicken");
  processBuilding("barn", null);

  // Fix plural: "sheeps" → "sheep"
  if (result.sheeps) { result.sheep = result.sheeps; delete result.sheeps; }

  return result;
}

/* ── Main diff computation ───────────────────────────────────── */

function computeFarmDiff(oldData, newData) {
  const diff = {};

  for (const prefix of TRACK_PATHS) {
    const oldFlat = flattenPath(oldData, prefix);
    const newFlat = flattenPath(newData, prefix);

    for (const [key, val] of Object.entries(newFlat)) {
      if (SKIP_PATTERN.test(key)) continue;
      const oldVal = oldFlat[key];
      if (oldVal === undefined) { diff[key] = val; continue; }
      const nVal = parseFloat(val);
      const nOld = parseFloat(oldVal);
      if (!isNaN(nVal) && !isNaN(nOld)) {
        const delta = nVal - nOld;
        if (Math.abs(delta) > 1e-10) diff[key] = delta;
      } else if (JSON.stringify(val) !== JSON.stringify(oldVal)) {
        diff[key] = val;
      }
    }

    for (const key of Object.keys(oldFlat)) {
      if (!(key in newFlat) && !SKIP_PATTERN.test(key)) diff[key] = null;
    }
  }

  // Node state summaries
  const nodes = computeNodeSummaries(oldData, newData, Date.now());

  // Animal summaries → merge into nodes
  const animals = computeAnimalSummaries(oldData, newData, Date.now());
  Object.assign(nodes, animals);

  if (Object.keys(nodes).length > 0) {
    diff.nodes = nodes;

    // Flat harvest/fed/cured keys for aggregation (numeric, summed by farm-diff-agg)
    for (const [type, summary] of Object.entries(nodes)) {
      const h = summary.harvested || summary.fed || 0;
      if (h > 0) diff[`_h.${type}`] = h;
      if (summary.cured > 0) diff[`_c.${type}`] = summary.cured;
    }
  }

  if (Object.keys(diff).length > 0) diff._v = 2;

  return Object.keys(diff).length > 0 ? diff : null;
}

module.exports = { flattenPath, computeFarmDiff, computeNodeSummaries, computeAnimalSummaries, NODE_CONFIG };
