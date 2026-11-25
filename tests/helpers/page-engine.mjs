// Tests that evaluate the page script get the engine the way the browser does: the page no longer
// carries its own copies of core functions — its <head> loader puts core/browser-engine.mjs on
// the global object (and never over a function the page defines itself). Import this first.
import * as engine from "../../core/browser-engine.mjs";
globalThis.__engine = engine;
for (const [k, v] of Object.entries(engine)) if (!(k in globalThis)) globalThis[k] = v;

// The rest of the <head> loader: the data store and the widget host (in-memory storage, a network
// that answers 503), under the same global names the page uses.
import { createStore } from "../../app/store.mjs";
import { createHost } from "../../app/widget-host.mjs";
import { WIDGETS } from "../../widgets/registry.mjs";
import { freshness } from "../../ui/frame.mjs";
globalThis.__store = createStore({ fetch: async () => ({ ok: false, status: 503, json: async () => ({}) }) });
const _mem = new Map();
globalThis.__widgets = createHost({ registry: WIDGETS, storage: { getItem: (k) => (_mem.has(k) ? _mem.get(k) : null), setItem: (k, v) => _mem.set(k, String(v)) } });
globalThis.__wFresh = freshness;
