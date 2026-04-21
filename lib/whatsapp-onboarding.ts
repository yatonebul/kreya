import { createClient } from '@supabase/supabase-js';
import { sendText } from '@/lib/whatsapp-send';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://kreya-github.vercel.app';

const Q1 = `👋 Welcome to Kreya!\n\nI'll write and post to Instagram for you — just send me a message or photo.\n\nFirst: *what's your brand or account name?*`;
const Q2 = (name: string) => `Nice, ${name}! 🙌\n\nWhat's your *niche*?\n(e.g. fitness, food, travel, fashion, tech, lifestyle, photography...)`;
const Q3 = `Almost there! How would you describe your *posting style*?\n\n(e.g. casual & fun, professional & polished, inspirational, bold & edgy, educational...)`;
const DONE = (name: string) => `✅ *${name}* is set up!`;
const INSTAGRAM_CONNECT = (phone: string) =>
  `📸 *One last step* — connect your Instagram account so I can post for you:\n\n${APP_URL}/api/auth/instagram?phone=${encodeURIComponent(phone)}\n\nTap the link and authorize. Once connected, send me any message, photo, or voice note to create your first post! 🚀`;

export function buildProfileContext(brandName: string, niche: string, tone: string): string {
  return `Brand: ${brandName}. Niche: ${niche}. Tone: ${tone}. Write captions that feel authentic to this brand — avoid generic phrases and mirror the described tone exactly.`;
}

export async function handleOnboarding(from: string, messageType: string, text?: string): Promise<boolean> {
  const supabase = getSupabase();

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('onboarding_step, brand_name, niche')
    .eq('whatsapp_phone', from)
    .maybeSingle();

  // New user — start onboarding
  if (!profile) {
    await supabase.from('user_profiles').insert({ whatsapp_phone: from, onboarding_step: 1 });
    await sendText(from, Q1);
    return true;
  }

  const step = profile.onboarding_step;
  if (step >= 4) return false; // onboarding complete

  // Non-text during onboarding — nudge to answer the current question
  if (messageType !== 'text' || !text?.trim()) {
    const nudge = step === 1 ? Q1 : step === 2 ? Q2(profile.brand_name ?? 'you') : Q3;
    await sendText(from, `👆 Please answer the setup question first:\n\n${nudge}`);
    return true;
  }

  const answer = text.trim();

  if (step === 1) {
    await supabase.from('user_profiles').update({ brand_name: answer, onboarding_step: 2 }).eq('whatsapp_phone', from);
    await sendText(from, Q2(answer));
    return true;
  }

  if (step === 2) {
    await supabase.from('user_profiles').update({ niche: answer, onboarding_step: 3 }).eq('whatsapp_phone', from);
    await sendText(from, Q3);
    return true;
  }

  if (step === 3) {
    const profileContext = buildProfileContext(profile.brand_name!, profile.niche!, answer);
    await supabase.from('user_profiles')
      .update({ tone: answer, profile_context: profileContext, onboarding_step: 4 })
      .eq('whatsapp_phone', from);
    await sendText(from, DONE(profile.brand_name!));
    await sendText(from, INSTAGRAM_CONNECT(from));
    return true;
  }

  return false;
}

export async function getProfileContextForPhone(phone: string): Promise<string | null> {
  const { data } = await getSupabase()
    .from('user_profiles')
    .select('profile_context')
    .eq('whatsapp_phone', phone)
    .maybeSingle();
  return data?.profile_context ?? null;
}
