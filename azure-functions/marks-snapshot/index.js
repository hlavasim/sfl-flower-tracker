const { getPool } = require("../shared/db");
const { fetchFarmData, fetchLeaderboard } = require("../shared/api");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const RATE_LIMIT_DELAY = 11000;
const MAX_RUNTIME_MS = 8 * 60 * 1000; // 8 min budget (Azure timeout is 10 min)
const TARGET_RANK = 50;
const BASE_POINTS = 20;

// ── Emblem tiers (Nightshades) ──
const EMBLEM_TIERS = [
  { min: 16850, boost: 4.00, name: "Lich" },
  { min: 8700,  boost: 3.80, name: "Sorcerer" },
  { min: 5500,  boost: 3.50, name: "Witch" },
  { min: 2700,  boost: 3.00, name: "Raver" },
  { min: 290,   boost: 1.50, name: "Enchanter" },
  { min: 20,    boost: 0.05, name: "Occultist" },
  { min: 0,     boost: 0.00, name: "Pagan" },
];

// ── Nightshade wearable boosts ──
const NIGHTSHADE_GEAR = {
  shirt: { "Nightshade Armor": 0.20 },
  hat:   { "Nightshade Helmet": 0.10, "Nightshade Crown": 0.10 },
  tool:  { "Nightshade Sword": 0.10 },
  pants: { "Nightshade Pants": 0.05 },
  shoes: { "Nightshade Sabatons": 0.05 },
};

const PET_BASE_REWARDS = { 0: 4, 1: 8, 2: 12, 3: 20 };
const PAW_SHIELD_BOOST = 0.25;

// ── Schedule gating ──
function shouldStartNewCycle(now) {
  const day = now.getUTCDay(); // 0=Sun
  const hour = now.getUTCHours();
  const min = now.getUTCMinutes();
  if (day === 0 && hour >= 20) return true; // Sunday nonstop
  if (day === 0) return min < 10;           // Sunday hourly
  if (day === 6) return hour % 2 === 0 && min < 10;  // Sat 2h
  if (day === 5) return hour % 4 === 0 && min < 10;  // Fri 4h
  return hour % 8 === 0 && min < 10;                  // Mon-Thu 8h
}

function getWeekStart(d) {
  const dt = new Date(d);
  dt.setUTCHours(0, 0, 0, 0);
  const dayOfWeek = dt.getUTCDay();
  const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Monday = 0
  dt.setUTCDate(dt.getUTCDate() - diff);
  return dt.toISOString().slice(0, 10);
}

function getDayOfWeek(weekStart) {
  const ws = new Date(weekStart + "T00:00:00Z");
  const now = new Date();
  const diff = Math.floor((now - ws) / 86400000);
  return Math.min(Math.max(diff + 1, 1), 7);
}

function getDaysLeft(weekStart) {
  const ws = new Date(weekStart + "T00:00:00Z");
  const end = new Date(ws.getTime() + 7 * 86400000);
  return Math.max(0, (end - Date.now()) / 86400000);
}

// ── Helpers ──
function getTier(emblems) {
  for (const t of EMBLEM_TIERS) {
    if (emblems >= t.min) return t;
  }
  return EMBLEM_TIERS[EMBLEM_TIERS.length - 1];
}

function getWearBoost(equipped) {
  let boost = 0;
  for (const [slot, items] of Object.entries(NIGHTSHADE_GEAR)) {
    const worn = equipped[slot] || "";
    if (items[worn]) boost += items[worn];
  }
  return Math.min(boost, 0.50);
}

function calcMarksSequence(count, startFulfilled, basePoints = BASE_POINTS) {
  let total = 0;
  for (let i = 0; i < count; i++) {
    total += Math.max(basePoints - (startFulfilled + i) * 2, 1);
  }
  return total;
}

function computeProjections(resources, kitchenItems, todayFulfilled, multiplier, petFoodStock, petMult, petRequests, daysLeft, todayDayNum) {
  let marksOptimal = 0, marksDump = 0, marksDailyFresh = 0;

  for (const ki of kitchenItems) {
    const item = ki.item;
    const amount = ki.amount;
    const stock = resources[item] || 0;
    const totalDeliveries = Math.floor(stock / amount);
    const fulfilled = todayFulfilled[item] || 0;

    // Optimal: spread 10/day, full days left
    const optimalDays = Math.ceil(daysLeft);
    const deliveriesPerDay = Math.min(10, totalDeliveries);
    const optDlvTotal = Math.min(totalDeliveries, deliveriesPerDay * optimalDays);
    const fullDays = Math.floor(optDlvTotal / deliveriesPerDay) || 0;
    const remainder = optDlvTotal % deliveriesPerDay;
    const rawOptimal = fullDays * calcMarksSequence(deliveriesPerDay, 0) + calcMarksSequence(remainder, 0);
    marksOptimal += rawOptimal * multiplier;

    // Dump: all at once from current fulfilled
    const rawDump = calcMarksSequence(totalDeliveries, fulfilled);
    marksDump += rawDump * multiplier;

    // Daily fresh: 10 from 0 fulfilled
    const dailyDlv = Math.min(10, totalDeliveries);
    const rawDaily = calcMarksSequence(dailyDlv, 0);
    marksDailyFresh += rawDaily * multiplier;
  }

  // Pet feeding
  let petDaily = 0, petWeekly = 0;
  for (let slot = 0; slot < petRequests.length; slot++) {
    const req = petRequests[slot];
    const food = req.food;
    const qty = req.quantity || 1;
    const base = PET_BASE_REWARDS[slot] || 4;
    const have = petFoodStock[food] || 0;
    const deliveries = Math.floor(have / qty);

    // Optimal daily: base/2 deliveries (before hitting 1 per delivery)
    const optDailyDlv = Math.min(deliveries, Math.max(1, Math.floor(base / 2)));
    const rawDaily = calcMarksSequence(optDailyDlv, 0, base);
    petDaily += rawDaily * petMult;

    // Weekly: optDailyDlv × 7 days (capped by stock)
    const weeklyDlv = Math.min(deliveries, optDailyDlv * 7);
    const fullDays = optDailyDlv > 0 ? Math.floor(weeklyDlv / optDailyDlv) : 0;
    const rem = optDailyDlv > 0 ? weeklyDlv % optDailyDlv : 0;
    const rawWeekly = fullDays * rawDaily + calcMarksSequence(rem, 0, base);
    petWeekly += rawWeekly * petMult;
  }

  return { marksOptimal, marksDump, marksDailyFresh, petDaily, petWeekly };
}

// ══════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════
module.exports = async function (context) {
  const startTime = Date.now();
  const now = new Date();
  const pool = getPool();
  const myFarmId = process.env.MARKS_MY_FARM_ID || "155498";
  const seedFarms = (process.env.MARKS_SEED_FARMS || "").split(",").map(s => s.trim()).filter(Boolean);
  const weekStart = getWeekStart(now);

  const elapsed = () => Date.now() - startTime;
  const timeLeft = () => MAX_RUNTIME_MS - elapsed();

  // ── Load crawl state ──
  const stateRes = await pool.query("SELECT * FROM marks_crawl_state WHERE id = 1");
  const state = stateRes.rows[0];

  // ── If idle, check if we should start a new cycle ──
  if (state.phase === "idle") {
    if (!shouldStartNewCycle(now)) {
      context.log("Schedule says skip. Idle.");
      return;
    }
    // Start new cycle
    await pool.query(
      `UPDATE marks_crawl_state SET phase = 'discover', cycle_started_at = NOW(),
       roster = '[]', discover_cursor = 0, crawl_cursor = 0, updated_at = NOW() WHERE id = 1`
    );
    state.phase = "discover";
    state.roster = [];
    state.discover_cursor = 0;
    state.crawl_cursor = 0;
    context.log(`Starting new cycle for week ${weekStart}`);
  }

  // ── DISCOVER PHASE ──
  if (state.phase === "discover") {
    context.log(`Discovery phase, cursor=${state.discover_cursor}, roster=${(state.roster || []).length}`);
    let roster = state.roster || [];
    let cursor = state.discover_cursor || 0;
    const byFarmId = {};
    for (const p of roster) byFarmId[p.farmId] = p;

    // On first call (cursor=0), seed from previous snapshots + env var
    if (cursor === 0) {
      // Load known farms from last week's snapshots
      const prevRes = await pool.query(
        `SELECT DISTINCT farm_id, player_name FROM marks_snapshots
         WHERE week_start >= $1::date - 7 ORDER BY farm_id`, [weekStart]
      );
      for (const row of prevRes.rows) {
        const fid = String(row.farm_id);
        if (!byFarmId[fid]) {
          byFarmId[fid] = { farmId: fid, name: row.player_name || "", rank: 999, marks: 0 };
        }
      }
      // Add seed farms
      for (const fid of seedFarms) {
        if (!byFarmId[fid]) {
          byFarmId[fid] = { farmId: fid, name: "", rank: 999, marks: 0 };
        }
      }
      // Add own farm
      if (!byFarmId[myFarmId]) {
        byFarmId[myFarmId] = { farmId: myFarmId, name: "", rank: 999, marks: 0 };
      }
    }

    // Discovery loop: crawl leaderboard from different positions
    // Strategy: start with own farm, then crawl from highest known rank
    const crawlQueue = [myFarmId]; // start with own farm
    const crawled = new Set();

    while (timeLeft() > RATE_LIMIT_DELAY * 2 + 5000) {
      // Pick next farm to query leaderboard from
      let queryFarmId;
      if (crawlQueue.length > 0) {
        queryFarmId = crawlQueue.shift();
      } else {
        // Pick the player with highest rank <= TARGET_RANK that we haven't crawled from
        const candidates = Object.values(byFarmId)
          .filter(p => p.rank > 0 && p.rank <= TARGET_RANK + 5 && !crawled.has(p.farmId))
          .sort((a, b) => b.rank - a.rank);
        if (candidates.length === 0) break;
        queryFarmId = candidates[0].farmId;
      }

      if (crawled.has(queryFarmId)) {
        // Already crawled, try next
        continue;
      }
      crawled.add(queryFarmId);
      cursor++;

      context.log(`  Discovery #${cursor}: querying from farm ${queryFarmId}`);
      try {
        const data = await fetchLeaderboard(queryFarmId);
        const marksData = data.marks || {};

        // Top 10
        const top10 = (marksData.topTens?.nightshades || [])
          .sort((a, b) => b.count - a.count);
        for (let i = 0; i < top10.length; i++) {
          const p = top10[i];
          const fid = String(p.accountId);
          byFarmId[fid] = { farmId: fid, name: p.id || "", rank: i + 1, marks: p.count || 0 };
        }

        // Nearby ranks
        for (const p of (marksData.marksRankingData || [])) {
          const fid = String(p.accountId);
          const existing = byFarmId[fid];
          if (!existing || (p.rank && p.rank < existing.rank)) {
            byFarmId[fid] = { farmId: fid, name: p.id || "", rank: p.rank || 999, marks: p.count || 0 };
          }
        }
      } catch (e) {
        context.log.error(`  Discovery error: ${e.message}`);
      }

      await sleep(RATE_LIMIT_DELAY);

      // Check if we've covered enough
      const coveredRanks = new Set(
        Object.values(byFarmId).filter(p => p.rank >= 1 && p.rank <= TARGET_RANK).map(p => p.rank)
      );
      if (coveredRanks.size >= TARGET_RANK) {
        context.log(`  Discovered all ${TARGET_RANK} ranks`);
        break;
      }
    }

    // Build roster (top TARGET_RANK by rank)
    roster = Object.values(byFarmId)
      .filter(p => p.rank >= 1 && p.rank <= TARGET_RANK + 10)
      .sort((a, b) => a.rank - b.rank)
      .slice(0, TARGET_RANK + 5);

    context.log(`Discovery complete: ${roster.length} players in roster`);

    // Check if discovery is done or needs more time
    const coveredRanks = new Set(roster.filter(p => p.rank <= TARGET_RANK).map(p => p.rank));
    const discoveryDone = coveredRanks.size >= TARGET_RANK - 5 || cursor >= 50;

    if (discoveryDone || timeLeft() < RATE_LIMIT_DELAY * 3) {
      // Move to crawl phase
      await pool.query(
        `UPDATE marks_crawl_state SET phase = 'crawl', roster = $1, discover_cursor = $2,
         crawl_cursor = 0, updated_at = NOW() WHERE id = 1`,
        [JSON.stringify(roster), cursor]
      );
      context.log(`Switching to crawl phase with ${roster.length} farms`);

      // If we still have time, start crawling
      if (timeLeft() > RATE_LIMIT_DELAY * 2 + 5000) {
        state.phase = "crawl";
        state.roster = roster;
        state.crawl_cursor = 0;
      } else {
        return;
      }
    } else {
      // Save progress, continue next invocation
      await pool.query(
        `UPDATE marks_crawl_state SET roster = $1, discover_cursor = $2, updated_at = NOW() WHERE id = 1`,
        [JSON.stringify(roster), cursor]
      );
      context.log(`Discovery paused at cursor ${cursor}, ${roster.length} farms found`);
      return;
    }
  }

  // ── CRAWL PHASE ──
  if (state.phase === "crawl") {
    const roster = state.roster || [];
    let cursor = state.crawl_cursor || 0;
    const todayDayNum = getDayOfWeek(weekStart);
    const daysLeft = getDaysLeft(weekStart);

    context.log(`Crawl phase: ${cursor}/${roster.length}, day ${todayDayNum}/7, ${daysLeft.toFixed(1)} days left`);

    // On first farm, detect kitchen + pet config
    let kitchenItems = [];
    let petRequests = [];

    // Try to load week config
    const weekRes = await pool.query("SELECT * FROM marks_weeks WHERE week_start = $1", [weekStart]);
    if (weekRes.rows.length > 0) {
      kitchenItems = weekRes.rows[0].kitchen_items || [];
      petRequests = weekRes.rows[0].pet_items || [];
    }

    while (cursor < roster.length && timeLeft() > RATE_LIMIT_DELAY + 5000) {
      const player = roster[cursor];
      cursor++;

      context.log(`  [${cursor}/${roster.length}] #${player.rank} ${player.name} (${player.farmId})`);

      try {
        const apiKey = process.env.SFL_API_KEY;
        const data = await fetchFarmData(player.farmId, apiKey);
        const farm = data.farm || data;
        const inv = farm.inventory || {};
        const faction = farm.faction || {};
        const kitchen = faction.kitchen || {};
        const bumpkin = farm.bumpkin || {};
        const equipped = bumpkin.equipped || {};
        const pet = faction.pet || {};

        // Extract kitchen + pet config from first farm if not yet saved
        if (kitchenItems.length === 0) {
          for (const req of (kitchen.requests || [])) {
            kitchenItems.push({ item: req.item, amount: req.amount });
          }
          for (const req of (pet.requests || [])) {
            petRequests.push({ food: req.food, quantity: req.quantity });
          }
          if (kitchenItems.length > 0) {
            await pool.query(
              `INSERT INTO marks_weeks (week_start, kitchen_items, pet_items)
               VALUES ($1, $2, $3)
               ON CONFLICT (week_start) DO UPDATE SET kitchen_items = $2, pet_items = $3`,
              [weekStart, JSON.stringify(kitchenItems), JSON.stringify(petRequests)]
            );
            context.log(`  Saved week config: ${kitchenItems.map(k => k.item).join(", ")}`);
          }
        }

        // Extract resources
        const num = (key) => {
          const v = inv[key];
          if (v == null) return 0;
          return typeof v === "string" ? parseFloat(v) || 0 : Number(v) || 0;
        };

        const resources = {};
        for (const ki of kitchenItems) {
          resources[ki.item] = num(ki.item);
        }

        // Emblems + tier
        const emblems = Math.floor(num("Nightshade Emblem"));
        const tier = getTier(emblems);

        // Wearable boost
        const wearBoost = getWearBoost(equipped);
        const multiplier = 1 + tier.boost + wearBoost;

        // Today fulfilled per resource
        const todayFulfilled = {};
        const dayStr = String(todayDayNum);
        for (const req of (kitchen.requests || [])) {
          const daily = req.dailyFulfilled || {};
          todayFulfilled[req.item] = daily[dayStr] || 0;
        }

        // Pet data
        const hasPawShield = equipped.secondaryTool === "Paw Shield";
        const petMult = 1 + tier.boost + wearBoost + (hasPawShield ? PAW_SHIELD_BOOST : 0);
        const petFoodStock = {};
        for (const req of (pet.requests || [])) {
          petFoodStock[req.food] = num(req.food);
        }

        // Faction marks from history
        const history = faction.history || {};
        const weekData = history[weekStart] || {};
        const factionMarks = weekData.score || player.marks || 0;

        // SFL balance
        const sfl = parseFloat(farm.balance || "0") || 0;

        // Compute projections
        const proj = computeProjections(
          resources, kitchenItems, todayFulfilled, multiplier,
          petFoodStock, petMult, petRequests, daysLeft, todayDayNum
        );

        // INSERT snapshot
        await pool.query(
          `INSERT INTO marks_snapshots (
            week_start, farm_id, player_name, rank, marks,
            emblems, tier, rank_boost, wear_boost, multiplier,
            resources, today_fulfilled,
            has_paw_shield, pet_mult, pet_food_stock,
            sfl, marks_optimal, marks_dump, marks_daily_fresh, pet_daily, pet_weekly
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)`,
          [
            weekStart, parseInt(player.farmId), player.name, player.rank, factionMarks,
            emblems, tier.name, tier.boost, wearBoost, multiplier,
            JSON.stringify(resources), JSON.stringify(todayFulfilled),
            hasPawShield, petMult, JSON.stringify(petFoodStock),
            sfl, proj.marksOptimal, proj.marksDump, proj.marksDailyFresh, proj.petDaily, proj.petWeekly
          ]
        );
      } catch (e) {
        context.log.error(`  Error for ${player.farmId}: ${e.message}`);
      }

      if (cursor < roster.length) {
        await sleep(RATE_LIMIT_DELAY);
      }
    }

    if (cursor >= roster.length) {
      // Crawl complete — go idle
      await pool.query(
        `UPDATE marks_crawl_state SET phase = 'idle', crawl_cursor = $1, updated_at = NOW() WHERE id = 1`,
        [cursor]
      );
      context.log(`Crawl complete! ${cursor} farms processed.`);
    } else {
      // Paused — save progress
      await pool.query(
        `UPDATE marks_crawl_state SET crawl_cursor = $1, updated_at = NOW() WHERE id = 1`,
        [cursor]
      );
      context.log(`Crawl paused at ${cursor}/${roster.length}. Resuming next invocation.`);
    }
  }
};
