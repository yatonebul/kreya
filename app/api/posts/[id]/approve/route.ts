import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { verifySession, SESSION_COOKIE } from '@/lib/session';
import { publishToInstagram } from '@/lib/instagram-publish';

function db() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
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
    .select('id, whatsapp_phone, caption, image_url, is_video, sibling_id, state')
    .eq('id', id)
    .maybeSingle();

  if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 });

  // Verify post belongs to session's phone (or linked phone)
  const sessionPhone = session.phone;
  const linkedPhones = [sessionPhone, `+${sessionPhone}`, sessionPhone.replace(/^\+/, '')];
  if (!linkedPhones.includes(post.whatsapp_phone)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  if (post.state !== 'pending_approval') {
    return NextResponse.json({ error: `Post is ${post.state}, not pending approval` }, { status: 400 });
  }

  try {
    const result = await publishToInstagram(
      post.whatsapp_phone,
      post.caption,
      post.image_url,
      post.is_video ?? false
    );

    await supabase.from('pending_posts')
      .update({ state: 'published', ig_post_id: result.postId, ig_post_url: result.postUrl ?? null })
      .eq('id', id);

    if (post.sibling_id) {
      await supabase.from('pending_posts').update({ state: 'discarded' }).eq('id', post.sibling_id);
    }

    return NextResponse.json({ ok: true, postUrl: result.postUrl });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
