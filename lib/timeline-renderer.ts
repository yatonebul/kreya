import { createClient } from '@supabase/supabase-js';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import type {
  KreyaTimeline,
  VideoTrack,
  ColorGrade,
  CaptionPlatform,
} from './timeline-schema';

if (ffmpegPath) ffmpeg.setFfmpegPath(ffmpegPath);

// Geist-Regular.ttf is bundled with next/dist (included via outputFileTracingIncludes).
// drawtext requires a fontfile= on Lambda — fontconfig is not available.
const GEIST_FONT = path.join(process.cwd(), 'node_modules/next/dist/compiled/@vercel/og/Geist-Regular.ttf');

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// ── Dimensions ────────────────────────────────────────────────────────────────

const DIMS = {
  '9:16': { w: 1080, h: 1920 },
  '1:1':  { w: 1080, h: 1080 },
  '16:9': { w: 1920, h: 1080 },
} as const;

const PREVIEW_SCALE = {
  '9:16': { w: 480, h: 854 },
  '1:1':  { w: 480, h: 480 },
  '16:9': { w: 854, h: 480 },
} as const;

// ── Caption safe-zone Y offsets by platform ───────────────────────────────────

const CAPTION_Y_OFFSET: Record<CaptionPlatform, number> = {
  'tiktok':          60,
  'ig-reels':        100,
  'facebook-reels':  80,
};

// ── Color grade FFmpeg filter strings ─────────────────────────────────────────

const COLOR_GRADE_FILTER: Record<ColorGrade, string | null> = {
  natural:   null,
  warm:      'eq=saturation=1.3:gamma_r=1.1:gamma_b=0.9',
  cool:      'eq=saturation=1.1:gamma_r=0.9:gamma_b=1.1',
  cinematic: 'eq=contrast=1.3:saturation=0.7,hue=h=5',
  moody:     'eq=brightness=-0.08:contrast=1.4:saturation=0.85',
  vintage:   'eq=saturation=0.7:gamma_r=1.1:gamma_b=0.85,vignette',
  vibrant:   'eq=saturation=1.6:contrast=1.1',
};

// ── FFmpeg filter helpers (same patterns as video-worker.ts) ──────────────────

function kenBurnsFilter(
  inputLabel: string,
  outLabel: string,
  w: number,
  h: number,
  frames: number,
  zoomStart = 1.0,
  zoomEnd = 1.3,
): string {
  const range = zoomEnd - zoomStart;
  const zStep = (range / frames).toFixed(6);
  const zMax  = zoomEnd.toFixed(4);
  return (
    `${inputLabel}scale=${w * 2}:${h * 2}:force_original_aspect_ratio=increase,` +
    `crop=${w * 2}:${h * 2},` +
    `zoompan=z='min(${zoomStart}+${zStep}*on,${zMax})':` +
    `x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':` +
    `d=${frames}:s=${w}x${h}:fps=25,` +
    `setsar=1${outLabel}`
  );
}

function scaleFilter(inputLabel: string, outLabel: string, w: number, h: number): string {
  return (
    `${inputLabel}scale=${w}:${h}:force_original_aspect_ratio=decrease,` +
    `pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,setsar=1${outLabel}`
  );
}

// Blurred-fill composite: blurred scale-to-fill bg + sharp letterboxed fg.
// Eliminates black bars — same effect as OpenCut's canvas background blur.
function blurBgFilter(inputLabel: string, outLabel: string, w: number, h: number, idx: number): string {
  return (
    `${inputLabel}split=2[_bb${idx}][_bf${idx}];` +
    `[_bb${idx}]scale=${w}:${h}:force_original_aspect_ratio=increase,` +
      `crop=${w}:${h},boxblur=20:1[_bg${idx}];` +
    `[_bf${idx}]scale=${w}:${h}:force_original_aspect_ratio=decrease,` +
      `pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,setsar=1[_fg${idx}];` +
    `[_bg${idx}][_fg${idx}]overlay=(W-w)/2:(H-h)/2${outLabel}`
  );
}

async function downloadTmp(url: string, ext: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed ${url} → ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const p = path.join(os.tmpdir(), `kreya-tl-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`);
  await fs.writeFile(p, buf);
  return p;
}

function extFromUrl(url: string, type: 'image' | 'video'): string {
  const m = url.match(/\.(\w{2,4})(?:\?|$)/);
  return m ? m[1] : type === 'image' ? 'jpg' : 'mp4';
}

function escapeDrawtext(text: string): string {
  return text
    .replace(/\p{Emoji}/gu, '')  // Linux Lambda fonts lack emoji glyphs; drawtext crashes
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/:/g, '\\:')
    .replace(/%/g, '\\%')
    .replace(/\n/g, '\\n')  // actual newlines break filter_complex parser; use literal \n
    .trim();
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

// ── Main renderer ─────────────────────────────────────────────────────────────

export type RenderResult = { publicUrl: string };

export async function renderTimeline(timeline: KreyaTimeline): Promise<RenderResult> {
  const { aspectRatio, resolution, colorGrade, bgStyle = 'blur', tracks } = timeline;
  const { video: videoTracks, audio, captions } = tracks;

  if (!videoTracks.length) throw new Error('renderTimeline: no video tracks');

  const isPreview = resolution === 'preview';
  // hd-fast: 1080p but ultrafast preset and no zoompan — web editor path, publishable quality
  const isHdFast  = resolution === 'hd-fast';
  const fullDims  = DIMS[aspectRatio];
  const outDims   = isPreview ? PREVIEW_SCALE[aspectRatio] : fullDims;
  const { w, h }  = outDims;

  const outPath  = path.join(os.tmpdir(), `kreya-tl-out-${Date.now()}.mp4`);
  const tmpFiles: string[] = [];

  try {
    // ── Download all media ──────────────────────────────────────────────────
    const localPaths: string[] = [];
    for (const track of videoTracks) {
      const p = await downloadTmp(track.src, extFromUrl(track.src, track.type));
      localPaths.push(p);
      tmpFiles.push(p);
    }

    let musicPath: string | null = null;
    if (audio?.src) {
      musicPath = await downloadTmp(audio.src, 'mp3');
      tmpFiles.push(musicPath);
    }

    // ── Build filter_complex ────────────────────────────────────────────────
    const filterParts: string[] = [];

    // Per-clip video filters
    const clipLabels: string[] = [];
    videoTracks.forEach((track: VideoTrack, i: number) => {
      const inLabel  = `[${i}:v]`;
      const outLabel = `[vc${i}]`;
      const fps = 25;
      const frames = Math.round(track.duration * fps);

      const effect = track.effect ?? { type: 'ken-burns', style: 'elegant' };

      if (effect.type === 'ken-burns') {
        if (isPreview || isHdFast) {
          // Skip zoompan for preview (OOM risk) and hd-fast (too slow on Lambda CPU at 1080p).
          // hd-fast outputs publishable 1080p with blur bg without the zoompan CPU cost.
          if (bgStyle === 'blur') {
            filterParts.push(blurBgFilter(inLabel, outLabel, w, h, i));
          } else {
            filterParts.push(scaleFilter(inLabel, outLabel, w, h));
          }
        } else {
          const zStart = effect.zoomStart ?? 1.0;
          const zEnd   = effect.zoomEnd   ?? 1.3;
          filterParts.push(kenBurnsFilter(inLabel, outLabel, fullDims.w, fullDims.h, frames, zStart, zEnd));
        }
      } else {
        if (bgStyle === 'blur') {
          filterParts.push(blurBgFilter(inLabel, outLabel, w, h, i));
        } else {
          filterParts.push(scaleFilter(inLabel, outLabel, w, h));
        }
      }

      clipLabels.push(outLabel);
    });

    // Concat or xfade between clips
    let videoOut = '[vconcat]';
    const hasAnyFade = videoTracks.some(t => t.transition === 'fade');

    if (videoTracks.length === 1) {
      // Single clip — null passthrough (concat=n=1 is non-standard and can crash)
      filterParts.push(`${clipLabels[0]}null${videoOut}`);
    } else if (hasAnyFade && videoTracks.length > 1) {
      // Build xfade chain for clips that request fade transition
      let prevLabel = clipLabels[0];
      let accDuration = videoTracks[0].duration;

      for (let i = 1; i < videoTracks.length; i++) {
        const useXfade = videoTracks[i].transition === 'fade';
        const nextLabel = clipLabels[i];
        const xfadeOut = i === videoTracks.length - 1 ? videoOut : `[xf${i}]`;

        if (useXfade) {
          const offset = Math.max(0, accDuration - 0.3);
          filterParts.push(
            `${prevLabel}${nextLabel}xfade=transition=dissolve:duration=0.3:offset=${offset.toFixed(3)}${xfadeOut}`,
          );
        } else {
          filterParts.push(
            `${prevLabel}${nextLabel}concat=n=2:v=1:a=0${xfadeOut}`,
          );
        }
        prevLabel = xfadeOut;
        accDuration += videoTracks[i].duration;
      }
    } else {
      filterParts.push(
        `${clipLabels.join('')}concat=n=${videoTracks.length}:v=1:a=0${videoOut}`,
      );
    }

    // Color grade — applied as a post-process on [vconcat]
    const gradeFilter = colorGrade ? COLOR_GRADE_FILTER[colorGrade] : null;
    let postVideoLabel = videoOut;
    if (gradeFilter) {
      filterParts.push(`${videoOut}${gradeFilter}[vgraded]`);
      postVideoLabel = '[vgraded]';
    }

    // Captions — applied sequentially on top of video.
    // fontfile= required: Lambda has no fontconfig; drawtext crashes without explicit font path.
    let captionLabel = postVideoLabel;
    if (captions?.length) {
      captions.forEach((cap, idx) => {
        const platform = cap.platform ?? 'ig-reels';
        const yOffset  = CAPTION_Y_OFFSET[platform];
        const fontSize = cap.fontSize ?? (isPreview ? 20 : 40);
        const wrapped  = escapeDrawtext(wrapLines(cap.text, isPreview ? 24 : 38));
        const inLbl    = captionLabel;
        captionLabel   = idx === captions!.length - 1 ? '[vout]' : `[vcap${idx}]`;

        const yExpr = cap.position === 'top'
          ? `${yOffset}`
          : cap.position === 'center'
          ? '(h-text_h)/2'
          : `h-text_h-${yOffset}`;

        const drawtextFilter =
          `${inLbl}drawtext=` +
          `fontfile=${GEIST_FONT}:` +
          `text='${wrapped}':` +
          `fontsize=${fontSize}:` +
          `fontcolor=white:` +
          `box=1:` +
          `boxcolor=black@0.55:` +
          `boxborderw=12:` +
          `x=(w-text_w)/2:` +
          `y=${yExpr}:` +
          `enable='between(t,${cap.startTime},${cap.startTime + cap.duration})'` +
          captionLabel;

        filterParts.push(drawtextFilter);
      });
    } else {
      // Rename final video label to [vout]
      if (captionLabel !== '[vout]') {
        filterParts.push(`${captionLabel}null[vout]`);
      }
    }

    const audioInputIdx = videoTracks.length;
    if (musicPath && audio) {
      const vol = audio.volume ?? 0.4;
      if (isPreview) {
        // Preview: skip afade — it can stall filter-graph teardown when audio >> video duration.
        // Music is already trimmed by -t on the input; just set volume.
        filterParts.push(`[${audioInputIdx}:a]volume=${vol}[aout]`);
      } else {
        const fadeAt = audio.fadeOutAt ?? Math.max(0, timeline.totalDuration - 2);
        filterParts.push(
          `[${audioInputIdx}:a]` +
          `afade=t=out:st=${fadeAt}:d=2,` +
          `volume=${vol}[aout]`,
        );
      }
    }

    // ── Build FFmpeg command ────────────────────────────────────────────────
    // Set up a minimal fontconfig environment so drawtext can find Geist-Regular.ttf.
    // Without this, fontconfig scans system font dirs (which don't exist on Lambda),
    // times out for ~18s, and then crashes. FONTCONFIG_FILE must be set before spawn.
    const fcDir  = path.join(os.tmpdir(), `fc-${Date.now()}`);
    await fs.mkdir(fcDir, { recursive: true });
    const fcConf = path.join(fcDir, 'fonts.conf');
    await fs.writeFile(fcConf,
      `<?xml version="1.0"?>\n` +
      `<!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd">\n` +
      `<fontconfig>\n` +
      `  <dir>${path.dirname(GEIST_FONT)}</dir>\n` +
      `  <cachedir>${fcDir}</cachedir>\n` +
      `</fontconfig>`,
    );
    process.env.FONTCONFIG_FILE = fcConf;

    console.log('[renderTimeline] filter_complex:', filterParts.join(';').slice(0, 800));
    await new Promise<void>((resolve, reject) => {
      const cmd = ffmpeg();

      videoTracks.forEach((track: VideoTrack, i: number) => {
        if (track.type === 'image') {
          cmd.input(localPaths[i]).inputOptions(['-loop', '1', '-t', String(track.duration)]);
        } else {
          cmd.input(localPaths[i]).inputOptions(['-t', String(track.duration)]);
        }
      });
      // Cap music at video duration so filter teardown is instantaneous
      if (musicPath) cmd.input(musicPath).inputOptions(['-t', String(timeline.totalDuration + 0.5)]);

      const mapArgs = ['-map', '[vout]'];
      if (musicPath) mapArgs.push('-map', '[aout]');

      const stderrLines: string[] = [];
      const t0 = Date.now();

      cmd
        .complexFilter(filterParts.join(';'))
        .outputOptions([
          ...mapArgs,
          '-c:v', 'libx264',
          '-preset', (isPreview || isHdFast) ? 'ultrafast' : 'fast',
          '-crf',    isPreview ? '28' : isHdFast ? '24' : '22',
          '-pix_fmt', 'yuv420p',
          // Skip +faststart for non-hd renders — avoids moov-atom rewrite at end which can fail on Lambda
          ...(!isPreview && !isHdFast ? ['-movflags', '+faststart'] : []),
          ...(musicPath
            ? ['-c:a', 'aac', '-b:a', '128k', '-shortest']
            : ['-an']),
        ])
        .output(outPath)
        .on('stderr', (line: string) => { stderrLines.push(line); })
        .on('end', () => { console.log(`[renderTimeline] FFmpeg ok (${Date.now() - t0}ms)`); resolve(); })
        .on('error', (err: Error) => {
          console.error(`[renderTimeline] FFmpeg failed after ${Date.now() - t0}ms`);
          console.error('[ffmpeg stderr]', stderrLines.slice(-30).join('\n'));
          reject(new Error(`FFmpeg timeline: ${err.message}`));
        })
        .run();
    });

    // ── Upload ──────────────────────────────────────────────────────────────
    const rendered    = await fs.readFile(outPath);
    tmpFiles.push(outPath);
    const storagePath = `timelines/${Date.now()}-${Math.random().toString(36).slice(2)}.mp4`;
    const supabase    = getSupabase();

    const { data, error } = await supabase.storage
      .from('user-media')
      .upload(storagePath, rendered, { contentType: 'video/mp4', upsert: false });

    if (error) throw new Error(`Storage upload failed: ${error.message}`);

    const publicUrl = supabase.storage.from('user-media').getPublicUrl(data.path).data.publicUrl;
    console.log('[timeline-renderer] rendered →', publicUrl, `(${resolution}, ${timeline.totalDuration}s)`);
    return { publicUrl };
  } finally {
    await Promise.allSettled(tmpFiles.map(p => fs.unlink(p).catch(() => {})));
  }
}
