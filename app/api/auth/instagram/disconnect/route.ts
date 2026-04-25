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

// Hard-delete an Instagram link for a phone. Audit log keeps history.
// If the disconnected account was the active one, auto-promote the most
// recently connected sibling so the user isn't stranded.
// POST { phone, instagram_user_id }
export async function POST(request: NextRequest) {
  const { phone, instagram_user_id } = await request.json().catch(() => ({}));
  if (!phone || !instagram_user_id) {
    return NextResponse.json({ error: 'phone + instagram_user_id required' }, { status: 400 });
  }

  const supabase = getSupabase();
  const phones = phoneVariants(phone);

  // Was it active? Need the answer before delete to know if we need to auto-promote.
  const { data: target } = await supabase
    .from('instagram_accounts')
    .select('id, account_name, is_active')
    .in('whatsapp_phone', phones)
    .eq('instagram_user_id', instagram_user_id)
    .maybeSingle();
  if (!target) return NextResponse.json({ error: 'account not found' }, { status: 404 });

  await supabase.from('social_audit_log').insert({
    action: 'disconnect_instagram',
    status: 'success',
    details: { account_name: target.account_name, instagram_user_id, whatsapp_phone: phone },
  });

  const { error: deleteErr } = await supabase
    .from('instagram_accounts')
    .delete()
    .eq('id', target.id);
  if (deleteErr) return NextResponse.json({ error: deleteErr.message }, { status: 500 });

  let newActive: string | null = null;
  if (target.is_active) {
    const { data: sibling } = await supabase
      .from('instagram_accounts')
      .select('id, account_name')
      .in('whatsapp_phone', phones)
      .order('token_expires_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (sibling) {
      await supabase
        .from('instagram_accounts')
        .update({ is_active: true })
        .eq('id', sibling.id);
      newActive = sibling.account_name;
    }
  }

  return NextResponse.json({ ok: true, disconnected: target.account_name, new_active: newActive });
}
