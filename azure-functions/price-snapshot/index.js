const { getPool } = require("../shared/db");
const { fetchPrices } = require("../shared/api");

module.exports = async function (context) {
  const pool = getPool();

  try {
    const prices = await fetchPrices();
    const items = Object.entries(prices);
    if (items.length === 0) {
      context.log("No prices returned from API");
      return;
    }

    // Load last known prices
    const lastResult = await pool.query("SELECT item_name, price FROM last_known_prices");
    const lastPrices = new Map(lastResult.rows.map((r) => [r.item_name, r.price]));

    const changes = [];
    for (const [itemName, price] of items) {
      const numPrice = parseFloat(price);
      if (isNaN(numPrice)) continue;

      const lastPrice = lastPrices.get(itemName);
      if (lastPrice !== undefined && Math.abs(numPrice - lastPrice) < 1e-10) {
        continue; // No change
      }

      changes.push({
        item_name: itemName,
        price: numPrice,
        previous_price: lastPrice !== undefined ? lastPrice : null,
      });
    }

    if (changes.length === 0) {
      context.log("No price changes detected");
      return;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Batch insert changes
      for (const c of changes) {
        await client.query(
          "INSERT INTO price_changes (item_name, price, previous_price) VALUES ($1, $2, $3)",
          [c.item_name, c.price, c.previous_price]
        );
      }

      // Upsert last known prices
      for (const c of changes) {
        await client.query(
          `INSERT INTO last_known_prices (item_name, price, updated_at)
           VALUES ($1, $2, NOW())
           ON CONFLICT (item_name) DO UPDATE SET price = $2, updated_at = NOW()`,
          [c.item_name, c.price]
        );
      }

      await client.query("COMMIT");
      context.log(`Recorded ${changes.length} price changes out of ${items.length} items`);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    context.log.error(`Price snapshot error: ${err.message}`);
  }
};
