import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendText } from '@/lib/whatsapp-send';

const CLIENT_KEY    = process.env.TIKTOK_CLIENT_KEY!;
const CLIENT_SECRET = process.env.TIKTOK_CLIENT_SECRET!;
const REDIRECT_URI  = process.env.TIKTOK_REDIRECT_URI!;
const APP_URL       = process.env.NEXT_PUBLIC_APP_URL ?? 'https://kreya-github.vercel.app';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code    = searchParams.get('code');
  const state   = searchParams.get('state') ?? '';
  const errParam = searchParams.get('error');

  if (errParam) {
    console.error('[TikTok OAuth] user denied or error:', errParam);
    return NextResponse.redirect(`${APP_URL}/connect?error=tiktok_denied`);
  }

  // Resolve phone from state — "uuid|+phone" or DB lookup
  let phone: string | null = null;
  const pipeIdx = state.indexOf('|');
  if (pipeIdx !== -1) {
    phone = state.slice(pipeIdx + 1);
  } else {
    const { data } = await getSupabase()
      .from('oauth_pending_states')
      .select('phone')
      .eq('state', state)
      .maybeSingle();
    phone = data?.phone ?? null;
  }

  if (!phone || !code) {
    return NextResponse.redirect(`${APP_URL}/connect?error=tiktok_invalid_state`);
  }

  // Exchange code for tokens
  const tokenRes = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_key: CLIENT_KEY,
      client_secret: CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
      redirect_uri: REDIRECT_URI,
    }),
  });
  const tokenData = await tokenRes.json();

  if (!tokenData.access_token) {
    console.error('[TikTok OAuth] token exchange failed:', tokenData);
    return NextResponse.redirect(`${APP_URL}/connect?error=tiktok_token_failed`);
  }

  const { access_token, refresh_token, expires_in, refresh_expires_in, open_id } = tokenData;

  // Fetch TikTok display name
  const userRes = await fetch(
    'https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name',
    { headers: { Authorization: `Bearer ${access_token}` } },
  );
  const userData = await userRes.json();
  const displayName: string = userData?.data?.user?.display_name ?? '';

  const tokenExpiresAt    = expires_in        ? new Date(Date.now() + expires_in * 1000).toISOString()         : null;
  const refreshExpiresAt  = refresh_expires_in ? new Date(Date.now() + refresh_expires_in * 1000).toISOString() : null;

  // Upsert into tiktok_accounts
  const { error: upsertErr } = await getSupabase()
    .from('tiktok_accounts')
    .upsert({
      whatsapp_phone: phone,
      open_id,
      account_name: displayName,
      access_token,
      refresh_token: refresh_token ?? null,
      token_expires_at: tokenExpiresAt,
      refresh_expires_at: refreshExpiresAt,
      is_active: true,
    }, { onConflict: 'open_id' });

  if (upsertErr) {
    console.error('[TikTok OAuth] upsert failed:', upsertErr.message);
    return NextResponse.redirect(`${APP_URL}/connect?error=tiktok_save_failed`);
  }

  // Clean up pending state
  await getSupabase()
    .from('oauth_pending_states')
    .delete()
    .eq('state', state.split('|')[0]);

  // Notify user via WhatsApp
  await sendText(
    phone,
    `✅ TikTok connected! @${displayName || open_id} is ready.\n\nYour next post can be published to TikTok using the Pre-Flight menu.`,
  );

  return NextResponse.redirect(`${APP_URL}/connect?tiktok_connected=${encodeURIComponent(displayName || open_id)}`);
}
