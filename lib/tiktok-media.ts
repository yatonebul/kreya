import { createClient } from '@supabase/supabase-js';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { writeFile, unlink, readFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomBytes } from 'crypto';

const execFileAsync = promisify(execFile);

function getSupabase() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

// Downloads a file and returns its buffer + guessed extension.
async function downloadBuffer(url: string): Promise<{ buffer: Buffer; ext: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download asset: ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const ct = res.headers.get('content-type') ?? '';
  const ext = ct.includes('video') ? 'mp4' : ct.includes('jpg') || ct.includes('jpeg') ? 'jpg' : 'mp4';
  return { buffer, ext };
}

// Checks video dimensions using ffprobe. Returns { width, height }.
async function getVideoDimensions(filePath: string): Promise<{ width: number; height: number }> {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v', 'quiet',
    '-print_format', 'json',
    '-show_streams',
    filePath,
  ]);
  const info = JSON.parse(stdout);
  const videoStream = info.streams?.find((s: any) => s.codec_type === 'video');
  return { width: videoStream?.width ?? 0, height: videoStream?.height ?? 0 };
}

// Applies blurred pillar-box background to make any video 1080x1920 (9:16).
// Uses the source frame blurred as the background, with the original content
// centered over it — the standard TikTok treatment for non-vertical content.
async function applyPillarBox(inputPath: string, outputPath: string): Promise<void> {
  await execFileAsync('ffmpeg', [
    '-y',
    '-i', inputPath,
    '-vf', [
      // Scale input to fit within 1080x1920 preserving ratio
      'scale=1080:1920:force_original_aspect_ratio=decrease',
      // Pad to exactly 1080x1920 (adds letterbox/pillarbox bars)
      'pad=1080:1920:(ow-iw)/2:(oh-ih)/2',
      // Overlay blurred version of the padded frame as background
      // Two-pass: blur the padded output and composite the original on top
      'split[main][bg]',
      '[bg]boxblur=20:5,scale=1080:1920[blurred]',
      '[blurred][main]overlay=0:0',
    ].join(','),
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-crf', '23',
    '-c:a', 'aac',
    '-pix_fmt', 'yuv420p',
    outputPath,
  ]);
}

// Ensures the video at `url` is 1080x1920 (9:16) for TikTok.
// Returns the original URL if already correct, or a new Supabase Storage URL
// after FFmpeg pillar-box conversion.
export async function ensureTikTokAspectRatio(url: string): Promise<string> {
  const id = randomBytes(8).toString('hex');
  const tmpIn  = join(tmpdir(), `tiktok-in-${id}.mp4`);
  const tmpOut = join(tmpdir(), `tiktok-out-${id}.mp4`);

  try {
    const { buffer } = await downloadBuffer(url);
    await writeFile(tmpIn, buffer);

    const { width, height } = await getVideoDimensions(tmpIn);

    // Already 9:16 at 1080x1920 — no processing needed
    if (width === 1080 && height === 1920) {
      return url;
    }

    await applyPillarBox(tmpIn, tmpOut);

    const processed = await readFile(tmpOut);
    const path = `tiktok-pillarbox/${Date.now()}-${id}.mp4`;
    const { error } = await getSupabase()
      .storage
      .from('user-media')
      .upload(path, processed, { contentType: 'video/mp4', upsert: false });

    if (error) throw new Error(`Storage upload failed: ${error.message}`);

    const { data } = getSupabase().storage.from('user-media').getPublicUrl(path);
    return data.publicUrl;
  } finally {
    await unlink(tmpIn).catch(() => {});
    await unlink(tmpOut).catch(() => {});
  }
}
