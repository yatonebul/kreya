import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createSession, hashToken, sessionCookieOptions, SESSION_COOKIE, SESSION_DAYS } from '@/lib/session';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://kreya-github.vercel.app';

function db() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

// One-tap dashboard link from WhatsApp. Mirrors /api/auth/magic but is
// phone-aware (no email_registrations lookup) and redirects to
// /account?phone= so the dashboard loads the right WA-keyed content.
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  const phone = req.nextUrl.searchParams.get('phone');

  if (!token || !phone) {
    return NextResponse.redirect(`${APP_URL}/login?error=invalid_link`);
  }

  const supabase = db();
  const { data: row } = await supabase
    .from('otp_codes')
    .select('id, used')
    .eq('phone', phone)
    .eq('code_hash', hashToken(token))
    .eq('used', false)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (!row) {
    return NextResponse.redirect(`${APP_URL}/login?error=expired_link`);
  }

  await supabase.from('otp_codes').update({ used: true }).eq('id', row.id);

  const sessionToken = await createSession(phone);
  const res = NextResponse.redirect(`${APP_URL}/account?phone=${encodeURIComponent(phone)}`);
  res.cookies.set(SESSION_COOKIE, sessionToken, sessionCookieOptions(SESSION_DAYS * 86_400));
  return res;
}
