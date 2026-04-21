import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendText } from '@/lib/whatsapp-send';
import { adminUrlToken } from '@/lib/session';

const ADMIN_SECRET = process.env.ADMIN_SECRET ?? '';
const ADMIN_PHONE  = process.env.ADMIN_WHATSAPP_PHONE ?? '';
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
  const { data: reg } = await supabase
    .from('email_registrations')
    .select('email, status')
    .eq('id', id)
    .maybeSingle();

  if (!reg) return NextResponse.json({ error: 'Not found.' }, { status: 404 });

  await supabase.from('email_registrations').update({ status: 'rejected' }).eq('id', id);

  if (ADMIN_PHONE) {
    const urlToken  = adminUrlToken(ADMIN_SECRET);
    const wasLabel  = reg.status === 'approved' ? ' (was approved)' : '';
    sendText(
      ADMIN_PHONE,
      `🚫 *Rejected: ${reg.email}*${wasLabel}\n\n👉 ${APP_URL}/admin?secret=${urlToken}`
    ).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
