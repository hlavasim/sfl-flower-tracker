import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import vm from "node:vm";

/*
 * The wishlist's ✕ and its priority dots put the item key inside a single-quoted JS string
 * that lives inside an HTML attribute: onclick="_wlRemove('<key>')".
 *
 * escHTML does not escape the apostrophe, so `collectibles:Grinx's Hammer` closed the string
 * early and the handler became a syntax error — clicking did nothing at all, silently, for
 * every boosted NFT with an apostrophe in its name (Grinx's Hammer, Reelmaster's Chair,
 * Victoria's Apron, Autumn's Embrace, Luna's Hat). You could add them and never remove them.
 *
 * These tests run the page's OWN escapers, lifted out of flowers.html, and then actually
 * parse the attribute they produce. Asserting on the escaped text alone would not prove the
 * browser can execute it.
 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const page = readFileSync(path.join(ROOT, "flowers.html"), "utf8");

function lift(name) {
  const i = page.indexOf(`function ${name}(`);
  assert.ok(i > 0, `${name} not found in flowers.html`);
  let depth = 0;
  for (let k = page.indexOf("{", i); k < page.length; k++) {
    if (page[k] === "{") depth++;
    else if (page[k] === "}") { depth--; if (depth === 0) return page.slice(i, k + 1); }
  }
  throw new Error(`could not slice ${name}`);
}
const ctx = vm.createContext({});
vm.runInContext(lift("escHTML") + "\n" + lift("escJsAttr"), ctx);
const escJsAttr = (s) => vm.runInContext("escJsAttr", ctx)(s);

/** Decode an HTML attribute value the way a browser would, then parse it as JS. */
const decodeAttr = (s) => s
  .replace(/&quot;/g, '"').replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/&amp;/g, "&");

const AWKWARD = [
  "collectibles:Grinx's Hammer",
  "collectibles:Reelmaster's Chair",
  "wearables:Victoria's Apron",
  "wearables:Autumn's Embrace",
  "wearables:Luna's Hat",
  "budboost:Animal Produce",      // a space
  'wearables:He said "hi"',       // a double quote, which escHTML does handle
  "collectibles:back\slash",
  "collectibles:Plain Item",
];

test("the onclick a wishlist row emits is parseable JS for every key shape", () => {
  for (const key of AWKWARD) {
    const attr = `_wlRemove('${escJsAttr(key)}')`;      // what lands in the HTML
    const code = decodeAttr(attr);                       // what the browser hands to JS
    let seen = null;
    const sandbox = vm.createContext({ _wlRemove: (k) => { seen = k; } });
    assert.doesNotThrow(() => vm.runInContext(code, sandbox), `${key}: handler must parse`);
    assert.equal(seen, key, `${key}: handler must receive the key VERBATIM`);
  }
});

test("the priority dots are escaped the same way", () => {
  for (const key of AWKWARD) {
    const code = decodeAttr(`_wlSetPrio('${escJsAttr(key)}',2)`);
    let seen = null, prio = null;
    const sandbox = vm.createContext({ _wlSetPrio: (k, p) => { seen = k; prio = p; } });
    assert.doesNotThrow(() => vm.runInContext(code, sandbox), `${key}: handler must parse`);
    assert.equal(seen, key);
    assert.equal(prio, 2);
  }
});

test("escHTML alone would NOT be enough — the bug is real, not hypothetical", () => {
  // Guards against someone "simplifying" escJsAttr back to escHTML.
  const escHTML = vm.runInContext("escHTML", ctx);
  const code = decodeAttr(`_wlRemove('${escHTML("collectibles:Grinx's Hammer")}')`);
  assert.throws(() => vm.runInContext(code, vm.createContext({ _wlRemove: () => {} })),
    "escHTML must leave this unparseable, otherwise this test proves nothing");
});

test("both wishlist handlers in flowers.html use the JS-string escaper", () => {
  assert.match(page, /_wlRemove\('\$\{escJsAttr\(r\.key\)\}'\)/, "the ✕ handler");
  assert.match(page, /_wlSetPrio\('\$\{escJsAttr\(r\.key\)\}',/, "the priority dots");
});
