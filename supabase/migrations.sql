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


-- 8. user_profiles — voice/style learned from the user's past Instagram captions.
-- Augments profile_context (which holds the brand/niche/tone the user typed in onboarding).
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS learned_style TEXT;


-- 9. pending_posts — 24h post-mortem support.
--    published_at        — actual publish timestamp (separate from created_at,
--                          which is the original draft time).
--    post_mortem_sent_at — set when the 24h digest WhatsApp goes out, so the
--                          cron job is idempotent.
ALTER TABLE pending_posts
  ADD COLUMN IF NOT EXISTS published_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS post_mortem_sent_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_pending_posts_post_mortem
  ON pending_posts (state, published_at)
  WHERE state = 'published' AND post_mortem_sent_at IS NULL;


-- Auto-clean states older than 15 minutes (run once to register)
-- SELECT cron.schedule('clean-oauth-states', '*/15 * * * *',
--   $$DELETE FROM oauth_pending_states WHERE created_at < NOW() - INTERVAL '15 minutes'$$);


-- ============================================================
-- pg_cron schedules (Vercel Hobby blocks every-5min cron, so we
-- run the time-sensitive jobs from Supabase via pg_cron + pg_net).
-- Run once per project. Replace BASE_URL and CRON_SECRET below.
-- ============================================================
--
-- 1) ENABLE EXTENSIONS (Database → Extensions, or run SQL):
--    CREATE EXTENSION IF NOT EXISTS pg_cron;
--    CREATE EXTENSION IF NOT EXISTS pg_net;
--
-- 2) SCHEDULE: publish due drafts every minute
-- SELECT cron.schedule(
--   'kreya-publish-scheduled',
--   '* * * * *',
--   $$
--   SELECT net.http_get(
--     url := 'https://kreya-github.vercel.app/api/cron/publish-scheduled',
--     headers := '{"Authorization":"Bearer YOUR_CRON_SECRET"}'::jsonb
--   );
--   $$
-- );
--
-- 3) SCHEDULE: 24h post-mortem digests, hourly
-- SELECT cron.schedule(
--   'kreya-post-mortem',
--   '0 * * * *',
--   $$
--   SELECT net.http_get(
--     url := 'https://kreya-github.vercel.app/api/cron/post-mortem',
--     headers := '{"Authorization":"Bearer YOUR_CRON_SECRET"}'::jsonb
--   );
--   $$
-- );
--
-- To inspect:   SELECT * FROM cron.job;
-- To remove:    SELECT cron.unschedule('kreya-post-mortem');


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
