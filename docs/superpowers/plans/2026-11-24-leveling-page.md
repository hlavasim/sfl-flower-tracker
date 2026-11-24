# LEVELING page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `?page=leveling` configurator that shows days and FLOWER to a target ascension level for any mix of kitchens, fish aging / raw eating, baits, and NFTs / buds / skills the farm does not own, recomputed live and saved.

**Architecture:** One pure core function (`levelingPlan`) plus a what-if farm builder (`applyWhatIf`) and a catalogue; the server serves `section=leveling` (inputs + default result), the page re-runs the same exported functions on every click (TICKETY pattern). Engine gaps are fixed in `core/engine/cooking.mjs`.

**Tech Stack:** Node ESM (`core/*.mjs`), `node:test`, single-file page `flowers.html`, Vercel function `api/compute.mjs`.

**Spec:** `docs/superpowers/specs/2026-11-24-leveling-page-design.md`

## Global Constraints
- Page engine rule: the page carries no copy of core maths; it imports from `core/browser-engine.mjs`.
- `api/*.js` must import core `.mjs` dynamically (memory: static import caused a 7-min outage) — follow the existing pattern in `api/compute.mjs`.
- UI text Czech; UI consts lowerCamelCase in flowers.html.
- Caught fish cost a share of the cast: `(rod + Earthworm) / fishPerCast`, never the `fishAsCaught` targeted price.
- No bid → resale loss = 15 % of floor. Untradeable rows: price `null`, label "nelze koupit", still tickable.
- Commit only when `npm test` output contains `# fail 0`. Deploy only on the owner's "nasaď".
- Repo is public: no wallet addresses or personal data in code, tests or docs.

## Review Focus
1. Farm without an Aging Shed / without salt nodes / without a building → those parts read 0, no NaN, no throw (test in Task 3).
2. Target already reached (experience ≥ target) → `days: 0`, cost 0 (test in Task 3).
3. All kitchens and fish off → `xpPerDay: 0`, `days: Infinity`, page shows "nikdy" (test in Task 3).
4. Stored `sfl_leveling` with an item/recipe name that no longer exists → ignored, page still renders (test in Task 2: `applyWhatIf` skips unknown names; Task 5 sanitises config).
5. Ticking an item the farm already owns (state from another device) → no double count (test in Task 2).

---

### Task 1: Engine gaps — Winged Vase, Fish Smoking ranks, Astrolabe

**Files:**
- Modify: `core/engine/cooking.mjs` (`getAgingPrimeChance` ~l.11, aged-fish XP in `detectCookingBoosts` / `computeFoodXP`)
- Test: `tests/core/cooking-engine.test.mjs`

**Interfaces:**
- Produces: `getAgingPrimeChance(farm)` now = (10 % × Fish Smoking rank mult [2,3,4]) + 4 if Salt Sculpture ≥ 2 + 14 if Winged Vase placed, capped at 1.0; an xpBoost `{ name: "Astrolabe (+5% Aged Fish XP)", multiplier: 1.05, agedOnly: true }` applied only to `Aged …` / `Prime Aged …` foods.

- [ ] **Step 1: Failing tests** `aging prime chance counts Winged Vase and Fish Smoking rank` — fixture with Fish Smoking 1 + sculpture 6 → 0.24; + Winged Vase → 0.38; Fish Smoking rank 2 → 0.34 without vase. `Astrolabe adds 5 % to aged fish only` — `computeFoodXP("Aged Tuna", …)` ×1.05 with Astrolabe placed, `computeFoodXP("Tuna", …)` unchanged.
- [ ] **Step 2:** `npm test -- tests/core/cooking-engine.test.mjs` → FAIL.
- [ ] **Step 3:** Implement (ranks via `_rankOf` pattern from `cooking-cost.mjs`; game refs `agingFormulas.ts getPrimeAgedChance`, `boosts.ts:328`).
- [ ] **Step 4:** `npm test` → `# fail 0`.
- [ ] **Step 5:** Commit `fix(aging): Winged Vase, Fish Smoking ranks and Astrolabe in aged fish XP`.

### Task 2: Catalogue + what-if farm

**Files:**
- Create: `core/data/leveling-items.mjs`, `core/engine/leveling-whatif.mjs`
- Test: `tests/core/leveling.test.mjs`

**Interfaces:**
- Produces: `LEVELING_ITEMS: Array<{ name, group: "fishing"|"salt"|"aging"|"cooking", kind: "collectible"|"wearable"|"skill"|"bud", rank?: number, budType?: "Port"|"Sea", tradeable: boolean, boost: string }>` — at least: fishing Walrus, Alba, Pink Dolphin, Jellyfish, Poseidon, Super Star, Nautilus, Deep Sea Slug, Bubble Aura, Port bud, Sea bud, More With Less, Fisherman's 5/10 Fold ranks; salt Salt Worker Gnome, Ascended Idol, Salty Seas / Wide Rakes / Sea Blessed / Salt Surge / Cheap Rakes ranks; aging Surfer Hair, Winged Vase, Astrolabe, Fish Trap (tradeable false), Speedy Aging, Fish Smoking, Ager ranks; cooking Golden Spatula, Pan, Observatory, Blossombeard, Grain Grinder, Luna's Hat, Desert Gnome, Nightshade Medallion, Master Chefs Cleaver, Giant Truffle (tradeable false), Fast Feasts, Frosted Cakes, Double Nom, Juicy Boost, Drive-Through Deli, Munching Mastery, Fiery Jackpot.
- Produces: `applyWhatIf(farm, tickedNames: string[]) -> farm` (deep clone; collectible → `collectibles[name] = [{ coordinates:{x:0,y:0} }]`, wearable → added to a synthetic farm hand's `equipped`, skill → `bumpkin.skills[name] = rank`, bud → new placed bud id `"whatif-<type>"` aura `"No Aura"`); unknown names skipped. `ownedLevelingItems(farm) -> Set<string>` (uses `hasItem`, skill ranks, placed buds by type).

- [ ] **Step 1: Failing tests** `applyWhatIf places Walrus and computeFishYieldPerCast rises by 1`; `applyWhatIf Port bud → detectCookingBoosts has "Port Bud (Fish XP)" ×1.1`; `skill rank tick raises Salty Seas to rank 2`; `unknown name ignored`; `already-owned item not duplicated (findCollectible length unchanged)`; `ownedLevelingItems(fixture farm-155498) contains "Otty the Otter" and "Wide Rakes"`; original farm object not mutated.
- [ ] **Step 2:** run → FAIL. **Step 3:** implement. **Step 4:** `npm test` → `# fail 0`.
- [ ] **Step 5:** Commit `feat(leveling): catalogue and what-if farm`.

### Task 3: The plan model

**Files:**
- Create: `core/sections/leveling.mjs`
- Test: `tests/core/leveling.test.mjs`

**Interfaces:**
- Consumes: `applyWhatIf`, `LEVELING_ITEMS`, `ownedLevelingItems`; `buildCookingSection` (`core/sections/cooking.mjs`), `computeFishYieldPerCast`, `computeRodCostSFL`, `computeBaitCostSFL` (`item-value.mjs`), `sideSaltNow` + `sideState` (`side-values.mjs`), `ascensionXpFor` (`ascension.mjs`), `getAgingMaxXP` / `getAgingSaltCost` / `FISH_BASE_XP` (`data/cooking.mjs`), `GUARANTEED_CATCH_BY_BAIT` + fish-processing recipes (add `core/data/fish-processing.mjs` from game `fishProcessing.ts` / `fishing.ts` if the tracker has no copy).
- Produces:
  - `defaultLevelingConfig(farm, inputs) -> Config` where `Config = { target:{ascension,level}, restarts:6, buildings:{[name]:{on:boolean, recipe:string}}, fish:{age:true, eatRaw:true, reels:number, baits:false}, ticked:string[] }`; defaults: target {5,50}, every owned building on except Smoothie Shack, recipe = best XP/day at `restarts`, reels = farm daily limit (port of `getDailyFishingLimit`: 20 + Angler Waders 10, Reelmaster's Chair 5, Nautilus 5, Deep Sea Slug 5, Otty 5, Saw Fish 5, Fisherman's 5 Fold [5,7,10], 10 Fold [10,18,25], More With Less [10,25,50]).
  - `levelingPlan(farm, inputs, config) -> { needXp, xpPerDay:{kitchens,aging,raw,total}, costPerDay, days, totalFlower, nftCost, resaleLoss, bottleneck:"salt"|"slots"|"fish"|null, buildings:[{name,recipe,xpPerDay,costPerDay,cooksPerDay}], fish:{perDay,aged,raw,saltUsed,saltPerDay,baitsPerDay} }`; `inputs = { prices, coinsPerSFL, floors:{[name]:number}, bids:{[name]:number}, budFloors:{Port:number,Sea:number}, now }`.
  - `itemImpacts(farm, inputs, config) -> Array<{ name, group, kind, price, loss, dDays, dFlower, owned:false, ticked:boolean, pointCost? }>` — each untouched row toggled alone vs `config`; sorted by `dFlower` desc within group.
- Model rules (spec "Model"): kitchens `cooks = min(86400/time, restarts) × count`, cost × 2 with Double Nom; fish/cast and species mix from lifetime `farmActivity["<Fish> Caught"]` / `["Rod Casted"]`, plus `computeFishYieldPerCast(whatIf) − computeFishYieldPerCast(farm)` (tier-weighted); aging greedy by (aged − raw) XP, limits salt/day, `6 × 24` slot-hours (Aging Shed level, max 6), occupancy `max(agingHours, 24/restarts)`; raw XP = aged XP / prime factor / (maxXP/base); baits: replace aged picks with the highest-XP fish of each bait's `GUARANTEED_CATCH_BY_BAIT` list, charge the current season's recipe fish (lose their raw XP) and one cast each, inputs ÷ 1.2 with Bubble Aura (20 % chance +1 bait); cost/day = kitchens + reels × (rod + Earthworm) + salt harvests × rake (0 with Ascended Idol); `days = needXp / total` (0 if needXp ≤ 0, `Infinity` if total = 0); `totalFlower = costPerDay × days + resaleLoss`.
- [ ] **Step 1: Failing tests** with `tests/fixtures/farm-155498.json` + `p2p-prices.json`:
  - `need XP = A5 L50 − experience − banked food XP`;
  - `kitchens only: Deli off lowers xpPerDay and leaves cost per XP lower or equal` (Deli is the cheapest per XP on this farm);
  - `aging is salt-limited: halving salt per fish (Surfer Hair) raises aging XP and saltUsed ≤ saltPerDay`;
  - `slots limit: restarts 1 ages fewer fish than restarts 12`;
  - `Walrus raises fish.perDay by reels and does not raise cost/day`;
  - `target already reached → days 0, totalFlower 0`;
  - `everything off → days Infinity`;
  - `farm without Aging Shed and salt nodes → aging 0, no NaN`;
  - `itemImpacts hides owned items and marks Sea bud dFlower < 0 for this farm`.
- [ ] **Step 2:** run → FAIL. **Step 3:** implement. **Step 4:** `npm test` → `# fail 0`.
- [ ] **Step 5:** Commit `feat(leveling): plan model`.

### Task 4: API section + engine export

**Files:**
- Modify: `api/compute.mjs` (new `else if (section === "leveling")` next to `tickets`), `core/api-spec.mjs` (enum + summary), `core/browser-engine.mjs` (export `levelingPlan`, `itemImpacts`, `defaultLevelingConfig`, `applyWhatIf`, `LEVELING_ITEMS`, `buildCookingSection`)
- Test: `tests/core/api-spec.test.mjs` (existing diff test must pass), `tests/core/leveling.test.mjs`

**Interfaces:**
- Produces: `GET /api/compute?farm=<id>&section=leveling` → `{ farm, computedAt, section, data: { inputs, config, plan, impacts } }`; `inputs.floors` from `fetchNfts()`, `bids` `{}` (the page fills them from `book=1`).
- [ ] **Step 1:** test `section enum lists leveling` (api-spec test picks it up). **Step 2:** FAIL. **Step 3:** implement (dynamic import as the other sections). **Step 4:** `npm test` → `# fail 0`; `node -e` smoke calling the handler with the fixture if the existing tests have a harness, else skip. **Step 5:** Commit `feat(leveling): compute section`.

### Task 5: The page

**Files:**
- Modify: `flowers.html` — `PAGES` (l.~2713) add `"leveling"`, nav `{ id: "leveling", label: "📈 LEVELING" }` (near l.~5328), `renderLeveling()`, prefSyncKeys add `"sfl_leveling"` (l.~30271), changelog entry under the next version.
- Test: `tests/core/leveling-page.test.mjs` (page-engine harness as in `prefs-sync.test.mjs`)

**Interfaces:**
- Consumes: Task 4 exports and the `book=1` fetch already in the page (l.~16494).
- Layout (Czech): header with target select (A1–A10 × level), restarts input; KUCHYNĚ rows (checkbox + recipe select per building, recipe options sorted by XP/day); RYBY (stárnout, zbytek sníst, reelů/den, návnady); three result cards (Kuchyně jen / tvoje nastavení bez NFT / tvoje nastavení) with days, FLOWER, XP/day, bottleneck — side by side ≥ 900 px, stacked below; catalogue table per group (RYBOLOV / SŮL / STÁRNUTÍ / VAŘENÍ): checkbox, název, cena, ztráta při prodeji, dopad (−dní, ±FLOWER), skills show "body: n (volné: m)" and ⚠ when the ticked skills exceed the free points (`skillCostInfo.freePoints` from section=power, passed in `inputs.freePoints`), owned rows hidden. Every change: update config → `localStorage.setItem("sfl_leveling", JSON)` → recompute → re-render.
- Stored config sanitised on load: drop unknown buildings / recipes / ticked names, clamp restarts 1–48 and reels 0–500.
- [ ] **Step 1: Failing tests** `config round-trips through sfl_leveling`; `stale stored names are dropped`; `"sfl_leveling" in prefSyncKeys`; `PAGES includes leveling`.
- [ ] **Step 2:** FAIL. **Step 3:** implement. **Step 4:** `npm test` → `# fail 0`.
- [ ] **Step 5: Browser check** — `preview_start sfl-dev-server`, open `?page=leveling`: default shows ~356 days kitchens-only for the owner farm, ticking Surfer Hair changes days without a reload, refresh keeps ticks, mobile width (375) stacks cards, no console errors. Screenshot.
- [ ] **Step 6:** Commit `feat(leveling): LEVELING page`. No version bump / index.html copy until "nasaď".
