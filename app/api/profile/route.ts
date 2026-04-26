import { NextRequest, NextResponse } from 'next/server';
import { updateActiveBrandProfile } from '@/lib/brand-profile';

export async function PATCH(request: NextRequest) {
  const { phone, brand_name, niche, tone } = await request.json().catch(() => ({}));

  if (!phone) return NextResponse.json({ error: 'phone required' }, { status: 400 });

  const updates: Record<string, string> = {};
  if (brand_name?.trim()) updates.brand_name = brand_name.trim();
  if (niche?.trim())      updates.niche      = niche.trim();
  if (tone?.trim())       updates.tone       = tone.trim();

  if (!Object.keys(updates).length) return NextResponse.json({ error: 'nothing to update' }, { status: 400 });

  // Routes to active IG account row when one exists, else user_profiles.
  const result = await updateActiveBrandProfile(phone, updates);
  if (!result.ok) return NextResponse.json({ error: result.error ?? 'update failed' }, { status: 500 });

  return NextResponse.json({
    success: true,
    updated: updates,
    target: result.target,
    account_name: result.account_name,
  });
}
