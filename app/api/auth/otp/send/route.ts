import { NextRequest, NextResponse } from 'next/server';
import { randomInt } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { hashOtp } from '@/lib/session';
import { sendOtpCode } from '@/lib/whatsapp-send';

function db() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
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

  const { error: dbErr } = await supabase.from('otp_codes').insert({ phone, code_hash: hashOtp(code), expires_at: expiresAt });
  if (dbErr) {
    console.error('[OTP send] DB insert failed:', dbErr.message);
    return NextResponse.json({ error: 'Could not create code — database unavailable. Try again shortly.' }, { status: 500 });
  }

  const waResult = await sendOtpCode(phone, code);

  if (waResult?.error) {
    console.error('[OTP send] WhatsApp failed:', JSON.stringify(waResult.error));
    const waMsg = waResult.error.message ?? '';
    const hint  = waMsg.toLowerCase().includes('token') ? ' (access token may be expired)' : '';
    return NextResponse.json({ error: `Could not send WhatsApp message${hint}. Check Vercel logs.` }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
