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
        await fetch(`${apiUrl}/set/${encodeURIComponent(`cache:${url}`)}?EX=${CACHE_TTL}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify(body),
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
