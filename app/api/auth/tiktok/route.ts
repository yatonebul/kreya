import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

const CLIENT_KEY   = process.env.TIKTOK_CLIENT_KEY!;
const REDIRECT_URI = process.env.TIKTOK_REDIRECT_URI!;
const APP_URL      = process.env.NEXT_PUBLIC_APP_URL ?? 'https://kreya-github.vercel.app';
const SCOPES       = 'user.info.basic,video.publish';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const phone = searchParams.get('phone')?.trim();

  if (!phone) {
    return NextResponse.redirect(`${APP_URL}/connect?error=missing_phone`);
  }

  const state = randomUUID();
  await getSupabase()
    .from('oauth_pending_states')
    .insert({ state, phone, platform: 'tiktok' });

  // Encode phone in state as fallback: "<uuid>|<phone>"
  const stateWithPhone = `${state}|${phone}`;

  const url = new URL('https://www.tiktok.com/v2/auth/authorize/');
  url.searchParams.set('client_key', CLIENT_KEY);
  url.searchParams.set('scope', SCOPES);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', REDIRECT_URI);
  url.searchParams.set('state', stateWithPhone);

  return NextResponse.redirect(url.toString());
}
