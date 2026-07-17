# Calculation traces (prices increment) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** One implementation of item pricing that also, on request, emits a step-by-step trace; rebuild the diff page's "Pricing methods" panel on it showing market vs production; delete the third resolver `explainItemSfl`; then delete the now-caller-free inline `estimateItemSfl`/`_resolveItemSfl`.

**Architecture:** Add an optional `trace` sink to `itemMarketValue`/`itemProductionCost` (inert when absent). `?section=prices&explain=1` attaches per-item trace trees. The panel renders them. Then the inline resolvers are deleted.

**Tech Stack:** Node ESM (`.mjs`), `node --test`, vanilla JS in `flowers.html`.

**Spec:** `docs/superpowers/specs/2026-07-17-calculation-traces-design.md`

## Global Constraints

- **No numeric result may change.** A function returns the same value with or without a trace sink. Cooking pins: total 1278649.777. Prices no-rates: 288 marketValue items (352 with seed aliases — the current live count is 352; use it).
- **The trace must come from the SAME return path as the value.** No parallel explain logic. `explainItemSfl` (the current parallel copy) is DELETED, not kept.
- Explain is opt-in (`?explain=1`); absent → today's payload byte-for-byte (the 90 existing tests pin this — they never pass a sink).
- `core/` DOM-free; a trace is plain data. `api/` stays 13 files. No new deps.
- Use `npm run dev` (plain `node dev-server.mjs` serves stale `core/`).
- The upstream rate-limits (429 → intermittent 502/blank); wait ~45s, retry.
- Branch `backend-split-pilot`. Never push; never touch `main`.
- No typecheck/lint configured — say so.

## Trace node shape (canonical, reused everywhere later)
```
{ item: string, method: string, formula: string, value: number, steps?: TraceNode[] }
```
`method` = short machine label; `formula` = human string; `value` = the number; `steps` = children (the recursion).

---

## Task 1: trace sink in `itemMarketValue`

**Files:** Modify `core/engine/item-value.mjs`; Test `tests/core/item-trace.test.mjs` (new).

- [ ] **Step 1: failing test** — the trace's value equals the plain value, and a known recipe's trace has structure:
```js
// tests/core/item-trace.test.mjs
import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { itemMarketValue } from "../../core/engine/item-value.mjs";
const p2p = JSON.parse(readFileSync(new URL("../fixtures/p2p-prices.json", import.meta.url)));
const R = { coinsPerSFL: 1061.0079575596817 };

test("a trace's top value equals the plain return, and mirrors the recursion", () => {
  const plain = itemMarketValue("Cheese", p2p, null, R);              // Cheese = 3 Milk (derived)
  const trace = [];
  const traced = itemMarketValue("Cheese", p2p, null, R, trace);
  assert.equal(traced, plain, "traced return must equal untraced return");
  assert.equal(trace.length, 1, "one top-level step");
  const node = trace[0];
  assert.equal(node.item, "Cheese");
  assert.equal(node.value, plain);
  assert.ok(node.steps && node.steps.some((s) => s.item === "Milk"), "recursion captured as child steps");
  assert.match(node.formula, /Milk/);                                 // human formula names the ingredient
});

test("the trace parameter is inert when absent (value unchanged)", () => {
  assert.equal(itemMarketValue("Cheese", p2p, null, R), itemMarketValue("Cheese", p2p, null, R, undefined));
});
```

- [ ] **Step 2:** run → FAIL (5th param ignored, `trace` stays empty).

- [ ] **Step 3: implement.** Add optional `trace` as the last param. Add a helper at the top:
```js
function emit(trace, node) { if (trace) trace.push(node); return node.value; }
```
At EVERY `return <number>` in `itemMarketValue`, replace with `return emit(trace, { item: itemName, method, formula, value, steps })` where:
- `method` is the branch's short label ("market price", "crafted recipe", "food recipe", "flower", "treasure", "XP value", "giant", "gem", "bait", "fish", …).
- `formula` is a human string of the actual numbers (e.g. `` `3 × Milk @ ${milk}` ``).
- `steps` is a child array you pass into recursive ingredient calls: `const kids = []; const p = itemMarketValue(ing, prices, visited, rates, trace ? kids : undefined);` then include `steps: kids` in the node. **Only build `kids` when `trace` is truthy** (hot path stays cheap).
- **The VALUE returned must be byte-identical to today** — `emit` returns `node.value`, so compute `value` exactly as the old `return` did.

- [ ] **Step 4:** run → PASS. Then `node --test tests/core/*.test.mjs tests/api/*.test.mjs` → 90 existing + new, all green (existing tests never pass a sink → prove inertness).

- [ ] **Step 5: prove the trace can't lie about the value** — a test over many items: for each, `itemMarketValue(x, p2p, null, R)` (plain) equals `trace[0].value` from the traced call. Zero mismatches.

- [ ] **Step 6: commit** `feat(core): itemMarketValue emits an optional derivation trace`.

---

## Task 2: trace sink in `itemProductionCost`

**Files:** Modify `core/engine/item-value.mjs`; extend `tests/core/item-trace.test.mjs`.

- [ ] **Step 1: failing test** — Salt's production trace shows the rake derivation and its value equals `itemProductionCost("Salt", …).price`:
```js
import { itemProductionCost } from "../../core/engine/item-value.mjs";
test("productionCost trace explains the Salt rake derivation, value matches", () => {
  const plain = itemProductionCost("Salt", p2p, R.coinsPerSFL, {}, undefined, {});
  const trace = [];
  const traced = itemProductionCost("Salt", p2p, R.coinsPerSFL, {}, undefined, {}, trace);
  assert.equal(traced.price, plain.price);
  assert.equal(trace[0].value, plain.price);
  assert.equal(trace[0].method, "salt rake"); // or whatever label you pick — keep it consistent
  assert.match(trace[0].formula, /rake/i);
});
```
(Note `itemProductionCost` returns `{price, source}|null`; `emit` records `value: result.price` but the function still returns the object. Adapt `emit` or record explicitly — keep the returned object shape unchanged.)

- [ ] **Step 2–4:** run → fail → implement (same pattern, last param `trace`; thread child sinks through `_seen` recursion) → pass. Cooking pins unchanged (`computeRecipeCost` calls `itemProductionCost` WITHOUT a sink → inert).

- [ ] **Step 5: commit** `feat(core): itemProductionCost emits an optional derivation trace`.

---

## Task 3: `?section=prices&explain=1`

**Files:** Modify `core/sections/prices.mjs`, `api/compute.mjs`, `core/api-spec.mjs`; Test `tests/core/prices-section.test.mjs`, `tests/api/compute.test.mjs`.

- [ ] **Step 1: failing test** — `buildPricesSection(farm, p2p, {explain:true})` adds `marketTrace`/`productionTrace` maps whose per-item top value equals the corresponding map value:
```js
test("explain mode attaches traces whose values equal the map values", () => {
  const p = buildPricesSection(farm, p2p, { coinsPerSFL: 1061.0079575596817, explain: true });
  assert.ok(p.marketTrace && p.productionTrace, "traces present in explain mode");
  for (const [item, node] of Object.entries(p.marketTrace)) {
    assert.equal(node.value, p.marketValue[item], `marketTrace[${item}] value must equal the map`);
  }
});
test("no explain flag → no traces, map byte-identical to today", () => {
  const p = buildPricesSection(farm, p2p, { coinsPerSFL: 1061.0079575596817 });
  assert.equal(p.marketTrace, undefined);
  assert.equal(Object.keys(p.marketValue).length, 352);
});
```

- [ ] **Step 2–4:** implement `settings.explain`; when set, call the resolvers with a sink per item and collect `marketTrace`/`productionTrace`. **Consider filtering to DERIVED items** (method !== "market price") to bound payload — measure both and report. Wire `req.query.explain === "1"` in `api/compute.mjs` into `settings.explain`. The openapi drift test demands `explain` in the param list → add it to `core/api-spec.mjs` with a description (that is the guard working). Run → 90+ green.

- [ ] **Step 5: verify live + measure payload.** `npm run dev`; `?section=prices` (no explain) → 352 items, no trace keys, same as now; `?section=prices&explain=1` → traces present, report the byte size vs plain.

- [ ] **Step 6: commit** `feat(api): section=prices explain=1 attaches per-item derivation traces`.

---

## Task 4: rebuild the "Pricing methods" panel + delete `explainItemSfl`

**Files:** Modify `flowers.html`.

- [ ] **Step 1: capture BEFORE** — `npm run dev`, open the diff page, expand "Pricing methods (N derived items)", record what it shows for a few derived items.

- [ ] **Step 2: rebuild.** Replace `collectDerivedPriceItems`/`explainItemSfl` usage with a fetch of `?section=prices&explain=1` (reuse the `PRICES` cache pattern — read how F2-2b/consumer tasks call it; you may extend the cache key with an `explain` flag or add a sibling accessor). Render each derived item's trace as an expandable step tree, showing **both** the market and production traces side by side (the C6/C8/C9 detector). Add a per-item "show calculation" toggle (the step tree collapsed by default).

- [ ] **Step 3: DELETE** `explainItemSfl` (`:23403`) and the inline pricing inside `collectDerivedPriceItems`. Confirm `grep -n "explainItemSfl" flowers.html` → gone.

- [ ] **Step 4: verify.** `python build_harness.py`; inline syntax check; `node --test …` 90+ green. Live: the panel shows the same derived items, now with market+production traces and a toggle; **no number the diff renders changes**. Console clean.

- [ ] **Step 5: confirm the seam.** `grep -c "estimateItemSfl(" flowers.html` — should now be just the definition + its internal recursion + the `window.` assignment + the dead `estFn` (NO live external caller). Report the exact remaining references.

- [ ] **Step 6: commit** `feat: Pricing methods panel renders API traces (market+production); delete explainItemSfl`.

---

## Task 5 (F2-2h): delete the inline resolvers

**Files:** Modify `flowers.html`.

- [ ] **Step 1: prove dead.** `grep -n "estimateItemSfl\|_resolveItemSfl\|computeRodCostSFL\|computeFishEffectiveCost\|computeBaitCostSFL" flowers.html` — expect only definitions, internal recursion, the `window.estimateItemSfl =` line, and the dead `estFn` (`:16799`, `:18107`). **If any LIVE external caller remains, STOP and name it.**

- [ ] **Step 2: delete** the inline `estimateItemSfl`, `_resolveItemSfl`, their private fishing helpers (`computeRodCostSFL`/`computeFishEffectiveCost`/`computeBaitCostSFL` — confirm 0 callers first; `computeBettyRate` STAYS, it has non-cooking callers), the `window.estimateItemSfl =` assignment, and the two dead `estFn` assignments. BMP-only Python patch; assert `t.count(anchor)==1`; `io.open(P,'w',encoding='utf-8',newline='')`.

- [ ] **Step 3: delete now-orphaned tables.** For each of `POTION_TICKET_COIN_VALUE`, `EXOTIC_CROPS_TICKET_COST`, `GIANT_FRUIT_SELL_PRICES`: `grep -c` — if 0 refs remain (definition only), delete the inline table. **KEEP every table still referenced** (ITEM_XP_VALUES, GIANT_ITEM_COIN_PRICES, RECIPE_INGREDIENTS, FLOWER_RECIPES, DOLL_RECIPES, SEED_COSTS, TOOL_COSTS, FLOWER_SEED_COIN_COSTS, TREASURE_SELL_PRICES, PET_FETCH_DATA — they have other consumers). Grep each before deleting.

- [ ] **Step 4: full regression.** `python build_harness.py`; inline syntax check; `node --test …` 90+ green. Live: walk EVERY page (Bumpkin 6 cards/1,278,650, Marks, Dashboard, Roadmap, ROI/diff incl. the new panel, Power, Nodes). No number changes, console clean.

- [ ] **Step 5: the scoreboard moves.** `?page=constants` — report `duplicated` before/after; it should drop by the number of tables deleted in Step 3 (~3). This is the FIRST time the counter falls. Report the real numbers.

- [ ] **Step 6: commit** `chore: delete inline price resolvers now that all consumers read the API`.

---

## Self-Review

**Spec coverage:** §4.1 trace sink → Tasks 1–2. §4.2 explain API → Task 3. §4.3 panel + delete explainItemSfl → Task 4. §4.4 F2-2h → Task 5. §5 verification (trace value == map value; inert when absent) → Task 1 Step 5, Task 3 Step 1. ✓

**Placeholder scan:** none. Test code is concrete; the trace shape is fixed in the header.

**Type consistency:** trace node `{item, method, formula, value, steps?}` used identically in Tasks 1–4. `itemMarketValue(..., trace?)` and `itemProductionCost(..., trace?)` signatures match the spec. `buildPricesSection(..., {explain})` → `marketTrace`/`productionTrace` consumed in Task 4.

**Key risk:** threading the child sink through recursion — Task 1 Step 3 is explicit that `kids` is only built when `trace` is truthy, keeping the hot path cheap and the tree complete. The value-equals-map test (Task 1 Step 5) is the guard that the refactor changed no number.
