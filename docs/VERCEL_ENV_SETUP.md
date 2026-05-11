# Vercel Environment Variables Setup

Configure production environment variables for Kreya on Vercel.

## Quick Start (Existing Modal URL)

If you already have a Modal Ken Burns endpoint URL, follow these 3 steps:

### Step 1: Open Vercel Dashboard

1. Go to [vercel.com/dashboard](https://vercel.com/dashboard)
2. Click on the `kreya-github` project
3. Navigate to **Settings** → **Environment Variables**

### Step 2: Add MODAL_KEN_BURNS_URL

1. Click **Add New**
2. Fill in:
   - **Name**: `MODAL_KEN_BURNS_URL`
   - **Value**: `https://yatonebul--kreya-ken-burns-kenburnsapi-render.modal.run`
   - **Environments**: Select `Production` (and `Preview` if you want to test on preview branches)
3. Click **Add**

### Step 3: Redeploy

1. Go to **Deployments** tab
2. Find the latest commit on `main` branch
3. Click the **...** menu → **Redeploy**
4. Wait for build to complete (≈2-3 min)

✅ Done! Ken Burns GPU rendering is now active in production.

---

## All Required Environment Variables

If setting up from scratch, add these to Vercel (Settings → Environment Variables):

| Variable | Value | Type |
|----------|-------|------|
| `WHATSAPP_ACCESS_TOKEN` | Your token from Meta | Required |
| `WHATSAPP_PHONE_NUMBER_ID` | `1079839465213735` | Required |
| `WHATSAPP_VERIFY_TOKEN` | `kreya_whatsapp_2026` | Required |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://kuwkdxahsugsfblgbetk.supabase.co` | Required |
| `SUPABASE_SERVICE_ROLE_KEY` | Your Supabase key | Required |
| `INSTAGRAM_APP_ID` | `761297643580425` | Required |
| `INSTAGRAM_APP_SECRET` | Your Instagram secret | Required |
| `INSTAGRAM_REDIRECT_URI` | `https://kreya-github.vercel.app/api/auth/instagram/callback` | Required |
| `ANTHROPIC_API_KEY` | Your API key | Required |
| `GROQ_API_KEY` | Your API key | Required |
| `CRON_SECRET` | Random secret string | Required |
| `NEXT_PUBLIC_APP_URL` | `https://kreya-github.vercel.app` | Required |
| `MODAL_KEN_BURNS_URL` | Your Modal endpoint URL | Optional |

**Note**: `NEXT_PUBLIC_*` variables are exposed to the browser (safe for URLs, app config). Do not use them for secrets.

---

## Verify It Works

1. Send a photo via WhatsApp to the bot
2. Wait 10-15 seconds
3. You should receive:
   - Ken Burns video (with smooth zoom) instead of static frame
   - Mood-based background music
   - Options to toggle Reels/Feed and pick cover frame

If you see a **static 5-second video** instead, the Modal URL may not be set or reachable. Check:
- Vercel env var is set and redeployed
- Modal endpoint is running: `curl https://yatonebul--kreya-ken-burns-kenburnsapi-render.modal.run/health`

---

## Local Development

For local testing with the Modal endpoint:

1. Copy `.env.example` to `.env.local`:
   ```bash
   cp .env.example .env.local
   ```

2. Fill in all required values (use the same Supabase/WhatsApp/Anthropic keys as production)

3. Ensure `MODAL_KEN_BURNS_URL` is set:
   ```
   MODAL_KEN_BURNS_URL=https://yatonebul--kreya-ken-burns-kenburnsapi-render.modal.run
   ```

4. Run dev server:
   ```bash
   npm run dev
   ```

5. WhatsApp messages will route through your local server and hit the production Modal endpoint.

---

## Cost Tracking

Monitor Modal GPU usage on your Modal dashboard:

1. Go to [modal.com/apps](https://modal.com/apps)
2. Click on **kreya-ken-burns**
3. View logs and credit usage
4. Each 5-second Ken Burns video costs ~$0.0005
5. Free tier: $30/month = ~60,000 transforms

---

## Troubleshooting

### "Still seeing static 5-second video after redeploy"
- Verify `MODAL_KEN_BURNS_URL` is in **Production** environment (not just Preview)
- Wait 5 min for Vercel cache to clear
- Check `/api/webhooks/whatsapp/route.ts` logs: should log `[ken-burns] rendering video via Modal`

### "Modal endpoint timeout (>30 seconds)"
- Check Modal dashboard for GPU availability
- Modal free tier may queue jobs if all GPUs busy
- Fallback will activate automatically; video renders on Vercel CPU instead

### "Video has no audio"
- Pexels music URLs may have changed
- Check `lib/mood-music.ts` error logs in Vercel
- Fallback renders video without music but continues

### "Cover frame picker not showing"
- Frame extraction is implemented but must be manually wired into the render flow
- See `lib/cover-frame-picker.ts` and integration docs

---

**Questions?** Check `/docs/MODAL_KEN_BURNS_SETUP.md` for worker deployment details.
