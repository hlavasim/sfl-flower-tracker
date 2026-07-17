import { buildCookingSection } from "../core/sections/cooking.mjs";
import { buildConstantsSection } from "../core/sections/constants.mjs";
import { buildPricesSection } from "../core/sections/prices.mjs";
import { computeBettyRate } from "../core/engine/prices.mjs";
import { API_SPEC } from "../core/api-spec.mjs";

const PROXY = process.env.PROXY_ORIGIN || "https://sunflower.sajmonium.quest";
const PRICES_URL = "https://sfl.world/api/v1/prices";

// Prices are best-effort: a failed/erroring fetch must not fail the whole endpoint
// (costs come back null/unpriced instead), unlike the farm fetch which still 502s.
async function fetchPrices() {
  try {
    const r = await fetch(`${PROXY}/api/proxy?url=${encodeURIComponent(PRICES_URL)}`);
    if (!r.ok) return {};
    const json = await r.json();
    return json?.data?.p2p || {};
  } catch {
    return {};
  }
}

export default async function handler(req, res) {
  const farmId = (req.query && req.query.farm) || "";
  const section = (req.query && req.query.section) || "cooking";
  // Sections that describe the API itself need no farm — must branch before the farm guard.
  if (section === "constants") {
    return res.status(200).json({ section, computedAt: new Date().toISOString(), data: buildConstantsSection() });
  }
  if (section === "openapi") return res.status(200).json(API_SPEC);
  if (!farmId) return res.status(400).json({ error: "farm required" });
  try {
    const sflUrl = `https://api.sunflower-land.com/community/farms/${farmId}`;
    const [r, p2p] = await Promise.all([
      fetch(`${PROXY}/api/proxy?url=${encodeURIComponent(sflUrl)}`),
      fetchPrices(),
    ]);
    if (!r.ok) return res.status(502).json({ error: `farm fetch failed: ${r.status}` });
    const wrap = await r.json();
    const farm = wrap.farm || wrap;
    const coinsPerSFL = req.query.coinsPerSFL !== undefined
      ? Number(req.query.coinsPerSFL)
      : (computeBettyRate(p2p).rate || 0);
    // Rate-profile override for section=prices: different consumers (marks/deliveries,
    // dashboard, roadmap, ROI) use different rate profiles today (task-F2-2a). Unparseable
    // or absent must fall back to {} — never a 500 — so today's coinsPerSFL-only behaviour
    // is unaffected when a caller doesn't send it.
    let rates = {};
    if (req.query.rates) {
      try { rates = JSON.parse(req.query.rates); } catch { rates = {}; }
    }
    const settings = {
      savedRecipes: req.query.recipes ? JSON.parse(req.query.recipes) : {},
      petSimulate: req.query.petSimulate === "1",
      coinsPerSFL,
      ...rates,
    };
    let data;
    if (section === "cooking") data = buildCookingSection(farm, p2p, settings);
    // `prices` needs a farm (productionCost is per-farm: skills, salt/fish yield), so
    // unlike constants/openapi its branch belongs here, after the farm-required guard.
    else if (section === "prices") data = buildPricesSection(farm, p2p, settings);
    else return res.status(400).json({ error: `unknown section: ${section}` });
    return res.status(200).json({ farm: farmId, computedAt: new Date().toISOString(), section, data });
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e) });
  }
}
