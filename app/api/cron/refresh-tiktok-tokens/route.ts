import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

// Refreshes TikTok access tokens that expire within the next 48 hours.
// Run daily via Vercel cron. TikTok access tokens expire in 24h; refresh
// tokens last 365 days. We refresh proactively so users never hit an expired
// token mid-publish.
export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabase();
  const soon = new Date(Date.now() + 48 * 3600 * 1000).toISOString();

  const { data: accounts, error } = await supabase
    .from('tiktok_accounts')
    .select('open_id, whatsapp_phone, refresh_token, refresh_expires_at')
    .eq('is_active', true)
    .lte('token_expires_at', soon);

  if (error) {
    console.error('[refresh-tiktok-tokens] DB error', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!accounts?.length) {
    return NextResponse.json({ ok: true, refreshed: 0 });
  }

  const results: { open_id: string; status: string; error?: string }[] = [];

  for (const account of accounts) {
    const refreshExpired = account.refresh_expires_at && new Date(account.refresh_expires_at) < new Date();
    if (!account.refresh_token || refreshExpired) {
      results.push({ open_id: account.open_id, status: 'skipped_no_refresh' });
      continue;
    }

    try {
      const res = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_key:    process.env.TIKTOK_CLIENT_KEY!,
          client_secret: process.env.TIKTOK_CLIENT_SECRET!,
          grant_type:    'refresh_token',
          refresh_token: account.refresh_token,
        }),
      });
      const body = await res.json();

      if (!res.ok || !body.access_token) {
        throw new Error(`TikTok refresh failed: ${JSON.stringify(body)}`);
      }

      const newAccessExpiry  = new Date(Date.now() + body.expires_in * 1000).toISOString();
      const newRefreshExpiry = body.refresh_expires_in
        ? new Date(Date.now() + body.refresh_expires_in * 1000).toISOString()
        : account.refresh_expires_at;

      await supabase.from('tiktok_accounts').update({
        access_token:       body.access_token,
        refresh_token:      body.refresh_token ?? account.refresh_token,
        token_expires_at:   newAccessExpiry,
        refresh_expires_at: newRefreshExpiry,
      }).eq('open_id', account.open_id);

      results.push({ open_id: account.open_id, status: 'refreshed' });
    } catch (err: any) {
      console.error('[refresh-tiktok-tokens] failed for', account.open_id, err.message);
      results.push({ open_id: account.open_id, status: 'failed', error: err.message });
    }
  }

  return NextResponse.json({
    ok: true,
    refreshed: results.filter(r => r.status === 'refreshed').length,
    results,
  });
}
