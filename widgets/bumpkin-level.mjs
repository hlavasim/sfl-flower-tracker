// BUMPKIN · level tile: the absolute level, and how far the XP is into the band (ascended) or to
// the next level (not ascended). A view widget — no table, no settings.
import { getTotalBumpkinLevel, _ascBaseline, _ascBandXp, _withinAscensionLevel, BUMPKIN_XP_TABLE } from "../core/engine/power-helpers.mjs";

const mxp = (n) => (n >= 1e6 ? `${(n / 1e6).toLocaleString("cs-CZ", { maximumFractionDigits: 1 })} M` : Math.round(n).toLocaleString("cs-CZ"));
const bar = (pct) => `<div class="w-bar"><span style="width:${Math.max(0, Math.min(100, pct)).toFixed(1)}%"></span></div>`;

export const bumpkinLevel = {
  type: "bumpkin-level",
  title: "🧑‍🌾 Bumpkin level",
  page: "bumpkin",
  needs: (farmId) => ({ farm: { res: "farm", farm: farmId } }),

  view({ farm }) {
    if (!farm) return { empty: "Chybí data farmy." };
    if (!farm.bumpkin) return { empty: "Farma nemá Bumpkina." };
    const xp = +farm.bumpkin.experience || 0;
    const asc = (farm.island && farm.island.ascensionLevel) || 0;
    const level = getTotalBumpkinLevel(xp, asc);
    let sub, pct, left;
    if (asc >= 1) {
      // XP keeps filling bands past the cap; the level freezes until you ascend
      let band = asc;
      while (xp >= _ascBaseline(band) + _ascBandXp(band)) band++;
      const base = _ascBaseline(band), size = _ascBandXp(band);
      const within = _withinAscensionLevel(xp, band);
      pct = ((xp - base) / size) * 100;
      const uncapped = 150 + (band - 1) * 50 + within;
      sub = `pásmo A${band} · L${within}/50${uncapped > level ? ` · XP odpovídá L${uncapped}` : ""}`;
      left = `do konce pásma ${mxp(Math.max(0, base + size - xp))} XP`;
    } else {
      const prev = BUMPKIN_XP_TABLE[level - 1] || 0, next = BUMPKIN_XP_TABLE[Math.min(level, 199)];
      pct = level >= 200 ? 100 : ((xp - prev) / (next - prev)) * 100;
      sub = `XP ${mxp(xp)}`;
      left = level >= 200 ? "maximum před ascenzí" : `do L${level + 1} ${mxp(next - xp)} XP`;
    }
    return {
      html: `<div class="w-tile"><div class="w-tile-big">LVL ${level}</div><div class="w-tile-sub">${sub}</div>${bar(pct)}` +
        `<div class="w-tile-sub">${pct.toFixed(0)} % · ${left}</div></div>`,
    };
  },
};
