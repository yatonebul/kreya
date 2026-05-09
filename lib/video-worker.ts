import { createClient } from '@supabase/supabase-js';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

if (ffmpegPath) ffmpeg.setFfmpegPath(ffmpegPath);

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export type MediaItem = {
  url: string;
  type: 'image' | 'video';
};

export type WorkerOptions = {
  aspectRatio?: '9:16' | '1:1' | '16:9';
  durationPerPhoto?: number; // seconds per still image, default 4
  musicUrl?: string;
};

export type WorkerResult = {
  publicUrl: string;
  durationSeconds: number;
};

const DIMS = {
  '9:16': { w: 1080, h: 1920 },
  '1:1':  { w: 1080, h: 1080 },
  '16:9': { w: 1920, h: 1080 },
} as const;

async function downloadTmp(url: string, ext: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed ${url} → ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const p = path.join(os.tmpdir(), `kreya-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`);
  await fs.writeFile(p, buf);
  return p;
}

function extFromUrl(url: string, type: 'image' | 'video'): string {
  const m = url.match(/\.(\w{2,4})(?:\?|$)/);
  return m ? m[1] : type === 'image' ? 'jpg' : 'mp4';
}

// Slow zoom-in: 1.0 → 1.5 over `frames` frames.
// We pre-scale 2× so zoompan never exceeds source resolution.
function kenBurnsFilter(idx: number, w: number, h: number, frames: number): string {
  const zStep = (0.5 / frames).toFixed(6);
  return (
    `[${idx}:v]scale=${w * 2}:${h * 2}:force_original_aspect_ratio=increase,` +
    `crop=${w * 2}:${h * 2},` +
    `zoompan=z='min(zoom+${zStep},1.5)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${w}x${h}:fps=25,` +
    `setsar=1[v${idx}]`
  );
}

// Scale-and-pad video clip to fill target canvas without cropping content.
function videoScaleFilter(idx: number, w: number, h: number): string {
  return (
    `[${idx}:v]scale=${w}:${h}:force_original_aspect_ratio=decrease,` +
    `pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,setsar=1[v${idx}]`
  );
}

export async function renderVideo(
  items: MediaItem[],
  opts: WorkerOptions = {},
): Promise<WorkerResult> {
  if (!items.length) throw new Error('renderVideo: no media items');

  const { aspectRatio = '9:16', durationPerPhoto = 4, musicUrl } = opts;
  const { w, h } = DIMS[aspectRatio];
  const outPath = path.join(os.tmpdir(), `kreya-out-${Date.now()}.mp4`);
  const tmpFiles: string[] = [];

  try {
    const localPaths: string[] = [];
    for (const item of items) {
      const p = await downloadTmp(item.url, extFromUrl(item.url, item.type));
      localPaths.push(p);
      tmpFiles.push(p);
    }

    let musicPath: string | null = null;
    if (musicUrl) {
      musicPath = await downloadTmp(musicUrl, 'mp3');
      tmpFiles.push(musicPath);
    }

    const totalDuration = items.reduce(
      (acc, item) => acc + (item.type === 'image' ? durationPerPhoto : 10),
      0,
    );

    await new Promise<void>((resolve, reject) => {
      const cmd = ffmpeg();

      // Add each input — images need -loop 1 so they produce frames
      items.forEach((item, i) => {
        if (item.type === 'image') {
          cmd.input(localPaths[i]).inputOptions(['-loop', '1', '-t', String(durationPerPhoto)]);
        } else {
          cmd.input(localPaths[i]);
        }
      });
      if (musicPath) cmd.input(musicPath);

      // Build filter_complex
      const filterParts: string[] = [];
      const segLabels: string[] = [];

      items.forEach((item, i) => {
        if (item.type === 'image') {
          filterParts.push(kenBurnsFilter(i, w, h, durationPerPhoto * 25));
        } else {
          filterParts.push(videoScaleFilter(i, w, h));
        }
        segLabels.push(`[v${i}]`);
      });

      filterParts.push(`${segLabels.join('')}concat=n=${items.length}:v=1:a=0[vout]`);

      if (musicPath) {
        // Loop music to cover the full duration, fade to silence at end
        filterParts.push(
          `[${items.length}:a]aloop=loop=-1:size=2147483647,` +
          `afade=t=out:st=${Math.max(0, totalDuration - 2)}:d=2,` +
          `volume=0.4[aout]`,
        );
      }

      const mapArgs = ['-map', '[vout]'];
      if (musicPath) mapArgs.push('-map', '[aout]');

      cmd
        .complexFilter(filterParts.join(';'))
        .outputOptions([
          ...mapArgs,
          '-c:v', 'libx264',
          '-preset', 'fast',
          '-crf', '23',
          '-pix_fmt', 'yuv420p',
          '-movflags', '+faststart',
          ...(musicPath
            ? ['-c:a', 'aac', '-b:a', '128k', '-shortest']
            : ['-an']),
        ])
        .output(outPath)
        .on('end', () => resolve())
        .on('error', (err: Error) => reject(new Error(`FFmpeg: ${err.message}`)))
        .run();
    });

    const rendered = await fs.readFile(outPath);
    tmpFiles.push(outPath);

    const storagePath = `videos/${Date.now()}-${Math.random().toString(36).slice(2)}.mp4`;
    const supabase = getSupabase();
    const { data, error } = await supabase.storage
      .from('user-media')
      .upload(storagePath, rendered, { contentType: 'video/mp4', upsert: false });

    if (error) throw new Error(`Storage upload failed: ${error.message}`);

    const publicUrl = supabase.storage.from('user-media').getPublicUrl(data.path).data.publicUrl;
    console.log('[video-worker] rendered →', publicUrl, `(${totalDuration}s)`);
    return { publicUrl, durationSeconds: totalDuration };
  } finally {
    await Promise.allSettled(tmpFiles.map(p => fs.unlink(p).catch(() => {})));
  }
}
