import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { hashToken, createSession, SESSION_COOKIE, sessionCookieOptions, SESSION_DAYS } from '@/lib/session';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://kreya-github.vercel.app';

function db() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  const email = req.nextUrl.searchParams.get('id');

  if (!token || !email) {
    return NextResponse.redirect(`${APP_URL}/login?error=invalid_link`);
  }

  const supabase = db();
  const hash = hashToken(token);

  const { data: otp } = await supabase
    .from('otp_codes')
    .select('id, used')
    .eq('phone', email)            // email stored in 'phone' field
    .eq('code_hash', hash)
    .eq('used', false)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (!otp) {
    return NextResponse.redirect(`${APP_URL}/login?error=expired_link`);
  }

  await supabase.from('otp_codes').update({ used: true }).eq('id', otp.id);

  // Look up linked phone so dashboard can load WhatsApp content
  const { data: reg } = await supabase
    .from('email_registrations')
    .select('phone')
    .eq('email', email)
    .maybeSingle();

  // Session identifier: linked phone if available, else email
  const identifier = reg?.phone ?? email;
  const sessionToken = await createSession(identifier);

  const res = NextResponse.redirect(`${APP_URL}/account?email=${encodeURIComponent(email)}`);
  res.cookies.set(SESSION_COOKIE, sessionToken, sessionCookieOptions(SESSION_DAYS * 86_400));
  return res;
}
