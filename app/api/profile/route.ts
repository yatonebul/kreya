import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { buildProfileContext } from '@/lib/whatsapp-onboarding';

function getSupabase() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function PATCH(request: NextRequest) {
  const { phone, brand_name, niche, tone } = await request.json().catch(() => ({}));

  if (!phone) return NextResponse.json({ error: 'phone required' }, { status: 400 });

  const updates: Record<string, string> = {};
  if (brand_name?.trim()) updates.brand_name = brand_name.trim();
  if (niche?.trim())      updates.niche      = niche.trim();
  if (tone?.trim())       updates.tone       = tone.trim();

  if (!Object.keys(updates).length) return NextResponse.json({ error: 'nothing to update' }, { status: 400 });

  // Fetch current values to fill in missing fields for profile_context rebuild
  const { data: current } = await getSupabase()
    .from('user_profiles')
    .select('brand_name, niche, tone')
    .eq('whatsapp_phone', phone)
    .maybeSingle();

  const merged = {
    brand_name: updates.brand_name ?? current?.brand_name ?? '',
    niche:      updates.niche      ?? current?.niche      ?? '',
    tone:       updates.tone       ?? current?.tone       ?? '',
  };

  if (merged.brand_name && merged.niche && merged.tone) {
    updates.profile_context = buildProfileContext(merged.brand_name, merged.niche, merged.tone);
  }

  const { error } = await getSupabase()
    .from('user_profiles')
    .upsert({ whatsapp_phone: phone, ...updates }, { onConflict: 'whatsapp_phone' });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, updated: updates });
}
