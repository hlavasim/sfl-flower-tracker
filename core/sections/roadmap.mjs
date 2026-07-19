// section=roadmap — the ROADMAP page's computed layer: measured efficiency (from
// posted farm-history snapshots, like section=eff), current production, and the full
// buy-path simulation (greedy + local-search reinvestment ordering). POST-only.
// Requires the power context to be set first (api/compute.mjs calls buildPowerSection
// before this). Non-finite roi/atDay values are nulled for JSON; the client maps them
// back to Infinity. Clone object references are stripped from the list fields — the
// page renders plain fields only.
import {
  getRoadmapSettings, roadmapComputeEfficiency, _setRoadmapState,
  roadmapCurrentProduction, roadmapSimulate,
} from "../engine/roadmap.mjs";

const _nf = (v) => (typeof v === "number" && !isFinite(v) ? null : v);
const _strip = (m) => ({ name: m.name, type: m.type, floor: m.floor, boost: m.boost, supply: m.supply });

export function buildRoadmapSection(snapshots, settings = {}) {
  const eff = roadmapComputeEfficiency(snapshots || []);
  // Same shape renderRoadmap builds client-side from section=eff.
  const meanRatio = typeof eff.meanRatio === "number" ? eff.meanRatio : 0.5;
  _setRoadmapState({ effByCat: eff.effByCat || {}, effMeta: eff.meta, meanRatio });

  const rs = getRoadmapSettings(settings.roadmapSettings || {});
  const currentProd = roadmapCurrentProduction(rs);
  const startIncome = (rs.startIncome != null) ? rs.startIncome : currentProd.total;
  const sim = roadmapSimulate(rs, startIncome);

  // JSON-safe: strip clone refs, null non-finite numbers.
  sim.untradeable = (sim.untradeable || []).map(_strip);
  sim.tail = (sim.tail || []).map(_strip);
  sim.situational = (sim.situational || []).map((m) => ({ ..._strip(m), sitValue: m.sitValue, sitReason: m.sitReason }));
  for (const t of (sim.timeline || [])) { t.roi = _nf(t.roi); t.atDay = _nf(t.atDay); }
  for (const r of (sim.ranked || [])) { r.roi = _nf(r.roi); r.atDay = _nf(r.atDay); }
  sim.totalDays = _nf(sim.totalDays);
  sim.coreDays = _nf(sim.coreDays);

  return { eff, currentProd, startIncome, sim };
}
