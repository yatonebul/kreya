import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const ADMIN_SECRET = process.env.ADMIN_SECRET ?? '';

function db() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function POST(req: NextRequest) {
  if (!ADMIN_SECRET || req.headers.get('x-admin-secret') !== ADMIN_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { id } = await req.json() as { id?: string };
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  await db().from('email_registrations').update({ status: 'rejected' }).eq('id', id);
  return NextResponse.json({ ok: true });
}
