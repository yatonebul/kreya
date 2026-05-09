import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import { createClient } from '@supabase/supabase-js';

if (ffmpegPath) ffmpeg.setFfmpegPath(ffmpegPath);

/**
 * Extract frames from a video at equal intervals.
 * Returns URLs of extracted frames hosted in Supabase.
 */
export async function extractCoverFrames(
  videoUrl: string,
  frameCount: number = 5,
): Promise<string[]> {
  const tmpDir = path.join(os.tmpdir(), `kreya-frames-${Date.now()}`);
  await fs.mkdir(tmpDir, { recursive: true });

  try {
    // Download video
    const videoPath = path.join(tmpDir, 'video.mp4');
    const res = await fetch(videoUrl);
    if (!res.ok) throw new Error(`Video download failed: ${res.status}`);
    await fs.writeFile(videoPath, Buffer.from(await res.arrayBuffer()));

    // Get video duration
    const duration = await getVideoDuration(videoPath);
    const interval = Math.max(0.5, duration / frameCount);

    // Extract frames at intervals
    const framePaths: string[] = [];
    await new Promise<void>((resolve, reject) => {
      ffmpeg(videoPath)
        .outputOptions(['-vf', `fps=1/${interval}`])
        .output(path.join(tmpDir, 'frame-%d.jpg'))
        .on('end', () => resolve())
        .on('error', (err: Error) => reject(new Error(`FFmpeg: ${err.message}`)))
        .run();
    });

    // List extracted frames
    const files = await fs.readdir(tmpDir);
    const jpgFiles = files
      .filter((f) => f.startsWith('frame-') && f.endsWith('.jpg'))
      .sort((a, b) => {
        const numA = parseInt(a.match(/\d+/)![0], 10);
        const numB = parseInt(b.match(/\d+/)![0], 10);
        return numA - numB;
      })
      .slice(0, frameCount);

    // Upload frames to Supabase
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const frameUrls: string[] = [];
    for (const jpgFile of jpgFiles) {
      const jpgPath = path.join(tmpDir, jpgFile);
      const buffer = await fs.readFile(jpgPath);
      const storagePath = `cover-frames/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;

      const { data, error } = await supabase.storage
        .from('user-media')
        .upload(storagePath, buffer, { contentType: 'image/jpeg', upsert: false });

      if (error) {
        console.warn(`[cover-frames] upload failed: ${error.message}`);
        continue;
      }

      const publicUrl = supabase.storage.from('user-media').getPublicUrl(data.path).data.publicUrl;
      frameUrls.push(publicUrl);
    }

    return frameUrls;
  } finally {
    // Cleanup
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Get video duration in seconds.
 */
function getVideoDuration(videoPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath).ffprobe((err, data) => {
      if (err) return reject(err);
      const duration = data?.format?.duration ?? 5;
      resolve(duration);
    });
  });
}
