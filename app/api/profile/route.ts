import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { updateAccountBrandProfileById, updateActiveBrandProfile } from '@/lib/brand-profile';

function getSupabase() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

function phoneVariants(p: string): string[] {
  return p.startsWith('+') ? [p, p.slice(1)] : [p, `+${p}`];
}

export async function PATCH(request: NextRequest) {
  const { phone, brand_name, niche, tone, account_id } = await request.json().catch(() => ({}));

  if (!phone) return NextResponse.json({ error: 'phone required' }, { status: 400 });

  const updates: Record<string, string> = {};
  if (brand_name?.trim()) updates.brand_name = brand_name.trim();
  if (niche?.trim())      updates.niche      = niche.trim();
  if (tone?.trim())       updates.tone       = tone.trim();

  if (!Object.keys(updates).length) return NextResponse.json({ error: 'nothing to update' }, { status: 400 });

  // Targeted account write (multi-account /account switcher). Verify the
  // account belongs to the caller's phone before writing — prevents one
  // user editing another user's brand profile by guessing the id.
  if (account_id) {
    const { data: own } = await getSupabase()
      .from('instagram_accounts')
      .select('id')
      .eq('id', account_id)
      .in('whatsapp_phone', phoneVariants(phone))
      .maybeSingle();
    if (!own) return NextResponse.json({ error: 'account not yours' }, { status: 403 });

    const result = await updateAccountBrandProfileById(account_id, updates);
    if (!result.ok) return NextResponse.json({ error: result.error ?? 'update failed' }, { status: 500 });
    return NextResponse.json({
      success: true,
      updated: updates,
      target: 'account',
      account_name: result.account_name,
    });
  }

  // Default: route to active IG account row when one exists, else user_profiles.
  const result = await updateActiveBrandProfile(phone, updates);
  if (!result.ok) return NextResponse.json({ error: result.error ?? 'update failed' }, { status: 500 });

  return NextResponse.json({
    success: true,
    updated: updates,
    target: result.target,
    account_name: result.account_name,
  });
}
