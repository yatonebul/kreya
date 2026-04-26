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

  // Refresh tokens 30 days before expiry. IG long-lived tokens last 60 days
  // and the refresh endpoint requires the token to be at least 24h old —
  // running weekly with a 30-day cushion gives multiple retry windows
  // before any user-visible failure. We refresh every connected account
  // (not just is_active) so an inactive sibling doesn't silently rot.
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + 30);

  const { data: accounts, error } = await supabase
    .from('instagram_accounts')
    .select('id, account_name, access_token, token_expires_at, whatsapp_phone')
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
        .eq('id', account.id);

      console.log(`[token-refresh] ${account.account_name} refreshed → expires ${expiresAt}`);
      results.push({ account: account.account_name, status: 'refreshed' });
    } catch (err: any) {
      console.error(`[token-refresh] ${account.account_name} failed:`, err.message);

      // Only nag the user once per account when refresh actually fails
      // (token revoked, network error, etc.) — successful auto-refresh
      // stays silent so we don't spam them with "all good" pings.
      if (account.whatsapp_phone) {
        const reconnectUrl = `${APP_URL}/api/auth/instagram?phone=${encodeURIComponent(account.whatsapp_phone)}`;
        await sendText(
          account.whatsapp_phone,
          `⚠️ Couldn't auto-renew your Instagram (@${account.account_name}) connection.\n\nTap here to reconnect once:\n${reconnectUrl}`
        ).catch(() => {});
      }

      results.push({ account: account.account_name, status: 'failed', error: err.message });
    }
  }

  return NextResponse.json({ ok: true, refreshed: results.filter(r => r.status === 'refreshed').length, results });
}
