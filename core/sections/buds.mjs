// section=buds — the BUDS page's valuation table, mirroring renderBuds' row assembly
// (flowers.html ~21870-21888) over all 2621 encoded buds. The page's remaining job is
// rendering: describeBudBoosts (catIcon HTML) + filters run client-side on these rows.
// `settings.savedProducts` carries the client's per-category product selections
// (localStorage) exactly as the page passed them to calcBudSflPerDay.
import { detectFarmCapacity } from "../engine/power-helpers.mjs";
import { decodeBud, calcBudSflPerDay, BUD_COUNT } from "../engine/buds.mjs";

export function buildBudsSection(farm, p2p, settings = {}) {
  const p2pPrices = {};
  for (const [k, v] of Object.entries(p2p || {})) p2pPrices[k] = parseFloat(v) || 0;
  const savedProducts = settings.savedProducts || {};
  const capacity = detectFarmCapacity(farm);

  // Check which buds the user owns
  const ownedBudIds = new Set();
  const farmBuds = farm.buds || {};
  for (const [budId] of Object.entries(farmBuds)) ownedBudIds.add(parseInt(budId));

  const rows = [];
  for (let id = 1; id <= BUD_COUNT; id++) {
    const bud = decodeBud(id);
    if (!bud) continue;
    const result = calcBudSflPerDay(bud, capacity, p2pPrices, savedProducts);
    rows.push({
      id, type: bud.type, stem: bud.stem, aura: bud.aura,
      owned: ownedBudIds.has(id),
      sflPerDay: result.totalSfl,
      breakdown: result.breakdown,
    });
  }

  return { rows, capacity };
}
