# Dashboard: bounty board, weekly chores, cost-per-ticket, readability

## Why

The dashboard's existing **Deliveries** section shows reward + SFL cost, but never the
ratio — the user cannot scan for "best SFL per seasonal ticket" at a glance. Two more
income streams (Mega Bounty Board and Weekly Chores) are absent from the dashboard
entirely. On top of that, every row is rendered in `Press Start 2P`, which makes long
labels (`peggy: 3x Kale Omelette`) hard to read at body-text sizes.

## What changes

1. **New section: Bounty Board** — lists every pending `farm.bounties.requests` entry
   not in `farm.bounties.completed`, with input cost, reward, and an efficiency pill.
2. **New section: Chores** — lists every `farm.choreBoard.chores` entry without
   `completedAt`, with progress (X/N), input cost estimate, reward, efficiency pill.
3. **Deliveries** gains the same efficiency pill column (`SFL/ticket` when reward
   includes a seasonal ticket, `Net ±SFL` otherwise). The existing data flow is unchanged.
4. **Dashboard readability** — pixel font kept only on headers/titles; long labels and
   detail text switch to `Courier New`. Spacing and font sizes nudged up. Left-border
   stripes on items removed.

Scope is **dashboard page only**. No other pages, no new routes, no settings UI.

## Architecture

Three layers added to the existing `dashParse*` machinery — no structural changes
elsewhere in `flowers.html`.

### Helpers

#### `dashGetSeasonalTicket(farm) → string | null`

Scans every `farm.delivery.orders[i].reward.items` for the first key that appears in
the hard-coded `SEASONAL_TICKETS` list:

```
[
  "Potion Ticket", "Crow Feather", "Solar Flare Ticket", "Dawn Breaker Ticket",
  "Mermaid Scale", "Tulip Bulb", "Scroll", "Amber Fossil",
  "Bumpkin Ticket", "Sunflower Supporter", "Goblin Emblem", "Sunflower Emblem"
]
```

Returns the first match or `null`. Auto-adapts to whatever the current season pays
without a brittle `season → ticket` map.

If no delivery currently pays a seasonal ticket (e.g. all completed for the day), the
function returns `null` and downstream code falls back to `Net SFL` efficiency. New
seasons that introduce a fresh ticket name will need this list updated, but the rest
of the dashboard keeps working.

#### `dashRewardSummary(reward, ticketName, cost, rates) → { rewardText, efficiency }`

Input:
- `reward` — the raw `{ sfl?, coins?, items? }` object.
- `ticketName` — output of `dashGetSeasonalTicket`, or `null`.
- `cost` — SFL value of inputs (already computed by `dashP2PCost`).
- `rates` — `{ coinsPerSFL, gemsPerSFL }` (from existing exchange-rate fetch).

Output:
- `rewardText` — same human-readable string as today: `"+1278 coins, +5 Potion Ticket"`.
- `efficiency` — one of:
  - `{ kind: "ticket", value: cost / ticketQty, label: "0.24 SFL/Potion Ticket" }`
    when `reward.items[ticketName]` exists and is > 0.
  - `{ kind: "net", value: rewardSfl - cost, label: "Net +5.20 SFL" | "Net −1.60 SFL" }`
    where `rewardSfl = (coins / coinsPerSFL) + (gems / gemsPerSFL) + (sfl direct)`.
    Non-ticket `items` rewards (e.g. a random crop) are ignored in this conversion —
    keeping the math honest rather than guessing prices.
  - `null` if cost is unknown OR no exchange rates loaded yet.

#### `dashChoreParse(chore, farm) → { activityKey, inputItems, target, current, delta, remaining, ready, cost }`

`delta = current != null ? max(0, current - chore.initialProgress) : null` is exposed
so the caller renders progress without recomputing.

Regex-parses `chore.name` against two patterns:

1. `^(Cook|Craft|Grow|Pick|Harvest|Drink|Collect|Mine|Chop|Fish|Dig) (.+?) (\d+) times?$`
2. `^Eat (\d+) (.+)$` (different word order, no `times` suffix)

Verb → `activityKey` table:

| Verb               | Item handling                           | Activity key             |
|--------------------|----------------------------------------|--------------------------|
| Cook / Drink / Bake| singularize plural                      | `<item> Cooked`          |
| Craft / Make       | singularize plural                      | `<item> Crafted`         |
| Grow / Pick / Harvest | singularize plural                   | `<item> Harvested`       |
| Collect            | singularize plural (`Eggs` → `Egg`)     | `<item> Collected`       |
| Mine               | singularize (`Stones` → `Stone`)        | `<item> Mined`           |
| Chop               | singularize (`Trees` → `Tree`)          | `<item> Chopped`         |
| Fish               | no item; sum all `* Caught` keys minus `Compass` items | (computed sum) |
| Dig                | no item                                 | `Treasure Dug`           |
| Eat                | item as-is                              | (no counter — `null`)    |

Singularization rules (in order): `ies → y`, `oes → o`, trailing `s` (if not `ss`).

`inputItems` lookup table for cost:

| Verb                | Source                                   |
|---------------------|------------------------------------------|
| Cook / Drink / Bake | `COOKING_INGREDIENTS[item]`              |
| Eat                 | `COOKING_INGREDIENTS[item]` (it's a recipe; the input cost approximates buying instead of cooking) |
| Craft / Make        | `RECIPE_INGREDIENTS[item]`               |
| Grow / Pick / Harvest | `{ [<item> Seed]: 1 }` from `SEED_DATA` |
| Collect Eggs        | `{ Chicken Feed: 1 }` per egg (single feed = one egg per hen) |
| Mine / Chop / Fish / Dig | `null` (tool consumption noisy; not worth approximating) |

When `inputItems` is `null` → `cost` is `null` → efficiency pill hidden.

`current` is read from `farm.farmActivity[activityKey]` (or summed for Fish).
`remaining = max(0, target - (current - chore.initialProgress))`.
`ready = remaining === 0 && !chore.completedAt`.

If the regex matches no pattern, the function returns `{ ready: false, current: null,
remaining: null, target: <count>, cost: null }` — the row still renders with `?/N`
progress and reward only.

### New parsers

Both follow the existing `dashParse*` signature and integrate with
`parseDashboardActions` (`flowers.html:7450`).

#### `dashParseBounties(farm) → action[]`

```
const requests = farm.bounties?.requests || [];
const completedIds = new Set(/* normalize from completed[] which may be [string] or [{id}] */);
for (const req of requests):
  if (completedIds.has(req.id)) continue;
  const input = { [req.name]: 1 };
  const cost = dashP2PCost([{ name: req.name, qty: 1 }]);
  const reward = { coins: req.coins, items: req.items };
  const { rewardText, efficiency } = dashRewardSummary(reward, ticket, cost, rates);
  push {
    category: "Bounty Board",
    icon: "🎯",
    label: `${req.name} → ${rewardText}`,
    detail: cost != null ? `Cost: ${cost.toFixed(2)} SFL` : "Cost: ?",
    efficiency,                  // new field, see "Item render" below
    status: "ready",
    readyAt: 0,
    priority: 21
  }
```

#### `dashParseChores(farm) → action[]`

```
const chores = farm.choreBoard?.chores || {};
for (const [npc, chore] of Object.entries(chores)):
  if (chore.completedAt) continue;
  const parsed = dashChoreParse(chore, farm);
  const cost = parsed.cost;  // already P2P × remaining
  const reward = chore.reward;
  const { rewardText, efficiency } = dashRewardSummary(reward, ticket, cost, rates);
  const progressText = parsed.delta == null
    ? `?/${parsed.target}`
    : `${Math.min(parsed.delta, parsed.target)}/${parsed.target}`;
  push {
    category: "Chores",
    icon: "📜",
    label: `${chore.name}  (${progressText})`,
    detail: `Reward: ${rewardText}` + (cost != null ? ` · Cost: ${cost.toFixed(2)} SFL` : ""),
    efficiency,
    status: parsed.ready ? "ready" : "upcoming",
    readyAt: 0,
    priority: 22
  }
```

Registration in `parseDashboardActions` (after the existing 19 parsers):

```js
actions.push(...dashParseBounties(farm));
actions.push(...dashParseChores(farm));
```

### Item render

Extend `renderItem` (`flowers.html:7532`) to render the efficiency pill on the right
side of the row, below or beside the status badge:

```html
<div class="dash-item ${cls}">
  <span>${item.icon}</span>
  <div class="dash-item-label">
    ${escHTML(item.label)}
    ${detailHtml}
  </div>
  ${item.efficiency ? `<span class="dash-eff dash-eff-${kind}">${label}</span>` : ""}
  ${timeHtml}
</div>
```

where `kind = "ticket" | "net-pos" | "net-neg"`.

### Sort order

Inside each section, when efficiency is computable:
- `ticket` rows sort ascending (lowest `SFL/ticket` first = best deal).
- `net` rows sort descending (highest profit first).

Rows without efficiency fall to the bottom of their section, preserving current order.

Category ordering inside "READY NOW" is updated to surface high-value decisions first:
1. Bounty Board
2. Chores
3. Deliveries
4. (everything else — unchanged)

`Object.entries(cats)` ordering in `renderDashboard` currently relies on insertion
order. The fix is to sort the entries by a small `CATEGORY_PRIORITY` map before
iterating.

## CSS changes

Block: `flowers.html:2272` (existing dashboard CSS).

```css
/* Hierarchy: pixel font stays on titles/badges only */
.dash-item-label { font-family: 'Courier New', monospace; font-size: 0.78rem; }
.dash-item .dash-detail { font-family: 'Courier New', monospace; font-size: 0.70rem; }

/* More breathing room */
.dash-section  { padding: 10px 12px; }
.dash-item     { padding: 6px 4px; border-left: none; }   /* drop the stripe */

/* Efficiency pill */
.dash-eff           { font-family: 'Courier New', monospace; font-size: 0.65rem;
                      padding: 1px 8px; border-radius: 8px; white-space: nowrap; }
.dash-eff-ticket    { background: rgba(232,201,106,0.15); color: var(--sunpetal); }
.dash-eff-net-pos   { background: rgba(46,160,67,0.18);  color: var(--green); }
.dash-eff-net-neg   { background: rgba(220,60,60,0.18);  color: #e55; }
```

Headers (`h1`, `.dash-group-title`, `.dash-section-title`, summary badges) keep
`pixel-font` via existing class assignments — no change.

## Edge cases

| Case | Handling |
|---|---|
| `farm.bounties` missing | Section skipped (parser returns `[]`) |
| `farm.choreBoard` missing | Section skipped |
| Bounty input has no P2P price | Row shown, `Cost: ?`, no pill |
| Chore name doesn't match either regex | Row shown with `?/N` progress, reward only, no pill |
| Chore counter missing in `farmActivity` | Treat as `current = chore.initialProgress` (delta 0); `?/N` progress |
| Chore reward `items: {}` only | Net SFL path; no ticket pill |
| Delivery has only `sfl` reward, no coins/items | Skipped (unchanged from line 7380) |
| `coinsPerSFL` not yet loaded | Net SFL skipped; cost still shown |
| 69 bounties, many identical names | Grouped by category+status+label via existing `dashCollapseItems` (line 7423); identical reward levels collapse, different rewards stay split |
| `bounties.completed` shape is `[{id, ...}]` vs `[string]` | Defensive: normalize to `Set<string>` |

## Out of scope (do not implement)

- Persistence of "ignored" or "completed-by-me" bounties.
- Per-section toggles or filters.
- Chore claim-action integration.
- Bounty/chore data on any non-dashboard page.
- A migration of the rest of the dashboard's body text away from pixel font (only
  `dash-item-label` and `dash-detail` change here; other dashboard text classes stay
  as-is).
- Restyling of pages outside the dashboard.
- Localizing strings.

## Testing & verification

No automated test suite in this project. Manual verification on real farm data
(`Farm #155498`):

1. Dashboard renders new "Bounty Board" and "Chores" sections under "READY NOW" and
   "COMING SOON" as appropriate.
2. At least one Deliveries row shows an efficiency pill. If `dashGetSeasonalTicket`
   returns `null` (current snapshot has no ticket-paying delivery), pill falls back
   to `Net ±SFL` for coin-paying deliveries.
3. Chore "Pick Tomatoes 300 times" shows `READY` (current data: 403 picks since
   `initialProgress`).
4. Chore "Cook Reindeer Carrot 25 times" shows `0/25` upcoming, with
   `Cost ≈ P2P(Carrot × 5 × 25)`.
5. Pixel font appears only on H1, group titles, section titles, and badges. All item
   labels and detail strings render in monospace.
6. No `border-left` stripe on items.
7. Deploy to **preview** first, eyeball on phone width before promoting.

## Files

- `flowers.html` — only source file edited.
- `index.html` — overwritten copy (`cp flowers.html index.html`).
- `/tmp/sfl-flower-tracker/` — both copied per deploy workflow in `MEMORY.md`.

Estimated diff: ~220 LOC added, ~10 LOC modified, all in the dashboard block.

## Open follow-ups (not blocking)

- New seasons may introduce ticket names not in `SEASONAL_TICKETS`. Decision deferred:
  add them when they appear in user data. Graceful fallback already handles it.
- "Eat N X" chores have no `Eaten` counter in `farmActivity`; progress will display
  as `?/N`. This is acceptable — the row still surfaces the chore and its cost.
