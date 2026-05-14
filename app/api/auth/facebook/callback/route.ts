import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendText } from '@/lib/whatsapp-send';

const APP_ID       = process.env.FACEBOOK_APP_ID!;
const APP_SECRET   = process.env.FACEBOOK_APP_SECRET!;
const REDIRECT_URI = process.env.FACEBOOK_REDIRECT_URI
  ?? `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/facebook/callback`;
const CONNECT_URL  = `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://kreya-github.vercel.app'}/connect`;
const GRAPH        = 'https://graph.facebook.com/v21.0';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code  = searchParams.get('code');
  const error = searchParams.get('error');
  const state = searchParams.get('state');

  if (error || !code) {
    return NextResponse.redirect(`${CONNECT_URL}?error=${encodeURIComponent(error ?? 'no_code')}`);
  }

  // Resolve state → whatsapp phone
  let whatsappPhone: string | null = null;
  if (state) {
    const decoded = decodeURIComponent(state);
    const pipeIdx = decoded.indexOf('|');
    if (pipeIdx >= 0) {
      const uuid = decoded.slice(0, pipeIdx);
      whatsappPhone = decoded.slice(pipeIdx + 1)?.trim() || null;
      await getSupabase().from('oauth_pending_states').delete().eq('state', uuid).then(() => {}, () => {});
    } else {
      const { data: pending } = await getSupabase()
        .from('oauth_pending_states').select('phone').eq('state', decoded).maybeSingle();
      if (pending?.phone) {
        whatsappPhone = pending.phone?.trim() || null;
        await getSupabase().from('oauth_pending_states').delete().eq('state', decoded);
      }
    }
  }

  try {
    // 1. Exchange code for short-lived user token
    const tokenRes = await fetch(
      `${GRAPH}/oauth/access_token` +
      `?client_id=${APP_ID}` +
      `&client_secret=${APP_SECRET}` +
      `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
      `&code=${code}`,
    );
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      throw new Error(`Facebook token exchange failed: ${JSON.stringify(tokenData)}`);
    }

    // 2. Exchange for long-lived user token (~60 days)
    const longRes = await fetch(
      `${GRAPH}/oauth/access_token` +
      `?grant_type=fb_exchange_token` +
      `&client_id=${APP_ID}` +
      `&client_secret=${APP_SECRET}` +
      `&fb_exchange_token=${tokenData.access_token}`,
    );
    const longData = await longRes.json();
    const userToken = longData.access_token ?? tokenData.access_token;

    // 3. Fetch pages the user manages — page tokens don't expire
    const pagesRes = await fetch(`${GRAPH}/me/accounts?access_token=${userToken}`);
    const pagesData = await pagesRes.json();
    const pages: Array<{ id: string; name: string; access_token: string }> = pagesData.data ?? [];

    if (!pages.length) {
      throw new Error('No Facebook pages found — make sure you are a page admin');
    }

    const supabase = getSupabase();

    // 4. Upsert each page into facebook_accounts
    for (const page of pages) {
      const { error: upsertErr } = await supabase
        .from('facebook_accounts')
        .upsert(
          {
            whatsapp_phone:   whatsappPhone ?? '',
            page_id:          page.id,
            page_name:        page.name,
            access_token:     page.access_token,
            token_expires_at: null,   // page tokens don't expire
            is_active:        true,
          },
          { onConflict: 'whatsapp_phone,page_id' },
        );
      if (upsertErr) {
        console.error('[FB callback upsert error]', upsertErr.message);
      }
    }

    // 5. Notify user
    if (whatsappPhone) {
      const pageNames = pages.map(p => p.name).join(', ');
      await sendText(
        whatsappPhone,
        `✅ Facebook connected!\n\nPages linked: *${pageNames}*\n\nYou can now publish Reels and videos to Facebook. 🎬`,
      ).catch(() => {});
    }

    const phoneParam = whatsappPhone ? `&phone=${encodeURIComponent(whatsappPhone)}` : '';
    return NextResponse.redirect(`${CONNECT_URL}?connected=${encodeURIComponent(pages[0]?.name ?? 'Facebook')}${phoneParam}`);
  } catch (err: any) {
    console.error('[FB callback error]', err.message);
    const phoneParam = whatsappPhone ? `&phone=${encodeURIComponent(whatsappPhone)}` : '';
    return NextResponse.redirect(`${CONNECT_URL}?error=${encodeURIComponent(err.message)}${phoneParam}`);
  }
}
