# Item value layer — consumer migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move every consumer of `estimateItemSfl` / `_resolveItemSfl` onto the served price maps, then delete the inline resolvers — so item pricing exists in exactly one place and the CONSTANTS tab's `duplicated` counter finally falls.

**Architecture:** Plan 1 (`f0c1f9c`, complete) built `core/engine/item-value.mjs` and serves `?section=prices` as precomputed maps. This plan converts the ~19 external call sites to map lookups, one consumer at a time, each verified against the live pre-migration page, and only then deletes the inline twins.

**Tech Stack:** Node ESM (`.mjs`) in `core/`, vanilla JS in `flowers.html`, plain `node --test`. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-17-item-value-layer-design.md`

## THE PREMISE THAT SHAPES THIS PLAN — read before anything else

The obvious plan ("replace each call with `PRICES.marketValue[name]`") **is wrong and would move numbers.**

`estimateItemSfl(item, p2p, _visited, rates)` — the `rates` argument silently decides which branches can fire, and **four different profiles are in use** (measured 2026-07-17, register item **C8**):

| profile | call sites |
|---|---|
| **no rates at all** | 7 — marks `flowers.html:23849`, `:23867`, `:23871`, `:24181`; deliveries `:24629`, `:24662`, `:24666` |
| `dashRates` (`coinsPerSFL`, `gemsPerSFL` + 2 aliases) | dashboard `:7988` |
| `exchangeRates` (`er`) | roadmap `:16688` |
| **all five** (`coinsPerSFL`, `sflPerXP`, `season`, `treasureBoost`, `gemsPerSFL`) | ROI `:25706` |

Against ROI's full rates, **38 items change value** (every treasure ×1.2 via `treasureBoost`, propagating through crafted/doll/bed chains) and **39 fish become priceable** that otherwise are not. So marks and deliveries today **under-price every treasure by 20% and cannot price fish at all** — not by design, but because nobody passed the argument.

**That is a real bug (C8), and this plan does NOT fix it.** It preserves each site's current behaviour exactly, then the audit collapses the profiles afterwards. Mixing the two would make a migration bug indistinguishable from an intended fix — the discipline that has already caught four defects here.

**Consequence for the design:** the endpoint must serve a map **per rate profile**. `?section=prices` gains a `rates` parameter; the page fetches once per distinct profile it needs (at most 4, ~14.5 KB each) and each call site reads the map matching what it passes today.

## Global Constraints

- **No numeric result may change, anywhere, for any page.** Every consumer must render exactly what it renders today. The gate is the live pre-migration page, compared in the SAME page load (farm 155498 drifts; that has produced false alarms twice).
- **`api/` must stay at 13 files** (Vercel Hobby caps at 12; the build breaks at 14). Everything rides `?section=` on `api/compute.mjs`.
- **No new npm dependencies** (the repo has one: `pg`). `core/` stays DOM-free.
- **`flowers.html`'s main `<script>` (~line 2800) is NOT a module** — it cannot import `core/`. Everything arrives over the wire.
- **Do NOT fix anything that looks wrong.** Record it; there is a register (`.superpowers/sdd/progress.md`) and an audit phase. Specifically DO NOT fix: **C6** (Earthworm 7.97× between the two maps), **C7** (`POTION_TICKET_COIN_VALUE = 15`, provably ~2.3× too high), **C8** (the rate profiles above), **C1** (the shared `_seen` Set).
- **Use `npm run dev`** (= `node --watch dev-server.mjs`). Plain `node dev-server.mjs` serves **stale `core/` modules** — it cache-busts only the handler file, not its static imports. That trap cost six agents and the controller hours; the server now warns, but use the script.
- The upstream rate-limits (`farm fetch failed: 429` → intermittent 502s and blank pages). Not your change; wait ~45s and retry.
- Branch `backend-split-pilot`. **Never push; never touch `main`** (a push to main auto-deploys production).
- No typecheck/lint is configured — say so, don't invent one.

## File Structure

- `core/sections/prices.mjs` — MODIFY: accept a `rates` object; the maps are computed with it.
- `api/compute.mjs` — MODIFY: parse a `rates` query param, forward it. (`core/api-spec.mjs` must then document it, or the drift test fails — that is the guard working.)
- `flowers.html` — MODIFY: a price-map cache keyed by rate profile; then each consumer converted; finally the inline resolvers deleted.
- `tests/core/prices-section.test.mjs` — MODIFY: pin that each profile produces the values its call site sees today.

---

## Task 1: `?section=prices` accepts a rate profile

**Files:**
- Modify: `core/sections/prices.mjs`, `api/compute.mjs`, `core/api-spec.mjs`, `tests/core/prices-section.test.mjs`

**Interfaces:**
- Produces: `GET /api/compute?farm=<id>&section=prices&rates=<url-encoded JSON>` → the same `{marketValue, productionCost}` shape, computed with the supplied rates. Absent `rates` keeps today's behaviour (`coinsPerSFL` derived server-side) so nothing existing breaks.

- [ ] **Step 1: Write the failing test — pin that rates CHANGE the map**

The whole reason this parameter exists is that rates change prices. Pin it with the measured facts, and derive the expectation from the treasure table, not from the composer:

```js
test("treasureBoost changes treasure prices — the rates parameter is load-bearing", () => {
  const bare = buildPricesSection(farm, p2p, { coinsPerSFL: 1061.0079575596817 });
  const boosted = buildPricesSection(farm, p2p, { coinsPerSFL: 1061.0079575596817, treasureBoost: 1.2 });
  // Pick any TREASURE_SELL_PRICES item; its marketValue must scale by exactly the boost.
  const t = "Pirate Bounty";
  assert.ok(bare.marketValue[t] > 0, `${t} must be priced at all`);
  assert.ok(Math.abs(boosted.marketValue[t] - bare.marketValue[t] * 1.2) < 1e-9,
    `boosted ${boosted.marketValue[t]} != bare ${bare.marketValue[t]} * 1.2`);
});

test("sflPerXP makes fish priceable that otherwise are not", () => {
  const bare = buildPricesSection(farm, p2p, { coinsPerSFL: 1061.0079575596817 });
  const withXp = buildPricesSection(farm, p2p, { coinsPerSFL: 1061.0079575596817, sflPerXP: 0.0001 });
  const fishOnlyInXp = Object.keys(withXp.marketValue).filter((k) => !(k in bare.marketValue));
  assert.ok(fishOnlyInXp.length > 0, "sflPerXP must unlock items that are otherwise unpriceable");
});
```
⚠ Verify `Pirate Bounty` really is in `TREASURE_SELL_PRICES` and really is boosted by `treasureBoost` before pinning it — grep `core/engine/item-value.mjs`. If it is not, pick one that is and say which. **Do not derive the expected value by running the composer** — this project has shipped three green-but-wrong suites, one of them from exactly that.

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/core/prices-section.test.mjs`
Expected: FAIL — `buildPricesSection` ignores the extra rates today.

- [ ] **Step 3: Thread `rates` through**

`buildPricesSection(farm, prices, settings)` already takes `settings.coinsPerSFL`. Widen it to carry the whole rates object through to `itemMarketValue(item, prices, null, rates)`. Keep `settings.coinsPerSFL` working exactly as now when no other rates are given — **absent `rates` must reproduce today's map byte-for-byte** (that is what the existing 79 tests pin).

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/core/*.test.mjs tests/api/*.test.mjs` → green (was 79/79, +2).

- [ ] **Step 5: Wire the query param**

In `api/compute.mjs`, parse `req.query.rates` as URL-encoded JSON (mirror how `req.query.recipes` is parsed — read it first), and merge it into `settings`. An absent/unparseable `rates` must fall back to today's behaviour, not 500.
⚠ Adding `req.query.rates` makes the OpenAPI drift test DEMAND it in `core/api-spec.mjs`'s parameter list. Add it, with a description that says what it is for and that omitting it derives `coinsPerSFL` server-side. **That is the guard working, not a failure.**

- [ ] **Step 6: Verify live**

`npm run dev`, then:
```bash
curl -s "http://localhost:3000/api/compute?farm=155498&section=prices" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const d=JSON.parse(s).data;console.log('no rates :',Object.keys(d.marketValue).length,'items')})"
curl -s "http://localhost:3000/api/compute?farm=155498&section=prices&rates=$(node -e 'console.log(encodeURIComponent(JSON.stringify({coinsPerSFL:1061,sflPerXP:0.0001,treasureBoost:1.2})))')" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const d=JSON.parse(s).data;console.log('full rates:',Object.keys(d.marketValue).length,'items')})"
```
Expected: the full-rates map has **more** items (the ~39 fish `sflPerXP` unlocks). Report the real numbers.

- [ ] **Step 7: Commit**

```bash
git add core/sections/prices.mjs api/compute.mjs core/api-spec.mjs tests/
git commit -m "feat(api): section=prices accepts a rate profile"
```

---

## Task 2: the price-map cache in `flowers.html`

**Files:**
- Modify: `flowers.html`

**Interfaces:**
- Produces: a fetch-once-per-profile cache, so a consumer can synchronously read `PRICES(profile).marketValue[name]`. No consumer converted yet.

- [ ] **Step 1: Read the pattern you are copying**

Read the cooking payload cache (`flowers.html:~6836-6901`) — keyed fetch, cache-then-rerender, error key, `refresh()` clearing. **Follow it.** Do not invent a new one. Note `refresh()` (`:~23017`) must clear this cache too, or REFRESH will serve stale prices for the page's lifetime — that exact bug shipped once already (`5a1d9a9`).

- [ ] **Step 2: Add the cache**

Keyed by `farm + JSON.stringify(rates)`. Same shape as the cooking cache: a slot per key, an in-flight guard, an error key, a re-render on arrival. At most 4 profiles are live (see the table above), so a small map is fine — but do not let it grow unbounded on arbitrary keys.

- [ ] **Step 3: Verify nothing changed yet**

Run: `python build_harness.py` and the inline syntax check (see any earlier task's brief for the one-liner — do NOT trust a stale scratch file). `npm run dev`, load Bumpkin, Dashboard, Treasury, Roadmap: identical to now, console clean. **No consumer reads the cache yet — this task must be invisible.**

- [ ] **Step 4: Commit**

```bash
git add flowers.html && git commit -m "feat: price-map cache, one entry per rate profile"
```

---

## Task 3+: convert ONE consumer per task

**Do not batch these.** One consumer per task, each with its own before/after capture. The consumers, in ascending risk:

| # | consumer | sites | rates profile |
|---|---|---|---|
| 3 | marks | `flowers.html:23849`, `:23867`, `:23871`, `:24181` | none |
| 4 | deliveries | `:24629`, `:24662`, `:24666` | none |
| 5 | dashboard | `:7988` (via `window.estimateItemSfl`) | `dashRates` |
| 6 | roadmap | `:16688` (via `window.`), `:16714` (`estFn`), `:18022` (`estFn`) | `exchangeRates` |
| 7 | ROI | `:25706` | all five |

**For each consumer task:**

- [ ] **Step 1: Capture the BEFORE, from the live page**

Open the page, record every number it renders that comes from a price. Save it to `.superpowers/sdd/<consumer>-baseline.md`. **This is the only acceptable ground truth** — not a number computed by `core/`, and not one written down earlier (the farm drifts).

- [ ] **Step 2: Convert the call sites to map lookups**

Replace `estimateItemSfl(x, p2p, null, rates)` with a lookup in the map for **that site's existing profile**. Keep `|| 0` fallbacks exactly as they are — the map omits unpriceable items deliberately (absence ≠ 0), and the existing `|| 0` preserves today's behaviour.

⚠ **`window.estimateItemSfl` is a seam, not just a function.** `flowers.html:23309` exports it globally and `:7983`, `:16688`, `:16714`, `:18022` reach it through `window` with feature-detects. A lexical find-and-replace MISSES those. Grep for `window.estimateItemSfl` and `estFn` before declaring a consumer converted. (That global has already caused one production bug: changelog `:6391` records it being assigned before the function was bound, so prices silently read 0.)

- [ ] **Step 3: Compare AFTER against the baseline, in one page load**

Every number identical. Any difference is a Critical finding — report it, do not adjust anything to match. If a number moves, you have found either a real bug in the conversion or an instance of C8; say which.

- [ ] **Step 4: Commit**

```bash
git add flowers.html && git commit -m "refactor: <consumer> prices read from /api/compute?section=prices"
```

---

## Task 8: delete the inline resolvers

**Only when grep proves 0 remaining callers.**

- [ ] **Step 1: Prove they are dead**

```bash
grep -n "estimateItemSfl\|_resolveItemSfl\|computeRodCostSFL\|computeFishEffectiveCost\|computeBaitCostSFL" flowers.html
```
Expected: definitions only, plus `window.estimateItemSfl = …`. **If ANY call site remains, that consumer was not converted — stop and report which.** Repo rule: never delete code without asking; when in doubt, keep it and list it.

- [ ] **Step 2: Delete, including the `window.` export**

BMP-only Python patch (astral emoji → lone surrogate → `io.open('w').write()` truncates the file to 0 bytes; use `\uXXXX`), assert `t.count(anchor) == 1`, write with `io.open(P,'w',encoding='utf-8',newline='')`.

- [ ] **Step 3: Full regression**

`python build_harness.py`, the inline syntax check, `npm run dev`, and walk EVERY page: Bumpkin (6 cards, combined 1,278,650), Dashboard, Treasury, Roadmap, Power, Nodes, ROI, Marks. Console clean. Compare each against its baseline.

- [ ] **Step 4: The scoreboard should finally move**

`?page=constants` — `duplicated` must FALL for the tables whose last inline consumer just died. Report the before/after summary. This is the first time in the project that number goes down; if it does not, something is still inline.

- [ ] **Step 5: Commit**

```bash
git add flowers.html && git commit -m "chore: delete the inline item-price resolvers — pricing now lives only in core/"
```

---

## Self-Review

**Spec coverage:** §4.2's precomputed-map transport → Tasks 1–2. §5's "convert one consumer at a time, each verified against the live page" → Tasks 3–7. §5's "delete the twin only when its last consumer is gone" → Task 8. §2's non-goal "do not fix Earthworm" → Global Constraints, plus C7/C8/C1 named alongside it. ✓

**The spec did NOT anticipate C8** (four rate profiles). This plan adds the `rates` parameter to cover it and defers the profile disagreement to the audit. That is a deviation from the spec's single-map picture, and it is recorded here rather than silently absorbed.

**Placeholder scan:** none. The consumer table carries real line numbers; the tests are runnable.

**Type consistency:** `buildPricesSection(farm, prices, settings)` keeps its signature; `settings` gains the rates. The payload shape `{marketValue, productionCost}` is unchanged from plan 1 and is what Tasks 3–7 read.

**Known risk:** ~19 call sites across 5 consumers, plus a `window.` global with 4 non-lexical readers. The cooking pilot's 6 planned tasks became 12. Budget accordingly; the per-consumer split exists so a surprise costs one task, not the plan.
