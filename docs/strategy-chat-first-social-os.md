# Kreya — Chat-first Social OS

Strategy document. Source: design session 2026-04-25.

---

## 1. Product features

### MVP+ (must-have)
- WA-native publishing: image / video / carousel / Reels / Stories via reply chain
- Multi-account, multi-platform from day 1 (IG Feed/Reels/Stories; TikTok + LinkedIn next)
- Natural-language scheduling ("tomorrow 7pm", "best time Friday")
- Draft → preview card → approve loop, all in-thread
- Edit by reply: quote a draft, type "shorter" / "swap pic" / "add CTA"

### Differentiating (10x Hootsuite)
- Conversational composer: agent asks 1–2 smart questions, never shows a form
- Style memory: tone learned from your last 50 posts; new captions match automatically
- Voice-note → post: 30s memo becomes caption + visual + hashtags
- One-tap repurpose: "make this a Reel" / "turn into Story sequence" / "carousel-ify"
- Group-chat = workspace: add Kreya to a WA group, emoji-react ✅ to approve
- 24h post-mortem message: top metric + one concrete lesson

### Wow
- Forward any TikTok/IG/Tweet link → Kreya extracts, reformats, rewrites for your brand
- Live A/B caption tests in Stories with auto-promotion of winner to Feed
- Voice persona clone: text-to-speech in *your* voice for Reels overlays
- Best-time learned from *your* audience, not industry averages
- "Drop mode" — Kreya schedules a 5-post launch sequence from one prompt

---

## 2. User flows

**Post**
`send image → "draft 3 captions or write your own?" → pick → preview card → [Now] [Schedule] [Draft]`

**Edit**
`reply to draft: "punchier + add emoji" → new preview replaces old`

**Schedule**
`"post Friday 8am"` or `"best time this week"` → confirmation card with [Edit] [Cancel]

**Multi-account**
`@brand @founder caption text` → simultaneous publish with per-account variants

**Team collab**
- Add Kreya bot to WA group → group becomes brand workspace
- Roles via mention: `@kreya approve`, `@kreya assign sarah`
- Approval gate: N admin ✅ reactions required before publish

---

## 3. AI features

| Feature | Mechanism |
|---|---|
| Caption gen | 3 variants (Hook / Story / CTA), tone-matched via embeddings of past posts |
| Auto-carousel | Loose images → ordered by visual flow (color/contrast/subject) + per-slide caption + cohesive cover |
| Voice → post | WA voice memo → Whisper → caption variants + visual suggestion (stock or generated) |
| Hashtag/trend | Live IG Graph signals + trend feed; mix 3 broad / 5 niche / 2 branded; banned-tag filter |
| Repurpose | TikTok URL → ffmpeg re-encode 9:16 → Reel; long video → 3 clip moments; tweet → carousel; blog → 5-slide deck |

Models: Haiku 4.5 for fast caption iteration, Sonnet 4.6 default, Opus 4.7 for style-cloning + complex repurposing. Prompt caching on style profile.

---

## 4. Backend architecture

Stack: Next.js + Supabase (existing).

**Ingestion**
- WhatsApp Cloud API webhook → Edge Function → enqueue (pg-boss on Supabase, or Upstash QStash)
- Dedup by WA message ID
- Media → Supabase Storage, signed URLs, 30d lifecycle

**Media pipeline**
- Worker pool (Fly/Railway): ffmpeg + sharp
- Auto-format 1:1 / 4:5 / 9:16
- Thumbnail extraction
- NSFW + moderation gate (Hive or Rekognition) pre-publish

**IG integration**
- Meta Graph API (Business/Creator only)
- Token refresh worker (60d long-lived)
- Container → publish two-step; Reels + Stories via Content Publishing API
- Comment/mention webhooks → real-time chat alerts

**Queue/scheduling**
- `scheduled_posts(status, run_at, payload jsonb)`
- Cron (60s) `SELECT … FOR UPDATE SKIP LOCKED`
- Exponential backoff, dead-letter after 5

**Analytics**
- Pull insights every 30m for first 48h, daily for 30d
- Time-series table + nightly aggregates
- Embeddings index of posts for "what worked" retrieval

**AI layer**
- Claude SDK with prompt caching on style profile + recent posts
- Per-workspace rate limits + cost ceilings

**Scale**
- Stateless workers, horizontal
- Supabase RLS per workspace
- Pool of WA phone numbers to avoid template throttling
- Multi-region edge webhooks; CDN for media

---

## 5. Frontend / UX

**Chat patterns**
- Rich preview cards before publish
- Quick-reply buttons: top 3 actions only
- Emoji-as-command: ✅ approve · 🗑 discard · 🔁 regenerate · 📅 schedule
- Threaded replies = scoped edits on one post

**Minimal web companion (PWA)**
- Calendar view, analytics, billing, workspace settings
- Nothing creator does daily — chat owns daily flow
- Brand: `--surf` background, coral CTA, mint success, Syne headlines

**Notifications**
- WA-native only — no separate app push
- Daily digest, publish confirmations, performance alerts

**Analytics via chat**
- `/stats week` → metric carousel
- Proactive: "Your Tue Reels get 2× reach. Schedule one?"

---

## 6. Monetization

| Tier | Price | For | Key limits |
|---|---|---|---|
| Spark | Free | Try | 1 IG, 10 posts/mo, basic AI |
| Creator | $12/mo | Solo | 3 accounts, unlimited posts, full AI, voice→post, repurpose |
| Studio | $39/mo | Small team | 10 accounts, group workspaces, approvals, A/B, 12mo analytics |
| Agency | $99/mo + $15/extra-account >25 | Agencies | White-label, client billing, API |

Hybrid: flat SaaS + metered AI add-ons (per video-minute repurpose, per generated image). Undercut Hootsuite ($99 entry) and Sprout ($249).

---

## 7. Competitive advantage

- **vs Hootsuite** — dashboard vs conversation. 30s vs 5min to post.
- **vs Buffer** — bolted-on AI vs brand-aware agent in every interaction.
- **vs Sprout** — $249 desktop vs $12 mobile-native. 80% of value at 5% of price.

**Moat**
- WhatsApp = zero install, 2B+ users
- Style memory + voice clone compound switching cost
- Group-chat-as-workspace is unique
- Insights → next action without leaving the thread

---

## 8. Risks & limitations

**Instagram API**
- Personal accounts can't auto-publish — onboarding must convert
- 200 calls/h/user — batch + cache
- Stories/Reels API gaps → reminder fallback

**WhatsApp**
- 24h session window: outbound after needs templates → user-initiated digests
- Per-number throughput tiers (1k/day → 100k/day on verification)
- Conversation cost ($0.005–$0.08) priced into Creator tier

**Scale**
- Video transcode = long pole; isolated autoscaling pool
- Webhook spikes always queued
- AI cost runaway → per-workspace ceiling + Haiku-first routing

**Abuse**
- Pre-publish NSFW/hate moderation
- IG OAuth + workspace verification
- Posts/hour caps
- Watermark/source detection
- ToS-aligned: only OAuth'd accounts, only user-supplied media

---

## 9. What's already shipped vs what to build next

### Already in repo (do not rebuild)
- WA webhook + media handling — `app/api/webhooks/whatsapp/route.ts`, `lib/whatsapp-media.ts`
- IG publish (single account) — `lib/instagram-publish.ts`
- Caption gen (Sonnet 4.6) — `lib/caption-generator.ts`
- AI image gen (Pollinations) — `lib/image-generator.ts`
- Voice → post (Groq Whisper) — `lib/transcribe.ts`
- NL schedule parsing (Haiku) — `lib/schedule-parser.ts`
- Onboarding wizard (brand → niche → tone) — `lib/whatsapp-onboarding.ts`
- Edit flow (refinement + media swap) — handled in webhook route
- Token refresh cron — `app/api/cron/refresh-instagram-tokens/route.ts`
- Web companion — `app/connect`, `app/dashboard`, `app/account`, `app/admin`
- Schema: `pending_posts`, `instagram_accounts`, `user_profiles`, `social_audit_log`

### Known broken / blocking gaps (fix first)
1. ⏳ **Scheduled publish cron disabled** — Vercel Hobby blocks every-5min. Will be fixed by user via Supabase `pg_cron` (afternoon, separate session).
2. ✅ **Multi-account routing** — already shipped. `lib/instagram-publish.ts:21–26` looks up the active account by `whatsapp_phone`; OAuth callback writes the mapping (`migrations.sql` block 4).

### Phase 1 — high-leverage additions on top of what exists (2 weeks)

**Step 1 (day 1) — Fix scheduling cron** ⏳ user, this afternoon
- `pg_cron` job → `pg_net.http_post` to `/api/cron/publish-scheduled` with bearer `CRON_SECRET`
- Lock rows with `UPDATE … WHERE state='scheduled' AND scheduled_for <= now() RETURNING …` inside a transaction

**Step 2 — Multi-account routing** ✅ already shipped (pre-existing)

**Step 3 — Caption variants (3 options)** ✅ shipped this session — commit `1d0c989`
- `generateCaptionVariants` returns 3 angles (hook/story/CTA) in one Sonnet 4.6 call
- Stored in `pending_posts.caption_variants jsonb`
- User replies bare `1`/`2`/`3` to swap the active caption; preview re-sent
- Sibling AI-image flow keeps single-caption behavior
- Migration is non-blocking — variants persisted via follow-up update so old DB schema degrades gracefully

**Step 4 — Style memory v0** ✅ shipped this session — commit `de1e18f`
- `lib/style-memory.ts` pulls last 50 IG captions via Graph API, summarizes voice with Haiku 4.5 into `user_profiles.learned_style`
- Triggered fire-and-forget (`next/server` `after`) from OAuth callback — does not block the redirect
- WA command `learn my style` (also `refresh tone`, `/style`) re-runs analysis on demand
- `getProfileContextForPhone` concatenates brand profile + learned style for every caption call
- Schema-tolerant fallback: works on legacy DB until migration runs
- Highest-leverage AI upgrade: every caption gets noticeably more on-brand for ~1 day of work

**Step 5 (day 8–10) — Carousel + Reels**
- Schema: `pending_posts.media_items jsonb[]` (or new `post_media` child table) — keep `image_url` for back-compat
- WA: detect "send N images in 60s" as a carousel intent; ask "carousel or single?"
- IG: extend `instagram-publish.ts` with carousel container + Reels media type

**Step 6 (day 11–12) — 24h post-mortem**
- New cron: 24h after `published`, fetch IG insights, send WA message: "Top metric + one suggestion"
- Stores baseline in `post_metrics` table → fuels best-time + style memory v2 later

**Step 7 (day 13–14) — Repurposing (wow feature, cheap to ship)**
- Detect URL in WA message (TikTok / IG / Tweet)
- yt-dlp on a worker → re-encode 9:16 with ffmpeg → store in `user-media` bucket
- Run existing caption generator with "rewrite for our brand" prefix
- Feeds straight into the existing `pending_posts` flow — zero new UX

### Defer to phase 2
Group-chat workspaces (bigger schema change: workspaces/members), team approvals, A/B testing in Stories, voice persona clone, agency white-label.

### Defer to phase 3
TikTok/LinkedIn publishing, public API, AI cost metering for billing.

### Build first today
**Step 1 (cron fix) + Step 2 (multi-account).** Together they unblock onboarding any user beyond the founder account and fix a feature the UI already advertises. Step 3 (caption variants) is the next-best-ROI day of work after that.

### Required to flip new features on
Run these in Supabase SQL editor (idempotent):
```sql
ALTER TABLE pending_posts  ADD COLUMN IF NOT EXISTS caption_variants JSONB;
ALTER TABLE user_profiles  ADD COLUMN IF NOT EXISTS learned_style    TEXT;
```
Both already in `supabase/migrations.sql` (blocks 7 + 8). Code degrades gracefully if not run, but variants won't persist and learned style won't save until they exist.
