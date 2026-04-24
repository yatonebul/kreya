import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendText } from '@/lib/whatsapp-send';
import { sendEmail, waitlistEmailHtml, adminRegistrationEmailHtml } from '@/lib/email';
import { adminUrlToken } from '@/lib/session';

const ADMIN_PHONE = process.env.ADMIN_WHATSAPP_PHONE ?? '';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? process.env.GMAIL_USER ?? '';
const APP_URL     = process.env.NEXT_PUBLIC_APP_URL ?? 'https://kreya-github.vercel.app';

function db() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function POST(req: NextRequest) {
  const { email, phone } = await req.json() as { email?: string; phone?: string };

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Valid email required.' }, { status: 400 });
  }

  const normalizedPhone = phone ? phone.trim().replace(/^\+/, '') : null;
  const normalizedEmail = email.toLowerCase().trim();

  const { error } = await db().from('email_registrations').insert({
    email:  normalizedEmail,
    phone:  normalizedPhone || null,
    status: 'pending',
  });

  if (error) {
    if (error.code === '23505') {
      // Return existing status so UI can show the right message
      const { data: existing } = await db()
        .from('email_registrations')
        .select('status')
        .eq('email', normalizedEmail)
        .maybeSingle();
      return NextResponse.json({ ok: true, duplicate: true, status: existing?.status ?? 'pending' });
    }
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 });
  }

  // Waitlist confirmation email (fire-and-forget)
  sendEmail({
    to:      normalizedEmail,
    subject: "You're on the Kreya waitlist",
    html:    waitlistEmailHtml(normalizedEmail),
  }).then(() => console.log('[register] waitlist email sent to', normalizedEmail))
    .catch(err => console.error('[register] waitlist email FAILED:', err.message));

  // Admin email notification
  if (ADMIN_EMAIL) {
    const adminSecret = process.env.ADMIN_SECRET ?? '';
    const urlToken    = adminUrlToken(adminSecret);
    const adminUrl    = `${APP_URL}/admin?secret=${urlToken}`;
    sendEmail({
      to:      ADMIN_EMAIL,
      subject: `🔔 New Kreya registration: ${normalizedEmail}`,
      html:    adminRegistrationEmailHtml(normalizedEmail, normalizedPhone, adminUrl),
    }).then(() => console.log('[register] admin email sent'))
      .catch(err => console.error('[register] admin email FAILED:', err.message));
  } else {
    console.warn('[register] ADMIN_EMAIL not set — skipping admin email');
  }

  // Ping admin on WhatsApp (fire-and-forget)
  if (ADMIN_PHONE) {
    const adminSecret = process.env.ADMIN_SECRET ?? '';
    const urlToken    = adminUrlToken(adminSecret);
    sendText(
      ADMIN_PHONE,
      `🔔 *New Kreya registration*\n\n📧 ${normalizedEmail}${normalizedPhone ? `\n📱 +${normalizedPhone}` : ''}\n\n👉 ${APP_URL}/admin?secret=${urlToken}`
    ).then(r => {
      if (r?.error) console.error('[register] admin WA FAILED:', JSON.stringify(r.error));
      else console.log('[register] admin WA sent');
    }).catch(err => console.error('[register] admin WA error:', err.message));
  } else {
    console.warn('[register] ADMIN_WHATSAPP_PHONE not set — skipping WA ping');
  }

  return NextResponse.json({ ok: true });
}
