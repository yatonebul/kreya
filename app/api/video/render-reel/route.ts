import { after } from 'next/server';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { sendText, sendVideoMessage, sendPostPreview } from '@/lib/whatsapp-send';

// Heavy FFmpeg work — needs real headroom on Vercel Pro (max 300 s)
export const maxDuration = 300;

if (ffmpegPath) ffmpeg.setFfmpegPath(ffmpegPath);

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}


// Single-pass Ken Burns + drawtext at 720×1280 (much faster than 1080p + separate burn pass)
async function renderWithCaption(imageUrl: string, caption: string): Promise<string> {
  if (!ffmpegPath) throw new Error('ffmpeg binary not found — check includeFiles in vercel.json');
  const inPath  = path.join(os.tmpdir(), `kreya-src-${Date.now()}.jpg`);
  const outPath = path.join(os.tmpdir(), `kreya-reel-${Date.now()}.mp4`);

  try {
    const res = await fetch(imageUrl);
    if (!res.ok) throw new Error(`Image download failed: ${res.status}`);
    await fs.writeFile(inPath, Buffer.from(await res.arrayBuffer()));

    // zoompan is too CPU-intensive for Vercel Lambda (times out at 300 s).
    // Static image→MP4 with ultrafast preset renders in ~2 s.
    // Ken Burns will be wired to a GPU worker (Modal/Replicate) in a future pass.
    const vf = [
      'scale=720:1280:force_original_aspect_ratio=decrease',
      'pad=720:1280:(ow-iw)/2:(oh-ih)/2:black',
      'setsar=1',
    ].join(',');

    await new Promise<void>((resolve, reject) => {
      ffmpeg()
        .input(inPath)
        .inputOptions(['-loop', '1', '-t', '5'])
        .videoFilter(vf)
        .outputOptions([
          '-c:v', 'libx264',
          '-preset', 'ultrafast',
          '-crf', '26',
          '-pix_fmt', 'yuv420p',
          '-movflags', '+faststart',
          '-an',
        ])
        .output(outPath)
        .on('end', () => resolve())
        .on('error', (err: Error) => reject(new Error(`FFmpeg: ${err.message}`)))
        .run();
    });

    const buf = await fs.readFile(outPath);
    const supabase = getSupabase();
    const storagePath = `videos/reel-${Date.now()}-${Math.random().toString(36).slice(2)}.mp4`;
    const { data, error } = await supabase.storage
      .from('user-media')
      .upload(storagePath, buf, { contentType: 'video/mp4', upsert: false });

    if (error) throw new Error(`Storage upload: ${error.message}`);
    return supabase.storage.from('user-media').getPublicUrl(data.path).data.publicUrl;
  } finally {
    await Promise.allSettled([fs.unlink(inPath).catch(() => {}), fs.unlink(outPath).catch(() => {})]);
  }
}

export async function POST(req: NextRequest) {
  // Simple internal-only gate — callers must supply the service-role key as bearer
  const auth = req.headers.get('authorization') ?? '';
  if (auth !== `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { phone, postId, imageUrl, caption } = await req.json();
  if (!phone || !postId || !imageUrl || !caption) {
    return NextResponse.json({ error: 'missing fields' }, { status: 400 });
  }

  const supabase = getSupabase();

  // Return 200 immediately so the webhook's awaited fetch completes fast.
  // after() keeps the Lambda alive while FFmpeg does its work.
  after(async () => {
    try {
      const videoUrl = await renderWithCaption(imageUrl, caption);

      await supabase.from('pending_posts')
        .update({ state: 'pending_approval', image_url: videoUrl })
        .eq('id', postId);

      await sendVideoMessage(phone, videoUrl);
      await sendPostPreview(phone, videoUrl, caption, postId, true, 'reels');
    } catch (err: any) {
      console.error('[render-reel] failed:', err.message);
      await supabase.from('pending_posts').update({ state: 'discarded' }).eq('id', postId);
      await sendText(phone, '⚠️ Reel rendering failed — please try again.').catch(() => {});
    }
  });

  return NextResponse.json({ ok: true });
}
