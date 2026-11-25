// Every widget the page can show and pin, by type. A widget:
//   { type, title, page, needs(farmId) → {name: storeQuery}, defaults, columns, rowKey, rowLabel,
//     build(data, ctx) → { rows, footer, empty } }
import { fishingAgeNow } from "./fishing-age-now.mjs";

export const WIDGETS = {
  [fishingAgeNow.type]: fishingAgeNow,
};
