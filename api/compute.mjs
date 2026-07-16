import { buildCookingSection } from "../core/sections/cooking.mjs";

const PROXY = process.env.PROXY_ORIGIN || "https://sunflower.sajmonium.quest";

export default async function handler(req, res) {
  const farmId = (req.query && req.query.farm) || "";
  const section = (req.query && req.query.section) || "cooking";
  if (!farmId) return res.status(400).json({ error: "farm required" });
  try {
    const sflUrl = `https://api.sunflower-land.com/community/farms/${farmId}`;
    const r = await fetch(`${PROXY}/api/proxy?url=${encodeURIComponent(sflUrl)}`);
    if (!r.ok) return res.status(502).json({ error: `farm fetch failed: ${r.status}` });
    const wrap = await r.json();
    const farm = wrap.farm || wrap;
    const settings = {
      savedRecipes: req.query.recipes ? JSON.parse(req.query.recipes) : {},
      petSimulate: req.query.petSimulate === "1",
      coinsPerSFL: Number(req.query.coinsPerSFL || 0),
    };
    let data;
    if (section === "cooking") data = buildCookingSection(farm, {}, settings);
    else return res.status(400).json({ error: `unknown section: ${section}` });
    return res.status(200).json({ farm: farmId, computedAt: new Date().toISOString(), section, data });
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e) });
  }
}
