// Evaluates flowers.html's inline script against a DOM stub (as tests/core/fishing-render does) and
// hands back the page's own functions, so a widget test can feed a widget the page's real model.
// Import "./page-engine.mjs" first (the engine, the store and the widget host on the global object).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SRC = readFileSync(path.join(ROOT, "flowers.html"), "utf8");
const SCRIPT = SRC.slice(SRC.indexOf("<script>") + 8, SRC.lastIndexOf("</script>"));

// names: the page's top-level identifiers to return (functions, or `let` state read through getters)
// src: another page source (e.g. an older flowers.html, to compare numbers)
export function evalPage(names, { store = {}, search = "", src = null } = {}) {
  const script = src ? src.slice(src.indexOf("<script>") + 8, src.lastIndexOf("</script>")) : SCRIPT;
  const app = { innerHTML: "" };
  const elements = { app };
  const stubEl = () => ({
    innerHTML: "", textContent: "", style: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    appendChild() {}, addEventListener() {}, setAttribute() {}, removeAttribute() {}, querySelector: () => null,
    querySelectorAll: () => [], getContext: () => null, children: [], dataset: {}, insertBefore() {},
  });
  const doc = {
    getElementById: (id) => (id === "app" ? app : (elements[id] || (elements[id] = stubEl()))),
    querySelector: () => null, querySelectorAll: () => [], createElement: stubEl,
    addEventListener() {}, removeEventListener() {}, body: stubEl(), documentElement: stubEl(), head: stubEl(),
    readyState: "complete", cookie: "",
  };
  const win = {
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    location: { href: "https://example.test/" + search, search, hash: "", pathname: "/", origin: "https://example.test" },
    addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {} }),
    requestAnimationFrame: () => 0, setTimeout: () => 0, setInterval: () => 0, clearTimeout() {}, clearInterval() {},
    history: { replaceState() {}, pushState() {} }, navigator: { userAgent: "node", clipboard: { writeText: async () => {} } },
    fetch: async () => ({ ok: false, status: 503, json: async () => ({}) }), console,
  };
  win.window = win;
  win.document = doc;
  const ret = names.map((n) => `${JSON.stringify(n)}: () => (typeof ${n} === "undefined" ? undefined : ${n})`).join(",");
  const run = new Function("window", "document", "localStorage", "sessionStorage", "fetch", "requestAnimationFrame", "setTimeout",
    "setInterval", "clearTimeout", "clearInterval", "location", "history", "navigator", "matchMedia",
    `${script}\n return { ${ret}, _set: (k, v) => { eval(k + " = v"); } };`);
  const got = run(win, doc, win.localStorage, win.sessionStorage, win.fetch, win.requestAnimationFrame, win.setTimeout,
    win.setInterval, win.clearTimeout, win.clearInterval, win.location, win.history, win.navigator, win.matchMedia);
  const api = {};
  for (const n of names) Object.defineProperty(api, n, { get: got[n], enumerable: true });
  api.set = got._set;
  return { api, app, win, store };
}
