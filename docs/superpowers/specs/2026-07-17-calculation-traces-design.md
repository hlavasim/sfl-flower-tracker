# Verifiable calculation traces — one implementation that computes AND explains

**Date:** 2026-07-17
**Status:** Design — awaiting review
**Author:** Šimon + Claude
**Parent:** `2026-07-16-backend-frontend-compute-split-design.md`; item-value work `2026-07-17-item-value-layer-design.md`

## 1. Problem

The user wants **every computed number in the app to be able to show its complete step-by-step textual
derivation, so a human can read it and verify it.** Today one calculation has that — the diff page's
"Pricing methods" panel — and it is implemented by `explainItemSfl` (`flowers.html:23403`), a **third,
parallel copy** of the pricing branch logic (alongside `itemMarketValue` and `itemProductionCost`). It
returns `{price, method, detail}` with human strings like `"sell 800c / 1061 c/SFL = 0.75"`.

That is the disease this whole project treats: a calculation implemented more than once drifts. Worse,
`explainItemSfl` is what keeps the inline `estimateItemSfl` alive (it calls it 9× for sub-ingredients),
blocking the deletion of the inline resolver (F2-2h). And an explanation produced by a SEPARATE copy of
the logic doesn't actually prove anything about the REAL calculation — it can explain one thing while
the number came from another.

## 2. Goals / Non-goals

**Goals**
- **One implementation computes the number AND (on request) explains it.** No parallel `explain*` copy.
  The explanation is a byproduct of the real calculation, so it cannot disagree with the number.
- A structured, recursive **trace** — each step carries `{label, formula, value}` and, for derived
  values, its sub-steps — so the frontend can render a readable, verifiable step-by-step tree.
- The price panel is rebuilt on the traced resolvers and shows **both** `marketValue` and
  `productionCost` for each item — turning it into a C6/C8/C9 discrepancy detector (the exact bugs this
  project keeps finding).
- The mechanism **generalises**: the same trace-sink pattern applies to any `core/` calculation later
  (cooking XP, roadmap efficiency, …). This spec delivers the PRICES increment and designs the pattern
  for reuse; other domains are follow-ups.
- Deleting `explainItemSfl` unblocks F2-2h (delete the inline `estimateItemSfl`/`_resolveItemSfl`).

**Non-goals**
- Retrofitting all 27 `core/` functions now — prices first, then roll out.
- Changing any number. Traces are additive; the value a function returns is unchanged whether or not a
  trace is collected.
- Always-on traces. Explain mode is opt-in (`?explain=1`), off by default, so the normal payload and
  hot path are untouched.

## 3. Constraints (binding)

- **No numeric result may change.** A function returns the same value with or without a trace sink.
- **The trace must come from the SAME code path as the value** — that is the whole point. A trace built
  by separate logic (like `explainItemSfl` today) is explicitly what we are removing.
- `core/` stays DOM-free; a trace is plain data (arrays/objects of strings and numbers), not DOM.
- **`api/` stays at 13 files** (Hobby cap 12). Explain rides the existing `?section=` on `api/compute.mjs`.
- No new npm dependencies (repo has one: `pg`).
- Explain mode must not bloat the default payload — traces are attached ONLY when `?explain=1`.
- The hot path (no trace sink) must stay O(1)-branch cheap — a null check, no string building.

## 4. Architecture

### 4.1 `core/` — an optional trace sink, threaded through the real calculation

Each traced function gains an optional last parameter — a `trace` collector. Concretely for
`core/engine/item-value.mjs`:

```
itemMarketValue(itemName, prices, _visited, rates, trace?)
itemProductionCost(itemName, prices, coinsPerSFL, skills, _seen, extras, trace?)
```

- When `trace` is absent (the default), behaviour and cost are exactly as today — every `return`
  path just returns its number.
- When `trace` is present, immediately before each `return`, the function records ONE step describing
  how THAT value was produced, e.g.:
  ```
  { item: "Cheese", method: "crafted recipe", formula: "3 × Milk @ 0.11007", value: 0.33021,
    steps: [ { item: "Milk", method: "market price", formula: "P2P", value: 0.11007 } ] }
  ```
  Recursive ingredient calls pass a fresh child sink, so the trace is a TREE mirroring the actual
  recursion — the step structure IS the call structure, which is why it can't lie.
- A tiny helper keeps the call sites clean, e.g. `const rec = (step) => { if (trace) trace.push(step); return step.value; }` so each branch ends `return rec({item, method, formula, value, steps})`.

The `{item, method, formula, value, steps?}` shape is the canonical trace node reused by every future
traced calculation. `method` is a short machine label ("market price", "crafted recipe", "salt rake",
"fish rod+bait", "treasure sell", "XP value", …); `formula` is the human string; `value` is the number;
`steps` is the child nodes.

### 4.2 API — `?explain=1`, opt-in, prices first

`GET /api/compute?farm=<id>&section=prices&explain=1&rates=<…>` → the existing
`{marketValue, productionCost}` plus, when `explain=1`, parallel `marketTrace`/`productionTrace`
maps keyed by item name, each value a trace node (§4.1). Absent `explain` → today's payload byte-for-byte
(the existing tests pin this).

`buildPricesSection(farm, prices, settings)` gains `settings.explain`; when set, it collects a trace per
item by passing a sink into the resolvers. The universe is the same (§ item-value spec), so the trace
maps cover exactly the items the price maps do — but explain mode is only requested for the panel, and
the panel needs traces only for the DERIVED items (non-trivial method), so the composer may filter to
`method !== "market price"` to keep the explain payload bounded. Decide during implementation; report the
size either way.

### 4.3 Frontend — the "Pricing methods" panel, rebuilt and doubled

The existing panel (`collectDerivedPriceItems` → `flowers.html:26205`, "Pricing methods (N derived
items)") is rebuilt to fetch `?section=prices&explain=1` and render each item's trace as an expandable
step tree. For each item it shows **both** the market and production traces side by side, so a viewer can
SEE when they disagree (Earthworm 7.97×, roadmap-vs-cooking Salt, the Potion-Ticket guess) — the panel
becomes the audit tool for C6/C7/C8/C9.

`explainItemSfl` and `collectDerivedPriceItems`'s inline pricing are DELETED. The panel is now a thin
renderer over the API's traces — one source of truth for both the number and its explanation.

### 4.4 F2-2h unblocked

With `explainItemSfl` gone, the inline `estimateItemSfl` has zero callers. F2-2h deletes it and the inline
`_resolveItemSfl` (already caller-free) plus their private fishing helpers and the dead `estFn`. The
resolver-exclusive tables (POTION_TICKET_COIN_VALUE, EXOTIC_CROPS_TICKET_COST, GIANT_FRUIT_SELL_PRICES)
become inline-dead and are removed → `duplicated` drops ~3 (30 → ~27). The rest stay (other consumers).

## 5. Verification

- **A trace's value equals the map's value, item by item.** The trace's top `value` MUST equal
  `marketValue[item]` / `productionCost[item]` exactly — a test asserts this across the whole universe.
  That is the property that makes the explanation trustworthy: it is the same number, from the same path.
- **No-trace path unchanged**: the existing 90 tests (which never pass a sink) must stay green — proof the
  trace parameter is inert when absent.
- **The panel matches the API**: the rendered steps are exactly what `?explain=1` returns; no client-side
  re-derivation.
- Mutation: break a `formula` string's number and assert the trace-value-equals-map-value test fails
  (the formula must reflect the real numbers).
- Live: the diff page's panel shows the same items it does today, now with both market/production traces;
  no number the diff renders changes (explain is additive).
- **Never derive an expected value by running the code under test** — this project has shipped multiple
  green-but-wrong suites; the trace tests compare trace-value to map-value (two outputs of the same
  function) which is not tautological for the FORMULA (the formula is independent text), but IS for the
  value — so pin formulas against hand-computed strings for a few known items.

## 6. Risks

- **Payload size in explain mode.** Traces for hundreds of derived items could be large. Mitigate: filter
  to derived (non-market) items, and/or accept it since explain is opt-in and only the panel requests it.
  Measure and report.
- **Threading a sink through recursion is invasive.** `itemMarketValue`/`itemProductionCost` recurse a
  lot; every recursive call site must pass the child sink or the tree is truncated. A test that checks a
  known recipe's trace has the right depth guards this.
- **`method`/`formula` drift from the branches.** Since the trace is emitted at each `return` in the SAME
  function, it can't drift from the VALUE — but a `formula` string could still be written wrong. The
  value-equals-map test doesn't catch a wrong formula; the hand-computed-formula spot checks do.
- **Generalisation scope.** "Every calculation" is large. This spec commits only to prices + the reusable
  pattern; cooking/roadmap/etc. are separate, each its own increment. Do not let the goal balloon this task.

## 7. Open questions

1. Explain payload: all universe items or derived-only? Lean derived-only (that's what the panel shows).
   Decide by measuring both.
2. Should the trace node carry the `rates`/`extras` it used (so the panel can show "priced with your rake
   boosts")? Useful for the C9 salt case. Probably yes for production traces — decide in the plan.
3. Naming: `trace` vs `explain` vs `derivation` for the sink/param — cosmetic, pick one and be consistent.
