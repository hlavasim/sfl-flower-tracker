// Serves a per-category power/efficiency summary for a farm.
//  - POST ?farm=<id>  (body = the summary JSON computed by the tracker page) → upsert into power_summary.
//  - GET  ?farm=<id>  → the last stored summary (+ storedAt). 404 until the tracker has been opened once.
// The heavy power+efficiency math lives in the tracker client (single source of truth), so this endpoint
// just persists + serves what the page already computes. Writes are limited to known farms.
import { getPool } from "./_db.js";

const ALLOWED_FARMS = new Set([155498, 1260204733777858]);

let ensured = false;
async function ensureTable(pool) {
  if (ensured) return;
  await pool.query(`CREATE TABLE IF NOT EXISTS power_summary (
    farm_id    BIGINT PRIMARY KEY,
    data       JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  ensured = true;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");
  if (req.method === "OPTIONS") return res.status(200).end();

  const farm = parseInt(req.query.farm, 10);
  if (!Number.isFinite(farm) || farm <= 0) return res.status(400).json({ error: "?farm= required" });

  let pool;
  try { pool = getPool(); await ensureTable(pool); }
  catch (e) { return res.status(503).json({ error: "database unavailable" }); }

  const method = (req.method || "GET").toUpperCase();
  try {
    if (method === "POST") {
      if (!ALLOWED_FARMS.has(farm)) return res.status(403).json({ error: "writes disallowed for this farm" });
      let body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
      if (!body || typeof body !== "object" || !body.perCategory) {
        return res.status(400).json({ error: "body must be the summary JSON (needs perCategory)" });
      }
      await pool.query(
        `INSERT INTO power_summary (farm_id, data, updated_at) VALUES ($1, $2, now())
         ON CONFLICT (farm_id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
        [farm, JSON.stringify(body)]
      );
      return res.status(200).json({ ok: true, farm });
    }

    // GET
    const r = await pool.query(`SELECT data, updated_at FROM power_summary WHERE farm_id = $1`, [farm]);
    if (!r.rows.length) {
      return res.status(404).json({ error: "no summary stored yet — open the tracker's roadmap for this farm once to populate it" });
    }
    const row = r.rows[0];
    const out = Object.assign({}, row.data, { storedAt: row.updated_at });
    return res.status(200).json(out);
  } catch (e) {
    return res.status(500).json({ error: "server error", detail: String((e && e.message) || e) });
  }
}
