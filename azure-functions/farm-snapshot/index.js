const { getPool } = require("../shared/db");
const { fetchFarmData } = require("../shared/api");
const { computeFarmDiff } = require("../shared/diff");

module.exports = async function (context) {
  const farmIds = (process.env.FARM_IDS || "155498").split(",").map((s) => s.trim());
  const pool = getPool();

  for (const farmId of farmIds) {
    try {
      const data = await fetchFarmData(farmId);
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
