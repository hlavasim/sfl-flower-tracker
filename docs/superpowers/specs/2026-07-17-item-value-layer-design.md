# F2-1 — the item value layer: one resolver, two questions

**Date:** 2026-07-17
**Status:** Design — awaiting review
**Author:** Šimon + Claude
**Parent:** `2026-07-16-backend-frontend-compute-split-design.md` (§7 F2+ rollout)
**Follows:** the F1 cooking pilot (complete) and the visibility work (T13 constants, T14 openapi)

## 1. Problem

`flowers.html` prices items with **two independent recursive resolvers** that know different tables
and disagree in production today:

| | `_resolveItemSfl` (`flowers.html:6986-7103`) | `estimateItemSfl` (`flowers.html:23110-23300`) |
|---|---|---|
| size | 119 lines | 192 lines |
| callers | 5 recursive + **1 external** (`roadmapItemCost` `:16686`) | **~29 call sites** — dashboard `:7987`, roadmap `:16687`, marks `:23848`/`:24180`, deliveries `:24628`, pets `:23866`/`:24661`, ROI `:25705` + recursion. Exported globally: `window.estimateItemSfl` (`:23308`) |
| knows | `COOKING_INGREDIENTS`, `FISH_DATA`, `SALT_RAKE_COST` | `RECIPE_INGREDIENTS`, `TOOL_COSTS` |
| shares | `CRUSTACEAN_RECIPES`, `FISH_MARKET_RECIPES`, `COMPOST_RECIPES`, `CRAFTED_INGREDIENT_RECIPES`, `TREASURE_SELL_PRICES` | (same) |
| returns | `{price, source}` \| `null` | `number` (0 = unknown) |
| in `core/`? | **YES** — copied by F1's Task 7 into `core/engine/cooking-cost.mjs` | **NO** |

**Measured live** (same farm, same prices, same instant):

```
Earthworm   _resolveItemSfl=0.008341   estimateItemSfl=0.001098   ×7.6
Salt        _resolveItemSfl=0.006077   estimateItemSfl=0.004182   ×1.45
Tuna        0.61892                    0            (only one prices fish)
Rod         null                       0.087662     (only one prices tools)
Sand Shovel null                       0.073687
Crab Pot    null                       0.406682
Mushroom    null                       0            (neither prices it)
agreeing: Cheese, Honey, Wheat, Crab, Boiled Eggs, Kale Omelette, Sunflower, Wood, Iron, Radish
```

**Whoever asks via the Dashboard gets bait 7.6× cheaper than via the Bumpkin page.** Nobody reported
it because nobody put the two numbers side by side. This is the parent spec §1's disease, still live.

### 1.1 But it is TWO defects wearing one coat — this reframes the fix

Analysis of the branch order (the decisive finding):

- **`_resolveItemSfl`** checks **Salt FIRST, before direct P2P** (`:6991-7002`), deliberately ignoring
  the market price and deriving Salt from the Salt Rake's cost ÷ yield-per-rake.
- **`estimateItemSfl`** checks **direct P2P first** (`:23112`), so it returns the market price.

Verified against the price fixture: market Salt = `0.00416071`; `estimateItemSfl` returned `0.004182`
(the market price, modulo drift) while `_resolveItemSfl` returned `0.006077` (the rake cost).

**So Salt is NOT a bug.** They answer two different questions:
- *"What is this item worth?"* → market price when one exists. (Dashboard, Treasury, ROI.)
- *"What does it cost ME to make?"* → you rake your own Salt and catch your own Tuna, so the market
  price is irrelevant to a cooking cost. (Bumpkin cooking.)

**Earthworm IS a bug.** It has no market price, so BOTH derive it — and they still disagree 7.6×.

Naively "merging the two resolvers" would therefore destroy a legitimate distinction (Salt) while
leaving a real defect (Earthworm) unexamined.

## 2. Goals / Non-goals

**Goals**
- ONE implementation of item pricing in `core/`, with the two questions as **explicit, named entry
  points** — the difference documented rather than emergent from `if` ordering.
- Retire the inline twins: today F1 left `core/` holding a COPY of the niche resolver while every
  other page still calls the inline dominant one. **18 tables are duplicated; 0 have been freed.**
- Every consumer reads one source. The `duplicated` counter in the CONSTANTS tab (`?page=constants`)
  is the acceptance metric: it must fall.

**Non-goals**
- **Fixing the Earthworm disagreement in this work.** It is recorded (correctness register C6) and
  fixed afterwards, against the oracle, as a separate visible change — otherwise numbers move for two
  reasons at once and a migration bug becomes indistinguishable from an intended fix. This rule has
  already paid for itself twice on this project.
- Changing any number. Both entry points must reproduce their current callers' values to the cent.
- Migrating the domains that *call* the resolver (roadmap, ROI, marks, deliveries…). This work gives
  them a correct price source; converting each domain's own maths is a later milestone.

## 3. Constraints (binding)

- **`flowers.html`'s main `<script>` (line ~2800) is NOT a module** — it cannot `import` from `core/`.
  Everything must arrive over the wire. This is the constraint that shapes §4.2.
- **The ~29 call sites are SYNCHRONOUS**, deep inside render functions
  (`const p = estimateItemSfl(ing, p2pPrices, null, rates)`). Making them async is a rewrite of half
  the app's render code — rejected (§4.2).
- **`api/` is at 13 files against a Hobby cap of 12.** Zero new functions: this rides `?section=` on
  the existing `api/compute.mjs`. (Folding `stats` into `track` is a separate deploy prerequisite.)
- No new npm dependencies (the repo has exactly one: `pg`). No database — constants live in code.
- `core/` is DOM-free: no `window`/`document`/`localStorage`/`fetch`.
- **The upstream rate-limits** (`farm fetch failed: 429`). `/api/compute` already makes 2 upstream
  fetches per call; this section must not add more per page load.

## 4. Architecture

### 4.1 `core/engine/item-value.mjs` — one module, two questions

```
itemMarketValue(item, prices)                     -> number        // 0 = unknown
itemProductionCost(item, prices, skills, extras)  -> {price, source} | null
```

- **One** recursive engine and **one** set of tables underneath; the two entry points differ only in
  their documented policy:
  - `itemMarketValue`: market price first; derive from recipes only when the market has none.
  - `itemProductionCost`: derive what YOU pay (rake Salt, cast for fish, craft the rod); consult the
    market only for inputs you must actually buy.
- Both return types are preserved as-is so their existing callers are untouched by the move
  (`estimateItemSfl`'s `0`-means-unknown; `_resolveItemSfl`'s `{price, source}` — the `source` tag
  feeds the Bumpkin cost tooltip and its `fc` fish-breakdown).
- The data tables `estimateItemSfl` needs and `core/data` lacks (`RECIPE_INGREDIENTS` 58 keys,
  `TOOL_COSTS` 11, `DOLL_RECIPES` 23, `FLOWER_RECIPES` 53 — verify at implementation time) move into
  `core/data/` verbatim, as F1 did.

### 4.2 Transport: `?section=prices&farm=<id>` — a precomputed map, not a remote call

The page cannot import `core/`, and its call sites are synchronous. So the server **precomputes every
item's value** and ships two maps; the page does synchronous lookups.

```json
{ "section": "prices", "computedAt": "...", "farm": "155498",
  "data": {
    "marketValue":    { "Salt": 0.00416071, "Tuna": 0.61892, ... },
    "productionCost": { "Salt": 0.00607700, "Tuna": 0.61892, ... }
  } }
```

**Feasibility measured, not assumed:** the reachable item universe is **328 distinct names** across
`COOKING_INGREDIENTS` (84), `RECIPE_INGREDIENTS` (58), `FLOWER_RECIPES` (53), `FISH_DATA` (35),
`CRAFTED_INGREDIENT_RECIPES` (24), `DOLL_RECIPES` (23), `COMPOST_RECIPES` (21), `FISH_MARKET_RECIPES`
(20), `CRUSTACEAN_RECIPES` (16), `TOOL_COSTS` (11), `FISH_TIER_MAP` (10), `FISH_BASE_XP` (10),
`TREASURE_SELL_PRICES` (6), plus the 64 live market entries. **Both maps together ≈ 15 KB.**

Each of the ~29 call sites becomes `PRICES.marketValue[name]` — a lookup. No async ripple.

- `marketValue` is farm-independent; `productionCost` depends on the farm (skills, salt yield, fish
  yield), hence `farm=` is required for it.
- An item the resolver cannot price is **absent** from the map (not `0`), so a consumer can tell
  "unpriced" from "free". Callers that today rely on `0` keep their `|| 0`.

### 4.3 `window.estimateItemSfl` is a seam, not just a function

`flowers.html:23308` exports the resolver globally, and two call sites reach it through `window` with
a feature-detect (`:7982`, `:16687`) rather than lexically. **A lexical find-and-replace will miss
them.** They must be found and converted deliberately.

## 5. Migration order

1. Extract `estimateItemSfl` + its tables into `core/engine/item-value.mjs` VERBATIM; reconcile with
   the already-extracted `_resolveItemSfl` into the two entry points. Both must reproduce today's
   values to the cent — a pinned test per divergence from §1 (Earthworm, Salt, Tuna, Rod, Crab Pot).
2. `?section=prices` serving both maps.
3. Convert the ~29 call sites to map lookups, **one consumer at a time** (dashboard, then roadmap,
   then marks/deliveries/pets/ROI), each verified against the live pre-migration page.
4. Only when a table's LAST inline consumer is gone: delete the inline twin. Gate: the CONSTANTS tab
   `duplicated` counter falls.
5. THEN the audit: Earthworm et al. against the sunflower-land source, as separate commits.

## 6. Verification

- Every step's gate is the live pre-migration page, read **simultaneously** with the API — never a
  number written down earlier (farm 155498 drifts; that method already produced two false alarms).
- **Never derive an expected value by running the code under test.** That mistake shipped a 343k-XP
  bug through a green 62/62 suite on this project.
- Mutation-test every new guard: prove it fails when the thing it guards breaks.
- The CONSTANTS tab is the scoreboard: `duplicated: 18 → lower`, `core: 0 → higher`.

## 7. Risks

- **Size.** ~30 call sites across 6+ domains — twice the whole cooking pilot, whose 6 planned tasks
  became 12 because plan premises did not hold against the code. Expect the same ratio.
- **The two entry points may not cleanly cover every caller.** Some of the 29 may want a third
  policy nobody has articulated. Surface it during step 3 rather than forcing a fit.
- **`productionCost` for unmakeable items** (NFTs, wearables) has no meaning — it returns `null`
  today and must keep doing so.
- **Payload growth**: 15 KB now; if a future table (e.g. `ITEM_IMAGE_MAP`, 1220 lines) lands in the
  item universe, revisit. The map is values-only, so this is unlikely.

## 8. Open questions

1. **Which Earthworm derivation is right?** Deferred to the audit; the oracle is the sunflower-land
   open-source repo. Do not let it leak into the migration.
2. Should `?section=prices` be cached server-side? The upstream already rate-limits us and this adds
   a farm fetch. Probably fold into the wider upstream-load work (server-side cache, retry on
   `fetchFarmData`, an error state instead of a blank page) rather than solving it here.
3. Does any consumer need a price the resolver cannot produce (Mushroom is unpriced by BOTH today)?
   Decide per consumer during step 3, not up front.
