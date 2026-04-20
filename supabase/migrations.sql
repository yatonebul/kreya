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


-- 4. waitlist — email collection with platform interests
CREATE TABLE IF NOT EXISTS waitlist (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT        NOT NULL UNIQUE,
  platforms   TEXT[]      DEFAULT '{}',
  use_case    TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
