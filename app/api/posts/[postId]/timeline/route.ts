import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

function verifyEditToken(postId: string, phone: string, token: string): boolean {
  const expected = createHash('sha256')
    .update(`${postId}:${phone}:${process.env.SUPABASE_SERVICE_ROLE_KEY}`)
    .digest('hex')
    .slice(0, 32);
  return expected === token;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ postId: string }> }) {
  const { postId } = await params;
  const token  = req.nextUrl.searchParams.get('t') ?? '';
  const phone  = req.nextUrl.searchParams.get('phone') ?? '';

  const authHeader = req.headers.get('authorization') ?? '';
  const isAdmin    = authHeader === `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`;
  const isUser     = phone && verifyEditToken(postId, phone, token);

  if (!isAdmin && !isUser) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { data: post } = await getSupabase()
    .from('pending_posts')
    .select('id, whatsapp_phone, image_url, timeline_json, caption')
    .eq('id', postId)
    .maybeSingle();

  if (!post) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const phones = phone.startsWith('+') ? [phone, phone.slice(1)] : [phone, `+${phone}`];
  if (!isAdmin && !phones.includes(post.whatsapp_phone)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  return NextResponse.json({
    timeline:   post.timeline_json ?? null,
    previewUrl: post.image_url ?? '',
    caption:    post.caption ?? '',
  });
}
