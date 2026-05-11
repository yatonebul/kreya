# Modal Ken Burns Setup

FFmpeg Ken Burns rendering on GPU (Modal). Enables smooth zoom-in effects on reel cover images without overwhelming Vercel CPU.

## Free Tier

- **$30/month free credit** from Modal
- Enough for ~5,000+ Ken Burns transformations (5s each, ~GPU $0.0001/sec)
- After credits, pay-as-you-go (~$0.04/hr on L40S GPU)

## Quick Start: If You Already Have Modal Endpoint URL

**Skip to [VERCEL_ENV_SETUP.md](./VERCEL_ENV_SETUP.md)** to wire up your endpoint in Vercel.

All you need to do:
1. Copy your Modal endpoint URL (e.g., `https://your-workspace--ken-burns-endpoint.modal.run`)
2. Add it to Vercel as `MODAL_KEN_BURNS_URL` env var
3. Redeploy
4. Done! ✅

---

## Full Setup (if deploying worker from scratch)

### 1. Create Modal Account & Token

```bash
# Go to https://modal.com and sign up
# Create an API token at https://modal.com/settings/tokens
# Export for local testing:
export MODAL_TOKEN_ID="your-token-id"
export MODAL_TOKEN_SECRET="your-token-secret"
```

### 2. Deploy Worker

```bash
# Install Modal CLI
pip install modal

# Deploy the Ken Burns worker
modal deploy workers/ken_burns_worker.py

# Output will be:
# ✓ App "kreya-ken-burns" created
# ✓ Web endpoint: https://your-workspace--ken-burns-endpoint.modal.run
```

### 3. Set Environment Variable

Add to `.env.local` (local) or Vercel env vars (production):

```
MODAL_KEN_BURNS_URL=https://your-workspace--ken-burns-endpoint.modal.run
```

### 4. Verify

Send a test image via WhatsApp. Kreya should:
1. Generate reel caption
2. Call Modal endpoint
3. Get back Ken Burns video in ~10-15s
4. Send preview in WhatsApp

## How It Works

```
User sends photo
    ↓
Webhook generates caption
    ↓
Creates pending_posts (state=rendering_reel)
    ↓
Calls /api/video/render-ken-burns
    ↓
    ├─ Calls Modal web endpoint with image_url
    ├─ Modal GPU applies FFmpeg zoompan filter
    ├─ Returns video as base64
    └─ Uploads to Supabase, updates post state
    ↓
Sends video preview back to WhatsApp
```

## Fallback Behavior

If `MODAL_KEN_BURNS_URL` is not set, webhook automatically falls back to simple `/api/video/render-reel` (static 5s video, no zoom).

## Parameters (Customizable)

In webhook call to `/api/video/render-ken-burns`:

```typescript
{
  phone: string,
  postId: string,
  imageUrl: string,
  caption: string,
  duration?: number = 5,           // seconds
  zoomLevel?: number = 1.5,        // 1.0 to 2.0
  aspectRatio?: '9:16' | '1:1' | '16:9' = '9:16'
}
```

## Monitoring

Check Modal dashboard: https://modal.com/apps

View logs for "kreya-ken-burns" app to debug issues.

## Cost Breakdown

| Duration | GPU Type | Cost |
|----------|----------|------|
| 5s       | L40S     | ~$0.0005 |
| 5s × 1000 | L40S    | ~$0.50 |

With $30 free credit: **60,000 transforms per month** (realistic limit: ~1,000/day if active users).

## Troubleshooting

### "Modal endpoint returns 500"
- Check worker logs in Modal dashboard
- Verify image_url is accessible
- Ensure FFmpeg is installed in container

### "Timeout after 30s"
- Ken Burns should take 10-15s max
- If longer, reduce `zoomLevel` or check Modal GPU availability

### "All video bytes are 0"
- Base64 encoding issue—check Modal worker response

---

**Next**: Once Ken Burns is live, integrate mood-based music selection.
