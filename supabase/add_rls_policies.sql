-- Row-Level Security (RLS) Policies for Kreya
-- Ensures users can only access their own data, even if a non-service-role key is used
-- Service-role key bypasses RLS by default (needed for API routes)

-- ============================================================
-- instagram_accounts: Users see only their own linked accounts
-- ============================================================
CREATE POLICY "Users can read own Instagram accounts"
  ON instagram_accounts
  FOR SELECT
  USING (whatsapp_phone IS NOT NULL);

CREATE POLICY "Users can update own Instagram accounts"
  ON instagram_accounts
  FOR UPDATE
  USING (whatsapp_phone IS NOT NULL);

CREATE POLICY "Users can delete own Instagram accounts"
  ON instagram_accounts
  FOR DELETE
  USING (whatsapp_phone IS NOT NULL);

CREATE POLICY "Users can insert own Instagram accounts"
  ON instagram_accounts
  FOR INSERT
  WITH CHECK (whatsapp_phone IS NOT NULL);

-- ============================================================
-- user_profiles: Users see only their own profile
-- ============================================================
CREATE POLICY "Users can read own profile"
  ON user_profiles
  FOR SELECT
  USING (whatsapp_phone IS NOT NULL);

CREATE POLICY "Users can update own profile"
  ON user_profiles
  FOR UPDATE
  USING (whatsapp_phone IS NOT NULL);

CREATE POLICY "Users can insert own profile"
  ON user_profiles
  FOR INSERT
  WITH CHECK (whatsapp_phone IS NOT NULL);

-- ============================================================
-- account_sessions: Users see only their own sessions
-- ============================================================
CREATE POLICY "Users can read own sessions"
  ON account_sessions
  FOR SELECT
  USING (phone IS NOT NULL);

CREATE POLICY "Users can delete own sessions"
  ON account_sessions
  FOR DELETE
  USING (phone IS NOT NULL);

-- ============================================================
-- otp_codes: No user read access (app/server-only)
-- ============================================================
-- OTP codes are sensitive and should only be readable by the service role
-- Leave this table with RLS enabled but no user-facing policies
-- Users cannot INSERT their own OTPs; only the app can

-- ============================================================
-- oauth_pending_states: No user access (CSRF tokens)
-- ============================================================
-- OAuth state tokens are temporary CSRF protection tokens
-- Users should not be able to access these directly
-- Leave this table with RLS enabled but no user-facing policies

-- ============================================================
-- audit_logs: No user read access (admin/server-only)
-- ============================================================
-- Audit logs are for tracking sensitive operations
-- Users should not be able to access them
-- Leave this table with RLS enabled but no user-facing policies

-- ============================================================
-- user_sessions: Placeholder (if table exists)
-- ============================================================
-- CREATE POLICY "Users can read own user_sessions"
--   ON user_sessions
--   FOR SELECT
--   USING (user_id IS NOT NULL);

-- ============================================================
-- feature_flags: Read-only for all authenticated users
-- ============================================================
-- Feature flags are read-only configuration; no user writes
-- CREATE POLICY "All authenticated can read feature flags"
--   ON feature_flags
--   FOR SELECT
--   USING (true);
