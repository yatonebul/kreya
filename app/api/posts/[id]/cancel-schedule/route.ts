import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { verifySession, SESSION_COOKIE } from '@/lib/session';

function db() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const jar   = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySession(token) : null;
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { id } = await params;
  const { data: post } = await db().from('pending_posts').select('whatsapp_phone, state').eq('id', id).maybeSingle();
  if (!post) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const sp = session.phone;
  const linked = [sp, `+${sp}`, sp.replace(/^\+/, '')];
  if (!linked.includes(post.whatsapp_phone)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  if (post.state !== 'scheduled') return NextResponse.json({ error: 'not scheduled' }, { status: 400 });

  await db().from('pending_posts').update({ state: 'discarded' }).eq('id', id);
  return NextResponse.json({ ok: true });
}
