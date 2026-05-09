// Switches video generation engine based on user plan:
//   free      → Pollinations image → VideoWorker (Ken Burns single frame)
//   pro/agency → Kling AI text-to-video (official API, no watermark)
//
// Kling credits are monthly (10 Ultra-Gen per pro user). We track them
// in user_profiles using the same date-reset pattern as daily_pro_gen_count.

import { createClient } from '@supabase/supabase-js';
import { buildImageUrl } from '@/lib/image-generator';
import { renderVideo } from '@/lib/video-worker';

const KLING_BASE   = 'https://api.klingai.com';
const MONTHLY_LIMIT = 10;
// Polling: check every 4s, give up after 3 minutes
const POLL_INTERVAL_MS = 4_000;
const POLL_TIMEOUT_MS  = 180_000;

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

function phoneVariants(phone: string): string[] {
  return phone.startsWith('+') ? [phone, phone.slice(1)] : [phone, `+${phone}`];
}

export type GenerationResult = {
  videoUrl: string;
  engine: 'ffmpeg-pollinations' | 'kling-ai';
  creditsUsed: number;
};

export type BridgeOptions = {
  aspectRatio?: '9:16' | '1:1' | '16:9';
  negativePrompt?: string;
};

// ─── Kling AI helpers ────────────────────────────────────────────────────────

function klingHeaders() {
  return {
    Authorization: `Bearer ${process.env.KLING_AI_API_KEY!}`,
    'Content-Type': 'application/json',
  };
}

async function klingSubmit(prompt: string, opts: BridgeOptions): Promise<string> {
  const res = await fetch(`${KLING_BASE}/v1/videos/text2video`, {
    method: 'POST',
    headers: klingHeaders(),
    body: JSON.stringify({
      model_name: 'kling-v1-5',
      prompt,
      negative_prompt: opts.negativePrompt ?? 'blurry, watermark, text overlay, low quality, distorted',
      cfg_scale: 0.5,
      mode: 'pro',
      aspect_ratio: opts.aspectRatio ?? '9:16',
      duration: '5',
    }),
  });
  const data = await res.json();
  if (!res.ok || !data?.data?.task_id) {
    throw new Error(`Kling submit failed: ${JSON.stringify(data)}`);
  }
  return data.data.task_id as string;
}

async function klingPoll(taskId: string): Promise<string> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    const res = await fetch(`${KLING_BASE}/v1/videos/text2video/${taskId}`, {
      headers: klingHeaders(),
    });
    const data = await res.json();
    const status: string = data?.data?.task_status ?? '';
    if (status === 'succeed') {
      const url: string = data?.data?.task_result?.videos?.[0]?.url;
      if (!url) throw new Error('Kling: task succeeded but no video URL in response');
      return url;
    }
    if (status === 'failed') {
      throw new Error(`Kling task failed: ${JSON.stringify(data?.data?.task_result)}`);
    }
    console.log(`[generation-bridge] Kling task ${taskId} → ${status}`);
  }
  throw new Error(`Kling task ${taskId} timed out after ${POLL_TIMEOUT_MS / 1000}s`);
}

// ─── Credit tracking ─────────────────────────────────────────────────────────

async function checkAndClaimCredit(phone: string): Promise<boolean> {
  const supabase = getSupabase();
  const variants = phoneVariants(phone);
  const today = new Date().toISOString().slice(0, 7); // YYYY-MM (monthly reset)

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('monthly_video_credits, last_video_credits_reset')
    .in('whatsapp_phone', variants)
    .maybeSingle();

  let count = profile?.monthly_video_credits ?? 0;
  if ((profile?.last_video_credits_reset ?? '') !== today) {
    count = 0;
    await supabase
      .from('user_profiles')
      .update({ monthly_video_credits: 0, last_video_credits_reset: today })
      .in('whatsapp_phone', variants);
  }

  if (count >= MONTHLY_LIMIT) return false;

  await supabase
    .from('user_profiles')
    .update({ monthly_video_credits: count + 1, last_video_credits_reset: today })
    .in('whatsapp_phone', variants);

  return true;
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function generateVideo(
  prompt: string,
  phone: string,
  opts: BridgeOptions = {},
): Promise<GenerationResult> {
  const supabase = getSupabase();
  const variants = phoneVariants(phone);

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('plan')
    .in('whatsapp_phone', variants)
    .maybeSingle();

  const plan: string = profile?.plan ?? 'free';
  const isPremium = plan === 'pro' || plan === 'agency';
  const hasKlingKey = Boolean(process.env.KLING_AI_API_KEY);

  // ── Premium + Kling key available ──────────────────────────────────────────
  if (isPremium && hasKlingKey) {
    const credited = await checkAndClaimCredit(phone);
    if (credited) {
      const taskId = await klingSubmit(prompt, opts);
      const videoUrl = await klingPoll(taskId);
      return { videoUrl, engine: 'kling-ai', creditsUsed: 1 };
    }
    // Limit hit — fall through to free engine and notify caller via creditsUsed
    console.log('[generation-bridge] Kling monthly limit hit, falling back to FFmpeg');
  }

  // ── Free engine: Pollinations image → Ken Burns VideoWorker ───────────────
  const imageUrl = buildImageUrl(prompt, 'artistic', { w: 1080, h: 1920 });
  const { publicUrl } = await renderVideo(
    [{ url: imageUrl, type: 'image' }],
    { aspectRatio: opts.aspectRatio ?? '9:16', durationPerPhoto: 6 },
  );

  return { videoUrl: publicUrl, engine: 'ffmpeg-pollinations', creditsUsed: 0 };
}
