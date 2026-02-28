const ALLOWED_FARM = 155498;
const REDIS_KEY = `game_token:${ALLOWED_FARM}`;

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");
  if (req.method === "OPTIONS") return res.status(200).end();

  const apiUrl = process.env.KV_REST_API_URL;
  const apiToken = process.env.KV_REST_API_TOKEN;
  if (!apiUrl || !apiToken) {
    return res.status(503).json({ error: "Redis not configured" });
  }

  const redisHeaders = { Authorization: `Bearer ${apiToken}` };

  // GET — check token status
  if (req.method === "GET") {
    const farm = parseInt(req.query.farm);
    if (farm !== ALLOWED_FARM) {
      return res.status(403).json({ error: "Unauthorized farm" });
    }

    try {
      const resp = await fetch(`${apiUrl}/get/${encodeURIComponent(REDIS_KEY)}`, {
        headers: redisHeaders,
      });
      const data = await resp.json();
      const token = data.result;

      if (!token) {
        return res.status(200).json({ hasToken: false });
      }

      // Decode JWT payload (no verification)
      try {
        const payload = JSON.parse(
          Buffer.from(token.split(".")[1], "base64").toString()
        );
        const exp = payload.exp ? payload.exp * 1000 : null;
        const now = Date.now();

        if (exp && exp < now) {
          return res.status(200).json({ hasToken: true, status: "expired" });
        }

        const msRemaining = exp ? exp - now : null;
        const daysRemaining = msRemaining
          ? Math.floor(msRemaining / 86400000)
          : null;

        return res.status(200).json({
          hasToken: true,
          status: "valid",
          expiresIn: daysRemaining !== null ? `${daysRemaining} days` : "unknown",
          expiresAt: exp ? new Date(exp).toISOString() : null,
        });
      } catch {
        return res
          .status(200)
          .json({ hasToken: true, status: "unknown_format" });
      }
    } catch (err) {
      return res.status(500).json({ error: "Failed to check token" });
    }
  }

  // POST — update token
  if (req.method === "POST") {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const { farm, token } = body || {};

    if (parseInt(farm) !== ALLOWED_FARM) {
      return res.status(403).json({ error: "Unauthorized farm" });
    }
    if (!token || typeof token !== "string") {
      return res.status(400).json({ error: "Missing token" });
    }

    // Validate JWT structure
    const parts = token.split(".");
    if (parts.length !== 3) {
      return res.status(400).json({ error: "Invalid token format" });
    }

    try {
      const payload = JSON.parse(
        Buffer.from(parts[1], "base64").toString()
      );

      // Check farmId claim matches
      if (payload.farmId && parseInt(payload.farmId) !== ALLOWED_FARM) {
        return res.status(400).json({ error: "Token farmId mismatch" });
      }

      // Check not expired
      const exp = payload.exp ? payload.exp * 1000 : null;
      if (exp && exp < Date.now()) {
        return res.status(400).json({ error: "Token already expired" });
      }

      // Store in Redis (no expiry on the Redis key — token self-expires)
      await fetch(
        `${apiUrl}/set/${encodeURIComponent(REDIS_KEY)}`,
        {
          method: "POST",
          headers: { ...redisHeaders, "Content-Type": "text/plain" },
          body: token,
        }
      );

      const daysRemaining = exp
        ? Math.floor((exp - Date.now()) / 86400000)
        : null;

      return res.status(200).json({
        success: true,
        expiresAt: exp ? new Date(exp).toISOString() : null,
        expiresIn: daysRemaining !== null ? `${daysRemaining} days` : "unknown",
      });
    } catch (err) {
      return res.status(400).json({ error: "Invalid token: " + err.message });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
