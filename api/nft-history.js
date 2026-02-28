import { getPool } from "./db.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");
  if (req.method === "OPTIONS") return res.status(200).end();

  const pool = getPool();

  try {
    // Latest mode: most recent value for each NFT+field combo
    if (req.query.latest) {
      if (req.query.collection) {
        const result = await pool.query(
          `SELECT DISTINCT ON (nc.nft_id, nc.field)
                  nc.nft_id, nc.nft_name, nc.collection, nc.field, nc.value, nc.captured_at
           FROM nft_changes nc
           WHERE nc.collection = $1
             ${req.query.field ? "AND nc.field = $2" : ""}
           ORDER BY nc.nft_id, nc.field, nc.captured_at DESC`,
          req.query.field ? [req.query.collection, req.query.field] : [req.query.collection]
        );
        return res.status(200).json({ values: result.rows });
      }

      // All latest values
      const result = await pool.query(
        `SELECT lv.nft_id, lv.field, lv.value, lv.updated_at
         FROM last_known_nft_values lv
         ORDER BY lv.nft_id, lv.field`
      );
      return res.status(200).json({ values: result.rows });
    }

    // History for specific NFT
    const nftId = parseInt(req.query.nft_id);
    if (isNaN(nftId)) {
      return res.status(400).json({ error: "Provide ?nft_id=N or ?latest=1" });
    }

    const from = req.query.from || "1970-01-01";
    const to = req.query.to || "2100-01-01";
    const limit = Math.min(parseInt(req.query.limit) || 500, 5000);
    const field = req.query.field;
    const collection = req.query.collection;

    // Build query with optional field + collection filters
    const conditions = ["nft_id = $1", "captured_at >= $2", "captured_at <= $3"];
    const params = [nftId, from, to];
    if (field) { params.push(field); conditions.push(`field = $${params.length}`); }
    if (collection) { params.push(collection); conditions.push(`collection = $${params.length}`); }
    params.push(limit);

    const result = await pool.query(
      `SELECT nft_id, nft_name, collection, field, value, previous_value, captured_at
       FROM nft_changes
       WHERE ${conditions.join(" AND ")}
       ORDER BY captured_at DESC
       LIMIT $${params.length}`,
      params
    );

    return res.status(200).json({ changes: result.rows });
  } catch (err) {
    console.error("nft-history error:", err.message);
    return res.status(500).json({ error: "Internal server error" });
  }
}
