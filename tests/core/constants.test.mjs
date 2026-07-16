import { test } from "node:test";
import assert from "node:assert";
import { readFileSync, readdirSync } from "node:fs";
import { buildConstantsSection } from "../../core/sections/constants.mjs";
import { TABLE_INVENTORY } from "../../core/data/_inventory.mjs";

const PAGE = new URL("../../flowers.html", import.meta.url);
const DATA_DIR = new URL("../../core/data/", import.meta.url);

const pageLines = () => readFileSync(PAGE, "utf8").split("\n");

// Part 1 of the inventory: tables declared as an object/array literal.
function scanPageTables() {
  const re = /^\s*(?:const|let|var)\s+([A-Z][A-Z0-9_]{3,})\s*=\s*[{[]/;
  return new Set(pageLines().map((l) => (l.match(re) || [])[1]).filter(Boolean));
}

// Every non-function export of core/data/*.mjs — what core CLAIMS to own.
async function coreDataExports() {
  const files = readdirSync(DATA_DIR).filter((f) => f.endsWith(".mjs") && !f.startsWith("_"));
  const names = [];
  for (const f of files) {
    const mod = await import(new URL(f, DATA_DIR));
    for (const [name, value] of Object.entries(mod)) {
      if (typeof value === "function") continue;
      names.push(name);
    }
  }
  return names;
}

// Part 2 of the inventory: is `name` declared inline at all, table-shaped or not?
// Reads flowers.html directly — independent of anything core computes.
function declaredInPage(name) {
  const re = new RegExp(`^\\s*(?:const|let|var)\\s+${name}\\s*=`);
  return pageLines().some((l) => re.test(l));
}

test("inventory matches a fresh scan of flowers.html", () => {
  const scanned = scanPageTables();
  const listed = new Set(TABLE_INVENTORY.map((t) => t.name));
  const missing = [...scanned].filter((n) => !listed.has(n));
  assert.deepEqual(missing, [], `tables in flowers.html but not in _inventory.mjs: ${missing}`);
});

// The scan above cannot see a non-table-shaped constant, which is exactly how
// SALT_BASE_YIELD hid: it is live at flowers.html:4842 but reported as freed.
// Re-derive part 2 as well, so a scalar moved into core/ can never silently
// show up as "core" (migrated) while its inline twin is still there.
test("inventory also lists every core/data export that is still declared inline", async () => {
  const scanned = scanPageTables();
  const listed = new Set(TABLE_INVENTORY.map((t) => t.name));
  const shouldBeListed = (await coreDataExports())
    .filter((n) => !scanned.has(n) && declaredInPage(n));
  const missing = shouldBeListed.filter((n) => !listed.has(n));
  assert.deepEqual(missing, [], `core/data exports still declared inline but absent from _inventory.mjs: ${missing}`);
});

test("no inventory entry is stale — every listed name is really in flowers.html", () => {
  const scanned = scanPageTables();
  const stale = TABLE_INVENTORY.map((t) => t.name)
    .filter((n) => !scanned.has(n) && !declaredInPage(n));
  assert.deepEqual(stale, [], `tables in _inventory.mjs but no longer in flowers.html: ${stale}`);
});

test("every core/data export is served in tables", async () => {
  const p = buildConstantsSection();
  for (const name of await coreDataExports()) {
    assert.ok(name in p.tables, `${name} missing from the constants payload`);
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

// Regression pin for the blind spot this tab was built to expose. SALT_BASE_YIELD is
// exported by core/data/cooking.mjs AND declared at flowers.html:4842 — genuinely
// duplicated. It is a scalar, so the table-shaped scan misses it; before the per-name
// check it reported "core", i.e. the one table the ledger believed the pilot had freed.
// It had freed none.
test("SALT_BASE_YIELD is duplicated, not freed (scalar the table scan cannot see)", () => {
  const p = buildConstantsSection();
  const byName = Object.fromEntries(p.coverage.map((c) => [c.name, c]));
  assert.ok(declaredInPage("SALT_BASE_YIELD"), "expected SALT_BASE_YIELD still inline in flowers.html");
  assert.equal(byName.SALT_BASE_YIELD.status, "duplicated");
  assert.equal(byName.SALT_BASE_YIELD.file, "core/data/cooking.mjs");
});

// The pilot's honest score: core owns 18 tables, every one of which is still live
// inline. Nothing has been freed yet. Counted from the page + core, not from the
// composer's own summary.
test("summary counts match an independent count of the page and core", async () => {
  const p = buildConstantsSection();
  const coreNames = new Set(await coreDataExports());
  const listed = TABLE_INVENTORY.map((t) => t.name);
  const expDuplicated = listed.filter((n) => coreNames.has(n) && declaredInPage(n)).length;
  const expInline = listed.filter((n) => !coreNames.has(n)).length;
  assert.equal(p.summary.duplicated, expDuplicated);
  assert.equal(p.summary.inline, expInline);
  assert.equal(p.summary.core, p.summary.total - expDuplicated - expInline);
  assert.equal(p.summary.total, p.summary.core + p.summary.inline + p.summary.duplicated);
});
