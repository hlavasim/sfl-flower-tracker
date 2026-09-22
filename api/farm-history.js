import { getPool } from "./_db.js";
import { handleWorld } from "./_world.js";
import ITEM_NAMES from "./_item-names.js";

const ALLOWED_FARMS = new Set([155498, 1260204733777858]);
// The SPECULATION page is the owner's alone.
const SPEC_FARMS = new Set([155498]);
// Crops and fruits the seasonal calendar covers (the p2p feed prices all of them).
const SPEC_CROPS = ["Sunflower", "Potato", "Rhubarb", "Pumpkin", "Zucchini", "Carrot", "Yam", "Cabbage", "Broccoli", "Soybean",
  "Beetroot", "Pepper", "Cauliflower", "Parsnip", "Eggplant", "Corn", "Onion", "Radish", "Wheat", "Turnip", "Kale", "Artichoke",
  "Barley", "Tomato", "Lemon", "Blueberry", "Orange", "Apple", "Banana", "Rice", "Olive", "Grape"];

/*
 * type=spec — the SPECULATION page, folded in here like the other modes (Vercel's 12-function cap).
 *   what=calendar  GET              seasonal buy/sell calendar from price_changes + marketplace_daily
 *   what=trades    GET/POST/PATCH/DELETE   the owner's position log (spec_trades)
 *   what=eggs      GET/POST         Genesis egg market snapshots pushed by the local collector
 */
async function handleSpec(pool, req, res) {
  const what = String(req.query.what || "");
  const method = (req.method || "GET").toUpperCase();
  const body = () => (typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {}));
  const farm = parseInt(req.query.farm, 10);
  if (!SPEC_FARMS.has(farm)) return res.status(400).json({ error: "disallowed farm" });

  if (what === "calendar" && method === "GET") {
    // Dynamic: this file is bundled as CommonJS, and a static import of an .mjs module made the
    // whole function fail to load (FUNCTION_INVOCATION_FAILED) — every farm-history mode went down.
    const { buildSeasonCalendar } = await import("../core/sections/seasons.mjs");
    const { rows } = await pool.query(
      `SELECT item_name, (EXTRACT(EPOCH FROM captured_at) * 1000)::bigint AS t, price
         FROM price_changes WHERE item_name = ANY($1) ORDER BY item_name, captured_at`, [SPEC_CROPS]);
    const daily = {};
    for (const r of rows) (daily[r.item_name] = daily[r.item_name] || []).push([Number(r.t), Number(r.price)]);
    // Traded volume over the last 28 days. marketplace_daily is cumulative per item, so the
    // window's quantity/volume is last minus first; resources trade under "collectibles".
    const idOf = {};
    for (const [id, name] of Object.entries(ITEM_NAMES.collectibles || {})) if (SPEC_CROPS.includes(name)) idOf[name] = parseInt(id, 10);
    const ids = Object.values(idOf);
    const liq = {};
    if (ids.length) {
      const q = await pool.query(
        `SELECT item_id, MAX(quantity) - MIN(quantity) AS qty, MAX(volume) - MIN(volume) AS vol,
                GREATEST(MAX(date) - MIN(date), 1) AS days
           FROM marketplace_daily WHERE collection = 'collectibles' AND item_id = ANY($1) AND date >= CURRENT_DATE - 28
          GROUP BY item_id`, [ids]);
      const nameOf = Object.fromEntries(Object.entries(idOf).map(([n, i]) => [i, n]));
      for (const r of q.rows) {
        const d = Number(r.days) || 1;
        liq[nameOf[r.item_id]] = { qtyPerDay: Number(r.qty) / d, flowerPerDay: Number(r.vol) / d };
      }
    }
    res.setHeader("Cache-Control", "s-maxage=1800, stale-while-revalidate=3600");
    return res.status(200).json(buildSeasonCalendar(daily, { now: Date.now(), liquidity: liq }));
  }

  if (what === "trades") {
    const cols = "id, item, currency, qty, buy_price, buy_date, sell_price, sell_date, notes, created_at";
    const num = (v) => (v === undefined || v === null || v === "" ? null : parseFloat(v));
    const date = (v) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
    if (method === "GET") {
      const r = await pool.query(`SELECT ${cols} FROM spec_trades WHERE farm_id = $1 ORDER BY buy_date DESC, id DESC`, [farm]);
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json({ trades: r.rows });
    }
    if (method === "POST") {
      const b = body();
      const item = typeof b.item === "string" ? b.item.trim().slice(0, 80) : "";
      const currency = typeof b.currency === "string" && b.currency.trim() ? b.currency.trim().toUpperCase().slice(0, 12) : "FLOWER";
      const qty = num(b.qty), buy = num(b.buy_price), sell = num(b.sell_price);
      if (!item) return res.status(400).json({ error: "item required" });
      if (!(qty > 0)) return res.status(400).json({ error: "qty must be > 0" });
      if (!(buy >= 0)) return res.status(400).json({ error: "buy_price must be >= 0" });
      if (!date(b.buy_date)) return res.status(400).json({ error: "buy_date must be YYYY-MM-DD" });
      if (sell !== null && !(sell >= 0)) return res.status(400).json({ error: "sell_price must be >= 0" });
      const r = await pool.query(
        `INSERT INTO spec_trades (farm_id, item, currency, qty, buy_price, buy_date, sell_price, sell_date, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING ${cols}`,
        [farm, item, currency, qty, buy, b.buy_date, sell, sell === null ? null : (date(b.sell_date) || new Date().toISOString().slice(0, 10)),
          typeof b.notes === "string" ? b.notes.slice(0, 500) : null]);
      return res.status(201).json({ trade: r.rows[0] });
    }
    const id = parseInt(req.query.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "id required" });
    if (method === "PATCH") {
      const b = body(), sets = [], vals = [];
      const add = (col, v) => { vals.push(v); sets.push(`${col} = $${vals.length}`); };
      if (b.item !== undefined) { const v = String(b.item).trim().slice(0, 80); if (!v) return res.status(400).json({ error: "item required" }); add("item", v); }
      if (b.currency !== undefined) add("currency", String(b.currency).trim().toUpperCase().slice(0, 12) || "FLOWER");
      if (b.qty !== undefined) { const v = num(b.qty); if (!(v > 0)) return res.status(400).json({ error: "qty must be > 0" }); add("qty", v); }
      if (b.buy_price !== undefined) { const v = num(b.buy_price); if (!(v >= 0)) return res.status(400).json({ error: "buy_price must be >= 0" }); add("buy_price", v); }
      if (b.buy_date !== undefined) { if (!date(b.buy_date)) return res.status(400).json({ error: "buy_date must be YYYY-MM-DD" }); add("buy_date", b.buy_date); }
      if (b.sell_price !== undefined) { const v = num(b.sell_price); if (v !== null && !(v >= 0)) return res.status(400).json({ error: "sell_price must be >= 0" }); add("sell_price", v); }
      if (b.sell_date !== undefined) { const v = b.sell_date === null || b.sell_date === "" ? null : date(b.sell_date); if (b.sell_date && !v) return res.status(400).json({ error: "sell_date must be YYYY-MM-DD" }); add("sell_date", v); }
      if (b.notes !== undefined) add("notes", b.notes === null ? null : String(b.notes).slice(0, 500));
      if (!sets.length) return res.status(400).json({ error: "nothing to update" });
      vals.push(id, farm);
      const r = await pool.query(`UPDATE spec_trades SET ${sets.join(", ")} WHERE id = $${vals.length - 1} AND farm_id = $${vals.length} RETURNING ${cols}`, vals);
      if (!r.rows.length) return res.status(404).json({ error: "not found" });
      return res.status(200).json({ trade: r.rows[0] });
    }
    if (method === "DELETE") {
      const r = await pool.query(`DELETE FROM spec_trades WHERE id = $1 AND farm_id = $2 RETURNING id`, [id, farm]);
      if (!r.rows.length) return res.status(404).json({ error: "not found" });
      return res.status(200).json({ deleted: id });
    }
    return res.status(405).json({ error: "method not allowed" });
  }

  if (what === "eggs") {
    if (method === "GET") {
      const r = await pool.query(`SELECT ts, data FROM egg_market ORDER BY ts DESC LIMIT 1000`);
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json({ snapshots: r.rows.reverse() });
    }
    if (method === "POST") {
      const b = body();
      const list = Array.isArray(b.snapshots) ? b.snapshots : [b];
      let n = 0;
      for (const s of list.slice(0, 500)) {
        if (!s || typeof s.ts_utc !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(s.ts_utc)) continue;
        const json = JSON.stringify(s);
        if (json.length > 20000) continue;
        const r = await pool.query(`INSERT INTO egg_market (ts, data) VALUES ($1, $2) ON CONFLICT (ts) DO NOTHING`, [s.ts_utc, json]);
        n += r.rowCount;
      }
      return res.status(200).json({ inserted: n });
    }
    return res.status(405).json({ error: "method not allowed" });
  }
  return res.status(400).json({ error: "what must be calendar, trades or eggs" });
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");
  if (req.method === "OPTIONS") return res.status(200).end();

  const pool = getPool();

  // ─── World crawl: progress + generic aggregation over farm_world ───
  // Folded in here rather than given its own file because Vercel's Hobby plan
  // caps the project at 12 serverless functions and we are already at 12.
  if (req.query.type === "world") {
    try {
      const out = await handleWorld(pool, req.query);
      res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
      return res.status(200).json(out);
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }
  }

  /* ─── Yakkamon tier thresholds over time ────────────────────────
   *
   * Folded in here for the same reason `world` is: Hobby caps the project at 12 functions and
   * we are at 12.
   *
   * GET             → the recorded history, oldest first.
   * GET &collect=1  → fetch the live board, record it, then return the history.
   *
   * The collect path does the fetching SERVER-side on purpose. That way the thing calling it on
   * a schedule needs no credentials, no repo checkout and no knowledge of the upstream shape —
   * a bare `curl` is a complete collector. Keyed on the build's own generated_at, so a schedule,
   * a page visit and a manual retry can all call it and only the first one to see a given build
   * writes anything.
   */
  if (req.query.type === "yk-board") {
    try {
      if (req.query.collect === "1") {
        const r = await fetch("https://api.yakkamon.com/leaderboard", { headers: { accept: "application/json" } });
        if (!r.ok) return res.status(502).json({ error: `leaderboard upstream ${r.status}` });
        const b = await r.json();
        const at = (rank) => {
          const e = Array.isArray(b.entries) ? b.entries.find((x) => x.rank === rank) : null;
          return e ? e.points : null;
        };
        const row = [b.generatedAt, b.playerCount, at(3), at(10), at(50), at(100)];
        if (!row.every((v) => Number.isFinite(v))) {
          return res.status(502).json({ error: "leaderboard payload missing a rank threshold" });
        }
        const ins = await pool.query(
          `INSERT INTO yk_leaderboard (generated_at, player_count, p3, p10, p50, p100, entries)
           VALUES (to_timestamp($1 / 1000.0), $2, $3, $4, $5, $6, $7::jsonb)
           ON CONFLICT (generated_at) DO NOTHING
           RETURNING generated_at`,
          [...row, JSON.stringify(b.entries || [])],
        );
        /*
         * The history comes back WITH the write receipt.
         *
         * The page's one call has to do both — record the build it is looking at and read
         * everything recorded so far — and when this returned only the receipt the page silently
         * fell back to its frozen backfill and stopped showing anything the cron collected. One
         * round trip, and no way to record without also being handed the result.
         */
        const after = await pool.query(
          `SELECT (EXTRACT(EPOCH FROM generated_at) * 1000)::bigint AS t,
                  player_count AS players, p3, p10, p50, p100, derived
             FROM yk_leaderboard ORDER BY generated_at ASC`,
        );
        res.setHeader("Cache-Control", "no-store");
        return res.status(200).json({
          collected: ins.rowCount > 0,          // false = this build was already recorded
          generatedAt: b.generatedAt,
          ageHours: +((Date.now() - b.generatedAt) / 3600000).toFixed(2),
          playerCount: b.playerCount,
          thresholds: { p3: row[2], p10: row[3], p50: row[4], p100: row[5] },
          rebuiltEveryHours: 4,
          snapshots: after.rows.map((x) => ({
            t: Number(x.t), players: x.players, p3: x.p3, p10: x.p10, p50: x.p50, p100: x.p100, derived: x.derived,
          })),
        });
      }
      const q = await pool.query(
        `SELECT (EXTRACT(EPOCH FROM generated_at) * 1000)::bigint AS t,
                player_count AS players, p3, p10, p50, p100, derived
           FROM yk_leaderboard ORDER BY generated_at ASC`,
      );
      res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=3600");
      return res.status(200).json({
        rebuiltEveryHours: 4,
        snapshots: q.rows.map((x) => ({
          t: Number(x.t), players: x.players, p3: x.p3, p10: x.p10, p50: x.p50, p100: x.p100, derived: x.derived,
        })),
      });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  /* ─── Fishing, reconstructed from the raw per-snapshot diffs ────
   *
   * A snapshot diff is not one action — it is everything that happened between two captures, so
   * a fishing session arrives mixed with digging, harvesting and deliveries. Two consequences
   * drive the whole shape of this:
   *
   *   1. FISH are unambiguous. A Surgeonfish can only come out of a rod, so every rod-spend diff
   *      can be counted for fish.
   *   2. TREASURE is not. Clam Shell, Old Bottle, Wooden Compass and Pipi drop from digging as
   *      well, and `inventory.Sand Shovel` moves in 57 of the 82 rod diffs. So treasure is
   *      tallied ONLY over diffs where no shovel moved — a third of the sample, but a third that
   *      cannot be wrong.
   *
   * Deltas are NET: bait crafted inside the same window nets against bait spent, which is why
   * 1,475 rods show only 973 bait. Both figures are returned so the caller can reconcile them
   * rather than being handed one number that quietly understates the casts.
   *
   * 130 rows out of 2,010 snapshots carry a rod, so this is computed on the fly — a precomputed
   * table would be machinery for a query that costs nothing.
   */
  if (req.query.type === "fishing") {
    try {
      const farm = parseInt(req.query.farm, 10);
      if (!Number.isFinite(farm) || !ALLOWED_FARMS.has(farm)) return res.status(400).json({ error: "disallowed farm" });
      const q = await pool.query(
        `SELECT captured_at, diff FROM farm_snapshots
          WHERE farm_id = $1 AND diff ? 'inventory.Rod'
          ORDER BY captured_at ASC`,
        [farm]
      );
      const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
      const BAIT = ["Earthworm", "Grub", "Red Wiggler", "Fishing Lure"];
      // Only species — anything that also drops from a shovel is treasure and handled separately.
      const SPECIES = new Set(["Anchovy","Butterflyfish","Blowfish","Clownfish","Sea Bass","Sea Horse","Horse Mackerel","Squid","Moray Eel","Olive Flounder","Napoleanfish","Surgeonfish","Zebra Turkeyfish","Angelfish","Halibut","Porgy","Muskellunge","Tilapia","Walleye","Ray","Rock Blackfish","Hammerhead shark","Hammerhead Shark","Tuna","Mahi Mahi","Blue Marlin","Weakfish","Oarfish","Football fish","Football Fish","Sunfish","Cobia","Barred Knifejaw","Trout","Coelacanth","Saw Shark","Whale Shark","White Shark","Parrotfish","Red Snapper","Crab","Starlight Tuna","Twilight Anglerfish","Gilded Swordfish","Radiant Ray","Phantom Barracuda","Crimson Carp","Battle Fish","Lemon Shark","Longhorn Cowfish"]);
      const TREASURE = new Set(["Clam Shell","Old Bottle","Wooden Compass","Iron Compass","Emerald Compass","Hieroglyph","Pipi","Coral","Crab Claw","Pirate Bounty","Pearl","Sea Cucumber","Seaweed","Starfish"]);

      let rods = 0, diffs = 0, firstAt = null, lastAt = null;
      const bait = {}, fish = {};
      let cleanDiffs = 0, cleanRods = 0;
      const treasure = {};
      for (const row of q.rows) {
        const d = row.diff || {};
        const rod = num(d["inventory.Rod"]);
        if (rod >= 0) continue;                       // rods gained (crafted/bought), not a session
        diffs++; rods += -rod;
        if (!firstAt) firstAt = row.captured_at;
        lastAt = row.captured_at;
        const dug = Object.prototype.hasOwnProperty.call(d, "inventory.Sand Shovel");
        if (!dug) { cleanDiffs++; cleanRods += -rod; }
        for (const b of BAIT) { const v = num(d["inventory." + b]); if (v < 0) bait[b] = (bait[b] || 0) - v; }
        for (const [k, raw] of Object.entries(d)) {
          if (!k.startsWith("inventory.")) continue;
          const v = num(raw); if (v <= 0) continue;
          const name = k.slice(10);
          if (SPECIES.has(name)) fish[name] = (fish[name] || 0) + v;
          else if (!dug && TREASURE.has(name)) treasure[name] = (treasure[name] || 0) + v;
        }
      }
      res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=3600");
      return res.status(200).json({
        firstAt, lastAt, diffs, rods, bait, fish,
        baitTotal: Object.values(bait).reduce((a, b) => a + b, 0),
        fishTotal: Object.values(fish).reduce((a, b) => a + b, 0),
        // Treasure carries its own sample size — it is a third of the rods and must be read as such.
        treasure: { items: treasure, diffs: cleanDiffs, rods: cleanRods,
                    total: Object.values(treasure).reduce((a, b) => a + b, 0) },
      });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  /* ─── What a venue is currently HOLDING ─────────────────────────
   *
   * The ledger says what was SENT somewhere; this says what is still there. Without it a
   * Yakkamon deposit reads as spent for the whole lock-up, when it is parked and refundable.
   *
   * `source` distinguishes a figure typed in by hand from one read out of the game. Yakkamon
   * exposes no per-account balance today, so it is manual; when it does, the same row is written
   * with source='game' and the UI drops the caveat by itself.
   */
  if (req.query.type === "spec") {
    try { return await handleSpec(pool, req, res); }
    catch (e) { console.error("spec:", e.message); return res.status(500).json({ error: e.message }); }
  }

  if (req.query.type === "venue-balance") {
    const method = (req.method || "GET").toUpperCase();
    try {
      const farm = parseInt(req.query.farm, 10);
      if (!Number.isFinite(farm) || !ALLOWED_FARMS.has(farm)) return res.status(400).json({ error: "disallowed farm" });
      if (method === "GET") {
        const r = await pool.query(
          `SELECT venue, amount, unit, source, noted_at FROM venue_balance WHERE farm_id = $1 ORDER BY venue`,
          [farm]
        );
        res.setHeader("Cache-Control", "no-store");
        return res.status(200).json({ balances: r.rows });
      }
      if (method === "POST" || method === "PUT") {
        const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
        const venue = (typeof body.venue === "string" && body.venue.trim())
          ? body.venue.trim().toLowerCase().slice(0, 32) : null;
        const amount = parseFloat(body.amount);
        const unit = (typeof body.unit === "string" && body.unit.trim()) ? body.unit.trim().slice(0, 16) : "FLOWER";
        const source = body.source === "game" ? "game" : "manual";
        if (!venue) return res.status(400).json({ error: "venue required" });
        if (!Number.isFinite(amount) || amount < 0) return res.status(400).json({ error: "amount must be >= 0" });
        const r = await pool.query(
          `INSERT INTO venue_balance (farm_id, venue, amount, unit, source, noted_at)
           VALUES ($1, $2, $3, $4, $5, NOW())
           ON CONFLICT (farm_id, venue) DO UPDATE
             SET amount = EXCLUDED.amount, unit = EXCLUDED.unit, source = EXCLUDED.source, noted_at = NOW()
           RETURNING venue, amount, unit, source, noted_at`,
          [farm, venue, amount, unit, source]
        );
        return res.status(200).json({ balance: r.rows[0] });
      }
      return res.status(405).json({ error: "method not allowed" });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ─── Investment Tracker: repay plan (one row per farm, a setting not a ledger) ───
  if (req.query.type === "repay-plan") {
    const method = (req.method || "GET").toUpperCase();
    try {
      const farm = parseInt(req.query.farm, 10);
      if (!Number.isFinite(farm) || !ALLOWED_FARMS.has(farm)) return res.status(400).json({ error: "disallowed farm" });
      if (method === "GET") {
        const r = await pool.query(
          `SELECT start_date::text AS start_date, rate, period, updated_at FROM repay_plan WHERE farm_id = $1`, [farm]);
        res.setHeader("Cache-Control", "no-store");
        return res.status(200).json({ plan: r.rows[0] || null });
      }
      if (method === "POST" || method === "PUT") {
        const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
        const startDate = typeof body.start_date === "string" ? body.start_date.slice(0, 10) : "";
        const rate = parseFloat(body.rate);
        const period = String(body.period || "year").toLowerCase();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return res.status(400).json({ error: "start_date must be YYYY-MM-DD" });
        if (!Number.isFinite(rate) || rate <= 0 || rate > 1000) return res.status(400).json({ error: "rate must be > 0 and <= 1000 (percent)" });
        if (!["day", "month", "year"].includes(period)) return res.status(400).json({ error: "period must be day, month or year" });
        const r = await pool.query(
          `INSERT INTO repay_plan (farm_id, start_date, rate, period)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (farm_id) DO UPDATE
             SET start_date = EXCLUDED.start_date, rate = EXCLUDED.rate, period = EXCLUDED.period, updated_at = NOW()
           RETURNING start_date::text AS start_date, rate, period, updated_at`,
          [farm, startDate, rate, period]
        );
        return res.status(200).json({ plan: r.rows[0] });
      }
      if (method === "DELETE") {
        await pool.query(`DELETE FROM repay_plan WHERE farm_id = $1`, [farm]);
        return res.status(200).json({ ok: true });
      }
      return res.status(405).json({ error: "method not allowed" });
    } catch (err) {
      console.error("[repay-plan]", err);
      return res.status(500).json({ error: "repay plan failed", detail: String(err.message || err) });
    }
  }

  // ─── Investment Tracker: btc_transactions CRUD ─────────────────
  if (req.query.type === "btc-tx") {
    const method = (req.method || "GET").toUpperCase();
    try {
      if (method === "GET") {
        const farm = parseInt(req.query.farm, 10);
        if (!Number.isFinite(farm)) return res.status(400).json({ error: "farm required" });
        if (!ALLOWED_FARMS.has(farm)) return res.status(400).json({ error: "disallowed farm" });
        const r = await pool.query(
          `SELECT id, farm_id, tx_date, direction, btc_amount, usd_amount, flower_amount, notes, venue, created_at
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
        const flower = body.flower_amount === undefined || body.flower_amount === null || body.flower_amount === ""
          ? null : parseFloat(body.flower_amount);
        const notes = typeof body.notes === "string" ? body.notes.slice(0, 500) : null;
        const txDate = typeof body.tx_date === "string" ? body.tx_date : null;
        // Free text, lower-cased and bounded. The UI offers the known venues; an unknown one is
        // recorded rather than rejected, because a new place to put money appears before the
        // code that knows about it.
        const venue = (typeof body.venue === "string" && body.venue.trim())
          ? body.venue.trim().toLowerCase().slice(0, 32) : "sfl";

        if (!Number.isFinite(farm) || farm <= 0) return res.status(400).json({ error: "farm_id required" });
        if (!ALLOWED_FARMS.has(farm)) return res.status(400).json({ error: "disallowed farm" });
        if (!["deposit", "withdrawal"].includes(direction)) return res.status(400).json({ error: "direction must be deposit or withdrawal" });
        if (!Number.isFinite(btc) || btc <= 0 || btc > 100) return res.status(400).json({ error: "btc_amount must be > 0 and <= 100" });
        if (usd !== null && (!Number.isFinite(usd) || usd < 0)) return res.status(400).json({ error: "usd_amount must be a non-negative number" });
        if (flower !== null && (!Number.isFinite(flower) || flower < 0)) return res.status(400).json({ error: "flower_amount must be a non-negative number" });
        // WALLET is a FLOWER<->BTC position: its held FLOWER and BTC balance are derived from the
        // per-transaction FLOWER amounts, so a wallet row without one would be uncountable.
        if (venue === "wallet" && (flower === null || flower <= 0)) return res.status(400).json({ error: "flower_amount is required for the wallet venue" });
        if (!txDate || !/^\d{4}-\d{2}-\d{2}$/.test(txDate)) return res.status(400).json({ error: "tx_date must be YYYY-MM-DD" });

        const r = await pool.query(
          `INSERT INTO btc_transactions (farm_id, tx_date, direction, btc_amount, usd_amount, flower_amount, notes, venue)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING id, farm_id, tx_date, direction, btc_amount, usd_amount, flower_amount, notes, venue, created_at`,
          [farm, txDate, direction, btc, usd, flower, notes, venue]
        );
        return res.status(201).json({ transaction: r.rows[0] });
      }

      /*
       * PATCH edits an existing row. Every field is optional — only the ones present in the body
       * are written — so the venue-only chip still works and the edit form can change any of
       * tx_date / direction / btc_amount / usd_amount / flower_amount / notes / venue. sfl_reader
       * holds column-level UPDATE on exactly these (see the GRANT), never id/farm_id/created_at.
       */
      if (method === "PATCH") {
        const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
        const farm = parseInt(req.query.farm, 10);
        const id = parseInt(req.query.id, 10);
        if (!Number.isFinite(farm) || !ALLOWED_FARMS.has(farm)) return res.status(400).json({ error: "disallowed farm" });
        if (!Number.isFinite(id)) return res.status(400).json({ error: "id required" });

        const sets = [], vals = [];
        const add = (col, val) => { vals.push(val); sets.push(`${col} = $${vals.length}`); };
        let venueVal, flowerVal, venueSet = false, flowerSet = false;

        if (body.venue !== undefined) {
          venueVal = (typeof body.venue === "string" && body.venue.trim()) ? body.venue.trim().toLowerCase().slice(0, 32) : null;
          if (!venueVal) return res.status(400).json({ error: "venue must be a non-empty string" });
          venueSet = true; add("venue", venueVal);
        }
        if (body.tx_date !== undefined) {
          if (typeof body.tx_date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body.tx_date)) return res.status(400).json({ error: "tx_date must be YYYY-MM-DD" });
          add("tx_date", body.tx_date);
        }
        if (body.direction !== undefined) {
          const d = String(body.direction).toLowerCase();
          if (!["deposit", "withdrawal"].includes(d)) return res.status(400).json({ error: "direction must be deposit or withdrawal" });
          add("direction", d);
        }
        if (body.btc_amount !== undefined) {
          const btc = parseFloat(body.btc_amount);
          if (!Number.isFinite(btc) || btc <= 0 || btc > 100) return res.status(400).json({ error: "btc_amount must be > 0 and <= 100" });
          add("btc_amount", btc);
        }
        if (body.usd_amount !== undefined) {
          const usd = (body.usd_amount === null || body.usd_amount === "") ? null : parseFloat(body.usd_amount);
          if (usd !== null && (!Number.isFinite(usd) || usd < 0)) return res.status(400).json({ error: "usd_amount must be a non-negative number" });
          add("usd_amount", usd);
        }
        if (body.flower_amount !== undefined) {
          flowerVal = (body.flower_amount === null || body.flower_amount === "") ? null : parseFloat(body.flower_amount);
          if (flowerVal !== null && (!Number.isFinite(flowerVal) || flowerVal < 0)) return res.status(400).json({ error: "flower_amount must be a non-negative number" });
          flowerSet = true; add("flower_amount", flowerVal);
        }
        if (body.notes !== undefined) add("notes", typeof body.notes === "string" ? body.notes.slice(0, 500) : null);

        if (!sets.length) return res.status(400).json({ error: "no fields to update" });

        // wallet must keep a positive FLOWER amount (same rule as POST). Check the MERGED result —
        // the effective venue/flower after this edit — reading whichever side the edit didn't set.
        if (venueSet || flowerSet) {
          const cur = await pool.query("SELECT venue, flower_amount FROM btc_transactions WHERE id = $1 AND farm_id = $2", [id, farm]);
          if (!cur.rowCount) return res.status(404).json({ error: "not found" });
          const effVenue = venueSet ? venueVal : String(cur.rows[0].venue || "").toLowerCase();
          const effFlower = flowerSet ? flowerVal : (cur.rows[0].flower_amount === null ? null : parseFloat(cur.rows[0].flower_amount));
          if (effVenue === "wallet" && !(effFlower > 0)) return res.status(400).json({ error: "flower_amount is required for the wallet venue" });
        }

        vals.push(id); const idIdx = vals.length;
        vals.push(farm); const farmIdx = vals.length;
        const r = await pool.query(
          `UPDATE btc_transactions SET ${sets.join(", ")} WHERE id = $${idIdx} AND farm_id = $${farmIdx}
           RETURNING id, farm_id, tx_date, direction, btc_amount, usd_amount, flower_amount, notes, venue, created_at`,
          vals
        );
        if (!r.rowCount) return res.status(404).json({ error: "not found" });
        return res.status(200).json({ transaction: r.rows[0] });
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

  // (power-summary branch removed 2026-07-19: the external cockpit that consumed it
  // is being folded into this app — ascension/wishlist compute directly from
  // /api/compute sections now, so nothing reads or writes the KV summary.)


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
