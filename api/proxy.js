const ALLOWED_ORIGINS = [
  "https://sunflower.sajmonium.quest",
  "http://localhost:3000",
  "http://localhost:5173",
];

function getCorsOrigin(req) {
  const origin = req.headers?.origin || req.headers?.referer || "";
  if (ALLOWED_ORIGINS.some(o => origin.startsWith(o))) return origin;
  return ALLOWED_ORIGINS[0]; // fallback to production
}

export default async function handler(req, res) {
  const corsOrigin = getCorsOrigin(req);
  res.setHeader("Access-Control-Allow-Origin", corsOrigin);
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-API-Key");
  res.setHeader("Vary", "Origin");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const { url } = req.query;
  if (!url) return res.status(400).json({ error: "Missing ?url= parameter" });

  const ALLOWED = [
    "https://api.sunflower-land.com/",
    "https://sfl.world/",
    "https://api.coingecko.com/",
  ];
  if (!ALLOWED.some(prefix => url.startsWith(prefix))) {
    return res.status(403).json({ error: "Domain not allowed" });
  }

  // Cache external API responses (not per-user farm data)
  const CACHEABLE = [
    "https://sfl.world/",
    "https://api.coingecko.com/",
  ];
  const shouldCache = CACHEABLE.some(prefix => url.startsWith(prefix));
  const apiUrl = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  const canCache = shouldCache && apiUrl && token;
  const CACHE_TTL = 300; // 5 minutes

  if (canCache) {
    try {
      const cacheKey = `cache:${url}`;
      const getResp = await fetch(`${apiUrl}/get/${encodeURIComponent(cacheKey)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (getResp.ok) {
        const data = await getResp.json();
        if (data.result) {
          res.setHeader("Content-Type", "application/json");
          res.setHeader("X-Cache", "HIT");
          return res.status(200).send(data.result);
        }
      }
    } catch (e) {
      console.error("[proxy] cache read error:", e.message);
    }
  }

  const headers = {};
  // API key from server env only — never accept from client
  const apiKey = process.env.SFL_API_KEY;
  if (apiKey) headers["x-api-key"] = apiKey;

  try {
    const resp = await fetch(url, { headers });
    const body = await resp.text();

    // Cache successful responses
    if (canCache && resp.ok) {
      try {
        await fetch(`${apiUrl}/set/${encodeURIComponent(`cache:${url}`)}?EX=${CACHE_TTL}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "text/plain" },
          body: body,
        });
      } catch (e) {
        console.error("[proxy] cache write error:", e.message);
      }
    }

    res.setHeader("Content-Type", "application/json");
    res.setHeader("X-Cache", "MISS");
    return res.status(resp.status).send(body);
  } catch (err) {
    console.error("[proxy] upstream error:", err.message);
    return res.status(502).json({ error: "Upstream request failed" });
  }
}
