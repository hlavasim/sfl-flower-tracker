import { test } from "node:test";
import assert from "node:assert";
import { readFileSync, readdirSync } from "node:fs";

// Every `typeof TABLE !== "undefined"` guard in core/ is a landmine.
//
// The guards are verbatim survivors of the inline world, where a table might genuinely
// not be defined yet and `typeof` was the safe way to ask. Inside a module they behave
// very differently: `typeof` on an identifier that was never imported does NOT throw —
// it quietly evaluates to "undefined", the branch is skipped, and the function returns
// 0/null as if the item simply had no price.
//
// This is not hypothetical. Extracting itemMarketValue (F2-1b) shipped a draft whose
// import line omitted CRUSTACEAN_RECIPES. No ReferenceError, no failing unit test —
// the whole crustacean branch just returned 0, pricing Crab Stick at 0.0138 instead of
// 2.6665 (193x wrong). All four of that task's unit tests passed; only a full 417-item
// diff against the live page caught it.
//
// So: assert that every guarded name is actually reachable in the file that guards it.
// A dropped import becomes a red test instead of a silently wrong number.

// SCOPE, stated honestly: this matches `typeof NAME` where NAME is ALL_CAPS — the
// convention for the data tables, and it covers all 20 guards that exist today. It
// deliberately does not chase every spelling; a guard written some other way is
// invisible to it. The regex accepts `!==`/`===`, either quote style, and optional
// parens, because those are cheap. Non-ALL_CAPS names are out of scope on purpose:
// widening to any identifier would false-positive on function parameters (e.g.
// `typeof extras !== "undefined"`), which are not imports and cannot be checked here.

const CORE = new URL("../../core/", import.meta.url);

function coreFiles(dir = CORE, prefix = "core") {
  const out = [];
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (e.isDirectory()) {
      out.push(...coreFiles(new URL(e.name + "/", dir), `${prefix}/${e.name}`));
    } else if (e.name.endsWith(".mjs")) {
      out.push({ path: `${prefix}/${e.name}`, src: readFileSync(new URL(e.name, dir), "utf8") });
    }
  }
  return out;
}

test("every `typeof X !== \"undefined\"` guard in core/ names something the file can actually see", () => {
  const offenders = [];
  let guardCount = 0;

  for (const { path, src } of coreFiles()) {
    const guarded = [...src.matchAll(/typeof\s*\(?\s*([A-Z_][A-Z_0-9]*)\s*\)?\s*[!=]==\s*['"]undefined['"]/g)].map((m) => m[1]);
    if (!guarded.length) continue;

    // Names this file can see: anything named in an import, or declared locally.
    const imported = [...src.matchAll(/^import\s*\{([^}]+)\}\s*from/gm)]
      .flatMap((m) => m[1].split(",").map((s) => s.trim().split(/\s+as\s+/).pop().trim()));

    for (const name of [...new Set(guarded)]) {
      guardCount++;
      // \s* prefix: verbatim page extractions keep their 4-space indentation.
      const declaredLocally = new RegExp(`^\\s*(?:export\\s+)?(?:const|let|var|function)\\s+${name}\\b`, "m").test(src);
      if (!imported.includes(name) && !declaredLocally) {
        offenders.push(`${path}: guards \`${name}\` but never imports or declares it — that branch is dead and returns 0/null silently`);
      }
    }
  }

  assert.ok(guardCount > 0, "found no typeof guards at all — has the pattern changed? update this test rather than deleting it");
  assert.deepEqual(offenders, [], "\n" + offenders.join("\n") + "\n");
});
