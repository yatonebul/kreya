// Hard-codes caption text onto a video using FFmpeg drawtext filter.
// Output is IG/TikTok ready: white text on a semi-transparent black bar,
// centered horizontally, sitting 60px above the bottom edge.

import { createClient } from '@supabase/supabase-js';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

if (ffmpegPath) ffmpeg.setFfmpegPath(ffmpegPath);

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// FFmpeg drawtext requires these characters to be escaped
function escapeDrawtext(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/:/g, '\\:')
    .replace(/%/g, '\\%');
}

// Wrap text into lines of at most `maxChars` characters, breaking on word boundaries.
function wrapLines(text: string, maxChars = 42): string {
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
  // FFmpeg drawtext uses \n for line breaks in the text parameter
  return lines.join('\n');
}

export type BurnOptions = {
  fontSize?: number;    // default 40
  maxCharsPerLine?: number; // default 42
};

export type BurnResult = {
  publicUrl: string;
};

export async function burnCaption(
  videoUrl: string,
  captionText: string,
  opts: BurnOptions = {},
): Promise<BurnResult> {
  const { fontSize = 40, maxCharsPerLine = 42 } = opts;
  const wrapped = escapeDrawtext(wrapLines(captionText, maxCharsPerLine));

  const ext = videoUrl.match(/\.(\w{2,4})(?:\?|$)/)?.[1] ?? 'mp4';
  const inPath  = path.join(os.tmpdir(), `kreya-in-${Date.now()}.${ext}`);
  const outPath = path.join(os.tmpdir(), `kreya-burned-${Date.now()}.mp4`);

  try {
    // Download source video
    const res = await fetch(videoUrl);
    if (!res.ok) throw new Error(`Download failed: ${videoUrl} → ${res.status}`);
    await fs.writeFile(inPath, Buffer.from(await res.arrayBuffer()));

    // drawtext filter: centred text on a semi-transparent pill at bottom
    const drawtextFilter =
      `drawtext=` +
      `text='${wrapped}':` +
      `fontsize=${fontSize}:` +
      `fontcolor=white:` +
      `font=sans-serif:` +
      `line_spacing=8:` +
      `box=1:` +
      `boxcolor=black@0.55:` +
      `boxborderw=16:` +
      `x=(w-text_w)/2:` +
      `y=h-text_h-60`;

    await new Promise<void>((resolve, reject) => {
      ffmpeg(inPath)
        .videoFilter(drawtextFilter)
        .outputOptions([
          '-c:v', 'libx264',
          '-preset', 'fast',
          '-crf', '22',
          '-pix_fmt', 'yuv420p',
          '-movflags', '+faststart',
          '-c:a', 'copy',
        ])
        .output(outPath)
        .on('end', () => resolve())
        .on('error', (err) => reject(new Error(`FFmpeg caption burn: ${err.message}`)))
        .run();
    });

    const burned = await fs.readFile(outPath);
    const storagePath = `videos/captioned-${Date.now()}-${Math.random().toString(36).slice(2)}.mp4`;
    const supabase = getSupabase();

    const { data, error } = await supabase.storage
      .from('user-media')
      .upload(storagePath, burned, { contentType: 'video/mp4', upsert: false });

    if (error) throw new Error(`Storage upload failed: ${error.message}`);

    const publicUrl = supabase.storage.from('user-media').getPublicUrl(data.path).data.publicUrl;
    console.log('[caption-burner] burned →', publicUrl);
    return { publicUrl };
  } finally {
    await Promise.allSettled([
      fs.unlink(inPath).catch(() => {}),
      fs.unlink(outPath).catch(() => {}),
    ]);
  }
}
