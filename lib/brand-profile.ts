import { createClient } from '@supabase/supabase-js';
import { buildProfileContext } from '@/lib/whatsapp-onboarding';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function phoneVariants(phone: string): string[] {
  return phone.startsWith('+') ? [phone, phone.slice(1)] : [phone, `+${phone}`];
}

export type BrandFields = {
  brand_name?: string | null;
  niche?: string | null;
  tone?: string | null;
  profile_context?: string | null;
  learned_style?: string | null;
};

export type ResolvedProfile = BrandFields & {
  account_name?: string | null;
  source: 'account' | 'phone' | 'none';
};

// Returns the brand profile for the active IG account if present,
// otherwise falls back to user_profiles (legacy / pre-connect users).
export async function getActiveBrandProfile(phone: string): Promise<ResolvedProfile> {
  const supabase = getSupabase();
  const phones = phoneVariants(phone);

  const { data: account } = await supabase
    .from('instagram_accounts')
    .select('account_name, brand_name, niche, tone, profile_context, learned_style')
    .in('whatsapp_phone', phones)
    .eq('is_active', true)
    .maybeSingle();

  if (account) {
    return {
      account_name: account.account_name,
      brand_name: account.brand_name,
      niche: account.niche,
      tone: account.tone,
      profile_context: account.profile_context,
      learned_style: account.learned_style,
      source: 'account',
    };
  }

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('brand_name, niche, tone, profile_context, learned_style')
    .eq('whatsapp_phone', phone)
    .maybeSingle();

  if (profile) {
    return { ...profile, source: 'phone' };
  }
  return { source: 'none' };
}

// Returns the merged context string (profile_context + learned_style)
// for caption generation. Single source of truth — readers should
// call this instead of fetching user_profiles directly.
export async function getProfileContextForPhone(phone: string): Promise<string | null> {
  const p = await getActiveBrandProfile(phone);
  const parts: string[] = [];
  if (p.profile_context) parts.push(p.profile_context);
  if (p.learned_style) parts.push(`Voice / writing style learned from past Instagram posts:\n${p.learned_style}`);
  return parts.length ? parts.join('\n\n') : null;
}

// Writes brand updates to the active IG account row when one exists,
// otherwise writes to user_profiles (e.g. pre-connect onboarding).
// Rebuilds profile_context if any of brand_name/niche/tone change.
export async function updateActiveBrandProfile(
  phone: string,
  updates: Partial<Pick<BrandFields, 'brand_name' | 'niche' | 'tone' | 'learned_style'>>,
): Promise<{ ok: boolean; target: 'account' | 'phone'; account_name?: string; error?: string }> {
  const supabase = getSupabase();
  const phones = phoneVariants(phone);

  const { data: account } = await supabase
    .from('instagram_accounts')
    .select('id, account_name, brand_name, niche, tone')
    .in('whatsapp_phone', phones)
    .eq('is_active', true)
    .maybeSingle();

  const merged = {
    brand_name: updates.brand_name ?? account?.brand_name ?? '',
    niche:      updates.niche      ?? account?.niche      ?? '',
    tone:       updates.tone       ?? account?.tone       ?? '',
  };
  const patch: BrandFields = { ...updates };
  if (merged.brand_name && merged.niche && merged.tone) {
    patch.profile_context = buildProfileContext(merged.brand_name, merged.niche, merged.tone);
  }

  if (account) {
    const { error } = await supabase
      .from('instagram_accounts')
      .update(patch)
      .eq('id', account.id);
    if (error) return { ok: false, target: 'account', error: error.message };
    return { ok: true, target: 'account', account_name: account.account_name };
  }

  // No active IG account — fall back to phone-level user_profiles
  const { error } = await supabase
    .from('user_profiles')
    .upsert({ whatsapp_phone: phone, ...patch }, { onConflict: 'whatsapp_phone' });
  if (error) return { ok: false, target: 'phone', error: error.message };
  return { ok: true, target: 'phone' };
}
