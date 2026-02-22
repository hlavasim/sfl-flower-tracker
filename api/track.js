export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  const { farm, page } = req.query;
  if (!farm || !page) return res.status(400).json({ error: "Missing ?farm= or ?page=" });

  const validPages = ["hub", "flowers", "dolls", "crustaceans", "bumpkin", "treasury", "sales", "power"];
  if (!validPages.includes(page)) return res.status(400).json({ error: "Invalid page" });

  const apiUrl = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;

  // Silent no-op if KV not configured
  if (!apiUrl || !token) return res.status(204).end();

  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  try {
    // Pipeline: HINCRBY + SADD in one request
    await fetch(`${apiUrl}/pipeline`, {
      method: "POST",
      headers,
      body: JSON.stringify([
        ["HINCRBY", `farm:${farm}`, page, 1],
        ["SADD", "all_farms", farm]
      ])
    });
    return res.status(204).end();
  } catch {
    return res.status(204).end();
  }
}
