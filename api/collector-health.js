import { getPool } from "./_db.js";

// GET /api/collector-health — freshness of every background collector + the game
// token's expiry, so the frontend can warn BEFORE a silent gap (the game token
// once expired for 114 days unnoticed). No auth; read-only.

const MY_FARM_ID = 155498;
const REDIS_KEY = `game_token:${MY_FARM_ID}`;

// table → { column, label, staleHours } — staleHours = how long without a write
// before we consider the collector stuck (a few × its cadence).
const COLLECTORS = [
  { table: "farm_snapshots", col: "captured_at", label: "Farm snapshots", staleH: 2 },
  { table: "price_changes", col: "captured_at", label: "Prices", staleH: 12 },
  { table: "nft_changes", col: "captured_at", label: "NFT values", staleH: 12 },
  { table: "marketplace_trades", col: "fulfilled_at", label: "Marketplace trades", staleH: 6 },
  { table: "ob_snap", col: "ts", label: "Orderbook", staleH: 3 },
  { table: "marks_snapshots", col: "captured_at", label: "Marks", staleH: 30 },
];

async function tokenStatus() {
  const url = process.env.KV_REST_API_URL, tok = process.env.KV_REST_API_TOKEN;
  if (!url || !tok) return { configured: false };
  try {
    const r = await fetch(`${url}/get/${encodeURIComponent(REDIS_KEY)}`, { headers: { Authorization: `Bearer ${tok}` } });
    const token = (await r.json()).result;
    if (!token) return { configured: true, present: false };
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64").toString());
    const expMs = payload.exp ? payload.exp * 1000 : null;
    const daysLeft = expMs ? (expMs - Date.now()) / 86400000 : null;
    return { configured: true, present: true, expired: expMs ? expMs < Date.now() : false,
      daysLeft: daysLeft == null ? null : Math.round(daysLeft * 10) / 10,
      expiresAt: expMs ? new Date(expMs).toISOString() : null };
  } catch { return { configured: true, present: false, error: true }; }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");
  if (req.method === "OPTIONS") return res.status(200).end();

  const pool = getPool();
  try {
    const rows = await Promise.all(COLLECTORS.map(async (c) => {
      try {
        const q = await pool.query(`SELECT MAX(${c.col}) AS last FROM ${c.table}`);
        const last = q.rows[0].last;
        const ageH = last ? (Date.now() - new Date(last).getTime()) / 3600000 : null;
        return { table: c.table, label: c.label, lastWrite: last, ageHours: ageH == null ? null : Math.round(ageH * 10) / 10,
          stale: ageH == null ? true : ageH > c.staleH, staleThresholdH: c.staleH };
      } catch (e) {
        return { table: c.table, label: c.label, lastWrite: null, ageHours: null, stale: true, error: String(e.message || e).slice(0, 80) };
      }
    }));
    const token = await tokenStatus();
    const staleCollectors = rows.filter((r) => r.stale).map((r) => r.label);
    const tokenWarn = token.present === false || token.expired === true || (token.daysLeft != null && token.daysLeft < 3);
    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=120");
    return res.status(200).json({
      ok: staleCollectors.length === 0 && !tokenWarn,
      token, collectors: rows,
      warnings: {
        token: tokenWarn ? (token.present === false ? "missing" : token.expired ? "expired" : `expires in ${token.daysLeft}d`) : null,
        staleCollectors,
      },
    });
  } catch (err) {
    return res.status(500).json({ error: String(err.message || err) });
  }
}
