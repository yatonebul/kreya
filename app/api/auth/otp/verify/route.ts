import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { hashOtp, createSession, SESSION_COOKIE, sessionCookieOptions, SESSION_DAYS } from '@/lib/session';

function db() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function POST(req: NextRequest) {
  const { phone, code } = await req.json() as { phone?: string; code?: string };
  if (!phone || !code) return NextResponse.json({ error: 'phone and code required' }, { status: 400 });

  const supabase = db();

  const { data: otp } = await supabase
    .from('otp_codes')
    .select('id, code_hash, attempts')
    .eq('phone', phone)
    .eq('used', false)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!otp) {
    return NextResponse.json({ error: 'Code expired or not found. Request a new one.' }, { status: 400 });
  }

  // Increment attempts before checking — prevents brute-force even on race conditions
  await supabase.from('otp_codes').update({ attempts: otp.attempts + 1 }).eq('id', otp.id);

  if (otp.attempts >= 3) {
    return NextResponse.json({ error: 'Too many incorrect attempts. Request a new code.' }, { status: 400 });
  }

  if (hashOtp(code) !== otp.code_hash) {
    return NextResponse.json({ error: `Incorrect code. ${2 - otp.attempts} attempt(s) remaining.` }, { status: 400 });
  }

  await supabase.from('otp_codes').update({ used: true }).eq('id', otp.id);

  const token = await createSession(phone);
  const res   = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(SESSION_DAYS * 86_400));
  return res;
}
