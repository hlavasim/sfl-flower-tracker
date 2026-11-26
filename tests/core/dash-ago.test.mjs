import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";

// The game marks a ready oil reserve with drilledAt: 1 (a 1970 timestamp): CHORES said "6× Oil · 20162d ago".
const SRC = readFileSync(new URL("../../flowers.html", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const start = SRC.indexOf("    function dashAgoText(ms) {");
const dashAgoText = new Function(SRC.slice(start, SRC.indexOf("\n    }\n", start) + 6) + "\nreturn dashAgoText;")();

test("an age from a sentinel timestamp (decades) is not shown; real ages are", () => {
  assert.strictEqual(dashAgoText(Date.now() - 1), "");
  assert.strictEqual(dashAgoText(3 * 86400000 + 5), "3d ago");
  assert.strictEqual(dashAgoText(90 * 60000), "1h 30m ago");
});
