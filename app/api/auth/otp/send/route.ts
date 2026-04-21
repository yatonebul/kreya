import { NextRequest, NextResponse } from 'next/server';
import { randomInt } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { hashOtp } from '@/lib/session';
import { sendText } from '@/lib/whatsapp-send';

function db() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function POST(req: NextRequest) {
  const { phone } = await req.json() as { phone?: string };
  if (!phone) return NextResponse.json({ error: 'phone required' }, { status: 400 });

  const supabase  = db();
  const windowAgo = new Date(Date.now() - 10 * 60_000).toISOString();

  // Rate limit: max 3 OTPs per phone per 10 minutes
  const { count } = await supabase
    .from('otp_codes')
    .select('*', { count: 'exact', head: true })
    .eq('phone', phone)
    .gte('created_at', windowAgo);

  if ((count ?? 0) >= 3) {
    return NextResponse.json({ error: 'Too many codes requested. Wait a few minutes.' }, { status: 429 });
  }

  const code      = String(randomInt(100000, 1000000)); // 6 digits
  const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();

  await supabase.from('otp_codes').insert({ phone, code_hash: hashOtp(code), expires_at: expiresAt });

  await sendText(
    phone,
    `Your Kreya verification code: *${code}*\n\nValid for 10 minutes. Don't share this with anyone.`
  );

  return NextResponse.json({ ok: true });
}
