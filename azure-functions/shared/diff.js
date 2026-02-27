/**
 * Flatten a nested object at a given root path into dot-notation keys.
 * e.g. flattenPath({ inventory: { Wood: "100" } }, "inventory") => { "inventory.Wood": "100" }
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
  trees:        { stateKey: "wood",  tsField: "choppedAt", baseDurMs: 7200000 },
  stones:       { stateKey: "stone", tsField: "minedAt",   baseDurMs: 14400000 },
  iron:         { stateKey: "stone", tsField: "minedAt",   baseDurMs: 28800000 },
  gold:         { stateKey: "stone", tsField: "minedAt",   baseDurMs: 86400000 },
  crimstones:   { stateKey: "stone", tsField: "minedAt",   baseDurMs: 86400000 },
  oilReserves:  { stateKey: "oil",   tsField: "drilledAt", baseDurMs: 72000000 },
  lavaPits:     { topLevel: true,    tsField: "startedAt", baseDurMs: 259200000 },
  crops:        { stateKey: "crop",  tsField: "plantedAt", plantable: true },
  fruitPatches: { stateKey: "fruit", tsField: "harvestedAt", plantable: true },
  flowerBeds:   { stateKey: "flower", tsField: "plantedAt", plantable: true,
                  farmPath: "flowers.flowerBeds" },
};

/** Safely convert SFL timestamp (may be seconds or ms) to ms. */
function toMs(ts) {
  if (!ts) return 0;
  const n = typeof ts === "string" ? parseFloat(ts) : ts;
  return n < 1e12 ? n * 1000 : n;
}

/** Get nodes map from farm data for a given config entry. */
function getNodes(data, farmKey, cfg) {
  if (cfg.farmPath) {
    // e.g. "flowers.flowerBeds" → data.flowers.flowerBeds
    return cfg.farmPath.split(".").reduce((o, k) => (o && o[k]) || {}, data);
  }
  return data[farmKey] || {};
}

/** Get harvest timestamp from a node. */
function getTs(node, cfg) {
  if (cfg.topLevel) return toMs(node[cfg.tsField]);
  const sub = node[cfg.stateKey];
  return sub ? toMs(sub[cfg.tsField]) : 0;
}

/** Get respawn duration in ms. */
function getDuration(node, cfg) {
  if (cfg.topLevel) return cfg.baseDurMs;
  const sub = node[cfg.stateKey];
  // boostedTime is already in ms if present
  if (sub && sub.boostedTime) return sub.boostedTime;
  return cfg.baseDurMs;
}

/**
 * Compute node state summaries for all resource types.
 * Returns { trees: { total, recovering, ready, harvested }, ... }
 */
function computeNodeSummaries(oldData, newData, now) {
  const result = {};

  for (const [farmKey, cfg] of Object.entries(NODE_CONFIG)) {
    const newNodes = getNodes(newData, farmKey, cfg);
    const oldNodes = getNodes(oldData, farmKey, cfg);
    const nodeIds = Object.keys(newNodes);

    if (nodeIds.length === 0) continue;

    if (cfg.plantable) {
      // ── Planting nodes (crops, fruit, flowers) ──
      let total = 0, active = 0, empty = 0, harvested = 0;

      for (const id of nodeIds) {
        const node = newNodes[id];
        const oldNode = oldNodes[id];
        const mult = node.multiplier || 1;
        total += mult;

        const hasSub = node[cfg.stateKey] != null;
        const hadSub = oldNode && oldNode[cfg.stateKey] != null;

        if (hasSub) {
          active += mult;
        } else {
          empty += mult;
        }

        // Detect harvests
        if (hadSub && !hasSub) {
          // Had crop/fruit/flower, now empty → harvested & not replanted
          harvested += mult;
        } else if (hadSub && hasSub) {
          const oldTs = toMs(oldNode[cfg.stateKey][cfg.tsField]);
          const newTs = toMs(node[cfg.stateKey][cfg.tsField]);
          if (newTs !== oldTs && oldTs > 0) {
            // Timestamp changed → replanted (implies harvest)
            harvested += mult;
          }
          // Special case for fruit: harvestedAt changes on partial harvest
          if (cfg.tsField !== "harvestedAt" && cfg.stateKey === "fruit") {
            const oldH = toMs(oldNode[cfg.stateKey].harvestedAt);
            const newH = toMs(node[cfg.stateKey].harvestedAt);
            if (newH !== oldH && oldH > 0) harvested += mult;
          }
        } else if (!hadSub && hasSub) {
          // Was empty, now has crop → planted (but also might mean harvest+replant
          // if oldNode didn't exist at all, skip — it's a new node)
          // No harvest to count here
        }
      }

      // Also check old nodes that disappeared entirely from new
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
      // ── Mining/chopping nodes ──
      let total = 0, recovering = 0, ready = 0, harvested = 0;

      for (const id of nodeIds) {
        const node = newNodes[id];
        const oldNode = oldNodes[id];
        const mult = node.multiplier || 1;
        total += mult;

        const ts = getTs(node, cfg);
        const dur = getDuration(node, cfg);

        if (ts > 0 && (now - ts) < dur) {
          recovering += mult;
        } else {
          ready += mult;
        }

        // Detect harvest: timestamp changed between snapshots
        if (oldNode) {
          const oldTs = getTs(oldNode, cfg);
          if (ts > 0 && ts !== oldTs) {
            harvested += mult;
          }
        }
      }

      // Compute old state for comparison
      let oldRecovering = 0, oldReady = 0;
      for (const id of Object.keys(oldNodes)) {
        const oldNode = oldNodes[id];
        const mult = oldNode.multiplier || 1;
        const ts = getTs(oldNode, cfg);
        const dur = getDuration(oldNode, cfg);
        if (ts > 0 && (now - ts) < dur) {
          oldRecovering += mult;
        } else {
          oldReady += mult;
        }
      }

      if (harvested > 0 || recovering !== oldRecovering || ready !== oldReady) {
        result[farmKey] = { total, recovering, ready, harvested };
      }
    }
  }

  return result;
}

/** Count weighted active/empty for plantable old nodes. */
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

/**
 * Compute a diff between two farm game_data objects.
 * Returns an object of changed keys with delta values, or null if nothing changed.
 */
function computeFarmDiff(oldData, newData) {
  const diff = {};

  for (const prefix of TRACK_PATHS) {
    const oldFlat = flattenPath(oldData, prefix);
    const newFlat = flattenPath(newData, prefix);

    // Check new/changed keys
    for (const [key, val] of Object.entries(newFlat)) {
      if (SKIP_PATTERN.test(key)) continue;
      const oldVal = oldFlat[key];
      if (oldVal === undefined) {
        diff[key] = val;
        continue;
      }
      const nVal = parseFloat(val);
      const nOld = parseFloat(oldVal);
      if (!isNaN(nVal) && !isNaN(nOld)) {
        const delta = nVal - nOld;
        if (Math.abs(delta) > 1e-10) diff[key] = delta;
      } else if (JSON.stringify(val) !== JSON.stringify(oldVal)) {
        diff[key] = val;
      }
    }

    // Removed keys
    for (const key of Object.keys(oldFlat)) {
      if (!(key in newFlat) && !SKIP_PATTERN.test(key)) {
        diff[key] = null;
      }
    }
  }

  // Node state summaries
  const nodes = computeNodeSummaries(oldData, newData, Date.now());
  if (Object.keys(nodes).length > 0) {
    diff.nodes = nodes;
  }

  // Diff version marker
  if (Object.keys(diff).length > 0) {
    diff._v = 2;
  }

  return Object.keys(diff).length > 0 ? diff : null;
}

module.exports = { flattenPath, computeFarmDiff, computeNodeSummaries, NODE_CONFIG };
