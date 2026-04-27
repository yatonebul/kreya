import { createClient } from '@supabase/supabase-js';
import { buildBrandImageUrl } from '@/lib/lora';

const NEGATIVE = 'blurry, distorted face, ugly, deformed, low quality, watermark, text, logo';

export type ImageStyle = 'realistic' | 'anime' | '3d' | 'artistic';

const MODEL_MAP: Record<ImageStyle, string> = {
  realistic: 'flux-realism',
  anime:     'flux-anime',
  '3d':      'flux-3d',
  artistic:  'flux',
};

function getSupabase() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
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

export function buildImageUrl(prompt: string, style: ImageStyle = 'realistic'): string {
  const seed = Math.floor(Math.random() * 1_000_000);
  const model = MODEL_MAP[style];
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1080&height=1080&nologo=true&model=${model}&seed=${seed}&negative=${encodeURIComponent(NEGATIVE)}`;
}

// Brand-aware image generation. When the active IG account for this
// phone has a trained LoRA (status='ready'), route through Replicate
// for visual consistency with the user's actual feed. Otherwise fall
// back to the pollinations URL — instant, free, and still on-brand
// via prompt engineering.
//
// Async because Replicate predictions take 10-20s of polling. Caller
// must await. On any LoRA failure (timeout, missing token, model
// errors), we silently fall back so the user still gets an image.
export async function buildBrandedImage(
  prompt: string,
  style: ImageStyle = 'realistic',
  phone?: string,
): Promise<string> {
  const fallback = buildImageUrl(prompt, style);

  if (!phone || !process.env.REPLICATE_API_TOKEN) return fallback;

  const { data: account } = await getSupabase()
    .from('instagram_accounts')
    .select('account_name, lora_model_id, lora_status')
    .in('whatsapp_phone', phoneVariants(phone))
    .eq('is_active', true)
    .maybeSingle();

  if (!account?.lora_model_id || account.lora_status !== 'ready') {
    return fallback;
  }

  try {
    const url = await buildBrandImageUrl(prompt, account);
    return url ?? fallback;
  } catch (err) {
    console.warn('[branded-image] LoRA failed, using fallback:', err);
    return fallback;
  }
}
