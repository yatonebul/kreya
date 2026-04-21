import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function db() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function POST(req: NextRequest) {
  const { email, phone } = await req.json() as { email?: string; phone?: string };
  if (!email || !phone) return NextResponse.json({ error: 'email and phone required' }, { status: 400 });

  const normalized = phone.trim().replace(/^\+/, '');
  const supabase   = db();

  const { error } = await supabase
    .from('email_registrations')
    .update({ phone: normalized })
    .eq('email', email.toLowerCase().trim());

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
