import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';
import { after } from 'next/server';
import { getMusicForCaption } from '@/lib/mood-music';
import { buildAtomicTimeline } from '@/lib/media-buffer';
import { renderTimeline } from '@/lib/timeline-renderer';
import { sendText, sendVideoMessage, sendPostPreview } from '@/lib/whatsapp-send';
import type { KenBurnsStyle, ColorGrade, CaptionTrack } from '@/lib/timeline-schema';

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

export async function POST(req: NextRequest, { params }: { params: Promise<{ postId: string }> }) {
  const { postId } = await params;
  const {
    token, phone,
    animationStyle, musicPreference, colorGrade, bgStyle,
    captionText, captionPosition, postCaption,
  } = await req.json() as {
    token?: string; phone?: string;
    animationStyle?: KenBurnsStyle; musicPreference?: string;
    colorGrade?: ColorGrade; bgStyle?: 'blur' | 'black';
    captionText?: string; captionPosition?: CaptionTrack['position'];
    postCaption?: string;
  };

  const authHeader = req.headers.get('authorization') ?? '';
  const isAdmin = authHeader === `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`;
  const isUser  = phone && token && verifyEditToken(postId, phone, token);
  if (!isAdmin && !isUser) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const supabase = getSupabase();
  const { data: post } = await supabase
    .from('pending_posts')
    .select('id, user_image_url, caption, whatsapp_phone')
    .eq('id', postId)
    .maybeSingle();

  if (!post) return NextResponse.json({ error: 'not found' }, { status: 404 });

  if (!isAdmin && phone) {
    const variants = phone.startsWith('+') ? [phone, phone.slice(1)] : [phone, `+${phone}`];
    if (!variants.includes(post.whatsapp_phone)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const waPhone          = post.whatsapp_phone as string | null;
  const effectiveCaption = postCaption ?? post.caption ?? '';

  // All heavy work in after() — respond immediately to avoid Hobby 60s limit
  after(async () => {
    try {
      let musicUrl: string | undefined;
      if (musicPreference && musicPreference !== 'none') {
        const music = await getMusicForCaption(
          (post.caption ?? '') + (musicPreference === 'calm' ? ' calm peaceful' : '')
        ).catch(() => null);
        musicUrl = music?.musicUrl;
      }

      const timeline = buildAtomicTimeline(
        [{ url: post.user_image_url, type: 'image' }],
        {
          resolution:  'preview',
          aspectRatio: '9:16',
          colorGrade,
          bgStyle:     bgStyle ?? 'blur',
          musicUrl,
          captionText: captionText || undefined,
        },
      );

      if (animationStyle && timeline.tracks.video[0]) {
        timeline.tracks.video[0].effect = { type: 'ken-burns', style: animationStyle, zoomStart: 1.0, zoomEnd: 1.3 };
      }

      if (captionPosition && timeline.tracks.captions?.length) {
        timeline.tracks.captions = timeline.tracks.captions.map(c => ({ ...c, position: captionPosition }));
      }

      const { publicUrl } = await renderTimeline(timeline);

      await supabase.from('pending_posts')
        .update({ image_url: publicUrl, timeline_json: timeline, ...(postCaption !== undefined ? { caption: postCaption } : {}) })
        .eq('id', postId);

      if (waPhone) {
        await sendText(waPhone, '✏️ *Preview updated!* Here\'s your updated reel:');
        await sendVideoMessage(waPhone, publicUrl);
        await sendPostPreview(waPhone, publicUrl, effectiveCaption, postId, true, 'reels');
      }
    } catch (err) {
      console.error('[rerender] background render failed:', err);
      if (waPhone) {
        await sendText(waPhone, '⚠️ Render ran into trouble — tap Edit in the web editor to try again.').catch(() => {});
      }
    }
  });

  return NextResponse.json({ status: 'rendering' }, { status: 202 });
}
