import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

function phoneVariants(p: string): string[] {
  return p.startsWith('+') ? [p, p.slice(1)] : [p, `+${p}`];
}

// PATCH /api/profile/engagement
// Body: { phone, account_id, dm_autoreply_enabled?, comment_autoreply_enabled? }
// Per-account ownership check: account_id must belong to the calling
// phone (prevents one user toggling another's engagement settings by
// guessing ids).
export async function PATCH(request: NextRequest) {
  const { phone, account_id, dm_autoreply_enabled, comment_autoreply_enabled } =
    await request.json().catch(() => ({}));

  if (!phone || !account_id) {
    return NextResponse.json({ error: 'phone + account_id required' }, { status: 400 });
  }

  const supabase = getSupabase();
  const { data: own } = await supabase
    .from('instagram_accounts')
    .select('id, account_name')
    .eq('id', account_id)
    .in('whatsapp_phone', phoneVariants(phone))
    .maybeSingle();
  if (!own) return NextResponse.json({ error: 'account not yours' }, { status: 403 });

  const patch: Record<string, boolean | string> = {
    engagement_offered_at: new Date().toISOString(),
  };
  if (typeof dm_autoreply_enabled      === 'boolean') patch.dm_autoreply_enabled      = dm_autoreply_enabled;
  if (typeof comment_autoreply_enabled === 'boolean') patch.comment_autoreply_enabled = comment_autoreply_enabled;

  if (Object.keys(patch).length <= 1) {
    return NextResponse.json({ error: 'no flags provided' }, { status: 400 });
  }

  const { error } = await supabase.from('instagram_accounts').update(patch).eq('id', account_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, account_name: own.account_name });
}
