// Local dev server for the SFL tracker — serves the static frontend, runs the new
// server-side API functions locally, and reverse-proxies every other /api/* to
// production so the app is fully functional offline of Vercel.
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
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const PORT = process.env.PORT || 3000;
const PROD = process.env.PROD_ORIGIN || "https://sunflower.sajmonium.quest";

// Which /api/* paths are served locally (the rest proxy to prod).
const LOCAL_API = { "/api/compute": "./api/compute.mjs" };

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

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;
  try {
    // 1) Local API function
    if (LOCAL_API[path]) {
      // Reloads THIS file only — its static core/* imports stay cached. See the header:
      // run under --watch if you are editing core/, which is where the logic lives.
      const mod = await import(`${LOCAL_API[path]}?t=${Date.now()}`);
      req.query = Object.fromEntries(url.searchParams);
      if (!["GET", "HEAD"].includes(req.method)) req.body = await readBody(req);
      res.status = (c) => { res.statusCode = c; return res; };
      res.json = (o) => { res.setHeader("content-type", "application/json"); res.end(JSON.stringify(o)); return res; };
      await mod.default(req, res);
      return;
    }
    // 2) Proxy other /api/* to production
    if (path.startsWith("/api/")) {
      const body = await readBody(req);
      const r = await fetch(PROD + path + url.search, {
        method: req.method,
        headers: { "content-type": req.headers["content-type"] || "application/json" },
        body,
      });
      res.statusCode = r.status;
      res.setHeader("content-type", r.headers.get("content-type") || "application/json");
      res.end(Buffer.from(await r.arrayBuffer()));
      return;
    }
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
server.listen(PORT, "127.0.0.1", () => {
  console.log(`dev server → http://localhost:${PORT}  (proxying other /api/* to ${PROD})`);
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
