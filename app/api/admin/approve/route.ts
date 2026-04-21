import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'crypto';
import { hashToken } from '@/lib/session';
import { sendEmail, inviteEmailHtml } from '@/lib/email';

const ADMIN_SECRET = process.env.ADMIN_SECRET ?? '';
const APP_URL      = process.env.NEXT_PUBLIC_APP_URL ?? 'https://kreya-github.vercel.app';

function db() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function POST(req: NextRequest) {
  if (!ADMIN_SECRET || req.headers.get('x-admin-secret') !== ADMIN_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { id } = await req.json() as { id?: string };
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const supabase = db();
  const { data: reg, error } = await supabase
    .from('email_registrations')
    .select('email, phone, status')
    .eq('id', id)
    .maybeSingle();

  if (error || !reg) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  if (reg.status === 'approved') return NextResponse.json({ ok: true, message: 'Already approved.' });

  await supabase.from('email_registrations').update({ status: 'approved', approved_at: new Date().toISOString() }).eq('id', id);

  // Generate a 48-hour magic link token stored as OTP code
  const token     = randomBytes(32).toString('hex');
  const hash      = hashToken(token);
  const expiresAt = new Date(Date.now() + 48 * 3_600_000).toISOString();

  // identifier = email (stored in phone column — it's just a string key)
  await supabase.from('otp_codes').insert({ phone: reg.email, code_hash: hash, expires_at: expiresAt });

  const magicUrl = `${APP_URL}/api/auth/magic?token=${token}&id=${encodeURIComponent(reg.email)}`;

  await sendEmail({
    to:      reg.email,
    subject: "You're in — access your Kreya dashboard",
    html:    inviteEmailHtml(magicUrl),
  });

  return NextResponse.json({ ok: true });
}
