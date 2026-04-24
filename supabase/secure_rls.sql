-- Security: Enable Row-Level Security on all tables
-- Run once in the Supabase SQL editor:
--   https://supabase.com/dashboard/project/kuwkdxahsugsfblgbetk/sql
--
-- All API routes use SUPABASE_SERVICE_ROLE_KEY which bypasses RLS by default,
-- so no application changes are required. This migration closes direct REST API
-- access via the anon/authenticated roles.

-- 1. Enable RLS (default-deny for anon/authenticated; service_role unaffected)
ALTER TABLE otp_codes               ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_sessions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_registrations     ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles           ENABLE ROW LEVEL SECURITY;
ALTER TABLE instagram_accounts      ENABLE ROW LEVEL SECURITY;
ALTER TABLE oauth_pending_states    ENABLE ROW LEVEL SECURITY;
ALTER TABLE waitlist_entries        ENABLE ROW LEVEL SECURITY;
ALTER TABLE pending_posts           ENABLE ROW LEVEL SECURITY;

-- 2. Revoke any existing public grants (belt-and-suspenders)
REVOKE ALL ON otp_codes            FROM anon, authenticated;
REVOKE ALL ON account_sessions     FROM anon, authenticated;
REVOKE ALL ON email_registrations  FROM anon, authenticated;
REVOKE ALL ON user_profiles        FROM anon, authenticated;
REVOKE ALL ON instagram_accounts   FROM anon, authenticated;
REVOKE ALL ON oauth_pending_states FROM anon, authenticated;
REVOKE ALL ON waitlist_entries     FROM anon, authenticated;
REVOKE ALL ON pending_posts        FROM anon, authenticated;
