import { NextRequest, NextResponse } from 'next/server';
import { randomInt } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { hashOtp } from '@/lib/session';
import { sendEmail, otpEmailHtml } from '@/lib/email';

function db() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function POST(req: NextRequest) {
  const { email } = await req.json() as { email?: string };
  if (!email) return NextResponse.json({ error: 'email required' }, { status: 400 });

  const supabase = db();

  // Only approved registrations can request email OTPs
  const { data: reg } = await supabase
    .from('email_registrations')
    .select('status')
    .eq('email', email.toLowerCase().trim())
    .maybeSingle();

  if (!reg || reg.status !== 'approved') {
    // Don't leak whether email exists — same response either way
    return NextResponse.json({ ok: true });
  }

  const windowAgo = new Date(Date.now() - 10 * 60_000).toISOString();
  const { count } = await supabase
    .from('otp_codes')
    .select('*', { count: 'exact', head: true })
    .eq('phone', email)
    .gte('created_at', windowAgo);

  if ((count ?? 0) >= 3) {
    return NextResponse.json({ error: 'Too many codes. Wait a few minutes.' }, { status: 429 });
  }

  const code      = String(randomInt(100000, 1000000));
  const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();

  await supabase.from('otp_codes').insert({ phone: email, code_hash: hashOtp(code), expires_at: expiresAt });
  await sendEmail({ to: email, subject: `${code} — your Kreya code`, html: otpEmailHtml(code) });

  return NextResponse.json({ ok: true });
}
