# Backend/Frontend split — unified server-side farm data + compute API

**Date:** 2026-07-16
**Status:** Design — awaiting review
**Author:** Šimon + Claude

## 1. Problem

The app is one ~1.65 MB `flowers.html` with the entire game-economy layer inline — both
the **derivation** of what you own/have (owned NFTs, wearables, collectibles, buds, active
boosts, inventory) **and** the **computations** on top of it (yields, cooking, roadmap,
power, efficiency). The same logic is implemented in more than one place, and the copies
drift apart. The v4.74 cooking bug is the proof: cook time was computed both in the
Bumpkin-page renderer and in the `power-summary` builder, with different recipe sources
(saved recipe vs. live queue) and different XP math — the two disagreed until they were
forced back together by hand.

This is **not only a compute problem.** The *lists* are duplicated too — "which NFTs do I
own", "which boosts do I have and which are active" (`buildRoiBoostItems`, owned-item
detection, `activeShrineEffects`, wearable/collectible parsing) are derived at multiple
call sites, each assembling its own view.

Duplication that exists today (to be inventoried precisely in F0):

- **Owned-entity lists** — owned NFTs / wearables / collectibles / buds, inventory counts,
  animal roster — derived ad hoc per page.
- **Boost lists** — boosts you have and which are active (incl. shrines) — `buildRoiBoostItems`
  + per-site `getEffectsForCategory` / `roadmapOwnedEffects` / `activeShrineEffects`.
- **Cooking** — Bumpkin page render vs. `power-summary` (fixed once, still two call paths).
- **Shrines** — shrines page marginal math vs. `activeShrineEffects` baked into the engine.
- **Efficiency** — Nodes page vs. `roadmapComputeMayEfficiency` (kept "identical" by comment).
- **Yields** — `applyBoosts` / `gameResYield` / `getAnimalCatSfl` called from Power, Roadmap,
  ROI, power-summary with per-site effect-list assembly.

The real defect is **N implementations of each derivation and each calculation**, not
"there is no backend".

## 2. Goals / Non-goals

**Goals**
- Exactly **one canonical implementation** of every derivation *and* every calculation.
- Expose the full farm data layer through a **server-side API** — both **derived lists**
  (owned NFTs, boosts you have / that are active, inventory, animals, buildings) **and**
  **computations** — consumable from elsewhere (external clients that cannot run the app's
  JS).
- Nothing runs in more than one place. The frontend consumes API data (lists and numbers);
  it does not re-derive or recompute.

**Non-goals**
- Keeping the offline PWA. **PWA is being removed** (user does not use it).
- Rewriting the game data tables or changing any numeric result. Behaviour must stay
  identical (verified to the cent against today's output).
- A big-bang rewrite. Migration is incremental, one domain at a time.

## 3. Locked decisions

| Decision | Choice | Why |
|---|---|---|
| Where compute runs | **Server-side** | User wants to call the API from other places; an external consumer can't run client JS. |
| API shape | **One consolidated function** `api/compute` with `?section=` | Vercel Hobby caps at 12 functions and we are at the cap. |
| Offline / PWA | **Removed** | User does not use it; removing it drops the client-side compute + SW entirely. |
| Compute input | `?farm=<id>`; server fetches farm + prices | Callable externally with only a farm ID. |
| Client settings | Optional query params, default to farm state | Saved recipes, Simulate ×1.5, skill-pts override, roadmap settings. |

## 4. Function budget

12/12 functions used. `_db.js` is a shared helper (not a function). Frontend reference
counts: `proxy` 15, `marks-history` 10, `farm-history`(+`power-summary`) 8+5,
`marketplace-orderbook`/`-history` 4/4, `price-history`/`nft-history`/`game-token` 2,
`track` 1, `marketplace-trades`/`farm-diff-agg` 1, **`stats` 0**.

`stats` has 0 frontend references but is a **secret-gated admin analytics endpoint**
(reads `track`'s KV data). It is not dead — it is private. **Reclaim strategy: fold
`stats` into `track.js`** via a `?type=read` branch (write+read of the same KV domain),
mirroring the `power-summary → farm-history?type=` precedent. This frees one slot for
`api/compute` without losing the analytics view.

## 5. Target architecture

```
core/                         ← the single source of truth (Node ESM, no DOM)
  data/         game tables (recipes, crops, animals, shrines, respawn, prices schema)
  derive/       ownership + boosts: owned NFTs/wearables/collectibles/buds, inventory,
                animal roster, buildRoiBoostItems, active shrines/totems
  engine/       applyBoosts, gameResYield, getAnimalCatSfl, computeFoodXP,
                computeCookTime, detectCookingBoosts, roadmap*, shrines, efficiency
  sections/     one composer per API section — LISTS (nfts, boosts, inventory) AND
                COMPUTED (cooking, power, roadmap, …); compute sections consume derive/

api/
  compute.js    GET ?farm=<id>&section=<name>&<settings…>
                → fetch farm (+ prices), run core (derive → engine), return unified JSON
  track.js      + ?type=read branch (absorbs stats)   ← frees a slot
  (stats.js removed)

frontend (flowers.html)
  thin: fetch the API, render lists + numbers. No inline derivation, no inline calculation.
```

The **derive** layer is itself part of the single source of truth: "which boosts are
active" is computed once and feeds every compute section, instead of each page assembling
its own effect list.

Data sources server-side: farm from `api.sunflower-land.com` (server has no CORS
constraint — no proxy needed); prices from the repo's `p2p-prices.json` /
`nfts-latest.json` (bundled) or a refresh job. Settings from query params.

## 6. `api/compute` contract (draft)

- **Request:** `GET /api/compute?farm=<id>&section=cooking`
  - Optional: `recipes=<json>` (saved recipe overrides), `petSimulate=0|1`,
    `skillPts=<n>`, roadmap settings params. Missing → derived from farm state.
- **Response:** `{ farm, computedAt, section, data: { … } }`.
- **List sections:** `nfts` (owned collectibles/wearables/buds), `boosts` (owned + which
  active, incl. shrines), `inventory`, `animals`, `buildings`.
- **Compute sections:** `cooking`, `power`, `roadmap`, `shrines`, `mining`, `efficiency`.
- `section=all` (or a batch param) returns several sections in one round-trip so a page
  fetches once.
- Cooking section returns everything **both** consumers need in one shape: per building
  all recipes (`xp`, `time`, `xpPerHour`, `cost`, `xpPerSfl`), the selected recipe,
  `xpPerCook`, `buildingCount`, `xpPerDay`, banked food XP, pet-streak metadata — so the
  Bumpkin page and power-summary read the identical payload.

## 7. Phasing

Each phase is independently deployable and verified by the Node harness
(`build_harness.py`) plus a to-the-cent diff against current output.

- **F0 — cleanup & prep**
  - Fold `stats` into `track.js?type=read`; remove `stats.js`; free a slot.
  - Kill PWA: remove manifest link (flowers.html:8) + apple-touch-icon; remove SW
    registration (flowers.html:26569); ship a **self-unregistering tombstone `sw.js`**
    (`unregister()` + `caches.delete`) so already-installed clients drop it; remove
    `manifest.json`.
  - Produce the exact duplication inventory (call sites per calculation).

- **F1 — "cooking" pilot, full chain (walking skeleton)**
  - Extract cooking's full dependency closure into `core/` (recipe/data tables,
    `computeFoodXP`, `computeCookTime`, `detectCookingBoosts` and its inputs).
  - `api/compute?section=cooking` runs the core and returns the unified payload.
  - Bumpkin page **and** power-summary switch to consuming that payload; the inline
    cooking calculations are **deleted** from the client.
  - Gate: harness green; Bumpkin cards + power-summary match today's numbers to the cent.
  - This reveals the real cost/tangle of extraction before committing to the rest.

- **F2+ — rollout** — same pattern per domain, both **list** and **compute** sections:
  `boosts` + `nfts` (the derive layer — natural next step since compute already depends on
  it), then `inventory`, `power`, `roadmap`, `shrines`, `mining`, `animals`, `efficiency`,
  `marketplace`. One domain per milestone; delete the client duplicate (list *or* calc) as
  each lands. Endgame: `flowers.html` holds rendering + fetch only.

## 8. Verification

- `build_harness.py` already runs the engine headless in Node — the extraction formalises
  what it does. Each extracted `core/` module gets a direct Node test.
- Every migration is diffed to the cent against the pre-migration output for the live
  farm (155498). A phase is not done until the harness would **fail** if the old and new
  numbers diverged.
- `typecheck`/`lint`: none configured today (state this in each PR).

## 9. Risks

- **Dependency tangle** — `detectCookingBoosts` (skills/wearables/collectibles/season/pet
  streak) may pull a large closure. F1 exists to surface this early; if it is worse than
  expected, we re-scope before committing to F2+.
- **`localStorage` settings** — saved recipes, Simulate toggle, skill-pts override live in
  the browser. They move to explicit API params with farm-state defaults; the frontend
  passes them on each call.
- **Prices freshness** — server-side prices come from bundled JSON that goes stale; a
  refresh path is needed (out of scope for F1, noted for F2+).
- **Function cap** — only one slot is being freed. If future needs exceed one function,
  consolidate further via `?section=`/`?type=` rather than adding files.

## 10. Open questions

1. Prices server-side: bundled JSON (simple, stale) vs. a scheduled refresh into KV. F1
   can use bundled; decide before F2+.
2. Whether `flowers.html` stays one file or is split once it is thin (cosmetic; defer).
