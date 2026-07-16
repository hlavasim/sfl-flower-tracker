# ROI vs Login Frequency — Sell-or-Farm Advisor

**Status:** Draft
**Date:** 2026-05-16
**Author:** Šimon (with Claude)

## Motivation

User plays Sunflower Land less actively now and wants to log in 1–2× per day. Many boost NFTs are valuable only if you harvest the underlying resource near its base cycle time (e.g. trees regen every 2h). At low login frequency, the time-reduction component of these boosts is wasted, and even the yield-bonus component may not compensate for the NFT's marketplace value.

The goal: for each resource type, answer "if I sold all NFTs that boost this resource, how many years would I need to farm at my login frequency to recoup the sale value?"

## Out of scope

- Predicting NFT price changes — uses current sfl.world floor price as static input.
- Tax / gas fee on actual marketplace sale.
- Liquidity (whether 12 Iron Beetles can actually sell at floor).
- Suggesting *which* NFTs to acquire (this is a sell-side advisor only).

## Page structure

- New page route: `?page=roi`, rendered by `renderRoi(data)`
- Added to `PAGES` array, navbar label **"ROI"**
- Switch case in main page router (next to `case "nodes": renderNodes(data)`)

### Layout

```
┌───────────────────────────────────────────────────────────┐
│ ROI vs LOGIN FREQUENCY                       Farm #155498 │
│ Sell-or-Farm advisor — if you log in less, are your       │
│ boost NFTs still pulling their weight?                    │
├───────────────────────────────────────────────────────────┤
│ Logins/day: [1] [●2] [3] [4]   Currency: [FLOWER][USD][BTC]│
│ SFL→USD: $0.0928   BTC: $... (cached from coingecko)      │
├───────────────────────────────────────────────────────────┤
│ Main resource table (sortable, default by ROI yrs DESC)   │
│ Click row → expand into per-NFT breakdown + formula       │
├───────────────────────────────────────────────────────────┤
│ Passive boosts section (cooking XP, coins, protection)    │
│ — sale value only, login-frequency-independent            │
└───────────────────────────────────────────────────────────┘
```

### Reused infrastructure

- `nftData` + `p2pPrices` + `exchangeRates` fetch pattern from `renderPower` / `fetchTreasuryData`
- `boostItems` builder logic from `renderPower` (lines ~14118–14221) — **extract into shared `buildBoostItems(data, nftData, p2pPrices)` helper** so both Power and ROI pages call it
- `applyBoosts(catId, product, capacity, ownedEffects)` — returns yield-per-day; will need a sibling `applyBoostsCycle(...)` or expose effective cycle separately (see Algorithm § Step 3)
- `RESOURCE_RESPAWN_DATA` (nodes), `CROP_GROW_DATA`, `FRUIT_GROW_DATA`, `GREENHOUSE_GROW_DATA`, `ANIMAL_CYCLE_DATA`
- `SICKNESS_RATE_BY_LEVEL`, `BARN_DELIGHT_RECIPE` for animal cost modeling
- `marksToSfl()`, `getFactionMarkCost()` for faction-marks items
- Currency conversion: `sfl.usd` from sfl.world exchange API + `btcUsd` from coingecko (already used by Treasury)

### Persisted state

- `localStorage["sfl_roi_logins_per_day"]` — integer 1–4, default 2
- `localStorage["sfl_roi_currency"]` — "flower" | "usd" | "btc", default "flower"
- `localStorage["sfl_roi_multicat_assignment"]` — `{ [nftName]: catId }` mapping

## Categories included

From `POWER_CATEGORIES` (quantifiable only — qualitative go to passive section):

| catId | base cycle source | 1 cycle = |
|---|---|---|
| `trees` | `RESOURCE_RESPAWN_DATA.Wood.respawnSec` (2h) | 1 chop |
| `stone` | Stone.respawnSec (4h) | 1 mine |
| `iron` | Iron.respawnSec (8h) | 1 mine |
| `gold` | Gold.respawnSec (24h) | 1 mine |
| `crimstone` | Crimstone.respawnSec (24h) | 1 mine |
| `obsidian` | Obsidian.respawnSec (72h) | 1 lava pit cycle |
| `oil` | Oil.respawnSec (20h) | 1 drill |
| `crops` | `CROP_GROW_DATA.Wheat` (24h) — hardcoded `ROI_CROP_PRODUCT = "Wheat"` | 1 wheat cycle |
| `fruits` | `FRUIT_GROW_DATA[fruit]` × `FRUIT_HARVEST_COUNT` per plant | 1 regen between harvests |
| `greenhouse` | `GREENHOUSE_GROW_DATA[crop]` (best per login interval) | 1 cycle |
| `flowers` | flower grow time | 1 flower |
| `chickens` / `cows` / `sheep` | 24h | 1 feed→harvest |
| `fishing` | daily limit (~20 fish/day) | daily reset |
| `bees` | honey production rate | 1 honey unit |

Qualitative categories (`cooking`, `coins`, `protection`, `other`) → Passive section.

## Algorithm (per category X, per login frequency L)

### Step 1 — Determine sellable items for X

```js
itemsToSellX = ownedBoostItems.filter(item =>
  item.type !== "Skill" &&
  item.floor > 0 &&
  item.categories.includes(X) &&
  (!item.isMultiCat || multicatAssignment[item.name] === X)
)
saleSflX = sum(itemsToSellX.map(i => i.floor))
```

**Multi-category handling (decided by user):** each multi-cat NFT has one user-chosen "home" category for sale-value attribution. In all OTHER categories it boosts, the NFT is treated as kept — its boost is included in current yield calc and is NOT removed in the "without NFTs" simulation for those other categories. Each category row therefore answers a self-contained "should I sell the NFTs assigned to me?" question. Default assignment: first category returned by `classifyToCategories`. User can change via dropdown in expanded row.

### Step 2 — Effective cycle time with/without sold boosts

```js
allOwnedEffects   = effects from every owned boost item that touches X
soldEffects       = effects from items in itemsToSellX (only those, regardless of other categories)
keptEffects       = allOwnedEffects \ soldEffects  // multi-cat NFTs assigned elsewhere stay

cycleSecKeep = baseCycle × ∏(1 − e.value)  for time-reduction effects in allOwnedEffects
cycleSecSold = baseCycle × ∏(1 − e.value)  for time-reduction effects in keptEffects
```

### Step 3 — Realistic harvests/day at login frequency L

Login interval = `86400 / L` seconds.

**Nodes (trees, stone, iron, gold, crimstone, obsidian, oil, flowers):** each node holds at most one ready resource. Harvests/day per node = `min(86400 / cycleSec, L)`. Time-reduction boosts that shrink cycle below the login interval are wasted (flag with ⏰ icon).

**Crops (Wheat only):** plant immediately on login, harvest next login if grown. Wheat grow = 24h. At L=1, 1 harvest/day/plot. At L≥2, still ~1 harvest/day/plot (wheat doesn't finish faster than 24h unless boosts reduce). Use `applyBoosts("crops", "Wheat", ...)` and assume harvests/day per plot = `min(86400 / cropGrowSec, L)`.

**Fruits:** tree gives `FRUIT_HARVEST_COUNT` harvests with `FRUIT_GROW_DATA[fruit]` regen between. Pick best fruit per `applyBoosts`. Harvests/day/plot = `min(86400 / regenSec, L)` (the stump→regrow part is amortized over harvest count).

**Greenhouse:** similar to crops; pick best product per login interval.

**Animals (chicken/cow/sheep):** 24h cycle. At L≥1, fully utilized (one feed + one harvest per day). Include feed cost and sickness cost in marginal calc (see Step 4).

**Fishing / Bees:** daily output capped by game mechanics (daily fish limit, bee→honey rate), not by login frequency (assuming L≥1). Marginal computed standard: `applyBoosts.unitsPerDay × price`, no harvest-cap multiplication.

### Step 4 — Daily yield in SFL

Refactor or wrap `applyBoosts` so we can get **units per harvest** (not just `unitsPerDay`):
```
unitsPerHarvest = applyBoosts(X, product, capacity, effects).unitsPerDay × cycleSec / 86400
```

Then:
```js
yieldKeep  = unitsPerHarvest(allOwnedEffects)  × harvestsPerDay(cycleSecKeep) × p2pPrice
yieldSold  = unitsPerHarvest(keptEffects)       × harvestsPerDay(cycleSecSold) × p2pPrice
marginal   = yieldKeep − yieldSold
```

**Animal cost adjustment:** subtract feed cost (per `FEED_RECIPES`, `FEED_QTY`) and expected sickness cost (sickness rate × Barn Delight SFL cost × animal count × 365 per year). Sickness-prevention NFTs (Frozen Cow, Healthy Livestock, etc.) modify the probability. Reuse logic from Power page's animal section.

### Step 5 — ROI years

```js
roiYears = saleSflX / (marginal × 365)
```

- `marginal ≤ 0` → verdict **SELL NOW** (NFT is net loss at this play frequency)
- `roiYears < 1` → **KEEP** (recoups in under a year)
- `1 ≤ roiYears < 5` → **MARGINAL** (yellow)
- `roiYears ≥ 5` → **SELL** (green)
- No nodes / no data → **n/a**

## UI details

### Main category table

| Column | Content | Sortable |
|---|---|---|
| ▶ | expand toggle | — |
| Resource | emoji + label | abc |
| NFTs | count of sellable items assigned to this category | num |
| Sale value | in selected currency | num |
| Base cycle | hh:mm before boosts | — |
| Boosted cycle | hh:mm after kept boosts | — |
| Wasted? | ⏰ icon if boostedCycle < loginInterval | bool |
| Δ yield/day | marginal SFL/day in selected currency | num |
| **ROI years** | color-coded: green <1y (KEEP), yellow 1–5y, red ≥5y or ≤0 (SELL — attention) | num |
| Verdict | KEEP / MARGINAL / SELL / SELL NOW / n/a | — |

Default sort: ROI years DESC (worst NFT-to-yield ratio on top = "sell these first").

### Expanded row

Shows three blocks:
1. **NFT list** — name, type, boost text, sale value, multi-cat warning + dropdown to reassign home category.
2. **Other categories also boosted** — info pill listing multi-cat NFTs that boost this category but are sell-attributed elsewhere.
3. **Formula breakdown** — base cycle → boosted cycle, realistic harvests, yield with/without NFTs, marginal, ROI calculation.

### Currency toggle

Toggle stored in localStorage. Pure display-time conversion, no recompute. Conversions:
- FLOWER (= SFL): native unit, no conversion
- USD: SFL × `sfl.usd` from exchange API
- BTC: USD / `btcUsd` from coingecko

### Login slider

`<input type="range" min=1 max=4 step=1>` with tick labels. Real-time recompute on change (debounced 100ms to avoid recompute storms).

### Passive boosts section

Below main table. Items in qualitative categories (`cooking`, `coins`, `protection`, `other`), or items whose categories are entirely outside `QUANT_CATS`. Columns: NFT, Type, Boost text, Sell value. Label: "Login-frequency independent — sell value only."

## Edge cases

1. **Marginal ≤ 0**: NFT actively bad at current login freq → red **SELL NOW** badge.
2. **No nodes on farm** (e.g. `lavaPits = 0` for Obsidian): yield = 0, marginal = 0, ROI = ∞, verdict **n/a**, sale value still shown.
3. **Cycle wasted** (boostedCycle < loginInterval): show ⏰ tooltip "Time-reduction component of boosts unused at your login frequency. Yield-bonus part still active."
4. **Animal sickness NFTs** (Frozen Cow, Healthy Livestock, Oracle Syringe, Medic Apron): marginal = sickness-cost avoided per year, not yield. Use `SICKNESS_EFFECTS` table.
5. **Disabled-by items** (`item.isDisabled`): boost not active → not in `keptEffects` or `soldEffects` for yield calc, but if it's sellable, sale value still counts. Verdict **SELL** (passive box) since no marginal.
6. **Faction marks items**: floor already mapped via `marksToSfl` (existing logic, reuse).
7. **Items with `EXTRA_BOOST_ITEMS` (Beetles, Volcano Gnome) lacking marketplace floor**: skip from sale-value sum if `floor = 0`, but include effect in yield calc.

## Footer

- "Login interval: 12h (2× daily). Realistic harvests for each resource are capped by this frequency."
- "Sale values: floor price from sfl.world marketplace. Real market price may differ."
- Disclaimer: "ROI = payback time at constant marketplace prices. NFT prices fluctuate, FLOWER token is volatile."

## Changelog entry (when deployed)

- **v3.18**: ROI page — sell-or-farm advisor for limited-login playstyle. Computes per-category NFT sale value vs. payback time at user-configured login frequency (1–4×/day). Handles multi-category NFTs via user-assigned home category. Includes passive boost section for login-independent items.

## Open questions / future work

- Should the page also show a "portfolio total" (sum of all category sale values, dedup'd for multi-cat NFTs)? Default: no for v1 — categories are independent decisions.
- Could add a "what if I sold everything" mode that computes net SFL change across all categories simultaneously. Not in v1.
- Best-fruit and best-greenhouse auto-pick assumes user can swap plantings. If user has restock cost constraints (gems), this may overestimate yield. Power page already handles this — we can reuse the same restock cost subtraction.
