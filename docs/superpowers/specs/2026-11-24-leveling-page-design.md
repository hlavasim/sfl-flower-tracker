# LEVELING page — design (2026-11-24)

## Intent
The owner wants to reach the end of ascension 5 (A5 L50 = A6 L1 threshold, 694.33 M XP) as
**cheaply** as possible and to see, before spending anything, what each choice does to *how long*
it takes and *what it costs in FLOWER*. Today this needs a hand-made simulation (scratchpad
`sim3.py`, 2026-11-24). The page makes it permanent, live and clickable.

## Goals
- A configurator: any combination of
  - cooking buildings on/off (Fire Pit, Kitchen, Bakery, Deli, Smoothie Shack) and the recipe in each
    (default: highest XP/day at the chosen restarts/day);
  - fish route: age fish (salt-limited) on/off, eat the rest raw on/off, reels/day,
    "big fish via Fish Market baits" on/off;
  - restarts per day (how often the owner gets to the farm);
  - target (default end of A5; any ascension / level).
- Result, recomputed live on every click: days to target, FLOWER total (running cost + NFT
  resale loss), XP/day split (kitchens / aging / raw fish), the bottleneck (salt, slots, fish).
- A catalogue of everything the farm does NOT have that moves the result, grouped
  **Rybolov / Sůl / Stárnutí / Vaření**: NFTs (collectibles + wearables), buds (Port, Sea), skills
  and skill ranks. Each row: price (floor), loss if resold (floor − best bid), **impact** (Δ days,
  Δ net FLOWER to target, toggled alone on top of the current configuration) and a checkbox.
  Ticking a row treats the item as owned and recomputes everything.
- Everything the owner clicks is saved and comes back after a refresh, on every device.

## Non-goals
- XP from deliveries, chores, pets or anything other than eating cooked / aged / raw fish.
- Buying advice beyond the arithmetic; no trades are executed.
- Exact fish-species prediction (a measured mix is used).

## Anti-goals
- A second copy of the cooking / salt / fishing maths in the page (page engine rule: core only).
- Pricing caught fish as "targeted" catches (`fishAsCaught` route) — the plan eats or ages
  whatever is caught, so a fish costs a share of the **cast** (rod + worm), not cast / probability.
- Hitting the prod API on every click (Postgres slots; all toggles recompute client-side).

## Constraints / facts established in the conversation
- Aging XP is fixed by **salt**: every fish gives ~230 aged XP per salt (aged max XP / 50 = salt).
  Big fish save slot restarts, not XP. One fish per slot; 6 slots at Aging Shed level 6.
- Fishing needs a bait per cast (castRod "Missing bait"), but a worm from the composter is
  ~0.006 FLOWER; a rod ~0.075 FLOWER (Reel Deal). Guaranteed baits (Fish Flake / Stick / Oil /
  Crab Stick) let the owner pick the catch from GUARANTEED_CATCH_BY_BAIT; their recipe is seasonal
  (fishProcessing.ts) and consumes caught fish that would otherwise be eaten raw.
- Port bud: ×(1 + aura × 0.1) on every FISH_CONSUMABLES food incl. aged fish; only the best bud
  counts (getBudExperienceBoosts). Sea bud: +0.1 × aura fish per cast (bud yield, best bud only).
- Double Nom doubles ingredients (cost × 2 per cook).
- Kitchens alone (owner, 6 restarts): 1.15 M XP/day, 39 FLOWER/day ≈ 34 FLOWER per 1 M XP.

## Approaches (picked: A)
- **A — one core function, run on the server AND in the page (TICKETY pattern).** `section=leveling`
  returns the inputs + default result; the page re-runs the same exported core function on each
  toggle. Live, no extra API calls, page and server cannot disagree.
- B — API call per toggle: slow, burns DB connections (memory: tracker API DB slots).
- C — page-only maths: breaks the "core only" rule.

## The how (decided)
- **What-if farm.** The page clones the farm and applies the ticked catalogue rows (place a
  collectible, equip a wearable, add a skill / rank, add a placed bud of the given type/aura), then
  runs the existing core functions on the clone: `buildCookingSection` (XP, cook time, amount,
  recipe cost, Aging Shed per-fish XP incl. Prime chance), `computeFishYieldPerCast`, the salt model
  of `side-values.mjs` (`saltParams` / `saltHarvests`, yield per rake), rod / worm cost from
  `item-value.mjs`. Gaps found in the engine (e.g. Port bud XP or Astrolabe +5 % not in
  `detectCookingBoosts`) are fixed **in the engine**, game-faithful, so the Bumpkin page gains too.
- **Model** (from `sim3.py`):
  - need = target XP − experience − banked food XP;
  - kitchens: per enabled building, cooks/day = min(86400 / cook time, restarts) × count;
    XP = xp × amount × cooks; cost = recipe cost × (Double Nom ? 2 : 1) × cooks;
  - fish/day = reels × fish-per-cast; mix and fish-per-cast from the farm's lifetime
    `farmActivity` "<Fish> Caught" / "Rod Casted" counters, plus the what-if yield delta;
  - salt/day = harvests × yield per rake (side-values salt model, measured eff when available);
  - aging: greedy by (aged − raw) XP, limited by salt, slot-hours and the restart gap
    (a fish occupies its slot for max(aging time, 24 h / restarts)); the rest is eaten raw;
  - baits on: fill aging with the best big fish reachable by a bait, charging the bait's input fish
    (their raw XP lost) and its casts;
  - cost = kitchens + casts × (rod + worm) + rakes (unless Ascended Idol) + NFT resale loss.
- **Catalogue** = a curated list in `core/data/leveling-items.mjs` (name, group, kind
  collectible|wearable|skill|bud, how to apply), covering fishing / salt / aging / cooking boosts the
  engine knows. Only rows the farm does not have are shown. Prices: floor from the NFT feed, best bid
  from `/api/marketplace-orderbook?book=1`; no bid → 15 % below floor; untradeable items (chapter
  rewards, Fish Trap until 2027-02-01) shown as "nelze koupit" but still tickable. Skills show their
  point cost and the farm's free points (power `skillCostInfo`); ticking past the free points is
  allowed with a warning.
- **Persistence**: one localStorage key `sfl_leveling` (JSON: target, restarts, buildings+recipes,
  fish options, ticked rows), added to `prefSyncKeys` so it syncs through `farm_prefs`.
- **Page**: `?page=leveling`, nav button, Czech UI, cards side by side on PC / stacked on mobile,
  catalogue as a table with per-group headers; changelog entry + version bump.
- **Tests** (`tests/core/leveling.test.mjs`): need-XP maths, salt-limited aging cap, kitchens cost
  with Double Nom, what-if toggles change results (Walrus raises fish, Surfer Hair halves salt per
  fish, Port bud ×1.1 fish XP), catalogue hides owned items, api-spec lists the section.

## Left to the builder
- Exact catalogue contents (start from power `boostItems` in categories fishing / salt / aging / xp
  plus the cooking time / XP / amount boosts of `detectCookingBoosts`).
- How the bait route picks fish per season (cheapest bait per aged XP is fine).
- Layout details within the sketch agreed in chat.
