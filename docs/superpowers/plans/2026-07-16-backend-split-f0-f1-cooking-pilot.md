# Backend split — F0 cleanup + F1 cooking pilot — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Free one Vercel function slot and remove the PWA (F0), then prove the whole server-side architecture end-to-end on ONE domain — cooking — by extracting its logic into a DOM-free `core/`, serving it from `api/compute?section=cooking`, and deleting the two client-side duplicates (F1).

**Architecture:** A single `core/` (Node ESM, no DOM) holds the canonical derivation + computation. `api/compute.js` fetches the farm, runs `core/`, returns JSON. The frontend fetches that JSON instead of computing. F1 does this for cooking only; F2+ (separate plans) roll the pattern out.

**Tech Stack:** Node ESM (Vercel serverless, `export default`), plain `node --test` for unit tests, existing `build_harness.py` for the frontend regression, Python patch-scripts for surgical edits to `flowers.html`.

## Global Constraints

- **Vercel Hobby = 12 serverless functions max.** `api/*.js` is a function; `_db.js` and files under `core/` are NOT (only files directly in `api/` are functions). Net function count must not increase: `api/compute.js` (+1) is paid for by removing `api/stats.js` (−1).
- **No numeric result may change.** Every migrated number must match the pre-migration output for live farm **155498** to the cent, proven by a diff test.
- **BMP characters only in patch scripts.** Astral emoji → lone surrogate → `io.open('w').write()` truncates the file to 0 bytes. Use `\uXXXX` escapes; never paste raw emoji into a `.py` patch.
- **Patch scripts assert `t.count(anchor) == 1`** before replacing, and write with `io.open(P,'w',encoding='utf-8',newline='')`.
- **Deploy flow unchanged:** patch `flowers.html` → `cp flowers.html index.html` → copy both to `/tmp/sfl-deploy/` → bump `CACHE_NAME` in `sw.js` → commit → push (needs `hlavasim` gh account). Bump the footer version each deploy.
- **`localStorage` is browser-only.** In `core/` (Node) it does not exist. Client settings (`sfl_pet_streak`, `sfl_bumpkin_recipes`) become explicit function parameters with farm-state defaults.

---

## File Structure

- `core/derive/items.js` — ownership primitives: `hasItem`, `hasAny` (wrap existing `findCollectible` / `isWearableEquipped` / `getAllEquippedWearables`, which also move here).
- `core/data/cooking.js` — `COOKING_RECIPES_DATA`, `COOKING_INGREDIENTS`, `COOKING_BUILDING_NAMES`, `BUMPKIN_DEFAULT_RECIPES`.
- `core/engine/cooking.js` — `detectCookingBoosts`, `computeFoodXP`, `computeCookTime`, and the Aging-prime helpers `getAgingPrimeChance` / `getAgingPrimeFactor`.
- `core/engine/cooking-cost.js` — `computeRecipeCost` + `computeSaltYieldPerRake` / `computeSaltRakeCoinMult` / `computeFishYieldPerCast`.
- `core/sections/cooking.js` — `buildCookingSection(farm, prices, settings)` composer returning the unified payload consumed by BOTH the Bumpkin page and power-summary.
- `api/compute.js` — the new function: `GET ?farm=&section=cooking&...` → fetch farm+prices → `buildCookingSection` → JSON.
- `api/track.js` — MODIFY: add `?type=read` branch absorbing `stats.js`.
- `api/stats.js` — DELETE.
- `tests/fixtures/farm-155498.json` — committed farm snapshot for deterministic tests.
- `tests/core/*.test.mjs` — Node unit tests per module.
- `flowers.html` — MODIFY: remove PWA hooks; migrate cooking consumers to fetch the API; delete inline cooking calc.

---

## Task 1: Fold `stats` into `track.js`, delete `stats.js`

**Files:**
- Modify: `/tmp/sfl-deploy/api/track.js`
- Delete: `/tmp/sfl-deploy/api/stats.js`
- Modify: `/tmp/sfl-deploy/vercel.json` (add `stats` rewrite → `track?type=read`)

**Interfaces:**
- Produces: `GET /api/stats?secret=...` behaviour preserved via rewrite to `/api/track?type=read`.

- [ ] **Step 1: Read both files fully**

Run: read `/tmp/sfl-deploy/api/track.js` and `/tmp/sfl-deploy/api/stats.js` end-to-end. Confirm `stats.js` is a `STATS_SECRET`-gated KV reader and `track.js` is the KV writer for the same keys (`all_farms`, `farm:<id>`).

- [ ] **Step 2: Add the read branch to `track.js`**

At the top of `track.js`'s handler, before its existing write logic, insert a branch that runs `stats.js`'s body verbatim when `req.query.type === "read"`:

```js
export default async function handler(req, res) {
  if (req.query.type === "read") {
    // --- begin: former api/stats.js body (verbatim) ---
    const secret = process.env.STATS_SECRET;
    if (!secret || req.query.secret !== secret) return res.status(401).json({ error: "Unauthorized" });
    // ... paste the rest of stats.js's handler body here, unchanged ...
    // --- end: former api/stats.js body ---
  }
  // ... existing track write logic unchanged ...
}
```

- [ ] **Step 3: Add the rewrite so the old URL keeps working**

In `vercel.json` `rewrites`, add:
```json
{ "source": "/api/stats", "destination": "/api/track?type=read" }
```

- [ ] **Step 4: Delete `stats.js`**

Run: `rm /tmp/sfl-deploy/api/stats.js`

- [ ] **Step 5: Verify function count**

Run: `ls /tmp/sfl-deploy/api/*.js | grep -v _db.js | wc -l`
Expected: `11` (was 12; one slot now free for `api/compute.js`).

- [ ] **Step 6: Commit (deploy repo)**

```bash
cd /tmp/sfl-deploy && git add -A && git commit -m "chore: fold stats into track?type=read, free a function slot"
```
Do NOT push yet — batch with Task 2's PWA removal into one deploy.

---

## Task 2: Remove the PWA (self-unregistering tombstone)

**Files:**
- Modify: `flowers.html:8` (manifest link), `:9` (apple-touch-icon), `:26569-26570` (SW registration)
- Modify: `/tmp/sfl-deploy/sw.js` → replace with tombstone
- Delete: `/tmp/sfl-deploy/manifest.json`

**Interfaces:**
- Produces: no service worker; already-installed clients unregister on next load.

- [ ] **Step 1: Patch `flowers.html` to drop PWA hooks**

Write a BMP-only Python patch (`apply_kill_pwa.py`) with three `rep()` calls, each asserting `count==1`:
- Remove `<link rel="manifest" href="/manifest.json">` (line 8).
- Remove `<link rel="apple-touch-icon" href="/icon-192.svg">` (line 9).
- Remove the SW registration block:
```
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
```
(read `flowers.html:26565-26575` first to capture the exact surrounding braces to remove the whole `if` cleanly).

- [ ] **Step 2: Replace `sw.js` with a tombstone**

Overwrite `/tmp/sfl-deploy/sw.js` with:
```js
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", async () => {
  try {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
    await self.registration.unregister();
    const clients = await self.clients.matchAll();
    clients.forEach((c) => c.navigate(c.url));
  } catch (e) {}
});
```

- [ ] **Step 3: Delete the manifest**

Run: `rm /tmp/sfl-deploy/manifest.json`

- [ ] **Step 4: Sync + verify no PWA references remain**

```bash
cp flowers.html index.html
grep -n "serviceWorker\|manifest.json" flowers.html
```
Expected: no matches.

- [ ] **Step 5: Deploy F0 (bump version, push)**

```bash
cp flowers.html /tmp/sfl-deploy/ && cp index.html /tmp/sfl-deploy/
# bump footer version to v4.75 in flowers.html + re-sync; bump CACHE_NAME in sw.js is N/A (tombstone)
cd /tmp/sfl-deploy && git add -A && git commit -m "feat: remove PWA (tombstone sw.js), v4.75"
gh auth switch -u hlavasim && git push && gh auth switch -u SoftimDevOps
```
Expected: push succeeds; loading the site once unregisters the old SW.

---

## Task 3: Test fixture — snapshot live farm 155498

**Files:**
- Create: `tests/fixtures/farm-155498.json`

**Interfaces:**
- Produces: a committed farm object usable by every `core/` test (`import farm from "../fixtures/farm-155498.json" assert { type: "json" }` or `JSON.parse(readFileSync)`).

- [ ] **Step 1: Fetch the farm and save it**

```bash
mkdir -p tests/fixtures
curl -s "https://sunflower.sajmonium.quest/api/proxy?url=https%3A%2F%2Fapi.sunflower-land.com%2Fcommunity%2Ffarms%2F155498" -o tests/fixtures/farm-155498.json
```

- [ ] **Step 2: Sanity-check the shape**

```bash
node -e "const f=require('./tests/fixtures/farm-155498.json'); console.log(!!f.farm?.bumpkin?.skills, Object.keys(f.farm?.buildings||{}).length)"
```
Expected: `true` and a nonzero building count. (The proxy wraps the farm under `.farm`; note whether tests need `data.farm` vs `data`.)

- [ ] **Step 3: Commit**

```bash
git add tests/fixtures/farm-155498.json && git commit -m "test: add farm 155498 fixture"
```

---

## Task 4: `core/derive/items.js` — ownership primitives

**Files:**
- Create: `core/derive/items.js`
- Test: `tests/core/items.test.mjs`
- Reference (verbatim source): `flowers.html` `findCollectible`, `isWearableEquipped`, `getAllEquippedWearables` (locate with `grep -n "function findCollectible\|function isWearableEquipped\|function getAllEquippedWearables" flowers.html`).

**Interfaces:**
- Produces:
  - `findCollectible(farm, name) -> array`
  - `isWearableEquipped(farm, name) -> boolean`
  - `getAllEquippedWearables(farm) -> string[][]`
  - `hasItem(farm, name) -> boolean` (`findCollectible(farm,name).length>0 || isWearableEquipped(farm,name)`)
  - `hasAny(farm, ...names) -> boolean`

- [ ] **Step 1: Write the failing test**

```js
// tests/core/items.test.mjs
import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { hasItem, hasAny } from "../../core/derive/items.js";

const wrap = JSON.parse(readFileSync(new URL("../fixtures/farm-155498.json", import.meta.url)));
const farm = wrap.farm || wrap;

test("hasItem finds an owned collectible or wearable", () => {
  // pick a name known-present in the fixture (inspect the fixture; e.g. an owned collectible)
  assert.equal(typeof hasItem(farm, "Observatory"), "boolean");
});
test("hasAny is true when any variant matches", () => {
  assert.equal(hasAny(farm, "Master Chefs Cleaver", "Master Chef's Cleaver"), hasItem(farm, "Master Chefs Cleaver") || hasItem(farm, "Master Chef's Cleaver"));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/core/items.test.mjs`
Expected: FAIL — `Cannot find module ../../core/derive/items.js`.

- [ ] **Step 3: Create the module**

Move `findCollectible`, `isWearableEquipped`, `getAllEquippedWearables` VERBATIM from `flowers.html` into `core/derive/items.js` as `export function`s. Add:
```js
export function hasItem(farm, name) {
  return findCollectible(farm, name).length > 0 || isWearableEquipped(farm, name);
}
export function hasAny(farm, ...names) { return names.some((n) => hasItem(farm, n)); }
```
Resolve any transitive helpers they call (e.g. `farmWearableEquipped`) by moving those too. Remove all `console.log` debug lines.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/core/items.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add core/derive/items.js tests/core/items.test.mjs && git commit -m "feat(core): ownership primitives (items derive)"
```

---

## Task 5: `core/data/cooking.js` — cooking data tables

**Files:**
- Create: `core/data/cooking.js`
- Reference: `flowers.html:3510` `COOKING_RECIPES_DATA`, `:3603` `COOKING_INGREDIENTS`, `:3695` `COOKING_BUILDING_NAMES`, `:6813` `BUMPKIN_DEFAULT_RECIPES`.

**Interfaces:**
- Produces: `export const COOKING_RECIPES_DATA`, `COOKING_INGREDIENTS`, `COOKING_BUILDING_NAMES`, `BUMPKIN_DEFAULT_RECIPES`.

- [ ] **Step 1: Create the module (data-only, no test needed beyond import)**

Copy the four constants VERBATIM from the cited lines into `core/data/cooking.js` with `export const`. These are pure data; the smoke test in Task 6 covers them.

- [ ] **Step 2: Smoke-check it imports**

Run: `node -e "import('./core/data/cooking.js').then(m=>console.log(Object.keys(m.COOKING_RECIPES_DATA).length))"`
Expected: a nonzero recipe count.

- [ ] **Step 3: Commit**

```bash
git add core/data/cooking.js && git commit -m "feat(core): cooking data tables"
```

---

## Task 6: `core/engine/cooking.js` — XP/time boosts (settings as params)

**Files:**
- Create: `core/engine/cooking.js`
- Test: `tests/core/cooking-engine.test.mjs`
- Reference: `flowers.html:4865` `getAgingPrimeChance`, `:4873` `getAgingPrimeFactor`, `:6664-6779` `detectCookingBoosts`, `:6782` `computeFoodXP`, `:6793` `computeCookTime`.

**Interfaces:**
- Consumes: `core/derive/items.js` (`hasItem`, `hasAny`).
- Produces:
  - `detectCookingBoosts(farm, settings) -> { xpBoosts, timeBoosts, petStreakInfo }` where `settings = { petSimulate: boolean }` REPLACES `localStorage.getItem("sfl_pet_streak")==="1"`.
  - `computeFoodXP(foodName, food, buildingName, boosts) -> number`
  - `computeCookTime(baseSec, buildingName, boosts) -> number`

- [ ] **Step 1: Write the failing test**

```js
// tests/core/cooking-engine.test.mjs
import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { detectCookingBoosts, computeFoodXP, computeCookTime } from "../../core/engine/cooking.js";
import { COOKING_RECIPES_DATA } from "../../core/data/cooking.js";

const wrap = JSON.parse(readFileSync(new URL("../fixtures/farm-155498.json", import.meta.url)));
const farm = wrap.farm || wrap;

test("Pizza Margherita matches the Bumpkin page with Simulate x1.5", () => {
  const boosts = detectCookingBoosts(farm, { petSimulate: true });
  const r = COOKING_RECIPES_DATA["Pizza Margherita"];
  const xp = computeFoodXP("Pizza Margherita", r, "Fire Pit", boosts);
  const time = computeCookTime(r.cookSec, "Fire Pit", boosts);
  assert.ok(Math.abs(xp - 50025.94) < 0.1, `xp ${xp}`);
  assert.ok(Math.abs(time/60 - 309.8) < 0.2, `min ${time/60}`);
});
```
(50025.94 / 309.8 min are the values verified in v4.74.)

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/core/cooking-engine.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the module**

Move `getAgingPrimeChance`, `getAgingPrimeFactor`, `detectCookingBoosts`, `computeFoodXP`, `computeCookTime` VERBATIM into `core/engine/cooking.js`. Then make exactly these edits:
- `import { hasItem, hasAny } from "../derive/items.js";` and delete the inner `hasItem`/`hasAny` defs; the inner calls become `hasItem(farm, ...)` / `hasAny(farm, ...)` (thread `farm`).
- Change the signature to `detectCookingBoosts(farm, settings = {})` and replace `const manualPetStreak = localStorage.getItem("sfl_pet_streak") === "1";` with `const manualPetStreak = !!settings.petSimulate;`.
- Delete all `console.log` lines.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/core/cooking-engine.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add core/engine/cooking.js tests/core/cooking-engine.test.mjs && git commit -m "feat(core): cooking XP/time engine, settings as params"
```

---

## Task 7: `core/engine/cooking-cost.js` — recipe cost closure

**Files:**
- Create: `core/engine/cooking-cost.js`
- Test: `tests/core/cooking-cost.test.mjs`
- Reference: `flowers.html:4843` `computeSaltYieldPerRake`, `:4851` `computeSaltRakeCoinMult` (grep exact), `:4920` `computeFishYieldPerCast`, `:6994` `computeRecipeCost`.

**Interfaces:**
- Consumes: `core/derive/items.js`, `core/data/cooking.js` (`COOKING_INGREDIENTS`).
- Produces:
  - `computeSaltYieldPerRake(farm) -> number`
  - `computeSaltRakeCoinMult(farm) -> number`
  - `computeFishYieldPerCast(farm, tier) -> number`
  - `computeRecipeCost(recipeName, p2p, coinsPerSFL, skills, extras) -> { total, items, hasUnpriced }`

- [ ] **Step 1: Write the failing test**

```js
// tests/core/cooking-cost.test.mjs
import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { computeRecipeCost, computeSaltYieldPerRake } from "../../core/engine/cooking-cost.js";

const wrap = JSON.parse(readFileSync(new URL("../fixtures/farm-155498.json", import.meta.url)));
const farm = wrap.farm || wrap;

test("salt yield per rake is a positive number", () => {
  assert.ok(computeSaltYieldPerRake(farm) >= 10);
});
test("recipe cost returns a total and item list", () => {
  const rc = computeRecipeCost("Pizza Margherita", {}, 0, farm.bumpkin?.skills || {}, {});
  assert.ok(rc && Array.isArray(rc.items));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/core/cooking-cost.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the module**

Move the four functions VERBATIM into `core/engine/cooking-cost.js`. Replace any `hasItem`/`findCollectible`/`isWearableEquipped` usage with imports from `core/derive/items.js`; import `COOKING_INGREDIENTS` from `core/data/cooking.js`. Move any remaining transitive data (e.g. `SALT_RAKE_COST`, salt/fish constants) into `core/data/` as needed and import. Remove `console.log`s.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/core/cooking-cost.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add core/ tests/core/cooking-cost.test.mjs && git commit -m "feat(core): recipe cost closure"
```

---

## Task 8: `core/sections/cooking.js` — unified payload composer

**Files:**
- Create: `core/sections/cooking.js`
- Test: `tests/core/cooking-section.test.mjs`
- Reference: the Bumpkin recipe/stat loop `flowers.html:10743-10780` and the power-summary cooking block `flowers.html:17549-17573`.

**Interfaces:**
- Consumes: `core/data/cooking.js`, `core/engine/cooking.js`, `core/engine/cooking-cost.js`.
- Produces: `buildCookingSection(farm, prices, settings) -> payload`, where
  `settings = { savedRecipes: object, petSimulate: boolean, coinsPerSFL: number }` and
  ```
  payload = {
    buildings: { [name]: {
      count, selectedRecipe, xpPerCook, cookMinutes, xpPerDay,
      recipes: [ { name, xp, time, xpPerHour, cost, xpPerSfl, isInstant } ]
    } },
    totalXpPerDay,
    petStreak: { weeks, activeThisWeek, mult },
    xpBoosts: string[]
  }
  ```
  This is the single shape BOTH consumers read. `selectedRecipe = settings.savedRecipes[bd] ?? BUMPKIN_DEFAULT_RECIPES[bd]`.

- [ ] **Step 1: Write the failing test**

```js
// tests/core/cooking-section.test.mjs
import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { buildCookingSection } from "../../core/sections/cooking.js";

const wrap = JSON.parse(readFileSync(new URL("../fixtures/farm-155498.json", import.meta.url)));
const farm = wrap.farm || wrap;

test("defaults + Simulate reproduces the v4.74 verified totals", () => {
  const p = buildCookingSection(farm, {}, { savedRecipes: {}, petSimulate: true, coinsPerSFL: 0 });
  const fp = p.buildings["Fire Pit"];
  assert.equal(fp.selectedRecipe, "Pizza Margherita");
  assert.ok(Math.abs(fp.xpPerDay - 232509.80) < 1, `firePit ${fp.xpPerDay}`);
  assert.ok(Math.abs(p.buildings["Deli"].xpPerDay - 264712.41) < 1, `deli ${p.buildings["Deli"].xpPerDay}`);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/core/cooking-section.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the composer**

Write `buildCookingSection` combining the two existing loops into one: for each `COOKING_BUILDING_NAMES` building compute `count` (Aging Shed = `agingShed.level` clamped 1..6), build the full `recipes` list via `computeFoodXP`/`computeCookTime`/`computeRecipeCost`, pick `selectedRecipe`, and compute `cooksPerDay = (86400/time)*count`, `xpPerDay = xp*cooksPerDay`. Boosts come from `detectCookingBoosts(farm, { petSimulate })`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/core/cooking-section.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add core/sections/cooking.js tests/core/cooking-section.test.mjs && git commit -m "feat(core): cooking section composer (unified payload)"
```

---

## Task 9: `api/compute.js` — the endpoint

**Files:**
- Create: `/tmp/sfl-deploy/api/compute.js` (and mirror into the working repo if it tracks `api/`)
- Modify: `/tmp/sfl-deploy/vercel.json` (rewrite `/api/compute`)

**Interfaces:**
- Consumes: `core/sections/cooking.js`.
- Produces: `GET /api/compute?farm=<id>&section=cooking&petSimulate=0|1&recipes=<json>` → `{ farm, computedAt, section:"cooking", data: <payload> }`.

- [ ] **Step 1: Implement the handler**

```js
// api/compute.js
import { buildCookingSection } from "../core/sections/cooking.js";

export default async function handler(req, res) {
  const farmId = req.query.farm;
  const section = req.query.section || "cooking";
  if (!farmId) return res.status(400).json({ error: "farm required" });
  try {
    const r = await fetch(`https://api.sunflower-land.com/community/farms/${farmId}`);
    const wrap = await r.json();
    const farm = wrap.farm || wrap;
    const settings = {
      savedRecipes: req.query.recipes ? JSON.parse(req.query.recipes) : {},
      petSimulate: req.query.petSimulate === "1",
      coinsPerSFL: Number(req.query.coinsPerSFL || 0),
    };
    const prices = {}; // F1: prices optional (cost may be 0); wired in a later task/phase
    let data;
    if (section === "cooking") data = buildCookingSection(farm, prices, settings);
    else return res.status(400).json({ error: "unknown section" });
    return res.status(200).json({ farm: farmId, computedAt: new Date().toISOString(), section, data });
  } catch (e) {
    return res.status(500).json({ error: String(e && e.message || e) });
  }
}
```

- [ ] **Step 2: Add the rewrite**

In `vercel.json` add: `{ "source": "/api/compute", "destination": "/api/compute" }`.

- [ ] **Step 3: Verify function count still ≤ 12**

Run: `ls /tmp/sfl-deploy/api/*.js | grep -v _db.js | wc -l`
Expected: `12` (11 after Task 1 + `compute.js`).

- [ ] **Step 4: Local smoke test**

Run: `node -e "import('/tmp/sfl-deploy/core/sections/cooking.js').then(async m=>{const f=require('./tests/fixtures/farm-155498.json');console.log(m.buildingsCheck||'ok')})"` — or deploy to a Vercel preview and `curl "<preview>/api/compute?farm=155498&section=cooking&petSimulate=1"`; confirm Fire Pit `xpPerDay ≈ 232509.80`.

- [ ] **Step 5: Commit (deploy repo)**

```bash
cd /tmp/sfl-deploy && git add -A && git commit -m "feat(api): compute endpoint, section=cooking"
```

---

## Task 10: Migrate power-summary to consume the cooking payload

**Files:**
- Modify: `flowers.html` — `_powerSummaryData` cooking block (`:17547-17573`)

**Interfaces:**
- Consumes: `GET /api/compute?section=cooking`.
- Produces: `_powerSummaryData` returns the same `cooking` shape it does today, now sourced from the API payload (mapped field names).

- [ ] **Step 1: Make `_powerSummaryData` async and fetch the section**

Patch the cooking block to `await fetch("/api/compute?farm="+fid+"&section=cooking&petSimulate="+(localStorage.getItem("sfl_pet_streak")==="1"?"1":"0")+"&recipes="+encodeURIComponent(JSON.stringify(getSavedBumpkinRecipes())))`, then map `payload.data` → the existing `cooking` output shape. Delete the inline `detectCookingBoosts`/`computeFoodXP` cooking math from this block. Update `_pushPowerSummary`/`_maybePushPowerSummary` to `await`.

- [ ] **Step 2: Verify with the harness (offline path still builds)**

Run: `python build_harness.py && node --check <scratchpad>/harness.js`
Expected: INLINE OK (the harness cannot hit the network; the cooking block behind `fetch` should degrade to `cooking:null` under the harness without throwing — confirm the try/catch covers it).

- [ ] **Step 3: Commit**

```bash
git add flowers.html && git commit -m "refactor: power-summary cooking sourced from /api/compute"
```

---

## Task 11: Migrate the Bumpkin page render to the payload + delete the duplicate

**Files:**
- Modify: `flowers.html` — `renderBumpkin` cooking-card loop (`:10743-10857`)

**Interfaces:**
- Consumes: `GET /api/compute?section=cooking`.
- Produces: Bumpkin cards rendered from `payload.data.buildings[bd].recipes` / `.selectedRecipe` / `.xpPerDay` — the inline `recipes.map(computeFoodXP/computeCookTime/computeRecipeCost)` block is removed.

- [ ] **Step 1: Fetch the payload where `renderBumpkin` runs**

Add an async load that fetches `/api/compute?section=cooking` (with the same `petSimulate`/`recipes` params) and renders cards from `payload.data`. Keep the recipe `<select>` (still reads the `recipes` list from the payload). Delete the inline `computeFoodXP`/`computeCookTime`/`computeRecipeCost` calls from this render path.

- [ ] **Step 2: Manual parity check (live)**

Deploy to a preview; open the Bumpkin page; confirm each card (recipe, cook time, XP/cook, XP/day, cost) matches the pre-migration values to the cent for farm 155498.

- [ ] **Step 3: Commit**

```bash
git add flowers.html && git commit -m "refactor: Bumpkin page cooking rendered from /api/compute"
```

---

## Task 12: Delete now-dead inline cooking code + final regression

**Files:**
- Modify: `flowers.html` — remove any inline cooking functions no longer referenced (only after grep proves 0 remaining callers), e.g. the dead `_cookXpMult`.

**Interfaces:**
- Produces: no client-side cooking calculation remains; cooking is computed in exactly one place (`core/`).

- [ ] **Step 1: Prove the inline cooking functions are unreferenced**

Run: `grep -n "_cookXpMult\|computeFoodXP\|computeCookTime\|detectCookingBoosts\|computeRecipeCost" flowers.html`
Expected: only definitions remain, with 0 call sites. (If a non-cooking caller of a shared helper like `computeSaltYieldPerRake` exists, keep that helper — remove only the cooking-exclusive ones.)

- [ ] **Step 2: Remove the dead cooking-only functions**

BMP-only Python patch deleting the confirmed-dead definitions.

- [ ] **Step 3: Full regression**

Run: `python build_harness.py && node --check <scratchpad>/harness.js` and a live preview check of both the Bumpkin page and the power-summary GET for farm 155498.
Expected: harness INLINE OK; both consumers match the v4.74 numbers to the cent.

- [ ] **Step 4: Deploy F1 (bump version, push)**

```bash
cp flowers.html index.html && cp flowers.html /tmp/sfl-deploy/ && cp index.html /tmp/sfl-deploy/
# bump footer to v4.76
cd /tmp/sfl-deploy && git add -A && git commit -m "refactor: cooking computed only in core (F1 pilot complete), v4.76"
gh auth switch -u hlavasim && git push && gh auth switch -u SoftimDevOps
```

- [ ] **Step 5: Commit the plan-completion note (working repo)**

```bash
git add flowers.html && git commit -m "chore: cooking pilot done — one source of truth via /api/compute"
```

---

## Self-Review

**Spec coverage:**
- F0 fold `stats`→`track` + free slot → Task 1. PWA removal → Task 2. ✓
- F1 core extraction (derive + engine) → Tasks 4–7. Unified section → Task 8. `api/compute` → Task 9. Consumer migration + duplicate deletion → Tasks 10–12. ✓
- "Nothing computed twice" → Task 12 proves 0 remaining inline callers. ✓
- Verification to the cent (farm 155498) → Tasks 6, 8, 11, 12. ✓
- Function budget (≤12) → Tasks 1, 9 assert the count. ✓

**Deferred (documented, not gaps):** server-side price freshness (F1 uses `prices={}`, cost may read 0 where a price is missing — revisit in F2+); list sections (`nfts`, `boosts`) and other compute domains are separate F2+ plans; making `_powerSummaryData` async ripples to its callers (handled in Task 10 Step 1).

**Placeholder scan:** verbatim-move steps cite exact source line ranges (precise, not placeholders). Test code and commands are concrete. No "TBD/handle edge cases".

**Type consistency:** `detectCookingBoosts(farm, settings)`, `buildCookingSection(farm, prices, settings)`, and the `payload` shape are used identically in Tasks 6/8/9/10/11.
