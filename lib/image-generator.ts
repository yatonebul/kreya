import { createClient } from '@supabase/supabase-js';
import { buildBrandImageUrl } from '@/lib/lora';

const NEGATIVE = 'blurry, distorted face, ugly, deformed, low quality, watermark, text, logo';
const DAILY_PRO_LIMIT = 10;

export type ImageStyle = 'realistic' | 'anime' | '3d' | 'artistic';

const MODEL_MAP: Record<ImageStyle, string> = {
  realistic: 'flux-realism',
  anime:     'flux-anime',
  '3d':      'flux-3d',
  artistic:  'flux',
};

function getSupabase() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

function phoneVariants(phone: string): string[] {
  return phone.startsWith('+') ? [phone, phone.slice(1)] : [phone, `+${phone}`];
}

export function detectStyle(instruction: string): ImageStyle {
  const i = instruction.toLowerCase();
  if (/\b(anime|manga|cartoon|illustrat\w+|cel.?shad)\b/.test(i)) return 'anime';
  if (/\b(3d|render|cgi|blender|three.?d|clay|sculpt)\b/.test(i)) return '3d';
  if (/\b(artistic|painterly|oil paint|watercolou?r|abstract|impressio\w+|sketch|drawing|vintage|retro|film grain|moody|cyberpunk|neon|surreal|fantasy|dreamy|lo.?fi)\b/.test(i)) return 'artistic';
  return 'realistic';
}

export function buildImageUrl(prompt: string, style: ImageStyle = 'realistic', dims = { w: 1080, h: 1080 }): string {
  const seed = Math.floor(Math.random() * 1_000_000);
  const model = MODEL_MAP[style];
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${dims.w}&height=${dims.h}&nologo=true&model=${model}&seed=${seed}&negative=${encodeURIComponent(NEGATIVE)}`;
}

export type BrandedImageResult = { url: string; overflowed: boolean };

// Brand-aware image generation. Routes Pro users with a trained LoRA through
// Replicate; everyone else (and Pro users who've hit their daily cap) gets
// the Pollinations fallback. Returns overflowed=true when a Pro user is
// silently downgraded due to hitting the daily limit — callers should surface
// a "limit reached" notification to the user.
export async function buildBrandedImage(
  prompt: string,
  style: ImageStyle = 'realistic',
  phone?: string,
  dims = { w: 1080, h: 1080 },
): Promise<BrandedImageResult> {
  const fallback = buildImageUrl(prompt, style, dims);

  if (!phone || !process.env.REPLICATE_API_TOKEN) return { url: fallback, overflowed: false };

  const supabase = getSupabase();
  const variants = phoneVariants(phone);

  const [{ data: account }, { data: profile }] = await Promise.all([
    supabase
      .from('instagram_accounts')
      .select('account_name, lora_model_id, lora_status')
      .in('whatsapp_phone', variants)
      .eq('is_active', true)
      .maybeSingle(),
    supabase
      .from('user_profiles')
      .select('plan, daily_pro_gen_count, last_gen_reset_date')
      .in('whatsapp_phone', variants)
      .maybeSingle(),
  ]);

  // Non-pro users get Pollinations (free tier by design, not a limit hit)
  if ((profile?.plan ?? 'free') !== 'pro') return { url: fallback, overflowed: false };

  // No LoRA model trained yet — Pro but no visual upgrade available
  if (!account?.lora_model_id || account.lora_status !== 'ready') {
    return { url: fallback, overflowed: false };
  }

  // Daily counter — reset when the date rolls over
  const today = new Date().toISOString().slice(0, 10);
  let count = profile?.daily_pro_gen_count ?? 0;
  if ((profile?.last_gen_reset_date ?? '') !== today) {
    count = 0;
    await supabase
      .from('user_profiles')
      .update({ daily_pro_gen_count: 0, last_gen_reset_date: today })
      .in('whatsapp_phone', variants);
  }

  if (count >= DAILY_PRO_LIMIT) return { url: fallback, overflowed: true };

  // Claim one slot before the Replicate call (optimistic, tolerates parallel races)
  await supabase
    .from('user_profiles')
    .update({ daily_pro_gen_count: count + 1, last_gen_reset_date: today })
    .in('whatsapp_phone', variants);

  try {
    const url = await buildBrandImageUrl(prompt, account);
    return { url: url ?? fallback, overflowed: false };
  } catch (err) {
    console.warn('[branded-image] LoRA failed, using fallback:', err);
    return { url: fallback, overflowed: false };
  }
}
