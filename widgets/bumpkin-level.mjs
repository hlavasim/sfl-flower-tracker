// BUMPKIN · level tile: the absolute level, and how far the XP is into the band (ascended) or to
// the next level (not ascended). A view widget — no table, no settings.
import { getTotalBumpkinLevel, _ascBaseline, _ascBandXp, _withinAscensionLevel, BUMPKIN_XP_TABLE } from "../core/engine/power-helpers.mjs";
import { big, compact, meter, rows } from "../ui/glance.mjs";

const mxp = (n) => (n >= 1e6 ? `${(n / 1e6).toLocaleString("en-US", { maximumFractionDigits: 1 })} M` : Math.round(n).toLocaleString("en-US"));
const bar = (pct) => `<div class="w-bar"><span style="width:${Math.max(0, Math.min(100, pct)).toFixed(1)}%"></span></div>`;

// The level, and the XP into the band being filled (ascended) or to the next level.
function levelOf(farm) {
  const xp = +farm.bumpkin.experience || 0;
  const asc = (farm.island && farm.island.ascensionLevel) || 0;
  const level = getTotalBumpkinLevel(xp, asc);
  let sub, pct, left, toGo, band = 0, within = 0, uncapped = level;
  if (asc >= 1) {
    // XP keeps filling bands past the cap; the level freezes until you ascend
    band = asc;
    while (xp >= _ascBaseline(band) + _ascBandXp(band)) band++;
    const base = _ascBaseline(band), size = _ascBandXp(band);
    within = _withinAscensionLevel(xp, band);
    pct = ((xp - base) / size) * 100;
    uncapped = 150 + (band - 1) * 50 + within;
    sub = `band A${band} · L${within}/50${uncapped > level ? ` · XP equals L${uncapped}` : ""}`;
    toGo = Math.max(0, base + size - xp);
    left = `${mxp(toGo)} XP to the end of the band`;
  } else {
    const prev = BUMPKIN_XP_TABLE[level - 1] || 0, next = BUMPKIN_XP_TABLE[Math.min(level, 199)];
    pct = level >= 200 ? 100 : ((xp - prev) / (next - prev)) * 100;
    sub = `XP ${mxp(xp)}`;
    toGo = level >= 200 ? 0 : next - xp;
    left = level >= 200 ? "max before ascension" : `${mxp(next - xp)} XP to L${level + 1}`;
  }
  return { xp, asc, level, sub, pct, left, toGo, band, within, uncapped };
}

export const bumpkinLevel = {
  type: "bumpkin-level",
  title: "🧑‍🌾 Bumpkin level",
  page: "bumpkin",
  needs: (farmId) => ({ farm: { res: "farm", farm: farmId } }),

  view({ farm }) {
    if (!farm) return { empty: "No farm data." };
    if (!farm.bumpkin) return { empty: "The farm has no Bumpkin." };
    const { level, sub, pct, left } = levelOf(farm);
    return {
      html: `<div class="w-tile"><div class="w-tile-big">LVL ${level}</div><div class="w-tile-sub">${sub}</div>${bar(pct)}` +
        `<div class="w-tile-sub">${pct.toFixed(0)} % · ${left}</div></div>`,
    };
  },
};

// ── iPhone glance face: S = the level with a meter to the next one (or through the band);
// M = the XP numbers beside it ──
bumpkinLevel.sizes = ["s", "m"];
bumpkinLevel.size = "s";
bumpkinLevel.glance = ({ farm } = {}, ctx = {}, opts = {}, size = "s") => {
  if (!farm) return { empty: "No farm data." };
  if (!farm.bumpkin) return { empty: "The farm has no Bumpkin." };
  const L = levelOf(farm);
  const cap = L.asc >= 1 ? `A${L.band} L${L.within}/50 · ${L.pct.toFixed(0)} %`
    : L.level >= 200 ? "max before ascension" : `${L.pct.toFixed(0)} % to L${L.level + 1}`;
  const head = big(`L${L.level}`) + meter(L.pct, "accent") + `<div class="g-cap">${cap}</div>`;
  if (size === "s") return { html: head };
  const list = [{ name: "XP", value: compact(L.xp) },
    { name: L.asc >= 1 ? "to band end" : L.level >= 200 ? "to go" : `to L${L.level + 1}`, value: compact(L.toGo) },
    L.asc >= 1 ? { name: "XP worth", value: `L${L.uncapped}` } : { name: "to L200", value: compact(Math.max(0, BUMPKIN_XP_TABLE[199] - L.xp)) }];
  return { html: `<div class="g-split"><div>${head}</div>${rows(list)}</div>` };
};
