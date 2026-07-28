export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const { url, key } = req.query;
  if (!url) return res.status(400).json({ error: "Missing ?url= parameter" });

  const ALLOWED = [
    "https://api.sunflower-land.com/",
    "https://sfl.world/",
    "https://api.coingecko.com/",
  ];
  if (!ALLOWED.some(prefix => url.startsWith(prefix))) {
    return res.status(403).json({ error: "Domain not allowed" });
  }

  /*
   * Shared cache for external API responses, with a per-target TTL.
   *
   * The farm endpoint is cached too, briefly. One page load fires several /api/compute calls
   * in parallel (power, prices, cooking, treasury, roi …); each lands on a different
   * serverless instance whose in-process cache is empty, so each fetched the same farm again
   * and the upstream started answering 502. Measured on a cold load: two 502s on
   * section=treasury and a ~9 s page. A 20-second shared TTL collapses them into one upstream
   * fetch while still being far fresher than anything a user would notice — and this proxy
   * already serves that exact response to any caller, so nothing new is exposed.
   */
  const CACHE_RULES = [
    { prefix: "https://sfl.world/", ttl: 300 },
    { prefix: "https://api.coingecko.com/", ttl: 300 },
    { prefix: "https://api.sunflower-land.com/community/farms/", ttl: 20 },
  ];
  const rule = CACHE_RULES.find(r => url.startsWith(r.prefix));
  const apiUrl = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  const canCache = !!rule && !!apiUrl && !!token;
  const CACHE_TTL = rule ? rule.ttl : 0;

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
          // data.result is a string — send as-is (it's valid JSON text)
          return res.status(200).send(data.result);
        }
      }
    } catch {}
  }

  const headers = {};
  // Use client-provided key, or fall back to server-side env var
  const apiKey = key || process.env.SFL_API_KEY;
  if (apiKey) headers["x-api-key"] = apiKey;

  try {
    const resp = await fetch(url, { headers });
    const body = await resp.text();

    // Cache successful responses
    if (canCache && resp.ok) {
      try {
        // Store raw JSON text — use text/plain to avoid double-encoding
        await fetch(`${apiUrl}/set/${encodeURIComponent(`cache:${url}`)}?EX=${CACHE_TTL}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "text/plain" },
          body: body,
        });
      } catch {}
    }

    res.setHeader("Content-Type", "application/json");
    res.setHeader("X-Cache", "MISS");
    return res.status(resp.status).send(body);
  } catch (err) {
    return res.status(502).json({ error: err.message });
  }
}
