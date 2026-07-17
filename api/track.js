export default async function handler(req, res) {
  if (req.query.type === "read") {
    // --- folded from api/stats.js (secret-gated analytics reader) ---
    const secret = process.env.STATS_SECRET;
    if (!secret || req.query.secret !== secret) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const apiUrl = process.env.KV_REST_API_URL;
    const token = process.env.KV_REST_API_TOKEN;

    if (!apiUrl || !token) {
      return res.status(500).json({ error: "KV not configured" });
    }

    const headers = { Authorization: `Bearer ${token}` };

    try {
      // Get all farm IDs
      const setResp = await fetch(`${apiUrl}/smembers/all_farms`, { headers });
      const setData = await setResp.json();
      const farmIds = setData.result || [];

      // Fetch all farm hashes in a pipeline
      const pipeline = farmIds.map(id => ["HGETALL", `farm:${id}`]);
      const pipeResp = await fetch(`${apiUrl}/pipeline`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(pipeline)
      });
      const pipeData = await pipeResp.json();

      const farms = {};
      farmIds.forEach((id, i) => {
        const entries = pipeData[i]?.result || [];
        const stats = {};
        for (let j = 0; j < entries.length; j += 2) {
          stats[entries[j]] = parseInt(entries[j + 1], 10);
        }
        farms[id] = stats;
      });

      return res.status(200).json({
        totalFarms: farmIds.length,
        farms
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
    return; // ensure the read branch never falls through to the write logic
  }

  res.setHeader("Access-Control-Allow-Origin", "*");

  const { farm, page } = req.query;
  if (!farm || !page) return res.status(400).json({ error: "Missing ?farm= or ?page=" });

  const validPages = ["dashboard", "hub", "flowers", "dolls", "crustaceans", "bumpkin", "treasury", "sales", "power", "buds", "pets", "diff", "json"];
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
