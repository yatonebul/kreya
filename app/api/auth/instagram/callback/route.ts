import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const APP_ID = process.env.INSTAGRAM_APP_ID ?? '761297643580425';
const APP_SECRET = process.env.INSTAGRAM_APP_SECRET!;
const REDIRECT_URI = process.env.INSTAGRAM_REDIRECT_URI ?? 'https://kreya-jet.vercel.app/api/auth/instagram/callback';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');

  if (error || !code) {
    return NextResponse.json({ error: error ?? 'No code received' }, { status: 400 });
  }

  // 1. Exchange code for short-lived token
  const tokenRes = await fetch('https://api.instagram.com/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: APP_ID,
      client_secret: APP_SECRET,
      grant_type: 'authorization_code',
      redirect_uri: REDIRECT_URI,
      code,
    }),
  });
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) {
    return NextResponse.json({ error: 'Token exchange failed', detail: tokenData }, { status: 500 });
  }

  // 2. Exchange for long-lived token (~60 days)
  const longRes = await fetch(
    `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${APP_SECRET}&access_token=${tokenData.access_token}`
  );
  const longData = await longRes.json();
  const accessToken = longData.access_token ?? tokenData.access_token;

  // 3. Get Instagram user info
  const meRes = await fetch(`https://graph.instagram.com/me?fields=id,username&access_token=${accessToken}`);
  const meData = await meRes.json();
  if (!meData.id) {
    return NextResponse.json({ error: 'Could not fetch user info', detail: meData }, { status: 500 });
  }

  // 4. Update token in Supabase
  const expiresAt = new Date(Date.now() + (longData.expires_in ?? 5184000) * 1000).toISOString();
  await getSupabase()
    .from('instagram_accounts')
    .update({
      access_token: accessToken,
      instagram_user_id: meData.id,
      token_expires_at: expiresAt,
      is_active: true,
    })
    .eq('account_name', meData.username);

  return NextResponse.json({
    ok: true,
    username: meData.username,
    instagram_user_id: meData.id,
    token_expires_at: expiresAt,
  });
}
