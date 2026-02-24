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

  return Object.keys(diff).length > 0 ? diff : null;
}

module.exports = { flattenPath, computeFarmDiff };
