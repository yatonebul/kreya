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

## 9. Phase 1 — first implementation steps

Ship the foundation that everything else hangs off. Two-week target.

### Step 1 — Schema + workspaces (day 1–2)
- Tables: `workspaces`, `members`, `social_accounts`, `posts`, `scheduled_posts`, `media_assets`, `ai_usage`
- RLS per workspace
- Migration + seed in Supabase

### Step 2 — WhatsApp ingestion (day 2–4)
- WA Cloud API webhook → `/api/wa/webhook` Edge Function
- Verify signature, dedup by `wa_message_id`
- Persist message + media to Storage
- Enqueue for processing

### Step 3 — Conversational composer (day 4–6)
- Claude Haiku 4.5 for fast caption draft (3 variants)
- Reply with rich preview card (image + 3 caption buttons)
- State machine per chat thread: `received → drafting → previewing → confirmed → scheduled/posted`

### Step 4 — IG publish (day 6–8)
- Meta OAuth flow (Business/Creator only) — web companion route
- Token storage + refresh worker
- Container → publish for Feed (single image first, carousel + Reels next)
- Reply to chat with permalink on success

### Step 5 — Scheduling (day 8–10)
- NL parse via Claude tool-call → `run_at` timestamp
- `scheduled_posts` cron worker (60s tick, `FOR UPDATE SKIP LOCKED`)
- Confirmation card with [Edit] [Cancel] quick-replies

### Step 6 — Style memory v0 (day 10–12)
- On account connect, pull last 50 captions
- Embed + summarize into a "style profile" record
- Inject as cached system prompt on every caption call

### Step 7 — Minimal web companion (day 12–14)
- `/connect` (Meta OAuth), `/calendar` (read-only), `/billing` (Stripe)
- PWA install, brand tokens applied
- Mobile-first, no creation flows here — chat owns those

### Defer to phase 2
Voice → post, repurpose, group-chat workspaces, A/B testing, voice clone, analytics post-mortem.

### Defer to phase 3
Multi-platform (TikTok/LinkedIn), agency white-label, public API.

### What to build first today
**Step 1 + Step 2.** Schema and ingestion are blocking everything else and have zero dependency on AI provider choice or IG approval timeline (Meta app review is 1–2 weeks — start that in parallel on day 1).
