// Local dev server for the SFL tracker — serves the static frontend and runs EVERY api/* handler
// locally (vercel.json rewrites included), against the production database READ-ONLY:
// the session gets default_transaction_read_only=on and the pool one connection, so local work
// can neither write production nor take its connection slots. A write fails with Postgres'
// "cannot execute ... in a read-only transaction".
//
// Secrets come from an untracked .env.local (gitignored): PGHOST PGUSER PGPASSWORD PGDATABASE
// PGSSL, SFL_API_KEY, WRITE_TOKEN (owner-private reads; paste the same token into the page on
// localhost). Leave KV_REST_API_* out: the proxy then simply does not cache, and nothing writes
// the shared production cache. A missing secret only breaks the handler that needs it.
//
//   node --watch dev-server.mjs   → http://localhost:3000   ← USE THIS
//   npm run dev                   → same
//   PORT=8080 node --watch dev-server.mjs
//
// ⚠ WITHOUT --watch, EDITS TO core/ DO NOT TAKE EFFECT.
// The `?t=${Date.now()}` below cache-busts the handler file (api/compute.mjs) only. Its
// own imports — `import { buildCookingSection } from "../core/sections/cooking.mjs"` — are
// static and carry no query string, so they resolve to the same specifier every time and
// come straight back out of Node's ESM cache. Edit api/*.mjs and you see it; edit core/*.mjs
// and you are testing the code you had when the process started.
//
// This comment used to claim the opposite ("editing api/*.mjs or core/*.mjs takes effect
// without restarting"). Six agents and the controller lost hours to it — verifying fixes
// against stale modules and, once, reporting a fix that had never taken effect. Almost all
// the work on this project is in core/, i.e. exactly the half that was never reloading.
//
// `--watch` restarts the whole process on any file change, which reloads everything.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const PORT = process.env.PORT || 3000;

// KEY=VALUE lines; comments, blanks and a missing file are fine; surrounding quotes stripped.
export function parseEnvFile(file) {
  if (!existsSync(file)) return {};
  const out = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    out[m[1]] = m[2].trim().replace(/^(["'])(.*)\1$/, "$2");
  }
  return out;
}

// The DB settings a local run always gets, whatever .env.local says.
export function devDbEnv(env) {
  return { ...env, PGOPTIONS: "-c default_transaction_read_only=on", PG_POOL_MAX: "1", PG_CONNECT_TIMEOUT_MS: "60000" };
}

// /api/<name> for every api/*.js|mjs that is not a helper (_*.js), plus vercel.json rewrites
// that point at one of them with a query (e.g. /api/stats → /api/track?type=read).
export function localRoutes() {
  const routes = {};
  for (const f of readdirSync(join(ROOT, "api"))) {
    if (f.startsWith("_") || !/\.(m?js)$/.test(f)) continue;
    routes[`/api/${f.replace(/\.m?js$/, "")}`] = { file: `./api/${f}`, query: {} };
  }
  const vercel = JSON.parse(readFileSync(join(ROOT, "vercel.json"), "utf8"));
  for (const { source, destination } of vercel.rewrites || []) {
    const [path, qs] = destination.split("?");
    if (source === path || !routes[path]) continue;
    routes[source] = { file: routes[path].file, query: Object.fromEntries(new URLSearchParams(qs || "")) };
  }
  return routes;
}

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript",
  ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml",
  ".png": "image/png", ".webp": "image/webp", ".ico": "image/x-icon", ".map": "application/json",
};

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return chunks.length ? Buffer.concat(chunks) : undefined;
}

function startServer() {
Object.assign(process.env, devDbEnv({ ...parseEnvFile(join(ROOT, ".env.local")), ...process.env }));
const LOCAL_API = localRoutes();
// Under --watch the process restarts on any edit, so handlers load once and keep their in-memory
// caches between requests; without it the handler file is re-imported per request (see above).
const WATCHED = !!process.env.WATCH_REPORT_DEPENDENCIES;
const proxyCache = new Map();

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;
  try {
    // 1) Local API function
    if (LOCAL_API[path]) {
      const route = LOCAL_API[path];
      const href = pathToFileURL(join(ROOT, route.file)).href;
      const mod = await import(WATCHED ? href : `${href}?t=${Date.now()}`);
      req.query = { ...Object.fromEntries(url.searchParams), ...route.query };
      if (!["GET", "HEAD"].includes(req.method)) {
        req.body = await readBody(req);
        // Vercel hands handlers a parsed JSON body; do the same.
        if (req.body && /json/.test(req.headers["content-type"] || "")) {
          try { req.body = JSON.parse(req.body.toString("utf8")); } catch {}
        }
      }
      // The game API rate-limits our key; production shares a 20 s KV cache for farm reads, which
      // a local run must not write, so the local server keeps its own (GET 200s only).
      const cacheKey = path === "/api/proxy" && req.method === "GET" ? url.search : null;
      const hit = cacheKey && proxyCache.get(cacheKey);
      if (hit && Date.now() - hit.at < 20000) {
        res.setHeader("content-type", hit.type); res.setHeader("x-cache", "LOCAL"); res.end(hit.body); return;
      }
      res.status = (c) => { res.statusCode = c; return res; };
      res.json = (o) => { res.setHeader("content-type", "application/json"); res.end(JSON.stringify(o)); return res; };
      res.send = (b) => { res.end(typeof b === "string" || Buffer.isBuffer(b) ? b : JSON.stringify(b)); return res; };
      if (cacheKey) {
        const end = res.end.bind(res);
        res.end = (b, ...rest) => {
          if (res.statusCode === 200 && b) proxyCache.set(cacheKey, { at: Date.now(), body: b, type: res.getHeader("content-type") || "application/json" });
          return end(b, ...rest);
        };
      }
      await mod.default(req, res);
      return;
    }
    // 2) Unknown /api/* path: never forwarded to production
    if (path.startsWith("/api/")) { res.statusCode = 404; res.end("no local handler for " + path); return; }
    // 3) Static file (default to flowers.html)
    const rel = path === "/" ? "/flowers.html" : decodeURIComponent(path);
    const full = normalize(join(ROOT, rel));
    if (!full.startsWith(ROOT)) { res.statusCode = 403; res.end("forbidden"); return; }
    const data = await readFile(full);
    res.setHeader("content-type", MIME[extname(full)] || "application/octet-stream");
    res.end(data);
  } catch (e) {
    res.statusCode = e && e.code === "ENOENT" ? 404 : 500;
    res.end(String((e && e.message) || e));
    if (res.statusCode === 500) console.error(`[dev] ${path} ->`, e);
  }
});

// Bind loopback only: this serves any file under the repo root (including .env and .git/),
// so it must not be reachable from the LAN.
// HOST=0.0.0.0 exposes the dev server beyond localhost (e.g. for Tailscale testing).
const HOST = process.env.HOST || "127.0.0.1";
server.listen(PORT, HOST, () => {
  console.log(`dev server → http://${HOST === "0.0.0.0" ? "<any-interface>" : "localhost"}:${PORT}  (${Object.keys(LOCAL_API).length} api routes local, DB read-only, pool 1${process.env.PGHOST ? "" : " — no PGHOST: add .env.local"})`);
  // Loud on purpose: silently serving stale core/ modules is this server's one nasty trap.
  // `node --watch` re-execs a child WITHOUT the flag, so process.execArgv is empty here and
  // cannot be used to detect it (my first attempt did, and cried wolf under the correct setup —
  // a warning that fires when you did the right thing is worse than none). The child does get
  // WATCH_REPORT_DEPENDENCIES=1. That is an internal detail, not public API: if a future Node
  // drops it this warning goes back to always firing, which is noisy but never wrong in the
  // dangerous direction.
  if (!process.env.WATCH_REPORT_DEPENDENCIES) {
    console.log("⚠  not running under --watch: edits to core/ will NOT take effect until you restart.");
    console.log("   use `npm run dev` (node --watch dev-server.mjs) instead.");
  }
});
}

if (process.argv[1] && fileURLToPath(import.meta.url) === normalize(process.argv[1])) startServer();
