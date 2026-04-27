import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendInviteTemplate, WA_RECIPIENT_NOT_ALLOWED } from '@/lib/whatsapp-send';

const WA_NUMBER = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? '';

function getSupabase() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

function normalizePhone(raw: string): string {
  const cleaned = raw.replace(/[\s\-().]/g, '');
  return cleaned.startsWith('+') ? cleaned : `+${cleaned}`;
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const { phone } = body;

  if (!phone?.trim()) {
    return NextResponse.json({ error: 'Phone required' }, { status: 400 });
  }

  const normalized = normalizePhone(phone.trim());
  const waLink = WA_NUMBER
    ? `https://wa.me/${WA_NUMBER.replace('+', '')}?text=Hi+Kreya!`
    : null;

  await getSupabase()
    .from('waitlist_entries')
    .insert({ phone: normalized })
    .then(() => {}, () => {}); // ignore duplicate

  const result = await sendInviteTemplate(normalized);

  // Dev-mode (131030): the bot can't message numbers outside the test
  // allowlist until the Meta app is published via App Review. Don't
  // surface the raw Meta error — return the wa.me deep link so the
  // landing page can fall back to "tap here to start the chat yourself".
  if (!result.ok && result.code === WA_RECIPIENT_NOT_ALLOWED) {
    return NextResponse.json({
      success: true,
      messageSent: false,
      waLink,
      info: 'dev_allowlist',
    });
  }

  return NextResponse.json({ success: true, messageSent: result.ok, waLink });
}
