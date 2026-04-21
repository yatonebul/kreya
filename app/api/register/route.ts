import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function db() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function POST(req: NextRequest) {
  const { email, phone } = await req.json() as { email?: string; phone?: string };

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Valid email required.' }, { status: 400 });
  }

  const normalizedPhone = phone ? phone.trim().replace(/^\+/, '') : null;

  const { error } = await db().from('email_registrations').insert({
    email:  email.toLowerCase().trim(),
    phone:  normalizedPhone || null,
    status: 'pending',
  });

  if (error) {
    if (error.code === '23505') {
      // already registered — don't reveal whether approved or pending
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
