-- Per-farm counts of the nodes you can BUY with sunstones (obsidian 3:1), split by merge
-- tier, so the World page can chart how many of each node type farms actually have.
--
-- Shape: {"trees":[t1,t2,t3], "stones":[...], ...} over the ten buyable types from the
-- game's RESOURCE_NODE_PRICES (buyResource.ts): crops, trees, stones, fruitPatches, iron,
-- gold, crimstones, flowers, oilReserves, lavaPits.
--
-- Why a column and not a query over game_data: the charts GROUP BY this across every farm,
-- and game_data averages ~44 KB and lives in TOAST, so a full scan has to decompress every
-- row — measured at over 10 minutes for the active population alone, before the dead farms
-- are even considered. This column is ~200 bytes, stays in the heap, and scans quickly.
--
-- Backfilled for ALL farms, not just active ones, because the World page's scope control
-- offers "everything / 90 days / 30 days"; populating only the active rows would make the
-- "everything" view silently disagree with every other chart on the page.
ALTER TABLE farm_world ADD COLUMN IF NOT EXISTS node_tiers JSONB;

-- Merging exists only for trees, stones, iron and gold (4x tier N -> 1x tier N+1, stored
-- as `multiplier` 4 then 16). Verified across the whole active population: no node of the
-- other six types has multiplier > 1 anywhere, so their t2/t3 are structurally zero.
--
-- Reference distribution at the time of writing (active 90d), which is why the chart
-- stacks farms into only-t1 / has-t2 / has-t3 rather than by tier combination — merging is
-- a rare-event story, not a spread:
--   Tree        847,955 t1 / 73,955 farms | t2 2,964 on 1,189 farms | t3   456 on 448 farms
--   Stone Rock  704,426 t1 / 74,191 farms | t2   872 on   361 farms | t3   133 on 133 farms
--   Iron Rock   386,007 t1 / 66,467 farms | t2   278 on   114 farms | t3    41 on  41 farms
--   Gold Rock   221,509 t1 / 60,694 farms | t2   229 on   125 farms | t3     1 on   1 farm
COMMENT ON COLUMN farm_world.node_tiers IS
  'Sunstone-buyable node counts per type as [t1,t2,t3]; see 2026-07-28-node-tiers.sql';
