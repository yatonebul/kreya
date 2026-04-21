import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendInviteTemplate } from '@/lib/whatsapp-send';

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
    .upsert({ phone: normalized }, { onConflict: 'phone' })
    .catch(() => {});

  if (waLink) {
    await sendInviteTemplate(normalized, waLink).catch(() => {});
  }

  return NextResponse.json({ success: true, waLink });
}
