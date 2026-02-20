export default async function handler(req, res) {
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
}
