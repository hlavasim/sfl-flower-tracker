-- Hourly LP boards: the farm-history POST prunes rows older than 48 h (keeps the first of each day).
GRANT DELETE ON lp_leaderboard TO sfl_reader;
