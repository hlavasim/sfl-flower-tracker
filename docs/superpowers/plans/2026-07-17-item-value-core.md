# Item value layer — core + `?section=prices` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One item-pricing implementation in `core/`, exposing the two questions as named entry points, and serving both as precomputed maps at `/api/compute?section=prices` — with zero consumers converted yet.

**Architecture:** Move the 12 missing data tables into `core/data/` verbatim; extract `estimateItemSfl` into `core/engine/item-value.mjs` as `itemMarketValue`; fold the already-extracted `_resolveItemSfl` in beside it as `itemProductionCost` sharing one table set; precompute both maps over the 328-name item universe and serve them.

**Tech Stack:** Node ESM (`.mjs`), plain `node --test`, no new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-17-item-value-layer-design.md`

## Scope — this is PLAN 1 of 2, deliberately

This plan ends with `?section=prices` serving correct maps and **no consumer converted**. That is
working, testable software: the maps are verifiable against the live page's own resolvers, item by
item. Converting the ~30 call sites gets its own plan, written once the map's real shape exists —
drafting it now would repeat the mistake that turned the cooking pilot's 6 tasks into 12: planning
against premises nobody had checked. (This spec already had one: it named 4 tables to move; there are 12.)

## Global Constraints

- **`flowers.html` is NOT touched by this plan at all.** Every task here only ADDs to `core/`, `api/compute.mjs` and `tests/`. Deleting inline twins happens in plan 2, after their last consumer moves.
- **VERBATIM extraction. No numeric result may change, to the cent.** Permitted edits when moving code: imports, adding `export`, deleting `console.log`, threading a parameter the inline version closed over. Nothing else. A behaviour change here is a silent economic bug.
- **`api/` must stay at 13 files** (Vercel Hobby caps functions at 12; only files directly in `api/` count; the build breaks at 14). This rides `?section=` on the existing `api/compute.mjs`.
- **No new npm dependencies.** The repo has exactly one (`pg`). No database.
- **`core/` is DOM-free**: no `window`, `document`, `localStorage`, or `fetch`.
- **`api/compute.mjs` returns 400 `farm required` before the section dispatch** — verify the exact line with grep. `prices` needs a farm (production cost depends on skills), so it does NOT need to move ahead of that guard.
- **Do NOT fix anything that looks wrong.** Record it in your report; there is a correctness register (`.superpowers/sdd/progress.md`) and an audit phase after unification. In particular **do NOT fix the Earthworm ×7.6 disagreement (C6)** — it is the reason this work exists, and fixing it here would move numbers for two reasons at once.
- Branch `backend-split-pilot`. **Never push; never touch `main`** (a push to main auto-deploys production).
- No typecheck/lint is configured in this repo — say so, don't invent one.
- **The upstream rate-limits us** (`farm fetch failed: 429`, surfacing as intermittent 502s). A blank page or a failed curl is usually that, not your change — wait ~45s and retry before diagnosing.
- **Restart `node dev-server.mjs` after every edit** — it serves a stale payload otherwise. This has burned six agents on this project, including the controller.

## File Structure

- `core/data/recipes.mjs` — CREATE: `RECIPE_INGREDIENTS`, `FLOWER_RECIPES`, `DOLL_RECIPES`.
- `core/data/economy.mjs` — CREATE: `TOOL_COSTS`, `SEED_COSTS`, `ITEM_XP_VALUES`, `POTION_TICKET_COIN_VALUE`, `EXOTIC_CROPS_TICKET_COST`, `FLOWER_SEED_COIN_COSTS`, `GIANT_FRUIT_SELL_PRICES`, `GIANT_ITEM_COIN_PRICES`.
- `core/data/pets.mjs` — CREATE: `PET_FETCH_DATA`.
  (Grouping is by domain, matching the existing `cooking.mjs` / `fishing.mjs` / `crafting.mjs` / `prices.mjs`. If the dependency graph splits differently as you go, use your judgement and say so in the report.)
- `core/data/_inventory.mjs` — MODIFY: regenerate (the coverage view's input).
- `core/engine/item-value.mjs` — CREATE: `itemMarketValue`, `itemProductionCost`, and the shared recursion.
- `core/engine/cooking-cost.mjs` — MODIFY: `_resolveItemSfl` moves out to `item-value.mjs`; `computeRecipeCost` imports it.
- `core/sections/prices.mjs` — CREATE: `buildPricesSection(farm, prices, settings)`.
- `api/compute.mjs` — MODIFY: `section=prices` branch.
- `tests/core/item-value.test.mjs`, `tests/core/prices-section.test.mjs` — CREATE.

---

## Task 1: move the 12 data tables into `core/data/`

**Files:**
- Create: `core/data/recipes.mjs`, `core/data/economy.mjs`, `core/data/pets.mjs`
- Modify: `core/data/_inventory.mjs`
- Test: `tests/core/constants.test.mjs` (existing — it will start failing; that is the point)

**Interfaces:**
- Produces: 12 `export const` tables, byte-identical to their inline originals.

- [ ] **Step 1: Copy each table VERBATIM**

Locate each with grep (line numbers drift — do not trust these):

| table | `flowers.html` | lines | goes to |
|---|---|---|---|
| `RECIPE_INGREDIENTS` | ~4561 | 65 | `recipes.mjs` |
| `FLOWER_RECIPES` | ~2958 | 61 | `recipes.mjs` |
| `DOLL_RECIPES` | ~3373 | 25 | `recipes.mjs` |
| `PET_FETCH_DATA` | ~22388 | 18 | `pets.mjs` |
| `ITEM_XP_VALUES` | ~4726 | 17 | `economy.mjs` |
| `SEED_COSTS` | ~3977 | 13 | `economy.mjs` |
| `TOOL_COSTS` | ~4273 | 13 | `economy.mjs` |
| `POTION_TICKET_COIN_VALUE` | ~4255 | 10 | `economy.mjs` |
| `EXOTIC_CROPS_TICKET_COST` | ~4256 | 9 | `economy.mjs` |
| `FLOWER_SEED_COIN_COSTS` | ~4719 | 5 | `economy.mjs` |
| `GIANT_FRUIT_SELL_PRICES` | ~4267 | 5 | `economy.mjs` |
| `GIANT_ITEM_COIN_PRICES` | ~4745 | 3 | `economy.mjs` |

Only edit: add `export`, adjust indentation. Read `core/data/cooking.mjs` first and match its style.

- [ ] **Step 2: Prove each is byte-identical**

For every table, diff the moved copy against the inline original, normalising only leading indent and the added `export`:

```bash
node -e "
const fs=require('fs');const L=fs.readFileSync('flowers.html','utf8').split('\n');
const name=process.argv[1], file=process.argv[2];
const i=L.findIndex(l=>new RegExp('^\\\\s*(?:const|let|var)\\\\s+'+name+'\\\\s*=').test(l));
let d=0,e=i; for(;e<L.length;e++){for(const c of L[e]){if('{['.includes(c))d++;if('}]'.includes(c))d--;} if(e>i&&d<=0)break;}
const inline=L.slice(i,e+1).map(s=>s.trim()).join('\n').replace(/^const /,'');
const M=fs.readFileSync(file,'utf8').split('\n');
const j=M.findIndex(l=>l.startsWith('export const '+name));
let d2=0,e2=j; for(;e2<M.length;e2++){for(const c of M[e2]){if('{['.includes(c))d2++;if('}]'.includes(c))d2--;} if(e2>j&&d2<=0)break;}
const moved=M.slice(j,e2+1).map(s=>s.trim()).join('\n').replace(/^export const /,'');
console.log(name.padEnd(28), inline===moved?'IDENTICAL':'*** DIFFERS ***');
" RECIPE_INGREDIENTS core/data/recipes.mjs
```
Run it for all 12. Every one must print `IDENTICAL`. Quote the output in your report.

- [ ] **Step 3: Watch the coverage test fail — it should**

Run: `node --test tests/core/constants.test.mjs`
Expected: FAIL. The 12 names are now `core/data` exports but `_inventory.mjs` has them marked as
inline-only, so the coverage status is stale. **This failure is the drift guard doing its job** — do
not work around it.

- [ ] **Step 4: Regenerate the inventory**

Run the generator snippet in `docs/superpowers/plans/2026-07-16-api-surface-visibility.md` Step 1
(both parts — the table scan AND the per-name check) and replace `core/data/_inventory.mjs`.
Do NOT hand-edit the list.

- [ ] **Step 5: Verify the coverage moved the right way**

Run: `node --test tests/core/*.test.mjs tests/api/*.test.mjs` → green (was 66/66, will grow).
Restart the dev-server, then:
```bash
curl -s "http://localhost:3000/api/compute?section=constants" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const d=JSON.parse(s).data;console.log(JSON.stringify(d.summary));const by=Object.fromEntries(d.coverage.map(c=>[c.name,c.status]));for(const n of ['RECIPE_INGREDIENTS','TOOL_COSTS','PET_FETCH_DATA','FLOWER_RECIPES'])console.log(' ',n,'->',by[n]);})"
```
Expected: `duplicated` rises **18 → 30**, `inline` falls **143 → 131**, `total` stays **161**, and each
of the 12 reads `duplicated`. **`duplicated` going UP is correct here** — the tables now exist in both
places, which is exactly what the counter is for. It only falls in plan 2, when the inline twins die.

- [ ] **Step 6: Commit**

```bash
git add core/data/ tests/ && git commit -m "feat(core): move the item-value data closure into core/data (12 tables)"
```

---

## Task 2: `core/engine/item-value.mjs` — `itemMarketValue`

**Files:**
- Create: `core/engine/item-value.mjs`, `tests/core/item-value.test.mjs`

**Interfaces:**
- Consumes: `core/data/recipes.mjs`, `economy.mjs`, `pets.mjs`, `crafting.mjs`, `fishing.mjs`.
- Produces: `itemMarketValue(item, prices, _visited, rates) -> number` (0 = unknown), VERBATIM behaviour of `flowers.html`'s `estimateItemSfl` (~`:23110-23300`, 192 lines).

- [ ] **Step 1: Write the failing test — pin the LIVE divergences, not made-up numbers**

These values were measured from the running page (both resolvers, same farm, same prices, same
instant) and are recorded in the spec §1. They are the contract:

```js
// tests/core/item-value.test.mjs
import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { itemMarketValue } from "../../core/engine/item-value.mjs";

const p2p = JSON.parse(readFileSync(new URL("../fixtures/p2p-prices.json", import.meta.url)));
const RATES = { coinsPerSFL: 1061.0079575596817 };

test("a market-priced item returns the market price, not a derivation", () => {
  // Salt IS listed on the market; itemMarketValue must prefer it. This is the whole
  // reason itemMarketValue and itemProductionCost are separate functions.
  assert.equal(itemMarketValue("Salt", p2p, null, RATES), p2p["Salt"]);
});

test("an unpriced craftable is derived from its recipe", () => {
  // Cheese = 3 Milk (CRAFTED_INGREDIENT_RECIPES) when Cheese has no market price.
  const noCheese = { ...p2p }; delete noCheese["Cheese"];
  assert.ok(Math.abs(itemMarketValue("Cheese", noCheese, null, RATES) - 3 * p2p["Milk"]) < 1e-9);
});

test("an item nothing can price returns 0, not null", () => {
  // The 0-means-unknown contract is what ~29 existing call sites rely on via `|| 0`.
  assert.equal(itemMarketValue("Definitely Not An Item", p2p, null, RATES), 0);
});

test("a recipe cycle terminates instead of blowing the stack", () => {
  assert.equal(typeof itemMarketValue("Barn Delight", p2p, null, RATES), "number");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/core/item-value.test.mjs`
Expected: FAIL — `Cannot find module ../../core/engine/item-value.mjs`.

- [ ] **Step 3: Move `estimateItemSfl` VERBATIM**

Copy the body into `core/engine/item-value.mjs`, exported as `itemMarketValue`. Import its tables
from `core/data/`. Keep the signature `(itemName, p2pPrices, _visited, rates)` and the `0`-means-
unknown return — ~29 call sites depend on both.

**Preserve, do not "fix":**
- The direct-P2P check happens BEFORE the `visited` guard (`:23112` vs `:23115`). That ordering is
  observable; leave it.
- Any hardcoded item logic (e.g. the `Barn Delight` branch at `:23144`).
Note anything that looks wrong in your report instead.

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/core/item-value.test.mjs` → PASS.

- [ ] **Step 5: Prove the move is faithful across the WHOLE item universe**

A four-test suite is not evidence of a verbatim 192-line move. Compare `core/`'s output against the
live page's own `estimateItemSfl` for **every** one of the ~328 reachable items, in the browser:

```js
// paste in the browser console at http://localhost:3000/flowers.html?farm=155498
// (dev-server restarted first), then compare against a node run of itemMarketValue
// over the same fixture. Report any item where they differ.
const names = [...new Set([...Object.keys(COOKING_INGREDIENTS), ...Object.keys(RECIPE_INGREDIENTS),
  ...Object.keys(CRAFTED_INGREDIENT_RECIPES), ...Object.keys(FISH_DATA), ...Object.keys(_bumpkinP2P||{})])];
JSON.stringify(Object.fromEntries(names.map(n => [n, estimateItemSfl(n, PRICES, null, RATES)])));
```
Expected: **zero differences**. Any difference is a Critical finding — report it, do not adjust the test.

- [ ] **Step 6: Commit**

```bash
git add core/engine/item-value.mjs tests/core/item-value.test.mjs
git commit -m "feat(core): itemMarketValue — the market-first resolver, extracted verbatim"
```

---

## Task 3: fold `_resolveItemSfl` in as `itemProductionCost`

**Files:**
- Modify: `core/engine/item-value.mjs`, `core/engine/cooking-cost.mjs`, `tests/core/item-value.test.mjs`

**Interfaces:**
- Produces: `itemProductionCost(item, prices, coinsPerSFL, skills, _seen, extras) -> {price, source} | null` — the current `_resolveItemSfl` from `core/engine/cooking-cost.mjs`, moved, not rewritten.
- `core/engine/cooking-cost.mjs`'s `computeRecipeCost` imports it instead of defining it.

**This is a MOVE plus a shared table set — NOT a merge of the two functions.** They answer different
questions (spec §1.1) and must keep answering them differently. What is shared is the data and the
module; what stays separate is the policy.

- [ ] **Step 1: Write the failing test — pin the divergence deliberately**

```js
test("productionCost ignores the market for Salt; marketValue does not — on purpose", () => {
  // Salt is on the market (0.00416071) but you rake your own, so a cooking cost must use
  // the rake's cost, not the price. This asymmetry IS the feature; if it ever collapses,
  // one of the two questions has been silently answered with the other's answer.
  const market = itemMarketValue("Salt", p2p, null, RATES);
  const cost = itemProductionCost("Salt", p2p, RATES.coinsPerSFL, {}, undefined, {});
  assert.equal(market, p2p["Salt"]);
  assert.equal(cost.source, "salt");
  assert.ok(cost.price > market, `production ${cost.price} should exceed market ${market}`);
});

test("productionCost returns null for something you cannot make", () => {
  assert.equal(itemProductionCost("Definitely Not An Item", p2p, RATES.coinsPerSFL, {}, undefined, {}), null);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/core/item-value.test.mjs`
Expected: FAIL — `itemProductionCost` is not exported.

- [ ] **Step 3: Move it**

Move `_resolveItemSfl` from `core/engine/cooking-cost.mjs` into `core/engine/item-value.mjs`, exported
as `itemProductionCost`. `computeRecipeCost` imports it. **Preserve every quirk**, including:
- the `_seen` Set shared across sibling branches within one resolve while `computeRecipeCost` passes
  `undefined` for a fresh Set per top-level ingredient (correctness register C1 — a suspected real
  bug, deliberately kept);
- `extras = Object.assign({ fishAsRod: true }, extras || {})`.

- [ ] **Step 4: Run to verify it passes AND cooking is untouched**

Run: `node --test tests/core/*.test.mjs tests/api/*.test.mjs`
Expected: green, including every existing cooking pin (232509.80 / 186007.84 / 223209.41 /
264712.41 / 167407.06 / 204803.25; total 1278649.777). **If any cooking number moves, the move was
not verbatim — revert and report.**

- [ ] **Step 5: Verify live**

Restart the dev-server; confirm `?farm=155498&section=cooking&petSimulate=1` still returns
`totalXpPerDay: 1278649.777` and per-recipe `items[]` still carry `source` and `fc`.

- [ ] **Step 6: Commit**

```bash
git add core/engine/ tests/ && git commit -m "refactor(core): itemProductionCost joins itemMarketValue in one module, two questions"
```

---

## Task 4: `core/sections/prices.mjs` + `?section=prices`

**Files:**
- Create: `core/sections/prices.mjs`, `tests/core/prices-section.test.mjs`
- Modify: `api/compute.mjs`

**Interfaces:**
- Consumes: `core/engine/item-value.mjs`, every `core/data` table.
- Produces:
  - `buildPricesSection(farm, prices, settings) -> { marketValue: {[item]: number}, productionCost: {[item]: number} }`
  - `GET /api/compute?section=prices&farm=<id>` → `{ farm, computedAt, section, data }`

- [ ] **Step 1: Write the failing test**

```js
// tests/core/prices-section.test.mjs
import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { buildPricesSection } from "../../core/sections/prices.mjs";
import { itemMarketValue } from "../../core/engine/item-value.mjs";

const wrap = JSON.parse(readFileSync(new URL("../fixtures/farm-155498.json", import.meta.url)));
const farm = wrap.farm || wrap;
const p2p = JSON.parse(readFileSync(new URL("../fixtures/p2p-prices.json", import.meta.url)));
const S = { coinsPerSFL: 1061.0079575596817 };

test("both maps are populated over the item universe", () => {
  const p = buildPricesSection(farm, p2p, S);
  assert.ok(Object.keys(p.marketValue).length > 250, `marketValue ${Object.keys(p.marketValue).length}`);
  assert.ok(Object.keys(p.productionCost).length > 50, `productionCost ${Object.keys(p.productionCost).length}`);
});

test("an unpriceable item is ABSENT, never 0 — callers must tell unknown from free", () => {
  const p = buildPricesSection(farm, p2p, S);
  assert.equal("Definitely Not An Item" in p.marketValue, false);
  // Mushroom is unpriced by BOTH resolvers today (spec §1) — it must not appear as 0.
  assert.equal(p.marketValue["Mushroom"], undefined);
});

test("the maps agree with the engine item by item", () => {
  const p = buildPricesSection(farm, p2p, S);
  for (const [name, v] of Object.entries(p.marketValue)) {
    assert.equal(v, itemMarketValue(name, p2p, null, S), `marketValue[${name}]`);
  }
});

test("Salt differs between the maps — the two questions stay two", () => {
  const p = buildPricesSection(farm, p2p, S);
  assert.equal(p.marketValue["Salt"], p2p["Salt"]);
  assert.ok(p.productionCost["Salt"] > p.marketValue["Salt"]);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/core/prices-section.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the composer**

Build the item universe by unioning the keys of every `core/data` table plus the live `prices` map,
then resolve each name through both entry points. **Omit** a name from a map when its resolver returns
`0`/`null` — absence means "cannot price", `0` would mean "free". `productionCost` needs the farm's
`skills` and the `extras` (salt yield, salt coin mult, fish yield by tier) — build them exactly as
`core/sections/cooking.mjs` does (it already hoists them once per call; reuse that, do not re-derive).

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/core/prices-section.test.mjs` → PASS.

- [ ] **Step 5: Wire the endpoint**

In `api/compute.mjs`, import `buildPricesSection` and add, beside the `cooking` branch (AFTER the
`farm required` guard — `prices` needs a farm for `productionCost`):
```js
    else if (section === "prices") data = buildPricesSection(farm, p2p, settings);
```
⚠ This adds `section === "prices"` to the handler, so the OpenAPI drift test will now DEMAND `prices`
in the spec's enum (`core/api-spec.mjs`) — add it, with a description. That is the guard working.

- [ ] **Step 6: Verify live, and measure the payload**

Restart the dev-server, then:
```bash
curl -s "http://localhost:3000/api/compute?farm=155498&section=prices" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const d=JSON.parse(s).data;console.log('marketValue:',Object.keys(d.marketValue).length,'items | productionCost:',Object.keys(d.productionCost).length);console.log('bytes:',s.length);console.log('Salt  market',d.marketValue.Salt,'| production',d.productionCost.Salt);console.log('Earthworm market',d.marketValue.Earthworm,'| production',d.productionCost.Earthworm);})"
```
Expected: a few hundred items, **≈15 KB** (the spec's measured estimate — report the real number),
Salt differing between the maps. Cooking must still return `totalXpPerDay: 1278649.777`.

- [ ] **Step 7: Prove the maps match the LIVE page, item by item**

The gate. In the browser at `?farm=155498` (dev-server restarted), fetch `?section=prices` and compare
every entry against the page's own `estimateItemSfl` / `_resolveItemSfl` **in the same page load**
(both resolvers still exist — this plan does not delete them). Report the count checked and every
mismatch. Expect zero. Note Earthworm WILL still disagree between the two maps — that is C6, expected,
and out of scope here.

- [ ] **Step 8: Commit**

```bash
git add core/sections/prices.mjs core/api-spec.mjs api/compute.mjs tests/
git commit -m "feat(api): section=prices — precomputed market-value and production-cost maps"
```

---

## Self-Review

**Spec coverage:**
- §4.1 one module, two named entry points → Tasks 2 + 3. ✓
- §4.1's 12-table closure → Task 1 (all 12 listed with line numbers and destinations). ✓
- §4.2 precomputed maps, absence ≠ 0, ~15 KB → Task 4 (Steps 3, 6). ✓
- §2 "no number changes" → Task 3 Step 4 (cooking pins) + Task 2 Step 5 and Task 4 Step 7 (whole-universe comparison against the live page). ✓
- §2 non-goal "do not fix Earthworm" → stated in Global Constraints and re-stated at Task 4 Step 7. ✓
- §3 zero new Vercel functions → Task 4 rides `?section=`; constraint stated. ✓
- §4.3 the `window.estimateItemSfl` seam → **deliberately NOT in this plan**: nothing here touches consumers. It belongs to plan 2, where it is the main hazard. Recorded so it cannot be forgotten.

**Placeholder scan:** none. Task 1's table list carries real line numbers and sizes; the verification snippets are runnable as written.

**Type consistency:** `itemMarketValue(item, prices, _visited, rates) -> number` (Task 2) is consumed with that exact signature in Task 3's test and Task 4's composer. `itemProductionCost(...) -> {price, source}|null` (Task 3) is consumed by `computeRecipeCost` and Task 4. `buildPricesSection(farm, prices, settings) -> {marketValue, productionCost}` (Task 4) matches the spec's §4.2 payload.

**Known risk carried from the spec (§7):** `duplicated` rises 18 → 30 during this plan and only falls in plan 2. That is the honest reading — the tables genuinely exist twice until their consumers move — but anyone watching the CONSTANTS tab must be told, or it looks like a regression.
