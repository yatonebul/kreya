-- Enable pgcrypto extension for encryption
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Add encrypted column for Instagram access tokens
ALTER TABLE instagram_accounts
  ADD COLUMN IF NOT EXISTS access_token_encrypted TEXT;

-- Backfill existing tokens (encrypt with encryption key)
-- NOTE: This requires ENCRYPTION_KEY env var to be set at runtime
-- For migration testing, use a dummy key or manually set it before running
UPDATE instagram_accounts
SET access_token_encrypted = pgp_sym_encrypt(
  access_token,
  'temporary-migration-key'
)
WHERE access_token IS NOT NULL
  AND access_token_encrypted IS NULL;
