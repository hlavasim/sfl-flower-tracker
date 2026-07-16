// Local dev server for the SFL tracker — serves the static frontend, runs the new
// server-side API functions locally, and reverse-proxies every other /api/* to
// production so the app is fully functional offline of Vercel.
//
//   node dev-server.mjs           → http://localhost:3000
//   PORT=8080 node dev-server.mjs
//
// Local API routes are loaded fresh on every request (cache-busted import) so editing
// api/*.mjs or core/*.mjs takes effect without restarting the server.
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
      const mod = await import(`${LOCAL_API[path]}?t=${Date.now()}`); // fresh import per request
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
server.listen(PORT, "127.0.0.1", () => console.log(`dev server → http://localhost:${PORT}  (proxying other /api/* to ${PROD})`));
