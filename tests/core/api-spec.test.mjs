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
