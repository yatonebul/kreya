import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

const APP_ID       = process.env.FACEBOOK_APP_ID!;
const REDIRECT_URI = process.env.FACEBOOK_REDIRECT_URI
  ?? `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/facebook/callback`;
const APP_URL      = process.env.NEXT_PUBLIC_APP_URL ?? 'https://kreya-github.vercel.app';

const SCOPES = [
  'pages_manage_posts',
  'pages_read_engagement',
  'pages_show_list',
  'public_profile',
].join(',');

function getSupabase() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const phone = searchParams.get('phone')?.trim();

  if (!phone) {
    return NextResponse.redirect(`${APP_URL}/connect?error=missing_phone`);
  }

  const state          = randomUUID();
  const stateWithPhone = `${state}|${phone}`;

  await getSupabase().from('oauth_pending_states').insert({ state, phone }).then(() => {}, () => {});

  const url =
    `https://www.facebook.com/dialog/oauth` +
    `?client_id=${APP_ID}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    `&scope=${SCOPES}` +
    `&state=${encodeURIComponent(stateWithPhone)}` +
    `&response_type=code`;

  return NextResponse.redirect(url);
}
