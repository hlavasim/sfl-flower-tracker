// Every widget the page can show and pin, by type.
// A table widget:
//   { type, title, page, needs(farmId) → {name: storeQuery}, optional?: [need names the widget can
//     render without], defaults, columns, rowKey, rowLabel, rowClass?, build(data, ctx) → { rows, footer, empty } }
// A view widget (a tile or a chart, no table settings):
//   { type, title, page, needs, optional?, view(data, ctx) → { html } | { empty } }
import { fishingAgeNow } from "./fishing-age-now.mjs";
import { levelingLadderWidget } from "./leveling-ladder.mjs";
import { dashActions } from "./dash-actions.mjs";
import { bumpkinLevel } from "./bumpkin-level.mjs";
import { weatherProtection } from "./weather-protection.mjs";
import { beehives } from "./beehives.mjs";
import { treasuryValue } from "./treasury-value.mjs";
import { ticketChecklist } from "./ticket-checklist.mjs";
import { flipTable } from "./flip-table.mjs";
import { worldIslands, worldSkillPoints } from "./world-dist.mjs";
import { targetList } from "./target-list.mjs";

export const WIDGETS = {
  [fishingAgeNow.type]: fishingAgeNow,
  [levelingLadderWidget.type]: levelingLadderWidget,
  [dashActions.type]: dashActions,
  [bumpkinLevel.type]: bumpkinLevel,
  [weatherProtection.type]: weatherProtection,
  [beehives.type]: beehives,
  [treasuryValue.type]: treasuryValue,
  [ticketChecklist.type]: ticketChecklist,
  [flipTable.type]: flipTable,
  [worldIslands.type]: worldIslands,
  [worldSkillPoints.type]: worldSkillPoints,
  [targetList.type]: targetList,
};
