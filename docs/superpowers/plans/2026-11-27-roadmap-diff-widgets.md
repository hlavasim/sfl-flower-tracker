# ROADMAP and DIFF: The Last Page HTML Becomes Widgets

**Goal:** the last pages that are still hand-written HTML (ROADMAP below its 4 widgets, and DIFF)
become widgets. Each one can be pinned to a board, has a glance model (looks) and ⚙ settings, and is
tested like the other 132.

**Pattern (as before):** the logic moves out of `flowers.html` into `core/sections/*.mjs`, so the
page engine and the tests share it. A widget lives in `widgets/*.mjs`, with columns, `build` and
`glanceModel`. The page lists widgets, as BUMPKIN and FISHING do. Nothing new in the host, boards
or templates.

## What Stays Page Controls (Not Widgets)

These are settings forms, not data. They stay as a page panel, the same as LEVELING's ⚙ Setup and
DOLLS' "configure":
- ROADMAP ⚙ Settings & assumptions: start income, efficiency, collectibles/wearables, coins free,
  restocks, ticket value, horizon.
- ROADMAP "What I farm / mine" checkboxes.
- DIFF period picker and its draggable window: the explorer stays page-only. Its result (the
  changelog of the chosen window) becomes a widget.

## ROADMAP: 7 Widgets

Each widget reads the POWER state and the roadmap settings through `ctx`, the way `roadmap-income`
already does. Legacy function → widget:

| Legacy (flowers.html) | Widget | Natural look |
|---|---|---|
| `roadmapProfitabilityHtml` (What to farm / mine now, ~500 lines) | `roadmap-profit`: net FLOWER/day per activity, green or red; ⚙ category | number + list (best net) |
| `roadmapPeriodicHtml` (Expired — renew) | `roadmap-expired`: what has lapsed and what it costs to renew | list |
| `roadmapGiftsHtml` | `roadmap-gifts`: best NPC flower gifts | next up + list |
| `roadmapDeliveriesHtml` | `roadmap-deliveries`: which deliveries are worth doing | number + list |
| `roadmapAnimalFeedHtml` | `roadmap-animal-feed`: what to feed and whether it pays | list |
| `roadmapAnimalLifecycleHtml` | `roadmap-animal-life`: net per level | bars |
| `roadmapSkillsViewHtml` (the ⭐ Skills tab) | `roadmap-skills`: skills by tree and tier | icons |

- **Scenario bar/table:** a ⚙ option "scenario" on `roadmap-buy-path`, replacing the page toggle.
- **Mining chain graph (ReactFlow):** stays in the full view of `roadmap-profit`, not in the looks.

## DIFF: 3 Widgets (Owner Farm Only, Like SPEKULACE)

| Legacy | Widget |
|---|---|
| Investment tracker (`renderInvestmentTracker`) | `inv-tracker`: invested vs worth, per position |
| 📊 Investment insights | `inv-insights` |
| Changelog of the chosen window (`renderDiff` content) | `diff-changes`: what changed, in FLOWER, biggest first |

- **Pricing methods (387 traces):** stays a collapsible debug panel on the page. It is an
  explanation of the calculation, not data to pin.

## Order and Size

1. ROADMAP, in 3 commits:
   1. gifts, deliveries, animals (4 small widgets);
   2. expired + skills;
   3. profit (the biggest).
2. DIFF: tracker, insights, changes.

Every widget gets a test on the fixture farm: the same numbers as the old HTML for the same input.
Each legacy function is removed only after its widget matches it, and you approve each removal.

**Files:**
- `core/sections/roadmap-*.mjs` and `diff.mjs` (logic);
- `widgets/roadmap.mjs` (+7);
- `widgets/diff.mjs` (new);
- `widgets/registry.mjs`;
- `flowers.html` (page assembly, removal of the old HTML);
- tests.

## Risks

- The legacy generators read globals: `powerState`, `roadmapState`, `getRoadmapSettings`,
  `_roadmapServer`. These have to reach the widgets through `ctx`, which has already been done for
  `roadmap-income`.
- The "What I farm" checkboxes change the numbers in `roadmap-profit`. They stay page settings,
  which the widget reads.
- DIFF posts the chosen window to the server. The widget reads the result from the store; the
  explorer stays on the page.
