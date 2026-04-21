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
  const normalizedEmail = email.toLowerCase().trim();

  const { data: reg, error: regErr } = await supabase
    .from('email_registrations')
    .select('status')
    .eq('email', normalizedEmail)
    .maybeSingle();

  if (regErr) {
    console.error('[Email OTP] DB error:', regErr.message);
    return NextResponse.json({ error: 'Database unavailable. Try again shortly.' }, { status: 500 });
  }

  if (!reg) {
    return NextResponse.json({ error: 'No account found for this email. Request access first.' }, { status: 404 });
  }

  if (reg.status === 'pending') {
    return NextResponse.json({ error: "Your registration is pending approval. You'll receive an invite once approved." }, { status: 403 });
  }

  if (reg.status === 'rejected') {
    return NextResponse.json({ error: 'This registration was not approved.' }, { status: 403 });
  }

  // status === 'approved'
  const windowAgo = new Date(Date.now() - 10 * 60_000).toISOString();
  const { count } = await supabase
    .from('otp_codes')
    .select('*', { count: 'exact', head: true })
    .eq('phone', normalizedEmail)
    .gte('created_at', windowAgo);

  if ((count ?? 0) >= 3) {
    return NextResponse.json({ error: 'Too many codes requested. Wait a few minutes.' }, { status: 429 });
  }

  const code      = String(randomInt(100000, 1000000));
  const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();

  const { error: insertErr } = await supabase.from('otp_codes').insert({ phone: normalizedEmail, code_hash: hashOtp(code), expires_at: expiresAt });
  if (insertErr) {
    console.error('[Email OTP] insert failed:', insertErr.message);
    return NextResponse.json({ error: 'Database unavailable. Try again shortly.' }, { status: 500 });
  }

  try {
    await sendEmail({ to: normalizedEmail, subject: `${code} — your Kreya code`, html: otpEmailHtml(code) });
  } catch (err) {
    console.error('[Email OTP] send failed:', err);
    return NextResponse.json({ error: 'Could not send email. Please try again or contact support.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
