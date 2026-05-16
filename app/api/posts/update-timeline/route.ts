import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';
import { after } from 'next/server';
import { renderTimeline } from '@/lib/timeline-renderer';
import { getMusicForCaption } from '@/lib/mood-music';
import type { KreyaTimeline } from '@/lib/timeline-schema';
import { sendText, sendVideoMessage, sendPreviewOptions } from '@/lib/whatsapp-send';

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
  const { postId, token, phone, timeline, musicPreference } = await req.json() as {
    postId:          string;
    token:           string;
    phone:           string;
    timeline:        KreyaTimeline;
    musicPreference?: string;
  };

  if (!postId || !phone || !timeline) {
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
    .select('id, whatsapp_phone, state, caption')
    .eq('id', postId)
    .maybeSingle();

  if (!post) return NextResponse.json({ error: 'post not found' }, { status: 404 });

  const phones = phone.startsWith('+') ? [phone, phone.slice(1)] : [phone, `+${phone}`];
  if (!isAdmin && !phones.includes(post.whatsapp_phone)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  // Always render at preview resolution during the editing loop
  let previewTimeline: KreyaTimeline = { ...timeline, resolution: 'preview' };

  // Swap music if a new preference was sent from the web editor
  if (musicPreference) {
    if (musicPreference === 'none') {
      const { audio: _drop, ...tracks } = previewTimeline.tracks as any;
      previewTimeline = { ...previewTimeline, tracks };
    } else {
      const music = await getMusicForCaption(
        (post.caption ?? '') + (musicPreference === 'calm' ? ' calm peaceful' : ''),
      ).catch(() => null);
      if (music?.musicUrl) {
        previewTimeline = {
          ...previewTimeline,
          tracks: { ...previewTimeline.tracks, audio: { src: music.musicUrl, volume: 0.4, fadeOutAt: Math.max(0, previewTimeline.totalDuration - 2) } },
        };
      }
    }
  }

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

  // Send updated preview to WhatsApp so user can approve/publish
  const waPhone = post.whatsapp_phone;
  if (waPhone) {
    const appUrl  = process.env.NEXT_PUBLIC_APP_URL ?? '';
    const editToken = createHash('sha256')
      .update(`${postId}:${phone}:${process.env.SUPABASE_SERVICE_ROLE_KEY}`)
      .digest('hex').slice(0, 32);
    const editUrl = appUrl
      ? `${appUrl}/edit/${postId}?t=${editToken}&phone=${encodeURIComponent(phone)}`
      : undefined;
    after(async () => {
      await sendText(waPhone, '✏️ *Preview updated!* Here\'s your edited reel:');
      await sendVideoMessage(waPhone, publicUrl);
      await sendPreviewOptions(waPhone, postId, publicUrl, post.caption ?? undefined, editUrl);
    });
  }

  return NextResponse.json({ previewUrl: publicUrl });
}
