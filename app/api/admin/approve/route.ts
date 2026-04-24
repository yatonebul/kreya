import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'crypto';
import { hashToken, adminUrlToken } from '@/lib/session';
import { sendEmail, inviteEmailHtml } from '@/lib/email';
import { sendText } from '@/lib/whatsapp-send';

const ADMIN_SECRET = process.env.ADMIN_SECRET ?? '';
const ADMIN_PHONE  = process.env.ADMIN_WHATSAPP_PHONE ?? '';
const APP_URL      = process.env.NEXT_PUBLIC_APP_URL ?? 'https://kreya-github.vercel.app';
const WA_NUMBER    = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? '';

function db() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function POST(req: NextRequest) {
  if (!ADMIN_SECRET || req.headers.get('x-admin-secret') !== ADMIN_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { id } = await req.json() as { id?: string };
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const supabase = db();
  const { data: reg } = await supabase
    .from('email_registrations')
    .select('email, phone, status')
    .eq('id', id)
    .maybeSingle();

  if (!reg) return NextResponse.json({ error: 'Not found.' }, { status: 404 });

  const wasStatus = reg.status;

  await supabase.from('email_registrations')
    .update({ status: 'approved', approved_at: new Date().toISOString() })
    .eq('id', id);

  // Generate 48-hour magic link
  const token     = randomBytes(32).toString('hex');
  const hash      = hashToken(token);
  const expiresAt = new Date(Date.now() + 48 * 3_600_000).toISOString();
  await supabase.from('otp_codes').insert({ phone: reg.email, code_hash: hash, expires_at: expiresAt });

  const magicUrl = `${APP_URL}/api/auth/magic?token=${token}&id=${encodeURIComponent(reg.email)}`;
  const loginUrl = `${APP_URL}/login`;

  // Send invite email — non-fatal if Resend fails
  let emailSent = false;
  try {
    await sendEmail({
      to:      reg.email,
      subject: "You're in — access your Kreya dashboard",
      html:    inviteEmailHtml(magicUrl, loginUrl, WA_NUMBER || undefined),
    });
    emailSent = true;
  } catch (err) {
    console.error('[approve] sendEmail failed:', err);
  }

  // WhatsApp ping to admin — always fires regardless of email result
  if (ADMIN_PHONE) {
    const { count } = await supabase
      .from('email_registrations')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'approved');

    const urlToken  = adminUrlToken(ADMIN_SECRET);
    const reLabel   = wasStatus === 'rejected' ? ' (re-approved)' : '';
    const emailNote = emailSent ? 'Invite email sent.' : '⚠️ Invite email failed — check Resend.';
    sendText(
      ADMIN_PHONE,
      `✅ *Approved: ${reg.email}*${reLabel}\n\n${emailNote}\nTotal approved: *${count ?? '?'}*\n\n👉 ${APP_URL}/admin?secret=${urlToken}`
    ).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
