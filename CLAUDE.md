# Kreya — AI Social Media Management SaaS

## Quick Reference
- **Repo:** `yatonebul/kreya` (GitHub) · **Main branch:** `main`
- **Hosted:** Vercel (`kreya-github.vercel.app`) · Auto-deploys on `main` push
- **DB:** Supabase (`kuwkdxahsugsfblgbetk`) — PostgreSQL with public storage bucket
- **Core loop:** WhatsApp (text/photo/video/voice) → Claude caption + image → Instagram post
- **Tech:** Next.js 16.2.2 (App Router, Server Components), React 19, TypeScript, Tailwind 4, Postgres 3.4.9

## Already loaded (do NOT re-read, re-fetch, or restate)
- **Project facts / state / IDs / stack** → `claude-context.json` (source of truth) + auto-memory `project memory.md`
- **User profile** → auto-memory (`user_yato.md`)
- **Collab rules** → auto-memory (`feedback_kreya_workflow.md`)
- **Brand assets & design tokens** → `kreya-brand-identity.html` (read only when building UI)

## Directory Structure
```
app/
  ├── api/
  │   ├── auth/                 # Email/OTP, Instagram OAuth callback
  │   ├── webhooks/whatsapp/    # WhatsApp message ingestion & routing
  │   ├── posts/                # Post CRUD (fetch, cancel, approve)
  │   ├── profile/              # Brand profile updates
  │   ├── admin/                # Admin tools (user/token management)
  │   ├── cron/                 # Scheduled jobs (token refresh, publish)
  │   ├── invite/               # Waitlist/invite links
  │   ├── register/             # User registration endpoint
  │   └── db-setup/             # One-time DB initialization
  ├── _components/              # Shared React components (forms, buttons, modals)
  ├── layout.tsx                # Root layout (Tailwind config, fonts)
  ├── page.tsx                  # Landing page
  ├── dashboard/page.tsx        # Main user dashboard (pending posts, schedule)
  ├── connect/page.tsx          # Instagram OAuth flow initiation
  ├── login/page.tsx, register/page.tsx
  └── error.tsx, not-found.tsx

lib/
  ├── caption-generator.ts      # Claude Sonnet 4.6 → captions
  ├── image-generator.ts        # Claude Haiku + Pollinations.ai → images
  ├── schedule-parser.ts        # Claude Haiku → TIMESTAMPTZ from natural language
  ├── transcribe.ts             # Groq Whisper → voice→text
  ├── instagram-publish.ts      # Meta Graph API → publish to Instagram
  ├── whatsapp-send.ts          # Meta Cloud API → send WhatsApp messages
  ├── whatsapp-media.ts         # Download/upload media from/to WhatsApp
  ├── whatsapp-onboarding.ts    # Brand setup flow (name/niche/tone)
  ├── email.ts                  # Nodemailer → transactional emails
  └── session.ts                # Auth helpers (JWT, cookies)

supabase/
  ├── migrations/               # SQL migration files
  └── config.toml               # Supabase project config
```

## Code Style & Conventions
- **Minimal, targeted changes.** No speculative abstractions; no utility file for single-use logic.
- **Comments only when WHY is non-obvious.** Self-documenting names over comment blocks.
- **No defensive error handling** for impossible conditions; trust framework guarantees.
- **No backwards-compatibility shims** or feature flags when direct changes work.
- **React/Next:** Server Components by default. `'use client'` only for interactivity (forms, buttons, state).
- **Tailwind:** Use utilities directly; no inline styles or CSS files for component styling.

## Key Integration Points

### WhatsApp API (Meta Cloud v21.0)
**Webhook:** `/api/webhooks/whatsapp/route.ts`
- Ingests text, image, video, document, audio, interactive messages
- Routes to handlers: `handleEditRefinement` (text in review), `handleEditWithNewMedia` (image swap)
- Validates onboarding step before processing (gates all messages until step=4)

### Instagram Publishing (Meta Graph API v21.0)
**File:** `lib/instagram-publish.ts`
- Hardcoded to account `nepostnuto` (Instagram user ID: `26314509864842304`)
- OAuth tokens stored in `instagram_accounts` table, refreshed via `/api/cron/refresh-instagram-tokens`
- Publishes carousel (if multiple images), image, video, or reel based on `pending_posts.is_video`

### Claude API (Anthropic SDK)
- **Captions:** Claude Sonnet 4.6 (full reasoning, context-aware)
- **Image prompts:** Claude Haiku 4.5 (fast, cheap)
- **Schedule parsing:** Claude Haiku 4.5 (extract date/time from natural language)
- **Env var:** `ANTHROPIC_API_KEY`

### Groq Whisper (Voice Transcription)
- Transcribes audio files to text; used as caption + image generation prompt
- **Model:** `whisper-large-v3-turbo`
- **Env var:** `GROQ_API_KEY`

### Supabase (Database & Storage)
**Tables:**
- `pending_posts` — WhatsApp content in review/edit/scheduled/published states
- `instagram_accounts` — OAuth tokens, active status
- `user_profiles` — Brand name, niche, tone, onboarding step
- `social_audit_log` — Activity log

**Storage Bucket:** `user-media` (public) — hosts user photos/videos for WhatsApp→Instagram flow

## Database Schema (Key Fields)
```sql
pending_posts:
  id uuid, whatsapp_phone text, caption text, image_url text, 
  user_image_url text, image_source (user|ai), is_video bool,
  sibling_id uuid, state (pending_approval|in_edit|scheduled|published|discarded),
  scheduled_for TIMESTAMPTZ, ig_post_id text, ig_post_url text, created_at

instagram_accounts:
  id uuid, account_name text, instagram_user_id text, 
  access_token text, token_expires_at TIMESTAMPTZ, is_active bool

user_profiles:
  id uuid, whatsapp_phone text, brand_name text, niche text, tone text,
  profile_context text, onboarding_step (1-4), created_at
```

## WhatsApp Message Flow
1. **Webhook receives message** → validate onboarding → route by type
2. **Onboarding** (steps 1-4): brand name → niche → tone → confirm
3. **Text input** → Claude caption + AI image (unless user photo provided)
4. **Photo/video input** → user's media + Claude caption
5. **Voice input** → Groq transcribe → use transcript as prompt for caption + image
6. **Edit flow:**
   - Text response in review → `handleEditRefinement` (caption update/AI image regen/revert to user photo)
   - Photo/video during review → `handleEditWithNewMedia` (replace image, keep caption)
7. **Schedule** → parse natural language date → store as `scheduled_for` TIMESTAMPTZ
8. **Approve/discard** → state change → publish or delete from pending_posts
9. **Publish** → call Instagram Graph API → store `ig_post_id` and `ig_post_url`

## Rules (Token Discipline — Non-Negotiable)
1. **No re-reading:** If in `imported_knowledge`, `claude-context.json`, or above, it's in context. Acting on it doesn't require re-reading.
2. **No summarizing:** The diff/output/link is the answer. Never append "here's what I did."
3. **Fetch on demand only:** Touch GitHub/Supabase/Vercel only when task needs fresh state.
4. **No whole-file rewrites:** Return only changed blocks via `Edit` or precise patch. Full file only when creating new or explicitly asked.
5. **Pointers over copies:** Link to canonical source; never duplicate its contents here.
6. **One focused deliverable per session** (e.g., one endpoint, one bug fix, one migration).
7. **One clarifying question max** before starting non-trivial work. Otherwise proceed with assumptions.
8. **Terse outputs:** Commands/values/code first. Prose only if explicitly asked.

## Design Tokens (Inline Reference)
```
Colors: 
  --ink:#07070D --dark:#0B0918 --surf:#100E22 --surf2:#171430 --surf3:#201D3C
  --coral:#FF4F3B --coral2:#FF6B59 --violet:#5E35FF --mint:#00E5A0
  --gold:#FFD166 --rose:#FF6B8A --white:#FFF
  --muted:rgba(255,255,255,.5) --muted2:rgba(255,255,255,.25)

Type: **Syne** (display, 600/700/800) · **DM Sans** (body, 300/400/500) · **Space Mono** (labels, 400/700)
```

## Environment Variables (Required)
```
WHATSAPP_ACCESS_TOKEN
WHATSAPP_PHONE_NUMBER_ID (1079839465213735)
WHATSAPP_VERIFY_TOKEN (kreya_whatsapp_2026)
NEXT_PUBLIC_SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
INSTAGRAM_APP_ID (761297643580425)
INSTAGRAM_APP_SECRET
INSTAGRAM_REDIRECT_URI (https://kreya-github.vercel.app/api/auth/instagram/callback)
ANTHROPIC_API_KEY
GROQ_API_KEY
CRON_SECRET
NEXT_PUBLIC_APP_URL (https://kreya-github.vercel.app)
```

## Development Workflow
**Build & Run:**
```bash
npm install              # install dependencies
npm run dev             # start Next.js dev server (http://localhost:3000)
npm run build           # production build (Vercel uses this)
npm run lint            # run ESLint
```

**Deployment:** Push to `main` branch → GitHub webhook → Vercel auto-deploys to `kreya-github.vercel.app`

**Branching:** Develop on assigned feature branch (e.g., `claude/add-feature-name`). Create PR when ready; merge to `main` after review.

## Known Limitations & TODOs
- **Scheduling:** Vercel Hobby plan doesn't allow sub-5min crons. Scheduled posts won't auto-publish until Pro upgrade.
- **Multi-user Instagram:** `instagram-publish.ts` hardcoded to `nepostnuto` account; needs mapping from whatsapp_phone to instagram_user_id.
- **Future:** Caption variants (show 3 options), WhatsApp /help command, profile updates via WhatsApp, external cron for publishing.

## Canonical Project State
Source of truth: `https://raw.githubusercontent.com/yatonebul/kreya/main/claude-context.json`
Auto-memory: `project memory.md` (synced from context.json)

## Session-End Checklist (Skip if No State Change)
- Commit changes with clear messages to assigned feature branch
- Push to GitHub (will auto-deploy to Vercel)
- Update `claude-context.json` if project state changed (last_updated, completed_this_session, etc.)
- Add durable fact to auto-memory only if non-obvious and cross-session useful
