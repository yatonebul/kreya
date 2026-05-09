import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const ADMIN_SECRET = process.env.ADMIN_SECRET ?? '';

function db() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

function phoneVariants(phone: string): string[] {
  return phone.startsWith('+') ? [phone, phone.slice(1)] : [phone, `+${phone}`];
}

export async function POST(req: NextRequest) {
  if (!ADMIN_SECRET || req.headers.get('x-admin-secret') !== ADMIN_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { phone, plan } = await req.json() as { phone?: string; plan?: string };
  if (!phone || !plan) return NextResponse.json({ error: 'phone and plan required' }, { status: 400 });
  if (!['free', 'pro', 'agency'].includes(plan)) {
    return NextResponse.json({ error: 'plan must be free | pro | agency' }, { status: 400 });
  }

  const { error } = await db()
    .from('user_profiles')
    .update({ plan })
    .in('whatsapp_phone', phoneVariants(phone));

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, phone, plan });
}
