// Every widget the page can show and pin, by type.
// A table widget:
//   { type, title, page, needs(farmId) → {name: storeQuery}, optional?: [need names the widget can
//     render without], defaults, columns, rowKey, rowLabel, rowClass?, build(data, ctx) → { rows, footer, empty } }
// A view widget (a tile or a chart, no table settings):
//   { type, title, page, needs, optional?, view(data, ctx, opts) → { html } | { empty } }
import { fishingAgeNow } from "./fishing-age-now.mjs";
import { levelingLadderWidget } from "./leveling-ladder.mjs";
import { dashActions } from "./dash-actions.mjs";
import { bumpkinLevel } from "./bumpkin-level.mjs";
import { weatherProtection } from "./weather-protection.mjs";
import { beehives } from "./beehives.mjs";
import { treasuryValue } from "./treasury-value.mjs";
import { ticketChecklist } from "./ticket-checklist.mjs";
import { flipTable, flipSummary } from "./flip-table.mjs";
import { worldIslands, worldSkillPoints } from "./world-dist.mjs";
import { targetList } from "./target-list.mjs";
import { flowersNeeds, flowerBeds } from "./flowers.mjs";
import { crabTraps, craftingBox } from "./crafting.mjs";
// BUMPKIN and ASCENSION pages
import { bumpkinXp, bumpkinFood, bumpkinBoosts, bumpkinKitchens, bumpkinPlanWidget } from "./bumpkin.mjs";
import { ascensionStatus, ascensionOutlook, ascensionIsland, ascensionSteps } from "./ascension.mjs";
// TICKETS, WORLD, YAKKAMON, SPECULATION, DECORATIONS pages
import { ticketsSummary, ticketsGoal, ticketsToday, ticketsItems, ticketsSchedule, ticketsDecide, ticketsThisAuction, ticketsNextChapter, ticketsHistory, ticketsSources, ticketsReference } from "./tickets.mjs";
import { worldEffLevel, worldCurrentExpansion, worldReach, worldNodes, worldAscension, worldBanStatus, worldVerified } from "./world-dist.mjs";
import { worldSummary, worldDataset, worldPriority } from "./world.mjs";
import { ykLive, ykPlacing, ykFacts, ykPlanner, ykCalculator, ykTiers, ykSources, ykRanks, ykEggs, ykVerdict } from "./yakkamon.mjs";
import { specCalendar, specTrades, specSkim, specEggs } from "./speculation.mjs";
import { decSummary, decColours, decGrow } from "./decorations.mjs";
// ROADMAP, BUDS, PETS
import { roadmapIncome, roadmapBuyPath, roadmapOffers } from "./roadmap.mjs";
import { budsTable } from "./buds.mjs";
import { petsSummary, petsNftCollection, petsMarket, petCards } from "./pets.mjs";
// TREASURY · SALES · MY TRADES · MARKS · FLIPS
import { treasuryCategories, treasuryItems } from "./treasury.mjs";
import { salesSummary, salesListings, salesSellable, salesOffers, salesSold, salesWeekly } from "./sales.mjs";
import { myTradesSummary, myTradesItems, myTradesRecent } from "./my-trades.mjs";
import { marksSummary, marksSources, marksShoppingList, marksLeaderboard, marksCostFirst, marksProjections, marksBurn } from "./marks.mjs";
// POWER, NODES, ROI, SHRINES
import { POWER_WIDGETS } from "./power.mjs";
import { NODES_WIDGETS } from "./nodes.mjs";
import { ROI_WIDGETS } from "./roi.mjs";
import { SHRINES_WIDGETS } from "./shrines.mjs";

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
  [flowersNeeds.type]: flowersNeeds,
  [flowerBeds.type]: flowerBeds,
  [crabTraps.type]: crabTraps,
  [craftingBox.type]: craftingBox,
  // BUMPKIN and ASCENSION pages
  [bumpkinXp.type]: bumpkinXp,
  [bumpkinFood.type]: bumpkinFood,
  [bumpkinBoosts.type]: bumpkinBoosts,
  [bumpkinKitchens.type]: bumpkinKitchens,
  [bumpkinPlanWidget.type]: bumpkinPlanWidget,
  [ascensionStatus.type]: ascensionStatus,
  [ascensionOutlook.type]: ascensionOutlook,
  [ascensionIsland.type]: ascensionIsland,
  [ascensionSteps.type]: ascensionSteps,
  // TICKETS, WORLD, YAKKAMON, SPECULATION, DECORATIONS pages
  [ticketsSummary.type]: ticketsSummary, [ticketsGoal.type]: ticketsGoal, [ticketsToday.type]: ticketsToday,
  [ticketsItems.type]: ticketsItems, [ticketsSchedule.type]: ticketsSchedule, [ticketsDecide.type]: ticketsDecide,
  [ticketsThisAuction.type]: ticketsThisAuction, [ticketsNextChapter.type]: ticketsNextChapter,
  [ticketsHistory.type]: ticketsHistory, [ticketsSources.type]: ticketsSources, [ticketsReference.type]: ticketsReference,
  [worldSummary.type]: worldSummary, [worldPriority.type]: worldPriority, [worldDataset.type]: worldDataset,
  [worldEffLevel.type]: worldEffLevel, [worldCurrentExpansion.type]: worldCurrentExpansion, [worldReach.type]: worldReach,
  [worldNodes.type]: worldNodes, [worldAscension.type]: worldAscension, [worldBanStatus.type]: worldBanStatus, [worldVerified.type]: worldVerified,
  [ykLive.type]: ykLive, [ykPlacing.type]: ykPlacing, [ykFacts.type]: ykFacts, [ykPlanner.type]: ykPlanner, [ykCalculator.type]: ykCalculator,
  [ykTiers.type]: ykTiers, [ykSources.type]: ykSources, [ykRanks.type]: ykRanks, [ykEggs.type]: ykEggs, [ykVerdict.type]: ykVerdict,
  [specCalendar.type]: specCalendar, [specTrades.type]: specTrades, [specSkim.type]: specSkim, [specEggs.type]: specEggs,
  [decSummary.type]: decSummary, [decColours.type]: decColours, [decGrow.type]: decGrow,
  // ROADMAP, BUDS, PETS
  [roadmapIncome.type]: roadmapIncome,
  [roadmapBuyPath.type]: roadmapBuyPath,
  [roadmapOffers.type]: roadmapOffers,
  [budsTable.type]: budsTable,
  [petsSummary.type]: petsSummary,
  [petsNftCollection.type]: petsNftCollection,
  [petsMarket.type]: petsMarket,
  [petCards.type]: petCards,
  // TREASURY · SALES · MY TRADES · MARKS · FLIPS
  [treasuryCategories.type]: treasuryCategories,
  [treasuryItems.type]: treasuryItems,
  [salesSummary.type]: salesSummary,
  [salesListings.type]: salesListings,
  [salesSellable.type]: salesSellable,
  [salesOffers.type]: salesOffers,
  [salesSold.type]: salesSold,
  [salesWeekly.type]: salesWeekly,
  [myTradesSummary.type]: myTradesSummary,
  [myTradesItems.type]: myTradesItems,
  [myTradesRecent.type]: myTradesRecent,
  [marksSummary.type]: marksSummary,
  [marksSources.type]: marksSources,
  [marksShoppingList.type]: marksShoppingList,
  [marksLeaderboard.type]: marksLeaderboard,
  [marksCostFirst.type]: marksCostFirst,
  [marksProjections.type]: marksProjections,
  [marksBurn.type]: marksBurn,
  [flipSummary.type]: flipSummary,
  // POWER, NODES, ROI, SHRINES
  ...Object.fromEntries([...POWER_WIDGETS, ...NODES_WIDGETS, ...ROI_WIDGETS, ...SHRINES_WIDGETS].map((w) => [w.type, w])),
};
