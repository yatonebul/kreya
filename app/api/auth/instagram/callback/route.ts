import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const APP_ID = process.env.INSTAGRAM_APP_ID ?? '761297643580425';
const APP_SECRET = process.env.INSTAGRAM_APP_SECRET!;
const REDIRECT_URI = process.env.INSTAGRAM_REDIRECT_URI ?? 'https://kreya-jet.vercel.app/api/auth/instagram/callback';
const CONNECT_URL = process.env.NEXT_PUBLIC_APP_URL
  ? `${process.env.NEXT_PUBLIC_APP_URL}/connect`
  : 'https://kreya-jet.vercel.app/connect';

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
    return NextResponse.redirect(`${CONNECT_URL}?error=${encodeURIComponent(error ?? 'no_code')}`);
  }

  try {
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
    if (!tokenData.access_token) throw new Error('Token exchange failed');

    // 2. Exchange for long-lived token (~60 days)
    const longRes = await fetch(
      `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${APP_SECRET}&access_token=${tokenData.access_token}`
    );
    const longData = await longRes.json();
    if (longData.error) throw new Error('Long-lived token exchange failed');

    const accessToken = longData.access_token ?? tokenData.access_token;

    // 3. Get Instagram user info
    const meRes = await fetch(`https://graph.instagram.com/me?fields=id,username&access_token=${accessToken}`);
    const meData = await meRes.json();
    if (!meData.id) throw new Error('Could not fetch user info');

    // 4. Upsert token in Supabase
    const expiresAt = new Date(Date.now() + (longData.expires_in ?? 5184000) * 1000).toISOString();
    const { error: dbError } = await getSupabase()
      .from('instagram_accounts')
      .upsert({
        account_name: meData.username,
        instagram_user_id: meData.id,
        access_token: accessToken,
        token_expires_at: expiresAt,
        is_active: true,
      }, { onConflict: 'account_name' });

    if (dbError) throw new Error(`DB error: ${dbError.message}`);

    return NextResponse.redirect(`${CONNECT_URL}?connected=${encodeURIComponent(meData.username)}`);
  } catch (err: any) {
    console.error('[IG callback error]', err.message);
    return NextResponse.redirect(`${CONNECT_URL}?error=${encodeURIComponent(err.message)}`);
  }
}
