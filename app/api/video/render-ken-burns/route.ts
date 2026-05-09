import { after } from 'next/server';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendText, sendVideoMessage, sendPostPreview, sendReelSurfaceToggle } from '@/lib/whatsapp-send';
import { getMusicForCaption } from '@/lib/mood-music';

// Ken Burns rendering via Modal (GPU)
export const maxDuration = 300;

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function renderKenBurnsViaModal(
  imageUrl: string,
  duration: number = 5,
  zoomLevel: number = 1.5,
  aspectRatio: '9:16' | '1:1' | '16:9' = '9:16',
  musicUrl?: string,
): Promise<string> {
  const modalUrl = process.env.MODAL_KEN_BURNS_URL;
  if (!modalUrl) throw new Error('MODAL_KEN_BURNS_URL not configured');

  const res = await fetch(modalUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image_url: imageUrl,
      duration,
      zoom_level: zoomLevel,
      aspect_ratio: aspectRatio,
      music_url: musicUrl,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Modal Ken Burns failed: ${res.status} ${text}`);
  }

  const result = await res.json();
  if (result.error) throw new Error(`Modal error: ${result.error}`);
  if (!result.video_b64) throw new Error('No video returned from Modal');

  // Decode base64 to buffer
  const videoBuffer = Buffer.from(result.video_b64, 'base64');
  const supabase = getSupabase();
  const storagePath = `videos/ken-burns-${Date.now()}-${Math.random().toString(36).slice(2)}.mp4`;

  const { data, error } = await supabase.storage
    .from('user-media')
    .upload(storagePath, videoBuffer, { contentType: 'video/mp4', upsert: false });

  if (error) throw new Error(`Storage upload: ${error.message}`);
  return supabase.storage.from('user-media').getPublicUrl(data.path).data.publicUrl;
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization') ?? '';
  if (auth !== `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { phone, postId, imageUrl, caption, duration, zoomLevel, aspectRatio } =
    await req.json();
  if (!phone || !postId || !imageUrl || !caption) {
    return NextResponse.json({ error: 'missing fields' }, { status: 400 });
  }

  const supabase = getSupabase();

  after(async () => {
    try {
      // Detect mood from caption and select music
      const music = await getMusicForCaption(caption).catch(() => null);
      console.log('[render-ken-burns] mood music:', music?.title ?? 'none');

      const videoUrl = await renderKenBurnsViaModal(
        imageUrl,
        duration ?? 5,
        zoomLevel ?? 1.5,
        aspectRatio ?? '9:16',
        music?.musicUrl,
      );

      await supabase
        .from('pending_posts')
        .update({ state: 'pending_approval', image_url: videoUrl })
        .eq('id', postId);

      await sendVideoMessage(phone, videoUrl);
      await sendPostPreview(phone, videoUrl, caption, postId, true, 'reels');
      await sendReelSurfaceToggle(phone, postId, 'reels');
    } catch (err: any) {
      console.error('[render-ken-burns] failed:', err.message);
      await supabase.from('pending_posts').update({ state: 'discarded' }).eq('id', postId);
      await sendText(phone, '⚠️ Reel rendering failed — please try again.').catch(() => {});
    }
  });

  return NextResponse.json({ ok: true });
}
