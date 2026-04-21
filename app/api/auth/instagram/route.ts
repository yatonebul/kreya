import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

const APP_ID = process.env.INSTAGRAM_APP_ID ?? '761297643580425';
const REDIRECT_URI = process.env.INSTAGRAM_REDIRECT_URI ?? 'https://kreya-github.vercel.app/api/auth/instagram/callback';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://kreya-github.vercel.app';
const SCOPES = [
  'instagram_business_basic',
  'instagram_business_content_publish',
  'instagram_business_manage_messages',
  'instagram_business_manage_insights',
  'instagram_business_manage_comments',
].join(',');

function getSupabase() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const phone = searchParams.get('phone')?.trim();

  if (!phone) {
    return NextResponse.redirect(`${APP_URL}/connect?error=missing_phone`);
  }

  const state = randomUUID();
  const { error: dbErr } = await getSupabase().from('oauth_pending_states').insert({ state, phone });
  if (dbErr) console.error('[IG OAuth] state insert failed:', dbErr.message);

  // Encode phone in state as fallback: "<uuid>|<phone>" — callback handles both forms
  const stateWithPhone = `${state}|${phone}`;

  const url = `https://www.instagram.com/oauth/authorize?enable_fb_login=0&force_authentication=1&client_id=${APP_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=${SCOPES}&state=${encodeURIComponent(stateWithPhone)}`;
  return NextResponse.redirect(url);
}
