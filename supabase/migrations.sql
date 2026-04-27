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


-- 10. pending_posts — carousel support.
--     media_items: JSONB array of {url, is_video} entries (up to 10 slides).
--                  Null for single-media posts (back-compat: read image_url).
--     'collecting_carousel' is an additional state value used while the user
--     is dropping photos into a /carousel session; finalizes to
--     'pending_approval' on 'done'.
ALTER TABLE pending_posts
  ADD COLUMN IF NOT EXISTS media_items JSONB;


-- 11. instagram_accounts — multi-account-per-phone support.
--     org_id is a leftover NOT NULL column from an earlier multi-tenant
--     scaffolding iteration. It blocks new IG connections (UI shows a DB
--     error on a fresh OAuth). Code never reads it; service-role-key access
--     bypasses RLS, so dropping the constraint is safe.
ALTER TABLE instagram_accounts ALTER COLUMN org_id DROP NOT NULL;


-- 12. user_profiles — pricing plan stub for future paywalls.
--     'free' allows one connected IG account; 'pro' / 'agency' will allow
--     multiple. The OAuth callback / UI does NOT enforce yet — column is
--     here so the gate can be flipped without another migration.
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'free';


-- 13. instagram_accounts — per-account brand profile.
--     Multi-account users (one phone, multiple IGs) need separate
--     niche/tone/voice per account, otherwise one IG's voice bleeds into
--     captions for the others. user_profiles columns stay as the global
--     default; instagram_accounts columns override per-account when present.
--     Backfilled on OAuth connect from user_profiles row for the same phone.
ALTER TABLE instagram_accounts
  ADD COLUMN IF NOT EXISTS brand_name      TEXT,
  ADD COLUMN IF NOT EXISTS niche           TEXT,
  ADD COLUMN IF NOT EXISTS tone            TEXT,
  ADD COLUMN IF NOT EXISTS profile_context TEXT,
  ADD COLUMN IF NOT EXISTS learned_style   TEXT;


-- 14. pending_posts — explicit IG surface tag.
--     'feed' (single image), 'reels' (video, also share_to_feed by default),
--     'carousel' (multi-slide), or 'story' (future). Lets analytics and
--     post-mortem split Reel-vs-Feed performance, and lets the
--     repurposing engine know what each generated draft is targeting.
--     Backfill: any existing video row → 'reels', else null defaulted to 'feed' on read.
ALTER TABLE pending_posts
  ADD COLUMN IF NOT EXISTS surface TEXT;
UPDATE pending_posts SET surface = 'reels'    WHERE surface IS NULL AND is_video = TRUE;
UPDATE pending_posts SET surface = 'carousel' WHERE surface IS NULL AND media_items IS NOT NULL AND jsonb_array_length(media_items) > 1;
UPDATE pending_posts SET surface = 'feed'     WHERE surface IS NULL;


-- 15. pending_posts — repurpose lineage.
--     parent_post_id links a draft back to the published post it was
--     spun off from (e.g. Carousel generated from a Feed photo). Lets
--     post-mortem aggregate "this idea performed X across all surfaces"
--     and prevents the user from infinitely spinning the same thing.
ALTER TABLE pending_posts
  ADD COLUMN IF NOT EXISTS parent_post_id UUID REFERENCES pending_posts(id);
CREATE INDEX IF NOT EXISTS idx_pending_posts_parent ON pending_posts(parent_post_id) WHERE parent_post_id IS NOT NULL;


-- 16. ig_comment_events — engagement auto-reply audit + idempotency.
--     Meta delivers comment webhook events; we store each one (keyed by
--     ig_comment_id so dupes are ignored), generate a reply in the
--     account's brand voice, and ship it to the owner's WhatsApp for
--     approval. Once approved, the same row tracks the sent reply id.
CREATE TABLE IF NOT EXISTS ig_comment_events (
  id                   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  ig_comment_id        TEXT         NOT NULL UNIQUE,
  ig_media_id          TEXT,
  instagram_user_id    TEXT         NOT NULL,
  commenter_handle     TEXT,
  comment_text         TEXT,
  classification       TEXT,        -- 'question'|'compliment'|'complaint'|'spam'|null
  generated_reply      TEXT,
  status               TEXT         NOT NULL DEFAULT 'pending',  -- pending|sent|skipped|spam
  sent_reply_id        TEXT,
  created_at           TIMESTAMPTZ  DEFAULT NOW(),
  resolved_at          TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_ig_comment_events_status ON ig_comment_events(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ig_comment_events_account ON ig_comment_events(instagram_user_id, created_at DESC);


-- 17. instagram_accounts — per-brand image LoRA for visual consistency.
--     A LoRA fine-tunes a base image model on the user's last ~50 IG
--     photos so generated images match their brand aesthetic. We train
--     once via Replicate (~$5, 20 min), store the model identifier, and
--     pass it to every subsequent buildImageUrl call. Status lets us
--     surface "training…" / "ready" / "failed" in the UI without polling.
ALTER TABLE instagram_accounts
  ADD COLUMN IF NOT EXISTS lora_model_id      TEXT,
  ADD COLUMN IF NOT EXISTS lora_status        TEXT,                    -- 'training' | 'ready' | 'failed' | null
  ADD COLUMN IF NOT EXISTS lora_trained_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lora_training_id   TEXT;                    -- Replicate training run id for status polling


-- 18. user_profiles — idle-creator nudge timestamp.
--     last_idle_nudge_at is set every time we WhatsApp a user with
--     "haven't posted in N days, here are 3 ideas" so the daily cron
--     can rate-limit (max one nudge per ~5 days even if the user stays
--     idle). NULL means never nudged.
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS last_idle_nudge_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_user_profiles_last_nudge ON user_profiles(last_idle_nudge_at);


-- 19. pending_posts — full-text search on captions for "find <topic>"
--     content repository search. GIN index on the caption tsvector
--     makes lookups <10ms even for users with thousands of posts.
CREATE INDEX IF NOT EXISTS idx_pending_posts_caption_fts
  ON pending_posts USING GIN (to_tsvector('english', caption))
  WHERE state = 'published';


-- 20. ig_dm_events — DM auto-reply audit + idempotency (mirrors
--     ig_comment_events for the messages webhook field). Sender PSID
--     is the IGSID Meta sends in the messaging webhook payload.
CREATE TABLE IF NOT EXISTS ig_dm_events (
  id                   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  ig_message_id        TEXT         NOT NULL UNIQUE,
  instagram_user_id    TEXT         NOT NULL,
  sender_psid          TEXT         NOT NULL,
  sender_handle        TEXT,
  message_text         TEXT,
  classification       TEXT,
  generated_reply      TEXT,
  status               TEXT         NOT NULL DEFAULT 'pending',  -- pending|sent|skipped|spam
  sent_at              TIMESTAMPTZ,
  created_at           TIMESTAMPTZ  DEFAULT NOW(),
  resolved_at          TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_ig_dm_events_status  ON ig_dm_events(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ig_dm_events_account ON ig_dm_events(instagram_user_id, created_at DESC);


-- 21. user_profiles — voice journaling armed flag.
--     When the user types /journal, we stamp this with NOW(); the next
--     incoming text/voice message within 5 minutes is saved as a
--     pending_posts row with state='journal_entry' instead of going
--     through the standard draft flow. Cleared on use.
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS journal_armed_at TIMESTAMPTZ;


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
-- 4) SCHEDULE: poll LoRA training status, every 10 minutes (training
--    takes ~20 min so this catches completions within 30 min worst case)
-- SELECT cron.schedule(
--   'kreya-poll-lora',
--   '*/10 * * * *',
--   $$
--   SELECT net.http_get(
--     url := 'https://kreya-github.vercel.app/api/cron/poll-lora-status',
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
