# Bumpkin XP Calculator — Recipe Cost & Fish Pricing

**Date:** 2026-04-27
**Status:** Draft
**Page affected:** `?page=bumpkin` in `flowers.html`

## Goal

The Bumpkin page currently ranks cooking recipes by XP/hour. It does not account for ingredient cost, so a player can't see which recipes are resource-efficient. This change adds:

1. Complete ingredient maps for all 84 recipes (currently only ~50 have ingredient data, used by skill-cost calc).
2. A model for **fish ingredient cost** (rod + bait + optional chum + probability).
3. A new sort mode and cost display in the recipe selector and detail card.

Cost is denominated in **SFL** using P2P market prices, consistent with every other cost calculation in the app (treasury, nodes, animals, skills).

## Non-goals

- No marketplace integration / live cost updates beyond the existing P2P price feed.
- No tracking of how many of each fish/ingredient the player owns (already shown in inventory elsewhere).
- No suggestion engine ("you should switch to recipe X"). Just expose the data; player decides.
- No fish probability tables per location/season — one representative probability per fish.

## Data additions

### 1. Bring `COOKING_RECIPES_DATA` and `RECIPE_INGREDIENTS` to parity with sfl.world

Two-step:

**1a.** Fetch sfl.world/info/cooking. For each food not already in `COOKING_RECIPES_DATA` (~line 1816), add a row with `{ building, xp, cookSec, usesHoney }`. New foods released since the last code update land here.

**1b.** Extend `RECIPE_INGREDIENTS` (~line 2273) so every entry in `COOKING_RECIPES_DATA` has a matching ingredient map. Today only ~50 of 84 foods have ingredient data; the gap includes:

- Fish recipes: Fish Burger, Fish Omelette, Fried Calamari, Sushi Roll, Ocean's Olive, Fish n Chips, Seafood Basket, Chowder, Fermented Fish
- Other crops/cooking: Reindeer Carrot, Mushroom Soup, Beetroot Blaze, Bumpkin Roast, Goblin Brunch, Mushroom Jacket Potatoes, Cabbers n Mash, Rapid Roast, Gumbo, Shroom Syrup, Bumpkin ganoush, Bumpkin Detox, Cheese (recipe = Milk×3, already in `CRAFTED_INGREDIENT_RECIPES`)

### 2. New `FISH_DATA` constant

```js
const FISH_DATA = {
  "Anchovy":      { tier: "basic",    prob: 0.20, guaranteedBait: "Earthworm", guaranteedChum: "Sunflower",   guaranteedChumQty: 50 },
  "Tuna":         { tier: "advanced", prob: 0.10, guaranteedBait: "Grub",       guaranteedChum: "Apple",        guaranteedChumQty: 5  },
  // ...
};
```

Only fish referenced by recipes are included (~10–15 rows). `prob` = the highest probability of catching this fish across all locations/seasons (i.e., best-case for the player). If `guaranteedBait`/`Chum` is null, only the probabilistic path applies.

### 3. New `BAIT_RECIPES` constant

Compost-derived recipes for bait. Price computed at runtime from sub-ingredients (same pattern as `CRAFTED_INGREDIENT_RECIPES`):

```js
const BAIT_RECIPES = {
  "Earthworm":    { /* compost recipe */ },
  "Grub":         { /* ... */ },
  "Red Wiggler":  { /* ... */ },
  "Fishing Lure": { /* ... */ },
};
```

### 4. Rod cost

```js
const FISHING_ROD_COST = { coins: 50, materials: { Wood: 1 } };
```
- Convert coins → SFL via existing `coinsPerSFL_betty`.
- Apply `Reel Deal` skill (-50%) if owned.
- 1 rod consumed per cast (matches game logic).

## Cost formulas

### Fish effective cost (per 1 fish caught)

```
guaranteedCost = bait_sfl + (chum_sfl × chumQty)   // ∞ if no guaranteed combo
probCost       = bait_sfl / prob                   // expected casts × bait
effectiveCost  = min(guaranteedCost, probCost) + rod_sfl
```

`bait_sfl` and `chum_sfl` are looked up at runtime: `BAIT_RECIPES`-derived for bait, P2P for chum. If a chum item is missing from P2P, the guaranteed path is treated as ∞ for that fish (probabilistic falls through).

### Recipe cost (per 1 cook)

```
recipeCost = Σ ingredient_qty × ingredient_price_sfl
ingredient_price_sfl =
  FISH_DATA[name]                ? fishEffectiveCost(name) :
  CRAFTED_INGREDIENT_RECIPES[name] ? derivedPrice(name)    :
  p2pPrices[name]                ?? null   // null = "no data"
```

If any ingredient resolves to `null`, the whole recipe's cost is `null` (not 0). The recipe is excluded from the "XP per SFL" sort and displays `Cost per cook: —`.

### XP/SFL ratio

```
xpPerSfl = boostedXP / recipeCost   // boostedXP comes from existing computeFoodXP
```

`boostedXP` already includes pet streak, Munching Mastery, Drive-Through Deli, etc. — reuse the existing helper.

## UI changes (renderBumpkin)

### Sort toggle

New row above the building grid:

```
SORT: [XP/hour] [XP per SFL] [SFL/cook]
```

Active button highlighted. Selection persisted in `localStorage["sfl_bumpkin_sort"]`. Default: `xpPerHour`.

### Recipe `<select>` option label

Shows primary metric (selected sort) and one secondary:

| Sort           | Label                                          |
|----------------|------------------------------------------------|
| `xpPerHour`    | `Pizza Margherita (1,250 XP/h, 12.4 SFL/cook)` |
| `xpPerSfl`     | `Pizza Margherita (2,016 XP/SFL, 1,250 XP/h)`  |
| `sflPerCook`   | `Pizza Margherita (12.4 SFL/cook, 25k XP)`     |

Recipes with `null` cost show `(— SFL/cook)` and sort last in cost-based modes.

### Selected recipe detail card

Add to the existing block:

```
Cost per cook:  12.4 SFL
XP per SFL:     2,016
Ingredients:    [🍅] 30 Tomato  [🧀] 5 Cheese  [🌾] 20 Wheat
```

Icons via `getItemIcon()`. Wraps to next line on mobile.

For fish ingredients, render the badge as `[🐟] 1 Anchovy` and append a small line below the ingredients row: `Anchovy: cheapest path = Earthworm + 50 Sunflower chum (1.2 SFL)`. Listed for each fish in the recipe.

### Building card unchanged otherwise

`XP/day`, day count to target, building totals — all preserved.

## Edge cases

- **Recipe with unknown cost** (any ingredient has no P2P price) — sort to bottom in cost modes; detail shows `—` for cost and ratio.
- **Fish with neither guaranteed combo nor probability data** — same as above (effective cost is `null`).
- **`coinsPerSFL_betty` is 0 or unavailable** — rod cost falls back to 0 (negligible vs bait/chum).
- **Player has Reel Deal skill** — rod_sfl × 0.5. Detected from `bumpkin.skills`.
- **Player has Cheese in `CRAFTED_INGREDIENT_RECIPES`** — already handled; just generalize to other crafted items if added later.

## Implementation order

1. Extend `RECIPE_INGREDIENTS` to all 84 recipes.
2. Add `FISH_DATA`, `BAIT_RECIPES`, `FISHING_ROD_COST` constants.
3. Add `computeFishEffectiveCost(name, prices, skills)` helper.
4. Add `computeRecipeCost(recipeName, prices, skills)` helper (returns `null` if any ingredient missing).
5. Generalize `calcSkillPointCost` to use the new helper (replace hardcoded "Pizza Margherita").
6. Modify `renderBumpkin`:
   - Read `sfl_bumpkin_sort` from localStorage.
   - Compute `recipeCost` and `xpPerSfl` per recipe in the existing loop.
   - Sort by selected mode.
   - Render sort toggle, updated `<option>` labels, detail card extensions.
7. Verify: pick a recipe with known ingredients (Pizza Margherita), confirm SFL cost matches the existing skill-cost calc.

## Files touched

- `flowers.html` — only file. All changes are additions to existing constants and the `renderBumpkin` function.
- Deploy to `/tmp/sfl-flower-tracker/` via Python patch script (Windows `/tmp` path bug — see CLAUDE.md).

## Verification

1. P2P prices loaded → recipe cards show SFL cost
2. Pizza Margherita cost matches skill-cost calc (sanity check)
3. Sort toggle changes recipe ordering correctly
4. Recipe with fish (Sushi Roll) shows fish-cost breakdown in detail card
5. Recipe with missing ingredient (e.g., a hypothetical untracked item) shows `—`
6. Player with Reel Deal skill sees lower fish recipe costs
