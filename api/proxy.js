export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const { url, key } = req.query;
  if (!url) return res.status(400).json({ error: "Missing ?url= parameter" });
  if (!url.startsWith("https://api.sunflower-land.com/")) {
    return res.status(403).json({ error: "Only sunflower-land API allowed" });
  }

  const headers = {};
  if (key) headers["x-api-key"] = key;

  try {
    const resp = await fetch(url, { headers });
    const body = await resp.text();
    return new Response(body, {
      status: resp.status,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  } catch (err) {
    return res.status(502).json({ error: err.message });
  }
}
