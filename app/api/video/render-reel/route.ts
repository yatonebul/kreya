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
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// Escape special chars for FFmpeg drawtext filter
function escapeDrawtext(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/:/g, '\\:')
    .replace(/%/g, '\\%');
}

function wrapLines(text: string, maxChars = 38): string {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if ((current + ' ' + word).trim().length > maxChars && current.length) {
      lines.push(current.trim());
      current = word;
    } else {
      current = (current + ' ' + word).trim();
    }
  }
  if (current) lines.push(current.trim());
  return lines.join('\n');
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

    const wrapped = escapeDrawtext(wrapLines(caption, 38));

    // 4 s × 25 fps = 100 frames; zoom step = 0.5 / 100 = 0.005
    const vf = [
      'scale=1440:2560:force_original_aspect_ratio=increase',
      'crop=1440:2560',
      "zoompan=z='min(zoom+0.005,1.5)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=100:s=720x1280:fps=25",
      'setsar=1',
      `drawtext=text='${wrapped}':fontsize=30:fontcolor=white:font=sans-serif:line_spacing=6:box=1:boxcolor=black@0.55:boxborderw=14:x=(w-text_w)/2:y=h-text_h-50`,
    ].join(',');

    await new Promise<void>((resolve, reject) => {
      ffmpeg()
        .input(inPath)
        .inputOptions(['-loop', '1', '-t', '4'])
        .videoFilter(vf)
        .outputOptions([
          '-c:v', 'libx264',
          '-preset', 'fast',
          '-crf', '24',
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
