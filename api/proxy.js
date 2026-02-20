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

  const headers = {};
  if (key) headers["x-api-key"] = key;

  try {
    const resp = await fetch(url, { headers });
    const body = await resp.text();
    res.setHeader("Content-Type", "application/json");
    return res.status(resp.status).send(body);
  } catch (err) {
    return res.status(502).json({ error: err.message });
  }
}
