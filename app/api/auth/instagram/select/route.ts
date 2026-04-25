import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

function phoneVariants(phone: string): string[] {
  return phone.startsWith('+') ? [phone, phone.slice(1)] : [phone, `+${phone}`];
}

// Mark one IG account as the active one for a phone, demoting siblings.
// POST { phone, instagram_user_id }
export async function POST(request: NextRequest) {
  const { phone, instagram_user_id } = await request.json().catch(() => ({}));
  if (!phone || !instagram_user_id) {
    return NextResponse.json({ error: 'phone + instagram_user_id required' }, { status: 400 });
  }

  const supabase = getSupabase();
  const phones = phoneVariants(phone);

  // Demote everyone else
  const { error: demoteErr } = await supabase
    .from('instagram_accounts')
    .update({ is_active: false })
    .in('whatsapp_phone', phones)
    .neq('instagram_user_id', instagram_user_id);
  if (demoteErr) return NextResponse.json({ error: demoteErr.message }, { status: 500 });

  // Promote the chosen one
  const { error: promoteErr, data } = await supabase
    .from('instagram_accounts')
    .update({ is_active: true })
    .in('whatsapp_phone', phones)
    .eq('instagram_user_id', instagram_user_id)
    .select('account_name')
    .maybeSingle();
  if (promoteErr) return NextResponse.json({ error: promoteErr.message }, { status: 500 });
  if (!data)        return NextResponse.json({ error: 'account not found for this phone' }, { status: 404 });

  return NextResponse.json({ ok: true, active: data.account_name });
}
