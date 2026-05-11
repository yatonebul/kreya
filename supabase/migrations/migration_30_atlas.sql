-- 30. Project Atlas — multi-platform publishing support.
--     Adds TikTok accounts table, target_platforms to pending_posts,
--     tiktok receipt columns, and platform column to oauth_pending_states.

-- pending_posts: which platforms to publish to (defaults to instagram only)
ALTER TABLE pending_posts
  ADD COLUMN IF NOT EXISTS target_platforms  TEXT[]  DEFAULT ARRAY['instagram'],
  ADD COLUMN IF NOT EXISTS tiktok_post_id    TEXT,
  ADD COLUMN IF NOT EXISTS tiktok_post_url   TEXT;

-- tiktok_accounts: mirrors instagram_accounts for TikTok OAuth tokens.
-- open_id is TikTok's immutable user identifier (like instagram_user_id).
-- Minimum scope required: user.info.basic,video.publish
CREATE TABLE IF NOT EXISTS tiktok_accounts (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  whatsapp_phone      TEXT        NOT NULL,
  open_id             TEXT        NOT NULL UNIQUE,
  account_name        TEXT,
  access_token        TEXT        NOT NULL,
  refresh_token       TEXT,
  token_expires_at    TIMESTAMPTZ,
  refresh_expires_at  TIMESTAMPTZ,
  is_active           BOOLEAN     NOT NULL DEFAULT TRUE,
  brand_name          TEXT,
  niche               TEXT,
  tone                TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tiktok_accounts_phone
  ON tiktok_accounts (whatsapp_phone);

-- oauth_pending_states: platform column to distinguish IG vs TikTok OAuth flows.
ALTER TABLE oauth_pending_states
  ADD COLUMN IF NOT EXISTS platform TEXT DEFAULT 'instagram';
