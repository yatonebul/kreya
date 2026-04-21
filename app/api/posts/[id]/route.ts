import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { verifySession, SESSION_COOKIE } from '@/lib/session';

function db() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

async function getAuthenticatedPost(req: NextRequest, id: string) {
  const jar   = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySession(token) : null;
  if (!session) return { error: 'unauthorized', status: 401 };

  const { data: post } = await db().from('pending_posts').select('*').eq('id', id).maybeSingle();
  if (!post) return { error: 'not found', status: 404 };

  const sp = session.phone;
  const linked = [sp, `+${sp}`, sp.replace(/^\+/, '')];
  if (!linked.includes(post.whatsapp_phone)) return { error: 'forbidden', status: 403 };

  return { post, session };
}

// PATCH — update caption
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await getAuthenticatedPost(req, id);
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status });

  const { caption } = await req.json() as { caption?: string };
  if (!caption?.trim()) return NextResponse.json({ error: 'caption required' }, { status: 400 });

  await db().from('pending_posts').update({ caption: caption.trim() }).eq('id', id);
  return NextResponse.json({ ok: true });
}
