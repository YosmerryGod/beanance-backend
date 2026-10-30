ALTER TABLE wallets
ADD COLUMN chain_id INTEGER NOT NULL DEFAULT 56;

CREATE INDEX idx_wallets_chain_id
ON wallets(chain_id);
