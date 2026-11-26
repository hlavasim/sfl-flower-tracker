// Number formatting for the glance models (widgets/*.mjs glanceModel), and the W×H size names a v2
// board copy may have saved (read once to pick a look of that size). The looks themselves are
// ui/glance-templates.mjs.

// 142474 → "142k", 1712000 → "1.7M", 53712 → "53.7k", 87.67 → "87.7"
export function compact(v) {
  if (v == null || !Number.isFinite(Number(v))) return "—";
  const n = Number(v), a = Math.abs(n), sign = n < 0 ? "−" : "";
  const fix = (x) => (x >= 100 ? Math.round(x).toString() : x.toFixed(1).replace(/\.0$/, ""));
  if (a >= 1e6) return sign + fix(a / 1e6) + "M";
  if (a >= 1e3) return sign + fix(a / 1e3) + "k";
  return sign + fix(a);
}

export const SIZES = ["1x1", "2x1", "1x2", "2x2", "4x1", "1x4", "4x2", "2x4"];
