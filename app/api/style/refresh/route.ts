import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { learnStyleFromInstagram } from '@/lib/style-memory';

function getSupabase() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

function phoneVariants(phone: string): string[] {
  return phone.startsWith('+') ? [phone, phone.slice(1)] : [phone, `+${phone}`];
}

export async function POST(request: NextRequest) {
  const { phone, account_id } = await request.json().catch(() => ({}));
  if (!phone) return NextResponse.json({ error: 'phone required' }, { status: 400 });

  // If account_id is provided, target that specific account (multi-account
  // /account switcher). Otherwise default to the active account.
  const accountQuery = account_id
    ? getSupabase()
        .from('instagram_accounts')
        .select('instagram_user_id, access_token, account_name')
        .eq('id', account_id)
        .in('whatsapp_phone', phoneVariants(phone))
        .maybeSingle()
    : getSupabase()
        .from('instagram_accounts')
        .select('instagram_user_id, access_token, account_name')
        .in('whatsapp_phone', phoneVariants(phone))
        .eq('is_active', true)
        .maybeSingle();
  const { data: account } = await accountQuery;

  if (!account?.access_token || !account.instagram_user_id) {
    return NextResponse.json(
      { error: 'no_instagram', message: 'Connect Instagram first.' },
      { status: 400 },
    );
  }

  const result = await learnStyleFromInstagram(phone, account.instagram_user_id, account.access_token);
  if (!result.ok) {
    if (result.captionsFound < 3) {
      return NextResponse.json(
        { error: 'too_few_captions', captionsFound: result.captionsFound, account: account.account_name },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    captionsFound: result.captionsFound,
    account: account.account_name,
    suggestedNiche: result.suggestedNiche,
    suggestedTone: result.suggestedTone,
  });
}
