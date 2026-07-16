# Verifiable API surface (constants + OpenAPI) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the API's contract and its canonical data tables visible and mechanically verifiable — an OpenAPI page for `/api/compute` and a CONSTANTS tab rendering `core/data/`, both guarded by tests that fail when code and description disagree.

**Architecture:** One pattern, applied twice: a single source in `core/` → served through an existing route (`?section=`) → rendered by a page → pinned by a drift test that parses the real handler. Nothing is hand-listed: the constants tab enumerates `core/data/` exports, and the OpenAPI spec is checked against `api/compute.mjs`'s actual sections and query params.

**Tech Stack:** Node ESM (`.mjs`), plain `node --test`, vanilla JS in `flowers.html`, Swagger UI from the unpkg CDN.

**Spec:** `docs/superpowers/specs/2026-07-16-api-surface-visibility-design.md`

## Global Constraints

- **Vercel Hobby caps functions at 12; `api/` currently holds 13 files.** Only files directly in `api/` count. **This plan must add ZERO files to `api/`.** Both surfaces ride `?section=` on `api/compute.mjs`; the pages are static files.
- **No new npm dependencies.** The repo has exactly one (`pg`).
- **`api/compute.mjs:23` returns 400 `farm required` BEFORE the section dispatch.** `constants` and `openapi` need no farm → their branches must run before that line.
- **`flowers.html`'s main `<script>` (line 2800) is NOT a module** — it cannot `import` from `core/`. Everything reaches the page over the wire.
- **`core/` is DOM-free**: no `window`, no `document`, no `localStorage`, no `fetch` in `core/`.
- **No numeric result may change.** The cooking payload for farm 155498 must stay: xpPerDay 232509.80 / 186007.84 / 223209.41 / 264712.41 / 167407.06 / 204803.25 (Aging Shed), total 1278649.78.
- **Constants live in code, never Postgres** (spec §6 — explicitly rejected and reasoned).
- If patching `flowers.html` via Python: **BMP characters only** (astral emoji → lone surrogate → `io.open('w').write()` truncates the file to 0 bytes; use `\uXXXX` escapes), assert `t.count(anchor) == 1` before replacing, write with `io.open(P,'w',encoding='utf-8',newline='')`.
- Branch `backend-split-pilot`. **Never push; never touch `main`** (a push to main auto-deploys production).
- No typecheck/lint is configured in this repo — say so, don't invent one.

---

## File Structure

- `core/data/_inventory.mjs` — CREATE: the committed inventory of every game table known to exist in `flowers.html` (`{name, lines}`), the input to the coverage view. Data only.
- `core/sections/constants.mjs` — CREATE: `buildConstantsSection()`. Enumerates `core/data/*` exports and joins them against the inventory to produce `tables` + `coverage`.
- `core/api-spec.mjs` — CREATE: the OpenAPI 3.1 document for `/api/compute` as a plain object. The single source of the contract.
- `api/compute.mjs` — MODIFY: add `section=constants` and `section=openapi` branches ahead of the `farm required` guard.
- `swagger.html` — CREATE: static page, Swagger UI pointed at `/api/compute?section=openapi`.
- `flowers.html` — MODIFY: a CONSTANTS tab rendering `?section=constants`, and a footer link to `/swagger.html`.
- `tests/core/constants.test.mjs` — CREATE: the constants drift tests (inventory vs a fresh scan of `flowers.html`; exports vs payload).
- `tests/core/api-spec.test.mjs` — CREATE: the OpenAPI drift tests (spec vs a parse of `api/compute.mjs`).

---

## Task 1: `section=constants` — the payload + its drift tests

**Files:**
- Create: `core/data/_inventory.mjs`, `core/sections/constants.mjs`, `tests/core/constants.test.mjs`
- Modify: `api/compute.mjs`

**Interfaces:**
- Consumes: every `core/data/*.mjs` module (today: `cooking.mjs`, `crafting.mjs`, `fishing.mjs`, `prices.mjs` — 18 exports; verify with `grep -oE "^export const [A-Z_]+" core/data/*.mjs`).
- Produces:
  - `TABLE_INVENTORY: Array<{name: string, lines: number}>` from `core/data/_inventory.mjs`
  - `buildConstantsSection() -> { tables, coverage, summary }` where
    `tables: { [name]: <the table verbatim> }`,
    `coverage: Array<{name, lines, inCore, inPage, status: "core"|"inline"|"duplicated", file}>`,
    `summary: { total, core, inline, duplicated }`
  - `GET /api/compute?section=constants` → `{ section: "constants", computedAt, data: <the above> }` (no `farm` needed)

**Why `duplicated` exists:** F1 copied the cost/price closure into `core/` while `flowers.html` still uses its own copy for non-cooking pages (see the "TASK 12 IS MUCH NARROWER" note in `.superpowers/sdd/progress.md`). A table can be BOTH in `core/` and live inline. The coverage view must show that honestly — it is the F2 debt, and hiding it would defeat the point of the tab.

- [ ] **Step 1: Generate the inventory from the real file**

Run this and paste the output into `core/data/_inventory.mjs`:

```bash
node -e "
const fs=require('fs');const L=fs.readFileSync('flowers.html','utf8').split('\n');
const re=/^\s*(?:const|let|var)\s+([A-Z][A-Z0-9_]{3,})\s*=\s*[\{\[]/;
const rows=[];
for(let i=0;i<L.length;i++){const m=L[i].match(re); if(!m)continue;
  let d=0,e=i; for(;e<L.length;e++){for(const c of L[e]){if('{['.includes(c))d++;if('}]'.includes(c))d--;} if(e>i&&d<=0)break;}
  rows.push({name:m[1],lines:e-i+1});
}
rows.sort((a,b)=>a.name.localeCompare(b.name));
console.log('export const TABLE_INVENTORY = ' + JSON.stringify(rows,null,2) + ';');
"
```
Expected: ~160 entries (`ITEM_IMAGE_MAP` ~1220 lines, `BOOST_PARSE_RULES` ~347, `SKILL_TREE_DATA` ~168). The exact count is whatever the file says — do not hand-edit the list.

Header the file:
```js
// Inventory of every game data table that exists inline in flowers.html.
// GENERATED — regenerate with the snippet in docs/superpowers/plans/2026-07-16-api-surface-visibility.md
// tests/core/constants.test.mjs re-scans flowers.html and FAILS if this drifts.
```

- [ ] **Step 2: Write the failing tests**

```js
// tests/core/constants.test.mjs
import { test } from "node:test";
import assert from "node:assert";
import { readFileSync, readdirSync } from "node:fs";
import { buildConstantsSection } from "../../core/sections/constants.mjs";
import { TABLE_INVENTORY } from "../../core/data/_inventory.mjs";

const PAGE = new URL("../../flowers.html", import.meta.url);
const DATA_DIR = new URL("../../core/data/", import.meta.url);

function scanPageTables() {
  const L = readFileSync(PAGE, "utf8").split("\n");
  const re = /^\s*(?:const|let|var)\s+([A-Z][A-Z0-9_]{3,})\s*=\s*[{[]/;
  return new Set(L.map((l) => (l.match(re) || [])[1]).filter(Boolean));
}

test("inventory matches a fresh scan of flowers.html", () => {
  const scanned = scanPageTables();
  const listed = new Set(TABLE_INVENTORY.map((t) => t.name));
  const missing = [...scanned].filter((n) => !listed.has(n));
  const stale = [...listed].filter((n) => !scanned.has(n));
  assert.deepEqual(missing, [], `tables in flowers.html but not in _inventory.mjs: ${missing}`);
  assert.deepEqual(stale, [], `tables in _inventory.mjs but no longer in flowers.html: ${stale}`);
});

test("every core/data export is served in tables", async () => {
  const p = buildConstantsSection();
  const files = readdirSync(DATA_DIR).filter((f) => f.endsWith(".mjs") && !f.startsWith("_"));
  for (const f of files) {
    const mod = await import(new URL(f, DATA_DIR));
    for (const [name, value] of Object.entries(mod)) {
      if (typeof value === "function") continue;
      assert.ok(name in p.tables, `${name} (${f}) missing from the constants payload`);
    }
  }
});

test("COOKING_RECIPES_DATA round-trips with all 119 recipes", () => {
  const p = buildConstantsSection();
  assert.equal(Object.keys(p.tables.COOKING_RECIPES_DATA).length, 119);
  assert.equal(p.tables.COOKING_RECIPES_DATA["Pizza Margherita"].building, "Fire Pit");
});

test("coverage marks a core+inline table as duplicated, and an unmigrated one as inline", () => {
  const p = buildConstantsSection();
  const byName = Object.fromEntries(p.coverage.map((c) => [c.name, c]));
  // FISH_DATA is in core/data/fishing.mjs AND still live in flowers.html (F2 debt)
  assert.equal(byName.FISH_DATA.status, "duplicated");
  // ITEM_IMAGE_MAP has not been migrated at all
  assert.equal(byName.ITEM_IMAGE_MAP.status, "inline");
  assert.equal(p.summary.total, TABLE_INVENTORY.length);
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `node --test tests/core/constants.test.mjs`
Expected: FAIL — `Cannot find module ../../core/sections/constants.mjs`.

- [ ] **Step 4: Implement the composer**

```js
// core/sections/constants.mjs
import * as cooking from "../data/cooking.mjs";
import * as crafting from "../data/crafting.mjs";
import * as fishing from "../data/fishing.mjs";
import * as prices from "../data/prices.mjs";
import { TABLE_INVENTORY } from "../data/_inventory.mjs";

// Every core/data module. Adding one here is the ONLY manual step; the test in
// tests/core/constants.test.mjs scans the directory and fails if a module is forgotten.
const MODULES = {
  "core/data/cooking.mjs": cooking,
  "core/data/crafting.mjs": crafting,
  "core/data/fishing.mjs": fishing,
  "core/data/prices.mjs": prices,
};

export function buildConstantsSection() {
  const tables = {};
  const fileOf = {};
  for (const [file, mod] of Object.entries(MODULES)) {
    for (const [name, value] of Object.entries(mod)) {
      if (typeof value === "function") continue; // helpers, not tables
      tables[name] = value;
      fileOf[name] = file;
    }
  }
  const coverage = TABLE_INVENTORY.map((t) => {
    const inCore = t.name in tables;
    const inPage = true; // the inventory IS the list of tables present in flowers.html
    return {
      name: t.name,
      lines: t.lines,
      inCore,
      inPage,
      status: inCore ? (inPage ? "duplicated" : "core") : "inline",
      file: inCore ? fileOf[t.name] : "flowers.html",
    };
  });
  // Tables that live ONLY in core/ (nothing inline left) never appear in the inventory.
  for (const name of Object.keys(tables)) {
    if (!coverage.some((c) => c.name === name)) {
      coverage.push({ name, lines: null, inCore: true, inPage: false, status: "core", file: fileOf[name] });
    }
  }
  coverage.sort((a, b) => a.name.localeCompare(b.name));
  const summary = {
    total: coverage.length,
    core: coverage.filter((c) => c.status === "core").length,
    inline: coverage.filter((c) => c.status === "inline").length,
    duplicated: coverage.filter((c) => c.status === "duplicated").length,
  };
  return { tables, coverage, summary };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test tests/core/constants.test.mjs`
Expected: PASS.

- [ ] **Step 6: Wire the endpoint (before the `farm required` guard)**

In `api/compute.mjs`, import at the top:
```js
import { buildConstantsSection } from "../core/sections/constants.mjs";
```
and insert immediately BEFORE `if (!farmId) return res.status(400).json({ error: "farm required" });` (currently line 23):
```js
  // Sections that describe the API itself need no farm — must branch before the farm guard.
  if (section === "constants") {
    return res.status(200).json({ section, computedAt: new Date().toISOString(), data: buildConstantsSection() });
  }
```

- [ ] **Step 7: Prove the drift tests bite**

Do all three, restoring after each, and report which test caught which:
1. Delete one entry from `TABLE_INVENTORY` → the scan test must FAIL.
2. Add `const FAKE_TABLE = { a: 1 };` inside `flowers.html`'s script → the scan test must FAIL. **Remove it afterwards.**
3. Remove one module from `MODULES` in `constants.mjs` → the "every export is served" test must FAIL.

A green suite is not evidence — this project has twice shipped tests that passed while wrong.

- [ ] **Step 8: Verify live**

Restart the dev-server (`node dev-server.mjs` — **it serves a stale payload after edits unless restarted**), then:
```bash
curl -s "http://localhost:3000/api/compute?section=constants" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const d=JSON.parse(s).data;console.log('summary:',JSON.stringify(d.summary));console.log('tables:',Object.keys(d.tables).length)})"
curl -s "http://localhost:3000/api/compute?farm=155498&section=cooking&petSimulate=1" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log('cooking total still:',JSON.parse(s).data.totalXpPerDay))"
```
Expected: a summary with ~160 total and a nonzero `duplicated`; **`constants` must work with NO `farm` param**; cooking total still `1278649.777`.

- [ ] **Step 9: Commit**

```bash
git add core/data/_inventory.mjs core/sections/constants.mjs api/compute.mjs tests/core/constants.test.mjs
git commit -m "feat(api): section=constants — core/data tables + migration coverage"
```

---

## Task 2: the CONSTANTS tab

**Files:**
- Modify: `flowers.html` (nav, router, a `renderConstants` function)

**Interfaces:**
- Consumes: `GET /api/compute?section=constants` → `{ data: { tables, coverage, summary } }` (Task 1).
- Produces: a `?page=constants` route rendering the tables + the coverage list.

- [ ] **Step 1: Find the patterns to copy**

Run: `grep -n "case \"bumpkin\": renderBumpkin" flowers.html` (the router, ~`:26503`), `grep -n "nav-link" flowers.html | head -3` (the nav), and read `flowers.html:6851` (`_fetchBumpkinP2P` — the established fetch-cache-rerender pattern) plus the Task 11c cooking fetch in `renderBumpkin`.
**Follow the existing patterns; do not invent a new style.** Routing is `?page=<name>` (there is no hash routing).

- [ ] **Step 2: Add the nav entry, route and renderer**

- Add a `CONSTANTS` entry to the nav (put it in the `MORE ▾` menu — it is a debug/inspection surface, not a daily page).
- Add `case "constants": renderConstants(data); break;` to the router.
- `renderConstants` fetches `/api/compute?section=constants` using the same cache-then-rerender pattern as the cooking fetch, and renders:
  - a **summary bar**: `total` / `core` ✅ / `duplicated` ⚠ / `inline` ⏳
  - the **coverage list**: every table with its name, line count, status badge and file. Sort: `inline` first (the work remaining), then `duplicated`, then `core`.
  - the **tables**: one collapsible `<details>` per entry in `tables`, containing `JSON.stringify(value, null, 2)` in a `<pre>`. Collapsed by default — `COOKING_RECIPES_DATA` alone is 119 recipes.
- Escape every rendered string with the existing `escHTML` helper.
- Error path: on fetch failure show a message and do not throw. No unhandled rejections.

- [ ] **Step 3: Verify in the browser**

Restart the dev-server, open `http://localhost:3000/flowers.html?farm=155498&page=constants`.
Expected: the summary bar shows ~160 total with a nonzero `duplicated`; every `core/data` table is listed and expandable; `ITEM_IMAGE_MAP` shows ⏳ `inline`; `FISH_DATA` shows ⚠ `duplicated`. Console clean. Report the ACTUAL rendered summary numbers, not a claim.

- [ ] **Step 4: Confirm nothing else broke**

Run: `python build_harness.py && node --check <scratchpad>/harness.js` → INLINE OK.
Then click Bumpkin, Dashboard and Treasury: no console errors, and Bumpkin's 6 cards still match `.superpowers/sdd/bumpkin-baseline-155498.md` (stable pins: XP/cook, cook time, XP/day; cost columns drift — compare `page === API read simultaneously`).

- [ ] **Step 5: Commit**

```bash
git add flowers.html && git commit -m "feat: CONSTANTS tab — core/data tables + migration coverage"
```

---

## Task 3: `section=openapi` — the spec + its drift tests

**Files:**
- Create: `core/api-spec.mjs`, `tests/core/api-spec.test.mjs`
- Modify: `api/compute.mjs`

**Interfaces:**
- Produces: `API_SPEC` (an OpenAPI 3.1 document object) and `GET /api/compute?section=openapi` → the document (no `farm` needed).

**Do this task AFTER Task 1** — `section=constants` must already exist so the spec's section enum is right the first time.

- [ ] **Step 1: Write the failing drift tests**

```js
// tests/core/api-spec.test.mjs
import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { API_SPEC } from "../../core/api-spec.mjs";

const HANDLER = readFileSync(new URL("../../api/compute.mjs", import.meta.url), "utf8");
const params = API_SPEC.paths["/api/compute"].get.parameters;
const paramNames = new Set(params.map((p) => p.name));

test("every section the handler implements is documented, and vice versa", () => {
  const inCode = new Set([...HANDLER.matchAll(/section === "([a-z]+)"/g)].map((m) => m[1]));
  const inSpec = new Set(params.find((p) => p.name === "section").schema.enum);
  assert.deepEqual([...inCode].sort(), [...inSpec].sort(),
    `handler sections ${[...inCode]} vs documented ${[...inSpec]}`);
});

test("every req.query.X the handler reads is a documented parameter, and vice versa", () => {
  const inCode = new Set([...HANDLER.matchAll(/req\.query\.([a-zA-Z_]+)/g)].map((m) => m[1]));
  assert.deepEqual([...inCode].sort(), [...paramNames].sort(),
    `handler params ${[...inCode]} vs documented ${[...paramNames]}`);
});

test("the document is structurally valid", () => {
  assert.match(API_SPEC.openapi, /^3\.1\./);
  assert.ok(API_SPEC.info.title && API_SPEC.info.version);
  for (const p of params) {
    assert.ok(p.name && p.in === "query" && p.schema && p.description, `parameter ${p.name} incomplete`);
  }
  assert.ok(API_SPEC.paths["/api/compute"].get.responses["200"]);
  assert.ok(API_SPEC.paths["/api/compute"].get.responses["400"]);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/core/api-spec.test.mjs`
Expected: FAIL — `Cannot find module ../../core/api-spec.mjs`.

- [ ] **Step 3: Write the spec**

Create `core/api-spec.mjs` exporting `API_SPEC`, an OpenAPI 3.1 document. **Derive its contents by reading `api/compute.mjs`**, not from this plan — the tests compare against the real handler. As of writing it reads `req.query.farm`, `.section`, `.recipes`, `.petSimulate`, `.coinsPerSFL` and implements `section === "cooking"` plus whatever Task 1 added; **verify the current truth with grep before writing.**

Document, per the real handler:
- `farm` — required for data sections, not for `constants`/`openapi` (400 `farm required` otherwise)
- `section` — enum; describe each
- `petSimulate` — `"1"` enables the pet-streak ×1.5 simulation
- `recipes` — URL-encoded JSON map of building → recipe name; defaults to `BUMPKIN_DEFAULT_RECIPES`
- `coinsPerSFL` — OPTIONAL override; when absent the server derives the Betty rate from live prices
- responses: 200 (with a `cooking` example), 400 (`farm required` / `unknown section`), 502 (farm fetch failed), 500

Add a `servers` entry and an `info.description` stating the endpoint is a pure read and needs no auth.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/core/api-spec.test.mjs`
Expected: PASS.

- [ ] **Step 5: Wire the endpoint**

In `api/compute.mjs`, import `API_SPEC` and add, next to the `constants` branch (before the `farm required` guard):
```js
  if (section === "openapi") return res.status(200).json(API_SPEC);
```
⚠ This adds `section === "openapi"` to the handler — the drift test in Step 1 will now demand it in the spec's enum. That is the mechanism working; add it to the enum.

- [ ] **Step 6: Prove the drift tests bite**

Restore after each; report which test caught which:
1. Add `if (section === "bogus") return res.status(200).json({});` to the handler → the section test must FAIL.
2. Read a new `req.query.zzz` in the handler → the param test must FAIL.
3. Delete a parameter from the spec → the param test must FAIL.

- [ ] **Step 7: Commit**

```bash
git add core/api-spec.mjs api/compute.mjs tests/core/api-spec.test.mjs
git commit -m "feat(api): section=openapi — the contract, pinned to the handler by tests"
```

---

## Task 4: the `/swagger.html` page

**Files:**
- Create: `swagger.html`
- Modify: `flowers.html` (a footer/MORE link)

**Interfaces:**
- Consumes: `GET /api/compute?section=openapi` (Task 3).

- [ ] **Step 1: Create the page**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>SFL Tracker API — /api/compute</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.17.14/swagger-ui.css">
  <style>body { margin: 0; }</style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5.17.14/swagger-ui-bundle.js" crossorigin></script>
  <script>
    window.onload = () => {
      window.ui = SwaggerUIBundle({
        url: "/api/compute?section=openapi",
        dom_id: "#swagger-ui",
        deepLinking: true,
        presets: [SwaggerUIBundle.presets.apis],
        layout: "BaseLayout",
      });
    };
  </script>
</body>
</html>
```
CDN use matches the existing precedent at `flowers.html:2639` (lightweight-charts). Pin the version — do not use `@latest`.

- [ ] **Step 2: Verify in the browser**

Restart the dev-server, open `http://localhost:3000/swagger.html`.
Expected: Swagger UI renders `/api/compute` with every parameter. **Use its "Try it out" on `farm=155498&section=cooking&petSimulate=1` and confirm a 200 with `totalXpPerDay: 1278649.777`.** Also try `section=constants` with no farm → 200. Console clean apart from any CDN noise. Report what you actually saw.

- [ ] **Step 3: Link it from the app**

Add a link to `/swagger.html` in the footer (near the version line) or the `MORE ▾` menu — match the surrounding markup. One line, `target="_blank"`.

- [ ] **Step 4: Confirm nothing broke**

Run: `python build_harness.py && node --check <scratchpad>/harness.js` → INLINE OK
Run: `node --test tests/core/*.test.mjs tests/api/*.test.mjs` → green
Check `api/` is still 13 files: `ls api/*.js api/*.mjs | grep -v _db | wc -l` → **13**.

- [ ] **Step 5: Commit**

```bash
git add swagger.html flowers.html && git commit -m "feat: /swagger.html — browsable API docs from the live spec"
```

---

## Self-Review

**Spec coverage:**
- §4 architecture (single source → `?section=` → page → drift test) → Tasks 1–4. ✓
- §5 constants coverage incl. the honest `inline`/`core` split → Task 1 (extended with `duplicated`, which the spec did not anticipate — F1 created real duplicates; hiding them would defeat the tab's purpose). ✓
- §6 constants in code, not Postgres → no DB anywhere in this plan. ✓
- §7 drift tests, both surfaces, each proven to bite → Task 1 Step 7, Task 3 Step 6. ✓
- §8 sequencing (constants before openapi, so the section enum is right first time) → Task 3's header note. ✓
- §3 zero new Vercel functions → both surfaces ride `?section=`; `swagger.html` is static; asserted in Task 4 Step 4. ✓

**Placeholder scan:** no TBDs. Task 3 Step 3 deliberately says "derive the spec's contents from the real handler" rather than pasting a document — pasting one would go stale between writing this plan and executing it, and the drift tests are the authority. The parameter list and response codes to cover are enumerated concretely.

**Type consistency:** `buildConstantsSection()` returns `{tables, coverage, summary}` in Task 1 and is consumed with those exact names in Task 2. `API_SPEC` is produced in Task 3 and consumed in Tasks 3 (endpoint) and 4 (page). `TABLE_INVENTORY: {name, lines}[]` is produced in Task 1 Step 1 and consumed in Step 4.

**Known risk carried from the spec (§9):** `ITEM_IMAGE_MAP` is ~1220 lines and will dominate the constants payload once migrated. Not a problem today (it is `inline`); revisit with per-table lazy loading when that domain lands.
