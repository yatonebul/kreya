import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendText } from '@/lib/whatsapp-send';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://kreya-github.vercel.app';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// Vercel injects Authorization: Bearer {CRON_SECRET} on scheduled runs.
// Also accepts manual calls with the same header for testing.
export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabase();

  // Fetch all active accounts whose token expires within 15 days
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + 15);

  const { data: accounts, error } = await supabase
    .from('instagram_accounts')
    .select('account_name, access_token, token_expires_at, whatsapp_phone')
    .eq('is_active', true)
    .lt('token_expires_at', cutoff.toISOString());

  if (error) {
    console.error('[token-refresh] DB error', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!accounts?.length) {
    return NextResponse.json({ ok: true, refreshed: 0, message: 'No tokens due for refresh' });
  }

  const results: { account: string; status: string; error?: string }[] = [];

  for (const account of accounts) {
    try {
      const res = await fetch(
        `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${account.access_token}`
      );
      const data = await res.json();

      if (!data.access_token) {
        throw new Error(data.error?.message ?? JSON.stringify(data));
      }

      const expiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();

      await supabase
        .from('instagram_accounts')
        .update({ access_token: data.access_token, token_expires_at: expiresAt })
        .eq('account_name', account.account_name);

      console.log(`[token-refresh] ${account.account_name} refreshed → expires ${expiresAt}`);
      results.push({ account: account.account_name, status: 'refreshed' });
    } catch (err: any) {
      console.error(`[token-refresh] ${account.account_name} failed:`, err.message);

      // Notify user via WhatsApp if phone is known
      if (account.whatsapp_phone) {
        const reconnectUrl = `${APP_URL}/api/auth/instagram?phone=${encodeURIComponent(account.whatsapp_phone)}`;
        await sendText(
          account.whatsapp_phone,
          `⚠️ Your Instagram (@${account.account_name}) connection needs to be renewed.\n\nTap here to reconnect:\n${reconnectUrl}`
        ).catch(() => {});
      }

      results.push({ account: account.account_name, status: 'failed', error: err.message });
    }
  }

  return NextResponse.json({ ok: true, refreshed: results.filter(r => r.status === 'refreshed').length, results });
}
