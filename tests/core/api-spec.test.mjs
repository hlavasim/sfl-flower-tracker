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
  const inCode = new Set([
    // req.query.foo
    ...[...HANDLER.matchAll(/req\.query\.([a-zA-Z_$][\w$]*)/g)].map((m) => m[1]),
    // req.query["foo"] / req.query['foo']
    ...[...HANDLER.matchAll(/req\.query\[\s*["']([^"']+)["']\s*\]/g)].map((m) => m[1]),
  ]);
  assert.deepEqual([...inCode].sort(), [...paramNames].sort(),
    `handler params ${[...inCode]} vs documented ${[...paramNames]}`);
});

// The two tests above read the handler by regex, so they only see the idioms they know:
// `section === "literal"` and `req.query.foo` / `req.query["foo"]`. A param pulled out by
// destructuring, or a section gated by a named constant, would be invisible — the handler
// would read an undocumented param while the suite stayed green. Rather than chase every
// possible idiom, forbid the ones that would blind the guard.
test("the handler sticks to the idioms the drift tests can actually see", () => {
  const destructured = /(?:const|let|var)\s*\{[^}]*\}\s*=\s*req\.query/.test(HANDLER);
  assert.equal(destructured, false,
    "api/compute.mjs destructures req.query — the param drift test cannot see that, so an " +
    "undocumented param would ship green. Use req.query.foo or req.query[\"foo\"] instead.");

  const aliased = /(?:const|let|var)\s+\w+\s*=\s*req\.query\s*[;,)]/.test(HANDLER);
  assert.equal(aliased, false,
    "api/compute.mjs aliases req.query to a variable — reads through the alias are invisible " +
    "to the param drift test. Reference req.query directly.");

  // Every `section === X` comparison must use a string literal, or the section enum check goes blind.
  const sectionCmps = [...HANDLER.matchAll(/section\s*===\s*([^;)\s]+)/g)].map((m) => m[1]);
  const nonLiteral = sectionCmps.filter((c) => !/^["'][a-z]+["']$/.test(c));
  assert.deepEqual(nonLiteral, [],
    `section compared against a non-literal (${nonLiteral}) — the section drift test only ` +
    "matches `section === \"literal\"`, so this section would be undocumented and still green.");
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
