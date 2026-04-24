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
  const supabase = db();

  const { data: post } = await supabase
    .from('pending_posts')
    .select('id, whatsapp_phone, sibling_id, state')
    .eq('id', id)
    .maybeSingle();

  if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 });

  const sessionPhone = session.phone;
  const linkedPhones = [sessionPhone, `+${sessionPhone}`, sessionPhone.replace(/^\+/, '')];
  if (!linkedPhones.includes(post.whatsapp_phone)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  await db().from('pending_posts').update({ state: 'discarded' }).eq('id', id);
  if (post.sibling_id) {
    await db().from('pending_posts').update({ state: 'discarded' }).eq('id', post.sibling_id);
  }

  return NextResponse.json({ ok: true });
}
