const { getPool } = require("../shared/db");
const { fetchFarmData } = require("../shared/api");
const { computeFarmDiff } = require("../shared/diff");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = async function (context) {
  // Ensure 155498 is always first; 30s delay between farms to avoid rate limits
  const farmIds = (process.env.FARM_IDS || "155498").split(",").map((s) => s.trim());
  farmIds.sort((a, b) => (a === "155498" ? -1 : b === "155498" ? 1 : 0));
  const pool = getPool();

  for (let idx = 0; idx < farmIds.length; idx++) {
    if (idx > 0) {
      context.log(`Waiting 30s before next farm...`);
      await sleep(30000);
    }
    const farmId = farmIds[idx];
    try {
      // Per-farm API key: FARM_<id>_KEY env var, falls back to SFL_API_KEY
      const apiKey = process.env[`FARM_${farmId}_KEY`] || process.env.SFL_API_KEY;
      const data = await fetchFarmData(farmId, apiKey);
      const gameData = data.farm || data;

      // Get previous snapshot for diff
      const prevResult = await pool.query(
        "SELECT game_data FROM farm_snapshots WHERE farm_id = $1 ORDER BY captured_at DESC LIMIT 1",
        [parseInt(farmId)]
      );

      let diff = null;
      if (prevResult.rows.length > 0) {
        diff = computeFarmDiff(prevResult.rows[0].game_data, gameData);
        if (diff === null) {
          context.log(`Farm ${farmId}: no changes, skipping insert`);
          continue;
        }
      }

      await pool.query(
        "INSERT INTO farm_snapshots (farm_id, game_data, diff) VALUES ($1, $2, $3)",
        [parseInt(farmId), JSON.stringify(gameData), diff ? JSON.stringify(diff) : null]
      );

      const diffKeys = diff ? Object.keys(diff).length : 0;
      context.log(`Farm ${farmId}: snapshot saved (${diffKeys} changes)`);
    } catch (err) {
      context.log.error(`Farm ${farmId} error: ${err.message}`);
    }
  }
};
