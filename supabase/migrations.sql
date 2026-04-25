-- ============================================================
-- Kreya — cumulative Supabase migrations
-- Run each block once. All statements are idempotent (safe to re-run).
-- ============================================================


-- 1. pending_posts — columns added for user photo/video upload feature
ALTER TABLE pending_posts
  ADD COLUMN IF NOT EXISTS user_image_url  TEXT,
  ADD COLUMN IF NOT EXISTS image_source    TEXT    DEFAULT 'ai',
  ADD COLUMN IF NOT EXISTS is_video        BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS sibling_id      UUID    REFERENCES pending_posts(id);


-- 2. user_profiles — WhatsApp onboarding wizard + per-user brand context
CREATE TABLE IF NOT EXISTS user_profiles (
  whatsapp_phone  TEXT        PRIMARY KEY,
  onboarding_step INT         DEFAULT 1,
  brand_name      TEXT,
  niche           TEXT,
  tone            TEXT,
  profile_context TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 3. pending_posts — scheduling support
ALTER TABLE pending_posts
  ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMPTZ;


-- 4. instagram_accounts — per-user phone mapping + OAuth CSRF state
ALTER TABLE instagram_accounts
  ADD COLUMN IF NOT EXISTS whatsapp_phone TEXT,
  ADD COLUMN IF NOT EXISTS oauth_state    TEXT;
CREATE INDEX IF NOT EXISTS idx_instagram_accounts_phone ON instagram_accounts(whatsapp_phone);

-- 5. oauth_pending_states — temporary CSRF state tokens for Instagram OAuth flow
CREATE TABLE IF NOT EXISTS oauth_pending_states (
  state       TEXT        PRIMARY KEY,
  phone       TEXT        NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 6. waitlist_entries — landing page phone + email collection
CREATE TABLE IF NOT EXISTS waitlist_entries (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  phone      TEXT,
  email      TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_waitlist_phone ON waitlist_entries(phone) WHERE phone IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_waitlist_email ON waitlist_entries(email) WHERE email IS NOT NULL;


-- 7. pending_posts — 3 caption variants per draft (user picks 1/2/3 to swap)
ALTER TABLE pending_posts
  ADD COLUMN IF NOT EXISTS caption_variants JSONB;


-- Auto-clean states older than 15 minutes (run once to register)
-- SELECT cron.schedule('clean-oauth-states', '*/15 * * * *',
--   $$DELETE FROM oauth_pending_states WHERE created_at < NOW() - INTERVAL '15 minutes'$$);


-- Skip onboarding for an existing user (replace number as needed)
-- INSERT INTO user_profiles (whatsapp_phone, onboarding_step, brand_name, niche, tone, profile_context)
-- VALUES (
--   '385XXXXXXXXX',
--   4,
--   'Your Brand',
--   'your niche',
--   'your tone',
--   'Brand: Your Brand. Niche: your niche. Tone: your tone. Write captions that feel authentic to this brand.'
-- )
-- ON CONFLICT (whatsapp_phone) DO NOTHING;
