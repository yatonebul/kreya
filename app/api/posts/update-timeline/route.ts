import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';
import { renderTimeline } from '@/lib/timeline-renderer';
import type { KreyaTimeline } from '@/lib/timeline-schema';

export const maxDuration = 120;

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

export async function POST(req: NextRequest) {
  const { postId, token, phone, timeline } = await req.json() as {
    postId:   string;
    token:    string;
    phone:    string;
    timeline: KreyaTimeline;
  };

  if (!postId || !token || !phone || !timeline) {
    return NextResponse.json({ error: 'missing fields' }, { status: 400 });
  }

  // Accept either the per-user edit token or admin service role header
  const authHeader = req.headers.get('authorization') ?? '';
  const isAdmin    = authHeader === `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`;
  const isUser     = verifyEditToken(postId, phone, token);

  if (!isAdmin && !isUser) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const supabase = getSupabase();

  // Validate the post exists and belongs to this phone
  const { data: post } = await supabase
    .from('pending_posts')
    .select('id, whatsapp_phone, state')
    .eq('id', postId)
    .maybeSingle();

  if (!post) return NextResponse.json({ error: 'post not found' }, { status: 404 });

  const phones = phone.startsWith('+') ? [phone, phone.slice(1)] : [phone, `+${phone}`];
  if (!isAdmin && !phones.includes(post.whatsapp_phone)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  // Always render at preview resolution during the editing loop
  const previewTimeline: KreyaTimeline = { ...timeline, resolution: 'preview' };

  // Persist updated timeline
  await supabase
    .from('pending_posts')
    .update({ timeline_json: previewTimeline, render_resolution: 'preview' })
    .eq('id', postId);

  // Render
  const { publicUrl } = await renderTimeline(previewTimeline);

  // Store new preview URL
  await supabase
    .from('pending_posts')
    .update({ image_url: publicUrl })
    .eq('id', postId);

  return NextResponse.json({ previewUrl: publicUrl });
}
