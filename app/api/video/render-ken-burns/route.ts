import { after } from 'next/server';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendText, sendVideoMessage, sendPostPreview, sendReelSurfaceToggle, sendPreviewOptions, sendAnimationFailureWithFallbacks, logAnimationError } from '@/lib/whatsapp-send';
import { getMusicForCaption } from '@/lib/mood-music';
import { buildAtomicTimeline } from '@/lib/media-buffer';
import { renderTimeline } from '@/lib/timeline-renderer';
import type { MediaItem } from '@/lib/video-worker';
import { createHash } from 'crypto';

// Ken Burns rendering via Modal (GPU)
export const maxDuration = 300;

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function getDefaultVisualizationPrompt(caption: string, style: string): Promise<string> {
  const stylePrompts: Record<string, string> = {
    'quick-zoom': 'Fast snappy zoom. Energetic, punchy motion that grabs attention immediately. Quick in/out movement.',
    'elegant': 'Smooth slow-motion pan with gentle zoom. Sophisticated, elegant feel. Emphasize natural beauty and composition.',
    'cinematic': 'Epic cinematic motion. Combine zoom and pan together. Create depth and visual drama. Movie-like quality.',
    'float': 'Gentle floating motion, like drifting through the image. Soft, dreamy, peaceful vibe. Minimal zoom, smooth drift.',
    'focus-zoom': 'Zoom directly to the focal point/subject. Highlight what matters. Start wide, zoom smoothly into the key element.',
    'auto': 'Create visually engaging motion that matches the mood and enhances: ' + caption,
  };
  return stylePrompts[style] || stylePrompts['auto'];
}

async function renderKenBurnsViaModal(
  imageUrl: string,
  caption: string,
  duration: number = 5,
  zoomLevel: number = 1.5,
  aspectRatio: '9:16' | '1:1' | '16:9' = '9:16',
  musicUrl?: string,
  animationStyle: string = 'auto',
): Promise<{ videoUrl: string; musicIncluded: boolean }> {
  const modalUrl = process.env.MODAL_KEN_BURNS_URL;
  if (!modalUrl) throw new Error('MODAL_KEN_BURNS_URL not configured');

  const visualizationPrompt = await getDefaultVisualizationPrompt(caption, animationStyle);

  const requestBody = {
    image_url: imageUrl,
    duration,
    zoom_level: zoomLevel,
    aspect_ratio: aspectRatio,
    music_url: musicUrl,
    visualization_prompt: visualizationPrompt,
    animation_style: animationStyle,
  };

  console.log('[renderKenBurnsViaModal] request to Modal:', JSON.stringify(requestBody, null, 2));

  const res = await fetch(modalUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error('[renderKenBurnsViaModal] Modal error response:', { status: res.status, statusText: res.statusText, body: text });
    throw new Error(`Modal Ken Burns failed: ${res.status} ${text}`);
  }

  const result = await res.json();
  if (result.error) throw new Error(`Modal error: ${result.error}`);
  if (!result.video_b64) throw new Error('No video returned from Modal');

  console.log('[renderKenBurnsViaModal] music_included:', result.music_included);

  // Decode base64 to buffer
  const videoBuffer = Buffer.from(result.video_b64, 'base64');
  const supabase = getSupabase();
  const storagePath = `videos/ken-burns-${Date.now()}-${Math.random().toString(36).slice(2)}.mp4`;

  const { data, error } = await supabase.storage
    .from('user-media')
    .upload(storagePath, videoBuffer, { contentType: 'video/mp4', upsert: false });

  if (error) throw new Error(`Storage upload: ${error.message}`);

  const videoUrl = supabase.storage.from('user-media').getPublicUrl(data.path).data.publicUrl;
  return { videoUrl, musicIncluded: result.music_included ?? false };
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization') ?? '';
  if (auth !== `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const {
    phone, postId, imageUrl, caption,
    duration, zoomLevel, aspectRatio, musicPreference, animationStyle, isPreview,
    mediaItems,   // MediaItem[] — multi-photo/video timeline path
    colorGrade,   // KreyaTimeline colorGrade (optional)
  } = await req.json();

  if (!phone || !postId || !caption || (!imageUrl && !mediaItems?.length)) {
    console.error('[render-ken-burns] missing required fields:', { phone, postId, imageUrl, mediaItems, caption });
    return NextResponse.json({ error: 'missing fields' }, { status: 400 });
  }

  const supabase = getSupabase();

  // Generate a secure edit token for the web editor link
  function makeEditToken(pId: string, ph: string): string {
    return createHash('sha256')
      .update(`${pId}:${ph}:${process.env.SUPABASE_SERVICE_ROLE_KEY}`)
      .digest('hex')
      .slice(0, 32);
  }

  after(async () => {
    try {
      const isMultiClip = Array.isArray(mediaItems) && mediaItems.length > 0;
      console.log('[render-ken-burns] start:', { postId, style: animationStyle, music: musicPreference, isPreview, isMultiClip });

      let musicUrl: string | undefined;
      let musicLabel = '';

      // Handle music preference
      if (musicPreference === 'auto' || musicPreference === 'trending') {
        const music = await getMusicForCaption(caption).catch(() => null);
        musicUrl = music?.musicUrl;
        musicLabel = music?.title ?? 'trending audio';
        console.log('[render-ken-burns] music selected:', { url: musicUrl ? '✓' : '✗', label: musicLabel });
      } else if (musicPreference === 'calm') {
        const music = await getMusicForCaption(caption + ' calm peaceful').catch(() => null);
        musicUrl = music?.musicUrl;
        musicLabel = music?.title ?? 'calm audio';
        console.log('[render-ken-burns] calm music selected:', { url: musicUrl ? '✓' : '✗', label: musicLabel });
      } else if (musicPreference === 'none') {
        musicUrl = undefined;
        musicLabel = 'no music';
        console.log('[render-ken-burns] silent mode');
      }

      let videoUrl: string;
      let musicIncluded = false;

      if (isMultiClip) {
        // ── Multi-clip path: assemble KreyaTimeline → FFmpeg render ────────
        const timeline = buildAtomicTimeline(mediaItems as MediaItem[], {
          aspectRatio:     aspectRatio ?? '9:16',
          resolution:      'preview',
          musicUrl,
          colorGrade,
        });

        // Store timeline so the web editor and WhatsApp edits can modify it
        await supabase
          .from('pending_posts')
          .update({ timeline_json: timeline, render_resolution: 'preview' })
          .eq('id', postId);

        const result = await renderTimeline(timeline);
        videoUrl = result.publicUrl;
        musicIncluded = Boolean(musicUrl);
        console.log('[render-ken-burns] multi-clip rendered via timeline:', videoUrl);
      } else {
        // ── Single-image path: existing Modal GPU Ken Burns ─────────────────
        const result = await renderKenBurnsViaModal(
          imageUrl,
          caption,
          duration ?? 5,
          zoomLevel ?? 1.5,
          aspectRatio ?? '9:16',
          musicUrl,
          animationStyle ?? 'auto',
        );
        videoUrl = result.videoUrl;
        musicIncluded = result.musicIncluded;
        console.log('[render-ken-burns] single-image rendered via Modal:', { videoUrl, musicIncluded });
      }

      if (isPreview) {
        // Show preview with approval options
        await supabase
          .from('pending_posts')
          .update({ image_url: videoUrl })
          .eq('id', postId);

        await sendVideoMessage(phone, videoUrl);

        // Alert if music was requested but failed to load
        if (!musicIncluded && musicPreference !== 'none') {
          console.log('[render-ken-burns] ⚠️ MUSIC FAILED: requested=' + musicPreference + ', label=' + musicLabel + ', included=false');
          await sendText(phone, '⚠️ Music unavailable: video is silent. (Audio service had an issue)').catch(() => {});
        } else if (musicIncluded) {
          console.log('[render-ken-burns] ✓ Music included successfully: ' + musicLabel);
        }

        // Fetch caption from database to show in preview
        const { data: post } = await supabase
          .from('pending_posts')
          .select('caption')
          .eq('id', postId)
          .maybeSingle();

        await sendPreviewOptions(phone, postId, videoUrl, post?.caption);

        // Send web editor link so user can tweak color grade, motion, clips
        const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';
        if (appUrl) {
          const editToken = makeEditToken(postId, phone);
          const editUrl   = `${appUrl}/edit/${postId}?t=${editToken}&phone=${encodeURIComponent(phone)}`;
          await sendText(phone, `✏️ Tweak it on web (color, motion, clips):\n${editUrl}`).catch(() => {});
        }

        console.log('[render-ken-burns] preview sent');
      } else {
        // Direct approval after preview was accepted
        await supabase
          .from('pending_posts')
          .update({ state: 'pending_approval', image_url: videoUrl })
          .eq('id', postId);

        await sendVideoMessage(phone, videoUrl);
        await sendPostPreview(phone, videoUrl, caption, postId, true, 'reels');
        console.log('[render-ken-burns] finalized and sent');
      }
    } catch (err: any) {
      console.error('[render-ken-burns] failed:', err.message, err);

      // Categorize error and determine user-friendly message
      let errorType = 'unknown';
      let errorReason = 'Animation service is temporarily unavailable. Please try again in a few moments.';

      if (err.message?.includes('MODAL_KEN_BURNS_URL not configured')) {
        errorType = 'infrastructure_error';
        errorReason = 'Animation service is not yet configured. Try again later.';
      } else if (err.message?.includes('Modal Ken Burns failed') && err.message?.includes('404')) {
        errorType = 'service_unavailable';
        errorReason = 'Animation service is offline. Please try again later.';
      } else if (err.message?.includes('Modal Ken Burns failed') && (err.message?.includes('timeout') || err.message?.includes('ECONNREFUSED'))) {
        errorType = 'timeout_or_connection';
        errorReason = 'Animation service is not responding. Please try again.';
      } else if (err.message?.includes('Modal error')) {
        errorType = 'modal_api_error';
        errorReason = 'Animation failed due to image processing issue. Please try a different photo.';
      } else if (err.message?.includes('No video returned')) {
        errorType = 'no_video_output';
        errorReason = 'Animation created no output. Please try a different photo or animation style.';
      } else if (err.message?.includes('Storage upload')) {
        errorType = 'storage_error';
        errorReason = 'Couldn\'t save the animation video. Please try again.';
      } else if (err.message?.includes('fetch')) {
        errorType = 'network_error';
        errorReason = 'Network issue while generating animation. Please try again.';
      }

      // Log detailed error for admin debugging
      logAnimationError(postId, phone, errorType, err.message, {
        stack: err.stack?.slice(0, 500),
        isPreview,
        animationStyle,
        musicPreference,
      });

      // Mark post as failed (not discarded - preserves it for potential retry)
      await supabase.from('pending_posts').update({ state: 'animation_failed' }).eq('id', postId);

      // Send user-friendly error with fallback options
      if (isPreview) {
        // Preview failed - offer retry and discard
        await sendAnimationFailureWithFallbacks(phone, postId, errorReason).catch(() => {});
      } else {
        // Final render failed - offer fallback to static image
        await sendAnimationFailureWithFallbacks(phone, postId, errorReason).catch(() => {});
      }
    }
  });

  return NextResponse.json({ ok: true });
}
