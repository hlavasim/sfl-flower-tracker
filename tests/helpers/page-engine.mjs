// Tests that evaluate the page script get the engine the way the browser does: the page no longer
// carries its own copies of core functions — its <head> loader puts core/browser-engine.mjs on
// the global object (and never over a function the page defines itself). Import this first.
import * as engine from "../../core/browser-engine.mjs";
globalThis.__engine = engine;
for (const [k, v] of Object.entries(engine)) if (!(k in globalThis)) globalThis[k] = v;
