-- WALLET venue tracks a FLOWER<->BTC speculation position, so each transaction now records
-- the FLOWER amount alongside the BTC amount. Nullable: SFL/YAKKE rows may omit it, and every
-- row that predates this column has it NULL. The WALLET card derives held FLOWER and its BTC
-- balance from these per-transaction amounts (see flowers.html invAggregate / renderInvestmentTracker).
ALTER TABLE btc_transactions ADD COLUMN IF NOT EXISTS flower_amount numeric;
