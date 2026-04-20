import { NextRequest, NextResponse } from 'next/server';

const APP_ID = process.env.INSTAGRAM_APP_ID ?? '761297643580425';
const REDIRECT_URI = process.env.INSTAGRAM_REDIRECT_URI ?? 'https://kreya-github.vercel.app/api/auth/instagram/callback';
const SCOPES = [
  'instagram_business_basic',
  'instagram_business_content_publish',
  'instagram_business_manage_messages',
  'instagram_business_manage_insights',
  'instagram_business_manage_comments',
].join(',');

export async function GET(_request: NextRequest) {
  const url = `https://www.instagram.com/oauth/authorize?enable_fb_login=0&force_authentication=1&client_id=${APP_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=${SCOPES}`;
  return NextResponse.redirect(url);
}
