import { getPool } from "./_db.js";

const ALLOWED_FARMS = new Set([155498, 1260204733777858]);

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");
  if (req.method === "OPTIONS") return res.status(200).end();

  const pool = getPool();

  // ─── Investment Tracker: btc_transactions CRUD ─────────────────
  if (req.query.type === "btc-tx") {
    const method = (req.method || "GET").toUpperCase();
    try {
      if (method === "GET") {
        const farm = parseInt(req.query.farm, 10);
        if (!Number.isFinite(farm)) return res.status(400).json({ error: "farm required" });
        if (!ALLOWED_FARMS.has(farm)) return res.status(400).json({ error: "disallowed farm" });
        const r = await pool.query(
          `SELECT id, farm_id, tx_date, direction, btc_amount, usd_amount, notes, created_at
             FROM btc_transactions
            WHERE farm_id = $1
            ORDER BY tx_date DESC, created_at DESC`,
          [farm]
        );
        return res.status(200).json({ transactions: r.rows });
      }

      if (method === "POST") {
        const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
        const farm = parseInt(body.farm_id, 10);
        const direction = (body.direction || "").toLowerCase();
        const btc = parseFloat(body.btc_amount);
        const usd = body.usd_amount === undefined || body.usd_amount === null || body.usd_amount === ""
          ? null : parseFloat(body.usd_amount);
        const notes = typeof body.notes === "string" ? body.notes.slice(0, 500) : null;
        const txDate = typeof body.tx_date === "string" ? body.tx_date : null;

        if (!Number.isFinite(farm) || farm <= 0) return res.status(400).json({ error: "farm_id required" });
        if (!ALLOWED_FARMS.has(farm)) return res.status(400).json({ error: "disallowed farm" });
        if (!["deposit", "withdrawal"].includes(direction)) return res.status(400).json({ error: "direction must be deposit or withdrawal" });
        if (!Number.isFinite(btc) || btc <= 0 || btc > 100) return res.status(400).json({ error: "btc_amount must be > 0 and <= 100" });
        if (usd !== null && (!Number.isFinite(usd) || usd < 0)) return res.status(400).json({ error: "usd_amount must be a non-negative number" });
        if (!txDate || !/^\d{4}-\d{2}-\d{2}$/.test(txDate)) return res.status(400).json({ error: "tx_date must be YYYY-MM-DD" });

        const r = await pool.query(
          `INSERT INTO btc_transactions (farm_id, tx_date, direction, btc_amount, usd_amount, notes)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id, farm_id, tx_date, direction, btc_amount, usd_amount, notes, created_at`,
          [farm, txDate, direction, btc, usd, notes]
        );
        return res.status(201).json({ transaction: r.rows[0] });
      }

      if (method === "DELETE") {
        const farm = parseInt(req.query.farm, 10);
        const id = parseInt(req.query.id, 10);
        if (!Number.isFinite(farm) || !Number.isFinite(id)) return res.status(400).json({ error: "farm and id required" });
        if (!ALLOWED_FARMS.has(farm)) return res.status(400).json({ error: "disallowed farm" });
        const r = await pool.query(
          `DELETE FROM btc_transactions WHERE id = $1 AND farm_id = $2 RETURNING id`,
          [id, farm]
        );
        if (r.rowCount === 0) return res.status(404).json({ error: "not found" });
        return res.status(200).json({ deleted: r.rows[0].id });
      }

      return res.status(405).json({ error: "method not allowed" });
    } catch (err) {
      console.error("[btc-tx]", err);
      return res.status(500).json({ error: err.message });
    }
  }
  // ─── End Investment Tracker branch ────────────────────────────

  // Power/efficiency summary (computed by the tracker page, served for external display).
  if (req.query.type === "power-summary") {
    const farm = parseInt(req.query.farm, 10);
    if (!Number.isFinite(farm) || farm <= 0) return res.status(400).json({ error: "?farm= required" });
    try {
      await pool.query(`CREATE TABLE IF NOT EXISTS power_summary (farm_id BIGINT PRIMARY KEY, data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
      if ((req.method || "GET").toUpperCase() === "POST") {
        if (!ALLOWED_FARMS.has(farm)) return res.status(403).json({ error: "writes disallowed for this farm" });
        const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
        if (!body || typeof body !== "object" || !body.perCategory) return res.status(400).json({ error: "body must be the summary JSON (needs perCategory)" });
        await pool.query(`INSERT INTO power_summary (farm_id, data, updated_at) VALUES ($1, $2, now()) ON CONFLICT (farm_id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`, [farm, JSON.stringify(body)]);
        return res.status(200).json({ ok: true, farm });
      }
      const r = await pool.query(`SELECT data, updated_at FROM power_summary WHERE farm_id = $1`, [farm]);
      if (!r.rows.length) return res.status(404).json({ error: "no summary stored yet - open the tracker roadmap for this farm once to populate it" });
      return res.status(200).json(Object.assign({}, r.rows[0].data, { storedAt: r.rows[0].updated_at }));
    } catch (err) {
      return res.status(500).json({ error: "power-summary error", detail: String((err && err.message) || err) });
    }
  }

  const farmId = parseInt(req.query.farm);
  if (isNaN(farmId) || !ALLOWED_FARMS.has(farmId)) {
    return res.status(400).json({ error: "Invalid or disallowed farm ID" });
  }

  try {
    // Latest snapshot mode
    if (req.query.latest) {
      const count = Math.min(parseInt(req.query.latest) || 1, 100);
      const result = await pool.query(
        `SELECT id, farm_id, captured_at, diff,
                CASE WHEN $2 THEN game_data ELSE NULL END AS game_data
         FROM farm_snapshots
         WHERE farm_id = $1
         ORDER BY captured_at DESC
         LIMIT $3`,
        [farmId, req.query.include === "game_data", count]
      );
      return res.status(200).json({ snapshots: result.rows });
    }

    // Range query
    const from = req.query.from || "1970-01-01";
    const to = req.query.to || "2100-01-01";
    const limit = Math.min(parseInt(req.query.limit) || 100, 1000);
    const offset = parseInt(req.query.offset) || 0;
    const includeData = req.query.include === "game_data";
    // Optional time-bucketing: ?bucket_hours=N keeps the latest snapshot in each N-hour bucket
    // (Postgres date_bin, 14+). Gives a consistent points/day regardless of collection density,
    // and works correctly across the cleanup boundary (~30d) where retention switches to 1/day.
    // Clamped to [1, 720]. When N=1 → 1 point/hour max. Unset → no bucketing.
    const bucketHoursRaw = parseInt(req.query.bucket_hours);
    const bucketHours = (Number.isFinite(bucketHoursRaw) && bucketHoursRaw >= 1)
      ? Math.min(bucketHoursRaw, 720) : null;

    const result = bucketHours
      ? await pool.query(
          `SELECT DISTINCT ON (date_bin($7::interval, captured_at, '2020-01-01'::timestamptz))
                  id, farm_id, captured_at, diff,
                  CASE WHEN $5 THEN game_data ELSE NULL END AS game_data
           FROM farm_snapshots
           WHERE farm_id = $1 AND captured_at >= $2 AND captured_at <= $3
           ORDER BY date_bin($7::interval, captured_at, '2020-01-01'::timestamptz) DESC,
                    captured_at DESC
           LIMIT $4 OFFSET $6`,
          [farmId, from, to, limit, includeData, offset, `${bucketHours} hours`]
        )
      : await pool.query(
          `SELECT id, farm_id, captured_at, diff,
                  CASE WHEN $5 THEN game_data ELSE NULL END AS game_data
           FROM farm_snapshots
           WHERE farm_id = $1 AND captured_at >= $2 AND captured_at <= $3
           ORDER BY captured_at DESC
           LIMIT $4 OFFSET $6`,
          [farmId, from, to, limit, includeData, offset]
        );

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM farm_snapshots
       WHERE farm_id = $1 AND captured_at >= $2 AND captured_at <= $3`,
      [farmId, from, to]
    );

    return res.status(200).json({
      snapshots: result.rows,
      total: parseInt(countResult.rows[0].count),
    });
  } catch (err) {
    console.error("farm-history error:", err.message);
    return res.status(500).json({ error: "Internal server error" });
  }
}
