// Every widget the page can show and pin, by type. A widget:
//   { type, title, page, needs(farmId) → {name: storeQuery}, optional?: [need names the widget can
//     render without], defaults, columns, rowKey, rowLabel, build(data, ctx) → { rows, footer, empty } }
import { fishingAgeNow } from "./fishing-age-now.mjs";
import { levelingLadderWidget } from "./leveling-ladder.mjs";

export const WIDGETS = {
  [fishingAgeNow.type]: fishingAgeNow,
  [levelingLadderWidget.type]: levelingLadderWidget,
};
